// 人物资产图分片上传（不再有 10MB 量级的文件大小拦截；唯一防呆
// 上限是服务端 2000 片、按 768KiB/片约合原图 1.5GB）。
//
// 旧路径把整张图读成一个 Base64 字符串塞进一次动作请求：服务端字段
// 上限 12,000,000 字符只约合 9MB 原图，10MB 以上的图必然被拒。这里
// 把原图字节按 768KiB 一片切开（768KiB 是 3 的倍数，每片可独立
// Base64 编码、拼回来与整图编码逐字一致），逐片送 uploadImageChunk
// 暂存，最后由完成动作拼回完整原图存入——不压缩、不改尺寸、不转
// 格式，原图多少字节就存多少字节。界面层不做任何文件大小拦截。

import { bytesToBase64 } from "./sdk-local";
import { api } from "./api";
import { describeThrownError } from "./gateway";

export type ChunkedImageRef = {
  uploadId: string;
  totalChunks: number;
  mimeType: string;
  fileName: string;
  sizeBytes: number;
};

/** 每片原始字节数：768KiB（3 的倍数，保证分片 Base64 可无缝拼接）。 */
export const CHUNK_RAW_BYTES = 768 * 1024;

function newUploadId(): string {
  try {
    return crypto.randomUUID().replace(/-/g, "");
  } catch {
    return `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  }
}

/**
 * 把一个图片 File 逐片上传暂存，返回完成动作需要的引用。onProgress
 * 回报已传片数 / 总片数。任一片失败会清掉已暂存分片并抛出带可读
 * 原因的 Error（网络 / 服务端拒绝原因原样带出，不吞成一句「失败」）。
 */
export async function uploadImageFileInChunks(
  file: File,
  onProgress?: (done: number, total: number) => void,
): Promise<ChunkedImageRef> {
  if (!file.type.startsWith("image/")) {
    throw new Error(
      `格式不对：「${file.name}」不是图片文件（类型 ${file.type || "未知"}），没有上传，请换成图片再传`,
    );
  }
  const buf = new Uint8Array(await file.arrayBuffer());
  return uploadImageBytesInChunks(buf, file.type, file.name, onProgress);
}

/**
 * 把已在内存里的图片字节逐片上传暂存（与 File 版同一套分片口径、
 * 同一片重试与失败清理）。v5.04 封面参考图中转压缩用：浏览器画布
 * 压不动的过大原图改走这条——原图字节分片送服务端拼回，由特权层
 * PIL 压缩后再托管提交，客户端不再因尺寸丢图。
 * v6.00：新增可选 concurrency（同时在途的片数，默认 1 = 原串行口
 * 径，人物图上传等既有调用方不变）。分片在服务端按 uploadId +
 * 片号独立暂存、拼装按片号排序，乱序到达不影响拼回；封面中转
 * 兜底传 3——12 片大图不再一片一片排队干等（用户实报串行中转
 * 卡在 3 / 12 片十分钟没动静）。onProgress 的 done 改报「已送达
 * 片数」（并行时不等于最后完成的片号），文案口径不变。
 */
export async function uploadImageBytesInChunks(
  buf: Uint8Array,
  mimeType: string,
  fileName: string,
  onProgress?: (done: number, total: number) => void,
  options?: { concurrency?: number },
): Promise<ChunkedImageRef> {
  if (buf.length === 0) {
    throw new Error(`上传失败：「${fileName}」是空文件，没有内容，请换一张图再传`);
  }
  const totalChunks = Math.max(1, Math.ceil(buf.length / CHUNK_RAW_BYTES));
  const uploadId = newUploadId();
  const concurrency = Math.max(
    1,
    Math.min(options?.concurrency ?? 1, totalChunks, 4),
  );
  try {
    let nextIndex = 0;
    let doneCount = 0;
    let failure: Error | null = null;
    const sendChunk = async (i: number): Promise<void> => {
      const slice = buf.subarray(
        i * CHUNK_RAW_BYTES,
        Math.min(buf.length, (i + 1) * CHUNK_RAW_BYTES),
      );
      const dataBase64 = bytesToBase64(slice);
      // 逐片重试（v3.95）：分片在服务端按 uploadId + 片号覆盖暂存，
      // 重送同一片不会写重、不会拼错——单片遇网关超时 / 500 / 网络
      // 抖动先原地重试到共 3 次，不再一片失败整张图从头再来；3 次
      // 都失败才放弃整张图并报清是哪一片、什么原因。
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
          `上传失败：第 ${i + 1} / ${totalChunks} 片连续重试 3 次都没传上（${describeThrownError(lastError)}），「${fileName}」没有保存，请检查网络后重新上传`,
        );
      }
    };
    const worker = async (): Promise<void> => {
      while (failure === null) {
        const i = nextIndex;
        nextIndex += 1;
        if (i >= totalChunks) return;
        try {
          await sendChunk(i);
        } catch (e) {
          if (failure === null) {
            failure = e instanceof Error ? e : new Error(String(e));
          }
          return;
        }
        doneCount += 1;
        onProgress?.(doneCount, totalChunks);
      }
    };
    await Promise.all(
      Array.from({ length: concurrency }, () => worker()),
    );
    if (failure !== null) throw failure;
  } catch (e) {
    // 失败不留半截分片在服务端暂存里。
    void api.discardImageChunks({ uploadId }).catch(() => undefined);
    const msg = e instanceof Error ? e.message : "";
    throw new Error(
      msg && msg.includes("上传失败")
        ? msg
        : `上传失败：${describeThrownError(e)}，「${fileName}」没有保存，请检查网络后重试`,
    );
  }
  return {
    uploadId,
    totalChunks,
    mimeType,
    fileName,
    sizeBytes: buf.length,
  };
}

/**
 * 把一个图片地址（本站 blob 地址或 data URL）的原图字节取回并逐片
 * 上传暂存。取不到字节时抛出写清真实原因的 Error（HTTP 状态 / 网
 * 络错误原样带出），绝不把「读不到图」说成别的原因。
 */
export async function uploadImageUrlInChunks(
  url: string,
  fileName: string,
  onProgress?: (done: number, total: number) => void,
  options?: { concurrency?: number },
): Promise<ChunkedImageRef> {
  let blob: Blob;
  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`图片读取失败（HTTP ${resp.status}）`);
    }
    blob = await resp.blob();
  } catch (e) {
    if (e instanceof Error && e.message.includes("图片读取失败")) throw e;
    throw new Error(`图片读取失败：${describeThrownError(e)}`);
  }
  const buf = new Uint8Array(await blob.arrayBuffer());
  return uploadImageBytesInChunks(
    buf,
    blob.type || "image/jpeg",
    fileName,
    onProgress,
    options,
  );
}

/** 把服务端 / 分片错误翻成给用户看的中文（保留原始原因，不吞细节）。 */
export function uploadErrorText(e: unknown, fallback: string): string {
  if (e instanceof Error && e.message) {
    if (e.message.includes("格式不对") || e.message.includes("上传")) return e.message;
    return `${fallback}：${e.message}`;
  }
  return fallback;
}
