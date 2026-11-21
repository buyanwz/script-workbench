// 牢络生成平台 · 构建时抽取脚本（v6.51 起，直接挂载架构）
//
// 用途：把同目录的 source.html（用户发来的平台单文件原件）抽成
// generated.css + generated.js，随工作台 React 一起打包：
//   - generated.css：平台 <style> 的每条规则都加上 .laoluo-host 前缀
//     限定（html, body 规则丢弃，宿主容器另行给底色）；@keyframes
//     内部的步骤选择器不加前缀。
//   - generated.js：平台 <script> 包成 export function
//     bootLaoluo(mountEl)，不挂 window；做六类锚点替换（见下），
//     并把平台的 window 监听器 / 定时器改走追踪包装器，boot 返回
//     { handlers, suspend, resume, dispose } 供 wrapper 做保活
//     生命周期（细节见 videogen.tsx 与 README.md）。
//
// 解析用 TypeScript 编译器 API（仓库已有 devDependency，不新增依赖）：
// 顶层函数收集、锚点定位、on* 模板审计全部走 AST，不用正则猜结构。
// 任何锚点找不到 / 次数不符 / 模板文法外形式，立即报错停下，绝不
// 静默跳过——换新版文件后必须先人工看一眼再改本脚本。
//
// 用法：bun client/src/laoluo/sync.mjs（在仓库根目录执行；构建不
// 自动跑它，换新版平台文件后手动跑一次再重新构建，流程见 README）。

import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const here = dirname(fileURLToPath(import.meta.url));
const srcPath = join(here, "source.html");
const cssOutPath = join(here, "generated.css");
const jsOutPath = join(here, "generated.js");
const dtsOutPath = join(here, "generated.d.ts");

function fail(msg) {
  console.error("sync.mjs: " + msg);
  process.exit(1);
}

const html = readFileSync(srcPath, "utf8");
const sha256 = createHash("sha256").update(html, "utf8").digest("hex");
const sourceHash = sha256.slice(0, 16);

// ---------------------------------------------------------------- 抽取 style / script
const styleBlocks = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]);
const scriptBlocks = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
if (styleBlocks.length !== 1) fail("source.html 里 <style> 块应为恰好 1 个，实际 " + styleBlocks.length + " 个，已停下。");
if (scriptBlocks.length !== 1) fail("source.html 里 <script> 块应为恰好 1 个，实际 " + scriptBlocks.length + " 个，已停下。");
const rawCss = styleBlocks[0];
const rawJs = scriptBlocks[0];

// ---------------------------------------------------------------- CSS：逐条加 .laoluo-host 前缀
// 先剥注释（字符串内的注释标记不算：本文件 CSS 字符串只有字体名，
// 用带字符串感知的扫描剥离）。
function stripCssComments(css) {
  let out = "";
  let i = 0;
  let quote = null;
  while (i < css.length) {
    const ch = css[i];
    if (quote) {
      out += ch;
      if (ch === "\\") { out += css[i + 1] ?? ""; i += 2; continue; }
      if (ch === quote) quote = null;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; out += ch; i += 1; continue; }
    if (ch === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      if (end === -1) fail("CSS 注释未闭合。");
      i = end + 2;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

// 括号/字符串感知地切出规则列表：[{ prelude, block }]
function parseCssRules(css) {
  const rules = [];
  let i = 0;
  const n = css.length;
  while (i < n) {
    while (i < n && /\s/.test(css[i])) i += 1;
    if (i >= n) break;
    // prelude：读到 { 为止（字符串与括号内的不算）
    let prelude = "";
    let quote = null;
    let paren = 0;
    let opened = false;
    while (i < n) {
      const ch = css[i];
      if (quote) {
        prelude += ch;
        if (ch === "\\") { prelude += css[i + 1] ?? ""; i += 2; continue; }
        if (ch === quote) quote = null;
        i += 1;
        continue;
      }
      if (ch === '"' || ch === "'") { quote = ch; prelude += ch; i += 1; continue; }
      if (ch === "(") paren += 1;
      if (ch === ")") paren -= 1;
      if (ch === "{" && paren === 0) { opened = true; i += 1; break; }
      prelude += ch;
      i += 1;
    }
    if (!opened) fail("CSS 解析失败：规则缺少 { ：" + prelude.slice(0, 80));
    // block：读到配对的 } 为止
    let block = "";
    let depth = 1;
    quote = null;
    while (i < n && depth > 0) {
      const ch = css[i];
      if (quote) {
        block += ch;
        if (ch === "\\") { block += css[i + 1] ?? ""; i += 2; continue; }
        if (ch === quote) quote = null;
        i += 1;
        continue;
      }
      if (ch === '"' || ch === "'") { quote = ch; block += ch; i += 1; continue; }
      if (ch === "{") depth += 1;
      if (ch === "}") { depth -= 1; if (depth === 0) { i += 1; break; } }
      block += ch;
      i += 1;
    }
    if (depth !== 0) fail("CSS 解析失败：规则块未闭合：" + prelude.trim().slice(0, 80));
    rules.push({ prelude: prelude.trim(), block });
  }
  return rules;
}

// 按顶层逗号切选择器组（括号内的逗号不切）
function splitSelectors(prelude) {
  const parts = [];
  let cur = "";
  let depth = 0;
  let quote = null;
  for (let i = 0; i < prelude.length; i += 1) {
    const ch = prelude[i];
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
    if (ch === "(" || ch === "[") depth += 1;
    if (ch === ")" || ch === "]") depth -= 1;
    if (ch === "," && depth === 0) { parts.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts.filter(Boolean);
}

const HOST = ".laoluo-host";
let cssDropped = 0;
const cssOutRules = [];
function emitCssRules(rules, insideKeyframes) {
  for (const rule of rules) {
    const prelude = rule.prelude;
    if (/^@keyframes\b/i.test(prelude)) {
      // keyframes 内部步骤选择器（0% / from / to / 0%,100%）不加前缀
      const inner = parseCssRules(rule.block);
      const innerText = inner
        .map((r) => "  " + r.prelude + " {" + r.block + "}")
        .join("\n");
      cssOutRules.push(prelude + " {\n" + innerText + "\n}");
      continue;
    }
    if (/^@(media|supports|container)\b/i.test(prelude)) {
      const before = cssOutRules.length;
      emitCssRules(parseCssRules(rule.block), insideKeyframes);
      const inner = cssOutRules.splice(before);
      cssOutRules.push(prelude + " {\n" + inner.join("\n") + "\n}");
      continue;
    }
    if (prelude.startsWith("@")) fail("CSS 出现未处理的 at 规则：" + prelude.slice(0, 80));
    const selectors = splitSelectors(prelude);
    const normalized = selectors.join(",").replace(/\s+/g, "");
    if (normalized === "html,body") {
      cssDropped += 1;
      continue;
    }
    const scoped = selectors.map((s) => HOST + " " + s);
    cssOutRules.push(scoped.join(", ") + " {" + rule.block + "}");
  }
}
emitCssRules(parseCssRules(stripCssComments(rawCss)), false);
if (cssDropped !== 1) fail("CSS 里 html, body 规则应恰好丢弃 1 条，实际 " + cssDropped + " 条，已停下。");

const generatedCss =
  "/* AUTO-GENERATED by sync.mjs from source.html (sha256 " + sha256 + ") — do not edit by hand. */\n" +
  cssOutRules.join("\n") +
  "\n/* wrapper 覆盖：平台根节点在宿主里改走宿主高度（原 html, body 规则已丢弃、.uv-root 的 100vh 改 100%） */\n" +
  HOST + " .uv-root { height: 100%; min-height: 0; }\n" +
  "/* wrapper 覆盖（v6.54）：右上悬浮关闭钮占画布右上角，平台右岛左移让位 */\n" +
  HOST + " .uv-island-actions { right: 58px; }\n";

// 产物断言：重新解析产物，除 keyframe 步骤外每条选择器都以 .laoluo-host 开头
{
  const check = (rules, inKf) => {
    for (const rule of rules) {
      if (/^@keyframes\b/i.test(rule.prelude)) { check(parseCssRules(rule.block), true); continue; }
      if (/^@(media|supports|container)\b/i.test(rule.prelude)) { check(parseCssRules(rule.block), inKf); continue; }
      if (inKf) continue;
      for (const sel of splitSelectors(rule.prelude)) {
        if (!sel.startsWith(HOST)) fail("generated.css 断言失败：选择器未加宿主前缀：" + sel);
      }
    }
  };
  check(parseCssRules(stripCssComments(generatedCss)), false);
}

// ---------------------------------------------------------------- JS：AST 解析与锚点替换
const sf = ts.createSourceFile("platform.js", rawJs, ts.ScriptTarget.ES2022, true);
if (sf.parseDiagnostics && sf.parseDiagnostics.length > 0) {
  fail("平台脚本语法解析失败：" + sf.parseDiagnostics[0].messageText.messageText);
}

// 顶层声明收集（确定性：只看 SourceFile 的直接子语句）
const topFunctions = [];
const topVarNames = [];
for (const stmt of sf.statements) {
  if (ts.isFunctionDeclaration(stmt) && stmt.name) {
    topFunctions.push(stmt.name.text);
  } else if (ts.isVariableStatement(stmt)) {
    for (const decl of stmt.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name)) fail("顶层变量声明出现解构写法，无法确定性收集：" + decl.name.getText());
      topVarNames.push(decl.name.text);
      if (decl.initializer && (ts.isFunctionExpression(decl.initializer) || ts.isArrowFunction(decl.initializer))) {
        topFunctions.push(decl.name.text);
      }
    }
  }
}
const topFunctionSet = new Set(topFunctions);
if (topFunctions.length < 100) fail("顶层函数收集数量异常（" + topFunctions.length + "），已停下。");
if (topFunctionSet.size !== topFunctions.length) fail("顶层函数名有重复，已停下。");

// 锚点替换（按源码位置记录，最后从后往前应用，互不干扰）
const edits = [];
function addEdit(node, text) {
  edits.push({ start: node.getStart(), end: node.getEnd(), text });
}
const counts = {
  winAdd: 0, winRemove: 0,
  setInterval: 0, setTimeout: 0, clearInterval: 0, clearTimeout: 0,
  getByIdApp: 0, getByIdImg: 0, getByIdAudio: 0,
  bodyAppendTotal: 0, toastAppend: 0,
  token: 0,
};
const timerWrap = { setInterval: "__llSetInterval", setTimeout: "__llSetTimeout", clearInterval: "__llClearInterval", clearTimeout: "__llClearTimeout" };

function visit(node) {
  // DEFAULT_TOKEN 强制置空
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "DEFAULT_TOKEN") {
    if (!node.initializer) fail("DEFAULT_TOKEN 没有初始值，无法置空，已停下。");
    addEdit(node.initializer, '""');
    counts.token += 1;
  }
  if (ts.isCallExpression(node)) {
    const expr = node.expression;
    if (ts.isPropertyAccessExpression(expr)) {
      const objText = expr.expression.getText();
      const prop = expr.name.text;
      if (objText === "window" && prop === "addEventListener") { addEdit(expr, "__llAdd"); counts.winAdd += 1; }
      else if (objText === "window" && prop === "removeEventListener") { addEdit(expr, "__llRemove"); counts.winRemove += 1; }
      else if (objText === "document" && prop === "getElementById") {
        const arg = node.arguments[0];
        if (!arg || !ts.isStringLiteral(arg)) fail("getElementById 调用参数不是字符串字面量，已停下：" + node.getText().slice(0, 80));
        if (arg.text === "app") { addEdit(node, "mountEl"); counts.getByIdApp += 1; }
        else if (arg.text === "uv-img-input") { addEdit(node, 'app.querySelector("#uv-img-input")'); counts.getByIdImg += 1; }
        else if (arg.text === "uv-audio-input") { addEdit(node, 'app.querySelector("#uv-audio-input")'); counts.getByIdAudio += 1; }
        else fail("出现未预期的 getElementById 参数：" + arg.text);
      } else if (objText === "document.body" && prop === "appendChild") {
        counts.bodyAppendTotal += 1;
        const arg = node.arguments[0];
        // 只改 toast 那一处（参数恰好是变量 t）；复制 textarea(ta) 与下载 <a>(a) 两处不动
        if (arg && ts.isIdentifier(arg) && arg.text === "t") {
          addEdit(expr, "app.appendChild");
          counts.toastAppend += 1;
        }
      } else if (objText === "window" && (prop === "setInterval" || prop === "setTimeout" || prop === "clearInterval" || prop === "clearTimeout")) {
        fail("出现 window." + prop + " 写法（预期只有裸调用），已停下。");
      }
    } else if (ts.isIdentifier(expr) && Object.prototype.hasOwnProperty.call(timerWrap, expr.text)) {
      addEdit(expr, timerWrap[expr.text]);
      counts[expr.text] += 1;
    }
  }
  ts.forEachChild(node, visit);
}
visit(sf);

if (counts.token !== 1) fail("DEFAULT_TOKEN 赋值应恰好 1 处，实际 " + counts.token + " 处，已停下。");
if (counts.winAdd !== 12) fail("window.addEventListener 应恰好 12 处，实际 " + counts.winAdd + " 处，已停下。");
if (counts.winRemove !== 8) fail("window.removeEventListener 应恰好 8 处，实际 " + counts.winRemove + " 处，已停下。");
if (counts.getByIdApp !== 1) fail('getElementById("app") 应恰好 1 处，实际 ' + counts.getByIdApp + " 处，已停下。");
if (counts.getByIdImg !== 2) fail('getElementById("uv-img-input") 应恰好 2 处，实际 ' + counts.getByIdImg + " 处，已停下。");
if (counts.getByIdAudio !== 1) fail('getElementById("uv-audio-input") 应恰好 1 处，实际 ' + counts.getByIdAudio + " 处，已停下。");
if (counts.bodyAppendTotal !== 3) fail("document.body.appendChild 应恰好 3 处，实际 " + counts.bodyAppendTotal + " 处，已停下。");
if (counts.toastAppend !== 1) fail("toast 的 document.body.appendChild(t) 应恰好替换 1 处，实际 " + counts.toastAppend + " 处，已停下。");
if (counts.setInterval !== 2) fail("setInterval 应恰好 2 处，实际 " + counts.setInterval + " 处，已停下。");
// v6.58：setTimeout 14 处（v6.57 的 9 处 + 批量生成新增 5 处：演示完成定时 1、批量轮询续查/退避 2、下载后撤销对象地址 1、全部下载间隔 1）
// v6.59：+1（密钥防抖保存）= 15。
// v6.60：+5（存档同步防抖 1、存档抽卡轮询续查/退避 2、存档抽卡演示定时 1、存档下载后撤销对象地址 1）= 20。
if (counts.setTimeout !== 20) fail("setTimeout 应恰好 20 处，实际 " + counts.setTimeout + " 处，已停下。");

// 应用替换（从后往前，断言不重叠）
edits.sort((a, b) => b.start - a.start);
let transformedJs = rawJs;
let lastStart = Infinity;
for (const e of edits) {
  if (e.end > lastStart) fail("锚点替换区间重叠，已停下。");
  lastStart = e.start;
  transformedJs = transformedJs.slice(0, e.start) + e.text + transformedJs.slice(e.end);
}

// ---------------------------------------------------------------- on* 模板审计
// 把字符串拼接链还原成「逻辑字符串」：字符串操作数取原文，非字符串
// 操作数（变量/表达式）记为 ¤。模板里的动态段在运行时才定型，审计
// 只验字面部分的文法；全动态模板（onclick="' + fn + '"）单列。
const DYN = "¤";
const logicalStrings = [];
const consumedStrings = new Set();
function flattenChain(node) {
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return flattenChain(node.left) + flattenChain(node.right);
  }
  if (ts.isStringLiteral(node)) { consumedStrings.add(node); return node.text; }
  if (ts.isNoSubstitutionTemplateLiteral(node)) { consumedStrings.add(node); return node.text; }
  if (ts.isTemplateExpression(node)) {
    consumedStrings.add(node);
    let out = node.head.text;
    for (const span of node.templateSpans) out += DYN + span.literal.text;
    return out;
  }
  return DYN;
}
function chainOperands(node, out) {
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    chainOperands(node.left, out);
    chainOperands(node.right, out);
    return out;
  }
  out.push(node);
  return out;
}
function collectLogical(node, insideChain) {
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken && !insideChain) {
    logicalStrings.push(flattenChain(node));
    // 链的非字符串操作数内部（如 .map(...).join("") 里再拼一截 HTML）
    // 可能藏着独立的拼接链 / 字符串，继续下钻收集，否则会漏模板。
    for (const op of chainOperands(node, [])) {
      if (
        !ts.isStringLiteral(op) &&
        !ts.isNoSubstitutionTemplateLiteral(op) &&
        !ts.isTemplateExpression(op) &&
        !(ts.isBinaryExpression(op) && op.operatorToken.kind === ts.SyntaxKind.PlusToken)
      ) {
        collectLogical(op, false);
      }
    }
    return;
  }
  if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && !insideChain && !consumedStrings.has(node)) {
    logicalStrings.push(node.text);
    return;
  }
  if (ts.isTemplateExpression(node) && !insideChain) {
    logicalStrings.push(flattenChain(node));
    for (const span of node.templateSpans) collectLogical(span.expression, false);
    return;
  }
  ts.forEachChild(node, (child) => collectLogical(child, insideChain));
}
collectLogical(sf, false);

// 引号感知的切分（字符串里的分隔符不切）
function splitAware(text, sep) {
  const parts = [];
  let cur = "";
  let quote = null;
  let depth = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') { quote = ch; cur += ch; continue; }
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === sep && depth === 0) { parts.push(cur); cur = ""; continue; }
    cur += ch;
  }
  parts.push(cur);
  return parts;
}

const ARG_OK = [
  /^event$/, /^this$/, /^this\.files$/, /^this\.checked$/, /^this\.value$/,
  /^true$/, /^false$/, /^null$/, /^undefined$/,
  /^-?\d+(\.\d+)?$/,
  /^'[^']*'$/, /^"[^"]*"$/,
  new RegExp("^" + DYN + "$"),
];
const handlerCallees = new Set();
const eventTypeCounts = {};
const dynamicTemplates = [];
let templateTotal = 0;

for (const logical of logicalStrings) {
  const re = /on([a-z]+)="/g;
  let m;
  while ((m = re.exec(logical)) !== null) {
    const type = m[1];
    const bodyStart = m.index + m[0].length;
    const close = logical.indexOf('"', bodyStart);
    if (close === -1) fail("on* 模板未闭合（逻辑字符串内找不到结束引号）：" + logical.slice(m.index, m.index + 80));
    const body = logical.slice(bodyStart, close);
    templateTotal += 1;
    eventTypeCounts[type] = (eventTypeCounts[type] ?? 0) + 1;
    const trimmed = body.trim();
    if (trimmed === DYN) {
      dynamicTemplates.push("on" + type + '="' + DYN + '"');
      continue;
    }
    // 文法审计：遮掉动态段后，字面部分必须只含白名单形式
    if (/&&|\|\||\?/.test(trimmed.replace(/'[^']*'/g, "").replace(/"[^"]*"/g, ""))) {
      fail("on* 模板出现文法外形式（三元/&&/||）：" + body.slice(0, 120));
    }
    for (const rawStmt of splitAware(body, ";")) {
      const stmt = rawStmt.trim();
      if (!stmt) continue;
      if (stmt === "event.stopPropagation()" || stmt === "event.preventDefault()") continue;
      if (/^this\.value\s*=\s*('[^']*'|"[^"]*")$/.test(stmt)) continue;
      const call = stmt.match(/^([A-Za-z_$][\w$]*)\(([\s\S]*)\)$/);
      if (!call) fail("on* 模板语句不符合解析器文法：" + stmt.slice(0, 120) + "（出自 " + body.slice(0, 120) + "）");
      handlerCallees.add(call[1]);
      const argsText = call[2].trim();
      if (!argsText) continue;
      for (const rawArg of splitAware(argsText, ",")) {
        const arg = rawArg.trim();
        if (!ARG_OK.some((r) => r.test(arg))) {
          fail("on* 模板参数不符合白名单：" + arg.slice(0, 80) + "（出自 " + stmt.slice(0, 120) + "）");
        }
      }
    }
  }
}
if (templateTotal < 90) fail("on* 模板抽取数量异常（" + templateTotal + "），已停下。");
// 与原始文本计数对账：脚本原文里 on<type>=" 的出现次数应与 AST 抽取
// 完全一致（少了说明有模板藏在没下钻到的结构里，多了说明原文里有
// 注释/无关文本混入——两种情况都停下人工核对）。
for (const type of Object.keys(eventTypeCounts)) {
  const rawCount = (rawJs.match(new RegExp("on" + type + '="', "g")) ?? []).length;
  if (rawCount !== eventTypeCounts[type]) {
    fail("on" + type + " 模板计数对不上：AST 抽取 " + eventTypeCounts[type] + " 处，原文文本 " + rawCount + " 处，已停下。");
  }
}
for (const name of handlerCallees) {
  if (!topFunctionSet.has(name)) fail("on* 模板引用的函数不在顶层函数字典里：" + name);
}

// ---------------------------------------------------------------- v6.63 委托完整性门禁（裁决7）
// 静态门禁：全部 on* 模板引用的函数必须 1:1 落在 handlers 字典
// （= 全部顶层函数）里——上面的循环已逐个验，这里再做一次汇总
// 断言，缺任何一项构建失败（非零退出）；参数形式已由上面的
// ARG_OK 白名单审计覆盖（不在白名单内的参数形式同样停下）。
// 另验 v6.63 自测基建齐备：5 个 data-fid 控件（batch-open-
// picker / batch-picker-row-N / batch-picker-confirm / batch-
// start-all / batch-proj-switch-btn）、自测钩子
// __flor911TestBatchClicks、且选择器确认按钮必须是零参模板
// onclick="batchConfirmShotPick()"（确认类按钮不许带动态参数，
// 读 JS 内部 state）。本门禁只做静态检查，不改抽取逻辑。
{
  const missing = [...handlerCallees].filter((n) => !topFunctionSet.has(n));
  if (missing.length) fail("委托完整性门禁失败：模板引用函数缺字典项：" + missing.join(", "));
  for (const fid of ["batch-open-picker", "batch-picker-row-", "batch-picker-confirm", "batch-start-all", "batch-proj-switch-btn"]) {
    if (!rawJs.includes('data-fid="' + fid)) {
      fail("委托完整性门禁失败：缺少自测控件 data-fid=\"" + fid + "\"，已停下。");
    }
  }
  if (!rawJs.includes('data-fid="batch-picker-confirm" onclick="batchConfirmShotPick()"')) {
    fail("委托完整性门禁失败：选择器确认按钮不是零参模板 onclick=\"batchConfirmShotPick()\"，已停下。");
  }
  if (!rawJs.includes("__flor911TestBatchClicks")) {
    fail("委托完整性门禁失败：缺少自测钩子 __flor911TestBatchClicks，已停下。");
  }
  console.log("  委托完整性门禁: " + handlerCallees.size + " 个模板引用函数全部在 handlers 字典内（1:1）；5 个 data-fid 自测控件、零参确认模板与自测钩子齐备");
}

// ---------------------------------------------------------------- 组装 generated.js
const infra = `
  // ---- 生命周期追踪（sync.mjs 注入，非平台本体）----
  // 平台的 window 监听器与定时器全部经下面的包装器登记，wrapper
  // 关窗时 suspend() 摘除监听器（beforeunload 保留）、定时器保留
  // 继续跑（生成轮询不中断）；dispose() 才全清，仅供整页卸载用。
  const __llListeners = [];
  const __llTimers = new Set();
  let __llSuspended = false;
  function __llAdd(type, listener, options) {
    window.addEventListener(type, listener, options);
    __llListeners.push({ type: type, listener: listener, options: options, held: false });
  }
  function __llRemove(type, listener, options) {
    window.removeEventListener(type, listener, options);
    for (let i = __llListeners.length - 1; i >= 0; i--) {
      if (__llListeners[i].type === type && __llListeners[i].listener === listener) {
        __llListeners.splice(i, 1);
        break;
      }
    }
  }
  function __llSetInterval(fn, ms) {
    const rest = Array.prototype.slice.call(arguments, 2);
    const id = setInterval.apply(null, [fn, ms].concat(rest));
    __llTimers.add(id);
    return id;
  }
  function __llSetTimeout(fn, ms) {
    const rest = Array.prototype.slice.call(arguments, 2);
    const id = setTimeout.apply(null, [fn, ms].concat(rest));
    __llTimers.add(id);
    return id;
  }
  function __llClearInterval(id) { clearInterval(id); __llTimers.delete(id); }
  function __llClearTimeout(id) { clearTimeout(id); __llTimers.delete(id); }
  function __llSuspendListeners() {
    if (__llSuspended) return;
    __llSuspended = true;
    for (const rec of __llListeners) {
      if (rec.type === "beforeunload") continue;
      window.removeEventListener(rec.type, rec.listener, rec.options);
      rec.held = true;
    }
  }
  function __llResumeListeners() {
    if (!__llSuspended) return;
    __llSuspended = false;
    for (const rec of __llListeners) {
      if (!rec.held) continue;
      window.addEventListener(rec.type, rec.listener, rec.options);
      rec.held = false;
    }
  }
  function __llDisposeAll() {
    for (const rec of __llListeners) window.removeEventListener(rec.type, rec.listener, rec.options);
    __llListeners.length = 0;
    for (const id of __llTimers) { clearInterval(id); clearTimeout(id); }
    __llTimers.clear();
  }
  // ---- 平台本体开始（由 source.html 抽取，锚点替换见 sync.mjs）----
`;

const trailer = `
  // ---- 平台本体结束 ----
  const handlers = { ${topFunctions.join(", ")} };
  function suspend() {
    __llSuspendListeners();
    try {
      for (const __s of L) {
        if (__s && __s.audioObj) {
          __s.audioObj.pause();
          __s.audioObj = null;
          __s.playing = null;
        }
      }
      patchBars();
    } catch (e) { /* 暂停音频失败不影响关窗 */ }
  }
  function resume() {
    __llResumeListeners();
    try { applyCam(); } catch (e) { /* 画布重算失败不阻断打开 */ }
  }
  function dispose() { __llDisposeAll(); }
  return { handlers: handlers, suspend: suspend, resume: resume, dispose: dispose };
`;

const generatedJs =
  "/* AUTO-GENERATED by sync.mjs from source.html (sha256 " + sha256 + ") — do not edit by hand. */\n" +
  'export const LAOLUO_SOURCE_HASH = "' + sourceHash + '";\n' +
  "export function bootLaoluo(mountEl) {" +
  infra +
  transformedJs +
  trailer +
  "}\n";

const generatedDts =
  "/* AUTO-GENERATED by sync.mjs — bootLaoluo 的类型声明（与 generated.js 同源）。 */\n" +
  "export declare const LAOLUO_SOURCE_HASH: string;\n" +
  "export interface LaoluoBootHandle {\n" +
  "  handlers: Record<string, (...args: any[]) => unknown>;\n" +
  "  suspend: () => void;\n" +
  "  resume: () => void;\n" +
  "  dispose: () => void;\n" +
  "}\n" +
  "export declare function bootLaoluo(mountEl: HTMLElement): LaoluoBootHandle;\n";

writeFileSync(cssOutPath, generatedCss, "utf8");
writeFileSync(jsOutPath, generatedJs, "utf8");
writeFileSync(dtsOutPath, generatedDts, "utf8");

console.log("sync.mjs: 抽取完成");
console.log("  source.html sha256: " + sha256 + "（LAOLUO_SOURCE_HASH=" + sourceHash + "）");
console.log("  CSS: " + cssOutRules.length + " 条规则（已丢弃 html, body ×" + cssDropped + "，keyframes 步骤未加前缀）");
console.log(
  "  JS 锚点: app=" + counts.getByIdApp + " imgInput=" + counts.getByIdImg + " audioInput=" + counts.getByIdAudio +
  " toastAppend=" + counts.toastAppend + "/" + counts.bodyAppendTotal +
  " winAdd=" + counts.winAdd + " winRemove=" + counts.winRemove +
  " setInterval=" + counts.setInterval + " setTimeout=" + counts.setTimeout +
  " clearInterval=" + counts.clearInterval + " clearTimeout=" + counts.clearTimeout +
  " DEFAULT_TOKEN 置空=" + counts.token,
);
console.log("  顶层函数: " + topFunctions.length + " 个（全部进 handlers 字典）；顶层变量 " + topVarNames.length + " 个");
console.log("  on* 模板: 共 " + templateTotal + " 处 " + JSON.stringify(eventTypeCounts) + "；引用的函数 " + handlerCallees.size + " 个，全部在字典里");
console.log("  审计单列（运行时大声报错兜底）: 全动态模板 " + dynamicTemplates.length + " 处 " + JSON.stringify(dynamicTemplates) + "——其值在运行时才定型（如菜单项的 fn 字符串），静态审计无法验证，靠委托分发器的运行时报错横幅兜底；这些函数名均来自平台菜单定义、且都在 handlers 字典内（字典含全部顶层函数）。");
