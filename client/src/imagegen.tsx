// ---------------------------------------------------------------------------
// 生图悬浮窗（v3.58）：全站共用的一套「图片模型管理」面板，不为每个
// 入口各写一套。三个入口打开的是同一个面板、同一套字段、同一种
// 保存逻辑：
//   ① 顶部常驻「生图」按钮；
//   ② 储存库人物卡上的「生成图」；
//   ③ 剧本人物卡缺图时的「生成图」。
// 后两处打开时把所选人物带进来（target），面板自动按该人物拼提示词。
//
// 规则：
//   - 只从入口手动打开，绝不自动弹；可关闭、可最小化；位置在右侧，
//     手机端打开时先最小化成一条小条，点「展开」才铺开，不遮主窗口。
//   - 调用默认走已连接的 custom.geeknow 凭证（服务端特权层）；点
//     「生成图片」才调用，打开面板、改设置不花钱；费用按实际生效
//     的那份接口设置对应的账户计费，面板不编造单价。
//   - v5.70 生图接口总设置：全站唯一一份「生图接口总设置」（API
//     地址 + 密钥），生图面板与封面生成共用、只存本机 localStorage
//     （见 imageapi.ts）；封面页单次输入优先于总设置，总设置没填
//     才回落已连接凭证；Key 永不明文、不进数据库 / 备份 / 记录 /
//     日志，v3.83 服务端护栏原样保留。v5.88 起唯一的编辑入口搬到
//     左下角悬浮「设置」（settingsfloat.tsx），本面板只读解析结果
//     提交 / 续查、顶部只留一行当前生效来源。
//   - 生成走 v3.60 异步路径：先提交拿任务号（几秒返回），再用短
//     调用轮询任务状态直到出图。同步等图会被守护进程 30 秒上限
//     掐断（v3.58 的失败根因，与 Key 无关）；提交绝不自动重试，
//     避免重复提交重复计费。
//   - v3.61 记录 + 并行：提交成功立刻落一条生图记录（服务端数
//     据库，刷新 / 重开 / 切项目都在，记录不含任何凭证）；每个
//     任务独立轮询、独立预览、独立保存，互不阻塞，一个失败不
//     取消其他；关面板不取消已提交任务，重开逐条续查；失败记
//     录先续查同一任务号，用户二次确认才重新提交新任务并明示。
//     从人物卡打开时提示词按剧本设定合并拼好（资产预设定长相
//     穿搭 + 剧本备注定年龄气质时空，冲突标出，空缺标待核对）。
//   - 生成后先预览，用户确认才保存：可下载、可存到所选储存库资产
//     卡、可设为所选剧本人物图；不确认就不写任何卡。
//   - v4.04 记录修复：listImageGenRecords 曾被一条暂存图已失效的旧
//     记录拖垮整表（getUrl 对不存在的 key 抛错），面板把失败当空
//     列表，用户看到「提交了却没有任何记录、回传图也不在记录
//     里」。服务端取址改容错（缺图返回 null 不抛错）后列表恢复；
//     面板侧查询失败显示报错 + 重试，不再伪装空状态；记录按项目
//     隔离查询（本项目 + 未挂项目），提交成功立刻记「生成中」。
//   - v3.80 人物画风 + AI 优化：提示词上方有「人物画风」下拉（默认
//     超写实CG——真实肌理与真实皮肤纹理），画风句自动拼进中英文
//     提示词；「AI 一键优化细节提示词」在基础信息填完后把提示词
//     补成细节版（服务端 optimizeImagePrompt 只推理改词：已有设
//     定不改、待核对不编造），结果落回提示词框、可撤销优化。优化
//     不是生图提交，绝不触发上面的生图禁令口径之外的新任务。
//   - v4.20 记录预览 / 下载修复：旧版「预览出图」是新标签页直链
//     blob 地址，打开只剩 about:blank 空白页；「下载」是跨源直链
//     <a download>（download 属性对跨源不生效、无忙态无结果反馈，
//     点了没反应、不知道下没下）。预览改面板内弹窗大图（与封面页
//     同款弹层，图用记录已正常显示的同一地址渲染）；下载改走全站
//     共用的 downloadOriginalImage（取回原图字节 → 本地 Blob 触发
//     一次下载），带「下载中…」忙态防重复点，成功 / 失败都写进
//     记录消息（文件名 + 大小 / 真实原因）。全站已无其他新标签页
//     图片直链（封面页、人物卡早已是同款弹层 + 同一下载通道）。
//   - v5.61 参考图管子修复（用户报障「上传参考图生成，人物相貌完全
//     换了一个人、参考图没用上」，诊断 inspection 991b0cd8 结论
//     probable）：①未勾图床同意时不再静默降级——点「生成图片」先
//     弹三选确认（勾上同意并继续 / 不带参考图继续 / 取消），用户
//     亲手选完才提交；②带参考图实际发送时，提交的提示词末尾自动
//     追加「锁脸句」（中英文各一份、已含同类句不重复加，见
//     withFaceLock）；③生图记录落参考图溯源（migration 0040：
//     ref_image_count / ref_sent / ref_source / ref_host_hashes，
//     托管链接只存 SHA-256 哈希不存链接本身，与封面 v5.16 同
//     口径），记录里能查这次带没带图、带了几张、什么来源，旧记
//     录显示「无溯源记录（旧版本）」；④从人物卡 / 分镜以人物目
//     标打开面板时，自动把该人物当前资产图（人物卡图，缺时取关
//     联资产卡主图；资产卡目标取卡主图）带进参考素材并标注，可
//     一键清除。面部匹配度滑杆本版不做（用户定：先修管子）。
//   - v5.62 记录保存合并 + 造型直写（用户 2026-11-09 21:13 定）：
//     presetId 与 characterId 都在的人物记录上，「存到资产卡」与
//     「设为人物图」两个按钮合并成一个「存到资产卡「X」并设为人
//     物图」，点一次顺序做两步（先存卡、再设人物图，不包服务端
//     事务，第一步成第二步败时如实分开报、已成那步不重做）；只
//     剩其一时保留原单个按钮，场景记录的「设为场景图」不动。存
//     进卡的新图造型改直写：普通记录取 prompt_zh 剥掉画风句 /
//     三视图排版句 / 锁脸句后的正文直接写进新图的 look（见
//     lookFromPromptZh），不进待确认、不跑 AI 分析，提示区明说
//     「造型已按生图提示词写进这张图」；改图记录（【改图】开头）
//     与剥完为空时沿用 v5.56 旧路（AI 分析进待确认）。点完只在
//     记录提示区报结果，不跳转、不自动打开卡详情（用户选 2.b）。
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fileToBase64 } from "./sdk-local";
import { api, type ApiResponse } from "./api";
import {
callWithGatewayRetry,
describeThrownError,
isGatewayTimeoutError,
isGatewayTimeoutText,
retryReadQuery,
withReadTimeout,
} from "./gateway";
import { PreviewImg } from "./previewimg";
import {
loadImageApiSettings,
resolveImageApiConfig,
IMAGE_API_SETTINGS_EVENT,
type ImageApiSettings,
} from "./imageapi";
import { sha256Hex } from "./sha256";
import { runPresetImageLookCore } from "./presetimagelook";
import {
dataRefToSubmitReference,
downloadOriginalImage,
formatByteSize,
urlToBase64,
} from "./scriptlib";
import {
GEEKNOW_PROMPT_HARD_LIMIT,
SUBMIT_PROMPT_BUDGET,
} from "../../server/src/coverstyles";

export type ImageGenTarget =
  | { kind: "preset"; presetId: number; name: string }
  // v4.26 改图入口：储存库卡面「改图」按钮带入——以该卡当前主图为
  // 参照图，用户只写要改的部位，面板按改图模板拼词提交；记录带
  // EDIT_RECORD_MARKER 标记，卡片展开详情里按标记列改图历史。
  | { kind: "editPreset"; presetId: number; name: string }
  | { kind: "character"; characterId: number; projectId: number; name: string }
  // v4.15 场景资产卡入口：提示词随 target 带入（场景词已由服务端拼
  // 好画风 + 空镜排版句，面板不叠三视图、不叠人物画风句）。
  | {
      kind: "scene";
      sceneAssetId: number;
      projectId: number;
      name: string;
      promptZh: string;
      promptEn: string;
    };

// v4.26 改图记录标记：改图提交的提示词以此开头落进生图记录，
// 储存库卡片「展开详情」按它筛出本卡的改图历史（原图不替换，
// 改图只是追加新图 + 一条历史记录）。
export const EDIT_RECORD_MARKER = "【改图】";

// 改图要求里的一键短语：点一下往要求框里接一句，用户补完后半句。
const EDIT_QUICK_PHRASES = [
  "把帽子换成 ",
  "发型改成 ",
  "发色改成 ",
  "上衣换成 ",
  "下装换成 ",
  "鞋子换成 ",
  "加上配饰：",
];

type Preset = ApiResponse<typeof api, "listAssetPresets">["presets"][number];
type ProjectDetail = NonNullable<
  ApiResponse<typeof api, "getProject">["project"]
>;
type Character = ProjectDetail["characters"][number];
type SceneAsset = ProjectDetail["sceneAssets"][number];

// 面板打开总线：任意入口调 openImageGenPanel 即可打开同 一个面板；
// host 在 App 里挂一份，监听这个总线。
let openListener: ((t: ImageGenTarget | null) => void) | null = null;
export function openImageGenPanel(target: ImageGenTarget | null = null) {
  openListener?.(target);
}

const PRESET_MODELS = [
  "gpt-image-2",
  "gpt-image-2-pro",
  "gpt-image-2.5-flare",
  "gpt-image-2.5-sunburst",
];

const RATIO_OPTIONS: { value: string; label: string }[] = [
  { value: "16:9", label: "16:9(4K)" },
  { value: "3:4", label: "3:4" },
  { value: "1:1", label: "1:1" },
  { value: "9:16", label: "9:16" },
  { value: "4:3", label: "4:3" },
];

const THREE_VIEW_TEXT =
  "人物三视图排版：16:9 一张图，左 70% 为三个无头全身（正面、侧面、背面，均裁到脖子），右 30% 上为头部侧面特写、下为头部正面特写，五格同一个人、同套衣服、同个发型；纯色浅色背景，无文字，无水印";

const RECORD_STATUS_LABEL: Record<string, string> = {
  submitted: "已提交",
  generating: "生成中",
  done: "已出图",
  failed: "失败",
  expired: "失败（任务号已失效）",
};

function withThreeView(text: string, on: boolean): string {
  const base = text
    .replace(new RegExp(`[；;]?\\s*${THREE_VIEW_TEXT}`), "")
    .trim()
    .replace(/[；;]+$/, "");
  if (!on) return base;
  return base ? `${base}；${THREE_VIEW_TEXT}` : THREE_VIEW_TEXT;
}

// ---------------------------------------------------------------------------
// v3.80 人物画风：用户生成的人物资产图基本都是超写实 CG，所以默认就是
// 「超写实CG」——真实肌理、真实皮肤纹理（毛孔 / 汗毛 / 皮脂光泽 /
// 次表面散射），不是磨皮塑料感。选画风 = 把对应画风句拼进中英文
// 提示词尾部（在三视图排版说明之前）；换画风先剥掉旧画风句再拼新的，
// 不会叠加两段互相打架的画风。选「不追加画风」则只剥不拼。
// ---------------------------------------------------------------------------

export const ART_STYLE_OPTIONS: {
  id: string;
  label: string;
  zh: string;
  en: string;
  hint: string;
}[] = [
  {
    id: "ultra_realistic_cg",
    label: "超写实CG（默认）",
    zh: "超写实CG风格，真实肌理与真实皮肤纹理，可见细腻毛孔、细微汗毛与自然皮脂光泽，次表面散射，拒绝磨皮与塑料感，电影级CG渲染，面部、发丝与服装材质细节拉满，8K超高清",
    en: "ultra-realistic CG style, true skin texture with fine visible pores, subtle peach fuzz and natural skin sheen, subsurface scattering, no skin smoothing, no plastic look, cinematic CG rendering, highly detailed face, hair strands and fabric materials, 8K ultra-detailed",
    hint: "你平时生人物资产图的画风：超写实 CG，肌理和皮肤纹理都要真实。",
  },
  {
    id: "photorealistic",
    label: "真人摄影写实",
    zh: "真人摄影写实风格，真实相机拍摄感，真实皮肤纹理与毛孔，自然光影与真实景深，无磨皮，无塑料感",
    en: "photorealistic live-action photography, real camera look, true skin texture and pores, natural lighting and depth of field, no skin smoothing, no plastic look",
    hint: "像真人照片而不是 CG 渲染时选这个。",
  },
  {
    id: "cg_3d_guoman",
    label: "3D国漫CG",
    zh: "3D国漫CG风格，精致人物建模，细腻皮肤质感与发丝，柔和电影级光影，国漫审美",
    en: "3D Chinese animation CG style, refined character modeling, delicate skin shading and hair, soft cinematic lighting",
    hint: "国漫剧常用的 3D CG 观感。",
  },
  {
    id: "anime_2d",
    label: "日系动漫",
    zh: "日系动漫风格，干净线条，赛璐璐上色，明快色彩，精致五官",
    en: "Japanese anime style, clean line art, cel shading, vibrant colors, delicate facial features",
    hint: "二维动漫画风，不写真实皮肤纹理。",
  },
  {
    id: "guofeng",
    label: "国风工笔",
    zh: "国风工笔风格，细腻工笔线条，淡雅设色，东方审美，宣纸质感",
    en: "Chinese gongbi painting style, fine meticulous linework, elegant light colors, oriental aesthetics, rice-paper texture",
    hint: "古风人物、工笔画质感时选。",
  },
  {
    id: "film_photo",
    label: "复古胶片摄影",
    zh: "复古胶片摄影风格，真实皮肤质感，胶片颗粒，柔和复古色调，自然光",
    en: "vintage film photography style, true skin texture, film grain, soft retro color grading, natural light",
    hint: "胶片感写实照片。",
  },
  {
    id: "none",
    label: "不追加画风",
    zh: "",
    en: "",
    hint: "提示词里不拼任何画风句，完全按你写的来。",
  },
];

export const DEFAULT_ART_STYLE_ID = "ultra_realistic_cg";

function artStyleById(id: string) {
  return (
    ART_STYLE_OPTIONS.find((s) => s.id === id) ??
    ART_STYLE_OPTIONS[0]!
  );
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripArtStyles(text: string): string {
  let out = text;
  for (const s of ART_STYLE_OPTIONS) {
    for (const snippet of [s.zh, s.en]) {
      if (!snippet) continue;
      out = out.replace(
        new RegExp(`[；;，,]?\\s*${escapeRegExp(snippet)}`, "g"),
        "",
      );
    }
  }
  return out.trim().replace(/[；;]+$/, "").trim();
}

function withArtStyle(text: string, styleId: string, lang: "zh" | "en"): string {
  const base = stripArtStyles(text);
  if (!base) return base;
  const style = artStyleById(styleId);
  const snippet = lang === "zh" ? style.zh : style.en;
  if (!snippet) return base;
  return lang === "zh" ? `${base}；${snippet}` : `${base}; ${snippet}`;
}

function presetPromptZh(p: Preset): string {
  const parts: [string, string][] = [
    ["人物", p.personZh],
    ["发型", p.hairZh],
    ["帽子", p.hatZh],
    ["面部", p.faceZh],
    ["脖子", p.neckZh],
    ["上衣", p.topZh],
    ["手臂", p.armsZh],
    ["下装", p.bottomZh],
    ["鞋子", p.shoesZh],
    ["补充", p.extraZh],
  ];
  const segs = parts
    .filter(([, v]) => v.trim())
    .map(([label, v]) => `${label}：${v.trim()}`);
  if (segs.length > 0) return segs.join("；");
  const note = p.cardNote.trim();
  if (note) return `${p.name}：${note}`;
  const role = p.cardRole.trim();
  return role ? `${p.name}：${role}` : p.name;
}

function presetPromptEn(p: Preset): string {
  const parts: [string, string][] = [
    ["Person", p.personEn],
    ["Hair", p.hairEn],
    ["Hat", p.hatEn],
    ["Face", p.faceEn],
    ["Neck", p.neckEn],
    ["Top", p.topEn],
    ["Arms", p.armsEn],
    ["Bottom", p.bottomEn],
    ["Shoes", p.shoesEn],
    ["Extra", p.extraEn],
  ];
  const segs = parts
    .filter(([, v]) => v.trim())
    .map(([label, v]) => `${label}: ${v.trim()}`);
  return segs.join("; ");
}

// ---------------------------------------------------------------------------
// v3.61 合并拼词：从剧本人物卡打开生图时，提示词按剧本内设定自动填——
// 外貌 / 穿搭 / 细节三部分由「资产预设的中英文字段（定长相穿搭）」与
// 「剧本人物卡备注（定年龄、气质、时空归属）」合并拼出。两边在同一
// 维度上说法不一致时按分工取舍并把冲突项标给用户看；某一部分两边
// 都没写（如鱼贩备注为空、又没有资产卡字段）就留「待核对」，绝不
// 凭空编外貌穿搭、绝不套用别人物的设定。
// ---------------------------------------------------------------------------

export type PromptMergeInfo = {
  source: string;
  conflicts: string[];
  pending: string[];
};

const MERGE_AGE_RE = /(\d{1,3})\s*岁/;
const MERGE_ERA_MODERN = ["现代", "当代"];
const MERGE_ERA_PAST = ["古代", "民国", "上世纪", "90年代", "八九十年代"];

function mergeHairColor(text: string): string | null {
  const m = text.match(/(黑|棕|白|金|红|灰|蓝|紫|栗|银)色?(?:头发|发)/);
  return m ? (m[1] ?? null) : null;
}

function detectMergeConflicts(p: Preset, note: string): string[] {
  const out: string[] = [];
  const presetText = [
    p.personZh,
    p.hairZh,
    p.faceZh,
    p.extraZh,
    p.cardNote,
    p.cardRole,
  ].join(" ");
  const noteAge = note.match(MERGE_AGE_RE)?.[1];
  const presetAge = presetText.match(MERGE_AGE_RE)?.[1];
  if (noteAge && presetAge && noteAge !== presetAge) {
    out.push(
      `年龄不一致：剧本备注写 ${noteAge} 岁、资产卡写 ${presetAge} 岁（已按分工以剧本备注的年龄为准）`,
    );
  }
  const noteHair = mergeHairColor(note);
  const presetHair = mergeHairColor(p.hairZh || presetText);
  if (noteHair && presetHair && noteHair !== presetHair) {
    out.push(
      `发色不一致：剧本备注写 ${noteHair}色、资产卡写 ${presetHair}色（已按分工以资产卡的发型为准）`,
    );
  }
  const noteModern = MERGE_ERA_MODERN.some((w) => note.includes(w));
  const notePast = MERGE_ERA_PAST.some((w) => note.includes(w));
  const presetModern = MERGE_ERA_MODERN.some((w) => presetText.includes(w));
  const presetPast = MERGE_ERA_PAST.some((w) => presetText.includes(w));
  if ((noteModern && presetPast) || (notePast && presetModern)) {
    out.push(
      "时空说法不一致：剧本备注与资产卡的时代归属不同（已按分工以剧本备注的时空归属为准）",
    );
  }
  return out;
}

function mergedPrompt(
  p: Preset | null,
  c: Character | null,
): { zh: string; en: string; info: PromptMergeInfo } {
  const name = (c?.name || p?.name || "").trim();
  const note = (c?.note ?? "").trim();
  const role = (c?.role ?? "").trim();
  const noteSeg = note || role;
  const fmt = (parts: [string, string][]) =>
    parts
      .filter(([, v]) => v.trim())
      .map(([label, v]) => `${label}：${v.trim()}`)
      .join("；");
  const look = p
    ? fmt([
        ["人物", p.personZh],
        ["发型", p.hairZh],
        ["面部", p.faceZh],
      ])
    : "";
  const outfit = p
    ? fmt([
        ["帽子", p.hatZh],
        ["上衣", p.topZh],
        ["手臂", p.armsZh],
        ["下装", p.bottomZh],
        ["鞋子", p.shoesZh],
      ])
    : "";
  const detailPreset = p
    ? fmt([
        ["脖子", p.neckZh],
        ["补充", p.extraZh],
      ])
    : "";
  const pending: string[] = [];
  if (!look) pending.push("外貌");
  if (!outfit) pending.push("穿搭");
  if (!detailPreset && !noteSeg) pending.push("细节");
  const segs: string[] = [];
  if (name) segs.push(name);
  segs.push(`外貌（以资产卡为准）：${look || "待核对"}`);
  segs.push(`穿搭（以资产卡为准）：${outfit || "待核对"}`);
  const detailSegs = [
    detailPreset,
    noteSeg
      ? `年龄、气质与时空归属（以剧本备注为准）：${noteSeg}`
      : "",
  ]
    .filter(Boolean)
    .join("；");
  segs.push(`细节：${detailSegs || "待核对"}`);
  let en = p ? presetPromptEn(p) : "";
  if (en && noteSeg) {
    en = `${en}; Script setting (age, temperament and era follow the script character note): ${noteSeg}`;
  }
  const conflicts = p && note ? detectMergeConflicts(p, note) : [];
  const sourceBits: string[] = [];
  if (p) sourceBits.push(`资产卡「${p.name}」的中英文字段定长相穿搭`);
  if (c && noteSeg)
    sourceBits.push(`剧本人物「${c.name || "未命名人物"}」的备注定年龄、气质、时空`);
  if (!p && c)
    sourceBits.push("没有关联资产卡，外貌穿搭没有来源字段、只带剧本备注");
  return {
    zh: segs.join("；"),
    en,
    info: {
      source: sourceBits.join("；") || "手动填写",
      conflicts,
      pending,
    },
  };
}

type RefImage = {
  dataBase64: string;
  mimeType: string;
  preview: string;
  label: string;
  // v5.61 来源标记（溯源 ref_source 的依据）：auto = 从人物卡 / 资产
  // 卡打开面板时自动带入的主图；manual = 用户在面板里手动上传或
  // 「从储存库选图」加入。旧草稿里没有这个字段，按 manual 算。
  origin?: "auto" | "manual";
};

// ---------------------------------------------------------------------------
// v5.61 锁脸句：带参考图实际提交时，在最终提示词（英文优先、否则
// 中文，与提交口径一致）末尾追加一句——要求模型保持参考图里同一
// 个人的脸、只许改服装 / 发型 / 姿势 / 场景。只追加、不覆盖用户已
// 写的词；用户词里已有同类句（锁脸 / 同一个人 / same person 等）
// 就不重复加，同一次提交最多出现一次。
// ---------------------------------------------------------------------------

export const FACE_LOCK_ZH =
  "【锁脸要求】画面人物必须与参考图是同一个人：严格按参考图保持同一张脸与五官长相，不要换成另一个人；只按提示词改变服装、发型、姿势与场景。";
export const FACE_LOCK_EN =
  "[Face lock] The person must be the same person as in the reference image: keep the exact same face and facial features from the reference image, do not turn them into a different person; only change clothing, hairstyle, pose and scene as the prompt describes.";

function promptHasFaceLock(text: string): boolean {
  const t = text.toLowerCase();
  return (
    text.includes("锁脸") ||
    (text.includes("参考图") && text.includes("同一个人")) ||
    t.includes("face lock") ||
    (t.includes("reference image") && t.includes("same person"))
  );
}

function withFaceLock(zh: string, en: string): { zh: string; en: string } {
  if (en.trim()) {
    if (promptHasFaceLock(en)) return { zh, en };
    return { zh, en: `${en.replace(/[;；\s]+$/, "")}; ${FACE_LOCK_EN}` };
  }
  if (zh.trim()) {
    if (promptHasFaceLock(zh)) return { zh, en };
    return { zh: `${zh.replace(/[;；\s]+$/, "")}；${FACE_LOCK_ZH}`, en };
  }
  return { zh, en };
}

// ---------------------------------------------------------------------------
// v5.62 造型从生图提示词直接摘（用户选 1.b）：普通人物记录存进资产
// 卡时，新图的造型不再等 AI 分析进待确认，直接取记录 prompt_zh
// 剥掉三类非造型句后的正文——① 画风句（stripArtStyles，与换画风
// 同一剥离口径，含全部画风的中英文句）；② 三视图排版句
// （withThreeView(t, false)，与拼词同一常量）；③ v5.61 锁脸句
// （FACE_LOCK_ZH / FACE_LOCK_EN 原文，提交时追加的指令句，不是
// 造型）。剥完为空 = 提示词里没有造型描述，调用方回落 v5.56 旧路
// （AI 分析进待确认），绝不写空造型。改图记录（【改图】开头）的
// 提示词是改图指令、不走这里，调用方先行排除。
// ---------------------------------------------------------------------------

function lookFromPromptZh(promptZh: string): string {
  let t = stripArtStyles(promptZh);
  t = withThreeView(t, false);
  t = t.replace(
    new RegExp(`[；;]?\\s*${escapeRegExp(FACE_LOCK_ZH)}`, "g"),
    "",
  );
  t = t.replace(
    new RegExp(`[;；]?\\s*${escapeRegExp(FACE_LOCK_EN)}`, "g"),
    "",
  );
  return t
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[；;，,、\s]+/, "")
    .replace(/[；;，,\s]+$/, "")
    .trim();
}

// 面板草稿（v3.60）：失败、超时、中断、刷新都不丢现场——已选人物、
// 中英文提示词、三视图勾选、模型 / 质量 / 比例 / 超时 / 重试、参考
// 图，以及未完成的任务号与已生成的预览，都存本机 localStorage。
// 参考图带 base64 可能超本机配额：存不下时退一步只存其余字段，
// 参考图仍留在当前打开的面板内存里，不因存草稿失败丢图。
const DRAFT_KEY = "imagegen.panelDraft.v1";

type PanelDraft = {
  modelFamily: string;
  model: string;
  quality: "max" | "high" | "standard";
  ratio: string;
  reqTimeout: number;
  dlTimeout: number;
  retries: number;
  node: string;
  selection: string;
  promptZh: string;
  promptEn: string;
  artStyle: string;
  threeView: boolean;
  refs: RefImage[];
  taskId: string | null;
  result: { stagedKey: string; imageUrl: string; mimeType: string } | null;
};

function loadDraft(): PanelDraft | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<PanelDraft>;
    if (typeof d !== "object" || d === null) return null;
    return {
      modelFamily: typeof d.modelFamily === "string" ? d.modelFamily : "Omni Image2",
      model: typeof d.model === "string" && d.model ? d.model : "gpt-image-2.5-flare",
      quality: d.quality === "high" || d.quality === "standard" ? d.quality : "max",
      ratio: typeof d.ratio === "string" && d.ratio ? d.ratio : "16:9",
      reqTimeout: typeof d.reqTimeout === "number" ? d.reqTimeout : 60,
      dlTimeout: typeof d.dlTimeout === "number" ? d.dlTimeout : 60,
      retries: typeof d.retries === "number" ? d.retries : 5,
      node: typeof d.node === "string" && d.node ? d.node : "主节点",
      selection: typeof d.selection === "string" ? d.selection : "",
      promptZh: typeof d.promptZh === "string" ? d.promptZh : "",
      promptEn: typeof d.promptEn === "string" ? d.promptEn : "",
      artStyle:
        typeof d.artStyle === "string" &&
        ART_STYLE_OPTIONS.some((s) => s.id === d.artStyle)
          ? d.artStyle
          : DEFAULT_ART_STYLE_ID,
      threeView: d.threeView !== false,
      refs: Array.isArray(d.refs) ? d.refs.slice(0, 16) : [],
      taskId: typeof d.taskId === "string" && d.taskId ? d.taskId : null,
      result:
        d.result && typeof d.result.stagedKey === "string"
          ? d.result
          : null,
    };
  } catch {
    return null;
  }
}

function saveDraft(d: PanelDraft) {
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch {
    try {
      window.localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ ...d, refs: [] }),
      );
    } catch {
      // 本机存不下就放弃持久化，面板内存里的状态不受影响。
    }
  }
}

const POLL_INTERVAL_MS = 4000;
const MAX_POLLS = 150; // 约 10 分钟；到顶停下但保留任务号，可继续查
const MAX_POLL_ERRORS = 5; // 连续查询失败到这个数才停下，同样保留任务号

export function ImageGenPanelHost({
  activeProjectId,
}: {
  activeProjectId: number | null;
}) {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [target, setTarget] = useState<ImageGenTarget | null>(null);
  const [openNonce, setOpenNonce] = useState(0);
  useEffect(() => {
    openListener = (t) => {
      setTarget(t);
      setOpen(true);
      // 手机端自动收起：先出最小化小条，点「展开」才铺开面板。
      setMinimized(
        typeof window !== "undefined" ? window.innerWidth < 640 : false,
      );
      setOpenNonce((n) => n + 1);
    };
    return () => {
      openListener = null;
    };
  }, []);
  if (!open) return null;
  return (
    <>
      {minimized && (
        <div
          className="fixed bottom-4 right-3 z-[60] flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-bold"
          style={{
            background: "var(--surface)",
            borderColor: "var(--border)",
            boxShadow: "var(--shadow-card)",
            color: "var(--text)",
          }}
          role="status"
          aria-label="生图面板已最小化"
        >
          <span>生图 · 图片模型管理</span>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            aria-label="展开生图面板"
            onClick={() => setMinimized(false)}
          >
            展开
          </button>
          <button
            type="button"
            className="btn btn-sm"
            aria-label="关闭生图面板"
            onClick={() => setOpen(false)}
          >
            关闭
          </button>
        </div>
      )}
      <div style={{ display: minimized ? "none" : undefined }}>
        <ImageGenPanel
          target={target}
          openNonce={openNonce}
          activeProjectId={activeProjectId}
          onClose={() => setOpen(false)}
          onMinimize={() => setMinimized(true)}
        />
      </div>
    </>
  );
}

function ImageGenPanel({
  target,
  openNonce,
  activeProjectId,
  onClose,
  onMinimize,
}: {
  target: ImageGenTarget | null;
  openNonce: number;
  activeProjectId: number | null;
  onClose: () => void;
  onMinimize: () => void;
}) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const presetsQuery = useQuery({
    queryKey: ["assetPresets"],
    queryFn: () => withReadTimeout(() => api.listAssetPresets({})),
    retry: retryReadQuery,
    // v3.68：与储存库共用缓存，60 秒内不整表重拉。
    staleTime: 60_000,
  });
  const presets = presetsQuery.data?.presets ?? [];
  const charsProjectId =
    target?.kind === "character" || target?.kind === "scene"
      ? target.projectId
      : activeProjectId;
  const projectQuery = useQuery({
    queryKey: ["project", charsProjectId],
    queryFn: () => withReadTimeout(() => api.getProject({ id: charsProjectId! })),
    retry: retryReadQuery,
    enabled: charsProjectId != null,
  });
  const characters = projectQuery.data?.project?.characters ?? [];
  const sceneAssets = projectQuery.data?.project?.sceneAssets ?? [];
  const modelsQuery = useQuery({
    queryKey: ["geeknowImageModels"],
    // 模型列表经服务端问 Geeknow（外部服务），超时放宽到 60 秒。
    queryFn: () => withReadTimeout(() => api.geeknowImageModels({}), 60_000),
    retry: retryReadQuery,
    staleTime: 60_000,
  });
  const fetchedModels = modelsQuery.data?.models ?? [];
  const modelOptions = Array.from(
    new Set([...PRESET_MODELS, ...fetchedModels]),
  );

  // 草稿只在面板挂载时读一次本机存档，之后所有改动实时回存。
  const [draft0] = useState<PanelDraft | null>(() =>
    typeof window !== "undefined" ? loadDraft() : null,
  );
  const [modelFamily, setModelFamily] = useState(
    draft0?.modelFamily ?? "Omni Image2",
  );
  const [model, setModel] = useState(draft0?.model ?? "gpt-image-2.5-flare");
  const [quality, setQuality] = useState<"max" | "high" | "standard">(
    draft0?.quality ?? "max",
  );
  const [ratio, setRatio] = useState<string>(draft0?.ratio ?? "16:9");
  const [reqTimeout, setReqTimeout] = useState(draft0?.reqTimeout ?? 60);
  const [dlTimeout, setDlTimeout] = useState(draft0?.dlTimeout ?? 60);
  const [retries, setRetries] = useState(draft0?.retries ?? 5);
  const [node, setNode] = useState(draft0?.node ?? "主节点");
  const [selection, setSelection] = useState(draft0?.selection ?? "");
  const [promptZh, setPromptZh] = useState(draft0?.promptZh ?? "");
  const [promptEn, setPromptEn] = useState(draft0?.promptEn ?? "");
  // v3.85 实际提交字数（与服务端同一口径：英文优先、否则中文，
  // trim 后字符数）：Geeknow 提交端点上限 4000 字符，超本台安全
  // 线 3900 就在点生成前拦下，不再发注定被「提示词过长」拒的请求。
  const submitPromptText = promptEn.trim() || promptZh.trim();
  const submitPromptLen = submitPromptText.length;
  const submitPromptOver = submitPromptLen > SUBMIT_PROMPT_BUDGET;
  const [artStyle, setArtStyle] = useState(
    draft0?.artStyle ?? DEFAULT_ART_STYLE_ID,
  );
  const [optimizing, setOptimizing] = useState(false);
  const [optimizeError, setOptimizeError] = useState<string | null>(null);
  const [optimizeMsg, setOptimizeMsg] = useState<string | null>(null);
  const [preOptimize, setPreOptimize] = useState<{
    zh: string;
    en: string;
  } | null>(null);
  const [threeView, setThreeView] = useState(draft0?.threeView ?? true);
  // v4.00 去杂乱：顶部公告条可关闭，关掉本次打开期间不再占位。
  const [promoClosed, setPromoClosed] = useState(false);
  const [refs, setRefs] = useState<RefImage[]>(draft0?.refs ?? []);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // 参考图上传（用户要求去掉同意勾选）：不再有勾选、也不再弹
  // 未同意确认——只要选了参考素材，点生成时就直接把降采样副本
  // 换 https 链接再交给 Geeknow（特权层；v5.97：先走 Geeknow 自家上传、走不通才回退公开图床）；没选参考素材时照旧按纯提示词提交。参考素材区只留一
  // 行简短说明写明这一点。
  const [refDegradeNote, setRefDegradeNote] = useState<string | null>(null);
  // v5.97：最近一次参考图换链接实际走的路线说明（Geeknow 自家上
  // 传 / 公开图床回退），提交成功后亮在生成按钮下方，让用户一眼
  // 核对这次走的是哪条路。
  const [hostRouteNote, setHostRouteNote] = useState<string | null>(null);
  // v5.70 生图接口总设置（v5.88 起唯一的编辑入口在左下角悬浮
  // 「设置」里，见 settingsfloat.tsx）：本面板只读它——地址 / Key
  // 只存本机 localStorage（imageapi.ts）；提交与续查经 imgCfgRef
  // 读解析后的生效配置（总设置优先于已连接凭证；封面页的单次输
  // 入只在封面页那边叠加、不经这里）。
  const [apiSettings, setApiSettings] = useState<ImageApiSettings>(() =>
    loadImageApiSettings(),
  );
  const imgResolved = resolveImageApiConfig(apiSettings);
  const imgCfgRef = useRef(imgResolved);
  imgCfgRef.current = imgResolved;
  // v1.1.0 软件更新（仅 exe 打包版：window.electronAPI 由主进程注入；
  // 网页版 / Muse 版没有它，入口不显示）。
  const hasElectronAPI =
    typeof window !== "undefined" &&
    typeof window.electronAPI?.checkForUpdates === "function";
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [updateChecking, setUpdateChecking] = useState(false);
  const [updateMsg, setUpdateMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!hasElectronAPI) return;
    void window.electronAPI
      ?.getAppVersion()
      .then((v) => setAppVersion(v))
      .catch(() => undefined);
  }, [hasElectronAPI]);
  const runUpdateCheck = async (): Promise<void> => {
    if (!window.electronAPI) return;
    setUpdateChecking(true);
    setUpdateMsg("正在检查更新…");
    try {
      const res = await window.electronAPI.checkForUpdates();
      if (res.status === "available") {
        setUpdateMsg(
          `发现新版本 ${res.version}，正在后台下载；下载完会提示你重启更新。`,
        );
      } else if (res.status === "up-to-date") {
        setUpdateMsg(`已是最新版本（${res.version}）。`);
      } else if (res.status === "not-packaged") {
        setUpdateMsg("当前不是安装版，无法检查更新。");
      } else {
        setUpdateMsg(`检查失败：${res.error}（可能是网络问题，稍后再试）。`);
      }
    } catch (e) {
      setUpdateMsg(
        `检查失败：${e instanceof Error ? e.message : String(e)}。`,
      );
    } finally {
      setUpdateChecking(false);
    }
  };
  // 总设置在左下角「设置」里被改（或在别的窗口被改）时即时同步。
  useEffect(() => {
    const on = () => setApiSettings(loadImageApiSettings());
    window.addEventListener(IMAGE_API_SETTINGS_EVENT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(IMAGE_API_SETTINGS_EVENT, on);
      window.removeEventListener("storage", on);
    };
  }, []);
  // v5.61 自动带入标注：从人物卡 / 分镜打开面板时自动带入的参考
  // 图说明（如「已自动带入人物参考图 1 张（人物卡 B 的图）」）；
  // 非自动带入时为 null。清除按钮只删 origin=auto 的那几张。
  const [autoRefNote, setAutoRefNote] = useState<string | null>(null);
  // v4.26 改图模式：从储存库卡面「改图」打开时置位（目标 presetId +
  // 用户写的改图要求）。改图模式下点生成走改图模板拼词（保持身份
  // 特征不变、只改点名部位），且必须带参照图才提交（带入后点生
  // 成即自动上传），不走普通生成的纯提示词降级——没带上原图的
  // 「改图」是假改图。
  const [editPresetId, setEditPresetId] = useState<number | null>(null);
  const [editRequest, setEditRequest] = useState("");
  const [mergeInfo, setMergeInfo] = useState<PromptMergeInfo | null>(null);
  const [refMsg, setRefMsg] = useState<string | null>(null);

  // v3.61 生图记录（落库持久化）：提交成功立刻建一条记录，面板按
  // 记录渲染；每个进行中的任务一条独立轮询，互不阻塞、互不取消，
  // 一个任务失败不影响其他任务。关面板只是停下本机的查询循环，
  // 服务商任务与记录都在，重开面板自动逐条续查。
  // v4.04 按项目隔离：带当前项目查（该项目记录 + 未挂项目的记录），
  // 切项目后看到的是该项目的记录，之前的记录在库里、切回去还在。
  const recordsQuery = useQuery({
    queryKey: ["imageGenRecords", charsProjectId ?? null],
    queryFn: () =>
      withReadTimeout(() =>
        api.listImageGenRecords(
          charsProjectId != null ? { projectId: charsProjectId } : {},
        ),
      ),
    retry: retryReadQuery,
  });
  const records = recordsQuery.data?.records ?? [];
  type GenRecord = (typeof records)[number];
  const [pollCounts, setPollCounts] = useState<Record<number, number>>({});
  const [recordMsg, setRecordMsg] = useState<Record<number, string>>({});
  const [expandedIds, setExpandedIds] = useState<Record<number, boolean>>({});
  const [confirmIds, setConfirmIds] = useState<Record<string, boolean>>({});
  const [savingIds, setSavingIds] = useState<Record<number, boolean>>({});
  // v4.20 预览 / 下载修复：downloadingIds 是每条记录的下载忙态（防
  // 重复点 + 按钮明示「下载中…」）；lightboxRec 是面板内弹窗大图
  // 正在看的那条记录（null = 没打开）。
  const [downloadingIds, setDownloadingIds] = useState<Record<number, boolean>>({});
  const [lightboxRec, setLightboxRec] = useState<GenRecord | null>(null);
  const pollingRef = useRef<Map<number, number>>(new Map());
  const pollGenRef = useRef(0);

  // 草稿实时回存：表单字段（人物、提示词、设置、参考图）落本机，
  // 刷新 / 关面板后重开面板能原样恢复；任务现场不在草稿里，在
  // 生图记录里（落库，跨项目、跨刷新都在）。
  useEffect(() => {
    saveDraft({
      modelFamily,
      model,
      quality,
      ratio,
      reqTimeout,
      dlTimeout,
      retries,
      node,
      selection,
      promptZh,
      promptEn,
      artStyle,
      threeView,
      refs,
      taskId: null,
      result: null,
    });
  }, [
    modelFamily,
    model,
    quality,
    ratio,
    reqTimeout,
    dlTimeout,
    retries,
    node,
    selection,
    promptZh,
    promptEn,
    artStyle,
    threeView,
    refs,
  ]);

  // 面板卸载时让本机的轮询循环收手（任务号与状态都在记录里，
  // 重开面板会逐条续查，不丢任务）。
  useEffect(() => {
    const map = pollingRef.current;
    return () => {
      map.clear();
    };
  }, []);


  const selectedPreset: Preset | null = selection.startsWith("preset:")
    ? (presets.find((p) => p.id === Number(selection.slice(7))) ?? null)
    : null;
  const selectedCharacter: Character | null = selection.startsWith(
    "character:",
  )
    ? (characters.find(
        (c) => c.id === Number(selection.slice(10)),
      ) ?? null)
    : null;
  const selectedScene: SceneAsset | null = selection.startsWith("scene:")
    ? (sceneAssets.find((s) => s.id === Number(selection.slice(6))) ?? null)
    : null;

  // v4.26 改图模式判定：改图目标仍对应当前所选资产卡时才算数；
  // 用户手动改选别人会清掉 editPresetId（见 onSelectPerson），
  // 面板随即回到普通生图模式。
  const isEditMode =
    editPresetId != null && selection === `preset:${editPresetId}`;

  // 换人 = 换一套提示词与合并说明；已提交的任务都在记录里独立
  // 跑，换人不会取消、也不会串到新人物头上。
  const clearTaskState = () => {
    setSubmitError(null);
  };

  // v5.63：单字母代号（A–R）不是身份证据——项目人物代号与储存库
  // 卡代号是两套编号，人物叫 A 与卡叫 A 毫无关系，同名兜底对单
  // 字母一律不生效（v5.62 前记录 id=11 就是这么把 B 老教授兜底
  // 到 B 卡的）。非单字母名字（如正式姓名）同名仍可兜底：那种名
  // 字两边同名通常就是同一个人，与单字母代号不是一回事。
  const isSingleLetterCode = (name: string) =>
    /^[A-Ra-r]$/.test(name.trim());

  // 剧本人物关联的资产预设：先按来源预设 id 找，再按同名兜底（服务
  // 端加载项目时已回填来源，正常情况下 id 就能命中）。v5.63 起同
  // 名兜底对单字母代号不生效（见上）。
  const linkedPresetFor = (c: Character): Preset | null =>
    (c.sourcePresetId != null
      ? presets.find((x) => x.id === c.sourcePresetId)
      : undefined) ??
    (isSingleLetterCode(c.name)
      ? null
      : (presets.find(
          (x) => x.name.trim() !== "" && x.name.trim() === c.name.trim(),
        ) ?? null));
  const linkedCharacterFor = (p: Preset): Character | null =>
    characters.find((x) => x.sourcePresetId === p.id) ??
    (isSingleLetterCode(p.name)
      ? null
      : (characters.find(
          (x) => x.name.trim() !== "" && x.name.trim() === p.name.trim(),
        ) ?? null));

  // v5.63：生图记录「存到哪张卡」的解析（单个存卡按钮与合并按钮
  // 共用，按钮文案与实际落卡都以解析结果为准，不再直接信记录里
  // 存的 presetId——那是生成那一刻按旧同名兜底算的、可能是错卡）：
  //   · 记录挂了人物（characterId）→ 以该人物现在记着的来源卡
  //     （sourcePresetId）为准；
  //   · 人物没有来源记录 → 才退到记录自存的 presetId，但有一条
  //     防线：人物是单字母代号、记录里的卡正是同字母那张时，这
  //     个 presetId 只可能来自旧同名兜底，不认（返回 null，按钮
  //     只剩「设为人物图」，不静默存错卡）；
  //   · 记录没挂人物（直接对卡生成的）→ 照旧用记录自存的。
  type PresetSaveTarget = { id: number; name: string };
  const recordPresetTarget = (rec: GenRecord): PresetSaveTarget | null => {
    if (rec.characterId != null) {
      const ch = characters.find((x) => x.id === rec.characterId);
      if (ch?.sourcePresetId != null) {
        const p = presets.find((x) => x.id === ch.sourcePresetId);
        return {
          id: ch.sourcePresetId,
          name: p?.name ?? ch.sourcePresetName ?? rec.presetName,
        };
      }
      if (rec.presetId != null) {
        const p = presets.find((x) => x.id === rec.presetId);
        if (
          ch &&
          p &&
          isSingleLetterCode(ch.name) &&
          p.name.trim() === ch.name.trim()
        ) {
          return null;
        }
        return { id: rec.presetId, name: rec.presetName };
      }
      return null;
    }
    return rec.presetId != null
      ? { id: rec.presetId, name: rec.presetName }
      : null;
  };

  // v3.94 起：人物卡上有预填的生图提示词（v4.16 起由分镜页「按分镜
  // 写资产提示词」写好、用户
  // 确认建卡时存进卡的字段）时优先用它——词里已含超写实CG画风句与
  // 三视图排版句，withArtStyle / withThreeView 剥了再拼、结果不变。
  // 返回 true 表示已用预填词，调用方不要再走合并拼词。
  const applyStoredPrompt = (c: Character, tv: boolean): boolean => {
    if (!c.imagePromptZh.trim() && !c.imagePromptEn.trim()) return false;
    if (c.imagePromptZh.trim()) {
      setPromptZh(withThreeView(withArtStyle(c.imagePromptZh, artStyle, "zh"), tv));
    }
    if (c.imagePromptEn.trim()) {
      setPromptEn(withThreeView(withArtStyle(c.imagePromptEn, artStyle, "en"), tv));
    } else if (c.imagePromptZh.trim()) {
      setPromptEn("");
    }
    setMergeInfo({
      source: `人物卡「${c.name || "未命名人物"}」预填的生图提示词（按分镜写资产提示词）`,
      conflicts: [],
      pending: [],
    });
    return true;
  };
  const applyPreset = (p: Preset, tv: boolean) => {
    clearTaskState();
    setSelection(`preset:${p.id}`);
    setPreOptimize(null);
    setOptimizeMsg(null);
    const linked = linkedCharacterFor(p);
    if (linked && applyStoredPrompt(linked, tv)) {
      return;
    }
    if (linked) {
      const m = mergedPrompt(p, linked);
      setPromptZh(withThreeView(withArtStyle(m.zh, artStyle, "zh"), tv));
      setPromptEn(
        m.en ? withThreeView(withArtStyle(m.en, artStyle, "en"), tv) : m.en,
      );
      setMergeInfo(m.info);
    } else {
      setPromptZh(
        withThreeView(withArtStyle(presetPromptZh(p), artStyle, "zh"), tv),
      );
      const en = presetPromptEn(p);
      if (en) setPromptEn(withThreeView(withArtStyle(en, artStyle, "en"), tv));
      setMergeInfo(null);
    }
  };
  const applyCharacter = (c: Character, tv: boolean) => {
    clearTaskState();
    setSelection(`character:${c.id}`);
    setPreOptimize(null);
    setOptimizeMsg(null);
    if (applyStoredPrompt(c, tv)) return;
    const m = mergedPrompt(linkedPresetFor(c), c);
    setPromptZh(withThreeView(withArtStyle(m.zh, artStyle, "zh"), tv));
    setPromptEn(
      m.en ? withThreeView(withArtStyle(m.en, artStyle, "en"), tv) : m.en,
    );
    setMergeInfo(m.info);
  };

  // v4.15 场景资产：提示词已由服务端拼好（场景本体 + 超写实CG画风
  // 句 + 16:9 广角空镜排版句），面板原样带入——不叠人物画风句、不
  // 叠三视图句；三视图强制关、比例 16:9。
  const applyScene = (s: { id: number; name: string; promptZh: string; promptEn: string }) => {
    clearTaskState();
    setSelection(`scene:${s.id}`);
    setPreOptimize(null);
    setOptimizeMsg(null);
    setPromptZh(s.promptZh);
    setPromptEn(s.promptEn);
    setThreeView(false);
    setRatio("16:9");
    setMergeInfo({
      source: `场景资产卡「${s.name}」的预填提示词（按剧本生成资产提示词）`,
      conflicts: [],
      pending: [],
    });
  };

  // v4.26 改图模式带入：选中资产卡、进入改图模式，把该卡当前主图
  // 读成参照图放进参考素材（替换掉面板里原有的参考素材，避免串
  // 图）；提示词框先清空，真正提交的词在点「开始改图」时按改图
  // 模板 + 用户写的改图要求现拼并回填到提示词框（用户看得见原样）。
  const applyEditPreset = async (p: Preset) => {
    clearTaskState();
    setSelection(`preset:${p.id}`);
    setEditPresetId(p.id);
    setEditRequest("");
    setPreOptimize(null);
    setOptimizeMsg(null);
    setPromptZh("");
    setPromptEn("");
    setMergeInfo({
      source: `改图模式：以资产卡「${p.name}」当前主图为参照图，只改你写明的部位；原图不替换，改好的图追加到卡上并留一条改图记录`,
      conflicts: [],
      pending: [],
    });
    const primary = p.images[0] ?? null;
    if (!primary) {
      setRefs([]);
      setRefMsg("这张卡现在没有图，改图没有参照图可用；先给卡加一张图再改图。");
      return;
    }
    const b = await urlToBase64(primary.url);
    if (b) {
      setRefs([
        { ...b, preview: primary.previewUrl ?? primary.url, label: `参照图·${p.name}当前主图`, origin: "auto" },
      ]);
      setAutoRefNote(null);
      setRefMsg(null);
    } else {
      setRefs([]);
      setRefMsg(
        "没读到这张卡的主图，参照图没有带入：请在参考素材区点「从储存库选图（加入本卡图片）」手动带入原图再改图。",
      );
    }
  };

  // v5.61 打开路径自动带入参考图：从人物卡「生成图片」/ 分镜「生
  // 图」以人物目标打开、或从储存库卡以资产卡目标打开时，把该人物
  // 当前的资产图带进参考素材（origin=auto）——人物卡自己的图优
  // 先，人物卡没图时取其关联资产卡的主图；资产卡目标取卡主图。
  // 已在参考素材里的同一张（同 label）不重复加；带入失败只写提
  // 示、不拦面板（用户还能手动上传）。手动上传入口照旧。
  const autoFillCharacterRef = async (input: {
    url: string;
    previewUrl: string | null;
    label: string;
    note: string;
  }) => {
    const b = await urlToBase64(input.url);
    if (!b) {
      setRefMsg(
        "人物参考图这次没能自动带入（图没读到）：可以在参考素材区手动上传，或点「从储存库选图」带入。",
      );
      return;
    }
    setRefs((prev) => {
      if (prev.some((r) => r.label === input.label)) return prev;
      return [
        ...prev,
        {
          ...b,
          preview: input.previewUrl ?? input.url,
          label: input.label,
          origin: "auto" as const,
        },
      ].slice(0, 16);
    });
    setAutoRefNote(input.note);
  };

  // 换画风：当前提示词先剥掉旧画风句与三视图句，拼上新画风句后，
  // 三视图勾选着就把三视图句接回结尾；空提示词只记选择、不造词。
  const changeArtStyle = (styleId: string) => {
    setArtStyle(styleId);
    setOptimizeMsg(null);
    const restyle = (text: string, lang: "zh" | "en") => {
      if (!text.trim()) return text;
      let base = text
        .replace(new RegExp(`[；;]?\\s*${THREE_VIEW_TEXT}`), "")
        .trim()
        .replace(/[；;]+$/, "");
      base = withArtStyle(base, styleId, lang);
      return threeView ? withThreeView(base, true) : base;
    };
    setPromptZh((t) => restyle(t, "zh"));
    setPromptEn((t) => restyle(t, "en"));
  };

  // v3.80 AI 一键优化：只改提示词文字（走服务端推理），不提交任何
  // 生图任务、不产生 Geeknow 生图费用；优化前原文留一份快照，
  // 不满意可一键撤销回到优化前。
  const runOptimizePrompt = async () => {
    if (optimizing) return;
    if (!promptZh.trim() && !promptEn.trim()) {
      setOptimizeError(
        "先选一个人物自动拼好提示词、或自己填一点基础提示词，再点 AI 优化",
      );
      return;
    }
    setOptimizing(true);
    setOptimizeError(null);
    setOptimizeMsg(null);
    try {
      const style = artStyleById(artStyle);
      // v3.98 可靠性加固：提示词优化此前是裸调用，网关超时直接失
      // 败。现在走同一套网关超时自动重试一次（只改文字、不提交
      // 生图，重试安全）；仍失败在下面按真实原因报。
      const res = await callWithGatewayRetry(() =>
        api.optimizeImagePrompt({
          promptZh,
          promptEn,
          artStyleLabel: style.label,
          artStyleZh: style.zh,
          artStyleEn: style.en,
          personName:
            selectedPreset?.name || selectedCharacter?.name || "",
          threeView,
        }),
      );
      if (!res.ok) {
        setOptimizeError(
          isGatewayTimeoutText(res.error)
            ? "网关超时（可重试）：优化调用超时，自动重试 1 次仍未成功。原提示词没动，等十几秒再点一次。"
            : (res.error ?? "优化失败，原提示词没动，请再点一次"),
        );
        return;
      }
      setPreOptimize({ zh: promptZh, en: promptEn });
      if (res.optimizedZh) setPromptZh(res.optimizedZh);
      if (res.optimizedEn) setPromptEn(res.optimizedEn);
      setOptimizeMsg(
        `已按「${style.label}」优化：面部、皮肤肌理、发丝、服装材质、光影与画质细节都补上了，已有的人物设定没动。优化结果就在下面两个提示词框里，可直接改；不满意点「撤销优化」回到优化前。`,
      );
    } catch (e) {
      setOptimizeError(
        isGatewayTimeoutError(e)
          ? "优化时网关超时：这次有没有优化成功还不确定，原提示词没动，等十几秒再点一次。"
          : `优化失败：${describeThrownError(e)}，原提示词没动，请再点一次`,
      );
    } finally {
      setOptimizing(false);
    }
  };

  const undoOptimize = () => {
    if (!preOptimize) return;
    setPromptZh(preOptimize.zh);
    setPromptEn(preOptimize.en);
    setPreOptimize(null);
    setOptimizeMsg("已撤销优化，提示词回到优化前的版本。");
  };

  // 从卡片入口打开时把人物带进来：等对应数据到齐后自动选中并拼
  // 提示词（只在本次打开的 nonce 里应用一次，用户之后可改选别人）。
  // 点开即用口径（v3.61）：从卡上打开一律回到默认生成设置——模型
  // gpt-image-2.5-flare、质量 max、比例 16:9、三视图勾选——提示词
  // 按剧本内设定合并拼好（见 mergedPrompt）。
  const appliedNonceRef = useRef(0);
  useEffect(() => {
    if (!target || appliedNonceRef.current === openNonce) return;
    if (target.kind === "preset") {
      const p = presets.find((x) => x.id === target.presetId);
      if (!p) return;
      appliedNonceRef.current = openNonce;
      setEditPresetId(null);
      setModel("gpt-image-2.5-flare");
      setQuality("max");
      setRatio("16:9");
      setThreeView(true);
      applyPreset(p, true);
      // v5.61：资产卡目标打开时自动带入卡主图作参考图。
      const primary = p.images[0] ?? null;
      if (primary) {
        void autoFillCharacterRef({
          url: primary.url,
          previewUrl: primary.previewUrl ?? null,
          label: `人物参考图·${p.name}主图`,
          note: `已自动带入人物参考图 1 张（资产卡「${p.name}」的主图）`,
        });
      }
    } else if (target.kind === "editPreset") {
      const p = presets.find((x) => x.id === target.presetId);
      if (!p) return;
      appliedNonceRef.current = openNonce;
      setModel("gpt-image-2.5-flare");
      setQuality("max");
      setRatio("16:9");
      // 改图要保住原图的构图与三视图排版：不叠三视图句、比例跟原图。
      setThreeView(false);
      void applyEditPreset(p);
    } else if (target.kind === "scene") {
      // 场景卡数据可能还没加载完：提示词随 target 带入，不等查询。
      appliedNonceRef.current = openNonce;
      setEditPresetId(null);
      setModel("gpt-image-2.5-flare");
      setQuality("max");
      applyScene({
        id: target.sceneAssetId,
        name: target.name,
        promptZh: target.promptZh,
        promptEn: target.promptEn,
      });
    } else {
      const c = characters.find((x) => x.id === target.characterId);
      if (!c) return;
      appliedNonceRef.current = openNonce;
      setEditPresetId(null);
      setModel("gpt-image-2.5-flare");
      setQuality("max");
      setRatio("16:9");
      setThreeView(true);
      applyCharacter(c, true);
      // v5.61：人物目标打开时自动带入该人物当前资产图——人物卡
      // 自己的图优先；卡上没图时取关联资产卡的主图。
      if (c.imageUrl) {
        void autoFillCharacterRef({
          url: c.imageUrl,
          previewUrl: c.imagePreviewUrl ?? null,
          label: `人物参考图·${c.name || "未命名人物"}`,
          note: `已自动带入人物参考图 1 张（人物卡「${c.name || "未命名人物"}」的图）`,
        });
      } else {
        const linked = linkedPresetFor(c);
        const primary = linked?.images[0] ?? null;
        if (linked && primary) {
          void autoFillCharacterRef({
            url: primary.url,
            previewUrl: primary.previewUrl ?? null,
            label: `人物参考图·${linked.name}主图`,
            note: `已自动带入人物参考图 1 张（关联资产卡「${linked.name}」的主图）`,
          });
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, openNonce, presets, characters]);

  const toggleThreeView = (on: boolean) => {
    setThreeView(on);
    setPromptZh((t) => withThreeView(t, on));
    setPromptEn((t) => (t.trim() ? withThreeView(t, on) : t));
    if (on) setRatio("16:9");
  };

  const onSelectPerson = (value: string) => {
    // 手动改选人物即退出改图模式（改图只对从卡面「改图」带入的那张卡）。
    setEditPresetId(null);
    if (value.startsWith("preset:")) {
      const p = presets.find((x) => x.id === Number(value.slice(7)));
      if (p) applyPreset(p, threeView);
      else {
        clearTaskState();
        setSelection(value);
      }
    } else if (value.startsWith("character:")) {
      const c = characters.find((x) => x.id === Number(value.slice(10)));
      if (c) applyCharacter(c, threeView);
      else {
        clearTaskState();
        setSelection(value);
      }
    } else if (value.startsWith("scene:")) {
      const s = sceneAssets.find((x) => x.id === Number(value.slice(6)));
      if (s) applyScene(s);
      else {
        clearTaskState();
        setSelection(value);
      }
    } else {
      clearTaskState();
      setSelection(value);
      setMergeInfo(null);
    }
  };

  const addRefFiles = (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (images.length === 0) {
      setRefMsg("只接受图片文件");
      return;
    }
    void (async () => {
      const room = 16 - refs.length;
      if (room <= 0) {
        setRefMsg("参考素材最多 16 张，先删掉几张再加");
        return;
      }
      const added: RefImage[] = [];
      for (const f of images.slice(0, room)) {
        const img = await fileToBase64(f);
        added.push({
          ...img,
          preview: `data:${img.mimeType};base64,${img.dataBase64}`,
          label: f.name,
          origin: "manual",
        });
      }
      setRefs((prev) => [...prev, ...added].slice(0, 16));
      setRefMsg(
        images.length > room
          ? `参考素材上限 16 张，只加入了前 ${room} 张`
          : null,
      );
    })();
  };

  const addPresetRefs = () => {
    const p = selectedPreset;
    if (!p) return;
    void (async () => {
      let room = 16 - refs.length;
      if (room <= 0) {
        setRefMsg("参考素材最多 16 张，先删掉几张再加");
        return;
      }
      const added: RefImage[] = [];
      for (const im of p.images) {
        if (room <= 0) break;
        const b = await urlToBase64(im.url);
        if (b) {
          added.push({ ...b, preview: im.previewUrl ?? im.url, label: im.fileName || p.name, origin: "manual" });
          room -= 1;
        }
      }
      if (added.length > 0) {
        setRefs((prev) => [...prev, ...added].slice(0, 16));
        setRefMsg(null);
      } else {
        setRefMsg("没读到这张卡上的图，请重试");
      }
    })();
  };

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => window.setTimeout(resolve, ms));

  // ------------------------------------------------------------------
  // v3.61 多任务并行：每个任务一条独立轮询，只查自己记录的任务号，
  // 出图 / 失败 / 失效都回写自己那条记录；一个任务失败或停查不
  // 影响其他任务，面板不锁死，可继续换人提交下一个任务。
  // ------------------------------------------------------------------
  const setRecMsg = (id: number, msg: string) =>
    setRecordMsg((prev) => ({ ...prev, [id]: msg }));
  const invalidateRecords = () =>
    queryClient.invalidateQueries({ queryKey: ["imageGenRecords"] });

  // v4.20 无损下载出图（与封面页 / 人物卡同一套 downloadOriginalImage）：
  // 旧版是 <a href={原图地址} download> 直链——blob 地址是跨源地址，
  // download 属性对跨源链接不生效，浏览器只会整页跳转 / 新开标签，
  // 且原图是 4K 大图、直链没有任何进度与结果反馈，用户点了没反应、
  // 不知道下没下。改走取回原图字节 → 本地 Blob 触发一次下载：点下
  // 立刻进「下载中…」忙态并禁用防重复点，取字节这段（慢的主要来源）
  // 明确写在记录消息里，成功写清文件名与大小，失败写真实原因。
  const downloadRecord = async (rec: GenRecord) => {
    if (!rec.imageUrl || downloadingIds[rec.id]) return;
    setDownloadingIds((prev) => ({ ...prev, [rec.id]: true }));
    setRecMsg(rec.id, "正在取回原图字节，图大时要等几秒，取回后浏览器会自动保存…");
    try {
      const r = await downloadOriginalImage(
        rec.imageUrl,
        `${rec.personName || "生成图"}的出图`,
      );
      setRecMsg(
        rec.id,
        `已下载原图：${r.filename}（${formatByteSize(r.sizeBytes)}，原图字节原样保存，未压缩、未转格式）。若浏览器没弹出保存，是被浏览器拦下了下载，请允许本站点下载后重试。`,
      );
    } catch (e) {
      setRecMsg(
        rec.id,
        `下载失败：${e instanceof Error ? e.message : "请重试"}（原图还在记录里，没有改动）`,
      );
    } finally {
      setDownloadingIds((prev) => ({ ...prev, [rec.id]: false }));
    }
  };

  const pollRecord = async (rec: GenRecord) => {
    const tid = rec.taskId;
    if (!tid) return;
    if (pollingRef.current.has(rec.id)) return;
    const token = ++pollGenRef.current;
    pollingRef.current.set(rec.id, token);
    const alive = () => pollingRef.current.get(rec.id) === token;
    let markedGenerating = rec.status !== "submitted";
    let errors = 0;
    let n = 0;
    try {
      while (n < MAX_POLLS) {
        if (!alive()) return;
        n += 1;
        setPollCounts((prev) => ({ ...prev, [rec.id]: n }));
        let res: Awaited<ReturnType<typeof api.pollGeeknowImageTask>> | null =
          null;
        try {
          // v5.70：续查带当前总设置（用总设置 Key 提交的任务要带同
          // 一份才查得到）；总设置没填时即已连接凭证，与旧口径同。
          const cfg = imgCfgRef.current;
          res = await api.pollGeeknowImageTask({
            taskId: tid,
            downloadTimeoutSec: dlTimeout,
            apiKey: cfg.apiKey,
            apiBase: cfg.apiBase,
          });
        } catch {
          res = null;
        }
        if (!alive()) return;
        if (res && res.status === "done" && res.stagedKey) {
          await api.updateImageGenRecord({
            id: rec.id,
            status: "done",
            stagedKey: res.stagedKey,
            mimeType: res.mimeType ?? "image/png",
            error: null,
          });
          await invalidateRecords();
          return;
        }
        if (res && res.status === "pending") {
          errors = 0;
          if (!markedGenerating) {
            markedGenerating = true;
            await api.updateImageGenRecord({
              id: rec.id,
              status: "generating",
            });
            await invalidateRecords();
          }
        } else if (res && res.status === "notfound") {
          await api.updateImageGenRecord({
            id: rec.id,
            status: "expired",
            error: `任务号已失效：${res.error ?? "这个任务查不到了"}。要重新出图只能点这条记录的「重新提交新任务」，那会是一个新任务、重新计费。`,
          });
          await invalidateRecords();
          return;
        } else if (res && res.status === "auth") {
          await api.updateImageGenRecord({
            id: rec.id,
            status: "failed",
            error: imgCfgRef.current.usedGlobalKey
              ? `续查被 Geeknow 拒绝：${res.error ?? "鉴权失败"}。续查用的是生图接口总设置里填的 Key——它可能不正确或已失效；在左下角「设置」的生图接口总设置里改对、或清除改用已连接凭证后，点这条记录的「续查」接着查同一个任务，不会重新提交。`
              : `Geeknow 未连接：${res.error ?? "鉴权失败"}。这是 Key / 连接问题，不是超时；重新连接 Geeknow 后点这条记录的「续查」接着查同一个任务。`,
          });
          await invalidateRecords();
          return;
        } else if (res && res.status === "failed") {
          await api.updateImageGenRecord({
            id: rec.id,
            status: "failed",
            error: res.error ?? "服务商判定这张图生成失败",
          });
          await invalidateRecords();
          return;
        } else {
          errors += 1;
          if (errors >= MAX_POLL_ERRORS) {
            setRecMsg(
              rec.id,
              "查询任务状态连续失败（可能是网关超时），本轮先停下；任务号还在记录里，点「续查」接着查同一个任务，不会重新提交、不会重复计费。其他任务不受影响。",
            );
            return;
          }
        }
        await sleep(POLL_INTERVAL_MS);
      }
      setRecMsg(
        rec.id,
        "已等待约 10 分钟还没出图，本轮先停下；点「续查」接着查同一个任务，不会重新提交、不会重复计费。",
      );
    } finally {
      if (pollingRef.current.get(rec.id) === token) {
        pollingRef.current.delete(rec.id);
      }
    }
  };
  const pollRecordRef = useRef(pollRecord);
  pollRecordRef.current = pollRecord;

  // 面板打开 / 记录刷新后：所有未完成任务逐条自动续查（各自独立）。
  useEffect(() => {
    for (const rec of records) {
      if (
        (rec.status === "submitted" || rec.status === "generating") &&
        rec.taskId
      ) {
        void pollRecordRef.current(rec);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records]);

  // 提交一次新任务并立刻落一条记录。提交只占几秒，轮询在记录里
  // 独立进行——提交完可以立刻换下一个人继续提交，互不阻塞。
  // 提交只发一次，绝不自动重试：重试提交可能重复计费。
  const submitAndRecord = async (input: {
    personName: string;
    presetId: number | null;
    presetName: string;
    characterId: number | null;
    characterName: string;
    sceneAssetId?: number | null;
    sceneAssetName?: string;
    projectId: number | null;
    promptZh: string;
    promptEn: string;
    useModel: string;
    useQuality: "max" | "high" | "standard";
    useRatio: string;
    useThreeView: boolean;
    referenceImages: {
      dataBase64: string;
      mimeType: string;
      origin?: "auto" | "manual";
    }[];
  }): Promise<boolean> => {
    const prompt = input.promptEn.trim() || input.promptZh.trim();
    // v3.85 字数拦截（与服务端提交前检查同一口径，覆盖手改提示词
    // 与旧记录重提）：超安全线就在本地拦下并写清实际字数与上限。
    if (prompt.length > SUBMIT_PROMPT_BUDGET) {
      setSubmitError(
        `提示词太长，这次没有提交：实际提交的提示词共 ${prompt.length} 字符，Geeknow 的上限是 ${GEEKNOW_PROMPT_HARD_LIMIT} 字符（本台安全线 ${SUBMIT_PROMPT_BUDGET}）。请删减提示词再生成——优先删细节描写里的长句，人物核心设定与三视图排版说明别动。这次没有发出请求、不会计费。`,
      );
      return false;
    }
    // P1（v3.83，与封面页同一口径）：参考图提交前统一降采样——只压
    // 给模型的副本（最长边 1024px），原图整张 Base64 会让请求体在
    // 网关层被掐断、确定性失败；压不了又太大的图跳过不硬塞。面板
    // 里选好的参考图与储存库原图都不动。
    // 参考图不再过同意门：只要这次带了参考素材，就直接准备降采
    // 样副本（提交前由托管一步换链接再交给服务商，v5.97 先走 Geeknow 自家上传、回退公开图床）；一
    // 张都没压成副本时照旧写降级提示、按纯提示词提交。
    setRefDegradeNote(null);
    const preparedRefs: { dataBase64: string; mimeType: string }[] = [];
    const preparedOrigins: ("auto" | "manual")[] = [];
    if (input.referenceImages.length > 0) {
      for (const r of input.referenceImages) {
        const p = await dataRefToSubmitReference(r.dataBase64, r.mimeType);
        if (p) {
          preparedRefs.push(p);
          preparedOrigins.push(r.origin ?? "manual");
        }
      }
      if (preparedRefs.length === 0) {
        setRefDegradeNote(
          "参考素材这次一张都没能压成可提交的副本（原图太大又压缩失败）：已按纯提示词提交，参考图没有带上。换一张小一点的参考图再生成即可。",
        );
      }
    }
    // v5.61 锁脸句：参考图真的要发出去时，最终提示词末尾自动追加
    // 锁脸句（英文优先、否则中文，与提交口径一致；改图模板自带更
    // 强的保脸口径、词头有【改图】标记，不再叠加）。追加后的词就
    // 是实际提交的词，也原样落进生图记录——记录里能查这次到底
    // 带没带锁脸句。追加后若超安全线，在这里拦下（提交前、不会
    // 计费），让用户先删减正文。
    const isEditSubmit = input.promptZh.startsWith(EDIT_RECORD_MARKER);
    const locked =
      preparedRefs.length > 0 && !isEditSubmit
        ? withFaceLock(input.promptZh, input.promptEn)
        : { zh: input.promptZh, en: input.promptEn };
    const finalPrompt = locked.en.trim() || locked.zh.trim();
    if (finalPrompt.length > SUBMIT_PROMPT_BUDGET) {
      setSubmitError(
        `提示词太长，这次没有提交：加上自动追加的锁脸句后实际提交的提示词共 ${finalPrompt.length} 字符，超过 ${SUBMIT_PROMPT_BUDGET} 字符的安全线（Geeknow 上限 ${GEEKNOW_PROMPT_HARD_LIMIT}）。请删减提示词正文再生成，锁脸句是自动加的、不用你留位置。这次没有发出请求、不会计费。`,
      );
      return false;
    }
    // v5.95 参考图先单独托管换链接（独立一步、独占自己的时间预
    // 算）：旧链路在一次提交调用里先传图床再提交，两步串行超过
    // 守护进程 30 秒预算、带 1 张图也被掐断。托管失败在这里就停
    // 下——还没轮到提交、任务没建、不会计费，报错由服务端写清
    // 两条路线各败在哪、可直接重试；绝不自动重试（用户亲手再点
    // 才再走一遍）。
    // v5.97：托管主路线改走 Geeknow 自家上传，鉴权带与提交同一
    // 套生效配置（imgCfgRef）；走不通服务端自动改走公开图床，
    // 回执 route 写明实际路线，成功后亮一行路线说明。
    let hostedRefUrls: string[] = [];
    setHostRouteNote(null);
    if (preparedRefs.length > 0) {
      let hostRes: Awaited<ReturnType<typeof api.hostGeeknowReferenceImages>>;
      try {
        const hostCfg = imgCfgRef.current;
        hostRes = await api.hostGeeknowReferenceImages({
          referenceImages: preparedRefs,
          apiKey: hostCfg.apiKey,
          apiBase: hostCfg.apiBase,
        });
      } catch (e) {
        setSubmitError(
          isGatewayTimeoutText(describeThrownError(e))
            ? "参考图换链接超时了：先走 Geeknow 自家上传、再自动改走公开图床，两条都没在时间里走完。这一步在提交之前，这次没有提交、任务没有建、不会计费，可以直接再点一次生成重试。"
            : `参考图换链接没走完，这次没有提交、不会计费：${describeThrownError(e)}。可以直接再点一次生成重试。`,
        );
        return false;
      }
      if (!hostRes.ok) {
        setSubmitError(hostRes.error ?? "参考图换链接失败，这次没有提交、不会计费，可以直接再点一次生成重试。");
        return false;
      }
      hostedRefUrls = hostRes.urls;
      setHostRouteNote(
        hostRes.route === "geeknow"
          ? "这次参考图走的是 Geeknow 自家上传（图传到了 Geeknow 自家空间，没走公开图床）。"
          : hostRes.route === "uguu"
            ? "这次 Geeknow 自家上传没走通，已自动改走公开图床换链接（拿到链接的人能打开这张图、短期后自动删除）。"
            : hostRes.route === "mixed"
              ? "这次参考图一部分走 Geeknow 自家上传、一部分走了公开图床回退（走公开图床的那几张，拿到链接的人能打开、短期后自动删除）。"
              : null,
      );
    }
    // v5.70：提交带生图接口总设置的解析结果（填了用总设置、没填
    // 回落已连接凭证）；Key 只随当次请求透传，不落库不进记录。
    // v5.95：提交只带已托管的链接、不再带图字节，提交调用里只剩
    // 一次 Geeknow 请求。
    const submitCfg = imgCfgRef.current;
    const res = await api.submitGeeknowImageTask({
      model: input.useModel,
      prompt: finalPrompt,
      quality: input.useQuality,
      ratio: input.useRatio as "16:9" | "3:4" | "1:1" | "9:16" | "4:3",
      requestTimeoutSec: reqTimeout,
      downloadTimeoutSec: dlTimeout,
      retryCount: retries,
      referenceImages: [],
      referenceImageUrls: hostedRefUrls,
      apiKey: submitCfg.apiKey,
      apiBase: submitCfg.apiBase,
    });
    if (!res.ok) {
      const errText = res.error ?? "提交失败，请重试";
      setSubmitError(
        /401|403|鉴权|未连接|api key/i.test(errText)
          ? submitCfg.usedGlobalKey
            ? `总设置里填的 Key 被 Geeknow 拒绝了：${errText}。这是 Key 问题，不是超时；到左下角「设置」里的生图接口总设置把 Key 改对、或清除改用已连接凭证后再生成。`
            : `Geeknow 未连接：${errText}。这是 Key / 连接问题，不是超时；请重新连接 Geeknow 后再生成。`
          : errText,
      );
      return false;
    }
    try {
      // v5.61 参考图溯源：实际带图数以提交回执的托管链接为准（回
      // 执缺失时按已准备的副本数兜底）；来源按实际发出的那几张的
      // origin 汇总；托管链接只算 SHA-256 哈希落库、链接本身不
      // 落库（与封面 v5.16 同口径），算不出哈希不拦记录。
      const refUrls = res.refImageUrls ?? [];
      const refCount =
        refUrls.length > 0 ? refUrls.length : preparedRefs.length;
      const refSent = refCount > 0;
      let refSource: string;
      if (!refSent) {
        refSource =
          input.referenceImages.length > 0 ? "未发送" : "无参考图";
      } else if (
        preparedOrigins.length > 0 &&
        preparedOrigins.every((o) => o === "auto")
      ) {
        refSource = "从人物卡带入";
      } else if (preparedOrigins.every((o) => o === "manual")) {
        refSource = "手动上传";
      } else {
        refSource = "从人物卡带入＋手动上传";
      }
      let refHostHashes: string[] = [];
      if (refUrls.length > 0) {
        try {
          const enc = new TextEncoder();
          refHostHashes = await Promise.all(
            refUrls.map((u) => sha256Hex(enc.encode(u))),
          );
        } catch {
          refHostHashes = [];
        }
      }
      const created = await api.createImageGenRecord({
        personName: input.personName,
        presetId: input.presetId,
        presetName: input.presetName,
        characterId: input.characterId,
        characterName: input.characterName,
        sceneAssetId: input.sceneAssetId ?? null,
        sceneAssetName: input.sceneAssetName ?? "",
        projectId: input.projectId,
        promptZh: locked.zh,
        promptEn: locked.en,
        model: input.useModel,
        quality: input.useQuality,
        ratio: input.useRatio,
        threeView: input.useThreeView,
        taskId: res.taskId,
        line: "geeknow.top",
        // v4.04：提交成功立刻就是「生成中」，不等第一次轮询才变状态。
        status: res.stagedKey ? "done" : "generating",
        stagedKey: res.stagedKey,
        mimeType: res.mimeType,
        error: null,
        refImageCount: refCount,
        refSent,
        refSource,
        refHostHashes,
      });
      await invalidateRecords();
      if (created.record.taskId && !created.record.stagedKey) {
        void pollRecordRef.current(created.record);
      }
    } catch (e) {
      setSubmitError(
        `任务其实已经提交成功（任务号 ${res.taskId ?? "无"}），但生图记录没建上：${describeThrownError(e)}。先别重复提交（会重复计费），把这个任务号记下来；记录没建上时面板续查不到它，可稍后在 Geeknow 控制台按任务号核对。`,
      );
      return false;
    }
    return true;
  };

  // 生成入口：不再过同意门、不再弹未同意确认——选了参考素材就
  // 直接带图提交（submitAndRecord 里准备副本），没选就纯提示词。
  const runGenerate = async () => {
    if (submitting) return;
    await doGenerate();
  };

  const doGenerate = async () => {
    if (submitting) return;
    // v4.26 改图模式：先校验改图两件套（要求写了 / 参照图带入
    // 了），任一缺失就明说原因、不提交不计费——改图没带上原图
    // 就是假改图。参照图带入后点生成即自动上传，不再要勾同意。
    let effPromptZh = promptZh;
    let effPromptEn = promptEn;
    if (isEditMode) {
      const req = editRequest.trim();
      if (!req) {
        setSubmitError(
          "先在上方「改图」区写清要改哪里（例如：把帽子换成黑色棒球帽、发色改成银灰色），再点开始改图。这次没有提交、不会计费。",
        );
        return;
      }
      if (refs.length === 0) {
        setSubmitError(
          "改图必须带参照图：现在参考素材是空的，原图没有带入。这次没有提交、不会计费——请在参考素材区点「从储存库选图（加入本卡图片）」把这张卡的主图带入再改图。",
        );
        return;
      }
      // 改图模板（保持身份特征不变、只改点名部位）；拼好的词回填
      // 提示词框，用户看得见实际提交的原文，记录里带改图标记。
      effPromptZh =
        `${EDIT_RECORD_MARKER}以参考图（人物「${selectedPreset?.name ?? ""}」当前的资产图）为原图做局部改图：` +
        "保持人物的面部、五官、脸型、身材、年龄感与身份特征完全不变，构图、排版与背景与原图一致，" +
        `只修改这一处：${req}。` +
        "没有点名修改的部位（发型、发色、服装、配饰等）全部与原图保持一致，不要顺带改动、不要换人。";
      effPromptEn = "";
      setPromptZh(effPromptZh);
      setPromptEn("");
    }
    const prompt = effPromptEn.trim() || effPromptZh.trim();
    if (!prompt) return;
    if (!model.trim()) {
      setSubmitError("先选一个模型（或在手动输入框里填模型名）再生成");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const preset =
        selectedPreset ??
        (selectedCharacter ? linkedPresetFor(selectedCharacter) : null);
      const character =
        selectedCharacter ??
        (selectedPreset ? linkedCharacterFor(selectedPreset) : null);
      // v4.15 场景：选中场景资产时记录挂场景卡（与人物互斥）。
      const scene =
        selectedScene ??
        (target?.kind === "scene" &&
        selection === `scene:${target.sceneAssetId}`
          ? {
              id: target.sceneAssetId,
              name: target.name,
              description: "",
              promptZh: target.promptZh,
              promptEn: target.promptEn,
              imageUrl: null,
              imagePreviewUrl: null,
            }
          : null);
      await submitAndRecord({
        personName: preset?.name || character?.name || scene?.name || "手动提示词",
        presetId: preset?.id ?? null,
        presetName: preset?.name ?? "",
        characterId: character?.id ?? null,
        characterName: character?.name ?? "",
        sceneAssetId: scene?.id ?? null,
        sceneAssetName: scene?.name ?? "",
        projectId: character || scene ? charsProjectId : null,
        promptZh: effPromptZh,
        promptEn: effPromptEn,
        useModel: model.trim(),
        useQuality: quality,
        useRatio: ratio,
        useThreeView: threeView,
        referenceImages: refs.map((r) => ({
          dataBase64: r.dataBase64,
          mimeType: r.mimeType,
          origin: r.origin ?? "manual",
        })),
      });
    } catch (e) {
      setSubmitError(
        isGatewayTimeoutError(e)
          ? "提交时网关超时：这次提交有没有被服务商收到还不确定，先不要连点；等十几秒后重开面板看记录，若刚才其实已提交成功，记录里会有它。注意这和「没填 Key」无关。"
          : `提交失败：${describeThrownError(e)}`,
      );
    } finally {
      setSubmitting(false);
    }
  };

  // 失败 / 失效记录的重新提交：用户在记录上二次确认后才走这里，
  // 产生的是一个新任务、一条新记录，明说重新计费；记录里没存
  // 参考图，重新提交不带参考图。
  const resubmitRecord = async (rec: GenRecord) => {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const ok = await submitAndRecord({
        personName: rec.personName,
        presetId: rec.presetId,
        presetName: rec.presetName,
        characterId: rec.characterId,
        characterName: rec.characterName,
        sceneAssetId: rec.sceneAssetId,
        sceneAssetName: rec.sceneAssetName,
        projectId: rec.projectId,
        promptZh: rec.promptZh,
        promptEn: rec.promptEn,
        useModel: rec.model,
        useQuality: (["max", "high", "standard"].includes(rec.quality)
          ? rec.quality
          : "max") as "max" | "high" | "standard",
        useRatio: rec.ratio,
        useThreeView: rec.threeView,
        referenceImages: [],
      });
      if (ok) {
        setRecMsg(
          rec.id,
          "已按这条记录的设置重新提交了一个新任务：新任务在记录列表最上面，独立计费、独立轮询；这条旧记录保留作历史。",
        );
      }
    } catch (e) {
      setSubmitError(
        isGatewayTimeoutError(e)
          ? "重新提交时网关超时：有没有被服务商收到还不确定，先不要连点，等十几秒后看记录列表。"
          : `重新提交失败：${describeThrownError(e)}`,
      );
    } finally {
      setSubmitting(false);
    }
  };

  // v5.62 存卡共用核（单个「存到资产卡」与合并按钮共用）：把图追加
  // 进卡（不替换、不删旧图），并定这张新图的造型走哪条路——
  //   · 普通记录且 prompt_zh 剥掉画风 / 三视图 / 锁脸三类句后还有
  //     造型描述 → 造型随存图直接写进新图的 look（directLook 非
  //     空），不进待确认、不再跑单图造型分析；
  //   · 改图记录（【改图】开头，提示词是改图指令不是造型描述）或
  //     剥完为空 → directLook 为空，调用方沿用 v5.56 旧路对新图跑
  //     单图造型分析、结果进待确认。
  // 只做存图这一步：记录上的已存标记与提示文案由调用方写（合并
  // 按钮要等两步都完了一次写齐四个 saved 字段）。
  type SavePresetOutcome = {
    newImages: { id: number; url: string }[];
    directLook: string;
    isEdit: boolean;
  };
  const saveToPresetCore = async (
    rec: GenRecord,
    target: PresetSaveTarget,
  ): Promise<SavePresetOutcome> => {
    const presetId = target.id;
    if (!rec.stagedKey) {
      throw new Error("这条记录没有可存的图或目标资产卡");
    }
    // 存之前先记下卡上已有的图，存完才知道哪张是新图。
    let beforeImageIds = new Set<number>();
    try {
      const before = await api.listAssetPresets({});
      const bp = before.presets.find((x) => x.id === presetId);
      if (bp) beforeImageIds = new Set(bp.images.map((im) => im.id));
    } catch {
      /* 记不到旧图就不自动分析，不挡保存 */
    }
    const isEdit = rec.promptZh.startsWith(EDIT_RECORD_MARKER);
    const directLook = isEdit ? "" : lookFromPromptZh(rec.promptZh);
    const savedPreset = await api.saveGeneratedImageToPreset({
      stagedKey: rec.stagedKey,
      presetId,
      ...(directLook ? { look: directLook } : {}),
    });
    const newImages = savedPreset.preset.images.filter(
      (im) => !beforeImageIds.has(im.id),
    );
    return { newImages, directLook, isEdit };
  };

  // v5.56 旧路：对刚存进卡的新图逐张跑单图造型分析（结果进各自
  // 待确认），每张的回执覆盖记录提示区（与旧版口径一致）。
  const runLookAnalysisForNewImages = async (
    rec: GenRecord,
    outcome: SavePresetOutcome,
    target: PresetSaveTarget,
  ) => {
    for (const im of outcome.newImages) {
      const oc = await runPresetImageLookCore(
        target.id,
        im.id,
        { presetName: target.name, imageUrl: im.url },
        () => true,
      );
      if (oc) setRecMsg(rec.id, oc.message);
      queryClient.invalidateQueries({ queryKey: ["assetPresets"] });
    }
  };

  const saveRecToPreset = async (rec: GenRecord) => {
    const target = recordPresetTarget(rec);
    if (!rec.stagedKey || target == null || savingIds[rec.id]) return;
    setSavingIds((prev) => ({ ...prev, [rec.id]: true }));
    try {
      const outcome = await saveToPresetCore(rec, target);
      await api.updateImageGenRecord({
        id: rec.id,
        savedPresetId: target.id,
        savedPresetName: target.name,
      });
      queryClient.invalidateQueries({ queryKey: ["assetPresets"] });
      await invalidateRecords();
      if (outcome.directLook) {
        setRecMsg(
          rec.id,
          `已存到储存库资产卡「${target.name}」。造型已按生图提示词写进这张图，不用再确认。`,
        );
        return;
      }
      setRecMsg(
        rec.id,
        outcome.isEdit
          ? `改图已存到储存库资产卡「${target.name}」：作为新图追加在卡上（排在现有图之后），原来的图没有被替换、没有删除；这张卡的「展开详情」右侧图片区能看到它和它的造型。正在分析这张新图的造型，结果先进待确认，不确认不填。`
          : `已存到储存库资产卡「${target.name}」。这条提示词剥掉画风、三视图排版与锁脸句后没有剩下的造型描述，造型改走 AI 分析：正在分析这张新图的造型，结果先进待确认，不确认不填。`,
      );
      await runLookAnalysisForNewImages(rec, outcome, target);
    } catch (e) {
      setRecMsg(
        rec.id,
        `没存上：${e instanceof Error ? e.message : "请重试"}（图还在记录里）`,
      );
    } finally {
      setSavingIds((prev) => ({ ...prev, [rec.id]: false }));
    }
  };

  // v5.62 合并按钮（presetId 与 characterId 都在的人物记录才有）：
  // 点一次顺序做两步——先存卡、再设人物图；两步都只引用同一
  // stagedKey、不消费暂存图。不包成服务端事务：第一步成了、第二
  // 步失败时如实分开报（先把已存卡的标记落到记录上），图还在记录
  // 里、再点合并按钮可重试，已落标记的那步不会重做（不往卡里重复
  // 追加图）。两步都成后一次 updateImageGenRecord 写齐四个 saved
  // 字段，记录上同时显示「已存到资产卡」与「已设为人物图」。点完
  // 只在记录提示区报结果，不跳转、不自动打开卡详情（用户选 2.b）。
  const saveRecToPresetAndCharacter = async (rec: GenRecord) => {
    // v5.63：存卡目标以解析结果为准（人物记下来的来源卡优先），
    // 解析不出目标卡就不显示合并按钮、这里也进不来。
    const target = recordPresetTarget(rec);
    if (
      !rec.stagedKey ||
      target == null ||
      rec.characterId == null ||
      savingIds[rec.id]
    )
      return;
    setSavingIds((prev) => ({ ...prev, [rec.id]: true }));
    try {
      const presetAlready = rec.savedPresetId != null;
      const charAlready = rec.savedCharacterId != null;
      let outcome: SavePresetOutcome | null = null;
      if (!presetAlready) {
        try {
          outcome = await saveToPresetCore(rec, target);
        } catch (e) {
          setRecMsg(
            rec.id,
            `第一步「存到资产卡「${target.name}」」没成：${e instanceof Error ? e.message : "请重试"}。第二步还没做，图还在记录里，点合并按钮可重试。`,
          );
          return;
        }
      }
      if (!charAlready) {
        try {
          await api.saveGeneratedImageToCharacter({
            stagedKey: rec.stagedKey,
            characterId: rec.characterId,
          });
        } catch (e) {
          // 第一步已成：先把已存卡标记落到记录上再如实报第二步失败。
          try {
            await api.updateImageGenRecord({
              id: rec.id,
              savedPresetId: target.id,
              savedPresetName: target.name,
            });
          } catch {
            /* 标记没落上也不掩盖第二步的失败原因，下面照实报 */
          }
          queryClient.invalidateQueries({ queryKey: ["assetPresets"] });
          await invalidateRecords();
          // 第一步的新图造型该走的路照走完（直写已在存图时写好；
          // 旧路在这里把分析跑完进待确认），最后再报第二步失败。
          if (outcome && !outcome.directLook) {
            await runLookAnalysisForNewImages(rec, outcome, target);
          }
          setRecMsg(
            rec.id,
            `第一步已成：图已存到资产卡「${target.name}」${outcome?.directLook ? "，造型已按生图提示词写进这张图" : outcome ? "，新图造型已按老规矩处理（分析结果进待确认）" : ""}。但第二步「设为「${rec.characterName}」人物图」没成：${e instanceof Error ? e.message : "请重试"}。图还在记录里，再点合并按钮只补第二步、不会往卡里重复存图。`,
          );
          return;
        }
      }
      await api.updateImageGenRecord({
        id: rec.id,
        savedPresetId: target.id,
        savedPresetName: target.name,
        savedCharacterId: rec.characterId,
        savedCharacterName: rec.characterName,
      });
      queryClient.invalidateQueries({ queryKey: ["assetPresets"] });
      queryClient.invalidateQueries({
        queryKey: ["project", rec.projectId ?? charsProjectId],
      });
      await invalidateRecords();
      const head =
        presetAlready && charAlready
          ? `这张图之前已存到资产卡「${target.name}」、也已设为剧本人物「${rec.characterName}」的人物图，这次没有重复存。`
          : presetAlready
            ? `这张图之前已存到资产卡「${target.name}」，这次补上了第二步：已设为剧本人物「${rec.characterName}」的人物图。`
            : `已存到资产卡「${target.name}」，并设为剧本人物「${rec.characterName}」的人物图。`;
      if (outcome?.directLook) {
        setRecMsg(
          rec.id,
          `${head}造型已按生图提示词写进这张图，不用再确认。`,
        );
        return;
      }
      if (outcome) {
        setRecMsg(
          rec.id,
          outcome.isEdit
            ? `${head}改图的造型改走 AI 分析：正在分析这张新图的造型，结果先进待确认，不确认不填。`
            : `${head}这条提示词剥掉画风、三视图排版与锁脸句后没有剩下的造型描述，造型改走 AI 分析：正在分析这张新图的造型，结果先进待确认，不确认不填。`,
        );
        await runLookAnalysisForNewImages(rec, outcome, target);
      } else {
        setRecMsg(rec.id, head);
      }
    } finally {
      setSavingIds((prev) => ({ ...prev, [rec.id]: false }));
    }
  };

  const saveRecToCharacter = async (rec: GenRecord) => {
    if (!rec.stagedKey || rec.characterId == null || savingIds[rec.id]) return;
    setSavingIds((prev) => ({ ...prev, [rec.id]: true }));
    try {
      await api.saveGeneratedImageToCharacter({
        stagedKey: rec.stagedKey,
        characterId: rec.characterId,
      });
      await api.updateImageGenRecord({
        id: rec.id,
        savedCharacterId: rec.characterId,
        savedCharacterName: rec.characterName,
      });
      queryClient.invalidateQueries({
        queryKey: ["project", rec.projectId ?? charsProjectId],
      });
      await invalidateRecords();
      setRecMsg(
        rec.id,
        `已设为剧本人物「${rec.characterName}」的人物图`,
      );
    } catch (e) {
      setRecMsg(
        rec.id,
        `没存上：${e instanceof Error ? e.message : "请重试"}（图还在记录里）`,
      );
    } finally {
      setSavingIds((prev) => ({ ...prev, [rec.id]: false }));
    }
  };

  const saveRecToScene = async (rec: GenRecord) => {
    if (!rec.stagedKey || rec.sceneAssetId == null || savingIds[rec.id]) return;
    setSavingIds((prev) => ({ ...prev, [rec.id]: true }));
    try {
      await api.saveGeneratedImageToSceneAsset({
        stagedKey: rec.stagedKey,
        sceneAssetId: rec.sceneAssetId,
      });
      await api.updateImageGenRecord({
        id: rec.id,
        savedSceneAssetId: rec.sceneAssetId,
        savedSceneAssetName: rec.sceneAssetName,
      });
      queryClient.invalidateQueries({
        queryKey: ["project", rec.projectId ?? charsProjectId],
      });
      await invalidateRecords();
      setRecMsg(
        rec.id,
        `已设为场景资产「${rec.sceneAssetName}」的场景图`,
      );
    } catch (e) {
      setRecMsg(
        rec.id,
        `没存上：${e instanceof Error ? e.message : "请重试"}（图还在记录里）`,
      );
    } finally {
      setSavingIds((prev) => ({ ...prev, [rec.id]: false }));
    }
  };

  const deleteRecord = async (rec: GenRecord) => {
    pollingRef.current.delete(rec.id);
    try {
      await api.deleteImageGenRecord({ id: rec.id });
      await invalidateRecords();
    } catch {
      setRecMsg(rec.id, "记录没删掉，请重试");
    }
  };


  const connected = modelsQuery.data?.connected ?? null;
  const labelCls = "mb-1 block text-xs font-bold text-[var(--dim)]";

  return (
    <section
      role="dialog"
      aria-label="生图 · 图片模型管理"
      className="fixed right-3 top-[70px] z-[60] flex max-h-[calc(100dvh-88px)] w-[408px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-[14px] border"
      style={{
        background: "var(--surface)",
        borderColor: "var(--border)",
        boxShadow: "var(--shadow-card)",
        color: "var(--text)",
      }}
    >
      <div
        className="flex items-center justify-between gap-2 border-b px-4 py-3"
        style={{ borderColor: "var(--border)" }}
      >
        <p className="font-display text-base font-bold">
          生图 · 图片模型管理
        </p>
        <div className="flex shrink-0 gap-1.5">
          <button
            type="button"
            className="btn btn-sm"
            aria-label="最小化生图面板"
            onClick={onMinimize}
          >
            最小化
          </button>
          <button
            type="button"
            className="btn btn-sm"
            aria-label="关闭生图面板"
            onClick={onClose}
          >
            关闭
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <p className="text-[13px] leading-5">
          服务：图片中转插件 - GeekNow(推荐)
        </p>
        <p className="mt-0.5 text-[13px] leading-5" role="status">
          {modelsQuery.isPending ? (
            <span className="text-[var(--dim)]">正在确认连接…</span>
          ) : connected ? (
            <span style={{ color: "var(--olive)" }}>
              ● Geeknow 已连接（Key 已在连接凭证里，不用再填）
            </span>
          ) : (
            <span style={{ color: "var(--bad)" }}>
              ● Geeknow 未连接，请重新连接 Geeknow 后再生成
              {modelsQuery.data?.error ? `：${modelsQuery.data.error}` : ""}
            </span>
          )}
        </p>
        {!promoClosed && (
          <p
            className="mt-2 flex items-center gap-2 rounded-[var(--radius)] border px-2.5 py-1.5 text-[12.5px] leading-5"
            style={{
              borderColor: "var(--border)",
              background: "var(--accent-soft)",
            }}
            role="status"
          >
            <span className="min-w-0 flex-1">📢 gpt-image-2 默认分组已经恢复，4分每次！</span>
            <button
              type="button"
              className="btn btn-sm shrink-0"
              aria-label="关闭公告"
              onClick={() => setPromoClosed(true)}
            >
              ×
            </button>
          </p>
        )}
        <p className="mt-1.5 text-[12px] leading-5 text-[var(--dim)]">
          按你的 Geeknow 账户计费；只有点「生成图片」才会调用。
        </p>

        {/* v5.88：生图接口总设置已整份搬到左下角悬浮「设置」里
            （全站仍只一份，存储与生效顺序不变）；本面板不再另放
            一份，只留一行当前生效来源，改地址 / 密钥去左下角。 */}
        <p className="mt-2 text-xs leading-5" role="status">
          <span className="font-bold" style={{ color: "var(--olive)" }}>
            {imgResolved.sourceLabel}
          </span>
          <span className="text-[var(--dim)]">
            。API 地址和密钥在页面左下角的「设置」里改（生图面板和封面生成共用一份，只存本机）。
          </span>
        </p>

        {/* v1.1.0 软件更新：仅 exe 打包版显示（window.electronAPI 由主进程注入）；
            网页版 / Muse 版没有这个入口。更新只换程序文件，项目数据不动。 */}
        {hasElectronAPI && (
          <div
            className="mt-3 rounded-[var(--radius)] border p-3"
            style={{
              borderColor: "var(--border)",
              background: "var(--surface-alt)",
            }}
          >
            <p className="text-sm font-bold">软件更新</p>
            <p className="mt-1 text-xs leading-5 text-[var(--dim)]">
              当前版本：{appVersion ?? "…"}。新版本发布后，打开软件会自动检查、后台下载，下载完提示你重启更新；也可以点下面手动检查。更新只换程序文件，你的项目、图片和设置都不动。
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="btn btn-sm"
                disabled={updateChecking}
                aria-label="手动检查软件更新"
                onClick={() => void runUpdateCheck()}
              >
                {updateChecking ? "检查中…" : "检查更新"}
              </button>
            </div>
            {updateMsg && (
              <p className="mt-2 text-xs leading-5" role="status">
                {updateMsg}
              </p>
            )}
          </div>
        )}

        <div className="mt-3">
          <label className={labelCls} htmlFor="imagegen-family">
            模型族
          </label>
          <select
            id="imagegen-family"
            className="field w-full"
            value={modelFamily}
            onChange={(e) => setModelFamily(e.target.value)}
          >
            <option value="Omni Image2">Omni Image2</option>
          </select>
          <p className="mt-0.5 text-[11px] text-[var(--dim)]">
            参考素材上限 16 图
          </p>
        </div>

        <div className="mt-3">
          <label className={labelCls} htmlFor="imagegen-model">
            模型
          </label>
          <select
            id="imagegen-model"
            className="field w-full"
            value={modelOptions.includes(model) ? model : ""}
            onChange={(e) => {
              if (e.target.value) setModel(e.target.value);
            }}
            aria-label="选择生图模型"
          >
            {!modelOptions.includes(model) && (
              <option value="">{model}（手动输入）</option>
            )}
            {modelOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <label className={`${labelCls} mt-2`} htmlFor="imagegen-model-manual">
            模型（可手动输入，列表取不到时也能用）
          </label>
          <input
            id="imagegen-model-manual"
            className="field w-full"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="如 gpt-image-2.5-flare"
            aria-label="手动输入生图模型名"
          />
          {modelsQuery.data && !modelsQuery.data.connected && (
            <p className="mt-0.5 text-[11px] leading-4 text-[var(--dim)]">
              模型列表没取到（连接未确认），仍可手动输入模型名生成。
            </p>
          )}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls} htmlFor="imagegen-quality">
              质量
            </label>
            <select
              id="imagegen-quality"
              className="field w-full"
              value={quality}
              onChange={(e) =>
                setQuality(e.target.value as "max" | "high" | "standard")
              }
            >
              <option value="max">max</option>
              <option value="high">high</option>
              <option value="standard">standard</option>
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="imagegen-ratio">
              图片比例
            </label>
            <select
              id="imagegen-ratio"
              className="field w-full"
              value={ratio}
              onChange={(e) => setRatio(e.target.value)}
            >
              {RATIO_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="mt-1 text-[11px] leading-4 text-[var(--dim)]">
          选比例参考：视频用 16:9、人物资产用 3:4、三视图用 16:9。
        </p>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <div>
            <label className={labelCls} htmlFor="imagegen-req-timeout">
              请求超时（秒）
            </label>
            <input
              id="imagegen-req-timeout"
              className="field w-full"
              type="number"
              min={10}
              max={600}
              value={reqTimeout}
              onChange={(e) =>
                setReqTimeout(
                  Math.max(10, Math.min(600, Number(e.target.value) || 60)),
                )
              }
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="imagegen-dl-timeout">
              下载超时（秒）
            </label>
            <input
              id="imagegen-dl-timeout"
              className="field w-full"
              type="number"
              min={10}
              max={600}
              value={dlTimeout}
              onChange={(e) =>
                setDlTimeout(
                  Math.max(10, Math.min(600, Number(e.target.value) || 60)),
                )
              }
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="imagegen-retries">
              重试次数
            </label>
            <input
              id="imagegen-retries"
              className="field w-full"
              type="number"
              min={0}
              max={10}
              value={retries}
              onChange={(e) =>
                setRetries(
                  Math.max(0, Math.min(10, Math.floor(Number(e.target.value) || 0))),
                )
              }
            />
          </div>
        </div>
        <div className="mt-3">
          <label className={labelCls} htmlFor="imagegen-node">
            服务节点
          </label>
          <select
            id="imagegen-node"
            className="field w-full"
            value={node}
            onChange={(e) => setNode(e.target.value)}
          >
            <option value="主节点">主节点</option>
          </select>
        </div>

        <div
          className="mt-4 border-t pt-3"
          style={{ borderColor: "var(--border)" }}
        >
          <label className={labelCls} htmlFor="imagegen-person">
            选择人物（选中后自动按人物卡拼提示词）
          </label>
          <select
            id="imagegen-person"
            className="field w-full"
            value={selection}
            onChange={(e) => onSelectPerson(e.target.value)}
            aria-label="选择要生成图的人物"
          >
            <option value="">不选人物（自己填提示词）</option>
            {presets.length > 0 && (
              <optgroup label="储存库资产卡">
                {presets.map((p) => (
                  <option key={p.id} value={`preset:${p.id}`}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
            )}
            {characters.length > 0 && (
              <optgroup label="当前剧本人物">
                {characters.map((c) => (
                  <option key={c.id} value={`character:${c.id}`}>
                    {c.name || "未命名人物"}
                  </option>
                ))}
              </optgroup>
            )}
            {sceneAssets.length > 0 && (
              <optgroup label="当前项目场景资产">
                {sceneAssets.map((s) => (
                  <option key={s.id} value={`scene:${s.id}`}>
                    {s.name || "未命名场景"}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          {(selectedPreset || selectedCharacter) && (
            <p className="mt-1 text-[11px] leading-4 text-[var(--dim)]">
              已带入：
              {selectedPreset
                ? `储存库资产卡「${selectedPreset.name}」`
                : `剧本人物「${selectedCharacter?.name || "未命名人物"}」`}
              ，提示词已按这张卡的人物、发型、脸、衣服、下装、鞋子、配饰拼好，可直接改。
            </p>
          )}
          {selectedScene && (
            <p className="mt-1 text-[11px] leading-4 text-[var(--dim)]">
              已带入：场景资产卡「{selectedScene.name || "未命名场景"}」，提示词是这张卡预填的场景提示词（无人空镜、16:9），可直接改。
            </p>
          )}
          {mergeInfo && (selectedPreset || selectedCharacter || selectedScene) && (
            <div
              className="mt-1.5 rounded-[var(--radius)] border px-2.5 py-1.5"
              style={{ borderColor: "var(--border)" }}
              role="status"
              aria-label="提示词合并来源与待核对项"
            >
              <p className="text-[11px] leading-4 text-[var(--dim)]">
                提示词来源：{mergeInfo.source}。
              </p>
              {mergeInfo.pending.length > 0 && (
                <p
                  className="mt-0.5 text-[11px] leading-4"
                  style={{ color: "var(--bad)" }}
                >
                  待核对：{mergeInfo.pending.join("、")}
                  在资产卡与剧本备注里都没有设定，已留空标「待核对」，没有凭空编、也没有套用别人物的设定。
                </p>
              )}
              {mergeInfo.conflicts.map((cf) => (
                <p
                  key={cf}
                  className="mt-0.5 text-[11px] leading-4"
                  style={{ color: "var(--bad)" }}
                >
                  冲突：{cf}
                </p>
              ))}
            </div>
          )}
          <label className="mt-2 flex cursor-pointer items-start gap-2 text-[13px] leading-5">
            <input
              type="checkbox"
              className="mt-1"
              checked={threeView}
              onChange={(e) => toggleThreeView(e.target.checked)}
              aria-label="使用人物三视图排版"
            />
            <span>
              <strong>人物三视图排版</strong>（默认勾选）：16:9，左 70% 三个无头全身（正 / 侧 / 背），右 30% 头部侧面 + 正面特写，五格同一人。取消则按普通单图生成。
            </span>
          </label>
        </div>

        <div
          className="mt-4 border-t pt-3"
          style={{ borderColor: "var(--border)" }}
        >
          <label className={labelCls} htmlFor="imagegen-art-style">
            人物画风
          </label>
          <select
            id="imagegen-art-style"
            className="field w-full"
            value={artStyle}
            onChange={(e) => changeArtStyle(e.target.value)}
            aria-label="选择人物画风（默认超写实CG，真实肌理与皮肤纹理）"
          >
            {ART_STYLE_OPTIONS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] leading-4 text-[var(--dim)]">
            {artStyleById(artStyle).hint}
            选完会自动把画风句拼进下面中英文提示词的尾部；换画风会先换掉旧画风句，不叠加。
          </p>

          <button
            type="button"
            className="btn btn-primary mt-3 w-full"
            aria-label="AI一键优化细节提示词（把已填的基础提示词补成细节版，只改文字、不会提交生图）"
            disabled={
              optimizing || (!promptZh.trim() && !promptEn.trim())
            }
            onClick={() => void runOptimizePrompt()}
          >
            {optimizing ? "AI 优化中…" : "AI 一键优化细节提示词"}
          </button>
          <p className="mt-1 text-[11px] leading-4 text-[var(--dim)]">
            基础信息填完后点这里：AI
            按当前画风把面部、皮肤肌理、发丝、服装材质、表情姿态、光影与画质细节补齐，已填的人物设定（发型、穿搭、年龄、时空）不改、「待核对」不编造。优化只改提示词文字，不会提交生图；生成仍只由下面的「生成图片」按钮触发。
          </p>
          {!promptZh.trim() && !promptEn.trim() && (
            <p className="mt-1 text-[11px] leading-4 text-[var(--dim)]">
              先选一个人物自动拼提示词、或自己填一点基础提示词，优化按钮才能点。
            </p>
          )}
          {optimizeError && (
            <p
              className="mt-2 rounded-[var(--radius)] border px-2.5 py-1.5 text-[12.5px] leading-5"
              style={{ borderColor: "var(--border)", color: "var(--bad)" }}
              role="alert"
            >
              {optimizeError}
            </p>
          )}
          {optimizeMsg && (
            <div
              className="mt-2 rounded-[var(--radius)] border px-2.5 py-1.5"
              style={{ borderColor: "var(--border)" }}
              role="status"
              aria-label="AI优化提示词结果"
            >
              <p
                className="text-[12.5px] leading-5"
                style={{ color: "var(--olive)" }}
              >
                {optimizeMsg}
              </p>
              {preOptimize && (
                <button
                  type="button"
                  className="btn btn-sm mt-1.5"
                  aria-label="撤销AI优化（提示词回到优化前的版本）"
                  onClick={undoOptimize}
                >
                  撤销优化（回到优化前）
                </button>
              )}
            </div>
          )}
        </div>

        {isEditMode && selectedPreset && (
          <div
            className="mt-3 rounded-[var(--radius)] border p-3"
            style={{
              borderColor: "var(--accent)",
              background: "var(--accent-soft)",
            }}
            role="group"
            aria-label={`改图：以${selectedPreset.name}当前资产图为参照图`}
          >
            <p className="text-sm font-bold">
              改图 · {selectedPreset.name}
            </p>
            <div className="mt-2 flex items-start gap-2.5">
              {selectedPreset.images[0] ? (
                <PreviewImg
                  src={selectedPreset.images[0].url}
                  previewSrc={selectedPreset.images[0].previewUrl}
                  previewRef={{
                    kind: "presetImage",
                    imageId: selectedPreset.images[0].id,
                  }}
                  alt={`${selectedPreset.name}当前的资产图（改图参照图）`}
                  className="h-16 w-24 shrink-0 rounded object-cover object-top"
                  style={{ outline: "1px solid var(--border)", outlineOffset: "-1px" }}
                />
              ) : null}
              <p className="min-w-0 text-[12px] leading-5">
                参照图就是左边这张——这张卡现在的资产图，已经放进下方「参考素材」。
                在下面写清<strong>只改哪里</strong>，AI 会保持人物的脸、身材和身份特征不变，只动你点名的地方。
                生成后先在下方记录里看预览，确认好再点记录上的「存到资产卡」：存进去是往卡上<strong>多加一张图，不替换、不删除现在的原图</strong>；
                这张卡的「展开详情」里也会留一份改图记录。不满意就改一下要求、再点一次「开始改图」（新任务、重新计费）。
              </p>
            </div>
            <label className={`${labelCls} mt-2`} htmlFor="imagegen-edit-request">
              要改的部位（只写要改的，其他部位保持原样）
            </label>
            <textarea
              id="imagegen-edit-request"
              className="field w-full"
              rows={3}
              value={editRequest}
              onChange={(e) => setEditRequest(e.target.value)}
              placeholder="例如：把帽子换成黑色棒球帽；发型改成齐肩短发；发色改成银灰色；上衣换成红色连帽卫衣"
              aria-label="改图要求：写清要修改的部位"
            />
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {EDIT_QUICK_PHRASES.map((ph) => (
                <button
                  key={ph}
                  type="button"
                  className="btn btn-sm"
                  aria-label={`把「${ph.trim()}」填进改图要求`}
                  onClick={() =>
                    setEditRequest((t) =>
                      t.trim() ? `${t.replace(/[；;]\s*$/, "")}；${ph}` : ph,
                    )
                  }
                >
                  {ph.trim()}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-3">
          <label className={labelCls} htmlFor="imagegen-prompt-zh">
            {isEditMode ? "提示词（中文，开始改图时按改图要求自动拼好）" : "提示词（中文）"}
          </label>
          <textarea
            id="imagegen-prompt-zh"
            className="field w-full"
            rows={5}
            value={promptZh}
            onChange={(e) => setPromptZh(e.target.value)}
            placeholder="选人物自动拼好，也可以自己写中文提示词"
            aria-label="中文提示词"
          />
          <label className={`${labelCls} mt-2`} htmlFor="imagegen-prompt-en">
            提示词（英文，填了优先用英文）
          </label>
          <textarea
            id="imagegen-prompt-en"
            className="field w-full"
            rows={3}
            value={promptEn}
            onChange={(e) => setPromptEn(e.target.value)}
            placeholder="English prompt (optional)"
            aria-label="英文提示词"
          />
        </div>

        <div className="mt-3">
          <p className={labelCls}>参考素材（{refs.length} / 16）</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-sm"
              aria-label="上传参考图片"
              onClick={() => fileRef.current?.click()}
            >
              上传参考图
            </button>
            {selectedPreset && selectedPreset.images.length > 0 && (
              <button
                type="button"
                className="btn btn-sm"
                aria-label="把所选资产卡的图片加入参考素材"
                onClick={addPresetRefs}
              >
                从储存库选图（加入本卡图片）
              </button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            aria-label="上传参考图片文件"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length > 0) addRefFiles(files);
              e.target.value = "";
            }}
          />
          {refMsg && (
            <p className="mt-1 text-[11px] leading-4" style={{ color: "var(--bad)" }} role="status">
              {refMsg}
            </p>
          )}
          {refs.length > 0 && (
            <p className="mt-2 text-[11px] leading-4 text-[var(--dim)]" role="note">
              点「生成图片」时，已选参考图会自动上传换链接再交给 Geeknow：先走 Geeknow 自家上传（图传到 Geeknow 自家空间），自家上传走不通时才自动改走公开图床换链接（只有走公开图床那条路时，才是拿到链接的人能打开这张图、短期后自动删除），不用再勾选。
            </p>
          )}
          {refs.length > 0 && (
            <p className="mt-1.5 text-[11px] leading-4 text-[var(--dim)]">
              带参考图提交时，实际提交的提示词末尾会自动加一句锁脸要求（保持参考图里同一个人的脸、只改服装发型姿势场景），记录里会存下这次实际带了几张图、什么来源，事后能查。
            </p>
          )}
          {autoRefNote && refs.some((r) => r.origin === "auto") && (
            <div
              className="mt-2 flex flex-wrap items-center gap-2 rounded-[var(--radius)] border px-2.5 py-1.5"
              style={{ borderColor: "var(--border)", background: "var(--accent-soft)" }}
              role="status"
              aria-label="自动带入的人物参考图"
            >
              <p className="min-w-0 flex-1 text-[12px] leading-5">
                {autoRefNote}。生成时会按这张图锁脸；不需要就点清除，手动上传的图不受影响。
              </p>
              <button
                type="button"
                className="btn btn-sm shrink-0"
                aria-label="清除自动带入的人物参考图（只删自动带入的，手动上传的不动）"
                onClick={() => {
                  setRefs((prev) => prev.filter((r) => r.origin !== "auto"));
                  setAutoRefNote(null);
                }}
              >
                清除
              </button>
            </div>
          )}
          {refDegradeNote && (
            <p className="mt-2 text-[11px] leading-4" style={{ color: "var(--dim)" }} role="note">
              {refDegradeNote}
            </p>
          )}
          {refs.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {refs.map((r, i) => (
                <figure key={i} className="w-[64px]">
                  <img
                    src={r.preview}
                    alt={`参考素材${i + 1}：${r.label}`}
                    className="h-12 w-[64px] rounded object-cover"
                    style={{ outline: "1px solid var(--border)", outlineOffset: "-1px" }}
                  />
                  <button
                    type="button"
                    className="btn btn-sm mt-0.5 w-full"
                    aria-label={`删除参考素材${i + 1}：${r.label}`}
                    onClick={() =>
                      setRefs((prev) => prev.filter((_, j) => j !== i))
                    }
                  >
                    删除
                  </button>
                </figure>
              ))}
            </div>
          )}
        </div>

        <p
          className="mt-3 text-[11px] leading-4"
          style={{ color: submitPromptOver ? "var(--bad)" : "var(--dim)" }}
          role={submitPromptOver ? "alert" : undefined}
        >
          {submitPromptLen > 0 ? (
            <>
              实际提交的提示词（{promptEn.trim() ? "英文" : "中文"}）共{" "}
              <span className="tc font-bold">{submitPromptLen}</span> 字符 ·
              Geeknow 上限 {GEEKNOW_PROMPT_HARD_LIMIT} 字符
              {submitPromptOver
                ? `，已超过 ${SUBMIT_PROMPT_BUDGET} 字符的安全线：先删减提示词再生成，否则提交会被服务商以「提示词过长」拒绝。`
                : "，在安全线内。"}
            </>
          ) : (
            <>提示词字数会显示在这里（Geeknow 上限 {GEEKNOW_PROMPT_HARD_LIMIT} 字符）。</>
          )}
        </p>
        <button
          type="button"
          className="btn btn-primary mt-2 w-full"
          aria-label={
            isEditMode
              ? "开始改图（按 Geeknow 账户计费，以参照图为原图只改指定部位，提交后立刻生成一条改图记录）"
              : "生成图片（按 Geeknow 账户计费，提交后立刻生成一条记录，可继续给其他人物提交）"
          }
          disabled={
            submitting ||
            (isEditMode
              ? !editRequest.trim() || refs.length === 0
              : (!promptZh.trim() && !promptEn.trim()) || submitPromptOver)
          }
          onClick={() => void runGenerate()}
        >
          {submitting ? "提交中…" : isEditMode ? "开始改图" : "生成图片"}
        </button>
        {!isEditMode && !promptZh.trim() && !promptEn.trim() && (
          <p className="mt-1 text-[11px] leading-4 text-[var(--dim)]">
            先选一个人物自动拼提示词，或自己填提示词，才能生成。
          </p>
        )}
        {isEditMode && !editRequest.trim() && (
          <p className="mt-1 text-[11px] leading-4 text-[var(--dim)]">
            先在上方「改图」区写清要改的部位，才能开始改图。
          </p>
        )}
        <p className="mt-1 text-[11px] leading-4 text-[var(--dim)]">
          提交成功立刻在下方生成一条记录，之后不用等：可以换下一个人接着提交，每个任务独立轮询、独立出图、独立保存，互不阻塞；一个任务失败不会取消其他任务。并行方式为「并行提交，逐任务独立轮询」——服务商的并发上限没有确认过，面板不编造上限数字；若服务商排队，记录状态会如实停在生成中。关闭或最小化面板不会取消已提交的任务，重开面板会逐条续查。
        </p>
        {submitError && (
          <p
            className="mt-2 rounded-[var(--radius)] border px-2.5 py-1.5 text-[12.5px] leading-5"
            style={{ borderColor: "var(--border)", color: "var(--bad)" }}
            role="alert"
          >
            {submitError}
          </p>
        )}
        {hostRouteNote && (
          <p
            className="mt-2 text-[12px] leading-5 text-[var(--dim)]"
            role="status"
          >
            {hostRouteNote}
          </p>
        )}

        <div
          className="mt-4 border-t pt-3"
          style={{ borderColor: "var(--border)" }}
        >
          <p className="text-[13px] font-bold">
            生成记录{records.length > 0 ? `（${records.length}）` : ""}
          </p>
          {recordsQuery.isPending ? (
            <p className="mt-1 text-[12px] text-[var(--dim)]">正在读取记录…</p>
          ) : recordsQuery.isError ? (
            <div className="mt-1" role="alert">
              <p className="text-[12px] leading-5" style={{ color: "var(--bad)" }}>
                生成记录没读出来：{describeThrownError(recordsQuery.error)}
                。记录都在库里没有丢，点重试再读一次。
              </p>
              <button
                type="button"
                className="btn btn-sm mt-1.5"
                aria-label="重试读取生成记录"
                disabled={recordsQuery.isFetching}
                onClick={() => void recordsQuery.refetch()}
              >
                {recordsQuery.isFetching ? "读取中…" : "重试读取记录"}
              </button>
            </div>
          ) : records.length === 0 ? (
            <p className="mt-1 text-[12px] leading-5 text-[var(--dim)]">
              还没有生成记录。点上面的「生成图片」提交后，这里立刻出现一条记录，出图、失败、保存到哪张卡都记在这里，刷新、重开、切换项目都不会丢。
            </p>
          ) : (
            <div className="mt-2 space-y-2.5">
              {records.map((rec) => {
                const statusLabel =
                  RECORD_STATUS_LABEL[rec.status] ?? rec.status;
                const expanded = !!expandedIds[rec.id];
                const msg = recordMsg[rec.id];
                const polls = pollCounts[rec.id] ?? 0;
                const inFlight =
                  rec.status === "submitted" || rec.status === "generating";
                const resubmitArmed = !!confirmIds[`resubmit:${rec.id}`];
                const deleteArmed = !!confirmIds[`delete:${rec.id}`];
                // v5.63：存卡目标按人物记下来的来源卡解析（按钮显
                // 示的卡名与实际落卡都用它）；解析不出（单字母代
                // 号无来源、记录里的同字母卡只是旧同名兜底）时不
                // 显示存卡按钮，只剩「设为人物图」。
                const saveTarget = recordPresetTarget(rec);
                return (
                  <article
                    key={rec.id}
                    className="rounded-[var(--radius)] border p-2.5"
                    style={{
                      borderColor: "var(--border)",
                      background: "var(--surface-alt)",
                    }}
                    aria-label={`生图记录：${rec.personName || "手动提示词"}，状态${statusLabel}`}
                  >
                    <div className="flex gap-2.5">
                      {rec.imageUrl ? (
                        <button
                          type="button"
                          className="shrink-0 cursor-pointer rounded"
                          aria-label={`看大图：生图记录${rec.personName || ""}的出图（弹窗看大图）`}
                          onClick={() => setLightboxRec(rec)}
                        >
                          <PreviewImg
                            src={rec.imageUrl}
                            previewSrc={rec.previewUrl}
                            previewRef={
                              rec.stagedKey
                                ? { kind: "staged", stagedKey: rec.stagedKey }
                                : undefined
                            }
                            onBackfilled={() => void invalidateRecords()}
                            alt={`${rec.personName || "生成"}的出图缩略图`}
                            className="h-14 w-14 rounded object-cover"
                            style={{
                              outline: "1px solid var(--border)",
                              outlineOffset: "-1px",
                            }}
                          />
                        </button>
                      ) : (
                        <div
                          className="flex h-14 w-14 shrink-0 flex-col items-center justify-center gap-1 rounded text-[11px] text-[var(--dim)]"
                          style={{ outline: "1px solid var(--border)" }}
                          aria-hidden="true"
                        >
                          {inFlight ? (
                            <>
                              <span
                                className="inline-block h-4 w-4 animate-spin rounded-full"
                                style={{
                                  border: "2px solid var(--border)",
                                  borderTopColor: "var(--accent)",
                                }}
                              />
                              <span className="animate-pulse">生成中</span>
                            </>
                          ) : (
                            "无图"
                          )}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-bold leading-5">
                          {rec.personName || "手动提示词"}
                          <span
                            className="ml-2 rounded-full px-2 py-0.5 text-[11px] font-bold"
                            style={{
                              background: "var(--accent-soft)",
                              color:
                                rec.status === "failed" ||
                                rec.status === "expired"
                                  ? "var(--bad)"
                                  : "var(--text)",
                            }}
                          >
                            {statusLabel}
                          </span>
                        </p>
                        <p className="mt-0.5 text-[11px] leading-4 text-[var(--dim)]">
                          {new Date(rec.createdAt).toLocaleString()} ·{" "}
                          {rec.model} · {rec.quality} · {rec.ratio} ·{" "}
                          {rec.threeView ? "三视图" : "普通单图"} · 线路{" "}
                          {rec.line}
                        </p>
                        <p className="text-[11px] leading-4 text-[var(--dim)]">
                          任务号 {rec.taskId ?? "（同步出图，无任务号）"}
                          {inFlight && polls > 0
                            ? ` · 已查询 ${polls} 次`
                            : ""}
                        </p>
                        {rec.refImageCount != null &&
                          (rec.refSent ? (
                            <p
                              className="text-[11px] leading-4"
                              style={{ color: "var(--olive)" }}
                            >
                              参考图：已带 {rec.refImageCount} 张（
                              {rec.refSource ?? "来源未记录"}）
                            </p>
                          ) : (
                            <p className="text-[11px] leading-4 text-[var(--dim)]">
                              参考图：这次没带参考图（
                              {rec.refSource ?? "未发送"}）
                            </p>
                          ))}
                        {(rec.promptZh || rec.promptEn) && (
                          <p
                            className="mt-0.5 truncate text-[11px] leading-4 text-[var(--dim)]"
                            title={rec.promptZh || rec.promptEn}
                          >
                            提示词：
                            {(rec.promptZh || rec.promptEn).length > 60
                              ? `${(rec.promptZh || rec.promptEn).slice(0, 60)}…`
                              : rec.promptZh || rec.promptEn}
                          </p>
                        )}
                        {rec.savedPresetId != null && (
                          <p className="text-[11px] leading-4" style={{ color: "var(--olive)" }}>
                            已存到资产卡「{rec.savedPresetName}」
                          </p>
                        )}
                        {rec.savedCharacterId != null && (
                          <p className="text-[11px] leading-4" style={{ color: "var(--olive)" }}>
                            已设为剧本人物「{rec.savedCharacterName}」的人物图
                          </p>
                        )}
                        {rec.savedSceneAssetId != null && (
                          <p className="text-[11px] leading-4" style={{ color: "var(--olive)" }}>
                            已设为场景资产「{rec.savedSceneAssetName}」的场景图
                          </p>
                        )}
                      </div>
                    </div>
                    {rec.error && (
                      <p
                        className="mt-1.5 text-[12px] leading-5"
                        style={{ color: "var(--bad)" }}
                        role="status"
                      >
                        {rec.error}
                      </p>
                    )}
                    {msg && (
                      <p className="mt-1.5 text-[12px] leading-5" role="status">
                        {msg}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        className="btn btn-sm"
                        aria-expanded={expanded}
                        aria-label={`${expanded ? "收起" : "展开"}生图记录${rec.personName || ""}的完整提示词与状态`}
                        onClick={() =>
                          setExpandedIds((prev) => ({
                            ...prev,
                            [rec.id]: !expanded,
                          }))
                        }
                      >
                        {expanded ? "收起详情" : "看提示词"}
                      </button>
                      {rec.status === "done" && rec.imageUrl && (
                        <button
                          type="button"
                          className="btn btn-sm"
                          aria-label={`预览生图记录${rec.personName || ""}的出图（面板内弹窗看大图）`}
                          onClick={() => setLightboxRec(rec)}
                        >
                          预览出图
                        </button>
                      )}
                      {rec.status === "done" && rec.imageUrl && (
                        <button
                          type="button"
                          className="btn btn-sm"
                          aria-label={`下载生图记录${rec.personName || ""}的出图原图`}
                          disabled={!!downloadingIds[rec.id]}
                          onClick={() => void downloadRecord(rec)}
                        >
                          {downloadingIds[rec.id] ? "下载中…" : "下载"}
                        </button>
                      )}
                      {rec.status === "done" &&
                        saveTarget != null &&
                        rec.characterId != null && (
                          <button
                            type="button"
                            className="btn btn-sm btn-primary"
                            aria-label={`把这张图存到储存库资产卡${saveTarget.name}，并设为剧本人物${rec.characterName}的人物图`}
                            disabled={!!savingIds[rec.id]}
                            onClick={() =>
                              void saveRecToPresetAndCharacter(rec)
                            }
                          >
                            {savingIds[rec.id]
                              ? "保存中…"
                              : `存到资产卡「${saveTarget.name}」并设为人物图`}
                          </button>
                        )}
                      {rec.status === "done" &&
                        saveTarget != null &&
                        rec.characterId == null && (
                          <button
                            type="button"
                            className="btn btn-sm btn-primary"
                            aria-label={`把这张图存到储存库资产卡${saveTarget.name}`}
                            disabled={!!savingIds[rec.id]}
                            onClick={() => void saveRecToPreset(rec)}
                          >
                            {savingIds[rec.id]
                              ? "保存中…"
                              : `存到资产卡「${saveTarget.name}」`}
                          </button>
                        )}
                      {rec.status === "done" &&
                        rec.characterId != null &&
                        saveTarget == null && (
                          <button
                            type="button"
                            className="btn btn-sm btn-primary"
                            aria-label={`把这张图设为剧本人物${rec.characterName}的人物图`}
                            disabled={!!savingIds[rec.id]}
                            onClick={() => void saveRecToCharacter(rec)}
                          >
                            {savingIds[rec.id]
                              ? "保存中…"
                              : `设为「${rec.characterName}」人物图`}
                          </button>
                        )}
                      {rec.status === "done" && rec.sceneAssetId != null && (
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          aria-label={`把这张图设为场景资产${rec.sceneAssetName}的场景图`}
                          disabled={!!savingIds[rec.id]}
                          onClick={() => void saveRecToScene(rec)}
                        >
                          {savingIds[rec.id]
                            ? "保存中…"
                            : `设为「${rec.sceneAssetName}」场景图`}
                        </button>
                      )}
                      {inFlight && rec.taskId && (
                        <button
                          type="button"
                          className="btn btn-sm"
                          aria-label={`续查生图记录${rec.personName || ""}的同一个任务（不重新提交、不重复计费）`}
                          onClick={() => {
                            pollingRef.current.delete(rec.id);
                            void pollRecordRef.current(rec);
                          }}
                        >
                          续查
                        </button>
                      )}
                      {(rec.status === "failed" || rec.status === "expired") &&
                        (resubmitArmed ? (
                          <>
                            <button
                              type="button"
                              className="btn btn-sm btn-primary"
                              aria-label={`确认重新提交新任务（生图记录${rec.personName || ""}，这是新任务、重新计费）`}
                              disabled={submitting}
                              onClick={() => {
                                setConfirmIds((prev) => ({
                                  ...prev,
                                  [`resubmit:${rec.id}`]: false,
                                }));
                                void resubmitRecord(rec);
                              }}
                            >
                              确认，这是新任务（重新计费）
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm"
                              aria-label="取消重新提交"
                              onClick={() =>
                                setConfirmIds((prev) => ({
                                  ...prev,
                                  [`resubmit:${rec.id}`]: false,
                                }))
                              }
                            >
                              取消
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-sm"
                            aria-label={`重新提交新任务（生图记录${rec.personName || ""}失败后重提，会产生新任务）`}
                            onClick={() =>
                              setConfirmIds((prev) => ({
                                ...prev,
                                [`resubmit:${rec.id}`]: true,
                              }))
                            }
                          >
                            重新提交新任务
                          </button>
                        ))}
                      {rec.status === "failed" && rec.taskId && (
                        <button
                          type="button"
                          className="btn btn-sm"
                          aria-label={`先续查生图记录${rec.personName || ""}的原任务号（不重新提交）`}
                          onClick={() => {
                            pollingRef.current.delete(rec.id);
                            void pollRecordRef.current({
                              ...rec,
                              status: "generating",
                            });
                          }}
                        >
                          先续查原任务
                        </button>
                      )}
                      {deleteArmed ? (
                        <>
                          <button
                            type="button"
                            className="btn btn-sm btn-danger-ghost"
                            aria-label={`确认删除生图记录${rec.personName || ""}（只删记录，不删已保存到卡上的图）`}
                            onClick={() => void deleteRecord(rec)}
                          >
                            确认删除记录（不删卡上的图）
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm"
                            aria-label="取消删除记录"
                            onClick={() =>
                              setConfirmIds((prev) => ({
                                ...prev,
                                [`delete:${rec.id}`]: false,
                              }))
                            }
                          >
                            取消
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-sm btn-danger-ghost"
                          aria-label={`删除生图记录${rec.personName || ""}（只删记录条目）`}
                          onClick={() =>
                            setConfirmIds((prev) => ({
                              ...prev,
                              [`delete:${rec.id}`]: true,
                            }))
                          }
                        >
                          删除记录
                        </button>
                      )}
                    </div>
                    {expanded && (
                      <div className="mt-2 space-y-1.5 border-t pt-2" style={{ borderColor: "var(--border)" }}>
                        <p className="text-[11px] font-bold text-[var(--dim)]">中文提示词</p>
                        <p className="whitespace-pre-wrap text-[12px] leading-5">{rec.promptZh || "（空）"}</p>
                        <p className="text-[11px] font-bold text-[var(--dim)]">英文提示词（填了优先用英文）</p>
                        <p className="whitespace-pre-wrap text-[12px] leading-5">{rec.promptEn || "（空）"}</p>
                        <p className="text-[11px] leading-4 text-[var(--dim)]">
                          保存目标：资产卡 {saveTarget?.name || "未关联"}；剧本人物 {rec.characterName || "未关联"}；场景资产 {rec.sceneAssetName || "未关联"}。
                        </p>
                        {rec.refImageCount == null ? (
                          <p className="text-[11px] leading-4 text-[var(--dim)]">
                            参考图溯源：无溯源记录（旧版本）——这条记录是溯源功能上线前提交的，当时没存带没带参考图，查不到。
                          </p>
                        ) : (
                          <p className="text-[11px] leading-4 text-[var(--dim)]">
                            参考图溯源：
                            {rec.refSent
                              ? `实际带了 ${rec.refImageCount} 张、已发给服务商`
                              : "这次没有把参考图发给服务商"}
                            ；来源：{rec.refSource ?? "未记录"}
                            {rec.refHostHashes.length > 0
                              ? `；托管链接哈希：${rec.refHostHashes
                                  .map((h) => h.slice(0, 8))
                                  .join("、")}`
                              : ""}
                            。重新提交不带参考图（记录只存溯源与哈希，不存参考图本体）。
                          </p>
                        )}
                        {rec.status === "done" && rec.imageUrl && (
                          <img
                            src={rec.previewUrl ?? rec.imageUrl}
                            alt={`${rec.personName || "生成"}的出图预览`}
                            loading="lazy"
                            decoding="async"
                            className="w-full rounded-[var(--radius)]"
                            style={{
                              outline: "1px solid var(--border)",
                              outlineOffset: "-1px",
                            }}
                          />
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
      {/* v4.20 出图大图预览（面板内弹窗）：旧版「预览出图」是
          <a target="_blank" href={blob 地址}>——blob 地址带沙箱响应
          头、且在新标签页里脱离了工作台的会话上下文，打开只剩
          about:blank 空白页（用户实报）。改成与封面页同款的页内
          弹层：图直接用记录里已在缩略图 / 展开区正常显示的同一
          地址渲染，不开新页、不受弹窗拦截；点任意处或「关闭」
          收起。z-[70] 压过面板自身的 z-[60]。 */}
      {lightboxRec?.imageUrl && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          style={{ background: "rgba(3, 5, 9, 0.78)" }}
          role="dialog"
          aria-modal="true"
          aria-label={`出图大图预览：${lightboxRec.personName || "生成图"}`}
          onClick={() => setLightboxRec(null)}
        >
          <img
            src={lightboxRec.imageUrl}
            alt={`${lightboxRec.personName || "生成"}的出图大图`}
            className="max-h-[86vh] w-auto max-w-full rounded-[var(--radius)]"
          />
          <button
            type="button"
            className="btn btn-sm absolute right-4 top-4"
            aria-label="关闭出图大图预览"
            onClick={() => setLightboxRec(null)}
          >
            关闭
          </button>
          <button
            type="button"
            className="btn btn-sm btn-primary absolute bottom-4 right-4"
            aria-label={`下载这张出图原图（${lightboxRec.personName || ""}）`}
            disabled={!!downloadingIds[lightboxRec.id]}
            onClick={(e) => {
              e.stopPropagation();
              void downloadRecord(lightboxRec);
            }}
          >
            {downloadingIds[lightboxRec.id] ? "下载中…" : "下载原图"}
          </button>
        </div>
      )}
    </section>
  );
}
