// ---------------------------------------------------------------------------
// AI解剖 · 浏览器本地抽音频（v4.86 转写层的前半段）
//
// 云端视频的转写在服务端直读文件完成；本地文件与可直读的链接则在
// 浏览器里把音轨解出来：fetch / File 拿到视频字节 → AudioContext
// decodeAudioData 解码 → OfflineAudioContext 重采样成 16kHz 单声
// 道 → 编码 16-bit PCM WAV。WAV 按 384KiB 分片走既有 uploadImage
// Chunk 暂存通道上传，服务端 transcribeUploadedAudio 拼回后交给
// 本地 Whisper。音频只在本机与本站服务端之间走，不经任何第三方。
// 解不出（格式不支持 / 跨域拿不到字节）就抛错写清原因，调用方据
// 此降级（有云端原件走云端转写、都没有才回落纯文本估计）。
// ---------------------------------------------------------------------------

import { bytesToBase64 } from "./sdk-local";
import { api } from "./api";
import { describeThrownError } from "./gateway";

const TARGET_RATE = 16000;
/** 与 chunkedupload.ts 同一片大小（384KiB 原始字节）：同一条
 * uploadImageChunk 暂存通道、同一个约 1MB 的请求体上限，片大小
 * 必须一致（v6.10：768KiB 满片请求体超限、大文件第一片就断）。 */
const CHUNK_RAW_BYTES = 384 * 1024;

function encodeWavPcm16(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

/**
 * 从视频来源（本地 File 或可 fetch 的 URL）解出 16kHz 单声道 WAV。
 * URL 来源先 fetch 字节：快手直链多半跨域拿不到字节，会在这里抛
 * 错，调用方据此回落（云端转写 / 纯文本）。
 */
export async function extractAudioWav(source: string | File): Promise<Blob> {
  let bytes: ArrayBuffer;
  if (typeof source !== "string") {
    if (source.size <= 0) throw new Error("选的本地视频文件是空的");
    bytes = await source.arrayBuffer();
  } else {
    const url = source.trim();
    if (!url) throw new Error("没有视频文件链接");
    let res: Response;
    try {
      res = await fetch(url, { cache: "no-store" });
    } catch (e) {
      throw new Error(
        `拿不到视频文件字节（多半是跨域限制）：${e instanceof Error ? e.message : String(e)}`,
      );
    }
    if (!res.ok) throw new Error(`视频文件读取失败（HTTP ${res.status}）`);
    bytes = await res.arrayBuffer();
  }
  if (bytes.byteLength === 0) throw new Error("视频文件是空的");
  const AC: typeof AudioContext | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AC) throw new Error("这个浏览器没有音频解码能力（AudioContext 不可用）");
  const decodeCtx = new AC();
  let decoded: AudioBuffer;
  try {
    decoded = await decodeCtx.decodeAudioData(bytes.slice(0));
  } catch {
    throw new Error("视频音轨解码失败（格式不支持或文件已损坏）");
  } finally {
    void decodeCtx.close().catch(() => undefined);
  }
  if (decoded.duration <= 0) throw new Error("视频里没有可解的音轨");
  const frames = Math.max(1, Math.ceil(decoded.duration * TARGET_RATE));
  const offline = new OfflineAudioContext(1, frames, TARGET_RATE);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  // 多声道 → 单声道：ChannelMerger 默认求和会溢出，用增益 1/声道数
  // 的 GainNode 先压再连（decode 出来几声道就除几）。
  const gain = offline.createGain();
  gain.gain.value = 1 / Math.max(1, decoded.numberOfChannels);
  src.connect(gain);
  gain.connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();
  const samples = rendered.getChannelData(0);
  return encodeWavPcm16(samples, TARGET_RATE);
}

function newUploadId(): string {
  try {
    return crypto.randomUUID().replace(/-/g, "");
  } catch {
    return `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  }
}

/**
 * 把 WAV 字节按 384KiB 分片上传暂存（复用 uploadImageChunk 通道，
 * 与人物图分片同一暂存表），返回 uploadId 给 transcribeUploaded
 * Audio 拼回。单片失败原地重试到 3 次；整单失败清掉已暂存分片。
 */
export async function uploadAudioInChunks(
  blob: Blob,
  onProgress?: (done: number, total: number) => void,
): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  if (buf.length === 0) throw new Error("抽出的音频是空的");
  const totalChunks = Math.max(1, Math.ceil(buf.length / CHUNK_RAW_BYTES));
  const uploadId = newUploadId();
  try {
    for (let i = 0; i < totalChunks; i++) {
      const slice = buf.subarray(
        i * CHUNK_RAW_BYTES,
        Math.min(buf.length, (i + 1) * CHUNK_RAW_BYTES),
      );
      const dataBase64 = bytesToBase64(slice);
      let sent = false;
      let lastError: unknown = null;
      for (let attempt = 1; attempt <= 3 && !sent; attempt++) {
        try {
          await api.uploadImageChunk({
            uploadId,
            chunkIndex: i,
            totalChunks,
            dataBase64,
          });
          sent = true;
        } catch (e) {
          lastError = e;
          if (attempt < 3) {
            await new Promise((r) => window.setTimeout(r, 1000 * attempt));
          }
        }
      }
      if (!sent) {
        throw new Error(
          `音频上传失败：第 ${i + 1} / ${totalChunks} 片连续重试 3 次都没传上（${describeThrownError(lastError)}）`,
        );
      }
      onProgress?.(i + 1, totalChunks);
    }
  } catch (e) {
    void api.discardImageChunks({ uploadId }).catch(() => undefined);
    throw e;
  }
  return uploadId;
}
