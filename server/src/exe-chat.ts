// exe 专属左侧聊天后端 + 聊天页（移植层，第一期建、第二期接解剖）。
//
// 归属：只属于 GitHub exe 壳层，Muse 内工作台看不见它。
// 绝不放进 client/src 与 server/src/actions.ts——每日同步会覆盖那两处，
// 放进去下次同步就没了。本模块只挂在 server.ts 的 exe 专属路由上。
// 解剖编排在兄弟模块 exe-chat-dissect.ts 里（同样只挂 exe 专属路由）。
//
// 口径（见 exe-left-chat-design.md）：
//   - 左聊天是 exe 自己的聊天，能正常聊天、按精修规则分析、直接写进
//     本地项目。它不是 muse.ai 本人，页面上明说，绝不冒充。
//   - 文本模型默认 deepseek-v4-flash（已验证可用）。旧默认文本模型已死
//     （Geeknow 侧 503 model_not_found），此处绝不回落到它，也绝不经
//     ctx.inference（那条通道的默认模型还是旧的）；本模块直接调
//     Geeknow chat/completions，模型名写死在本文件常量里。
//   - 视觉模型未验证：第一期 visionEnabled=false，聊天不接受图片输入，
//     不得默认启用视觉模型。
//   - Key 各填各的、各存各的本机：聊天页只存 localStorage；服务端不存
//     Key、不记 Key 进日志；无 Key 时报明确错误，绝不静默用假 Key。
//   - 写操作只写数据（经现有动作 handler 落同一个本地库），绝不改
//     工作台代码、布局与设置；绝不触发生成。

import { Actions } from "./actions";
import { createLocalCtx } from "./ctx";
import type { GeeknowRequestAuth } from "./local-sdk";
import { z } from "./local-sdk";

/** 聊天文本模型（唯一默认，已验证；不得改回旧默认模型）。 */
export const EXE_CHAT_TEXT_MODEL = "deepseek-v4-flash";

/** Geeknow 默认地址（与生图侧一致；会员可在聊天页改填自己的地址）。 */
export const EXE_CHAT_DEFAULT_BASE = "https://api.geeknow.top";

/** 视觉是否启用：第一期固定关闭（视觉模型未验证）。 */
export const EXE_CHAT_VISION_ENABLED = false;

/** 聊天系统提示词：精修口径写死（全文见 exe-chat-dissect.ts 的 EXE_CHAT_DISSECT_RULES）。 */
export const EXE_CHAT_SYSTEM_PROMPT =
  "你是剧本创作工作台左侧的聊天助手，跑在会员自己的电脑上（exe 本地聊天，不是 muse.ai 本人）。" +
  "回答用中文、大白话。分析视频/封面时遵守：台词一字不差，不改台词意思；" +
  "人物锁定，代号与外貌一一对应，绝不串演；无字幕，台词只配音不烧录字幕；" +
  "封面分析只定人物站位、标题位置、标题风格三样，人物长相以资产图为准；" +
  "看不见的内容不编造，存疑处明说存疑。你绝不改工作台程序本身；" +
  "写回只写项目数据，经聊天后端落库。" +
  "解剖精修规则（写死，不得违背）：转写定时间轴与台词条数，转写文字只是草稿，以逐帧烧录字幕为准、易错处多帧复核；" +
  "说话人按口型、画面构图、语义闭环对位，对不上标存疑，绝不编造台词；" +
  "只取最多 10 位主角，按台词量加出镜时长排序，龙套过滤；" +
  "场景逐个写详细提示词，分镜里的场景名与资产卡名逐字相同，道具有特殊才加；" +
  "动作秒数用整数；输出剧本格式01分镜表加资产清单，存入分析记录并一键套用成新项目。" +
  "视频分析走聊天页上的「解剖视频」区（选文件或粘贴链接后点开始解剖），对话里收到视频请求时引导用户去那里操作，不要在对话里假装已收到视频。";

// ---------------------------------------------------------------------------
// 请求校验
// ---------------------------------------------------------------------------

const chatMessageSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(20000),
      }),
    )
    .min(1)
    .max(50),
  apiKey: z.string().max(500).optional(),
  apiBase: z.string().max(300).optional(),
  dryRun: z.boolean().optional(),
});

const writebackSchema = z.object({
  kind: z.literal("cover-draft"),
  projectId: z.number().int().positive(),
  styleId: z.string().min(1).max(60),
  promptZh: z.string().max(20000),
  promptEn: z.string().max(20000),
});

function jsonError(status: number, error: string): Response {
  return Response.json({ ok: false, error }, { status });
}

function authFromHeaders(req: Request): GeeknowRequestAuth | undefined {
  const key = req.headers.get("x-geeknow-api-key")?.trim();
  const base = req.headers.get("x-geeknow-api-base")?.trim();
  if (!key && !base) return undefined;
  return {
    ...(key ? { geeknowKey: key } : {}),
    ...(base ? { geeknowBase: base } : {}),
  };
}

function resolveChatBase(apiBase?: string, headerBase?: string): string {
  const raw =
    apiBase?.trim() ||
    headerBase?.trim() ||
    process.env.GEEKNOW_API_BASE?.trim() ||
    EXE_CHAT_DEFAULT_BASE;
  if (!raw.startsWith("https://")) {
    throw new Error("API 地址格式不对：需要以 https:// 开头的完整地址");
  }
  let base = raw.replace(/\/+$/, "");
  if (base.endsWith("/v1")) base = base.slice(0, -3).replace(/\/+$/, "");
  return base;
}

async function readJsonBody(req: Request): Promise<unknown> {
  const text = await req.text();
  if (!text.trim()) return {};
  return JSON.parse(text) as unknown;
}

// ---------------------------------------------------------------------------
// POST /api/chat/message：模型对话（dryRun 不调用模型、不计费）
// ---------------------------------------------------------------------------

export async function handleExeChatMessage(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch {
    return jsonError(400, "请求体不是合法 JSON");
  }
  const parsed = chatMessageSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "入参校验失败：messages 至少 1 条、最多 50 条");
  }
  const { messages, dryRun } = parsed.data;

  // 试跑：不调用模型、不计费，只回显最后一条，供沙箱验证通路。
  if (dryRun === true) {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const echo = (lastUser?.content ?? "").slice(0, 200);
    return Response.json({
      ok: true,
      reply:
        "[试跑，未调用模型] 收到你发的最后一条（前 200 字）：" +
        echo +
        "；要真实对话请取消勾选试跑，并填你自己的 Key。",
      model: EXE_CHAT_TEXT_MODEL,
      dryRun: true,
      noBilling: true,
    });
  }

  const apiKey =
    parsed.data.apiKey?.trim() ||
    req.headers.get("x-geeknow-api-key")?.trim() ||
    process.env.GEEKNOW_API_KEY?.trim() ||
    "";
  if (!apiKey) {
    return jsonError(
      400,
      "未填 Key：请在左侧聊天框里填你自己的 Geeknow Key（只存这台电脑），再发送。",
    );
  }
  let base: string;
  try {
    base = resolveChatBase(
      parsed.data.apiBase,
      req.headers.get("x-geeknow-api-base") ?? undefined,
    );
  } catch (e) {
    return jsonError(400, e instanceof Error ? e.message : String(e));
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  let res: Response;
  try {
    res = await fetch(`${base}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: EXE_CHAT_TEXT_MODEL,
        messages: [
          { role: "system", content: EXE_CHAT_SYSTEM_PROMPT },
          ...messages,
        ],
      }),
      signal: controller.signal,
    });
  } catch (e) {
    if ((e as Error)?.name === "AbortError") {
      return jsonError(502, `模型请求超时（120 秒，模型 ${EXE_CHAT_TEXT_MODEL}）`);
    }
    return jsonError(
      502,
      `模型请求失败（模型 ${EXE_CHAT_TEXT_MODEL}）：${e instanceof Error ? e.message : String(e)}`,
    );
  } finally {
    clearTimeout(timer);
  }
  const rawText = await res.text();
  if (!res.ok) {
    return jsonError(
      502,
      `模型接口返回 HTTP ${res.status}（模型 ${EXE_CHAT_TEXT_MODEL}）${rawText ? `：${rawText.slice(0, 400)}` : ""}`,
    );
  }
  let data: unknown;
  try {
    data = JSON.parse(rawText) as unknown;
  } catch {
    return jsonError(
      502,
      `模型接口返回的不是合法 JSON（模型 ${EXE_CHAT_TEXT_MODEL}）`,
    );
  }
  const content = (
    data as { choices?: { message?: { content?: unknown } }[] }
  )?.choices?.[0]?.message?.content;
  let reply = "";
  if (typeof content === "string") {
    reply = content.trim();
  } else if (Array.isArray(content)) {
    reply = content
      .map((p) =>
        typeof p === "object" && p !== null && "text" in p
          ? String((p as { text: unknown }).text)
          : "",
      )
      .join("")
      .trim();
  }
  if (!reply) {
    return jsonError(502, `模型没有返回文本内容（模型 ${EXE_CHAT_TEXT_MODEL}）`);
  }
  return Response.json({
    ok: true,
    reply,
    model: EXE_CHAT_TEXT_MODEL,
    dryRun: false,
  });
}

// ---------------------------------------------------------------------------
// POST /api/chat/writeback：写回通路（第一期只做封面草稿一种）
// 经现有动作 handler 写同一个本地库，写完立即用现有读动作回读比对。
// ---------------------------------------------------------------------------

export async function handleExeChatWriteback(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch {
    return jsonError(400, "请求体不是合法 JSON");
  }
  const parsed = writebackSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      400,
      "入参校验失败：kind 只能是 cover-draft，须带 projectId / styleId / promptZh / promptEn",
    );
  }
  const { projectId, styleId, promptZh, promptEn } = parsed.data;
  const ctx = createLocalCtx(authFromHeaders(req));
  try {
    const saveDef = Actions.saveCoverPromptDraft;
    const saved = await saveDef.handler(
      ctx,
      saveDef.request.parse({ projectId, styleId, promptZh, promptEn }),
    );
    if (!saved.ok) {
      return jsonError(404, saved.error ?? "保存失败：项目不存在");
    }
    const readDef = Actions.getCoverPromptDraft;
    const readBack = await readDef.handler(
      ctx,
      readDef.request.parse({ projectId, styleId }),
    );
    return Response.json({
      ok: true,
      projectId,
      styleId,
      saved,
      readBack,
      roundTripMatch:
        readBack.found &&
        readBack.promptZh === promptZh &&
        readBack.promptEn === promptEn,
    });
  } catch (e) {
    return jsonError(500, e instanceof Error ? e.message : String(e));
  }
}

// ---------------------------------------------------------------------------
// GET /api/chat/health：聊天后端自述（不含任何 Key）
// ---------------------------------------------------------------------------

export function exeChatHealth(): Response {
  return Response.json({
    ok: true,
    chat: "exe-local",
    textModel: EXE_CHAT_TEXT_MODEL,
    visionEnabled: EXE_CHAT_VISION_ENABLED,
    visionModel: null,
    dryRunSupported: true,
    dissect: {
      routes: [
        "POST /api/chat/dissect/upload",
        "POST /api/chat/dissect/from-url",
        "POST /api/chat/dissect/start",
        "GET /api/chat/dissect/status",
        "POST /api/chat/vision-probe",
      ],
      visionVerified: false,
    },
  });
}

// ---------------------------------------------------------------------------
// 聊天页：exe 专属静态页（自包含，不依赖 client/dist，不读工作台 DOM）。
// 注意：本字符串内不得出现反引号与 ${，否则会破坏外层模板字面量。
// ---------------------------------------------------------------------------

export const EXE_CHAT_PAGE_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>聊天</title>
<style>
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; font-family: system-ui, sans-serif; background: #fdf8ef; color: #2b2b2b; }
#strip { display: none; height: 100%; flex-direction: column; align-items: center; padding-top: 12px; gap: 8px; background: #1f2a44; }
body.collapsed #strip { display: flex; }
body.collapsed #full { display: none; }
#strip button { writing-mode: vertical-rl; font-size: 15px; padding: 12px 6px; border: none; border-radius: 8px; background: #f7c948; color: #1f2a44; cursor: pointer; }
#strip .hint { writing-mode: vertical-rl; color: #cfd6e4; font-size: 12px; }
#full { display: flex; flex-direction: column; height: 100%; padding-right: 8px; overflow-y: auto; }
/* 滚动收进 #full 而不是文档：文档一旦出现滚动条，fixed 的 #resizer 会被顶到滚动条左侧、离视图真边缘差一条滚动条宽，分界就歪了；收进 #full 后滚动条归 #full 所有，分界贴紧真边缘，滚动行为不变。 */
#resizer { display: none; position: fixed; top: 0; right: 0; bottom: 0; width: 8px; cursor: ew-resize; z-index: 50; background: transparent; border-left: 1px solid #e5dcc4; touch-action: none; }
body:not(.collapsed) #resizer { display: block; }
#resizer:hover, #resizer.dragging { background: #f7c948; border-left-color: #f7c948; }
#resizer::after { content: ""; position: absolute; top: 50%; left: 3px; width: 2px; height: 48px; margin-top: -24px; background: #c9bfa4; border-radius: 1px; }
#resizer:hover::after, #resizer.dragging::after { background: #1f2a44; }
@media (max-width: 100px) { #resizer { display: none !important; } }
header { padding: 10px 12px; border-bottom: 1px solid #e5dcc4; display: flex; align-items: center; gap: 8px; }
header h1 { font-size: 16px; margin: 0; flex: 1; }
header .sub { font-size: 11px; color: #8a8378; }
#keybox { padding: 8px 12px; border-bottom: 1px solid #e5dcc4; font-size: 12px; display: flex; flex-direction: column; gap: 6px; }
#keybox label { display: flex; gap: 6px; align-items: center; }
#keybox input[type="password"], #keybox input[type="text"] { flex: 1; padding: 5px 6px; font-size: 12px; border: 1px solid #d8cfb8; border-radius: 6px; }
#keybox .note { color: #8a8378; font-size: 11px; }
#msgs { flex: 1; overflow-y: auto; padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; }
.msg { padding: 8px 10px; border-radius: 8px; font-size: 14px; line-height: 1.6; white-space: pre-wrap; word-break: break-word; }
.msg.user { background: #e8e0cc; align-self: flex-end; max-width: 92%; }
.msg.assistant { background: #ffffff; border: 1px solid #e5dcc4; align-self: flex-start; max-width: 96%; }
.msg.error { background: #fdecea; border: 1px solid #e8a5a0; color: #8a1f1a; }
#composer { padding: 10px 12px; border-top: 1px solid #e5dcc4; display: flex; flex-direction: column; gap: 8px; }
#composer textarea { width: 100%; min-height: 64px; padding: 8px; font-size: 14px; border: 1px solid #d8cfb8; border-radius: 8px; resize: vertical; }
#composer .row { display: flex; gap: 8px; align-items: center; }
#composer .row label { font-size: 12px; color: #6b655c; }
button { font-size: 14px; padding: 7px 14px; border: none; border-radius: 8px; background: #1f2a44; color: #fff; cursor: pointer; }
button:disabled { opacity: 0.5; cursor: default; }
button.secondary { background: #e8e0cc; color: #2b2b2b; }
#writeback { border-top: 1px solid #e5dcc4; padding: 10px 12px; font-size: 12px; display: flex; flex-direction: column; gap: 6px; }
#writeback h2 { font-size: 13px; margin: 0; }
#writeback input, #writeback textarea { width: 100%; padding: 5px 6px; font-size: 12px; border: 1px solid #d8cfb8; border-radius: 6px; }
#writeback textarea { min-height: 44px; resize: vertical; }
#writeback pre { margin: 0; padding: 8px; background: #fff; border: 1px solid #e5dcc4; border-radius: 6px; font-size: 11px; white-space: pre-wrap; word-break: break-word; max-height: 160px; overflow-y: auto; }
#dissect { border-top: 1px solid #e5dcc4; padding: 10px 12px; font-size: 12px; display: flex; flex-direction: column; gap: 6px; }
#dissect h2 { font-size: 13px; margin: 0; }
#dissect input, #dissect textarea, #dissect select { width: 100%; padding: 5px 6px; font-size: 12px; border: 1px solid #d8cfb8; border-radius: 6px; }
#dissect textarea { min-height: 44px; resize: vertical; }
#dissect .hint { color: #8a8378; font-size: 11px; margin: 0; }
#dissect pre { margin: 0; padding: 8px; background: #fff; border: 1px solid #e5dcc4; border-radius: 6px; font-size: 11px; white-space: pre-wrap; word-break: break-word; max-height: 200px; overflow-y: auto; }
#dissect .state { font-size: 12px; color: #6b655c; }
footer { padding: 6px 12px; font-size: 11px; color: #8a8378; border-top: 1px solid #e5dcc4; }
</style>
</head>
<body>
<div id="strip">
<button id="expandBtn" type="button">展开聊天</button>
<span class="hint">点一下滑出聊天框</span>
</div>
<div id="resizer" title="按住左右拖动，调宽聊天栏"></div>
<div id="full">
<header>
<h1>聊天</h1>
<span class="sub">exe 自己的聊天，不是 muse.ai 本人</span>
<button id="collapseBtn" class="secondary" type="button">收起</button>
</header>
<div id="keybox">
<label>Key <input id="apiKey" type="password" autocomplete="off" placeholder="填你自己的 Geeknow Key"></label>
<label>地址 <input id="apiBase" type="text" autocomplete="off" placeholder="https://api.geeknow.top"></label>
<div class="note">Key 只存这台电脑，不会发给别人。模型：deepseek-v4-flash。复制监控作品后，粘贴到下面输入框里发送。</div>
</div>
<div id="msgs"></div>
<div id="composer">
<textarea id="input" placeholder="粘贴复制好的内容，在这里跟助手说话…"></textarea>
<div class="row">
<label><input id="dryRun" type="checkbox"> 试跑（不调用模型、不计费）</label>
<span style="flex:1"></span>
<button id="sendBtn" type="button">发送</button>
</div>
</div>
<div id="writeback">
<h2>写回工作台：封面草稿</h2>
<label>项目编号 <input id="wbProjectId" type="text" inputmode="numeric" placeholder="例如 44"></label>
<label>风格编号 <input id="wbStyleId" type="text" placeholder="例如 explosive_vs"></label>
<label>中文提示词 <textarea id="wbZh"></textarea></label>
<label>英文提示词 <textarea id="wbEn"></textarea></label>
<div class="row" style="display:flex;gap:8px;">
<button id="fillBtn" class="secondary" type="button">把最后一条回复填入中文框</button>
<button id="wbBtn" type="button">存进工作台</button>
</div>
<pre id="wbResult">还没存过。存好后封面页打开对应项目和风格就能看到这份草稿。</pre>
</div>
<div id="dissect">
<h2>解剖视频</h2>
<p class="hint">选本地视频文件，或粘贴视频链接下载到本机，再点开始解剖。分析完结果直接存成分析记录并套用成新项目，右侧工作台里就能看到。</p>
<label>本地视频文件 <input id="dissectFile" type="file" accept="video/*"></label>
<button id="dissectUploadBtn" class="secondary" type="button">上传视频</button>
<label>或视频链接 <input id="dissectUrl" type="text" placeholder="粘贴视频直链（http:// 或 https:// 开头）"></label>
<button id="dissectUrlBtn" class="secondary" type="button">下载链接视频</button>
<label>视频标题（可空） <input id="dissectTitle" type="text" placeholder="例如：这个村子离大谱"></label>
<label>作者（可空） <input id="dissectCreator" type="text"></label>
<label>简介（可空） <textarea id="dissectDesc"></textarea></label>
<label>模式 <select id="dissectMode">
<option value="full">完整解剖（要调模型，按 Key 计费）</option>
<option value="plan">只看计划（不调模型、不写库）</option>
<option value="local-verify">本地验证（只跑本地步骤，写库验通路）</option>
</select></label>
<label><input id="dissectApply" type="checkbox" checked> 解剖完一键套用成新项目</label>
<div class="row" style="display:flex;gap:8px;">
<button id="dissectStartBtn" type="button" disabled>开始解剖</button>
<button id="visionProbeBtn" class="secondary" type="button">探一下视觉模型通不通</button>
</div>
<div id="dissectState" class="state">还没选视频。</div>
<pre id="dissectResult">还没解剖过。</pre>
</div>
<footer>左聊天一直存在，切工作台页面聊天不丢。分析结果经聊天后端直接写进本地项目。</footer>
</div>
<script>
(function () {
  var history = [];
  var forceMode = 'auto';
  function $(id) { return document.getElementById(id); }
  function applyLayout() {
    var collapsed = forceMode === 'strip' ? true : (forceMode === 'full' ? false : window.innerWidth < 100);
    document.body.classList.toggle('collapsed', collapsed);
  }
  window.addEventListener('resize', applyLayout);
  function setExpanded(expanded) {
    if (window.electronAPI && window.electronAPI.toggleChat) {
      try {
        var p = window.electronAPI.toggleChat(expanded);
        if (p && p.catch) { p.catch(function () {}); }
      } catch (e) {}
      forceMode = expanded ? 'full' : 'strip';
      applyLayout();
    } else {
      forceMode = expanded ? 'full' : 'strip';
      applyLayout();
    }
  }
  $('expandBtn').addEventListener('click', function () { setExpanded(true); });
  $('collapseBtn').addEventListener('click', function () { setExpanded(false); });
  // ---- 拖拽调宽：按住右边缘分界左右拖，宽度经主进程钳制 280–640px 并记到本机 ----
  var resizer = $('resizer');
  var resizing = false;
  function pushWidth(clientX) {
    if (window.electronAPI && window.electronAPI.setChatWidth) {
      try {
        var p = window.electronAPI.setChatWidth(Math.round(clientX));
        if (p && p.catch) { p.catch(function () {}); }
      } catch (e) {}
    }
  }
  resizer.addEventListener('pointerdown', function (e) {
    if (e.button !== 0) { return; }
    resizing = true;
    resizer.classList.add('dragging');
    document.body.style.userSelect = 'none';
    try { resizer.setPointerCapture(e.pointerId); } catch (err) {}
    e.preventDefault();
  });
  resizer.addEventListener('pointermove', function (e) {
    if (!resizing) { return; }
    pushWidth(e.clientX);
  });
  function endResize() {
    if (!resizing) { return; }
    resizing = false;
    resizer.classList.remove('dragging');
    document.body.style.userSelect = '';
  }
  resizer.addEventListener('pointerup', endResize);
  resizer.addEventListener('pointercancel', endResize);
  window.addEventListener('pointerup', endResize);
  try {
    var savedKey = localStorage.getItem('exeChat.apiKey');
    var savedBase = localStorage.getItem('exeChat.apiBase');
    if (savedKey) { $('apiKey').value = savedKey; }
    if (savedBase) { $('apiBase').value = savedBase; }
  } catch (e) {}
  function saveKeys() {
    try {
      localStorage.setItem('exeChat.apiKey', $('apiKey').value);
      localStorage.setItem('exeChat.apiBase', $('apiBase').value);
    } catch (e) {}
  }
  function addMsg(role, text, isError) {
    var div = document.createElement('div');
    div.className = 'msg ' + role + (isError ? ' error' : '');
    div.textContent = (role === 'user' ? '你：' : '助手：') + text;
    $('msgs').appendChild(div);
    $('msgs').scrollTop = $('msgs').scrollHeight;
    return div;
  }
  $('sendBtn').addEventListener('click', function () {
    var text = $('input').value.trim();
    if (!text) { return; }
    saveKeys();
    history.push({ role: 'user', content: text });
    addMsg('user', text, false);
    $('input').value = '';
    var btn = $('sendBtn');
    btn.disabled = true;
    var thinking = addMsg('assistant', '想着呢…', false);
    var payload = {
      messages: history.slice(-20),
      apiKey: $('apiKey').value.trim(),
      apiBase: $('apiBase').value.trim(),
      dryRun: $('dryRun').checked
    };
    fetch('/api/chat/message', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (res) {
      return res.json().then(function (data) { return { status: res.status, data: data }; });
    }).then(function (r) {
      thinking.remove();
      if (r.data && r.data.ok) {
        history.push({ role: 'assistant', content: r.data.reply });
        addMsg('assistant', r.data.reply, false);
      } else {
        var err = (r.data && r.data.error) ? r.data.error : ('请求失败，HTTP ' + r.status);
        addMsg('assistant', err, true);
      }
    }).catch(function (e) {
      thinking.remove();
      addMsg('assistant', '发送失败：' + (e && e.message ? e.message : String(e)), true);
    }).finally(function () {
      btn.disabled = false;
    });
  });
  $('fillBtn').addEventListener('click', function () {
    for (var i = history.length - 1; i >= 0; i--) {
      if (history[i].role === 'assistant') {
        $('wbZh').value = history[i].content;
        return;
      }
    }
    $('wbResult').textContent = '还没有助手回复，先聊一句再填。';
  });
  $('wbBtn').addEventListener('click', function () {
    var projectId = parseInt($('wbProjectId').value.trim(), 10);
    if (!projectId || projectId <= 0) {
      $('wbResult').textContent = '先填项目编号（数字，例如 44）。';
      return;
    }
    $('wbResult').textContent = '正在存…';
    fetch('/api/chat/writeback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'cover-draft',
        projectId: projectId,
        styleId: $('wbStyleId').value.trim(),
        promptZh: $('wbZh').value,
        promptEn: $('wbEn').value
      })
    }).then(function (res) {
      return res.json().then(function (data) { return { status: res.status, data: data }; });
    }).then(function (r) {
      $('wbResult').textContent = JSON.stringify(r.data, null, 2);
    }).catch(function (e) {
      $('wbResult').textContent = '保存失败：' + (e && e.message ? e.message : String(e));
    });
  });
  // ---- 解剖视频区（第二期） ----
  var dissectVideoId = null;
  var dissectPollTimer = null;
  function dissectSetState(t) { $('dissectState').textContent = t; }
  function dissectSetResult(t) { $('dissectResult').textContent = t; }
  function dissectHeaders() {
    return {
      'content-type': 'application/json',
      'x-geeknow-api-key': $('apiKey').value.trim(),
      'x-geeknow-api-base': $('apiBase').value.trim()
    };
  }
  function dissectReady(videoId, extra) {
    dissectVideoId = videoId;
    $('dissectStartBtn').disabled = false;
    dissectSetState('视频已就绪：' + videoId + (extra ? '（' + extra + '）' : '') + '，可以点开始解剖。');
  }
  $('dissectUploadBtn').addEventListener('click', function () {
    var file = $('dissectFile').files && $('dissectFile').files[0];
    if (!file) { dissectSetState('先选一个本地视频文件。'); return; }
    saveKeys();
    dissectSetState('正在上传 ' + file.name + '（' + Math.round(file.size / 1024 / 1024 * 10) / 10 + ' MB）…');
    var reader = new FileReader();
    reader.onload = function () {
      var dataUrl = String(reader.result || '');
      var comma = dataUrl.indexOf(',');
      var b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
      fetch('/api/chat/dissect/upload', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, dataBase64: b64 })
      }).then(function (res) {
        return res.json().then(function (data) { return { status: res.status, data: data }; });
      }).then(function (r) {
        if (r.data && r.data.ok) {
          dissectReady(r.data.videoId, '时长 ' + r.data.durationSec + ' 秒' + (r.data.hasAudio ? '' : '，无音轨'));
          dissectSetResult(JSON.stringify(r.data, null, 2));
        } else {
          dissectSetState('上传失败：' + ((r.data && r.data.error) ? r.data.error : ('HTTP ' + r.status)));
        }
      }).catch(function (e) {
        dissectSetState('上传失败：' + (e && e.message ? e.message : String(e)));
      });
    };
    reader.onerror = function () { dissectSetState('读文件失败，请换一个文件再试。'); };
    reader.readAsDataURL(file);
  });
  $('dissectUrlBtn').addEventListener('click', function () {
    var url = $('dissectUrl').value.trim();
    if (!url) { dissectSetState('先粘贴一条视频链接。'); return; }
    saveKeys();
    dissectSetState('正在下载链接视频…');
    fetch('/api/chat/dissect/from-url', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: url })
    }).then(function (res) {
      return res.json().then(function (data) { return { status: res.status, data: data }; });
    }).then(function (r) {
      if (r.data && r.data.ok) {
        dissectReady(r.data.videoId, '时长 ' + r.data.durationSec + ' 秒' + (r.data.hasAudio ? '' : '，无音轨'));
        dissectSetResult(JSON.stringify(r.data, null, 2));
      } else {
        dissectSetState('下载失败：' + ((r.data && r.data.error) ? r.data.error : ('HTTP ' + r.status)));
      }
    }).catch(function (e) {
      dissectSetState('下载失败：' + (e && e.message ? e.message : String(e)));
    });
  });
  function dissectPoll(jobId) {
    if (dissectPollTimer) { clearInterval(dissectPollTimer); }
    dissectPollTimer = setInterval(function () {
      fetch('/api/chat/dissect/status?jobId=' + encodeURIComponent(jobId), { method: 'GET' })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (!data || !data.ok || !data.job) {
            dissectSetState('查不到任务进度：' + ((data && data.error) ? data.error : '未知错误'));
            return;
          }
          var job = data.job;
          var lines = [];
          for (var i = 0; i < job.steps.length; i++) {
            var s = job.steps[i];
            lines.push(s.name + '：' + s.status + (s.detail ? ' — ' + s.detail : ''));
          }
          dissectSetResult(lines.join(String.fromCharCode(10)) + (job.result ? String.fromCharCode(10, 10) + JSON.stringify(job.result, null, 2) : ''));
          if (job.status === 'done') {
            clearInterval(dissectPollTimer);
            dissectPollTimer = null;
            var r = job.result || {};
            dissectSetState('解剖完成：转写 ' + r.segmentCount + ' 句，台词对上 ' + (r.lineCountMatch ? '是' : '否') +
              (r.analysisId ? '，分析记录 id ' + r.analysisId : '') +
              (r.projectId ? '，新项目 id ' + r.projectId + '（右侧工作台刷新后可见）' : ''));
          } else if (job.status === 'failed') {
            clearInterval(dissectPollTimer);
            dissectPollTimer = null;
            dissectSetState('解剖失败：' + (job.error || '未知错误'));
          } else {
            dissectSetState('解剖进行中：当前步骤 ' + job.step + '…');
          }
        })
        .catch(function (e) {
          dissectSetState('查进度失败：' + (e && e.message ? e.message : String(e)));
        });
    }, 4000);
  }
  $('dissectStartBtn').addEventListener('click', function () {
    if (!dissectVideoId) { dissectSetState('先上传视频或下载链接视频。'); return; }
    saveKeys();
    var btn = $('dissectStartBtn');
    btn.disabled = true;
    dissectSetState('正在启动解剖…');
    fetch('/api/chat/dissect/start', {
      method: 'POST',
      headers: dissectHeaders(),
      body: JSON.stringify({
        videoId: dissectVideoId,
        title: $('dissectTitle').value.trim(),
        creatorName: $('dissectCreator').value.trim(),
        description: $('dissectDesc').value.trim(),
        mode: $('dissectMode').value,
        apply: $('dissectApply').checked,
        apiKey: $('apiKey').value.trim(),
        apiBase: $('apiBase').value.trim()
      })
    }).then(function (res) {
      return res.json().then(function (data) { return { status: res.status, data: data }; });
    }).then(function (r) {
      if (r.data && r.data.ok) {
        dissectSetState('解剖已启动，任务 ' + r.data.jobId + '，正在轮询进度…');
        dissectPoll(r.data.jobId);
      } else {
        dissectSetState('启动失败：' + ((r.data && r.data.error) ? r.data.error : ('HTTP ' + r.status)));
        btn.disabled = false;
      }
    }).catch(function (e) {
      dissectSetState('启动失败：' + (e && e.message ? e.message : String(e)));
      btn.disabled = false;
    });
  });
  $('visionProbeBtn').addEventListener('click', function () {
    saveKeys();
    dissectSetState('正在探视觉模型…');
    fetch('/api/chat/vision-probe', {
      method: 'POST',
      headers: dissectHeaders(),
      body: JSON.stringify({
        apiKey: $('apiKey').value.trim(),
        apiBase: $('apiBase').value.trim()
      })
    }).then(function (res) { return res.json(); })
      .then(function (data) {
        dissectSetState('视觉探针：' + (data && data.note ? data.note : JSON.stringify(data)));
        dissectSetResult(JSON.stringify(data, null, 2));
      })
      .catch(function (e) {
        dissectSetState('探针失败：' + (e && e.message ? e.message : String(e)));
      });
  });
  applyLayout();
})();
</script>
</body>
</html>`;
