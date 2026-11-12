// 人物资产储存库 — integrated as the second workbench inside the same
// fixed page as the script workbench. Since v3.26 the library is a
// pure storage library: it only stores character assets and publishes
// them to a script project. Every entry is a character card — asset
// images on the card face （自定义导入 / 换图 / 改图 / 删图 / 设为主图；
// v4.26 起卡面图片区右上角是「改图」：以当前主图为参照图、生图面板
// 改图模式打开，加图走拖拽上传与无图卡点击上传；v5.52 起原先
// 在卡面「编辑更多」里的图组管理入口已随该按钮删除）,
// 姓名 / 故事中扮演 / 性格或外貌备注 edited directly on the card
// (saved on blur), a 分类 selector, and exactly two main actions:
// 发布到剧本 and 删除. The 3:4 生图设计 surfaces that used to live
// here （字段编辑： 10 个部位中英文；提示词预览： 中英文 + 负面提示词）
// and the 复制设定卡 / 锁定 actions are REMOVED from this library —
// they belong to image-generation design, not storage. (The standalone
// 3:4 workbench artifact keeps its own field editor / prompt preview;
// the two libraries are not synced.) In their place the left window
// list is now a 分类栏： 全部 + user-managed categories with live card
// counts; the `window` value IS the selected category filter ("全部"
// or a category name), and a 姓名 search box stacks on top of it.
// A 分类管理 section in the pane lists every category with its own
// 改名 / 删除 buttons (v3.27; previously rename/delete only appeared
// for the currently selected category).
// Categories are library-only bookkeeping: publishing sends only
// 姓名 / 扮演 / 备注 / 主图， never the category.
// v5.50 系统分类：每张卡另有服务端字段 gender（男 / 女）+ ageGroup
// （成年 / 未成年，18 岁为界）+ classUncertain（存疑）+ classNote
// （判断依据），与用户自管 category 完全独立。列表上方有系统分类
// 筛选 chips（全部 / 男-成年 / 男-未成年 / 女-成年 / 女-未成年，
// 带实时计数，与分类栏、姓名搜索叠加生效）；存疑卡在卡面姓名旁
// 标「存疑」徽章，判断依据挂在徽章的悬停提示里。
// v5.51 详情悬浮窗：卡面「填写」按钮整块删除；点「展开详情」改为
// 打开居中悬浮窗（遮罩 + 关闭按钮），窗内只展示并可编辑 6 项——
// 姓名（卡片名）、性别（v5.50 的 gender 字段）、分类（category）、
// 造型、音色、语气基调，后三项以标签段存 cardNote（与剧本人物卡
// 同口径），一次「确认保存」经同一个 saveAssetPreset 动作写回。
// v5.51 时年龄 / 性格、图组、扮演、备注全文、删卡等其余编辑曾留在
// 卡面「编辑更多」里；v5.52（用户 2026-11-09 04:31 亲口定）把
// 「编辑更多」按钮与其卡内展开区整套删除——删后卡上不再有任何
// 超出这 6 项的编辑入口，与「悬浮窗固定只有 6 项」长期口径一致；
// 卡片原有字段（年龄 / 性格 / 扮演 / 备注全文 / 图组等）数据全部
// 保留不删，只是不再从卡面编辑。关窗回到卡片列表，筛选与滚动
// 位置不变（筛选状态在列表层、弹窗开关是卡内状态）。
// v5.53 储存库 AI 分析：工具栏有批量按钮「一键AI分析（N张）」
// （有人已出待确认结果、还有没跑的卡时变「接着跑剩下的人」），
// 每张卡按钮行有单人「AI 分析」；都走与分镜页人物分析同一条任
// 务制链路（preset 变体：造型按卡的主图、音色 / 语气基调按图 +
// 备注里的身份 / 年龄 / 分类推，卡无台词）。结果只写卡的
// pending 待确认列（深存、刷新不丢、卡面标「AI 待确认」），永
// 不直接覆盖已存值、永不改性别；详情悬浮窗 6 项下方（不计入
// 6 项）有待确认对照块：逐项「已存 → 待确认」+ 来源 + 时间，
// 可整卡「确认并同步到卡片」、逐项「只确认此项」、以及
// 「恢复上一版（确认前的已存值）」。字段级口径：待确认来源为
// manual 的字段分析不覆盖、含 manual 待确认字段的卡批量整卡
// 跳过；用户在悬浮窗亲手改了某项已存值且该项有待确认值时，该
// 项来源标 manual。
// v5.56 悬浮窗图片区（用户 2026-11-09 17:46 亲口定，悬浮窗长期
// 口径由「固定只有 6 项」改为「6 项文字＋右侧图片区」）：悬浮窗
// 右侧放这张卡的全部图片（换服装照片都在里面，并排显示），6
// 项文字在左侧不动。每张图各存自己的造型（images[].look），
// 卡片造型恒等于当前主体图的造型：非主体图右下角有「设为主
// 体」按钮（走既有 setAssetPresetImagePrimary，服务端同步换
// 卡片造型、音色 / 语气基调不动），主体图标「主体」徽章、不
// 显示设为主体按钮。新加图片（拖拽 / 点击上传 / 生图面板存到
// 资产卡）自动走单图造型分析链只分析造型、结果进这张图的待
// 确认，确认后才填进这张图的造型；已有非主体图缺造型的在图
// 片区有单个「分析造型」入口，点一下跑一个、不自动批量跑；
// 主体图缺造型时沿用卡片现有造型（服务端回填）。手机宽度下
// 图片区堆叠到 6 项下面。
// v5.62 图片区改竖排（用户 2026-11-09 21:13 定）：每件衣服一
// 行，图在左、这张图的造型提示词在右（全文显示，不再三行截
// 断）；衣服多了随悬浮窗向下滚动看；行内在窄宽度下堆叠（图
// 上、文字下）。「设为主体」/「主体」徽章位置与口径不变；生
// 图面板存进卡的新图若走了 v5.62 提示词直写，造型已直接写进
// look、不经这里的待确认（其余新图仍自动分析进待确认）。
// v5.64 图片统一正方形画框（用户 2026-11-09 22:17 亲口选定推
// 荐方案）：每行图放进统一的 140×140 正方形画框，图按原比例
// 完整显示（object-fit: contain，一点不裁），多余空间用悬浮
// 窗同色底（--surface）填充，框尺寸与行高全部统一；裁剪填满
// （cover）用户已明确不要。只改显示：原图数据、图片比例、
// 主体设定、任何字段都不动；点图放大仍原图全质、缩略图仍走
// 480px 降质通道（PreviewImg 口径不变）。
// v5.65 删除两入口（用户 2026-11-09 22:31 亲口定，①批量删选
// b、②确认框选 a）：①详情悬浮窗右侧图片区每行加红色「删除」
// 按钮（主体图那行也有），点后先弹 ConfirmDialog（明说删除不
// 可恢复），确认才走既有 deleteAssetPresetImage；删的是主体图
// 时服务端让下一张接任主体、卡片造型跟新主体走（v5.56 口
// 径），删到一张不剩时卡与造型文字都保留；图 blob 只在无其
// 他引用时才清（deleteBlobIfUnreferenced 查人物 / 储存库 /
// 场景三处引用），项目人物图共用的图删了这边那边照常显示。
// ②列表工具栏加「批量删除」入口：进入批量模式后每张卡左上
// 角出勾选框（可多选，筛选 / 搜索切换不丢已选），工具栏出
// 「删除所选（N）」+「退出批量」；点删除先弹确认框（逐张列
// 卡名与图数、明说不可恢复），确认后逐张走既有
// deleteAssetPreset；退出批量模式清空勾选。批量选择态下卡面
// 原有按钮（发布到剧本 / 展开详情 / AI 分析等）照常可用。
// v5.66 悬浮窗造型收起＋图片区独立滚动（用户 2026-11-09
// 22:58 截图亲口定）：①每行「这张图的造型」默认只显 3 行
// （line-clamp-3），文字够长时行下有「展开 / 收起」按钮，逐
// 行独立状态（lookExpanded 按图 id 记），互不影响；待确认对
// 照块与「恢复上一版」随行口径不变。②悬浮窗面板改 flex 列
// 布局、整体不再滚动：右侧图片区自带 max-height +
// overflow-y auto 独立滚动，左侧 6 项＋AI 分析待确认＋底部
// 取消 / 确认保存按钮固定不动、不随图片区滚；面板整体仍封
// 顶 max-h 88vh。手机宽度（单栏堆叠）时内容区整体可滚、图
// 片区再封顶 45vh 独立滚动，不溢出。只改显示与滚动：统一
// 画框（v5.64）、设为主体、删除按钮（v5.65）、6 项内容与
// 保存、任何存储数据都不动。
// v5.98 主文件 ⇄ 子文件双向打通（用户亲口定：人物 = 主文件、
// 卡上的服装图 = 子文件）：①详情悬浮窗图片区每行（主体行也
// 有）加「拆成独立人物」按钮——点了先弹确认框（可改新卡名，
// 默认名带原卡的性别 / 年龄分类，方便拆完认人），确认走新动
// 作 promotePresetImage：这张图连同它自己的造型从本卡移出、
// 成为一张新人物卡的主体图，新卡继承本卡的分类与音色 / 语
// 气基调；拆的是主体图时本卡下一张接任主体、左侧造型同步
// 成服务端回的新值（与删图同口径），回执写 imgLookNotice。
// ②图片区下方加「把别的人物加进来当服装」：下拉选任意一张
// 其他带图的人物卡，点「加进来」走新动作
// attachPresetAsSubImage——对方的主体图连同它的造型挂到本
// 卡图片列表末尾当一张服装图，来源卡本身还在、仍是独立人
// 物。两处都不自动生图、不碰剧本项目。

import { useEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type ApiResponse } from "./api";
import { ConfirmDialog } from "./confirm";
import { openImageGenPanel } from "./imagegen";
import { PreviewImg } from "./previewimg";
import {
uploadImageFileInChunks,
uploadErrorText,
type ChunkedImageRef,
} from "./chunkedupload";
import { describeThrownError, retryReadQuery, withReadTimeout } from "./gateway";
import { urlToSubmitReference } from "./scriptlib";
import { runPresetImageLookCore } from "./presetimagelook";

// The selected library "window" is the active category filter.
export type CharWindow = string;

type Preset = ApiResponse<typeof api, "listAssetPresets">["presets"][number];
type CategoryCount = ApiResponse<typeof api, "listAssetPresets">["categories"][number];

// 「查看」四档（v3.30；v3.47 改默认）：只是查看方式，不改任何数据——
// 同一批卡、同一套图 / 姓名 / 扮演 / 备注 / 分类 / 发布逻辑。超大卡片
// = v3.29 之前的全量卡面；每次打开默认小卡片（v3.47），当次可手动
// 切换、刷新 / 重进回到小卡片。档位越小卡面越收起；编辑统一走
// 「展开详情」悬浮窗的 6 项（v5.52 起卡面已无「编辑更多」入口）。
export type LibraryCardSize = "lg" | "sm";
export const LIBRARY_CARD_SIZES: { key: LibraryCardSize; label: string }[] = [
  { key: "lg", label: "大卡片" },
  { key: "sm", label: "小卡片" },
];

// 系统分类筛选档位（v5.50）：「性别-年龄组」组合键，与卡上的
// gender / ageGroup 字段现算对应；「全部」不过滤。
export const CLASS_FILTERS = [
  "全部",
  "男-成年",
  "男-未成年",
  "女-成年",
  "女-未成年",
] as const;

/** v3.59：超大 / 中卡两档已删除——任何旧存值（xl / md 或其他）一律
 * 回落到小卡片，绝不出现空白档位。 */
export function sanitizeLibraryCardSize(v: string | null): LibraryCardSize {
  return v === "lg" ? "lg" : "sm";
}

// Full save payload for saveAssetPreset: the card-face fields the user
// edits here, plus the legacy 3:4 part fields carried through verbatim
// (existing cards keep whatever part text they already hold; the
// library UI no longer edits or previews it).
function savePayload(p: Preset, patch: Partial<Preset>) {
  const d = { ...p, ...patch };
  return {
    id: d.id,
    name: d.name,
    locked: false,
    personZh: d.personZh,
    personEn: d.personEn,
    hairZh: d.hairZh,
    hairEn: d.hairEn,
    hatZh: d.hatZh,
    hatEn: d.hatEn,
    faceZh: d.faceZh,
    faceEn: d.faceEn,
    neckZh: d.neckZh,
    neckEn: d.neckEn,
    topZh: d.topZh,
    topEn: d.topEn,
    armsZh: d.armsZh,
    armsEn: d.armsEn,
    bottomZh: d.bottomZh,
    bottomEn: d.bottomEn,
    shoesZh: d.shoesZh,
    shoesEn: d.shoesEn,
    extraZh: d.extraZh,
    extraEn: d.extraEn,
    cardRole: d.cardRole,
    cardNote: d.cardNote,
    category: d.category,
    // 系统分类四字段（v5.50）：原样透传，普通保存不改分类（出参
    // 是宽 string，这里收窄到入参枚举，异常值按未归类处理）。
    gender: (d.gender === "男" ? "男" : d.gender === "女" ? "女" : "") as "" | "男" | "女",
    ageGroup: (d.ageGroup === "成年" ? "成年" : d.ageGroup === "未成年" ? "未成年" : "") as "" | "成年" | "未成年",
    classUncertain: d.classUncertain,
    classNote: d.classNote,
  };
}

function blankPayload(category: string) {
  return {
    name: "未命名人物",
    locked: false,
    personZh: "",
    personEn: "",
    hairZh: "",
    hairEn: "",
    hatZh: "",
    hatEn: "",
    faceZh: "",
    faceEn: "",
    neckZh: "",
    neckEn: "",
    topZh: "",
    topEn: "",
    armsZh: "",
    armsEn: "",
    bottomZh: "",
    bottomEn: "",
    shoesZh: "",
    shoesEn: "",
    extraZh: "",
    extraEn: "",
    cardRole: "",
    cardNote: "",
    category,
  };
}

// ---------------------------------------------------------------------------
// 人物基础信息里的造型 / 性别 / 年龄 / 性格 / 音色 / 语气基调：这几项
// 没有独立列，统一以「造型：…；性别：…；年龄：…；性格：…；音色：…；
// 语气基调：…」标签段存进 cardNote（备注），其余备注文字原样保留。
// 详情悬浮窗读写这些段。解析不凭空编造，来源
// 顺序写死：
//   造型：备注「造型：」段 → 备注「外貌：」段（旧口径）→ 已存部位
//         字段（发型 / 面部 / 上衣 / 下装 / 鞋子 / 补充）拼接 →
//         personZh 简述 → 备注去掉其他标签段后的简述（截断，不贴
//         全文）；都没有显示「未填写」。
//   性别：备注「性别：」段 → personZh / 备注里明确的男 / 女称谓。
//         （注意：这是备注里的性别段，与 v5.50 的 gender 字段是两
//         套——详情悬浮窗里改的是 gender 字段，这一段只供「编辑
//         更多」沿用旧口径读写。）
//   年龄：备注「年龄：/ 年龄段：」段（只存年龄段或约数，如青年人、
//         20岁出头，不编精确岁数）→ personZh / 备注里的「X 岁」约数
//         或年龄段词 → 分类本身是年龄段分类时用分类。
//   音色 / 语气基调（v5.51 新增）：只认备注里已存的同名标签段，
//         没有就空，绝不从别处猜。

type BasicInfo = {
  appearance: string;
  gender: string;
  age: string;
  /** v3.69 新增：性格，只认备注里的「性格：」段。 */
  personality: string;
  /** v5.51 新增：音色，只认备注里的「音色：」段。 */
  voice: string;
  /** v5.51 新增：语气基调，只认备注里的「语气基调：」段。 */
  tone: string;
};

function cleanSegmentValue(v: string): string {
  return v.trim().replace(/[；;\n]+/g, "，").replace(/。+$/, "").trim();
}

function labelledSegment(note: string, labels: string[]): string {
  for (const label of labels) {
    const m = note.match(new RegExp(`${label}[:：]\s*([^；;\n]+)`));
    if (m?.[1]) return m[1].trim().replace(/。+$/, "").trim();
  }
  return "";
}

function stripLabelledSegments(note: string, labels: string[]): string {
  let out = note;
  for (const label of labels) {
    out = out.replace(new RegExp(`${label}[:：]\s*[^；;\n]+`, "g"), "");
  }
  return out
    .replace(/[；;]\s*[；;]+/g, "；")
    .replace(/^[；;，,、\s]+/, "")
    .replace(/[；;，,、\s]+$/, "")
    .trim();
}

/** 把造型 / 性别 / 年龄 / 性格 / 音色 / 语气基调写回备注：先摘掉旧
 * 的标签段（「外貌：」是造型的旧口径标签，一并摘掉、统一改写为
 * 「造型：」），其余备注文字原样保留，再把新段以「；」拼在后面；
 * 某项为空就不写那段。 */
function noteWithBasicInfo(note: string, basic: BasicInfo): string {
  let base = stripLabelledSegments(note, [
    "造型",
    "外貌",
    "性别",
    "年龄段",
    "年龄",
    "性格",
    "音色",
    "语气基调",
  ]);
  const appearance = cleanSegmentValue(basic.appearance);
  // 备注只有一段无标签文字、且它正是当前造型简述时，不重复拼一遍。
  if (base && appearance && cleanSegmentValue(base) === appearance) base = "";
  const parts = [
    appearance ? `造型：${appearance}` : "",
    cleanSegmentValue(basic.gender)
      ? `性别：${cleanSegmentValue(basic.gender)}`
      : "",
    cleanSegmentValue(basic.age)
      ? `年龄：${cleanSegmentValue(basic.age)}`
      : "",
    cleanSegmentValue(basic.personality)
      ? `性格：${cleanSegmentValue(basic.personality)}`
      : "",
    cleanSegmentValue(basic.voice)
      ? `音色：${cleanSegmentValue(basic.voice)}`
      : "",
    cleanSegmentValue(basic.tone)
      ? `语气基调：${cleanSegmentValue(basic.tone)}`
      : "",
  ].filter(Boolean);
  if (parts.length === 0) return base;
  return base ? `${base}；${parts.join("；")}` : parts.join("；");
}

function parseBasicInfo(p: Preset): BasicInfo {
  const note = p.cardNote ?? "";
  let gender = labelledSegment(note, ["性别"]);
  if (gender && gender !== "男" && gender !== "女") {
    if (/女/.test(gender)) gender = "女";
    else if (/男/.test(gender)) gender = "男";
    else gender = "";
  }
  if (!gender) {
    const hay = `${p.personZh} ${note}`;
    if (/(女生|女孩|女人|女性|少女|女童|姑娘|女士)/.test(hay)) gender = "女";
    else if (/(男生|男孩|男人|男性|男童|男士|精神小伙)/.test(hay))
      gender = "男";
  }
  let age = labelledSegment(note, ["年龄段", "年龄"]);
  if (age === "看不准" || age === "看不清") age = "";
  if (!age) {
    const hay = `${p.personZh} ${note}`;
    const m = hay.match(/(\d{1,3}\s*岁(?:出头|左右|多)?)/);
    if (m?.[1]) age = m[1].replace(/\s+/g, "");
    else if (/(小孩|儿童)/.test(hay)) age = "儿童";
    else if (/(中年人|中年)/.test(hay)) age = "中年人";
    else if (/(老年人|老年)/.test(hay)) age = "老年人";
    else if (/(青年人|青年)/.test(hay)) age = "青年人";
    else if (["小孩", "青年人", "中年人", "老年人"].includes(p.category || ""))
      age = p.category;
  }
  // 造型：「造型：」段优先，「外貌：」段是旧口径标签、次之。
  let appearance = labelledSegment(note, ["造型", "外貌"]);
  if (!appearance) {
    const partTexts = [p.hairZh, p.faceZh, p.topZh, p.bottomZh, p.shoesZh, p.extraZh]
      .map((v) => (v ?? "").trim())
      .filter(Boolean);
    if (partTexts.length > 0) appearance = partTexts.join("，");
  }
  if (!appearance && p.personZh.trim()) {
    const t = p.personZh.trim();
    appearance = t.length > 90 ? t.slice(0, 90) : t;
  }
  if (!appearance) {
    const rest = stripLabelledSegments(note, [
      "造型",
      "外貌",
      "性别",
      "年龄段",
      "年龄",
      "性格",
      "音色",
      "语气基调",
    ]);
    if (rest) appearance = rest.length > 90 ? rest.slice(0, 90) : rest;
  }
  // 性格只认已存的「性格：」段，没有就空，绝不从别处猜。
  const personality = labelledSegment(note, ["性格"]);
  // 音色 / 语气基调（v5.51）同样只认已存同名段，没有就空。
  const voice = labelledSegment(note, ["音色"]);
  const tone = labelledSegment(note, ["语气基调"]);
  return { appearance, gender, age, personality, voice, tone };
}

// ---------------------------------------------------------------------------
// v5.53 储存库卡 AI 分析（客户端引擎）：与分镜页人物分析同一条
// 任务制链路（start → step 驱动 → poll），对象换成储存库卡。
//   - 取图：单点与批量分队都先 api.listAssetPresets 拉最新卡判
//     图（v5.48 教训：禁止用页面旧快照判无图），主图 url 经
//     urlToSubmitReference 降采样后随步进带给服务端；取不到图
//     记 imageFetchFailed、回执点名「图还在、这次没取到」，不
//     静默按无图跑。
//   - 回填只写 pending 列（savePresetPending），永不写 cardNote
//     已存字段、永不写性别；字段级来源为 manual 的字段分析值
//     不覆盖；无图时造型不写（结果里没有造型、原待确认造型也
//     不动）。
//   - 任务号存本机（scriptbench.presetAnalysisJob.<卡id>.v1）：
//     刷新 / 关窗回来先 poll 旧任务——done 直接回填、running 接
//     着驱动、failed / 不存在清掉重开（与人物侧同口径）。
//   - 驱动上限约 5 分钟：超时把任务留在服务端、任务号留在本
//     机，下次点「AI 分析」接着同一个任务取，不从头重跑。

type PresetField = "look" | "voice" | "tone";
const PRESET_FIELDS: PresetField[] = ["look", "voice", "tone"];
const PRESET_FIELD_LABEL: Record<PresetField, string> = {
  look: "造型",
  voice: "音色",
  tone: "语气基调",
};
type PresetFieldSource = "analysis" | "manual" | null;
type PresetSourceMap = Record<PresetField, PresetFieldSource>;
type PresetJobResult = NonNullable<
  ApiResponse<typeof api, "pollPresetAnalysisJob">["result"]
>;

function parsePresetSource(raw: string): PresetSourceMap {
  const none: PresetSourceMap = { look: null, voice: null, tone: null };
  if (!raw) return none;
  try {
    const v = JSON.parse(raw) as Partial<Record<string, unknown>>;
    const pick = (x: unknown): PresetFieldSource =>
      x === "analysis" || x === "manual" ? x : null;
    return { look: pick(v.look), voice: pick(v.voice), tone: pick(v.tone) };
  } catch {
    return none;
  }
}

function parsePresetRollback(
  raw: string,
): Record<PresetField, string | null> {
  const none: Record<PresetField, string | null> = {
    look: null,
    voice: null,
    tone: null,
  };
  if (!raw) return none;
  try {
    const v = JSON.parse(raw) as Partial<Record<string, unknown>>;
    const pick = (x: unknown): string | null =>
      typeof x === "string" ? x : null;
    return { look: pick(v.look), voice: pick(v.voice), tone: pick(v.tone) };
  } catch {
    return none;
  }
}

type PresetPendingView = {
  values: Record<PresetField, string>;
  source: PresetSourceMap;
  hasAnyValue: boolean;
  /** 有「分析来源且有值」的字段（已出分析结果、待确认）。 */
  hasAnalysisValue: boolean;
  /** 有任一 manual 来源字段（批量整卡跳过判据）。 */
  hasManual: boolean;
};

function presetPendingView(p: Preset): PresetPendingView {
  const values: Record<PresetField, string> = {
    look: p.pendingLook ?? "",
    voice: p.pendingVoice ?? "",
    tone: p.pendingTone ?? "",
  };
  const source = parsePresetSource(p.pendingSource ?? "");
  return {
    values,
    source,
    hasAnyValue: PRESET_FIELDS.some((f) => values[f].trim() !== ""),
    hasAnalysisValue: PRESET_FIELDS.some(
      (f) => source[f] === "analysis" && values[f].trim() !== "",
    ),
    hasManual: PRESET_FIELDS.some((f) => source[f] === "manual"),
  };
}

/** v5.56：解析某张图 pendingRollback（{"look": "..."}）留底的
 * 上一版造型；无留底 / 坏值回 null（恢复按钮不出）。 */
function imagePendingRollbackLook(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { look?: unknown };
    return typeof v.look === "string" ? v.look : null;
  } catch {
    return null;
  }
}

function formatPendingTime(ms: number): string {
  if (!ms) return "";
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const presetJobKey = (presetId: number) =>
  `scriptbench.presetAnalysisJob.${presetId}.v1`;
function readPresetJob(presetId: number): number | null {
  try {
    const v = Number(window.localStorage.getItem(presetJobKey(presetId)));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}
function writePresetJob(presetId: number, jobId: number | null) {
  try {
    if (jobId == null) window.localStorage.removeItem(presetJobKey(presetId));
    else
      window.localStorage.setItem(presetJobKey(presetId), String(jobId));
  } catch {
    // 本机存储不可用时任务号只在当次有效，不报错。
  }
}

type PresetAnalysisOutcome = {
  ok: boolean;
  failed: boolean;
  failReason: string;
  message: string;
  missingLabels: string[];
  refillAttempted: boolean;
  hadImage: boolean;
  imageFetchFailed: boolean;
};

/** 把一次分析结果回填进卡的 pending 列：只写来源不是 manual 的
 * 字段；无图时造型不写。深存失败如实回 savedOk=false（值不丢，
 * 回执写明「这次没存上」，用户再点一次即可）。 */
async function applyPresetAnalysisResult(
  fresh: Preset,
  result: PresetJobResult,
  jobId: number,
  hadImage: boolean,
  imageFetchFailed: boolean,
): Promise<PresetAnalysisOutcome> {
  const view = presetPendingView(fresh);
  const values: Record<PresetField, string> = { ...view.values };
  const source: PresetSourceMap = { ...view.source };
  const resultVal: Record<PresetField, string> = {
    look: result.look,
    voice: result.voice,
    tone: result.tone,
  };
  for (const f of PRESET_FIELDS) {
    if (source[f] === "manual") continue;
    if (f === "look" && !result.hasImage) continue;
    values[f] = resultVal[f];
    source[f] = resultVal[f].trim() ? "analysis" : null;
  }
  let savedOk = true;
  let savedError = "";
  try {
    const saved = await api.savePresetPending({
      presetId: fresh.id,
      record: {
        look: values.look,
        voice: values.voice,
        tone: values.tone,
        source,
        jobId: String(jobId),
        updatedAt: Date.now(),
      },
    });
    savedOk = saved.ok === true;
    if (!saved.ok) savedError = saved.error ?? "这次没存上";
  } catch (e) {
    savedOk = false;
    savedError = describeThrownError(e);
  }
  const missingLabels = result.missingFields.map(
    (f) => PRESET_FIELD_LABEL[f],
  );
  const mark = (f: PresetField): string =>
    result.missingFields.includes(f)
      ? "缺"
      : values[f].trim()
        ? "✓"
        : "—";
  const checkLine = `造型 ${mark("look")}、音色 ${mark("voice")}、语气基调 ${mark("tone")}`;
  const refillNote = result.refillAttempted
    ? result.refilledFields.length > 0
      ? `首轮有缺项，已自动补跑一次，补上了${result.refilledFields.map((f) => PRESET_FIELD_LABEL[f]).join("、")}。`
      : "首轮有缺项，已自动补跑一次。"
    : "";
  const missingNote =
    missingLabels.length > 0
      ? `还没填全：${missingLabels.join("、")}这次没分析出来（已标「未确认」，缺的项保持原样），可以再点一次「AI 分析」，或自己在悬浮窗里补。`
      : "";
  const heldNote = [
    result.voiceHeld
      ? "音色与图中人物的性别对不上，已拦下留空、待你自己定。"
      : "",
    result.lookHeld
      ? "造型与图中人物的性别对不上，已拦下留空、待你自己定。"
      : "",
  ]
    .filter(Boolean)
    .join("");
  const genderNote =
    result.genderJudged === "男" || result.genderJudged === "女"
      ? `（图中判读性别：${result.genderJudged}，只用来对齐音色与造型的性别用词，没有改卡上的性别。）`
      : result.genderJudged === "不确定"
        ? "（图中人物的性别这次没判准：音色只写不带性别定语的说法，性别请你在悬浮窗里亲手定。）"
        : "";
  const tail = savedOk
    ? "结果已存为待确认（刷新不丢）：打开这张卡的详情悬浮窗核对，点「确认并同步到卡片」才写进卡片。"
    : `分析出了结果，但这次没存上（${savedError}）：请再点一次「AI 分析」。`;
  const name = fresh.name || "未命名人物";
  const message = !hadImage
    ? imageFetchFailed
      ? `「${name}」的图还在、这次没取到（图片读取失败），按无图分析：${checkLine}。造型保持原样没动。${refillNote}${missingNote}${heldNote}${tail}`
      : `「${name}」还没有图：造型没编、保持原样；${checkLine}（音色、语气基调按备注里的身份与分类推的）。${refillNote}${missingNote}${heldNote}${tail}`
    : result.hasImage
      ? `已按「${name}」的图与备注分析完：${checkLine}。${refillNote}${missingNote}${heldNote}${genderNote}${tail}`
      : `「${name}」的图这次没能读出来：造型保持原样没动；${checkLine}。${refillNote}${missingNote}${heldNote}${tail}`;
  return {
    ok: savedOk && missingLabels.length === 0,
    failed: false,
    failReason: "",
    message,
    missingLabels,
    refillAttempted: result.refillAttempted,
    hadImage,
    imageFetchFailed,
  };
}

/** 驱动一张卡的分析任务到终点（与人物侧 driveCharJob 同口径：
 * 循环步进、服务端 150 秒认领窗口挡重复推理、单次步进响应被掐
 * 断不算失败；最多约 5 分钟，超时留任务号下次续取）。 */
async function drivePresetJob(
  snapshot: Preset,
  jobId: number,
  presetImage: { dataBase64: string; mimeType: string } | undefined,
  hadImage: boolean,
  imageFetchFailed: boolean,
  isCurrent: () => boolean,
): Promise<PresetAnalysisOutcome | null> {
  const sleep = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms));
  const DRIVE_CAP_MS = 5 * 60 * 1000;
  const startedAt = Date.now();
  const name = snapshot.name || "未命名人物";
  for (;;) {
    if (!isCurrent()) return null;
    let out: ApiResponse<typeof api, "runPresetAnalysisJobStep"> | null =
      null;
    try {
      out = await api.runPresetAnalysisJobStep({ jobId, presetImage });
    } catch {
      out = null;
    }
    if (!isCurrent()) return null;
    if (out) {
      if (out.status === "done" && out.result) {
        // 回填前再拉一次最新卡：字段级来源以库里最新为准（用户
        // 刚在悬浮窗手改过的值不能被这次分析盖掉来源标记）。
        let fresh = snapshot;
        try {
          const res = await api.listAssetPresets({});
          const f = res.presets.find((x) => x.id === snapshot.id);
          if (f) fresh = f;
        } catch {
          /* 拉不到就用开跑时的卡快照回填 */
        }
        if (!isCurrent()) return null;
        return await applyPresetAnalysisResult(
          fresh,
          out.result,
          jobId,
          hadImage,
          imageFetchFailed,
        );
      }
      if (out.status === "failed") {
        writePresetJob(snapshot.id, null);
        const reason = out.error ?? "分析失败";
        return {
          ok: false,
          failed: true,
          failReason: reason,
          message: `「${name}」的 AI 分析没做成：${reason}。没有改动任何字段，再点一次「AI 分析」即可。`,
          missingLabels: [],
          refillAttempted: false,
          hadImage,
          imageFetchFailed,
        };
      }
    }
    if (Date.now() - startedAt > DRIVE_CAP_MS) {
      return {
        ok: false,
        failed: true,
        failReason: `分析超时（任务号 ${jobId} 还留在服务端，点这张卡的「AI 分析」接着取）`,
        message: `「${name}」的分析跑得比平时久，页面先停在这里——任务（任务号 ${jobId}）还在服务端、任务号已留在本机，下次点这张卡的「AI 分析」会接着同一个任务取结果，不会从头重跑。`,
        missingLabels: [],
        refillAttempted: false,
        hadImage,
        imageFetchFailed,
      };
    }
    await sleep(2500);
  }
}

/** 分析一张储存库卡（单人按钮与批量共用同一条核心链路）：先拉
 * 最新卡判图、取主图降采样副本，再查本机旧任务（done 直接回
 * 填、running 接着驱动、failed / 不存在清掉重开），没有就建新
 * 任务驱动。全程不写已存字段、不提交生图。 */
async function runPresetAnalysisCore(
  snapshot: Preset,
  isCurrent: () => boolean,
): Promise<PresetAnalysisOutcome | null> {
  const name = snapshot.name || "未命名人物";
  let fresh = snapshot;
  try {
    const res = await api.listAssetPresets({});
    const f = res.presets.find((x) => x.id === snapshot.id);
    if (f) fresh = f;
  } catch {
    /* 拉不到最新数据就用页面现卡，不阻断 */
  }
  if (!isCurrent()) return null;
  const primaryUrl = fresh.images[0]?.url ?? undefined;
  let presetImage: { dataBase64: string; mimeType: string } | undefined;
  if (primaryUrl) {
    try {
      const ref = await urlToSubmitReference(primaryUrl);
      if (
        ref &&
        (ref.mimeType === "image/jpeg" || ref.mimeType === "image/png")
      ) {
        presetImage = { dataBase64: ref.dataBase64, mimeType: ref.mimeType };
      }
    } catch {
      /* 取不到图按无图分析：造型不动，音色 / 语气基调照样推 */
    }
  }
  const hadImage = presetImage !== undefined;
  const imageFetchFailed = Boolean(primaryUrl) && !hadImage;
  const failedOutcome = (
    message: string,
    failReason: string,
  ): PresetAnalysisOutcome => ({
    ok: false,
    failed: true,
    failReason,
    message,
    missingLabels: [],
    refillAttempted: false,
    hadImage,
    imageFetchFailed,
  });
  try {
    const storedJobId = readPresetJob(fresh.id);
    if (storedJobId != null) {
      let st: ApiResponse<typeof api, "pollPresetAnalysisJob"> | null =
        null;
      try {
        st = await api.pollPresetAnalysisJob({ jobId: storedJobId });
      } catch {
        st = null;
      }
      if (!isCurrent()) return null;
      if (st?.status === "done" && st.result) {
        return await applyPresetAnalysisResult(
          fresh,
          st.result,
          storedJobId,
          hadImage,
          imageFetchFailed,
        );
      }
      if (st?.status === "running") {
        return await drivePresetJob(
          fresh,
          storedJobId,
          presetImage,
          hadImage,
          imageFetchFailed,
          isCurrent,
        );
      }
      writePresetJob(fresh.id, null);
    }
    let start: ApiResponse<typeof api, "startPresetAnalysisJob">;
    try {
      start = await api.startPresetAnalysisJob({ presetId: fresh.id });
    } catch (e) {
      if (!isCurrent()) return null;
      return failedOutcome(
        `没发出去：「${name}」的 AI 分析任务没建起来（${describeThrownError(e)}），服务端没回任务号。没有改动任何字段，再点一次「AI 分析」即可。`,
        "分析任务没建起来（没发出去）",
      );
    }
    if (!isCurrent()) return null;
    if (!start.ok || start.jobId == null) {
      return failedOutcome(
        `没发出去：「${name}」的 AI 分析任务没建起来：${start.error ?? "服务端没回任务号"}。没有改动任何字段，再点一次「AI 分析」即可。`,
        start.error ?? "分析任务没建起来（服务端没回任务号）",
      );
    }
    writePresetJob(fresh.id, start.jobId);
    return await drivePresetJob(
      fresh,
      start.jobId,
      presetImage,
      hadImage,
      imageFetchFailed,
      isCurrent,
    );
  } catch (e) {
    if (!isCurrent()) return null;
    return failedOutcome(
      `「${name}」的 AI 分析没做成：${describeThrownError(e)}。没有改动任何字段，再点一次「AI 分析」即可。`,
      describeThrownError(e),
    );
  }
}

// ---------------------------------------------------------------------------
// One library entry rendered as a storage card: asset image area on
// top （加图 replaces nothing — images accumulate on the card; the
// first image is the 主图）, then 姓名 / 扮演 / 备注 / 分类 edited on
// the card face, then 发布到剧本 + 删除.

function LibraryCard({
  preset: p,
  categories,
  allPresets,
  sendPending,
  size,
  mouseZoomEnabled,
  mouseZoomScale,
  onDeleteRequest,
  onSendRequest,
  onError,
  eager,
  analysisBusy,
  analysisDisabled,
  onAnalyze,
  batchMode,
  batchChecked,
  onBatchToggle,
}: {
  preset: Preset;
  categories: CategoryCount[];
  /** v5.98：储存库全部卡片（详情悬浮窗「把别的人物加进来当
   * 服装」的来源下拉用，排除本卡由渲染处过滤）。 */
  allPresets: Preset[];
  sendPending: boolean;
  size: LibraryCardSize;
  /** v5.53：这张卡的单人 AI 分析正在跑（按钮显示「分析中…」）。 */
  analysisBusy: boolean;
  /** v5.53：有任一分析在跑（单人 / 批量互斥），按钮禁用。 */
  analysisDisabled: boolean;
  /** v5.53：点卡面「AI 分析」——只跑这张卡，结果进待确认。 */
  onAnalyze: () => void;
  /** v3.68：首屏前几张卡的主图急加载（打开即显示），其余懒加载。 */
  eager?: boolean;
  /** v3.52 鼠标放大总开关（储存库顶部，本机保存）；大卡片 / 小卡片
   * 两档都生效（v3.59 起只剩这两档）。 */
  mouseZoomEnabled: boolean;
  /** v3.59 鼠标放大倍数（1.5 / 2 / 2.5 / 3，储存库顶部选、本机保存）。 */
  mouseZoomScale: number;
  onDeleteRequest: () => void;
  onSendRequest: () => void;
  onError: (msg: string | null) => void;
  /** v5.65：批量删除模式（列表层状态）：开时卡面左上角出勾选框。 */
  batchMode: boolean;
  /** v5.65：这张卡在批量模式下是否已勾选。 */
  batchChecked: boolean;
  /** v5.65：勾选 / 取消勾选这张卡。 */
  onBatchToggle: () => void;
}) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dropMsg, setDropMsg] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  // v3.59：只剩大 / 小两档，两档都是紧凑卡面，全量编辑统一从卡内
  // 「展开详情」进入。v5.51 起「展开详情」不再在卡内展开，改为打开
  // 居中悬浮窗（见下方 detailOpen），卡面本身不再长高。
  const [detailOpen, setDetailOpen] = useState(false);
  // v5.52：「编辑更多」按钮及其卡内展开区整套删除（用户 2026-11-09
  // 04:31 亲口定）——卡上不再有超出悬浮窗 6 项的编辑入口；卡片原有
  // 字段与图片数据全部保留、不删，只是不再从卡面编辑。
  const compact = true;
  const dragDepth = useRef(0);
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["assetPresets"] });
  const fail = (e: unknown) =>
    onError(`操作失败：${describeThrownError(e)}，请重试`);

  const saveMut = useMutation({
    mutationFn: (patch: Partial<Preset>) =>
      api.saveAssetPreset(savePayload(p, patch)),
    onSuccess: () => {
      onError(null);
      invalidate();
    },
    onError: fail,
  });
  // ---- v5.56 悬浮窗图片区（设为主体 / 单图造型分析） ----------
  // imgLookBusyId = 正在跑单图造型分析的那张图 id（手动点与新
  // 图自动分析共用，同一时间只跑一张）；imgLookNotice = 图片区
  // 下方的回执行（分析结果 / 设为主体结果都写这里，关窗不丢，
  // 卡面区也显示同一行）。imgLookTokenRef 防旧轮回写。
  const [imgLookBusyId, setImgLookBusyId] = useState<number | null>(null);
  const [imgLookNotice, setImgLookNotice] = useState<string | null>(null);
  // v5.66：悬浮窗图片区每行造型的展开态（按图 id 记，逐行独
  // 立、互不影响；默认收起只显 3 行）。
  const [lookExpanded, setLookExpanded] = useState<Record<number, boolean>>(
    {},
  );
  const imgLookTokenRef = useRef(0);
  const runImageLook = async (image: Preset["images"][number]) => {
    if (imgLookBusyId !== null) return;
    const token = ++imgLookTokenRef.current;
    setImgLookBusyId(image.id);
    setImgLookNotice(null);
    const oc = await runPresetImageLookCore(
      p.id,
      image.id,
      { presetName: p.name, imageUrl: image.url },
      () => imgLookTokenRef.current === token,
    );
    if (imgLookTokenRef.current !== token) return;
    setImgLookBusyId(null);
    if (oc) setImgLookNotice(oc.message);
    invalidate();
  };
  // 新图加进卡里后自动逐张分析造型（只分析造型、进各自待确
  // 认）：串行跑完，回执汇总写一行；用户不确认就不落造型。
  const autoAnalyzeNewImages = async (
    presetName: string,
    newImages: Preset["images"],
  ) => {
    const token = ++imgLookTokenRef.current;
    const notes: string[] = [];
    for (const image of newImages) {
      if (imgLookTokenRef.current !== token) return;
      setImgLookBusyId(image.id);
      const oc = await runPresetImageLookCore(
        p.id,
        image.id,
        { presetName, imageUrl: image.url },
        () => imgLookTokenRef.current === token,
      );
      if (imgLookTokenRef.current !== token) return;
      if (oc) notes.push(oc.message);
      invalidate();
    }
    setImgLookBusyId(null);
    if (notes.length > 0) setImgLookNotice(notes.join(" "));
  };
  const setPrimaryMut = useMutation({
    mutationFn: (imageId: number) =>
      api.setAssetPresetImagePrimary({ presetId: p.id, imageId }),
    onSuccess: (res) => {
      onError(null);
      // 主体换了：悬浮窗左侧「造型」跟着换成新主体图的造型
      // （以服务端回的新卡备注为准）；音色 / 语气基调的编辑
      // 态一字不动（是这个人的、跟服装无关）。
      const nb = parseBasicInfo(res.preset);
      setDLook(nb.appearance);
      setImgLookNotice(
        `已设为「${p.name || "未命名人物"}」的主体图：卡片造型已换成这张图的造型（${nb.appearance || "沿用原造型"}），音色与语气基调没动。`,
      );
      invalidate();
    },
    onError: fail,
  });
  // ---- v5.65 悬浮窗图片区单张删图 -------------------------------
  // deleteImageTarget = 正在等确认删除的那张图（点「删除」只开
  // 确认框、不直接删；取消什么都不动）。确认后走既有
  // deleteAssetPresetImage：删主体图时服务端让下一张接任主体、
  // 卡片造型跟新主体走（回执以服务端回的新卡为准同步左侧造
  // 型），删到一张不剩时卡与造型文字保留；blob 只在无其他引
  // 用时才清，项目人物图共用的图不受影响。
  const [deleteImageTarget, setDeleteImageTarget] = useState<{
    imageId: number;
    idx: number;
    isPrimary: boolean;
  } | null>(null);
  const deleteImageMut = useMutation({
    mutationFn: (imageId: number) =>
      api.deleteAssetPresetImage({ presetId: p.id, imageId }),
    onSuccess: (res, _imageId) => {
      const t = deleteImageTarget;
      setDeleteImageTarget(null);
      onError(null);
      const nb = parseBasicInfo(res.preset);
      const left = res.preset.images.length;
      if (t?.isPrimary) {
        // 主体换人（或图删光）：左侧「造型」同步成服务端回的
        // 最新已存值（新主体造型 / 图删光时保留的原造型）。
        setDLook(nb.appearance);
        setImgLookNotice(
          left > 0
            ? `已删除「${p.name || "未命名人物"}」的主体图：下一张已接任主体，卡片造型已换成新主体图的造型（${nb.appearance || "沿用原造型"}），音色与语气基调没动。`
            : `已删除「${p.name || "未命名人物"}」的最后一张图：卡还在，卡片造型文字保留没清空。`,
        );
      } else {
        setImgLookNotice(
          `已删除「${p.name || "未命名人物"}」的第${(t?.idx ?? 0) + 1}张图，其余图片与主体图都没动。`,
        );
      }
      invalidate();
    },
    onError: fail,
  });
  // ---- v5.98 主文件 ⇄ 子文件（拆成独立人物 / 加进来当服装）---
  // promoteTarget = 正在等确认拆出的那张图（点「拆成独立人
  // 物」只开确认框、不直接拆；框里可改新卡名，默认名 =
  // 「原卡名（性别年龄分类）·服装N」，拆完靠名字认得出是谁的
  // 哪套衣服）。确认后走 promotePresetImage：拆的是主体图时左
  // 侧「造型」同步成服务端回的原卡最新已存值（接任口径与删
  // 图一致）；回执统一写图片区下方的 imgLookNotice。
  // attachSourceId = 「把别的人物加进来当服装」下拉选中的来
  // 源卡 id；确认按钮走 attachPresetAsSubImage（加对方主体图
  // 连同造型进来、来源卡保留），成功后清空选择、回执同上。
  const [promoteTarget, setPromoteTarget] = useState<{
    imageId: number;
    idx: number;
    isPrimary: boolean;
    defaultName: string;
  } | null>(null);
  const [promoteName, setPromoteName] = useState("");
  const promoteMut = useMutation({
    mutationFn: (v: { imageId: number; newName: string }) =>
      api.promotePresetImage({
        presetId: p.id,
        imageId: v.imageId,
        newName: v.newName,
      }),
    onSuccess: (res) => {
      setPromoteTarget(null);
      onError(null);
      // 原卡主体可能换人（或图拆光）：左侧「造型」同步成服务
      // 端回的最新已存值，口径与删主体图一致。
      const nb = parseBasicInfo(res.source);
      setDLook(nb.appearance);
      setImgLookNotice(
        `已把这张服装拆成独立人物「${res.created.name}」：它现在是储存库里一张单独的人物卡，主体图就是这张图、造型就是这张图的造型；「${p.name || "未命名人物"}」这边还剩 ${res.source.images.length} 张图。`,
      );
      invalidate();
    },
    onError: fail,
  });
  const [attachSourceId, setAttachSourceId] = useState<number | "">("");
  const attachMut = useMutation({
    mutationFn: (sourcePresetId: number) =>
      api.attachPresetAsSubImage({
        sourcePresetId,
        targetPresetId: p.id,
      }),
    onSuccess: (_res, sourcePresetId) => {
      onError(null);
      const src = allPresets.find((x) => x.id === sourcePresetId);
      setAttachSourceId("");
      setImgLookNotice(
        `已把「${src?.name || "未命名人物"}」的主体图加进「${p.name || "未命名人物"}」当服装（排在本卡图片最后）：这张服装的造型用的就是来源卡的造型；来源卡本身还在储存库里、仍是独立人物。`,
      );
      invalidate();
    },
    onError: fail,
  });
  const attachCandidates = allPresets.filter(
    (x) => x.id !== p.id && x.images.length > 0,
  );
  const confirmImageMut = useMutation({
    mutationFn: (v: { imageId: number; restore?: boolean }) =>
      api.confirmPresetImagePending({
        presetId: p.id,
        imageId: v.imageId,
        restore: v.restore,
      }),
    onSuccess: (res, v) => {
      if (!res.ok) {
        onError(res.error ?? "确认没成，请重试");
        return;
      }
      onError(null);
      // 确认 / 恢复的若是主体图，左侧造型同步成最新已存值。
      if (res.preset) {
        const nb = parseBasicInfo(res.preset);
        const primaryNow = res.preset.images[0];
        if (primaryNow && primaryNow.id === v.imageId) setDLook(nb.appearance);
      }
      setImgLookNotice(
        v.restore
          ? "已把这张图的造型恢复成确认前的上一版。"
          : "已把待确认造型填进这张图的造型里。",
      );
      invalidate();
    },
    onError: fail,
  });
  // ---- 详情悬浮窗（v5.51，取代原「填写」框与卡内展开详情） -------
  // 点卡面「展开详情」→ 居中悬浮窗，窗内只展示并可编辑 6 项：姓名
  // （卡片名）、性别（v5.50 的 gender 字段）、分类（category）、
  // 造型、音色、语气基调（后三项读写 cardNote 的同名标签段，口径
  // 见 parseBasicInfo / noteWithBasicInfo）。打开时已有值预填，可
  // 改、空项留空不编造；点「确认保存」才经同一个 saveAssetPreset
  // 动作一次写回（姓名 / 分类 / 性别走卡片字段，造型 / 音色 /
  // 语气基调以标签段写回备注，备注里的性别 / 年龄 / 性格段与自由
  // 文本原样保留）；点关闭 / 遮罩 / 取消什么都不改。没图的卡也能
  // 打开。年龄 / 性格不进悬浮窗（v5.52 起卡面已无其他编辑入口，
  // 数据保留在备注里不动）。
  const [dName, setDName] = useState("");
  const [dGender, setDGender] = useState("");
  const [dCategory, setDCategory] = useState("未分类");
  const [dLook, setDLook] = useState("");
  const [dVoice, setDVoice] = useState("");
  const [dTone, setDTone] = useState("");
  const basic = parseBasicInfo(p);
  // v5.53 待确认区数据：pending 列现算（深存在库里，列表查询回
  // 来即现，不依赖内存态）；rollback 留底非空才出「恢复上一版」。
  const pendingView = presetPendingView(p);
  const rollbackView = parsePresetRollback(p.pendingRollback ?? "");
  const hasRollback = PRESET_FIELDS.some((f) => rollbackView[f] !== null);
  const confirmPendingMut = useMutation({
    mutationFn: (v: {
      presetId: number;
      fields?: PresetField[];
      restore?: boolean;
    }) => api.confirmPresetPending(v),
    onSuccess: (res, v) => {
      if (!res.ok) {
        onError(res.error ?? "确认没成，请重试");
        return;
      }
      onError(null);
      // 转正 / 恢复后把悬浮窗 6 项里的三项文本同步成最新已存值
      // （本卡 p 还是确认前的快照，值都取得到），免得用户对着旧
      // 文本继续改。
      if (v.restore) {
        for (const f of res.fields) {
          const val = rollbackView[f];
          if (val === null) continue;
          if (f === "look") setDLook(val);
          if (f === "voice") setDVoice(val);
          if (f === "tone") setDTone(val);
        }
      } else {
        for (const f of res.fields) {
          const val = pendingView.values[f];
          if (f === "look") setDLook(val);
          if (f === "voice") setDVoice(val);
          if (f === "tone") setDTone(val);
        }
      }
      invalidate();
    },
    onError: fail,
  });

  const openDetail = () => {
    setUploadNote(null);
    setDName(p.name ?? "");
    setDGender(p.gender ?? "");
    setDCategory(p.category || "未分类");
    setDLook(basic.appearance);
    setDVoice(basic.voice);
    setDTone(basic.tone);
    setDetailOpen(true);
  };

  const confirmDetail = () => {
    const newNote = noteWithBasicInfo(p.cardNote, {
      ...basic,
      appearance: dLook.trim(),
      voice: dVoice.trim(),
      tone: dTone.trim(),
    });
    const patch: Partial<Preset> = {};
    const nameValue = dName.trim();
    if (nameValue && nameValue !== p.name) patch.name = nameValue;
    if (dCategory !== (p.category || "未分类")) patch.category = dCategory;
    if (dGender !== (p.gender ?? ""))
      patch.gender = dGender as Preset["gender"];
    if (newNote !== p.cardNote) patch.cardNote = newNote;
    if (Object.keys(patch).length === 0) {
      setDetailOpen(false);
      return;
    }
    // v5.53：亲手改了造型 / 音色 / 语气基调的已存值、且该字段正
    // 有待确认值时，保存成功后把该字段的待确认来源标成 manual
    // （待确认值本身不动）：批量重跑整卡跳过、单人重跑的回填也
    // 不拿分析值覆盖这些字段——手改优先（v5.49 字段级口径）。
    const manualMarks: PresetField[] = [];
    if (dLook.trim() !== basic.appearance && pendingView.values.look.trim())
      manualMarks.push("look");
    if (dVoice.trim() !== basic.voice && pendingView.values.voice.trim())
      manualMarks.push("voice");
    if (dTone.trim() !== basic.tone && pendingView.values.tone.trim())
      manualMarks.push("tone");
    saveMut.mutate(patch, {
      onSuccess: () => {
        if (manualMarks.length > 0) {
          const source: PresetSourceMap = { ...pendingView.source };
          for (const f of manualMarks) source[f] = "manual";
          void api
            .savePresetPending({
              presetId: p.id,
              record: {
                look: pendingView.values.look,
                voice: pendingView.values.voice,
                tone: pendingView.values.tone,
                source,
                jobId: p.pendingJobId ?? "",
                updatedAt: p.pendingUpdatedAt || Date.now(),
              },
            })
            .then(() => invalidate())
            .catch(() => {
              // 标记没存上不挡本次保存：待确认值与已存值都已落库，
              // 只是来源标记还是旧的，下次保存会再标一次。
            });
        }
        setDetailOpen(false);
      },
    });
  };

  const [chunkUploading, setChunkUploading] = useState(false);
  // v5.67：悬浮窗内的上传回执（进度 / 非图片忽略 / 失败原因）。
  // 拖拽与卡面上传的反馈在卡面上（dropMsg / onError），但悬浮窗
  // 打开时卡面被遮住看不见，所以同一条链路在窗内再写一行同样的
  // 回执，不静默吞掉任何结果。
  const [uploadNote, setUploadNote] = useState<string | null>(null);
  const applyFiles = (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith("image/"));
    const rejected = files.length - images.length;
    setDropMsg(rejected > 0 ? `已忽略 ${rejected} 个非图片文件，只接受图片` : null);
    if (rejected > 0) {
      setUploadNote(
        images.length === 0
          ? `选的文件里没有图片（已忽略 ${rejected} 个非图片文件），只接受图片，什么都没传。`
          : `已忽略 ${rejected} 个非图片文件，只接受图片。`,
      );
    }
    if (images.length === 0) return;
    void (async () => {
      // 分片上传：不看文件大小，多大的原图都逐片传、完整保存。
      setChunkUploading(true);
      setUploadNote(`正在上传 ${Math.min(images.length, 6)} 张图…`);
      const beforeIds = new Set(p.images.map((im) => im.id));
      try {
        const payload: ChunkedImageRef[] = [];
        for (const f of images.slice(0, 6)) {
          payload.push(await uploadImageFileInChunks(f));
        }
        const res = await api.addAssetPresetImagesChunked({
          presetId: p.id,
          images: payload,
        });
        onError(null);
        invalidate();
        setChunkUploading(false);
        // v5.56：新图自动逐张分析造型（只分析造型、进待确认，
        // 不确认不落造型；卡片造型不动）。
        const newImages = res.preset.images.filter(
          (im) => !beforeIds.has(im.id),
        );
        setUploadNote(
          newImages.length > 0
            ? `已把 ${newImages.length} 张新图传进这张卡，正在逐张分析造型，结果先进待确认（在每张图下面核对）。`
            : `已把 ${payload.length} 张图传进这张卡。`,
        );
        if (newImages.length > 0) {
          void autoAnalyzeNewImages(res.preset.name, newImages);
        }
      } catch (e) {
        setChunkUploading(false);
        const msg = uploadErrorText(e, "图片没传上去");
        setUploadNote(msg);
        onError(msg);
      }
    })();
  };

  const hasFiles = (e: ReactDragEvent) =>
    Array.from(e.dataTransfer?.types ?? []).includes("Files");
  const primary = p.images[0] ?? null;
  const imageBusy = chunkUploading;

  // ---- v3.52 鼠标放大（只大卡片 / 小卡片） --------------------------
  // 开关开 + 档位是大 / 小时，鼠标悬停在图片本身（只算图片范围，不算
  // 卡片文字 / 按钮区）上才出放大悬浮图；悬浮图用原图 url 显示（不是
  // 把缩略图拉大），跟在鼠标附近、超出视口自动贴边收进视口内，鼠标
  // 一移出图片范围立即消失、无残留。触屏设备不走悬停逻辑（点图仍走
  // 原有展开详情）。多张图时悬停哪张放大哪张，没图不放大。
  const zoomActive = mouseZoomEnabled;
  const [zoom, setZoom] = useState<{ url: string; x: number; y: number } | null>(
    null,
  );
  useEffect(() => {
    if (!zoomActive) setZoom(null);
  }, [zoomActive]);
  const handleZoomMove = (
    e: { clientX: number; clientY: number },
    url: string,
  ) => {
    if (!zoomActive) return;
    if (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(hover: none)").matches
    )
      return;
    setZoom({ url, x: e.clientX, y: e.clientY });
  };
  const handleZoomLeave = () => setZoom(null);

  return (
    <>
    <article
      className="overflow-hidden rounded-[var(--radius)] border card-shadow"
      style={{
        borderColor: "var(--border)",
        background: "var(--surface)",
        // v3.68：视口外的卡跳过渲染计算，滚动不被几十张卡的布局
        // 与绘制拖住；auto 让浏览器记住每张卡渲染过的真实高度，
        // 滚动条不跳。详情悬浮窗打开时卡在视口内，不受影响。
        // 但 auto 的绘制包含会把卡内 position:fixed 浮层（详情
        // 悬浮窗 / 悬停放大）困在卡片盒子里（手机上弹窗被压成窄列），
        // 故本卡有浮层打开时切回 visible，关掉后恢复 auto。
        contentVisibility: detailOpen || zoom ? "visible" : "auto",
        containIntrinsicSize: "auto 300px",
      }}
    >
      <div
        aria-label={`${p.name}的资产图拖拽上传区`}
        className="relative"
        style={{
          background: "var(--surface-alt)",
          ...(dragging
            ? { outline: "2px dashed var(--accent)", outlineOffset: "-2px" }
            : {}),
        }}
        onDragEnter={(e) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          e.stopPropagation();
          dragDepth.current += 1;
          setDragging(true);
        }}
        onDragOver={(e) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={(e) => {
          if (!hasFiles(e)) return;
          e.stopPropagation();
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDragging(false);
        }}
        onDrop={(e) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          e.stopPropagation();
          dragDepth.current = 0;
          setDragging(false);
          applyFiles(Array.from(e.dataTransfer.files ?? []));
        }}
      >
        {primary ? (
          <PreviewImg
            src={primary.url}
            previewSrc={primary.previewUrl}
            previewRef={{ kind: "presetImage", imageId: primary.id }}
            onBackfilled={invalidate}
            eager={eager}
            alt={`${p.name}的主图资产图`}
            data-mouse-zoom-img={zoomActive ? "on" : undefined}
            className={`${
              size === "lg" ? "h-44" : "h-28"
            } w-full object-cover object-top`}
            style={zoomActive ? { cursor: "zoom-in" } : undefined}
            onMouseEnter={
              zoomActive ? (e) => handleZoomMove(e, primary.url) : undefined
            }
            onMouseMove={
              zoomActive ? (e) => handleZoomMove(e, primary.url) : undefined
            }
            onMouseLeave={zoomActive ? handleZoomLeave : undefined}
          />
        ) : (
          <button
            type="button"
            className={`flex ${
              size === "lg" ? "h-32" : "h-24"
            } w-full flex-col items-center justify-center gap-1 text-sm text-[var(--dim)]`}
            onClick={() => fileRef.current?.click()}
            disabled={imageBusy}
          >
            <span className="text-xl">＋</span>
            <span>暂无图片</span>
            <span className="text-xs">
              {size === "sm" ? "点击上传资产图" : "拖入或点击上传资产图（可多张）"}
            </span>
          </button>
        )}
        {primary && (
          <button
            type="button"
            className="btn btn-sm absolute right-2 top-2"
            aria-label={`改图：以${p.name}当前的资产图为参照图，只修改指定部位（帽子、发型、发色、穿搭等）`}
            title="以这张卡当前的资产图为参照图打开改图：写清要改的部位，AI 保持人物身份特征不变只改那一处；改好的图追加到卡上、不替换原图"
            onClick={() =>
              openImageGenPanel({
                kind: "editPreset",
                presetId: p.id,
                name: p.name,
              })
            }
          >
            改图
          </button>
        )}
        {batchMode && (
          <label
            className="absolute left-2 top-2 z-10 flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold"
            style={{
              borderColor: batchChecked ? "var(--accent)" : "var(--border)",
              background: "var(--surface)",
              color: "var(--text)",
              boxShadow: "var(--shadow-card)",
            }}
          >
            <input
              type="checkbox"
              className="h-4 w-4 shrink-0"
              style={{ accentColor: "var(--accent)" }}
              checked={batchChecked}
              onChange={onBatchToggle}
              aria-label={`勾选人物卡${p.name || "未命名人物"}（批量删除用）`}
            />
            {batchChecked ? "已选" : "选择"}
          </label>
        )}
        {dragging && (
          <div
            className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-semibold"
            style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
          >
            松开鼠标，把图片存到这张卡上
          </div>
        )}
      </div>
      <input
        ref={fileRef}
        id={`preset-file-${p.id}`}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        aria-label={`为${p.name}上传资产图`}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length > 0) applyFiles(files);
          e.target.value = "";
        }}
      />
      {compact && (
        <div className="space-y-1.5 p-3">
          {dropMsg && (
            <p className="text-xs text-[var(--bad)]" role="status">
              {dropMsg}
            </p>
          )}
          {imgLookNotice && (
            <p className="text-xs leading-5 text-[var(--dim)]" role="status">
              {imgLookNotice}
            </p>
          )}
          <p className="flex flex-wrap items-center gap-1.5">
            <span className={`font-bold ${size === "sm" ? "text-sm" : "text-base"}`}>
              {p.name || "未命名人物"}
            </span>
            <span className="chip-check">{p.category || "未分类"}</span>
            {p.classUncertain && (
              <span
                className="chip-check"
                data-state="bad"
                title={p.classNote ? `分类存疑，判断依据：${p.classNote}` : "分类存疑，待确认"}
              >
                存疑
              </span>
            )}
            {pendingView.hasAnyValue && (
              <span
                className="chip-check"
                data-state="ok"
                title="AI 分析出的造型 / 音色 / 语气基调已存为待确认，还没写进卡片：打开详情悬浮窗核对后确认"
              >
                AI 待确认
              </span>
            )}
            {p.images.some((im) => (im.pendingLook ?? "").trim() !== "") && (
              <span
                className="chip-check"
                data-state="ok"
                title="有一张图的造型分析结果已存为待确认，还没填进那张图：打开详情悬浮窗右侧图片区核对后确认"
              >
                图片造型待确认
              </span>
            )}
            {size === "lg" && (
              <span className="chip-check" data-state={p.images.length > 0 ? "ok" : undefined}>
                {p.images.length > 0 ? `已存 ${p.images.length} 张资产图` : "还没有资产图"}
              </span>
            )}
          </p>
          {size !== "sm" && p.cardRole && (
            <p className="truncate text-sm text-[var(--dim)]">{p.cardRole}</p>
          )}
          {size === "lg" && p.cardNote && (
            <p className="line-clamp-2 text-sm leading-5">{p.cardNote}</p>
          )}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              className="btn btn-sm btn-primary"
              aria-label={`发布设定卡${p.name}到剧本`}
              disabled={sendPending}
              onClick={onSendRequest}
            >
              {sendPending ? "发布中…" : "发布到剧本"}
            </button>
            {p.images.length === 0 && (
              <button
                type="button"
                className="btn btn-sm"
                aria-label={`为${p.name}生成图（打开生图悬浮窗）`}
                onClick={() =>
                  openImageGenPanel({
                    kind: "preset",
                    presetId: p.id,
                    name: p.name,
                  })
                }
              >
                生成图
              </button>
            )}
            {size === "lg" && (
              <button
                type="button"
                className="btn btn-sm btn-danger-ghost"
                aria-label={`删除设定卡${p.name}`}
                onClick={onDeleteRequest}
              >
                删除
              </button>
            )}
            <button
              type="button"
              className="btn btn-sm"
              aria-haspopup="dialog"
              aria-label={`展开${p.name}的详情（悬浮窗）`}
              onClick={openDetail}
            >
              展开详情
            </button>
            <button
              type="button"
              className="btn btn-sm"
              aria-label={`AI 分析${p.name}（按图与备注分析造型、音色、语气基调，结果先进待确认，不直接改卡片）`}
              disabled={analysisDisabled}
              onClick={onAnalyze}
            >
              {analysisBusy ? "分析中…" : "AI 分析"}
            </button>
          </div>
          {size !== "lg" && (
            <p className="text-[11px] leading-4 text-[var(--dim)]">
              点「展开详情」在悬浮窗里看并改 6 项（姓名、性别、分类、造型、音色、语气基调），右侧图片区看全部照片、换主体图。
            </p>
          )}
        </div>
      )}
      {detailOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{
            background: "rgba(3, 5, 9, 0.72)",
            paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
          }}
          role="dialog"
          aria-modal="true"
          aria-label={`${p.name}的详情（悬浮窗，6 项文字加右侧图片区）`}
          onClick={() => {
            if (!saveMut.isPending) setDetailOpen(false);
          }}
        >
          <div
            className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-[14px] border p-5"
            style={{
              borderColor: "var(--border)",
              background: "var(--surface)",
              boxShadow: "0 24px 64px rgba(0, 0, 0, 0.6)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 详情悬浮窗主区（v5.51 定 6 项文字；v5.56 起改为
                「6 项文字＋右侧图片区」，用户 2026-11-09 17:46
                亲口定）：左侧只展示并可编辑 6 项——姓名、性别
                （gender 字段）、分类（category）、造型、音色、
                语气基调；年龄、性格、系统分类依据等其余内容不进
                主区。右侧图片区放这张卡的全部图片（换服装照片），
                每张图各存自己的造型、可设为主体（造型跟图走、
                音色 / 语气基调不动）。v5.52 起卡面「编辑更多」已
                删；原有字段与图片数据保留不删。手机宽度下图片区
                堆叠到 6 项下面。v5.65 起每行另有红色「删除」按
                钮：先弹确认框（明说不可恢复），确认才删这张图；
                删主体图时下一张接任、造型跟走，删光时卡与造型
                文字保留。v5.66 起面板改 flex 列、整窗不滚：头
                部说明、左侧 6 项、AI 分析待确认与底部按钮固定，
                只有右侧图片区独立滚动（手机单栏时内容区整体
                可滚、图片区再封顶独立滚动）。v5.67 起标题行
                「关闭」左侧加「＋上传服装图」按钮（走 applyFiles
                同一条上传链，窗内回执 uploadNote）；图片行加
                shrink-0 修「3 张以上衣服时删除按钮被裁」bug。 */}
            <div className="flex shrink-0 flex-wrap items-start justify-between gap-2">
              <p className="min-w-0 font-display text-lg font-bold">
                「{p.name || "未命名人物"}」详情
              </p>
              <div className="flex shrink-0 flex-wrap justify-end gap-2">
                {/* v5.67：标题行加本地上传按钮（用户 2026-11-09
                    23:12 截图定，放在「关闭」左侧）：点它打开本地
                    文件选择（可多选），走与拖拽上传同一条链路
                    （applyFiles：分片上传 → 追加进这张卡 → 新图自
                    动分析造型进待确认），只往当前打开的这张卡传；
                    上传进度与失败原因写在图片区上方的 uploadNote。 */}
                <button
                  type="button"
                  className="btn btn-sm shrink-0"
                  aria-label={`为${p.name}上传服装图（打开本地文件选择，可多选；传进这张卡后新图自动分析造型进待确认）`}
                  disabled={chunkUploading}
                  onClick={() => fileRef.current?.click()}
                >
                  {chunkUploading ? "上传中…" : "＋上传服装图"}
                </button>
                <button
                  type="button"
                  className="btn btn-sm shrink-0"
                  aria-label={`关闭${p.name}的详情悬浮窗`}
                  disabled={saveMut.isPending}
                  onClick={() => setDetailOpen(false)}
                >
                  关闭
                </button>
              </div>
            </div>
            <p className="mt-1.5 shrink-0 text-sm leading-6 text-[var(--dim)]">
              左边 6 项已有内容已预填，可直接改；空着的项留空。点「确认保存」才写回卡片，关掉悬浮窗什么都不改。点标题行「＋上传服装图」能从本地选图传进这张卡（可多选），新图会逐行出现在右边并自动分析造型进待确认。右边是这张卡的全部图片，一件衣服一行（图在左、造型在右），图片多时只在图片区里滚动、左边不动：每张图各存自己的造型（默认只显 3 行，长了点行下「展开」看全文），点「设为主体」后卡片造型跟着换成那张图的造型，音色与语气基调不动。每行还有「删除这张图」：点了先弹确认框，确认后才删、删了无法恢复；删掉主体图时下一张接任主体。每行还有「拆成独立人物」：把这件服装连图带造型从本卡拆出去、单独做成一张人物卡（先弹确认框、可改新卡名）。图片区下方还能「把别的人物加进来当服装」：选任意一张其他人物卡，对方的主体图就挂到本卡下面当一件服装，对方那张卡本身还在、仍是独立人物。
            </p>
            <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto md:overflow-visible">
              <div className="grid gap-4 md:min-h-0 md:flex-1 md:grid-cols-[minmax(0,1fr)_360px]">
              <div className="space-y-3 md:min-h-0 md:overflow-y-auto md:pr-1">
              <div>
                <label
                  className="mb-1 block text-xs font-medium text-[var(--dim)]"
                  htmlFor={`detail-name-${p.id}`}
                >
                  姓名
                </label>
                <input
                  id={`detail-name-${p.id}`}
                  className="field"
                  aria-label={`编辑${p.name}的姓名`}
                  placeholder="如：林哥"
                  value={dName}
                  onChange={(e) => setDName(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label
                    className="mb-1 block text-xs font-medium text-[var(--dim)]"
                    htmlFor={`detail-gender-${p.id}`}
                  >
                    性别
                  </label>
                  <select
                    id={`detail-gender-${p.id}`}
                    className="field"
                    aria-label={`编辑${p.name}的性别`}
                    value={dGender}
                    onChange={(e) => setDGender(e.target.value)}
                  >
                    <option value="">未归类</option>
                    <option value="男">男</option>
                    <option value="女">女</option>
                    {dGender && dGender !== "男" && dGender !== "女" && (
                      <option value={dGender}>{dGender}</option>
                    )}
                  </select>
                </div>
                <div>
                  <label
                    className="mb-1 block text-xs font-medium text-[var(--dim)]"
                    htmlFor={`detail-cat-${p.id}`}
                  >
                    分类
                  </label>
                  <select
                    id={`detail-cat-${p.id}`}
                    className="field"
                    aria-label={`编辑${p.name}的分类`}
                    value={dCategory}
                    onChange={(e) => setDCategory(e.target.value)}
                  >
                    {categories.map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                    {!categories.some((c) => c.name === dCategory) && (
                      <option value={dCategory}>{dCategory}</option>
                    )}
                  </select>
                </div>
              </div>
              <div>
                <label
                  className="mb-1 block text-xs font-medium text-[var(--dim)]"
                  htmlFor={`detail-look-${p.id}`}
                >
                  造型
                </label>
                <textarea
                  id={`detail-look-${p.id}`}
                  className="field"
                  rows={3}
                  aria-label={`编辑${p.name}的造型`}
                  placeholder="长相、发型、穿搭等造型特征"
                  value={dLook}
                  onChange={(e) => setDLook(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label
                    className="mb-1 block text-xs font-medium text-[var(--dim)]"
                    htmlFor={`detail-voice-${p.id}`}
                  >
                    音色
                  </label>
                  <input
                    id={`detail-voice-${p.id}`}
                    className="field"
                    aria-label={`编辑${p.name}的音色`}
                    placeholder="如：青年男声·清亮"
                    value={dVoice}
                    onChange={(e) => setDVoice(e.target.value)}
                  />
                </div>
                <div>
                  <label
                    className="mb-1 block text-xs font-medium text-[var(--dim)]"
                    htmlFor={`detail-tone-${p.id}`}
                  >
                    语气基调
                  </label>
                  <input
                    id={`detail-tone-${p.id}`}
                    className="field"
                    aria-label={`编辑${p.name}的语气基调`}
                    placeholder="如：活泼跳脱、爱抢话"
                    value={dTone}
                    onChange={(e) => setDTone(e.target.value)}
                  />
                </div>
              </div>
              </div>
              {/* v5.56 右侧图片区：这张卡的全部图片（换服装照片都在
                  这里）。主体图（第一张）标「主体」徽章、不显示设
                  为主体按钮；其余图有「设为主体」。造型按图存：卡
                  片造型恒等于主体图的造型；待确认造型随图确认，确
                  认前不填、卡片造型不动。
                  v5.62 改竖排（用户 2026-11-09 21:13 定）：每件衣服
                  一行，图在左、这张图的造型提示词在右，衣服多了随
                  悬浮窗向下滚动看；手机宽度下行内堆叠（图上、文字
                  下），不溢出。缩略图仍走 480px 降质通道、点图放大
                  仍原图全质（PreviewImg 口径不变）。
                  v5.64 图框统一（用户 2026-11-09 22:17 选定）：每
                  行图放进 140×140 正方形画框，图按原比例完整显示
                  （contain、不裁），留白用悬浮窗同色底（--surface）
                  填，框与行高统一。
                  v5.66 独立滚动（用户 2026-11-09 22:58 定）：图
                  片列表自带 overflow-y auto 独立滚动——桌面端占
                  满右列剩余高度（flex-1 + min-h-0），手机单栏时
                  封顶 45vh；标签与回执行留在滚动区外。左侧 6 项
                  与底部按钮不随图片区滚动。 */}
              <div className="flex min-h-0 flex-col">
                <p className="mb-1.5 shrink-0 text-xs font-medium text-[var(--dim)]">
                  图片（这张卡的全部照片，换服装都在这里，一件一行）
                </p>
                {uploadNote && (
                  <p
                    className="mb-1.5 shrink-0 text-xs leading-5 text-[var(--dim)]"
                    role="status"
                  >
                    {uploadNote}
                  </p>
                )}
                {p.images.length === 0 ? (
                  <p
                    className="rounded-[10px] border p-3 text-xs leading-5 text-[var(--dim)]"
                    style={{
                      borderColor: "var(--border)",
                      background: "var(--surface-alt)",
                    }}
                  >
                    这张卡还没有图片。点标题行的「＋上传服装图」从本地选图传进来（可多选），也可以关掉悬浮窗后把图片拖到卡面上；新图加进来后会自动分析造型，结果先进待确认。
                  </p>
                ) : (
                  <div className="flex max-h-[45vh] flex-col gap-2 overflow-y-auto pr-1 md:max-h-none md:min-h-0 md:flex-1">
                    {p.images.map((im, idx) => {
                      const isPrimary = idx === 0;
                      const imRollback = imagePendingRollbackLook(
                        im.pendingRollback,
                      );
                      const imBusy = imgLookBusyId === im.id;
                      // v5.66：造型默认收起只显 3 行；文字够长
                      // （>48 字，桌面右列约 3 行量）才给展开按
                      // 钮，逐行独立状态、互不影响。
                      const imLookOpen = lookExpanded[im.id] === true;
                      const imLookLong = im.look.trim().length > 48;
                      const imFallbackLong =
                        isPrimary && basic.appearance.trim().length > 36;
                      const lookToggleBtn = (
                        <button
                          type="button"
                          className="inline-flex min-h-[28px] items-center text-xs font-semibold text-[var(--accent)]"
                          aria-expanded={imLookOpen}
                          aria-label={`${imLookOpen ? "收起" : "展开"}${p.name}第${idx + 1}张图的造型全文`}
                          onClick={() =>
                            setLookExpanded((s) => ({
                              ...s,
                              [im.id]: !imLookOpen,
                            }))
                          }
                        >
                          {imLookOpen ? "收起" : "展开"}
                        </button>
                      );
                      return (
                        <div
                          key={im.id}
                          // v5.67 修 bug（用户 2026-11-09 23:12 截图）：
                          // 图片列表是 flex 列滚动容器，行默认 flex-shrink
                          // 会在总高超出容器时被压矮，又因行带 overflow-
                          // hidden，行底部的「删除这张图」等按钮被裁掉一
                          // 半点不到（衣服 3 张以上才触发）。行加 shrink-0
                          // 保持自然高度、超出部分由列表滚动承接，无论几
                          // 件衣服、造型多长，每行按钮都完整可点。
                          className="flex shrink-0 flex-col overflow-hidden rounded-[10px] border min-[480px]:flex-row"
                          style={{
                            borderColor: "var(--border)",
                            background: "var(--surface-alt)",
                          }}
                        >
                          <div
                            className="relative h-[140px] w-[140px] shrink-0"
                            style={{ background: "var(--surface)" }}
                          >
                            <PreviewImg
                              src={im.url}
                              previewSrc={im.previewUrl}
                              previewRef={{ kind: "presetImage", imageId: im.id }}
                              onBackfilled={invalidate}
                              alt={`${p.name}的第${idx + 1}张资产图`}
                              className="h-full w-full object-contain"
                            />
                            {isPrimary ? (
                              <span
                                className="chip-check absolute left-1.5 top-1.5"
                                data-state="ok"
                              >
                                主体
                              </span>
                            ) : (
                              <button
                                type="button"
                                className="btn btn-sm absolute bottom-1.5 right-1.5"
                                aria-label={`把${p.name}的第${idx + 1}张图设为主体图（卡片造型换成这张图的造型，音色与语气基调不动）`}
                                disabled={setPrimaryMut.isPending}
                                onClick={() => setPrimaryMut.mutate(im.id)}
                              >
                                {setPrimaryMut.isPending ? "设置中…" : "设为主体"}
                              </button>
                            )}
                          </div>
                          <div className="min-w-0 flex-1 space-y-1.5 p-2">
                            <p className="text-[11px] font-medium text-[var(--dim)]">
                              这张图的造型
                            </p>
                            {im.look.trim() ? (
                              <>
                                <p
                                  className={`text-xs leading-5 ${imLookOpen ? "" : "line-clamp-3"}`}
                                >
                                  {im.look}
                                </p>
                                {imLookLong && lookToggleBtn}
                              </>
                            ) : isPrimary ? (
                              <>
                                <p
                                  className={`text-xs leading-5 text-[var(--dim)] ${imLookOpen ? "" : "line-clamp-3"}`}
                                >
                                  主体图沿用卡片现有造型
                                  {basic.appearance
                                    ? `：${basic.appearance}`
                                    : "（卡片造型还没填）"}
                                </p>
                                {imFallbackLong && lookToggleBtn}
                              </>
                            ) : (
                              <p className="text-xs leading-5 text-[var(--dim)]">
                                还没有造型。
                              </p>
                            )}
                            {im.pendingLook.trim() ? (
                              <div
                                className="rounded-[8px] border p-2"
                                style={{
                                  borderColor: "var(--border)",
                                  background: "var(--surface)",
                                }}
                              >
                                <p className="text-[11px] font-semibold">
                                  待确认造型
                                  {im.pendingUpdatedAt > 0 && (
                                    <span className="ml-1.5 font-normal text-[var(--dim)]">
                                      {formatPendingTime(im.pendingUpdatedAt)}
                                    </span>
                                  )}
                                </p>
                                <p className="mt-0.5 text-xs leading-5">
                                  {im.pendingLook}
                                </p>
                                <button
                                  type="button"
                                  className="btn btn-sm btn-primary mt-1.5 w-full"
                                  style={{ whiteSpace: "normal" }}
                                  aria-label={`确认${p.name}第${idx + 1}张图的待确认造型，填进这张图的造型`}
                                  disabled={confirmImageMut.isPending}
                                  onClick={() =>
                                    confirmImageMut.mutate({ imageId: im.id })
                                  }
                                >
                                  {confirmImageMut.isPending
                                    ? "确认中…"
                                    : "确认填入这张图的造型"}
                                </button>
                              </div>
                            ) : !im.look.trim() && !isPrimary ? (
                              <button
                                type="button"
                                className="btn btn-sm"
                                aria-label={`分析${p.name}第${idx + 1}张图的造型（只分析造型，结果先进待确认）`}
                                disabled={imgLookBusyId !== null}
                                onClick={() => void runImageLook(im)}
                              >
                                {imBusy ? "分析中…" : "分析造型"}
                              </button>
                            ) : imBusy ? (
                              <p className="text-[11px] text-[var(--dim)]">
                                正在分析这张图的造型…
                              </p>
                            ) : null}
                            {imRollback !== null && (
                              <button
                                type="button"
                                className="btn btn-sm w-full"
                                style={{ whiteSpace: "normal" }}
                                aria-label={`恢复${p.name}第${idx + 1}张图确认前的造型（上一版）`}
                                disabled={confirmImageMut.isPending}
                                onClick={() =>
                                  confirmImageMut.mutate({
                                    imageId: im.id,
                                    restore: true,
                                  })
                                }
                              >
                                恢复这张图的上一版造型
                              </button>
                            )}
                            <button
                              type="button"
                              className="btn btn-sm btn-danger-ghost w-full"
                              style={{ whiteSpace: "normal" }}
                              aria-label={`删除${p.name}的第${idx + 1}张图（先弹确认框，删除后无法恢复）`}
                              disabled={deleteImageMut.isPending}
                              onClick={() =>
                                setDeleteImageTarget({
                                  imageId: im.id,
                                  idx,
                                  isPrimary,
                                })
                              }
                            >
                              {deleteImageMut.isPending
                                ? "删除中…"
                                : "删除这张图"}
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm w-full"
                              style={{ whiteSpace: "normal" }}
                              aria-label={`把${p.name}的第${idx + 1}张图拆成独立人物（先弹确认框、可改新卡名；这张图连同它自己的造型从本卡移出、成为一张新的人物卡）`}
                              disabled={promoteMut.isPending}
                              onClick={() => {
                                const seg = [p.gender, p.ageGroup]
                                  .filter(Boolean)
                                  .join("");
                                const dn = `${p.name || "未命名人物"}${seg ? `（${seg}）` : ""}·服装${idx + 1}`;
                                setPromoteTarget({
                                  imageId: im.id,
                                  idx,
                                  isPrimary,
                                  defaultName: dn,
                                });
                                setPromoteName(dn);
                              }}
                            >
                              {promoteMut.isPending
                                ? "拆分中…"
                                : "拆成独立人物"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {/* v5.98：把任意一张其他人物卡加进来当本卡的服装
                    （主文件挂到主文件下面当子文件）：下拉选来源
                    卡 →「加进来」走 attachPresetAsSubImage，对方
                    主体图连同它的造型挂到本卡图片列表末尾；来源
                    卡本身保留、仍是独立人物。本卡没图时也显示
                    （可拿别人的图当第一张服装）。 */}
                <div
                  className="mt-2 shrink-0 rounded-[10px] border p-2.5"
                  style={{
                    borderColor: "var(--border)",
                    background: "var(--surface)",
                  }}
                >
                  <label
                    className="mb-1 block text-xs font-medium text-[var(--dim)]"
                    htmlFor={`attach-src-${p.id}`}
                  >
                    把别的人物加进来当服装
                  </label>
                  {attachCandidates.length === 0 ? (
                    <p className="text-xs leading-5 text-[var(--dim)]">
                      储存库里还没有其他带图的人物卡可以加进来。
                    </p>
                  ) : (
                    <div className="flex gap-2">
                      <select
                        id={`attach-src-${p.id}`}
                        className="field field-sm min-w-0 flex-1"
                        aria-label={`选择要加进${p.name}当服装的人物卡（加的是对方的主体图）`}
                        value={attachSourceId}
                        onChange={(e) =>
                          setAttachSourceId(
                            e.target.value ? Number(e.target.value) : "",
                          )
                        }
                      >
                        <option value="">选一张人物卡…</option>
                        {attachCandidates.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name || "未命名人物"}（{c.images.length} 张图）
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="btn btn-sm shrink-0"
                        aria-label={`把所选人物卡的主体图加进${p.name}当服装（来源卡本身保留）`}
                        disabled={attachSourceId === "" || attachMut.isPending}
                        onClick={() => {
                          if (attachSourceId !== "") {
                            attachMut.mutate(attachSourceId);
                          }
                        }}
                      >
                        {attachMut.isPending ? "添加中…" : "加进来"}
                      </button>
                    </div>
                  )}
                  <p className="mt-1 text-[11px] leading-4 text-[var(--dim)]">
                    加进来的是对方的主体图连同它的造型，排在本卡图片最后；对方那张卡本身还在、仍是独立人物。
                  </p>
                </div>
                {imgLookNotice && (
                  <p
                    className="mt-2 text-xs leading-5 text-[var(--dim)]"
                    role="status"
                  >
                    {imgLookNotice}
                  </p>
                )}
              </div>
              </div>
              {(pendingView.hasAnyValue || hasRollback) && (
                <div
                  className="shrink-0 rounded-[10px] border p-3"
                  style={{
                    borderColor: "var(--border)",
                    background: "var(--surface-alt)",
                  }}
                >
                  <p className="text-sm font-semibold">
                    AI 分析待确认
                    {pendingView.hasAnyValue && p.pendingUpdatedAt > 0 && (
                      <span className="ml-2 text-xs font-normal text-[var(--dim)]">
                        待确认 · {formatPendingTime(p.pendingUpdatedAt)}
                      </span>
                    )}
                  </p>
                  {pendingView.hasAnyValue && (
                    <>
                      <p className="mt-1 text-xs leading-5 text-[var(--dim)]">
                        下面是 AI 分析出的值，还没有写进卡片：核对后确认才转正；分析不会改性别。
                      </p>
                      <ul className="mt-2 space-y-2.5">
                        {PRESET_FIELDS.filter(
                          (f) => pendingView.values[f].trim() !== "",
                        ).map((f) => {
                          const savedVal =
                            f === "look"
                              ? basic.appearance
                              : f === "voice"
                                ? basic.voice
                                : basic.tone;
                          return (
                            <li key={f}>
                              <p className="flex flex-wrap items-center gap-1.5 text-sm">
                                <span className="font-semibold">
                                  {PRESET_FIELD_LABEL[f]}
                                </span>
                                <span className="chip-check">
                                  {pendingView.source[f] === "manual"
                                    ? "手改"
                                    : "AI 分析"}
                                </span>
                                <button
                                  type="button"
                                  className="btn btn-sm ml-auto"
                                  aria-label={`只确认${p.name}的${PRESET_FIELD_LABEL[f]}待确认值`}
                                  disabled={confirmPendingMut.isPending}
                                  onClick={() =>
                                    confirmPendingMut.mutate({
                                      presetId: p.id,
                                      fields: [f],
                                    })
                                  }
                                >
                                  只确认此项
                                </button>
                              </p>
                              <p className="mt-0.5 text-xs leading-5 text-[var(--dim)]">
                                已存：{savedVal || "（空）"}
                              </p>
                              <p className="text-sm leading-6">
                                待确认：{pendingView.values[f]}
                              </p>
                            </li>
                          );
                        })}
                      </ul>
                      <div className="mt-3">
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          aria-label={`确认${p.name}的全部待确认值并同步到卡片`}
                          disabled={confirmPendingMut.isPending}
                          onClick={() =>
                            confirmPendingMut.mutate({ presetId: p.id })
                          }
                        >
                          {confirmPendingMut.isPending
                            ? "确认中…"
                            : "确认并同步到卡片"}
                        </button>
                      </div>
                    </>
                  )}
                  {hasRollback && (
                    <div className={pendingView.hasAnyValue ? "mt-2" : "mt-1"}>
                      <button
                        type="button"
                        className="btn btn-sm"
                        aria-label={`恢复${p.name}确认前的已存值（上一版）`}
                        disabled={confirmPendingMut.isPending}
                        onClick={() =>
                          confirmPendingMut.mutate({
                            presetId: p.id,
                            restore: true,
                          })
                        }
                      >
                        恢复上一版（确认前的已存值）
                      </button>
                    </div>
                  )}
                </div>
              )}
              <div
                className="flex shrink-0 flex-wrap justify-end gap-2 border-t pt-3"
                style={{ borderColor: "var(--border)" }}
              >
                <button
                  type="button"
                  className="btn"
                  disabled={saveMut.isPending}
                  onClick={() => setDetailOpen(false)}
                >
                  取消（什么都不改）
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={saveMut.isPending}
                  onClick={confirmDetail}
                >
                  {saveMut.isPending ? "保存中…" : "确认保存（写入 6 项）"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {zoom && zoomActive && (() => {
        const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
        const vh = typeof window !== "undefined" ? window.innerHeight : 768;
        // v3.59 倍数：以 2 倍 = 420×540 为基准按倍数缩放显示尺寸，
        // 仍钳制在视口内；图本身始终用同一原图 object-contain。
        const previewW = Math.min(
          Math.round(210 * mouseZoomScale),
          Math.max(200, vw - 24),
        );
        const previewH = Math.min(
          Math.round(270 * mouseZoomScale),
          Math.max(220, vh - 24),
        );
        let left = zoom.x + 18;
        let top = zoom.y + 18;
        if (left + previewW > vw - 12) left = zoom.x - previewW - 18;
        if (top + previewH > vh - 12) top = zoom.y - previewH - 18;
        left = Math.max(12, Math.min(left, vw - previewW - 12));
        top = Math.max(12, Math.min(top, vh - previewH - 12));
        return (
          <div
            className="pointer-events-none fixed z-[80] overflow-hidden rounded-[10px] border shadow-xl"
            style={{
              left,
              top,
              width: previewW,
              borderColor: "var(--border)",
              background: "var(--surface)",
            }}
            role="img"
            aria-label={`${p.name}的放大预览`}
            data-mouse-zoom-preview="on"
          >
            <img
              src={zoom.url}
              alt=""
              className="w-full object-contain"
              style={{ maxHeight: previewH - 34, background: "var(--surface-alt)" }}
            />
            <p className="truncate px-2.5 py-1.5 text-xs text-[var(--dim)]">
              {p.name || "未命名人物"} · 放大预览（原图）
            </p>
          </div>
        );
      })()}
    </article>
    {/* v5.65 删图确认框渲染在卡片 article 之外（与全站其他
        ConfirmDialog 同层）：article 的 content-visibility 包含
        会困住卡内 fixed 浮层（v5.52 旧坑），放外面才稳。 */}
    {deleteImageTarget && (
      <ConfirmDialog
        title={`删除「${p.name || "未命名人物"}」的第${deleteImageTarget.idx + 1}张图？`}
        body={
          deleteImageTarget.isPrimary
            ? p.images.length > 1
              ? "这张是主体图：删掉后下一张图会接任主体，卡片造型会跟着换成新主体图的造型，音色与语气基调不动。这张图自己的造型与待确认数据会一起删掉。删除后无法恢复。"
              : "这张是这张卡唯一的一张图（也是主体图）：删掉后卡还在，卡片造型文字会保留、不清空。这张图自己的造型与待确认数据会一起删掉。删除后无法恢复。"
            : "这张图自己的造型与待确认数据会一起删掉，其余图片与主体图都不动。删除后无法恢复。"
        }
        confirmLabel="确认删除这张图"
        cancelLabel="取消"
        pending={deleteImageMut.isPending}
        onConfirm={() => deleteImageMut.mutate(deleteImageTarget.imageId)}
        onCancel={() => setDeleteImageTarget(null)}
      />
    )}
    {/* v5.98 拆出确认框（同删图确认框一样渲染在 article 之外）：
        说明拆出后两边各变成什么样，框里可改新卡名（默认名已带
        原卡的性别 / 年龄分类，拆完认得出是谁的哪套衣服）。 */}
    {promoteTarget && (
      <ConfirmDialog
        title={`把「${p.name || "未命名人物"}」的第${promoteTarget.idx + 1}张图拆成独立人物？`}
        body={
          <div>
            <p>
              {promoteTarget.isPrimary
                ? p.images.length > 1
                  ? "这张是本卡的主体图：拆出后下一张图接任主体、本卡造型跟着换成新主体图的造型，音色与语气基调不动；本卡还剩 " +
                    `${p.images.length - 1} 张图。`
                  : "这张是本卡唯一的一张图：拆出后本卡就没有图了，卡还在、卡片造型文字保留不清空。"
                : `这张图会从本卡移出，本卡其余 ${p.images.length - 1} 张图与主体图都不动。`}
              拆出的图连同它自己的造型成为一张新的人物卡，新卡继承本卡的性别 / 年龄分类与音色、语气基调。
            </p>
            <label
              className="mt-3 mb-1 block text-xs font-medium text-[var(--dim)]"
              htmlFor={`promote-name-${p.id}`}
            >
              新人物卡的名字
            </label>
            <input
              id={`promote-name-${p.id}`}
              className="field"
              aria-label="拆出的新人物卡的名字"
              value={promoteName}
              maxLength={80}
              onChange={(e) => setPromoteName(e.target.value)}
            />
            <p className="mt-1.5 text-xs leading-5 text-[var(--dim)]">
              名字之后也能在新卡的「展开详情」里改。
            </p>
          </div>
        }
        confirmLabel="确认拆成独立人物"
        cancelLabel="取消"
        pending={promoteMut.isPending}
        onConfirm={() =>
          promoteMut.mutate({
            imageId: promoteTarget.imageId,
            newName: promoteName.trim() || promoteTarget.defaultName,
          })
        }
        onCancel={() => setPromoteTarget(null)}
      />
    )}
    </>
  );
}

// ---------------------------------------------------------------------------

export type PublishTarget = { projectId: number; characterId: number };
export type ProjectOption = { id: number; name: string; characterCount: number };

export function CharacterBench({
  window: activeCategory,
  setWindow: setActiveCategory,
  projects,
  onGoToScriptCharacters,
  visitKey,
}: {
  window: CharWindow;
  setWindow: (w: CharWindow) => void;
  /** v3.47：每次从剧本工作台切进储存库时 +1，触发查看档位重置为小卡片。 */
  visitKey?: number;
  /** v3.50：发布先选项目——储存库是独立窗口，不再默认发到某个
   * 「当前项目」；点发布先弹项目选择器，选了才调用发布动作。 */
  projects: ProjectOption[];
  onGoToScriptCharacters: (target: PublishTarget) => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const presetsQuery = useQuery({
    queryKey: ["assetPresets"],
    queryFn: () => withReadTimeout(() => api.listAssetPresets({})),
    retry: retryReadQuery,
    // v3.68：切窗口 / 切回来 60 秒内直接用缓存渲染，不整表重拉
    // 重渲染；有变更时各 mutation 仍会主动 invalidate 立即刷新。
    staleTime: 60_000,
  });
  const presets = presetsQuery.data?.presets ?? [];
  const categories = presetsQuery.data?.categories ?? [];

  const [search, setSearch] = useState("");
  // 系统分类筛选（v5.50）：与左侧分类栏、姓名搜索叠加生效（AND）。
  const [classFilter, setClassFilter] = useState<string>("全部");
  const classCounts = useMemo(() => {
    const counts: Record<string, number> = { 全部: presets.length };
    for (const key of CLASS_FILTERS) {
      if (key !== "全部") counts[key] = 0;
    }
    for (const p of presets) {
      if (p.gender && p.ageGroup) {
        const key = `${p.gender}-${p.ageGroup}`;
        if (key in counts) counts[key] = (counts[key] ?? 0) + 1;
      }
    }
    return counts;
  }, [presets]);
  // 「查看」档位：v3.59 起只剩大卡片 / 小卡片两档。每次打开默认小
  // 卡片——首次挂载（刷新 / 重新进入页面）就是小卡片；储存库组件
  // 常驻挂载（只是隐藏），所以父级每次切进储存库时 visitKey +1，
  // 这里据此把档位重置回小卡片。旧版本存过的超大（xl）/ 中卡（md）
  // 偏好经 sanitizeLibraryCardSize 一律回落小卡片，不出现空白档位。
  const [cardSize, setCardSize] = useState<LibraryCardSize>(() => {
    try {
      return sanitizeLibraryCardSize(
        window.localStorage.getItem("scriptbench.libraryCardSize"),
      );
    } catch {
      return "sm";
    }
  });
  useEffect(() => {
    if (visitKey != null && visitKey > 0) setCardSize("sm");
  }, [visitKey]);
  // v3.52 鼠标放大开关：默认关，本机保存、刷新保持（键
  // scriptbench.libraryMouseZoom，存 "1" / "0"）。大卡片 / 小卡片
  // 两档都生效。
  const [mouseZoom, setMouseZoom] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem("scriptbench.libraryMouseZoom") === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(
        "scriptbench.libraryMouseZoom",
        mouseZoom ? "1" : "0",
      );
    } catch {
      // 本机存储不可用时开关只在当次有效，不报错。
    }
  }, [mouseZoom]);
  // v3.59 鼠标放大倍数：1.5 / 2 / 2.5 / 3，默认 2 倍（约等于此前
  // 固定效果）；本机保存（键 scriptbench.libraryMouseZoomScale，
  // 与开关同一前缀），只影响悬浮放大图的显示尺寸。
  const ZOOM_SCALES = [1.5, 2, 2.5, 3];
  const [mouseZoomScale, setMouseZoomScale] = useState<number>(() => {
    try {
      const v = Number(
        window.localStorage.getItem("scriptbench.libraryMouseZoomScale"),
      );
      return ZOOM_SCALES.includes(v) ? v : 2;
    } catch {
      return 2;
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(
        "scriptbench.libraryMouseZoomScale",
        String(mouseZoomScale),
      );
    } catch {
      // 本机存储不可用时倍数只在当次有效，不报错。
    }
  }, [mouseZoomScale]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  // v3.50 发布流程：点发布 → 项目选择器（pickerPreset）→（无图时）
  // 先发布文字 / 先补图确认（pendingSend，带着已选项目）→ 调用 →
  // 结果弹窗（publishResult：新建 / 已在项目中）或错误弹窗
  // （publishError，写明具体原因）。任何一步取消都不调用、不改数据。
  const [pickerPreset, setPickerPreset] = useState<Preset | null>(null);
  const [pendingSend, setPendingSend] = useState<{
    preset: Preset;
    projectId: number;
  } | null>(null);
  const [publishResult, setPublishResult] = useState<{
    created: boolean;
    characterId: number;
    projectId: number;
    projectName: string;
    charName: string;
    imageNote: string;
  } | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  // Per-category rename / delete (v3.27): every category row in the
  // 分类管理 section carries its own 改名 / 删除 buttons, not just the
  // currently selected category.
  const [renameFor, setRenameFor] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [deleteCategoryTarget, setDeleteCategoryTarget] = useState<{
    name: string;
    count: number;
  } | null>(null);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["assetPresets"] });
  const fail = (e: unknown) =>
    setErrorMsg(`操作失败：${describeThrownError(e)}，请重试`);

  // ---- v5.53 储存库 AI 分析（单人 + 批量） ----------------------
  // 单人：paBusyId 是正在跑的卡 id；批量：paBatch 是进度（done /
  // total / 当前卡名），paReceipt 是跑完的总回执，paNotice 是单
  // 人回执。两条路互斥（paSingleRef / paBatchRef 令牌防重入与
  // 防旧轮回写）。批量串行（一张跑完再下一张，与人物侧同口
  // 径）；分队前先拉最新卡判图与待确认状态。
  const [paBusyId, setPaBusyId] = useState<number | null>(null);
  const [paNotice, setPaNotice] = useState<string | null>(null);
  const [paBatch, setPaBatch] = useState<{
    done: number;
    total: number;
    current: string;
  } | null>(null);
  const [paReceipt, setPaReceipt] = useState<string | null>(null);
  const paSingleRef = useRef(0);
  const paBatchRef = useRef(0);
  const paBatchBusy = paBatch !== null;

  const runSinglePresetAnalysis = async (p: Preset) => {
    if (paBatchBusy || paBusyId !== null) return;
    const token = ++paSingleRef.current;
    setPaBusyId(p.id);
    setPaNotice(null);
    const oc = await runPresetAnalysisCore(
      p,
      () => paSingleRef.current === token,
    );
    if (paSingleRef.current !== token) return;
    setPaBusyId(null);
    if (oc) setPaNotice(oc.message);
    invalidate();
  };

  const runBatchPresetAnalysis = async (resume: boolean) => {
    if (paBatchBusy || paBusyId !== null) return;
    const token = ++paBatchRef.current;
    setPaReceipt(null);
    setPaNotice(null);
    // 分队前拉最新：图与待确认状态都以库里最新为准（页面快照可
    // 能是打开页面那一刻的，别处刚挂的图 / 刚确认的值不能漏）。
    let list = presets;
    try {
      const res = await api.listAssetPresets({});
      if (res?.presets) list = res.presets;
    } catch {
      /* 拉不到就用页面现卡分队，不阻断 */
    }
    if (paBatchRef.current !== token) return;
    const skippedManual: string[] = [];
    const alreadyDone: string[] = [];
    const queue: Preset[] = [];
    for (const p of list) {
      const view = presetPendingView(p);
      if (view.hasManual) {
        skippedManual.push(p.name || "未命名人物");
        continue;
      }
      if (resume && view.hasAnalysisValue) {
        alreadyDone.push(p.name || "未命名人物");
        continue;
      }
      queue.push(p);
    }
    const okNames: string[] = [];
    const partialNames: string[] = [];
    const noImageNames: string[] = [];
    const failedList: { name: string; reason: string }[] = [];
    let runs = 0;
    let refills = 0;
    setPaBatch({ done: 0, total: queue.length, current: queue[0]?.name ?? "" });
    for (let i = 0; i < queue.length; i++) {
      if (paBatchRef.current !== token) return;
      const p = queue[i]!;
      setPaBatch({ done: i, total: queue.length, current: p.name });
      const oc = await runPresetAnalysisCore(
        p,
        () => paBatchRef.current === token,
      );
      if (paBatchRef.current !== token) return;
      if (oc) {
        runs += 1;
        if (oc.refillAttempted) refills += 1;
        const nm = p.name || "未命名人物";
        if (oc.failed) {
          failedList.push({ name: nm, reason: oc.failReason });
        } else if (!oc.hadImage) {
          noImageNames.push(
            oc.missingLabels.length > 0
              ? `${nm}（缺${oc.missingLabels.join("、")}）`
              : nm,
          );
        } else if (oc.missingLabels.length > 0) {
          partialNames.push(`${nm}（缺${oc.missingLabels.join("、")}）`);
        } else {
          okNames.push(nm);
        }
      }
      setPaBatch({
        done: i + 1,
        total: queue.length,
        current: p.name,
      });
    }
    setPaBatch(null);
    invalidate();
    const lines: string[] = [
      `一键AI分析跑完：本轮共分析 ${runs} 张卡${refills > 0 ? `，其中 ${refills} 张补跑过一次（首轮有缺项时多一次推理，只在有缺项时发生）` : ""}。`,
    ];
    if (okNames.length > 0) lines.push(`已出结果（待确认）：${okNames.join("、")}。`);
    if (partialNames.length > 0)
      lines.push(`没填全：${partialNames.join("；")}——缺的项保持原样，可以再点一次或自己在悬浮窗里补。`);
    if (noImageNames.length > 0)
      lines.push(`无图（造型保持原样，音色 / 语气基调按备注推的）：${noImageNames.join("、")}。`);
    if (alreadyDone.length > 0)
      lines.push(`已出结果、这轮没重跑（待确认）：${alreadyDone.join("、")}。`);
    if (skippedManual.length > 0)
      lines.push(`已跳过（有未确认的手动修改）：${skippedManual.join("、")}。`);
    if (failedList.length > 0)
      lines.push(
        `没做成：${failedList.map((f) => `${f.name}（${f.reason}）`).join("；")}。`,
      );
    if (runs === 0 && failedList.length === 0)
      lines.push("这轮没有要跑的卡。");
    lines.push(
      "结果都已深存为待确认，刷新不丢；逐张打开详情悬浮窗核对，点「确认并同步到卡片」才写进卡片。分析不改性别。",
    );
    setPaReceipt(lines.join("\n"));
  };

  // 批量按钮口径（v5.49 R7 同款）：已有人有待确认分析结果、还
  // 有没跑过的卡 → 「接着跑剩下的人」（已出结果的不重跑）；否
  // 则一键全跑（只有分析来源待确认值的卡可重跑，manual 跳过）。
  const paAnyAnalysis = presets.some((p) =>
    presetPendingView(p).hasAnalysisValue,
  );
  const paAnyUnrun = presets.some((p) => {
    const v = presetPendingView(p);
    return !v.hasAnalysisValue && !v.hasManual;
  });
  const paResumeMode = paAnyAnalysis && paAnyUnrun;

  const filtered = useMemo(() => {
    const q = search.trim();
    return presets.filter((p) => {
      if (activeCategory !== "全部" && (p.category || "未分类") !== activeCategory)
        return false;
      if (
        classFilter !== "全部" &&
        `${p.gender}-${p.ageGroup}` !== classFilter
      )
        return false;
      if (q && !p.name.includes(q)) return false;
      return true;
    });
  }, [presets, activeCategory, search, classFilter]);

  const createCardMut = useMutation({
    mutationFn: () =>
      api.saveAssetPreset(
        blankPayload(activeCategory !== "全部" ? activeCategory : "未分类"),
      ),
    onSuccess: () => {
      setErrorMsg(null);
      invalidate();
    },
    onError: fail,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteAssetPreset({ id }),
    onSuccess: () => {
      setConfirmDeleteId(null);
      setErrorMsg(null);
      invalidate();
    },
    onError: fail,
  });

  // ---- v5.65 批量删卡 -------------------------------------------
  // batchMode 开时每张卡左上角出勾选框；batchSelected 存已勾卡
  // id（筛选 / 搜索切换不清空，确认框按 id 从 presets 现查卡名
  // 与图数）；batchConfirmOpen 时先弹确认框，确认才逐张走既有
  // deleteAssetPreset（与单删同一动作、同一 blob 引用保护）；
  // 退出批量模式清空勾选。batchNotice 是批量删除后的回执行。
  const [batchMode, setBatchMode] = useState(false);
  const [batchSelected, setBatchSelected] = useState<ReadonlySet<number>>(
    new Set(),
  );
  const [batchConfirmOpen, setBatchConfirmOpen] = useState(false);
  const [batchNotice, setBatchNotice] = useState<string | null>(null);
  const toggleBatchCard = (id: number) =>
    setBatchSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const exitBatchMode = () => {
    setBatchMode(false);
    setBatchSelected(new Set());
    setBatchConfirmOpen(false);
  };
  const batchTargets = useMemo(
    () => presets.filter((p) => batchSelected.has(p.id)),
    [presets, batchSelected],
  );
  const batchDeleteMut = useMutation({
    mutationFn: async (ids: number[]) => {
      const failedIds: number[] = [];
      const failedNames: string[] = [];
      for (const id of ids) {
        try {
          await api.deleteAssetPreset({ id });
        } catch {
          failedIds.push(id);
          failedNames.push(
            presets.find((p) => p.id === id)?.name || `卡片 ${id}`,
          );
        }
      }
      return { total: ids.length, failedIds, failedNames };
    },
    onSuccess: (res) => {
      setBatchConfirmOpen(false);
      if (res.failedIds.length === 0) {
        setErrorMsg(null);
        setBatchNotice(
          `已删除所选 ${res.total} 张人物卡（连同卡上的图），删除不可恢复。`,
        );
        exitBatchMode();
      } else {
        setBatchNotice(null);
        setErrorMsg(
          `批量删除没全成：${res.total - res.failedIds.length}/${res.total} 张已删，${res.failedNames.join("、")} 没删掉，请重试。`,
        );
        // 失败的卡还勾着，方便直接重试；已删的从勾选里摘掉。
        setBatchSelected(new Set(res.failedIds));
      }
      invalidate();
    },
    onError: fail,
  });

  const sendMutation = useMutation({
    mutationFn: (v: { presetId: number; projectId: number }) =>
      api.sendPresetToScript(v),
    onSuccess: (res, v) => {
      const projectName =
        projects.find((p) => p.id === v.projectId)?.name ?? "该项目";
      const imageNote =
        res.imageCount === 0
          ? "这张卡没有资产图，本次只发布了文字（姓名 / 扮演 / 备注）；把图补到这张卡上后再发布一次，就会连图一起带过去。"
          : res.imageSent
            ? `资产图已一起发布（本卡共 ${res.imageCount} 张图，主图已放到人物卡上）。`
            : "该人物卡原本已有资产图，本次没有覆盖它；本卡的主图仍留在这张卡上。";
      // v3.50：新建与「已在项目中」是两种结果，分别如实提示，
      // 重复时不假装新建成功。
      setPublishResult({
        created: res.created,
        characterId: res.characterId,
        projectId: v.projectId,
        projectName,
        charName: res.name,
        imageNote,
      });
      setErrorMsg(null);
      void queryClient.invalidateQueries({ queryKey: ["project", v.projectId] });
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
    // v3.50：发布失败弹出具体原因，不再静默吞错。
    onError: (e) =>
      setPublishError(
        `发布失败：${describeThrownError(e)}，请重试`,
      ),
  });

  const createCategoryMut = useMutation({
    mutationFn: (name: string) => api.createAssetCategory({ name }),
    onSuccess: (_res, name) => {
      setNewCategoryName("");
      setErrorMsg(null);
      invalidate();
      setActiveCategory(name.trim());
    },
    onError: fail,
  });
  const renameCategoryMut = useMutation({
    mutationFn: (v: { from: string; to: string }) =>
      api.renameAssetCategory(v),
    onSuccess: (_res, v) => {
      setRenameFor(null);
      setRenameDraft("");
      setErrorMsg(null);
      invalidate();
      if (activeCategory === v.from) setActiveCategory(v.to.trim());
    },
    onError: fail,
  });
  const deleteCategoryMut = useMutation({
    mutationFn: (name: string) => api.deleteAssetCategory({ name }),
    onSuccess: (_res, name) => {
      setDeleteCategoryTarget(null);
      setErrorMsg(null);
      invalidate();
      if (activeCategory === name) setActiveCategory("全部");
    },
    onError: fail,
  });

  // v3.50：点发布先弹项目选择器——储存库是独立窗口、没有明确的
  // 「当前项目」，必须由用户选了项目才调用发布动作；没有项目时
  // 直接说明原因。取消选择器不调用、不改数据。
  const requestSend = (p: Preset) => {
    if (sendMutation.isPending) return;
    if (projects.length === 0) {
      setPublishError(
        "还没有剧本项目：请先去剧本工作台新建一个项目，再回来点「发布到剧本」。",
      );
      return;
    }
    setPickerPreset(p);
  };

  // 选完项目后：卡上没图仍先问（先发布文字 / 先补图），绝不静默
  // 只发文字；有图直接发布。
  const chooseProject = (projectId: number) => {
    const p = pickerPreset;
    setPickerPreset(null);
    if (!p) return;
    if (p.images.length === 0) {
      setPendingSend({ preset: p, projectId });
      return;
    }
    sendMutation.mutate({ presetId: p.id, projectId });
  };

  const deleteTarget = presets.find((p) => p.id === confirmDeleteId) ?? null;
  const activeCount =
    activeCategory === "全部"
      ? presets.length
      : (categories.find((c) => c.name === activeCategory)?.count ?? 0);

  return (
    <div>
      <div
        className="rounded-[var(--radius)] border p-3.5 text-sm leading-6"
        style={{ borderColor: "var(--info)", background: "var(--info-soft)" }}
        role="note"
      >
        <p className="font-bold">人物资产储存库</p>
        <p className="mt-0.5">
          只存人物资产：图、姓名、扮演、备注，按分类存放，可发布到剧本项目。
        </p>
        <details className="help-fold">
          <summary aria-label="储存库使用说明（点开查看）">使用说明</summary>
          <div className="help-fold-body">
            卡面就是编辑入口——图、姓名、扮演、备注、分类都直接在卡上改（点到别处自动保存），所有卡默认可直接改、可直接删。储存库只保存在本工作台内，与原 3:4 工作台不自动同步。点卡上的「发布到剧本」会先让你选要发到哪个剧本项目，再把这张卡（姓名、扮演、备注和主图，不带分类）发到那个项目的人物区；该人物已经在那个项目里时不会重复添加，会明确提示你。
          </div>
        </details>
      </div>
      {errorMsg && (
        <p className="mt-3 text-sm text-[var(--bad)]" role="alert">
          {errorMsg}
        </p>
      )}

      {/* 分类区（新功能高光引导的锚点：新建分类 + 分类管理都在这一块里） */}
      <div data-tour="library-categories">
      {/* 分类管理 + 搜索（与左侧分类栏叠加生效） */}
      <div className="mt-4 flex flex-wrap items-end gap-2">
        <div className="min-w-[200px] flex-1">
          <label className="mb-1 block text-xs font-medium text-[var(--dim)]" htmlFor="lib-search">
            按姓名搜索（可与左侧分类叠加）
          </label>
          <input
            id="lib-search"
            className="field"
            placeholder="输入人物姓名筛选"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="min-w-[200px] flex-1">
          <label className="mb-1 block text-xs font-medium text-[var(--dim)]" htmlFor="lib-new-category">
            新建分类
          </label>
          <div className="flex gap-2">
            <input
              id="lib-new-category"
              className="field min-w-0 flex-1"
              placeholder="如：反派、老师"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
            />
            <button
              type="button"
              className="btn shrink-0"
              disabled={!newCategoryName.trim() || createCategoryMut.isPending}
              onClick={() => createCategoryMut.mutate(newCategoryName)}
            >
              新建分类
            </button>
          </div>
        </div>
      </div>
      {/* 分类管理：每个分类旁都有改名 / 删除按钮（v3.27 起常驻可见，
          不再只藏在「当前分类」一行里）。 */}
      <div
        className="mt-3 rounded-[var(--radius)] border p-3"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <p className="text-sm font-bold">分类管理</p>
        <p className="mt-0.5 text-xs leading-5 text-[var(--dim)]">
          删分类不删卡，卡会自动回到「未分类」；「未分类」不能改名、不能删除。
        </p>
        <ul className="mt-2 divide-y" style={{ borderColor: "var(--border)" }}>
          {categories.map((c) => (
            <li key={c.name} className="flex flex-wrap items-center gap-2 py-2">
              <button
                type="button"
                className="btn btn-sm"
                aria-pressed={activeCategory === c.name}
                aria-label={`切换到分类${c.name}`}
                onClick={() => setActiveCategory(c.name)}
              >
                {c.name}（{c.count} 张卡）
              </button>
              {c.name !== "未分类" && renameFor !== c.name && (
                <>
                  <button
                    type="button"
                    className="btn btn-sm"
                    aria-label={`给分类${c.name}改名`}
                    onClick={() => {
                      setRenameFor(c.name);
                      setRenameDraft(c.name);
                    }}
                  >
                    改名
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-danger-ghost"
                    aria-label={`删除分类${c.name}`}
                    onClick={() => setDeleteCategoryTarget(c)}
                  >
                    删除
                  </button>
                </>
              )}
              {renameFor === c.name && (
                <span className="flex flex-wrap items-center gap-2">
                  <input
                    className="field w-40"
                    aria-label={`分类${c.name}的新名字`}
                    placeholder="新分类名"
                    value={renameDraft}
                    onChange={(e) => setRenameDraft(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    disabled={
                      !renameDraft.trim() ||
                      renameDraft.trim() === c.name ||
                      renameCategoryMut.isPending
                    }
                    onClick={() =>
                      renameCategoryMut.mutate({ from: c.name, to: renameDraft })
                    }
                  >
                    确认改名
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => setRenameFor(null)}
                  >
                    取消
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
        {activeCategory !== "全部" && (
          <p className="mt-1 text-xs text-[var(--dim)]">
            当前分类「{activeCategory}」共 {activeCount} 张卡。
          </p>
        )}
      </div>
      </div>

      {presetsQuery.isPending ? (
        <p className="py-12 text-center text-sm text-[var(--dim)]">加载设定卡中…</p>
      ) : presetsQuery.isError ? (
        <p className="py-12 text-center text-sm text-[var(--bad)]">设定卡加载失败，请刷新重试</p>
      ) : (
        <section className="mt-5" aria-label="设定卡列表">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-2xl font-bold">
              {activeCategory === "全部" ? "全部人物" : activeCategory}
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <div className="seg" role="group" aria-label="查看：卡片大小" data-tour="library-view-size">
                {LIBRARY_CARD_SIZES.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    aria-pressed={cardSize === s.key}
                    aria-label={`查看方式：${s.label}`}
                    onClick={() => setCardSize(s.key)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={mouseZoom}
                aria-label="鼠标放大开关"
                title="开启后，把鼠标放到大卡片 / 小卡片的图片上会悬浮放大原图，移开图片即消失"
                data-tour="library-mouse-zoom"
                className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm"
                style={{
                  borderColor: mouseZoom ? "var(--accent)" : "var(--border)",
                  background: "var(--surface)",
                  color: "var(--text)",
                }}
                onClick={() => setMouseZoom((v) => !v)}
              >
                <span>鼠标放大</span>
                <span
                  aria-hidden="true"
                  className="relative inline-block h-5 w-9 shrink-0 rounded-full"
                  style={{
                    background: mouseZoom ? "var(--accent)" : "var(--border)",
                    transition: "background 0.15s",
                  }}
                >
                  <span
                    className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow"
                    style={{
                      left: mouseZoom ? 18 : 2,
                      transition: "left 0.15s",
                    }}
                  />
                </span>
                <span className="font-medium">{mouseZoom ? "开" : "关"}</span>
              </button>
              <label className="flex items-center gap-1.5 text-sm">
                <span className="text-[var(--dim)]">放大倍数</span>
                <select
                  className="field py-1.5 text-sm"
                  style={{ width: "auto" }}
                  aria-label="鼠标放大倍数"
                  value={String(mouseZoomScale)}
                  onChange={(e) => setMouseZoomScale(Number(e.target.value))}
                >
                  {ZOOM_SCALES.map((s) => (
                    <option key={s} value={String(s)}>
                      {s}倍
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="btn"
                aria-label="一键AI分析储存库全部资产卡"
                disabled={
                  paBatchBusy || paBusyId !== null || presets.length === 0
                }
                onClick={() => void runBatchPresetAnalysis(paResumeMode)}
              >
                {paBatchBusy
                  ? "分析中…"
                  : paResumeMode
                    ? "接着跑剩下的人"
                    : `一键AI分析（${presets.length}张）`}
              </button>
              {batchMode ? (
                <>
                  <button
                    type="button"
                    className="btn"
                    style={{
                      color: "var(--bad)",
                      borderColor: "var(--bad)",
                    }}
                    aria-label={`删除所选的${batchTargets.length}张人物卡（先弹确认框，删除不可恢复）`}
                    disabled={
                      batchTargets.length === 0 || batchDeleteMut.isPending
                    }
                    onClick={() => setBatchConfirmOpen(true)}
                  >
                    {batchDeleteMut.isPending
                      ? "删除中…"
                      : `删除所选（${batchTargets.length}）`}
                  </button>
                  <button
                    type="button"
                    className="btn"
                    aria-label="退出批量删除模式（清空已勾选的卡）"
                    disabled={batchDeleteMut.isPending}
                    onClick={exitBatchMode}
                  >
                    退出批量
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn"
                  aria-label="进入批量删除模式（卡片上出现勾选框，可多选后一次删除）"
                  disabled={presets.length === 0}
                  onClick={() => {
                    setBatchNotice(null);
                    setBatchMode(true);
                  }}
                >
                  批量删除
                </button>
              )}
              <button
                type="button"
                className="btn btn-primary"
                disabled={createCardMut.isPending}
                onClick={() => createCardMut.mutate()}
              >
                新建人物卡
              </button>
            </div>
          </div>
          <p className="mt-1 text-sm text-[var(--dim)]">
            当前显示 {filtered.length} 张卡（本分类共 {activeCount} 张，储存库共 {presets.length} 张）。
            {search.trim() && `正在按姓名「${search.trim()}」筛选。`}
            {classFilter !== "全部" && `正在按系统分类「${classFilter}」筛选。`}
          </p>
          {batchMode && (
            <p className="mt-1 text-sm font-medium" role="status">
              批量删除模式：点卡片左上角的勾选框选卡（已选 {batchTargets.length} 张，换筛选 / 搜索不丢已选），选好后点上方「删除所选」——删前还会再弹一次确认框。
            </p>
          )}
          {batchNotice && (
            <p className="mt-1 text-sm" role="status">
              {batchNotice}
            </p>
          )}
          <div
            className="seg mt-2"
            role="group"
            aria-label="按系统分类筛选（性别与年龄组）"
          >
            {CLASS_FILTERS.map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={classFilter === key}
                aria-label={`系统分类筛选：${key}（${classCounts[key] ?? 0} 张卡）`}
                onClick={() => setClassFilter(key)}
              >
                {key}（{classCounts[key] ?? 0}）
              </button>
            ))}
          </div>
          {(paBatch || paReceipt || paNotice) && (
            <div
              className="mt-2 rounded-[10px] border p-3"
              style={{
                borderColor: "var(--border)",
                background: "var(--surface)",
              }}
              role="status"
              aria-label="AI 分析进度与回执"
            >
              {paBatch && (
                <p className="text-sm font-medium">
                  正在分析 {Math.min(paBatch.done + 1, paBatch.total)}/
                  {paBatch.total}：{paBatch.current}…
                </p>
              )}
              {paReceipt && (
                <p
                  className="text-sm leading-6"
                  style={{ whiteSpace: "pre-line" }}
                >
                  {paReceipt}
                </p>
              )}
              {paNotice && <p className="text-sm leading-6">{paNotice}</p>}
            </div>
          )}
          <details className="help-fold">
            <summary aria-label="卡片查看说明（点开查看）">查看说明</summary>
            <div className="help-fold-body">
              新建的人物卡会放进{activeCategory === "全部" ? "「未分类」" : `「${activeCategory}」`}，建好后直接在卡上填姓名、传图、选分类。
              当前查看是「{LIBRARY_CARD_SIZES.find((s) => s.key === cardSize)?.label}」
              {cardSize === "lg"
                ? "：卡上只留主图、姓名、扮演、备注前 2 行、分类和发布 / 删除，其余都在点「展开详情」打开的悬浮窗里改。"
                : "：卡上只留主图、姓名、分类和发布，其余都在点「展开详情」打开的悬浮窗里改。"}
              切换档位只是换查看方式，卡里的数据一张都不变；每次打开默认回到小卡片。
              {mouseZoom
                ? `鼠标放大已开（${mouseZoomScale}倍）：大卡片 / 小卡片都生效，把鼠标放到卡片图片上会悬浮放大原图、移开图片范围悬浮图立即消失。`
                : "鼠标放大已关：开启后大卡片 / 小卡片悬停图片可放大看原图，倍数可调。"}
            </div>
          </details>
          {filtered.length === 0 && (
            <p className="mt-6 text-center text-sm text-[var(--dim)]">
              {presets.length === 0
                ? "还没有人物卡。点「新建人物卡」建第一张。"
                : "这个分类 / 搜索下没有卡。换个分类或清掉搜索词试试，或点「新建人物卡」往这里加一张。"}
            </p>
          )}
          <div
            className={`mt-4 grid ${
              cardSize === "lg"
                ? "grid-cols-1 gap-4 sm:grid-cols-2"
                : "grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
            }`}
          >
            {filtered.map((p, idx) => (
              <LibraryCard
                key={p.id}
                preset={p}
                eager={idx < 8}
                categories={categories}
                allPresets={presets}
                size={cardSize}
                mouseZoomEnabled={mouseZoom}
                mouseZoomScale={mouseZoomScale}
                sendPending={sendMutation.isPending}
                onError={setErrorMsg}
                onDeleteRequest={() => setConfirmDeleteId(p.id)}
                onSendRequest={() => requestSend(p)}
                analysisBusy={paBusyId === p.id}
                analysisDisabled={paBatchBusy || paBusyId !== null}
                onAnalyze={() => void runSinglePresetAnalysis(p)}
                batchMode={batchMode}
                batchChecked={batchSelected.has(p.id)}
                onBatchToggle={() => toggleBatchCard(p.id)}
              />
            ))}
          </div>
        </section>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title={`删除人物卡「${deleteTarget.name}」？`}
          body="删除后这张卡和卡上存的图会从储存库里去掉，已经发布到剧本的人物卡不受影响。此操作不能撤销。"
          confirmLabel="确认删除"
          cancelLabel="取消"
          onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
      {batchConfirmOpen && batchTargets.length > 0 && (
        <ConfirmDialog
          title={`删除所选的 ${batchTargets.length} 张人物卡？`}
          body={
            <div>
              <p>下面这些卡会连同卡上的图一起从储存库里删掉：</p>
              <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
                {batchTargets.map((t) => (
                  <li key={t.id}>
                    「{t.name || "未命名人物"}」（{t.images.length} 张图）
                  </li>
                ))}
              </ul>
              <p className="mt-1.5">
                已经发布到剧本的人物卡不受影响。删除后无法恢复。
              </p>
            </div>
          }
          confirmLabel={`确认删除 ${batchTargets.length} 张卡`}
          cancelLabel="取消"
          pending={batchDeleteMut.isPending}
          onConfirm={() =>
            batchDeleteMut.mutate(batchTargets.map((t) => t.id))
          }
          onCancel={() => setBatchConfirmOpen(false)}
        />
      )}
      {pendingSend && (
        <ConfirmDialog
          title={`「${pendingSend.preset.name}」还没有资产图`}
          body={`将发布到项目「${projects.find((p) => p.id === pendingSend.projectId)?.name ?? ""}」。这张卡上一张图都没有。可以先只发布文字（姓名 / 扮演 / 备注）到剧本，之后把图补到这张卡上再发布一次就会连图带过去；也可以先不发，回去在卡上补图。`}
          confirmLabel="先发布文字"
          cancelLabel="先补图（暂不发布）"
          pending={sendMutation.isPending}
          onConfirm={() => {
            const v = {
              presetId: pendingSend.preset.id,
              projectId: pendingSend.projectId,
            };
            setPendingSend(null);
            sendMutation.mutate(v);
          }}
          onCancel={() => setPendingSend(null)}
        />
      )}
      {pickerPreset && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
          style={{
            background: "rgba(3, 5, 9, 0.62)",
            paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
          }}
          role="alertdialog"
          aria-modal="true"
          aria-label={`选择要把${pickerPreset.name}发布到哪个剧本项目`}
          onClick={() => setPickerPreset(null)}
        >
          <div
            className="w-full max-w-md rounded-[14px] border p-5"
            style={{
              borderColor: "var(--border)",
              background: "var(--surface)",
              boxShadow: "var(--shadow-card)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-display text-lg font-bold">
              把「{pickerPreset.name}」发布到哪个项目？
            </p>
            <p className="mt-1 text-sm leading-6 text-[var(--dim)]">
              选一个剧本项目，人物会发到那个项目的人物列表里；已经在那个项目里的人物不会重复添加。
            </p>
            <div className="mt-3 flex flex-col gap-2">
              {projects.map((proj) => (
                <button
                  key={proj.id}
                  type="button"
                  className="btn w-full justify-between"
                  aria-label={`发布到项目${proj.name}`}
                  disabled={sendMutation.isPending}
                  onClick={() => chooseProject(proj.id)}
                >
                  <span className="font-medium">{proj.name}</span>
                  <span className="text-xs text-[var(--dim)]">
                    {proj.characterCount} 位人物
                  </span>
                </button>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                className="btn"
                onClick={() => setPickerPreset(null)}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
      {publishResult && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
          style={{
            background: "rgba(3, 5, 9, 0.62)",
            paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
          }}
          role="alertdialog"
          aria-modal="true"
          aria-label={publishResult.created ? "发布成功" : "该人物已在项目中"}
          onClick={() => setPublishResult(null)}
        >
          <div
            className="w-full max-w-md rounded-[14px] border p-5"
            style={{
              borderColor: "var(--border)",
              background: "var(--surface)",
              boxShadow: "var(--shadow-card)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-display text-lg font-bold">
              {publishResult.created
                ? `已发布到「${publishResult.projectName}」`
                : `该人物已在「${publishResult.projectName}」中`}
            </p>
            <div className="mt-2 text-sm leading-6">
              {publishResult.created ? (
                <p>
                  人物「{publishResult.charName}」已新建到该项目的人物列表（姓名 /
                  扮演 / 备注按卡面带过去，分类不带过去）。{publishResult.imageNote}
                </p>
              ) : (
                <p>
                  「{publishResult.charName}」已经在该项目的人物列表里，不再重复添加；已有的人物卡备注已按卡面同步为最新内容。{publishResult.imageNote}
                </p>
              )}
            </div>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="btn"
                onClick={() => setPublishResult(null)}
              >
                留在储存库
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  const t = {
                    projectId: publishResult.projectId,
                    characterId: publishResult.characterId,
                  };
                  setPublishResult(null);
                  onGoToScriptCharacters(t);
                }}
              >
                去剧本工作台查看
              </button>
            </div>
          </div>
        </div>
      )}
      {publishError && (
        <ConfirmDialog
          title="发布没有成功"
          body={publishError}
          confirmLabel="知道了"
          cancelLabel="关闭"
          onConfirm={() => setPublishError(null)}
          onCancel={() => setPublishError(null)}
        />
      )}
      {deleteCategoryTarget && (
        <ConfirmDialog
          title={`删除分类「${deleteCategoryTarget.name}」？`}
          body={`只删分类本身，不删卡：这个分类里的 ${deleteCategoryTarget.count} 张卡会自动回到「未分类」，之后可以在卡上重新选分类。`}
          confirmLabel="删除分类"
          cancelLabel="取消"
          onConfirm={() => deleteCategoryMut.mutate(deleteCategoryTarget.name)}
          onCancel={() => setDeleteCategoryTarget(null)}
        />
      )}
    </div>
  );
}
