// 牢络生成平台 · 构建期转换脚本（可重复执行）
//
// 用途：把同目录的 source.html（用户发来的平台单文件原件）转换成
// platform.html（剥离内嵌 Token、注入加载诊断脚本后的独立文档），供
// videogen.tsx 用 iframe 以「独立文档地址」承载（打包时它会作为
// assets 静态资源发出，iframe 用 src 指过去）。转换只做两件事，
// 其余字节一律原样：
//   1. 密钥剥离：把脚本里 DEFAULT_TOKEN 常量的值替换为空字符串，
//      保证打包产物里永远不带任何内置 Token（幂等：已是空值时不变）。
//   2. 诊断注入（v6.50 起）：把同目录 diagnostics.js 的内容以内联
//      <script> 形式注入到 <head> 末尾，永远跑在平台主程序之前，
//      负责把加载阶段 / 报错 / CSP 违规 / 存储探查结果通过
//      postMessage 报给工作台 wrapper（通道与口径见 diagnostics.js
//      文件头）。source.html 本体一字不动，注入只发生在本脚本的
//      产物里；换新版 source.html 后重跑本脚本，注入照常生效。
//
// 为什么诊断脚本用内联注入、不用外联 <script src>：platform.html
// 打包时是带内容哈希的 assets 资源（platform-<hash>.html），外联
// 诊断文件同样会被打包器改成哈希名，而本脚本在打包之前运行、
// 算不出哈希，写进 platform.html 的相对地址必然对不上。内联是这条
// 构建管线里唯一可重复的做法。若平台文档自身 CSP 连内联脚本都拦，
// 诊断脚本同样跑不起来——「iframe 已导航但 boot 没到」本身就是
// wrapper 能判读的信号（平台主程序同为内联脚本），诊断面板会照实
// 显示卡在该阶段。详见 videogen.tsx 文件头与 README。
//
// 为什么不用 srcDoc 把整份 HTML 当字符串塞进 iframe（v6.49 改）：
// srcDoc 文档会继承宿主页面（工作台页面）的内容安全策略（CSP）。
// 线上工作台页面带 script-src 限制（不允许内联脚本）时，平台那一整段
// 内联 <script> 会被浏览器拦下、平台界面一片黑（沙箱审计环境没这条
// CSP，所以当时看着正常）。改成独立文档地址后，平台文档只受它自己
// 响应头上的策略约束，不再被工作台页面的 CSP 连累。blob: 地址同理
// 会继承创建者的 CSP，实测一样黑，不能用。
//
// 用法：node prepare.mjs（在本目录下执行；构建不自动跑它，
// 换新版平台文件后手动跑一次再重新构建工作台，流程见 README.md）。

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const srcPath = join(here, "source.html");
const outPath = join(here, "platform.html");
const diagPath = join(here, "diagnostics.js");

const html = readFileSync(srcPath, "utf8");
const diagJs = readFileSync(diagPath, "utf8");

// 剥离内嵌默认 Token：只认 DEFAULT_TOKEN 的赋值语句本身，
// 找不到就报错停下（说明新版文件改了写法，要先人工看一眼）。
const tokenRe = /const\s+DEFAULT_TOKEN\s*=\s*"[^"]*"/;
if (!tokenRe.test(html)) {
  console.error(
    "prepare.mjs: 在 source.html 里找不到 DEFAULT_TOKEN 赋值语句，已停下；请先人工核对新版文件的密钥写法再改本脚本。",
  );
  process.exit(1);
}
let out = html.replace(tokenRe, 'const DEFAULT_TOKEN = ""');

// 注入诊断脚本（幂等：源里已带标记时不重复注入——正常流程中
// source.html 永远不带，标记只出现在产物 platform.html 里）。
if (out.includes("laoluo-diagnostics")) {
  console.log("prepare.mjs: 源文件已含诊断标记，跳过注入（请确认 source.html 来源）");
} else {
  const headEnd = out.indexOf("</head>");
  if (headEnd === -1) {
    console.error(
      "prepare.mjs: 在 source.html 里找不到 </head>，无法注入诊断脚本，已停下；请先人工核对新版文件结构再改本脚本。",
    );
    process.exit(1);
  }
  const inject = "<script>\n" + diagJs + "\n</script>\n";
  out = out.slice(0, headEnd) + inject + out.slice(headEnd);
}

writeFileSync(outPath, out, "utf8");
console.log(
  "prepare.mjs: 已生成 platform.html（源 " +
    html.length +
    " 字符 → 文档 " +
    out.length +
    " 字符；DEFAULT_TOKEN 已置空；诊断脚本已注入）",
);
