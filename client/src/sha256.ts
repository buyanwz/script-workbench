// SHA-256 校验（备份打包 / 导入复验专用）。
//
// 为什么不能只用 crypto.subtle.digest：Web Crypto 的 subtle 接口只在
// 「安全上下文」里存在。工作台页面跑在 Muse 壳的内嵌 iframe 中，壳给
// iframe 的 origin 不是安全上下文时 window.crypto.subtle 就是
// undefined，直接调 crypto.subtle.digest 会抛
// “Cannot read properties of undefined (reading 'digest')”，打包在
// 第一张图校验时整包中止（v3.72 及之前版本的实际故障）。
//
// 这里先试 subtle（有就用，快且是平台实现）；拿不到或调用失败时回落
// 到下面这份纯 JS SHA-256（标准 FIPS 180-4 实现，无外部依赖），
// 两种路径算出的都是同一个 SHA-256，etag 比对口径不变。

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(x: number, n: number): number {
  return ((x >>> n) | (x << (32 - n))) >>> 0;
}

/** 纯 JS SHA-256，输入任意字节，输出 32 字节摘要。 */
export function sha256BytesPure(input: Uint8Array): Uint8Array {
  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
    0x1f83d9ab, 0x5be0cd19,
  ]);
  const len = input.length;
  // 填充：0x80 + 0 至总长 ≡ 56 (mod 64)，再接 64 位大端位长度。
  const paddedLen = (((len + 8) >> 6) + 1) << 6;
  const msg = new Uint8Array(paddedLen);
  msg.set(input);
  msg[len] = 0x80;
  const view = new DataView(msg.buffer);
  // 位长度 64 位：高 32 位 = floor(len / 2^29)，低 32 位 = (len << 3) mod 2^32。
  view.setUint32(paddedLen - 4, (len << 3) >>> 0);
  view.setUint32(paddedLen - 8, Math.floor(len / 536870912) >>> 0);

  const w = new Uint32Array(64);
  for (let block = 0; block < paddedLen; block += 64) {
    for (let t = 0; t < 16; t++) w[t] = view.getUint32(block + t * 4);
    for (let t = 16; t < 64; t++) {
      const s0 =
        (rotr(w[t - 15]!, 7) ^ rotr(w[t - 15]!, 18) ^ (w[t - 15]! >>> 3)) >>>
        0;
      const s1 =
        (rotr(w[t - 2]!, 17) ^ rotr(w[t - 2]!, 19) ^ (w[t - 2]! >>> 10)) >>>
        0;
      w[t] = (w[t - 16]! + s0 + w[t - 7]! + s1) >>> 0;
    }
    let a = H[0]!;
    let b = H[1]!;
    let c = H[2]!;
    let d = H[3]!;
    let e = H[4]!;
    let f = H[5]!;
    let g = H[6]!;
    let h = H[7]!;
    for (let t = 0; t < 64; t++) {
      const s1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const temp1 = (h + s1 + ch + K[t]! + w[t]!) >>> 0;
      const s0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (s0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    H[0] = (H[0]! + a) >>> 0;
    H[1] = (H[1]! + b) >>> 0;
    H[2] = (H[2]! + c) >>> 0;
    H[3] = (H[3]! + d) >>> 0;
    H[4] = (H[4]! + e) >>> 0;
    H[5] = (H[5]! + f) >>> 0;
    H[6] = (H[6]! + g) >>> 0;
    H[7] = (H[7]! + h) >>> 0;
  }
  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) outView.setUint32(i * 4, H[i]!);
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

/**
 * 算 SHA-256 并返回小写 hex。优先用 crypto.subtle；subtle 不存在
 * （非安全上下文）或调用失败时回落纯 JS 实现，绝不因为 subtle
 * 缺失抛 “reading 'digest'” 这类原始错误。接受 ArrayBuffer 或
 * Uint8Array 视图（视图按其 byteOffset / byteLength 取字节，不会
 * 把 backing buffer 的多余字节算进去）。
 */
export async function sha256Hex(
  data: ArrayBuffer | Uint8Array,
): Promise<string> {
  const bytes =
    data instanceof Uint8Array ? data : new Uint8Array(data);
  const subtle = globalThis.crypto?.subtle;
  if (subtle && typeof subtle.digest === "function") {
    try {
      // 传独立拷贝，避免视图偏移 / 共享 buffer 的歧义。
      const copy = new Uint8Array(bytes);
      const h = await subtle.digest("SHA-256", copy);
      return bytesToHex(new Uint8Array(h));
    } catch {
      // subtle 存在但调用失败（如个别 WebView 的残缺实现）：
      // 落到纯 JS，不要让打包 / 导入因此中止。
    }
  }
  return bytesToHex(sha256BytesPure(bytes));
}
