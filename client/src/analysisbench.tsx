// ---------------------------------------------------------------------------
// 分析模仿页（v4.55）：监控台的第二个标签页，与「监控账号」并排。
//
// 用途：把监控页里看到的爆款视频用「AI解剖」拆成分镜表与资产
// 准备清单，存成一条分析记录（v4.58 精简后页面只剩基础信息 +
// 解剖结果两部分，见文件尾部 v4.58 注）。
// 两个入口：
//   ① 顶部导航直接点进来 —— 先看到分析记录列表，可以新建一条
//      空白分析（第一节自己手填），也可以打开已有记录接着改；
//   ② 在监控页的视频卡片封面上点淡绿色「分析」按钮 —— 直接进
//      本页的新分析表单，第一节「视频基础信息」（标题 / 达人 /
//      时长 / 点赞 / 播放 / 发布时间 / 视频链接 / 视频ID）已从
//      卡片自动带入，仍可手改。
//
// 记录存服务端 video_analyses 表（listVideoAnalyses /
// saveVideoAnalysis / deleteVideoAnalysis），换浏览器不丢；可存
// 多条，列表里可查看 / 编辑 / 删除（删除走二次确认）。
//
// 表单现只剩两节：一、视频基础信息；二、AI解剖结果。（v4.55 时
// 的五节大白话模板——二、爆款拆解 / 三、可复刻 vs 需改写 / 四、
// 模仿方案 / 五、一句话总结——已于 v4.58 下线，字段保留不删。）
//
// v4.56 AI解剖：第一节右上角加「AI解剖」按钮（旁注「AI 看视频拆
// 片段，一键生成分镜表」）。点它先弹配额确认，确认后浏览器本地
// 抽帧（dissectframes.ts，视频不经第三方），帧图 + 基础信息一起
// 送服务端 dissectVideo（ctx.inference 视觉）；
// 链接失效 / 跨域抽不到帧时自动降级纯文本模式并明示。结果分两
// 部分渲染在第二节：①分镜表（全局规范 → 镜头总览表 → 逐镜头节
// 拍表，时间码按语速 5 字/秒从节拍确定性重算、精确到 0.1 秒，
// 语气情绪加粗，无台词的拍标题行写「无台词」）；②资产准备清单
// （人物 / 场景与 v4.16 同构、物品给一句话中文提示词）。结果存
// 回分析记录（dissectionJson），可复制全文，也可「一键套用」
// 经 applyDissection 存为分镜阶段的新项目并跳过去继续编辑。
//
// v4.57 解剖进度显示：第一节「AI解剖」按钮下方加小型赛博朋克风
// 进度面板（DissectProgress，样式在 theme.css .cyber-*）：四步
// ①抽帧/加载视频 ②AI 识别片段 ③生成分镜表 ④生成资产清单，每步
// 步骤名 + 百分比 + 霓虹细条、当前步高亮流动。抽帧步用抽帧回调的
// 真实帧数进度；服务端 dissectVideo 是一次推理同出分镜与资产、
// 没有分段回执，第二～四步按阶段推进显示（抽完帧进识别、过半切
// 分镜表、后段切资产清单，未回执的步只爬到 92% 不假装完成，响应
// 回来才全部置 100）。全部完成显示「解剖完成 ✓」约 2 秒后淡出消
// 失；任一步失败整条转红、写明第几步出错与原因，并给「重试解剖」
// 按钮（回配额确认框再跑）。抽帧失败仍按 v4.56 口径降级纯文本、
// 不算失败（第一步标注降级继续往下走）。解剖管线本身一字未动。
//
// v4.58 分析页精简：表单删掉二、爆款拆解 / 三、可复刻 vs 需改写 /
// 四、模仿方案 / 五、一句话总结四节，页面只留一、视频基础信息
// （含「AI解剖」按钮与进度面板）与 AI解剖结果（改编号为二）。列
// 表卡的「火的原因」总结预览同步下线。只是前端不展示：video_
// analyses 的 hook/structure/rhythm/humor/emotion/reusable/
// must_rewrite/keep_skeleton/replace_plan/pattern/summary 字段与
// 服务端动作一字未动，FormState 仍载入并在保存时原样回传，旧记
// 录已存的内容不丢、仍作 dissectVideo 的辅助上下文（新记录这几
// 项为空）。导航与卡片「分析」入口不变。
//
// v4.59 列表卡「看原视频」改悬浮播放窗（AnalysisVideoModal，与监
// 控页 VideoPlayerModal 同款）：标题 + 达人·时长·发布时间 + 关闭
// × + 播放器（视频文件链接）+ 播放/点赞数 + 窗内「看原视频」外链
// 按钮跳快手原链；关窗回列表、状态不丢。其余一字未动。
//
// v4.71 AI解剖抽帧改云端优先（用户实报：视频在云端有文件，解剖却
// 还在用过期的快手链接抽帧、白等失败）：点「开始解剖」后抽帧来源
// 按序定——①解剖确认弹窗里选了本地 mp4 文件就用本地文件（不走任
// 何链接）；②否则先调云端清单（listCloudSavedVideos）查这条视频
// （按视频ID）有没有云端文件，有 → 用 getCloudVideo 的同源地址
// （≙ /api/cloud-video/{videoId}）抽帧、不碰快手链接；③没有云端
// 文件才用快手直链，且先 probeVideoLink 快速 HEAD 探活——403 /
// 超时立刻走纯文本降级（不再干等抽帧 20 秒超时），结果顶部明示
// 「视频链接已过期，未能抽帧，以下为按标题+描述的文本分析。如需
// 帧分析，请先点「存云端」再解剖。」，探活通过才真抽帧、抽帧本身
// 再失败仍按 v4.56 口径带原因降级。确认弹窗另加一行小字兜底：
// 「本地有视频文件？点这里上传」——从电脑选 mp4 直接本地抽帧。
// 服务端 dissectVideo 与解剖管线其余部分一字未动。
//
// v4.72 修 AI 解剖单次推理过载（诊断结论：24 帧一次塞进单次推理
// 调用确定性失败，只回通用 "inference failed"）：①降单次负载——
// dissectframes 抽帧改约 5 秒一帧、上限 10 帧（平台单次推理图片
// 上限，实测 11 帧必挂、10 帧成功；60 秒视频 10 帧约 6 秒一帧），
// 服务端 dissectVideo 入参帧上限同步 10；②推理失败自动重试——
// 服务端推理失败后等 5 秒同参重试 1 次，客户端 callWithGatewayRetry
// 匹配口径扩大到 "inference failed" 也自动重试一次，两层都失败才
// 变红；③错误分类——服务端按耗时（≥230 秒判超时）/ 原文 / 帧数
// 分超时、图片超量、模型拒识、其他四类回可操作提示，不再只甩一句
// inference failed。三选一抽帧来源、纯文本降级、四步进度面板、
// 输出 schema、配额确认流程全部未动。
//
// v4.73 AI解剖改分批跑（用户拍板：质量优先、不省配额；10 帧 6 秒
// 一帧人物穿搭长相分不清、解剖没意义）：①抽帧恢复加密——约 1.5
// 秒一帧、上限 40 帧（60 秒视频 40 帧，dissectframes）；②推理分
// 5 批——每批 8 帧、只识别自己那段时间窗，独立调一次服务端新动作
// dissectVideoBatch（单批 8 帧稳在平台单次图片上限 10 内）；后批
// 带上前面批次已确认的人物（knownCharacters：代号+身份+造型），
// 服务端要求沿用同代号同口径，从源头压人物重复；③客户端合并
// （mergeBatchResults）：人物表按身份+造型相似度去重合并成一人
// 一条（各字段取写得更全的那份、穿搭取最清晰即最长的造型），并
// 按每批的代号映射把该批节拍 speaker 与人物资产名改写成统一代
// 号；镜头组按批序（=时间序）拼接；资产清单按名合并去重（人物
// 按统一代号、场景/物品按名，取信息更全的一份）；④进度第 2 步
// 小字实时显示「AI识别中（第 x/5 批）」；⑤容错——每批客户端再兜
// 一层重试（服务端内部已重试 1 次，客户端对失败批隔 3 秒再调一
// 次整批），某批仍失败就跳过、用其余批结果继续，不整单变红，失
// 败批号记进结果 failedBatches（随 dissectionJson 存回记录），结
// 果顶部逐批注明「第 x 批识别失败，该时段人物信息可能不全」；全
// 部批都失败才按整单失败变红。纯文本降级仍只跑 1 批。三选一抽帧
// 来源、四步进度面板、结果渲染与一键套用未动（applyDissection
// 入参上限配合放宽：人物 10 / 镜头组 20 / 场景 12 / 物品 16）。
//
// v4.74 第 2 步改「输出分批」+ 重试熔断（真机实报：纯文本第 2 步
// 撞网关超时；深度诊断定案——纯文本那一窗让模型一次生成整条 331
// 秒视频的完整分镜（36 节拍 + 三份资产、数千 token），生成太慢撞
// 网关传输层超时，请求体 <2KB、问题在输出太大；v4.73 的重试撞的
// 是同一个巨型请求、6 次尝试最多烧 12 次推理配额）：①第 2 步拆
// 三层子批——骨架批（dissectSkeleton，纯文本先行：只出镜头组划
// 分 + 每组时间范围 + 一句话梗概，输出小秒回；有帧模式骨架即帧
// 窗本身、不另调）→ 节拍批（dissectBeatsBatch：纯文本按骨架时间
// 窗约 60 秒一窗、有帧沿用每窗 8 帧帧窗，每窗只写自己时间窗的
// 节拍 + 台词 + 本窗人物表，不再带资产；knownCharacters 沿用同
// 代号机制不变）→ 资产批（dissectAssets：基于合并后的人物表与
// 全部节拍单独出资产清单 + 全片梗概 + 生成备注）；合并复用人物
// 规范化逻辑（mergeCharacterRows/mergeBeatGroups），最终产物仍
// 是完整剧本格式01 分镜表 schema、一键套用不受影响。②熔断——
// 三个子批动作服务端一律单次推理（删去服务端内重试，失败回
// ok:false + errorKind 结构化分类）；客户端统一编排重试：失败先
// 判类型，慢输出型超时（网关超时文案 / errorKind=timeout）绝不
// 原样重试同一窗，自动把该窗拆成更小的两窗接着跑（帧窗按帧数
// 对半、骨架窗按组对半，子窗不再二次拆分）；其余失败才重试 1
// 次；第 2 步全部额外调用共用 4 次总预算，超了按最终失败处理
// （节拍窗跳过并注明、骨架/资产批整步标红待续跑），同一拆批路
// 径失败才算真失败。③进度——第 2 步小字改「生成分镜（第 x/y
// 批）」（y 含骨架批与资产批，拆分时 y 随之 +1）；断点细化到子
// 批粒度（DissectCheckpoint v2：骨架/窗清单/逐窗结果/资产批分
// 开落 localStorage 新键 dissect-checkpoint-v2:），哪批挂只重跑
// 哪批，「重试本步」保留。④保持不动：抽帧参数（1.5 秒/帧、上
// 限 40 帧）、输入分批逻辑、云端优先、三选一抽帧来源、纯文本
// 降级定稿文案、配额确认弹窗、四步进度面板外观、输出 schema、
// 「质量优先、不省配额」长期原则。dissectVideo / dissectVideoBatch
// 保留未动（无调用方）。
//
// v4.75 场景切分 + 关键帧（生产级管线 P0 两条 + P1 关键帧；人脸
// 聚类编号与异步任务制留 v4.76）：①场景切分替代均匀窗——有云
// 端文件的视频第 1 步调新动作 detectCloudScenes（特权层对云端
// 文件跑场景检测：优先 PySceneDetect ContentDetector，本机没装
// 时回落 ffmpeg 内置 scene 评分，method 如实回传），切分点定场
// 景段；浏览器本地抽帧模式用 dissectframes 的帧间差异聚类近似
// 分段；纯文本模式保持骨架批定组（结果 segNote 明示「按文本梗
// 概分段」）。节拍窗按场景段定：段内关键帧 >8 或跨度 >约 62 秒
// 再切子窗（单窗输出仍小）；无关键帧的空段并进相邻段。②窗间
// 重叠——相邻窗 overlapNextSec=2 且共享边界帧（下一窗首帧在有
// 余量时也发给本窗），节拍批提示词新增重叠说明（照常写全、合
// 并去重）；mergeBeatGroups 在「上一窗末组 ↔ 本窗首组」交界带
// 按（说话人+台词归一化）/ 画面高度重合去重，人物代号先经
// rename 对齐再比，不丢不重。③关键帧替代均匀帧——dissectframes
// 采样候选帧时逐帧算清晰度（拉普拉斯方差）/ 帧间差异 / 人脸
// （FaceDetector 可用时），selectKeyframeIndices 每场景挑分数
// 最高者（人脸优先 + 清晰度），总量约候选 1/4、上限仍 40。
// ④断点升 v3（新键 dissect-checkpoint-v3:，多存 scenes/segMet
// hod/candidateCount，BeatWindow 加 overlapNextSec）；三层输出
// 结构、熔断、子批粒度、配额弹窗、输出 schema、纯文本降级定稿
// 文案、云端优先全部保持不动；第 2 步进度文案仍用「批」。
//
// v4.83 资产批超时加固：资产批（旧整批 dissectAssets 曾报
// Gateway request timed out）拆成人物 / 场景 / 物品三个独立小
// 请求串行跑（新动作 dissectAssetCharacters / dissectAssetScenes
// / dissectAssetProps），每类独立存盘断点（断点升 v4、新键
// dissect-checkpoint-v4:），哪类挂只重跑哪类；输入减负——不再
// 重发全部关键帧，最多带 2 张（首帧 + 中段帧）做外貌 / 场景校
// 准；超时熔断——某类慢输出超时不原样重试，自动把该类的节拍
// 输入拆成前后两半分别跑再按名合并（半批不再二次拆分），与节
// 拍窗共用第 2 步额外调用总预算 4 次；三类拼回的产物与旧整批
// 完全同构（输出 schema 不变），dissectAssets 本体保留未动。
// 同版另含：映射排版重定义与道具映射（scriptlib）、套用补写
// （applyDissection 写 propAssets + 分镜映射上下文接场景卡）。
// ---------------------------------------------------------------------------

// v4.86 AI解剖大改（1:1 复刻导向）：四层管线取代旧骨架批/节拍批/
// 资产批。①转写层（新）：Whisper 级 ASR 逐句台词 + 0.1s 时间戳 +
// 声线聚类——网关无音频通道（实测 503 model_not_found），走服务端
// 本地 faster-whisper（云端文件直读 / 浏览器抽音频上传）；台词一
// 字不差照抄转写，融合层出参里没有台词字段、「看图猜台词」结构
// 性删除。②拆分层：场景切分定镜头起止（沿用 v4.75 通道）。③融合
// 层（新）：逐窗「画面 + 本窗台词」一起看，只配画面/情绪、写镜
// 头标题/景别/机位、声线簇对位到人物。④输出层：节拍由代码按时
// 间戳确定性组装（1 句 = 1 拍、空档补静音拍），主角按台词量 +
// 出镜时长在代码里筛 2~4 位，场景逐个写详细提示词，道具只收台
// 词点名/反复出现/推动剧情三条硬标准、无则整块不输出。每层独
// 立存盘（断点 v5），失败只重跑该层。质量门（代码校验）：台词
// 零丢失、总时长 = 原视频（误差 <0.5s）、人物跨镜造型统一。
// 删除：旧三批服务端动作与客户端编排、旧进度口径（第 x/5 批）。
// 保留：三选一来源、抽帧、配额确认、预检、存云端、视频库、套用。
// ---------------------------------------------------------------------------

// v4.87 「AI解剖」按钮下线（用户拍板：以后解剖都在聊天里做，助手
// 精修后把结果同步进本页的历史记录；工作台自带自动管线准确率不
// 如聊天精修，入口下线）：
// - 删除：第一节右上角「AI解剖」按钮 + 旁注、配额确认弹窗、预检
//   行、四步进度面板（DissectProgress）、客户端四层管线编排
//   （runDissection 与其专用 helper：断点 v5 读写 / 来源计划 /
//   合并组装 / 主角筛选等）、列表页打开记录时的本机断点恢复分支、
//   dissectframes / dissectaudio 在本文件的引用。
// - 保留不动：历史列表、新建 / 编辑 / 删除记录、记录详情（转写
//   原文 / 分镜表 / 资产清单 / 复制全文）、一键套用为新项目
//   （applyDissection）——聊天精修解剖的落点全在这些里。
// - 服务端解剖管线动作（转写 / 拆分 / 融合 / 定稿等）本次不动：
//   它们已无页面入口，但保留不影响历史记录与一键套用，避免清理
//   波及落点链路。
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react";
import { useVideoPlayFailed, VideoPlayFailedNotice } from "./monitorbench";
import { CloudBadge, useCloudVideoSource } from "./cloudvideo";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type ApiResponse } from "./api";
import { ConfirmDialog } from "./confirm";
import {
describeThrownError,
retryReadQuery,
withReadTimeout,
} from "./gateway";
import {
beatDisplay,
computeTimeline, fmtRange,
fmtTc,
globalSpecLines,
storyboardScript,
type LensMappingContext,
type ScriptData
} from "./scriptlib";

/** 从视频卡片点「分析」带入的第一节数据（App 经 props 传进来）。 */
export type AnalysisPrefill = {
  videoId: string;
  videoUrl: string;
  title: string;
  creatorName: string;
  durationText: string;
  likeCount: string;
  playCount: string;
  publishedText: string;
  /** v4.56：视频文件链接（AI解剖本地抽帧用）与描述全文。 */
  videoFileUrl: string;
  description: string;
};

type AnalysisRow = ApiResponse<typeof api, "listVideoAnalyses">["analyses"][number];

/** 表单状态：全部用字符串装（点赞 / 播放也是文本框，保存时转数字）。 */
type FormState = {
  id: number | null;
  videoId: string;
  videoUrl: string;
  title: string;
  creatorName: string;
  durationText: string;
  likeCount: string;
  playCount: string;
  publishedText: string;
  hook: string;
  structure: string;
  rhythm: string;
  humor: string;
  emotion: string;
  reusable: string;
  mustRewrite: string;
  keepSkeleton: string;
  replacePlan: string;
  pattern: string;
  summary: string;
  // v4.56 AI解剖
  videoFileUrl: string;
  description: string;
  dissectionJson: string;
  appliedProjectId: number | null;
};

const EMPTY_FORM: FormState = {
  id: null,
  videoId: "",
  videoUrl: "",
  title: "",
  creatorName: "",
  durationText: "",
  likeCount: "",
  playCount: "",
  publishedText: "",
  hook: "",
  structure: "",
  rhythm: "",
  humor: "",
  emotion: "",
  reusable: "",
  mustRewrite: "",
  keepSkeleton: "",
  replacePlan: "",
  pattern: "",
  summary: "",
  videoFileUrl: "",
  description: "",
  dissectionJson: "",
  appliedProjectId: null,
};

function rowToForm(r: AnalysisRow): FormState {
  return {
    id: r.id,
    videoId: r.videoId,
    videoUrl: r.videoUrl,
    title: r.title,
    creatorName: r.creatorName,
    durationText: r.durationText,
    likeCount: r.likeCount ? String(r.likeCount) : "",
    playCount: r.playCount ? String(r.playCount) : "",
    publishedText: r.publishedText,
    hook: r.hook,
    structure: r.structure,
    rhythm: r.rhythm,
    humor: r.humor,
    emotion: r.emotion,
    reusable: r.reusable,
    mustRewrite: r.mustRewrite,
    keepSkeleton: r.keepSkeleton,
    replacePlan: r.replacePlan,
    pattern: r.pattern,
    summary: r.summary,
    videoFileUrl: r.videoFileUrl ?? "",
    description: r.description ?? "",
    dissectionJson: r.dissectionJson ?? "",
    appliedProjectId: r.appliedProjectId ?? null,
  };
}

/** 文本框里的数字：去掉千分位逗号与空格后转整数，看不懂按 0。 */
function parseCountInput(raw: string): number {
  const n = Number(raw.replace(/[,，\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function formatCount(n: number): string {
  return n.toLocaleString("zh-CN");
}

/** 列表里的时间按北京时间「YYYY-MM-DD HH:mm」渲染。 */
function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

/**
 * v4.86：AI 解剖结果（四层管线产物）。旧记录（v4.85 及以前的
 * dissectionJson）字段是它的子集（mode/frameCount/totalSeconds/
 * synopsis/characterRows/groups/generationNotes/assets/failedBatches/
 * segNote），parseDissection 照常读；新字段（asrSource/transcript/
 * qualityNote/failedWindows、节拍上的 startSec/endSec/lowConf）旧
 * 记录没有就不显示。
 */
type CharRow = {
  name: string;
  identity: string;
  look: string;
  voice: string;
  tone: string;
};

type DissectBeat = {
  visual: string;
  sfx: string;
  speaker: string;
  emotion: string;
  line: string;
  actionSeconds: number;
  /** ASR 实测起止秒（0.1 精度）；估计模式由代码按镜长打包同口径写入。 */
  startSec?: number;
  endSec?: number;
  /** 转写置信度低的一拍，结果里标出请用户重点核对。 */
  lowConf?: boolean;
};

type DissectGroup = {
  title: string;
  sceneName: string;
  beats: DissectBeat[];
};

type DissectionAssets = {
  characters: { name: string; profile: string; promptZh: string; promptEn: string }[];
  scenes: { name: string; description: string; promptZh: string; promptEn: string }[];
  props: { name: string; description: string; promptZh: string }[];
};

type Dissection = {
  mode: "vision" | "text";
  frameCount: number;
  totalSeconds: number;
  synopsis: string;
  characterRows: CharRow[];
  groups: DissectGroup[];
  generationNotes: string[];
  assets: DissectionAssets;
  /** 旧记录的失败批号（v4.74–v4.85），只读展示。 */
  failedBatches?: number[];
  /** v4.86：最终失败的融合窗号（1 起）。 */
  failedWindows?: number[];
  segNote?: string;
  /** v4.86：转写来源（cloud 服务端直读 / upload 浏览器抽音频 / none 无转写估计）。 */
  asrSource?: "cloud" | "upload" | "none";
  /** v4.86：转写原文（说话人已对位到人物代号），随结果存回展示。 */
  transcript?: {
    start: number;
    end: number;
    text: string;
    speaker: string;
    cluster: string;
    confidence: number;
    lowConfidence: boolean;
  }[];
  /** v4.86：质量门结论（台词零丢失 / 总时长对齐 / 低置信句数）。 */
  qualityNote?: string;
};

function parseDissection(json: string | null | undefined): Dissection | null {
  if (!json || !json.trim()) return null;
  try {
    const d = JSON.parse(json) as Dissection;
    if (!d || !Array.isArray(d.groups) || !d.assets) return null;
    return d;
  } catch {
    return null;
  }
}

/** 解剖结果拼成临时 ScriptData，喂给 scriptlib 的同一套时间轴/规范渲染。 */
function buildTempScript(d: Dissection, title: string): ScriptData {
  const script: ScriptData = {
    title: title || "未命名视频",
    pendingItems: [],
    synopsis: d.synopsis,
    characterRows: d.characterRows,
    groups: d.groups,
    overlays: [],
    generationNotes: d.generationNotes,
    versionNote: "",
    speechRate: 5,
    styleLabel: "AI解剖复刻",
    targetSeconds: 0,
    generatedAt: new Date().toISOString(),
    stage: "storyboard",
    storyboardGroups: d.groups,
    storyboardConfig: { groupSeconds: 30 },
    // v4.83：物品资产随临时剧本带上，作道具映射的数据源（与套用后
    // 项目里的 propAssets 同口径）。
    propAssets: d.assets.props.map((p) => ({
      name: p.name,
      description: p.description,
      promptZh: p.promptZh,
    })),
  };
  return script;
}

function mappingCtxOf(d: Dissection): LensMappingContext {
  return {
    characters: d.assets.characters.map((c) => ({
      name: c.name,
      role: "",
      note: c.profile,
    })),
    scenes: d.assets.scenes.map((s) => ({
      name: s.name,
      description: s.description,
      asset: "场景资产图",
      // v4.83：场景生图提示词一并带进映射（此前只带描述，提示词
      // 在解剖结果里有、映射里丢）。
      promptZh: s.promptZh,
    })),
    // v4.83：道具映射数据源（逐镜头按名过滤，见 scriptlib）。
    props: d.assets.props.map((p) => ({
      name: p.name,
      description: p.description,
      promptZh: p.promptZh,
    })),
  };
}

function dissectionCounts(d: Dissection): { lenses: number; beats: number; assets: number } {
  return {
    lenses: d.groups.length,
    beats: d.groups.reduce((n, g) => n + g.beats.length, 0),
    assets:
      d.assets.characters.length + d.assets.scenes.length + d.assets.props.length,
  };
}

/** 分镜表 + 资产清单的全文 Markdown（复制用，与页面渲染同口径）。 */
function buildDissectionMarkdown(d: Dissection, title: string): string {
  const script = buildTempScript(d, title);
  const ctx = mappingCtxOf(d);
  const tl = computeTimeline(storyboardScript(script));
  const counts = dissectionCounts(d);
  const out: string[] = [];
  out.push(`# ${title || "未命名视频"} · AI解剖`, "");
  out.push(
    `解剖模式：${d.mode === "vision" ? `看帧解剖（关键帧 ${d.frameCount} 张，按场景挑最清晰的）` : "纯文本框架（没拿到画面，时长与台词为估计值）"}｜共 ${counts.lenses} 个镜头 · ${counts.beats} 个节拍 · ${d.asrSource && d.asrSource !== "none" ? "时间码来自 Whisper 转写时间戳（0.1 秒）" : "时间码按语速 5 字/秒重算"}`,
    "",
  );
  if (d.segNote) out.push(d.segNote, "");
  if (d.qualityNote) out.push(d.qualityNote, "");
  if (d.transcript && d.transcript.length > 0) {
    out.push("## 转写原文（Whisper 逐句，台词照抄自此）", "");
    for (const t of d.transcript) {
      out.push(
        `- [${fmtTc(t.start)}–${fmtTc(t.end)}] ${t.speaker || t.cluster}：${t.text}${t.lowConfidence ? "（⚠ 转写置信度低，请核对）" : ""}`,
      );
    }
    out.push("");
  }
  out.push("## 第一部分 · 分镜表", "", "### 全局规范", "");
  out.push(...globalSpecLines(script, ctx), "");
  out.push("### 镜头总览表", "");
  out.push("| 镜头 | 标题 | 场景 | 时间码 | 时长 | 节拍数 |", "| --- | --- | --- | --- | --- | --- |");
  tl.groups.forEach((g, gi) => {
    out.push(
      `| ${gi + 1} | ${g.title} | ${g.sceneName} | ${fmtRange(g.start, g.end)} | ${g.duration.toFixed(1)} 秒 | ${g.beats.length} |`,
    );
  });
  tl.groups.forEach((g, gi) => {
    out.push("", `### 镜头${gi + 1}｜${g.title}（${fmtRange(g.start, g.end)} · ${g.duration.toFixed(1)} 秒）`, "", `场景：${g.sceneName}`, "");
    g.beats.forEach((b, bi) => {
      const disp = beatDisplay(script, ctx, b, null, g.start, g.duration);
      out.push(
        `节拍${bi + 1}（${fmtRange(b.start, b.end)} · ${b.duration.toFixed(1)} 秒）｜${b.line.trim() ? "有台词" : "无台词"}`,
      );
      out.push(`画面内容：${disp.visualContent}；末帧：${disp.finalFrame}。`);
      out.push(
        b.line.trim()
          ? `人物对话：${b.speaker}（**${b.emotion}**）："${b.line}"`
          : `人物对话：（无台词，${disp.annotation}）`,
      );
      out.push(`快切感：${disp.quickCut}`);
      out.push(`运镜：${disp.camera}`);
      out.push(`音效：${disp.sfxFormatted}`);
      out.push("画面内无烧录文字（字幕后期压制）。", "");
    });
  });
  out.push("## 第二部分 · 资产准备清单", "");
  out.push(`### 人物资产图（${d.assets.characters.length} 个）`, "");
  if (d.assets.characters.length === 0) out.push("（无）", "");
  for (const c of d.assets.characters) {
    out.push(`- ${c.name}：${c.profile}`);
    out.push(`  生图提示词（中文）：${c.promptZh}`);
    out.push(`  Image prompt (EN): ${c.promptEn}`);
  }
  out.push("", `### 场景资产图（${d.assets.scenes.length} 个）`, "");
  if (d.assets.scenes.length === 0) out.push("（无）", "");
  for (const s of d.assets.scenes) {
    out.push(`- ${s.name}：${s.description}`);
    out.push(`  生图提示词（中文）：${s.promptZh}`);
    out.push(`  Image prompt (EN): ${s.promptEn}`);
  }
  // v4.86：没有特殊/关键道具时整块不输出（旧记录有道具照常输出）。
  if (d.assets.props.length > 0) {
    out.push("", `### 物品资产图（${d.assets.props.length} 个）`, "");
    for (const p of d.assets.props) {
      out.push(`- ${p.name}：${p.description}`);
      out.push(`  生图提示词（中文）：${p.promptZh}`);
    }
  }
  return out.join("\n");
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

function SectionTitle({ children }: { children: string }) {
  return (
    <h3 className="font-display text-base font-bold" style={{ color: "var(--text)" }}>
      {children}
    </h3>
  );
}

function TextAreaField({
  label,
  hint,
  value,
  onChange,
  rows = 3,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <div>
      <label className="mb-1 block text-[13px] font-bold">
        {label}
        {hint && (
          <span className="ml-2 font-normal text-[var(--dim)]">{hint}</span>
        )}
      </label>
      <textarea
        className="field w-full"
        rows={rows}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function InputField({
  label,
  value,
  onChange,
  placeholder,
  wide = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <label className="mb-0.5 block text-xs font-bold">{label}</label>
      <input
        className="field field-sm w-full"
        value={value}
        placeholder={placeholder}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/** 把 **加粗** 标记渲染成真正的粗体（全局规范行与语气情绪都用它）。 */
function mdBold(text: string) {
  const parts = text.split("**");
  return parts.map((p, i) =>
    i % 2 === 1 ? <strong key={i}>{p}</strong> : <span key={i}>{p}</span>,
  );
}

// AI解剖结果（原第六节，v4.58 精简后改编号为第二节）：第一部分分镜表
// + 第二部分资产准备清单。
// ---------------------------------------------------------------------------
function DissectionResult({
  d,
  title,
  notice,
  appliedProjectId,
  applying,
  applyError,
  copiedKey,
  onCopy,
  onApply,
  onOpenProject,
}: {
  d: Dissection;
  title: string;
  notice: string | null;
  appliedProjectId: number | null;
  applying: boolean;
  applyError: string | null;
  copiedKey: string | null;
  onCopy: (key: string, text: string) => void;
  onApply: () => void;
  onOpenProject?: (projectId: number) => void;
}) {
  const script = buildTempScript(d, title);
  const ctx = mappingCtxOf(d);
  const tl = computeTimeline(storyboardScript(script));
  const counts = dissectionCounts(d);
  const copyBtn = (key: string, text: string, label: string) => (
    <button
      type="button"
      className="btn btn-sm"
      aria-label={label}
      onClick={() => onCopy(key, text)}
    >
      {copiedKey === key ? "已复制 ✓" : "复制"}
    </button>
  );
  return (
    <section className="card mt-3 p-3" aria-label="二、AI解剖结果">
      <div className="flex flex-wrap items-center gap-2">
        <SectionTitle>二、AI解剖结果</SectionTitle>
        <span className="text-xs text-[var(--dim)]">
          {d.mode === "vision"
            ? `看帧解剖 · 关键帧 ${d.frameCount} 张（按场景挑最清晰的）`
            : "纯文本模式 · 没拿到画面，时长与台词为估计值"}
          {d.asrSource && d.asrSource !== "none"
            ? " · 台词来自 Whisper 转写（照抄原文）"
            : ""}
          {` · 共 ${counts.lenses} 个镜头 · ${counts.beats} 个节拍 · 资产 ${counts.assets} 项`}
        </span>
        <span className="ml-auto flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-sm"
            aria-label="复制分镜表和资产清单全文"
            onClick={() => onCopy("all", buildDissectionMarkdown(d, title))}
          >
            {copiedKey === "all" ? "已复制 ✓" : "复制分镜表 + 资产清单"}
          </button>
          {appliedProjectId !== null && onOpenProject && (
            <button
              type="button"
              className="btn btn-sm"
              aria-label="打开已套用的项目（分镜页）"
              onClick={() => onOpenProject(appliedProjectId)}
            >
              打开已套用项目
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary btn-sm font-bold"
            aria-label="一键套用：把这份分镜表存为新项目，去分镜页继续编辑"
            disabled={applying}
            onClick={onApply}
          >
            {applying ? "正在套用…" : appliedProjectId !== null ? "再次套用为新项目" : "一键套用为新项目"}
          </button>
        </span>
      </div>
      {/* v4.82 存储上限澄清：套用/存稿的段落组存储上限（500 组）
          不是模型一次能生成的量，免得用户把两者当成一回事。 */}
      <p className="mt-1.5 text-xs leading-5 text-[var(--dim)]" role="note">
        500 组为存储上限，单次生成仍受模型输出限制，超大分镜建议拆小。
      </p>
      {notice && (
        <p
          className="mt-2 rounded-[var(--radius)] p-2 text-[13px] leading-5"
          style={{ background: "var(--accent-soft)", color: "var(--text)" }}
          role="status"
        >
          {notice}
        </p>
      )}
      {d.segNote && (
        <p className="mt-2 text-xs leading-5 text-[var(--dim)]" role="status">
          {d.segNote}
        </p>
      )}
      {d.qualityNote && (
        <p
          className="mt-2 rounded-[var(--radius)] p-2 text-[13px] leading-5"
          style={{ background: "var(--accent-soft)", color: "var(--text)" }}
          role="status"
        >
          {d.qualityNote}
        </p>
      )}
      {d.transcript && d.transcript.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-[13px] font-bold">
            转写原文（{d.transcript.length} 句 · Whisper 逐句转写，分镜台词照抄自此）
          </summary>
          <ul className="mt-1 grid gap-0.5 text-[13px] leading-5">
            {d.transcript.map((t, i) => (
              <li key={i}>
                <span className="text-[var(--dim)]">
                  [{fmtTc(t.start)}–{fmtTc(t.end)}]
                </span>{" "}
                <span className="font-bold">{t.speaker || t.cluster}</span>：{t.text}
                {t.lowConfidence && (
                  <span className="font-bold" style={{ color: "var(--bad)" }}>
                    {" "}
                    ⚠ 转写置信度低，请核对
                  </span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
      {((d.failedWindows && d.failedWindows.length > 0) ||
        (d.failedBatches && d.failedBatches.length > 0)) && (
        <p
          className="mt-2 rounded-[var(--radius)] p-2 text-[13px] font-bold leading-5"
          style={{ background: "rgba(240, 102, 94, 0.14)", color: "var(--bad)" }}
          role="alert"
        >
          {(d.failedWindows && d.failedWindows.length > 0
            ? d.failedWindows.map(
                (x) => `第 ${x} 个融合窗识别失败，该时段画面信息可能不全（台词来自转写、不受影响）`,
              )
            : (d.failedBatches ?? []).map(
                (x) => `第 ${x} 批识别失败，该时段人物信息可能不全`,
              )
          ).join("；")}
          。其余时段的解剖结果不受影响，可以照常使用；想要补全，在聊天里把这条视频发给助手重新解剖即可。
        </p>
      )}
      {applyError && (
        <p className="mt-2 text-sm" style={{ color: "var(--bad)" }} role="alert">
          {applyError}
        </p>
      )}
      {d.synopsis && (
        <p className="mt-2 text-[13px] leading-5">
          <span className="font-bold">梗概：</span>
          {d.synopsis}
        </p>
      )}
      {d.characterRows.length > 0 && (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[560px] text-[13px]" aria-label="解剖人物表">
            <thead>
              <tr className="text-left text-[var(--dim)]">
                <th className="py-1 pr-2">人物</th>
                <th className="py-1 pr-2">身份</th>
                <th className="py-1 pr-2">造型</th>
                <th className="py-1 pr-2">音色</th>
                <th className="py-1">语气基调</th>
              </tr>
            </thead>
            <tbody>
              {d.characterRows.map((r) => (
                <tr key={r.name} className="border-t border-[var(--border)] align-top">
                  <td className="py-1 pr-2 font-bold">{r.name}</td>
                  <td className="py-1 pr-2">{r.identity}</td>
                  <td className="py-1 pr-2">{r.look}</td>
                  <td className="py-1 pr-2">{r.voice}</td>
                  <td className="py-1">{r.tone}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h4 className="mt-3 font-display text-[15px] font-bold">第一部分 · 分镜表</h4>
      <p className="mt-1 text-[13px] font-bold">全局规范</p>
      <ul className="mt-1 grid gap-0.5 text-[13px] leading-5">
        {globalSpecLines(script, ctx).map((line, i) => (
          <li key={i}>{mdBold(line.replace(/^- /, ""))}</li>
        ))}
      </ul>

      <p className="mt-2.5 text-[13px] font-bold">镜头总览表</p>
      <div className="mt-1 overflow-x-auto">
        <table className="w-full min-w-[560px] text-[13px]" aria-label="镜头总览表">
          <thead>
            <tr className="text-left text-[var(--dim)]">
              <th className="py-1 pr-2">镜头</th>
              <th className="py-1 pr-2">标题</th>
              <th className="py-1 pr-2">场景</th>
              <th className="py-1 pr-2">时间码</th>
              <th className="py-1 pr-2">时长</th>
              <th className="py-1">节拍数</th>
            </tr>
          </thead>
          <tbody>
            {tl.groups.map((g, gi) => (
              <tr key={gi} className="border-t border-[var(--border)]">
                <td className="py-1 pr-2 font-bold">{gi + 1}</td>
                <td className="py-1 pr-2">{g.title}</td>
                <td className="py-1 pr-2">{g.sceneName}</td>
                <td className="py-1 pr-2 whitespace-nowrap">{fmtRange(g.start, g.end)}</td>
                <td className="py-1 pr-2 whitespace-nowrap">{g.duration.toFixed(1)} 秒</td>
                <td className="py-1">{g.beats.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1 text-xs text-[var(--dim)]">
          全片总时长 {tl.totalSeconds.toFixed(1)} 秒（
          {d.asrSource && d.asrSource !== "none"
            ? "时间码来自 Whisper 转写时间戳，精确到 0.1 秒"
            : "时间码按语速 5 字/秒由台词字数 + 动作秒数重算，精确到 0.1 秒"}
          ；首帧 {fmtTc(0)} 起）
        </p>
      </div>

      {tl.groups.map((g, gi) => (
        <div key={gi} className="mt-3">
          <p className="font-bold text-[14px]">
            镜头{gi + 1}｜{g.title}（{fmtRange(g.start, g.end)} · {g.duration.toFixed(1)} 秒）
          </p>
          <p className="mt-0.5 text-[13px] text-[var(--dim)]">场景：{g.sceneName}</p>
          {g.beats.map((b, bi) => {
            const disp = beatDisplay(script, ctx, b, null, g.start, g.duration);
            return (
              <div key={bi} className="mt-2 text-[13px] leading-5">
                <p className="font-bold">
                  节拍{bi + 1}（{fmtRange(b.start, b.end)} · {b.duration.toFixed(1)} 秒）｜
                  {b.line.trim() ? `台词 · ${b.speaker}` : "无台词"}
                  {b.lowConf && (
                    <span style={{ color: "var(--bad)" }}> ⚠ 转写置信度低，请核对</span>
                  )}
                </p>
                <p>画面内容：{disp.visualContent}；末帧：{disp.finalFrame}。</p>
                <p>
                  人物对话：
                  {b.line.trim() ? (
                    <>
                      {b.speaker}（<strong>{b.emotion}</strong>）&quot;{b.line}&quot;
                    </>
                  ) : (
                    <>（无台词，{disp.annotation}）</>
                  )}
                </p>
                <p>快切感：{disp.quickCut}</p>
                <p>运镜：{disp.camera}</p>
                <p>音效：{disp.sfxFormatted}</p>
                <p className="text-[var(--dim)]">画面内无烧录文字（字幕后期压制）。</p>
              </div>
            );
          })}
        </div>
      ))}

      <h4 className="mt-4 font-display text-[15px] font-bold">第二部分 · 资产准备清单</h4>
      <p className="mt-1 text-[13px] leading-5 text-[var(--dim)]">
        只列重要、必不可少的（龙套和一闪而过的没列）。人物 / 场景的格式与「按分镜写资产提示词」一致：一键套用时会自动建成人物卡和场景卡（只落提示词、图片位留空，出图仍要你在卡上亲手点「生成图」）。物品工作台暂时没有道具卡，套用时会写进新项目的大纲里备查。
      </p>

      <p className="mt-2.5 text-[13px] font-bold">人物资产图（{d.assets.characters.length} 个）</p>
      {d.assets.characters.length === 0 ? (
        <p className="mt-1 text-[13px] text-[var(--dim)]">（无）</p>
      ) : (
        <div className="mt-1 grid gap-2">
          {d.assets.characters.map((c) => (
            <div key={c.name} className="rounded-[var(--radius)] border border-[var(--border)] p-2.5">
              <p className="text-[13px] leading-5">
                <span className="font-bold">{c.name}</span>
                <span className="text-[var(--dim)]"> · {c.profile}</span>
              </p>
              <p className="mt-1 text-[13px] leading-5">
                <span className="font-bold">生图提示词（中文）：</span>
                {c.promptZh}
              </p>
              <div className="mt-1.5 flex gap-2">
                {copyBtn(`char-${c.name}`, c.promptZh, `复制人物${c.name}的中文生图提示词`)}
                {copyBtn(`char-en-${c.name}`, c.promptEn, `复制人物${c.name}的英文生图提示词`)}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="mt-2.5 text-[13px] font-bold">场景资产图（{d.assets.scenes.length} 个）</p>
      {d.assets.scenes.length === 0 ? (
        <p className="mt-1 text-[13px] text-[var(--dim)]">（无）</p>
      ) : (
        <div className="mt-1 grid gap-2">
          {d.assets.scenes.map((s) => (
            <div key={s.name} className="rounded-[var(--radius)] border border-[var(--border)] p-2.5">
              <p className="text-[13px] leading-5">
                <span className="font-bold">{s.name}</span>
                <span className="text-[var(--dim)]"> · {s.description}</span>
              </p>
              <p className="mt-1 text-[13px] leading-5">
                <span className="font-bold">生图提示词（中文）：</span>
                {s.promptZh}
              </p>
              <div className="mt-1.5 flex gap-2">
                {copyBtn(`scene-${s.name}`, s.promptZh, `复制场景${s.name}的中文生图提示词`)}
                {copyBtn(`scene-en-${s.name}`, s.promptEn, `复制场景${s.name}的英文生图提示词`)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* v4.86：没有特殊/关键道具时整块不渲染（旧记录有道具照常显示）。 */}
      {d.assets.props.length > 0 && (
        <p className="mt-2.5 text-[13px] font-bold">物品资产图（{d.assets.props.length} 个）</p>
      )}
      {d.assets.props.length > 0 && (
        <div className="mt-1 grid gap-2">
          {d.assets.props.map((p) => (
            <div key={p.name} className="rounded-[var(--radius)] border border-[var(--border)] p-2.5">
              <p className="text-[13px] leading-5">
                <span className="font-bold">{p.name}</span>
                <span className="text-[var(--dim)]"> · {p.description}</span>
              </p>
              <p className="mt-1 text-[13px] leading-5">
                <span className="font-bold">生图提示词（中文）：</span>
                {p.promptZh}
              </p>
              <div className="mt-1.5">
                {copyBtn(`prop-${p.name}`, p.promptZh, `复制道具${p.name}的生图提示词`)}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// v4.59 悬浮播放窗：列表卡的「看原视频」不再跳走 / 开新标签，改为像
// 监控页 VideoPlayerModal 那样的悬浮窗在本页播放视频文件链接；窗内
// 底部仍保留一个「看原视频」外链按钮跳快手原链。关窗（× / 点空白 /
// Esc）只清 playingRow，列表与编辑状态原样不动。记录没有视频文件
// 链接时（手填的空白分析）播放器位置显示说明，外链按钮照常在。
// ---------------------------------------------------------------------------
function AnalysisVideoModal({
  row,
  onClose,
}: {
  row: AnalysisRow;
  onClose: () => void;
}) {
  const title = row.title || "未命名视频";
  // v4.64 云端优先：先查云端有没有这条视频的文件，有就播云端
  //（同源、不过期），没有再回退快手直链。
  const cloud = useCloudVideoSource(row.videoId, row.videoFileUrl);
  // v4.60：与监控页同一套直链过期降级（快手临时链接过期 403 只转圈）。
  const play = useVideoPlayFailed(cloud.src);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`悬浮播放：${title}`}
      onClick={onClose}
    >
      <div
        className="card w-full max-w-2xl overflow-hidden p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-2.5 p-2.5 pb-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-bold">{title}</p>
            <p className="mt-0.5 text-xs text-[var(--dim)]">
              {row.creatorName || "达人未填"}
              {row.durationText && <> · 时长 {row.durationText}</>}
              {row.publishedText && <> · 发布于 {row.publishedText}</>}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-sm shrink-0"
            onClick={onClose}
            aria-label="关闭视频播放"
          >
            关闭 ✕
          </button>
        </div>
        {cloud.checking ? (
          <div className="flex items-center justify-center bg-black px-4 py-10 text-sm text-white/80">
            正在确认云端有没有这条视频…
          </div>
        ) : cloud.src ? (
          play.failed ? (
            <VideoPlayFailedNotice videoUrl={row.videoUrl} title={title} />
          ) : (
            <div className="relative">
              <video
                src={cloud.src}
                controls
                autoPlay
                playsInline
                className="max-h-[68vh] w-full bg-black"
                aria-label={`正在播放：${title}`}
                onLoadedData={play.markLoaded}
                onError={play.markFailed}
              />
              {cloud.isCloud && <CloudBadge />}
            </div>
          )
        ) : (
          <p className="px-3.5 py-6 text-center text-sm text-[var(--dim)]">
            这条分析没有视频文件链接，没法在本页播放；点下面「看原视频」去快手看。
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2 p-3.5 pt-2.5">
          <span className="text-[13px] text-[var(--dim)]">
            播放 {formatCount(row.playCount)} · 点赞 {formatCount(row.likeCount)}
          </span>
          {row.videoUrl && (
            <a
              href={row.videoUrl}
              target="_blank"
              rel="noreferrer"
              className="btn btn-sm ml-auto"
              aria-label={`看原视频：${title}`}
            >
              看原视频
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export function AnalysisBench({
  prefill,
  onOpenProject,
  openRequest,
}: {
  /** 卡片「分析」按钮带入的数据；nonce 每点一次就变，触发新开表单。 */
  prefill: { data: AnalysisPrefill; nonce: number } | null;
  /** v4.56：一键套用成功后跳去新项目的分镜页（App 负责切台与选项目）。 */
  onOpenProject?: (projectId: number) => void;
  /** v4.88：监控页「已解剖 ✓ / 查看记录」递来的打开请求——按
   * videoId 在记录列表里找到那条并打开（与列表里点「查看 / 编
   * 辑」同一套）。nonce 每点一次就变；找不到对应记录时什么都不
   * 做（不报错、不弹错）。 */
  openRequest?: { videoId: string; nonce: number } | null;
}) {
  const queryClient = useQueryClient();
  const listQuery = useQuery({
    queryKey: ["video-analyses"],
    queryFn: () => withReadTimeout(() => api.listVideoAnalyses({})),
    retry: retryReadQuery,
  });
  const analyses = listQuery.data?.analyses ?? [];

  const [editing, setEditing] = useState<FormState | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AnalysisRow | null>(null);
  // v4.59：列表卡「看原视频」悬浮播放窗当前播放的记录（null = 未打开）。
  const [playingRow, setPlayingRow] = useState<AnalysisRow | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // 解剖结果展示状态：结果对象（渲染用）与表单里的 dissectionJson
  // 同步；notice = 结果上方的提示（旧记录 / 同步进来的结果可带）。
  // v4.87 起本页不再自己跑解剖：结果来自记录里存的 dissectionJson
  //（聊天精修解剖同步进来，或旧自动解剖的历史结果），打开记录时
  // 由 parseDissection 读出渲染。
  const [dissectResult, setDissectResult] = useState<Dissection | null>(null);
  const [dissectNotice, setDissectNotice] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const resetDissectUi = (d: Dissection | null) => {
    setDissectResult(d);
    setDissectNotice(null);
    setApplyError(null);
  };

  // 从卡片点「分析」进来：新开一张表单，第一节用卡片数据预填，
  // 其余各节留空。正在编辑别的记录时点卡片分析，也以新表单为准。
  useEffect(() => {
    if (prefill) {
      setSaveError(null);
      resetDissectUi(null);
      setEditing({ ...EMPTY_FORM, ...prefill.data });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill]);

  // v4.88：监控页点「已解剖 ✓ / 查看记录」进来——按 videoId 找
  // 到对应记录就打开（打开方式与列表「查看 / 编辑」一字同口
  // 径）；记录列表还没加载完就先记下这次请求，等数据到了再开；
  // 确实没有这条记录时静默放弃（不报错、不弹错）。
  const openRequestHandledRef = useRef(0);
  useEffect(() => {
    if (!openRequest) return;
    if (openRequestHandledRef.current === openRequest.nonce) return;
    if (listQuery.isLoading) return;
    openRequestHandledRef.current = openRequest.nonce;
    const row = analyses.find(
      (r) => r.videoId !== "" && r.videoId === openRequest.videoId,
    );
    if (!row) return;
    setSaveError(null);
    resetDissectUi(parseDissection(row.dissectionJson));
    setEditing(rowToForm(row));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRequest, analyses, listQuery.isLoading]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["video-analyses"] });

  const saveMut = useMutation({
    mutationFn: (form: FormState) =>
      api.saveVideoAnalysis({
        id: form.id ?? undefined,
        videoId: form.videoId,
        videoUrl: form.videoUrl,
        title: form.title,
        creatorName: form.creatorName,
        durationText: form.durationText,
        likeCount: parseCountInput(form.likeCount),
        playCount: parseCountInput(form.playCount),
        publishedText: form.publishedText,
        hook: form.hook,
        structure: form.structure,
        rhythm: form.rhythm,
        humor: form.humor,
        emotion: form.emotion,
        reusable: form.reusable,
        mustRewrite: form.mustRewrite,
        keepSkeleton: form.keepSkeleton,
        replacePlan: form.replacePlan,
        pattern: form.pattern,
        summary: form.summary,
        videoFileUrl: form.videoFileUrl,
        description: form.description,
        dissectionJson: form.dissectionJson,
      }),
    onSuccess: (res, form) => {
      if (!res.ok) {
        setSaveError(res.error ?? "没存上，再试一次。");
        return;
      }
      setSaveError(null);
      setEditing(null);
      setToast(form.id ? "这条分析已保存修改。" : "分析已保存，进下面的记录列表了。");
      invalidate();
    },
    onError: (e) => setSaveError(`没存上：${describeThrownError(e)}`),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.deleteVideoAnalysis({ id }),
    onSuccess: () => {
      setPendingDelete(null);
      setDeleteError(null);
      setToast("这条分析记录已删除。");
      invalidate();
    },
    onError: (e) => setDeleteError(`没删成：${describeThrownError(e)}`),
  });

  const set = (patch: Partial<FormState>) =>
    setEditing((cur) => (cur ? { ...cur, ...patch } : cur));

  useEffect(() => {
    if (!copiedKey) return;
    const t = window.setTimeout(() => setCopiedKey(null), 2000);
    return () => window.clearTimeout(t);
  }, [copiedKey]);

  const handleCopy = async (key: string, text: string) => {
    const ok = await copyTextToClipboard(text);
    setCopiedKey(ok ? key : null);
    if (!ok) setToast("没复制成，手动选中文本复制吧。");
  };

  const applyMut = useMutation({
    mutationFn: (input: { form: FormState; d: Dissection }) =>
      api.applyDissection({
        analysisId: input.form.id ?? undefined,
        dissectionJson: JSON.stringify(input.d),
        title: input.form.title.trim() || "未命名视频",
        synopsis: input.d.synopsis,
        characterRows: input.d.characterRows,
        groups: input.d.groups,
        generationNotes: input.d.generationNotes,
        assets: input.d.assets,
      }),
    onSuccess: (res) => {
      if (!res.ok || !res.projectId) {
        setApplyError(res.error ?? "套用没成，再试一次。");
        return;
      }
      setApplyError(null);
      set({ appliedProjectId: res.projectId });
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      setToast(
        `已套用为新项目（人物卡 ${res.charactersCreated} 张、场景卡 ${res.scenesCreated} 张），正在跳去分镜页…`,
      );
      onOpenProject?.(res.projectId);
    },
    onError: (e) => setApplyError(`套用没成：${describeThrownError(e)}`),
  });

  // ------------------------------------------------------------------
  // 表单视图
  // ------------------------------------------------------------------
  if (editing) {
    const form = editing;
    return (
      <div aria-label="分析模仿表单">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display text-lg font-bold">
            {form.id ? "编辑分析" : "新分析"}
          </h2>
          {form.id === null && form.title && (
            <span className="text-sm text-[var(--dim)]">正在分析：{form.title}</span>
          )}
          <span className="ml-auto">
            <button
              type="button"
              className="btn btn-sm"
              aria-label="不保存，返回分析记录列表"
              onClick={() => {
                setEditing(null);
                setSaveError(null);
              }}
            >
              返回列表
            </button>
          </span>
        </div>
        <p className="mt-1.5 text-[13px] leading-5 text-[var(--dim)]">
          这一页只剩两部分：核对上面的视频基础信息，再看下面的解剖结果（在聊天里把视频发给助手解剖，结果会同步到这里）。信息改完点下面「保存分析」存下来，随时回来接着看。
        </p>

        {/* 一、视频基础信息 */}
        <section className="card mt-3 p-3" aria-label="一、视频基础信息">
          <div className="flex flex-wrap items-center gap-2">
            <SectionTitle>一、视频基础信息</SectionTitle>
          </div>
          <p className="mt-0.5 text-xs text-[var(--dim)]">
            从卡片点「分析」进来时这一节已经自动填好；不对的地方直接改。
          </p>
          <div className="mt-2 grid gap-x-2 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
            <InputField label="标题" wide value={form.title} onChange={(v) => set({ title: v })} />
            <InputField label="达人" value={form.creatorName} onChange={(v) => set({ creatorName: v })} />
            <InputField label="时长" value={form.durationText} onChange={(v) => set({ durationText: v })} placeholder="如 2分13秒" />
            <InputField label="点赞" value={form.likeCount} onChange={(v) => set({ likeCount: v })} placeholder="纯数字" />
            <InputField label="播放" value={form.playCount} onChange={(v) => set({ playCount: v })} placeholder="纯数字" />
            <InputField label="发布时间" value={form.publishedText} onChange={(v) => set({ publishedText: v })} placeholder="如 2026-11-03 17:59" />
            <InputField label="视频链接" wide value={form.videoUrl} onChange={(v) => set({ videoUrl: v })} />
            <InputField label="视频ID" value={form.videoId} onChange={(v) => set({ videoId: v })} />
            <InputField label="视频文件链接" wide value={form.videoFileUrl} onChange={(v) => set({ videoFileUrl: v })} placeholder="卡片进来时自动带入" />
          </div>
          <div className="mt-1.5">
            <TextAreaField
              label="视频描述"
              hint="标题只是第一行；全文（含 #话题）是解剖时的上下文，一并存进记录"
              value={form.description}
              onChange={(v) => set({ description: v })}
              rows={2}
            />
          </div>
        </section>

        {/* 二、AI解剖结果（有结果才渲染；v4.58 起原二～五节已下线） */}
        {dissectResult && (
          <DissectionResult
            d={dissectResult}
            title={form.title}
            notice={dissectNotice}
            appliedProjectId={form.appliedProjectId}
            applying={applyMut.isPending}
            applyError={applyError}
            copiedKey={copiedKey}
            onCopy={handleCopy}
            onApply={() => applyMut.mutate({ form, d: dissectResult })}
            onOpenProject={onOpenProject}
          />
        )}

        {saveError && (
          <p className="mt-3 text-sm" style={{ color: "var(--bad)" }} role="alert">
            {saveError}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2 pb-2">
          <button
            type="button"
            className="btn btn-primary px-6 font-bold"
            aria-label="保存这条分析记录"
            disabled={saveMut.isPending}
            onClick={() => {
              setSaveError(null);
              saveMut.mutate(form);
            }}
          >
            {saveMut.isPending ? "正在保存…" : "保存分析"}
          </button>
          <button
            type="button"
            className="btn"
            aria-label="不保存，返回分析记录列表"
            onClick={() => {
              setEditing(null);
              setSaveError(null);
            }}
          >
            返回列表
          </button>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // 列表视图
  // ------------------------------------------------------------------
  return (
    <div aria-label="分析模仿">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-lg font-bold">分析模仿</h2>
        <span className="text-sm text-[var(--dim)]">共 {analyses.length} 条分析记录</span>
        <span className="ml-auto">
          <button
            type="button"
            className="btn btn-primary btn-sm font-bold"
            aria-label="新建一条空白分析（第一节自己手填）"
            onClick={() => {
              setSaveError(null);
              resetDissectUi(null);
              setEditing({ ...EMPTY_FORM });
            }}
          >
            新建分析
          </button>
        </span>
      </div>
      <p className="mt-1.5 max-w-3xl text-[13px] leading-5 text-[var(--dim)]">
        爆款视频的解剖记录都在这里：解剖在聊天里做——在监控页的视频卡片封面右上角点淡绿色的「发送到聊天解剖」，解剖指令会自动复制好（没存云端的会先提示你存云端），去聊天框粘贴发送，助手精修解剖后会把分镜表和资产清单同步进这里的记录、并套用成新剧本项目；也可以直接点上面的「新建分析」从空白开始，或者在监控页点视频「详情」里的「预填到分析模仿页」把视频信息带进来手填。记录存在服务端，换浏览器打开也还在。
      </p>

      <div className="mt-3">
        {listQuery.isPending ? (
          <p className="text-sm text-[var(--dim)]">正在读取分析记录…</p>
        ) : listQuery.isError ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm" style={{ color: "var(--bad)" }} role="alert">
              分析记录没读出来：{describeThrownError(listQuery.error)}
            </p>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => listQuery.refetch()}
              disabled={listQuery.isFetching}
            >
              {listQuery.isFetching ? "读取中…" : "重新读取"}
            </button>
          </div>
        ) : analyses.length === 0 ? (
          <p className="text-sm leading-5 text-[var(--dim)]">
            还没有分析记录。去监控页挑一条视频，点它封面右上角的「分析」，或者点上面的「新建分析」从空白开始。
          </p>
        ) : (
          <div className="grid gap-2.5 lg:grid-cols-2">
            {analyses.map((r) => (
              <article key={r.id} className="card p-3" aria-label={`分析记录：${r.title || "未命名视频"}`}>
                <p className="line-clamp-2 font-semibold leading-snug">
                  {r.title || "未命名视频"}
                </p>
                <p className="mt-1 text-xs leading-5 text-[var(--dim)]">
                  {r.creatorName ? `达人 ${r.creatorName}` : "达人未填"}
                  {r.durationText && <span> · 时长 {r.durationText}</span>}
                  {r.playCount > 0 && <span> · 播放 {formatCount(r.playCount)}</span>}
                  {r.likeCount > 0 && <span> · 点赞 {formatCount(r.likeCount)}</span>}
                  {r.publishedText && <span> · 发布 {r.publishedText}</span>}
                </p>
                {(() => {
                  const d = parseDissection(r.dissectionJson);
                  if (!d) return null;
                  const c = dissectionCounts(d);
                  return (
                    <p className="mt-1 text-xs font-bold" style={{ color: "var(--accent)" }}>
                      已解剖：{c.lenses} 个镜头 · 资产 {c.assets} 项
                      {r.appliedProjectId !== null && r.appliedProjectId !== undefined
                        ? " · 已套用为新项目"
                        : ""}
                    </p>
                  );
                })()}
                <p className="mt-1 text-xs text-[var(--dim)]">
                  最近修改 {formatTime(r.updatedAt)}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn btn-sm"
                    aria-label={`查看并编辑分析：${r.title || "未命名视频"}`}
                    onClick={() => {
                      setSaveError(null);
                      // 结果只认记录里存的 dissectionJson（聊天精修
                      // 解剖同步进来、或旧自动解剖的历史结果）；本机
                      // 断点续跑随 v4.87 入口下线一并删除。
                      resetDissectUi(parseDissection(r.dissectionJson));
                      setEditing(rowToForm(r));
                    }}
                  >
                    查看 / 编辑
                  </button>
                  {(r.videoUrl || r.videoFileUrl) && (
                    <button
                      type="button"
                      className="btn btn-sm"
                      aria-label={`在本页悬浮窗播放视频：${r.title || "未命名视频"}`}
                      onClick={() => setPlayingRow(r)}
                    >
                      看原视频
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-danger-ghost btn-sm"
                    aria-label={`删除分析记录：${r.title || "未命名视频"}`}
                    onClick={() => {
                      setDeleteError(null);
                      setPendingDelete(r);
                    }}
                  >
                    删除
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {toast && (
        <div
          className="fixed bottom-5 left-1/2 z-[90] flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-3 rounded-[var(--radius)] border border-[var(--border)] px-4 py-3 shadow-lg"
          style={{ background: "var(--surface)", color: "var(--text)" }}
          role="status"
          aria-live="polite"
          aria-label="操作结果提示"
        >
          <p className="min-w-0 flex-1 text-sm leading-5 font-bold">{toast}</p>
          <button
            type="button"
            className="btn btn-sm shrink-0"
            onClick={() => setToast(null)}
            aria-label="关闭提示"
          >
            关闭 ✕
          </button>
        </div>
      )}

      {playingRow && (
        <AnalysisVideoModal row={playingRow} onClose={() => setPlayingRow(null)} />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="删除这条分析记录？"
          body={
            <>
              <p>
                要删的是「{pendingDelete.title || "未命名视频"}」这条分析（达人：
                {pendingDelete.creatorName || "未填"}）。删了就没了，监控页里的视频卡片不受影响。
              </p>
              {deleteError && (
                <p className="mt-2" style={{ color: "var(--bad)" }} role="alert">
                  {deleteError}
                </p>
              )}
            </>
          }
          confirmLabel={deleteMut.isPending ? "正在删除…" : "删除这条分析"}
          pending={deleteMut.isPending}
          onConfirm={() => deleteMut.mutate(pendingDelete.id)}
          onCancel={() => {
            if (!deleteMut.isPending) {
              setPendingDelete(null);
              setDeleteError(null);
            }
          }}
        />
      )}
    </div>
  );
}
