// Client bundle for the local exe build (P1).
//
// 自写 Bun.build() 配置，替代原来全权交给 SDK `buildClient()` 的做法
// （port-plan.md §保留-4）。配置与 SDK 的 canonical build.ts 逐项对齐：
//   入口 client/index.html、输出 client/dist/、minify、
//   define process.env.NODE_ENV = "production"、
//   资源指纹命名 assets/[name]-[hash].[ext]、chunk 同款、entry [name].[ext]、
//   Tailwind 插件、导入资产 URL 的 `./assets/` 前缀修正。
// 与 SDK 版唯一的区别：去掉 `HATCH_SPACES_BUILD_DRIVER` 门禁
// （那是 Muse 平台构建流水线的守卫，本地 exe 构建不需要它），
// 且 pdfjs 资产按需复制——本工作台未引用 pdfjs，未复制。

import { rm } from "node:fs/promises";
import { basename } from "node:path";
import tailwindPlugin from "bun-plugin-tailwind";

const ENTRY = "./client/index.html";
const OUTDIR = "./client/dist";
const PDFJS_ASSET_ROOT = "./assets/pdfjs/";

if (typeof Bun === "undefined" || typeof Bun.build !== "function") {
  throw new Error("client/build.mjs must run under Bun");
}

await rm(OUTDIR, { force: true, recursive: true });

const result = await Bun.build({
  entrypoints: [ENTRY],
  outdir: OUTDIR,
  minify: true,
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  naming: {
    asset: "assets/[name]-[hash].[ext]",
    chunk: "assets/[name]-[hash].[ext]",
    entry: "[name].[ext]",
  },
  plugins: [tailwindPlugin],
});

if (!result.success) {
  for (const log of result.logs) {
    console.error(log);
  }
  throw new Error("client build failed; see logged diagnostics");
}

// Bun 把导入资产写到 naming.asset（assets/<name>-<hash>.<ext>），
// 但 JS/CSS 里的导入 URL 却是不带 assets/ 前缀的 `./<name>-<hash>.<ext>`，
// 浏览器按文档基准解析会 404。与 SDK 同款修正：只给裸导入资产 URL
// 补 `./assets/` 前缀（幂等，不动已带前缀的 chunk 引用）。
const assetFiles = result.outputs
  .filter((output) => output.kind === "asset")
  .map((output) => basename(output.path));
let needsPdfjsAssets = false;
for (const output of result.outputs) {
  if (!/\.(js|css|html)$/.test(output.path)) {
    continue;
  }
  let text = await output.text();
  needsPdfjsAssets ||= text.includes(PDFJS_ASSET_ROOT);
  let changed = false;
  for (const name of assetFiles) {
    const bare = `./${name}`;
    if (text.includes(bare)) {
      text = text.split(bare).join(`./assets/${name}`);
      changed = true;
    }
  }
  if (changed) {
    await Bun.write(output.path, text);
  }
}

if (needsPdfjsAssets) {
  // 本工作台未引用 pdfjs（client/src 内无 pdfjs 引用），此分支正常不触发；
  // 若将来引用，须在此处补一份 pdfjs-assets 到 client/dist/assets/pdfjs。
  console.warn("client build: pdfjs assets referenced but no pdfjs-assets source is bundled (P1)");
}

console.log(`client build ok: ${result.outputs.length} outputs -> ${OUTDIR}`);
