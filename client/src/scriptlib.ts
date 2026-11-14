// Script document model + deterministic timing + export builders.
//
// Timing rule (ONE formula everywhere — analysis panel, review page,
// storyboard page, SRT and the Markdown export): a beat lasts
// 台词字数 ÷ 语速 + 动作秒数 (actionSeconds). 台词字数 counts the actual
// spoken characters only: whitespace AND punctuation are stripped
// (countLineChars). A generated dialogue beat stores actionSeconds 0, so
// its duration is just its line time; a silent beat has no line, so its
// duration is its stored actionSeconds. Everything is recomputed from
// the current script data, so editing a line in the page re-times that
// line, its group, and every later timecode.

// 核心规则唯一实现在服务端共享模块 server/src/rules.ts：时长试算
// （台词字数去标点÷语速+动作秒数、超目标/超30秒判定）、待确认人物校验、
// 分镜分组与超长镜头检出都在那里实现一份，客户端与服务端共用、
// 不再各写一份口径；服务端在保存剧本与确认分镜时跑同一套并返回
// 结构化结果，页面上的试算展示与服务端校验因此必然一致。超 30 秒
// 镜头绝不自动拆分：检出后由用户选缩减或在再分配预览里确认切分点。
import {
beatDuration,
beatTiming,
buildStoryboardGroups,
collectTempCharacters,
countLineChars,
flattenStoryboardBeats,
} from "../../server/src/rules";
import type {
FlatBeat,
StoryboardConfig as RulesStoryboardConfig,
TempCharacterState,
ViralIssue,
} from "../../server/src/rules";
export {
  beatDuration,
  beatTiming,
  buildStoryboardBySegments,
  buildStoryboardFromCuts,
  buildStoryboardGroups,
  collectConsistencyWarnings,
  collectSpeakerIssues,
  collectStoryboardStrictIssues,
  collectStrictIssues,
  collectTempCharacters,
  collectViralIssues,
  countLineChars,
  detectOverlongForCuts,
  detectOverlongForSegments,
  detectOverlongLenses,
  durationSummary,
  flattenStoryboardBeats,
  isGroupTempName,
  lensPlan,
  packStoryboard,
  rawLensIndexByFlat,
  scriptContentHash,
  shotCutReason,
  storyboardSegmentsForCuts,
  storyboardSplitNotices,
  STRICT_CATEGORY_LABELS,
  strictAuditSummary,
  suggestPlotCuts,
  suggestStoryboardCuts,
  VIRAL_CATEGORY_LABELS,
  viralAuditSummary,
} from "../../server/src/rules";
export type {
  BeatTiming,
  DurationSummary,
  FlatBeat,
  GroupDuration,
  OverlongBeatInfo,
  OverlongLens,
  SpeakerIssue,
  SpeakerIssueBeatRef,
  SpeakerRegistryEntry,
  SplitNotice,
  StoryboardPack,
  StrictAuditSummary,
  StrictCategory,
  StrictIssue,
  TempCharacter,
  TempCharacterSource,
  TempCharacterState,
  ViralAuditSummary,
  ViralCategory,
  ViralIssue,
} from "../../server/src/rules";

/**
 * v3.96 爆款审核盖章：runViralAudit 的结论由客户端存进稿子，与稿子
 * 内容哈希（scriptContentHash）绑定——审完后稿子被改动、哈希对不
 * 上，确认分镜的爆款门禁重新关闭。审核全程只读，改稿只发生在用户
 * 确认的打回重写与手动修改里。
 */
export interface ViralAuditRecord {
  auditedAt: string;
  modeId: number;
  modeName: string;
  hasGeneCard: boolean;
  modeNote: string;
  passed: boolean;
  blockerCount: number;
  warningCount: number;
  /** 已自动打回重写的轮数（0–2）；2 轮仍不过 = 转人工裁决。 */
  rounds: number;
  contentHash: string;
  summary: string;
  issues: ViralIssue[];
  /**
   * v4.08 统一审核：issues 里前 detIssueCount 条是确定性硬规则检出
   * 的，其余是 AI 审核官检出的（客户端盖章时按 [...det, ...ai] 顺序
   * 拼）。合并面板据此给每条问题标来源（硬规则 / AI审核）。旧盖章
   * 没有这个字段时按全部硬规则显示，重审一次即准确。
   */
  detIssueCount?: number;
}

export interface Beat {
  visual: string;
  sfx: string;
  speaker: string;
  emotion: string;
  line: string;
  actionSeconds: number;
  /**
   * v4.86 AI解剖 1:1 时间戳：ASR 转写给出的本拍起止秒（0.1 精度），
   * 只有解剖套用进来的节拍带；rules.beatTiming 见到带齐的起止秒
   * 以实测跨度计时。lowConf = 转写置信度低、需重点核对的台词拍。
   */
  startSec?: number;
  endSec?: number;
  lowConf?: boolean;
  /**
   * Storyboard stage only: why the plot analysis cut a beat （节拍） here
   * （场景转场 / 人物出入场 / 说话人切换 / 情绪转折 / 悬念·反转点 /
   * 动作转折 / 开场节拍）. Set by buildStoryboardGroups; absent on
   * review-stage script beats.
   */
  cutReason?: string;
}

export interface ScriptGroup {
  title: string;
  sceneName: string;
  beats: Beat[];
  /**
   * v4.93 每镜头站位；v4.95 改为「固定站位」：只写位置、不写动作的
   * 一整行（如「站位：E（眼镜男孩）、D（长发女孩）坐教室前排课桌，
   * B（窦老师）站黑板前讲台后。」），不带景别 / 机位前缀（景别与
   * 机位在每拍运镜里）。只对分镜组（storyboardGroups）有意义：
   * parseScript 对还没有这个字段的存量分镜组按画面描述里已明确
   * 写出的位置提炼纯位置初值（提炼不出就留空）；已存字符串里带
   * 景别 / 机位前缀或动作成分（旧提炼 / 旧编辑留下的）时，经
   * sanitizeFixedBlocking 只留位置成分作初值。用户在分镜页逐组
   * 改、随 saveScript 整份 JSON 保存。本拍动作只写在各拍画面
   * 内容里，不进这一行。复制 / 导出时组内每一拍都带同一句
   * （lensBeatLines）。空字符串 / 缺失 = 这一行不进任何复制与
   * 导出（不写占位）。
   */
  blocking?: string;
}

export interface CharacterRow {
  name: string;
  identity: string;
  look: string;
  voice: string;
  tone: string;
  /**
   * v5.30 性别（单独字段）：\"男\" / \"女\"；空串 / 缺省 = 未指定。
   * 此前性别只写在造型文字里（「5-6岁男孩」「20多岁女性」），没有
   * 单独字段可改。分镜页人物表新增性别下拉改这一字段，点「同步
   * 到分镜提示词」时按 swapGenderWords 把造型 / 音色文字里的性
   * 别词一并换到与字段一致，全部提示词版本（四档 Seedance + 通
   * 用版 + 导出）都从 characterRows 现算、自动跟随。
   */
  gender?: "男" | "女" | "";
  /**
   * v6.12 身高锚点（可选，一句话，用户在分镜页人物表面板里亲手
   * 填，如「站立同框时头顶约到 B 的肩膀」）：只进 MiniMax H3 两
   * 版的 subject_definitions——定义句末尾原样追加，有值才加、
   * 空值时定义句与原来一字相同，任何拼装都不得编造。Seedance
   * 三版、通用版、导出一律不引用这一栏。旧数据缺省 = 空值。
   */
  heightAnchor?: string;
}

/**
 * 性别推断的依据出处（v5.48）：field = 已保存的单独字段（最高
 * 优先、推断永不覆盖）；voice / look / identity = 分别从音色 /
 * 造型 / 身份文字里认出的性别词。面板旁注按这份依据写明「按哪
 * 里的哪个词认作」，不让用户对着一个没出处的结论猜。
 */
export interface CharacterGenderInference {
  gender: "男" | "女" | "";
  source: "field" | "voice" | "look" | "identity" | null;
  /** 命中的性别词（source 为 field / null 时为空串）。 */
  word: string;
}

/**
 * v5.30 人物的有效性别：先看单独字段 gender，再从文字里认性别
 * 词。v5.48 修推断口径（用户报障：项目 41 人物 F 造型「少年…」、
 * 音色「少年男声」却被认作女）：①词表补「少年 / 少女」——旧词
 * 表只有男孩 / 男生 / 男声等，造型以「少年」起头时造型里一个词
 * 都认不出、只能靠后面的字段兜底，字段顺序一错位就认错；
 * ②扫描顺序改 音色 → 造型 → 身份：音色是性别最直白的出处
 * （「少年男声 / 少女女声」自带定语），造型与音色冲突时以音色
 * 为准——旧顺序造型优先，造型里只要先出现一个异性词（哪怕是
 * 分析填入的旧文字）就能压过音色；③同一段文字里仍是先出现的
 * 性别词为准。都认不出回空串（未定、不猜）。
 */
export function inferCharacterGenderDetail(row: {
  gender?: string;
  identity?: string;
  look?: string;
  voice?: string;
}): CharacterGenderInference {
  if (row.gender === "男" || row.gender === "女")
    return { gender: row.gender, source: "field", word: "" };
  const MALE = ["男孩", "男生", "男童", "男子", "男人", "男性", "男声", "少年"];
  const FEMALE = ["女孩", "女生", "女童", "女子", "女人", "女性", "女声", "少女"];
  const FIELDS: {
    source: "voice" | "look" | "identity";
    text: string;
  }[] = [
    { source: "voice", text: row.voice ?? "" },
    { source: "look", text: row.look ?? "" },
    { source: "identity", text: row.identity ?? "" },
  ];
  for (const f of FIELDS) {
    let best: { idx: number; g: "男" | "女"; word: string } | null = null;
    for (const w of MALE) {
      const i = f.text.indexOf(w);
      if (i >= 0 && (!best || i < best.idx)) best = { idx: i, g: "男", word: w };
    }
    for (const w of FEMALE) {
      const i = f.text.indexOf(w);
      if (i >= 0 && (!best || i < best.idx)) best = { idx: i, g: "女", word: w };
    }
    if (best) return { gender: best.g, source: f.source, word: best.word };
  }
  return { gender: "", source: null, word: "" };
}

export function inferCharacterGender(row: {
  gender?: string;
  identity?: string;
  look?: string;
  voice?: string;
}): "男" | "女" | "" {
  return inferCharacterGenderDetail(row).gender;
}

/**
 * 年龄段推断的依据出处（v5.59）：identity / look / voice = 分别
 * 从身份 / 造型 / 音色文字里认出的年龄段词（或「N岁」数字年龄）。
 * 一键匹配资产图按它写回执依据，不让用户对着没出处的结论猜。
 */
export interface CharacterAgeGroupInference {
  ageGroup: "成年" | "未成年" | "";
  source: "identity" | "look" | "voice" | null;
  /** 命中的年龄段词或「N岁」原文（认不出时为空串）。 */
  word: string;
}

/**
 * v5.59 人物的年龄段（成年 / 未成年）推断：人物行没有年龄字段，
 * 只能从文字里认——扫描顺序 身份 → 造型 → 音色（身份是最直白的
 * 出处：「老教授 / 女教师 / 研究员」自带年龄段），同一段文字里
 * 先出现的词为准；文字里写了数字年龄（「24岁」「5-6岁」）按
 * 18 岁为界直接判。「学生」单独出现不算数（小学生到大学生都叫
 * 学生，复合词小学生 / 初中生 / 高中生才算未成年、大学生算成
 * 年）；都认不出回空串（未定、不猜），调用方据此不挂图。
 */
export function inferCharacterAgeGroupDetail(row: {
  identity?: string;
  look?: string;
  voice?: string;
}): CharacterAgeGroupInference {
  const ADULT = [
    "老教授", "教授", "老师", "教师", "研究员", "讲师",
    "老板", "老板娘", "店长", "校长", "主任", "医生",
    "妈妈", "爸爸", "母亲", "父亲",
    "青年", "中年", "老年", "老人", "成年人", "成年", "大人",
    "工人", "师傅", "大叔", "阿姨", "叔叔", "婶婶",
    "伯伯", "伯父", "奶奶", "爷爷", "外婆", "外公",
    "先生", "女士", "太太", "丈夫", "妻子", "老公", "老婆",
    "大学生",
  ];
  const MINOR = [
    "小学生", "初中生", "高中生", "中学生", "未成年",
    "小孩", "小朋友", "少年", "少女", "儿童", "幼童",
    "婴儿", "宝宝", "男童", "女童", "男孩", "女孩",
  ];
  const FIELDS: {
    source: "identity" | "look" | "voice";
    text: string;
  }[] = [
    { source: "identity", text: row.identity ?? "" },
    { source: "look", text: row.look ?? "" },
    { source: "voice", text: row.voice ?? "" },
  ];
  for (const f of FIELDS) {
    let best: { idx: number; g: "成年" | "未成年"; word: string } | null =
      null;
    const ageNum = /(\d{1,3})\s*多?\s*岁/.exec(f.text);
    if (ageNum) {
      const n = Number(ageNum[1]);
      if (Number.isFinite(n)) {
        best = {
          idx: ageNum.index,
          g: n >= 18 ? "成年" : "未成年",
          word: ageNum[0],
        };
      }
    }
    for (const w of ADULT) {
      const i = f.text.indexOf(w);
      if (i >= 0 && (!best || i < best.idx))
        best = { idx: i, g: "成年", word: w };
    }
    for (const w of MINOR) {
      const i = f.text.indexOf(w);
      if (i >= 0 && (!best || i < best.idx))
        best = { idx: i, g: "未成年", word: w };
    }
    if (best) return { ageGroup: best.g, source: f.source, word: best.word };
  }
  return { ageGroup: "", source: null, word: "" };
}

export function inferCharacterAgeGroup(row: {
  identity?: string;
  look?: string;
  voice?: string;
}): "成年" | "未成年" | "" {
  return inferCharacterAgeGroupDetail(row).ageGroup;
}

/**
 * v5.30 把一段文字里的性别词整批换到目标性别（成对词表：男孩↔
 * 女孩、男生↔女生、男童↔女童、男子↔女子、男人↔女人、男性↔
 * 女性、男声↔女声）。只换成对出现的复合词、不碰单个「男 / 女」
 * 字（避免误伤无关语境）；没有性别词的文字原样返回。分镜页人
 * 物表改性别后点同步时，对造型与音色两段文字各跑一遍，保证存
 * 下来的文字与性别字段一致——下游全部推导（别名合成、描述词、
 * canonical 造型句）都从文字现算，不需要逐处改口径。
 */
export function swapGenderWords(text: string, target: "男" | "女"): string {
  const PAIRS: [string, string][] = [
    ["男孩", "女孩"],
    ["男生", "女生"],
    ["男童", "女童"],
    ["男子", "女子"],
    ["男人", "女人"],
    ["男性", "女性"],
    ["男声", "女声"],
  ];
  let out = text ?? "";
  // 先把源性别词换成私用区占位符再统一填目标词，避免换完的词
  // 又被下一对规则二次命中。
  PAIRS.forEach(([m, f], i) => {
    const from = target === "男" ? f : m;
    out = out.split(from).join("\uE300" + i + "\uE301");
  });
  PAIRS.forEach(([m, f], i) => {
    const to = target === "男" ? m : f;
    out = out.split("\uE300" + i + "\uE301").join(to);
  });
  return out;
}

/**
 * v4.17 生成时自动加入清单里的一条：生成剧本并保存时，服务端把新
 * 出现的人物直接分拣记入的结果——formal = 有台词、已进正式人物表
 * 并建了人物卡（设计字段按剧本写满）；extra = 无台词路人、记为群演
 * 轻量条目（不进正式表、不建卡）。审查页据此展示「本次生成已自动
 * 加入的人物 / 群演」，并保留改名 / 删除 / 移入群演 / 转入正式表 /
 * 映射到已有人物的手动调整入口。
 */
export interface AutoAddedCharacter {
  name: string;
  kind: "formal" | "extra";
  identity: string;
  look: string;
  voice: string;
  tone: string;
}

export interface Overlay {
  type: string;
  groupIndex: number;
  content: string;
}

export interface GenerationPlanSegment {
  title: string;
  sceneName: string;
  brief: string;
  wordBudget: number;
  /**
   * Estimated total silent-action seconds of this segment (the sum of
   * its beats' actionSeconds), as planned. The dialogue word budget is
   * calibrated AFTER deducting this action time from the target, so
   * 台词时间 + 动作时间 ≈ 目标时长 instead of 台词 alone eating it all.
   * Optional: plans written before this field existed have none.
   */
  actionSeconds?: number;
}

export interface GenerationPlan {
  title: string;
  pendingItems: string[];
  synopsis: string;
  characterRows: CharacterRow[];
  overlays: Overlay[];
  generationNotes: string[];
  versionNote: string;
  segments: GenerationPlanSegment[];
}

export interface GenerationProgress {
  totalSegments: number;
  completedSegments: number;
  done: boolean;
}

/** v5.49 待确认字段来源：analysis = AI 分析填入，manual = 用户手改。 */
export type CharPendingSource = "analysis" | "manual" | "match";

/**
 * v5.49 单个人物的待确认草稿记录（见 ScriptData.charPending）：
 * look / voice / tone / gender 是待确认值（空串 = 该字段无待确认
 * 值）；source 是字段级来源（同一人可一半字段分析填、一半手改）；
 * gender 只由用户亲手改性别下拉产生，分析来源的记录里它恒为空；
 * jobId / hasImage 记最近一次分析的任务号与那次有没有图；
 * updatedAt 是最近一次深存的 ISO 时间；rollback 是最近一次同步
 * 前的已存值（同步时先存、同步后仍保留，直到下一次同步覆盖）。
 */
export interface CharPendingRecord {
  look: string;
  voice: string;
  tone: string;
  gender: string;
  source: {
    look: CharPendingSource | null;
    voice: CharPendingSource | null;
    tone: CharPendingSource | null;
    gender: CharPendingSource | null;
  };
  jobId: number | null;
  hasImage: boolean;
  updatedAt: string;
  rollback: {
    look: string;
    voice: string;
    tone: string;
    gender: string;
  } | null;
}

export type CharPendingMap = Record<string, CharPendingRecord>;

/** 这条待确认记录里有没有任何待确认字段（不含 rollback）。 */
export function charPendingHasFields(rec: CharPendingRecord): boolean {
  return (
    rec.source.look != null ||
    rec.source.voice != null ||
    rec.source.tone != null ||
    rec.source.gender != null
  );
}

/** 待确认记录里有没有来源为 analysis 的字段。 */
export function charPendingHasAnalysis(rec: CharPendingRecord): boolean {
  return (
    rec.source.look === "analysis" ||
    rec.source.voice === "analysis" ||
    rec.source.tone === "analysis" ||
    rec.source.gender === "analysis"
  );
}

/** 待确认记录里有没有来源为 manual 的字段（批量跳过口径据此）。 */
export function charPendingHasManual(rec: CharPendingRecord): boolean {
  return (
    rec.source.look === "manual" ||
    rec.source.voice === "manual" ||
    rec.source.tone === "manual" ||
    rec.source.gender === "manual"
  );
}

/**
 * 待确认记录里有没有来源为 match 的字段（v5.84：一键匹配资产图
 * 把卡的造型 / 音色填进待确认、来源记 match，人物按钮标「匹配
 * 待确认」据此）。
 */
export function charPendingHasMatch(rec: CharPendingRecord): boolean {
  return (
    rec.source.look === "match" ||
    rec.source.voice === "match" ||
    rec.source.tone === "match" ||
    rec.source.gender === "match"
  );
}

export interface ScriptData {
  title: string;
  pendingItems: string[];
  synopsis: string;
  characterRows: CharacterRow[];
  /**
   * v5.49 人物待确认草稿（深度保存）：AI 分析填入的值与用户在分镜
   * 页人物面板手改的值，先深存到这里（按代号记），刷新不丢；只有
   * 点「确认并同步到分镜提示词」才转正进 characterRows。拼装函数
   * 永不读本字段——未确认值一字不进任何提示词版本。记录只记与已存
   * 值不同的字段；rollback 只存最近一次同步前的已存值一层，不是
   * 版本历史（v5.29 快照删除令不受影响）。旧稿没有这个键 = 无待
   * 确认值，不报错、不自动补写。
   */
  charPending?: CharPendingMap;
  groups: ScriptGroup[];
  overlays: Overlay[];
  generationNotes: string[];
  versionNote: string;
  speechRate: number;
  styleLabel: string;
  targetSeconds: number;
  /**
   * Generation snapshot: the project settings as they were when this
   * script was generated (speechRate / styleLabel / targetSeconds above
   * are already snapshot fields; these two keep the raw style preset +
   * custom text). Later project-settings changes NEVER rewrite the
   * snapshot — they only affect the next generation. Optional: scripts
   * generated before snapshot locking have no preset fields; their
   * styleLabel still serves as the generated-style record.
   */
  snapshotStylePreset?: string;
  snapshotStyleCustom?: string;
  /**
   * v4.93 项目级「全片风格」（画面风格锁定句全文）：每个镜头复制 /
   * 导出时逐字带上的风格锁定句由本字段生成——空 / 缺失 = 默认的
   * 超写实真人实拍定稿两行（见 DEFAULT_FILM_STYLE_LOCK_LINES）；
   * 用户在分镜页改了就存这里，改一处全片所有镜头一起变。与
   * styleLabel（剧本风格，如「AI解剖复刻」）、stylePreset /
   * styleCustom（语气）完全无关，互不覆盖。
   */
  filmStyle?: string;
  generatedAt: string;
  /**
   * Two-phase flow. "review": the script has been written and its lines
   * are awaiting the user's review/confirmation — `groups` are script
   * sections, and no timing/storyboard output exists yet. "storyboard":
   * lines were confirmed; `storyboardGroups` holds the lenses （镜头）
   * sliced from the confirmed beats — each lens spans the user-chosen
   * seconds, beats （节拍） inside are cut by plot analysis — and drives
   * all timed outputs.
   * Missing on scripts generated before this flow existed → treated as
   * "review" so their lines go through confirmation like any new draft.
   */
  stage?: "review" | "storyboard";
  confirmedAt?: string;
  /**
   * 高权限确认留痕：用户在二次确认后主动保留的超 30 秒镜头。只由
   * 服务端 confirmStoryboard 在 allowOverlong 确认时写入，普通确认
   * 会清掉；分镜页据此把这些镜头标为「已高权限确认，超 X 秒」。
   * 不是永久状态：回审查缩减或重新分配后再次确认即消失。
   */
  overlongOverride?: {
    confirmedAt: string;
    lenses: {
      lensIndex: number;
      title: string;
      duration: number;
      overBy: number;
    }[];
  };
  /** v3.96 爆款审核盖章（见上方 ViralAuditRecord）。 */
  viralAudit?: ViralAuditRecord;
  /**
   * 历史字段（v3.96 高权限放行留痕）：v4.18 起审核门禁与放行已删，
   * 不再写入；类型保留只为读旧稿，confirmStoryboard 确认时会清掉。
   */
  viralOverride?: {
    confirmedAt: string;
    modeName: string;
    issues: string[];
  };
  /**
   * Storyboard-stage user edits of the 全局规范 音色 lines, keyed by
   * character name. Base voices are extracted from the character card's
   * note (labelled 音色：… segments / voice clauses) and the script's
   * 人物表； this map stores only explicit overrides made in the
   * storyboard stage.
   */
  voiceMap?: Record<string, string>;
  /**
   * v5.72 人物别名手动钉死（分镜页「人物称呼对照」面板）：keyed by
   * 人物代号。键存在 = 别名以用户填的值为准（空字符串 = 钉死为无
   * 别名），自动推导不再覆盖这一位；键不存在 = 继续自动推导。用
   * 户改人物的身份 / 台词等源头数据不会自动清掉钉死值——要恢复
   * 自动，在面板里点「恢复自动」。旧稿没有这个键 = 全部自动推导。
   */
  aliasOverrides?: Record<string, string>;
  /**
   * v4.83 道具资产映射（AI解剖一键套用写入）：解剖结果里的物品
   * 资产清单（名称 / 描述 / 中文生图提示词）。分镜输出的「道具
   * 映射」块从这里取（经 LensMappingContext.props 或直接读本字段）；
   * 普通生成流程不写这个字段，没有就没有道具映射数据（输出写
   * 未填写，不编造）。
   */
  propAssets?: { name: string; description: string; promptZh: string }[];
  /**
   * 临时人物表处理状态，keyed by 临时人物名：群演 / 已删除 / 已映射的
   * 处置与手填的造型/音色/语气线索。是剧本数据的一部分，随保存一起
   * 存、随快照一起恢复；转正不写这里（转正直接进 characterRows）。
   * 检出逻辑见 rules.ts 的 collectTempCharacters（与待确认清单同一份）。
   */
  tempCharacterStates?: Record<string, TempCharacterState>;
  /**
   * v4.17 本次生成已自动加入的人物 / 群演清单（服务端
   * autoDesignNewCharacters 写入）：有台词的新人物已进 characterRows
   * 并建卡（kind=formal），无台词路人记为群演（kind=extra，状态在
   * tempCharacterStates 里 disposition=extra）。旧稿没有这个字段。
   */
  autoAddedCharacters?: AutoAddedCharacter[];
  /** Segmented-generation state: the plan this draft is being written
   * from and how many segments are already written. Present while a
   * draft exists; `generationProgress.done === false` means generation
   * is incomplete and confirmation is blocked. */
  generationPlan?: GenerationPlan;
  generationProgress?: GenerationProgress;
  storyboardGroups?: ScriptGroup[];
  storyboardConfig?: StoryboardConfig;
}

/**
 * The ONLY user-chosen storyboard setting: how many seconds each lens
 * （镜头） is designed to hold. The stored field keeps its legacy name
 * `groupSeconds` so old projects keep loading; it means "seconds per
 * lens" everywhere. The lens count is NOT a user setting — it is derived
 * (total duration ÷ seconds per lens, rounded up; the last lens takes
 * the remainder). How many beats （节拍） a lens contains and how long
 * each beat runs come from plot analysis in buildStoryboardGroups.
 * Legacy projects may still carry shotsPerGroup / shotSeconds in their
 * stored JSON; those values are ignored everywhere.
 */
export type StoryboardConfig = RulesStoryboardConfig;

export const DEFAULT_STORYBOARD_CONFIG: StoryboardConfig = {
  groupSeconds: 30,
};

export function parseScript(json: string | null): ScriptData | null {
  if (!json) return null;
  try {
    const data = JSON.parse(json) as ScriptData;
    if (!data || !Array.isArray(data.groups)) return null;
    // Required-field backfill: scripts written outside the generation /
    // import flow (e.g. assembled and saved through direct action calls)
    // can be missing fields the type marks required — `pendingItems`,
    // `overlays` and `generationNotes` above all, which the review paper
    // doc, the storyboard doc and the export-gate memo all read
    // unguarded. One missing array used to throw during StepThree render
    // and, with no error boundary, unmount the whole workbench into a
    // white screen. Normalize EVERY required field here, at the single
    // load entry point, so every stored script is safe to render.
    const asStr = (v: unknown): string => (typeof v === "string" ? v : "");
    const asStrList = (v: unknown): string[] =>
      Array.isArray(v)
        ? v.filter((x): x is string => typeof x === "string")
        : [];
    const asNum = (v: unknown, fallback: number): number =>
      typeof v === "number" && Number.isFinite(v) ? v : fallback;
    data.title = asStr(data.title);
    data.pendingItems = asStrList(data.pendingItems);
    data.synopsis = asStr(data.synopsis);
    data.overlays = Array.isArray(data.overlays)
      ? data.overlays.filter(
          (o): o is Overlay =>
            !!o && typeof o === "object",
        )
      : [];
    data.generationNotes = asStrList(data.generationNotes);
    data.versionNote = asStr(data.versionNote);
    data.speechRate = asNum(data.speechRate, 5);
    data.styleLabel = asStr(data.styleLabel);
    data.targetSeconds = asNum(data.targetSeconds, 0);
    data.generatedAt = asStr(data.generatedAt);
    if (!Array.isArray(data.characterRows)) {
      data.characterRows = [];
    } else {
      for (const r of data.characterRows) {
        if (!r) continue;
        r.name = asStr(r.name);
        r.identity = asStr(r.identity);
        r.look = asStr(r.look);
        r.voice = asStr(r.voice);
        r.tone = asStr(r.tone);
        // v5.30 性别单独字段：只认「男 / 女」，其余一律归未指定。
        r.gender = r.gender === "男" || r.gender === "女" ? r.gender : "";
        // v6.12 身高锚点：只归一为字符串（缺失 / 非字符串归空串，
        // 与未填同义；只有 H3 拼装读它，其余出口不引用）。
        r.heightAnchor = asStr(r.heightAnchor);
      }
    }
    // v5.49 人物待确认草稿归一：形状不对的记录整条丢弃（按无待确
    // 认值处理）；字段级来源只认 analysis / manual / match（v5.84）；待确认值与已
    // 存值相同的字段直接清掉（只记不同的）；代号已不在人物表里
    // 的记录一并删（删人物行 → 删其 charPending）；全空又无回退
    // 点的记录不保留。没有这个键的存量稿不补写、原样通过。
    if (data.charPending != null && typeof data.charPending === "object") {
      const rowByName = new Map(data.characterRows.map((r) => [r.name, r]));
      const asSource = (v: unknown): CharPendingSource | null =>
        v === "analysis" || v === "manual" || v === "match" ? v : null;
      const out: CharPendingMap = {};
      for (const [code, rawRec] of Object.entries(
        data.charPending as Record<string, unknown>,
      )) {
        const row = rowByName.get(code);
        if (!row || !rawRec || typeof rawRec !== "object") continue;
        const rec = rawRec as Record<string, unknown>;
        const src =
          rec.source != null && typeof rec.source === "object"
            ? (rec.source as Record<string, unknown>)
            : {};
        const norm: CharPendingRecord = {
          look: asStr(rec.look),
          voice: asStr(rec.voice),
          tone: asStr(rec.tone),
          gender: asStr(rec.gender),
          source: {
            look: asSource(src.look),
            voice: asSource(src.voice),
            tone: asSource(src.tone),
            gender: asSource(src.gender),
          },
          jobId:
            typeof rec.jobId === "number" && Number.isFinite(rec.jobId)
              ? rec.jobId
              : null,
          hasImage: rec.hasImage === true,
          updatedAt: asStr(rec.updatedAt),
          rollback:
            rec.rollback != null && typeof rec.rollback === "object"
              ? {
                  look: asStr((rec.rollback as Record<string, unknown>).look),
                  voice: asStr((rec.rollback as Record<string, unknown>).voice),
                  tone: asStr((rec.rollback as Record<string, unknown>).tone),
                  gender: asStr(
                    (rec.rollback as Record<string, unknown>).gender,
                  ),
                }
              : null,
        };
        // 来源为空的字段不算待确认；有来源但值与已存值相同的字段
        // 也不再算（转正后残留的同值记录在加载时收敛掉）。
        const stored: Record<"look" | "voice" | "tone" | "gender", string> = {
          look: row.look,
          voice: row.voice,
          tone: row.tone,
          gender: row.gender ?? "",
        };
        for (const f of ["look", "voice", "tone", "gender"] as const) {
          if (norm.source[f] == null || norm[f] === stored[f]) {
            norm[f] = "";
            norm.source[f] = null;
          }
        }
        if (charPendingHasFields(norm) || norm.rollback != null) {
          out[code] = norm;
        }
      }
      if (Object.keys(out).length > 0) data.charPending = out;
      else delete data.charPending;
    } else {
      delete data.charPending;
    }
    if (!Array.isArray(data.autoAddedCharacters)) {
      delete data.autoAddedCharacters;
    } else {
      data.autoAddedCharacters = data.autoAddedCharacters
        .filter((e): e is AutoAddedCharacter => !!e && typeof e === "object")
        .map((e) => ({
          name: asStr(e.name),
          kind: e.kind === "extra" ? ("extra" as const) : ("formal" as const),
          identity: asStr(e.identity),
          look: asStr(e.look),
          voice: asStr(e.voice),
          tone: asStr(e.tone),
        }))
        .filter((e) => e.name);
    }
    if (!Array.isArray(data.propAssets)) {
      delete data.propAssets;
    } else {
      data.propAssets = data.propAssets
        .filter((e): e is { name: string; description: string; promptZh: string } => !!e && typeof e === "object")
        .map((e) => ({
          name: asStr(e.name),
          description: asStr(e.description),
          promptZh: asStr(e.promptZh),
        }))
        .filter((e) => e.name);
    }
    const normalizeGroups = (
      groups: ScriptGroup[] | undefined,
      deriveBlocking = false,
    ) => {
      if (!Array.isArray(groups)) return;
      for (const g of groups) {
        if (!g) continue;
        g.title = asStr(g.title);
        g.sceneName = asStr(g.sceneName);
        if (!Array.isArray(g.beats)) g.beats = [];
        for (const b of g.beats) {
          if (!b) continue;
          b.speaker = asStr(b.speaker);
          b.emotion = asStr(b.emotion);
          b.line = asStr(b.line);
          b.visual = asStr(b.visual);
          b.sfx = asStr(b.sfx);
          b.actionSeconds = asNum(b.actionSeconds, 0);
        }
        // v4.93 站位初值：分镜组还没有 blocking 字段（存量稿）时，
        // 只从本组画面描述里已明确写出的位置提炼一次（提炼不出留
        // 空）；字段已是字符串（含用户清空后的空串）就原样保留，
        // 绝不二次提炼覆盖用户的修改。提炼结果随下一次保存落库。
        // v4.95：已是字符串但仍是旧形态（带「景别：/机位：」前缀
        // 或混着本拍动作，如旧提炼留下的「…趴桌上对视偷笑」）时，
        // 只做一次去动作化净化、只留位置成分作固定站位初值；已
        // 是纯位置文本的值一字不动，用户清空的空串保持空串。
        // v5.33：结构化站位表（v5.25 blockingDetail）已整块删除——
        // 存量 JSON 里残留的该字段在加载时直接丢弃（与下方
        // videoComparison 等已下线字段同口径），下一次保存即从
        // 落盘 JSON 里清掉；固定站位整行文本 blocking 不受影响。
        delete (g as { blockingDetail?: unknown }).blockingDetail;
        if (typeof g.blocking !== "string") {
          g.blocking = deriveBlocking ? deriveGroupBlocking(data, g) : "";
        } else if (g.blocking.trim()) {
          g.blocking = sanitizeFixedBlocking(data, g, g.blocking);
        }
      }
    };
    normalizeGroups(data.groups);
    normalizeGroups(data.storyboardGroups, true);
    // Legacy cleanup: projects saved while removed features existed may
    // still carry their data (finished-video comparison, production
    // progress). Those fields are dropped on load so they are never
    // displayed again and never written back on the next save. The
    // segmented-generation fields (generationPlan / generationProgress)
    // are live state and are kept. The script content itself is
    // untouched.
    delete (data as { videoComparison?: unknown }).videoComparison;
    delete (data as { production?: unknown }).production;
    // 一镜到底模式已下线（v3.97）：旧项目剧本里残留的 shotMode /
    // oneTakePlan / oneTakeOverride 在加载时直接丢弃，读取容错、
    // 不报错，下一次保存时服务端也会把这三个字段剥掉。
    delete (data as { shotMode?: unknown }).shotMode;
    delete (data as { oneTakePlan?: unknown }).oneTakePlan;
    delete (data as { oneTakeOverride?: unknown }).oneTakeOverride;
    if (data.stage !== "storyboard") data.stage = "review";
    if (
      data.stage === "storyboard" &&
      (!data.storyboardGroups || data.storyboardGroups.length === 0)
    ) {
      // Only projects saved before storyboard groups were stored get a
      // one-time slice from their confirmed beats. A stored storyboard
      // is kept EXACTLY as locked: loading a project must never
      // silently re-slice (and previously: auto-split) its lenses.
      data.storyboardGroups = buildStoryboardGroups(data);
    }
    return data;
  } catch {
    return null;
  }
}


/**
 * 群演与未自动加入人物（导出用）：与审查页同一份检出
 * （collectTempCharacters）。v4.17 起新人物在生成时已自动分拣，这里
 * 只剩群演条目与还没被自动补上的残留。返回可直接渲染成 Markdown
 * 行的状态；没有就返回空数组。
 */
export function tempCharacterMarkdownLines(
  script: ScriptData,
  ctx?: LensMappingContext,
): string[] {
  const registry = [
    ...script.characterRows.map((r) => ({ name: r.name, aliases: [r.identity] })),
    ...(ctx?.characters ?? []).map((c) => ({ name: c.name, aliases: [c.role] })),
  ];
  const temps = collectTempCharacters(script, registry, {
    states: script.tempCharacterStates,
  });
  if (temps.length === 0) return [];
  const out: string[] = ["", "## 群演与未自动加入的人物", ""];
  out.push("| 人物 | 类型 | 状态 | 台词 | 造型 | 音色 | 语气基调 |", "| --- | --- | --- | --- | --- | --- | --- |");
  for (const t of temps) {
    const status =
      t.status === "extra-ok"
        ? "无台词群演（只出画面，生成时已自动记入）"
        : t.status === "extra-with-dialogue"
          ? "已记群演却有台词（待自动转入正式人物表）"
          : "还没被自动分拣（有台词进正式表、无台词记群演）";
    out.push(
      `| ${t.name} | ${t.isGroup ? "群像/人数不定" : "单人"} | ${status} | ${t.dialogueCount} 句 | ${t.look || "未填写"} | ${t.status === "extra-ok" ? "无（群演不配音）" : t.voice || "未填写"} | ${t.tone || "未填写"} |`,
    );
  }
  return out;
}

/** The script viewed through its storyboard groups (timed outputs only). */
export function storyboardScript(script: ScriptData): ScriptData {
  if (script.stage === "storyboard" && script.storyboardGroups) {
    return { ...script, groups: script.storyboardGroups };
  }
  return script;
}


/** Format seconds as 0:00.0 style timecode (one decimal). */
export function fmtTc(totalSeconds: number): string {
  const t = Math.max(0, totalSeconds);
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}

export function fmtRange(start: number, end: number): string {
  return `${fmtTc(start)}–${fmtTc(end)}`;
}

export interface TimedBeat extends Beat {
  start: number;
  end: number;
  duration: number;
  indexInGroup: number;
}

export interface TimedGroup extends ScriptGroup {
  beats: TimedBeat[];
  start: number;
  end: number;
  duration: number;
  overLimit: boolean;
}

export interface Timeline {
  groups: TimedGroup[];
  totalSeconds: number;
  dialogueChars: number;
  lineCount: number;
  beatCount: number;
}

export function computeTimeline(script: ScriptData): Timeline {
  const rate = script.speechRate > 0 ? script.speechRate : 5;
  let cursor = 0;
  let dialogueChars = 0;
  let lineCount = 0;
  let beatCount = 0;
  const groups: TimedGroup[] = script.groups.map((g) => {
    const start = cursor;
    const beats: TimedBeat[] = g.beats.map((b, i) => {
      const duration = beatDuration(b, rate);
      const tb: TimedBeat = {
        ...b,
        start: cursor,
        end: cursor + duration,
        duration,
        indexInGroup: i,
      };
      cursor += duration;
      beatCount += 1;
      if (b.line.trim()) {
        lineCount += 1;
        dialogueChars += countLineChars(b.line);
      }
      return tb;
    });
    return {
      ...g,
      beats,
      start,
      end: cursor,
      duration: cursor - start,
      overLimit: cursor - start > 30.05,
    };
  });
  return { groups, totalSeconds: cursor, dialogueChars, lineCount, beatCount };
}

/**
 * v5.32 双口径时长对照（分镜页 / 审查页时长试算并列展示用）：
 * 同一批节拍算两遍总时长——
 *   measuredSeconds：唯一计时口径（rules.beatTiming），带齐原片起止
 *     时间戳的节拍以实测跨度为准，其余走语速公式；computeTimeline /
 *     durationSummary / 超顶判定用的都是这个数；
 *   formulaSeconds：同一批节拍一律按「台词字数（去标点）÷ 语速 +
 *     动作秒数」公式换算（人为抹掉时间戳再走 beatTiming，保证公式
 *     分支与共享规则逐字一致），只作对照展示，绝不参与任何计时 /
 *     切分 / 超顶判定。
 * 项目 40 的教训：两个口径只差在有没有时间戳（52.3 vs 68.4 秒），
 * 页面只显示一个数时，用户无从知道看到的是实测还是换算、更无从
 * 发现时间戳被丢掉——故并列展示并注明当前语速。
 */
export interface DualTimingInfo {
  /** 是否有节拍带齐可用的原片起止时间戳。 */
  hasTimestamps: boolean;
  /** 带齐时间戳的节拍数 / 总节拍数。 */
  timestampedBeats: number;
  totalBeats: number;
  /** 实测口径总时长（beatTiming，时间戳优先）。 */
  measuredSeconds: number;
  /** 语速换算总时长（纯公式对照值）。 */
  formulaSeconds: number;
  /** 本次换算用的语速（剧本快照语速）。 */
  speechRate: number;
}

export function dualTimingInfo(
  script: ScriptData,
  groups: ScriptGroup[],
): DualTimingInfo {
  const rate = script.speechRate > 0 ? script.speechRate : 5;
  let measured = 0;
  let formula = 0;
  let timestamped = 0;
  let total = 0;
  for (const g of groups) {
    for (const b of g.beats) {
      total += 1;
      const hasTs =
        typeof b.startSec === "number" &&
        typeof b.endSec === "number" &&
        Number.isFinite(b.startSec) &&
        Number.isFinite(b.endSec) &&
        b.endSec > b.startSec;
      if (hasTs) timestamped += 1;
      measured += beatTiming(b, rate).totalSeconds;
      formula += beatTiming(
        { ...b, startSec: undefined, endSec: undefined },
        rate,
      ).totalSeconds;
    }
  }
  return {
    hasTimestamps: timestamped > 0,
    timestampedBeats: timestamped,
    totalBeats: total,
    measuredSeconds: Math.round(measured * 10) / 10,
    formulaSeconds: Math.round(formula * 10) / 10,
    speechRate: rate,
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

const CN_NUM = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二", "十三", "十四"];

// ---------------------------------------------------------------------------
// 【郑重声明】（v4.70）：三条硬规则做成一段声明、统一放在复制 / 导出
// 文本的最顶部，每次复制自动带上，不再只散落在逐镜头映射行与逐节拍
// 备注里（v4.29 的人物锁定句与无字幕句仍在原处保留，本声明是置顶
// 汇总）。文案由用户逐字定稿，三处共用一份、不许漂移：分镜页逐镜头
// 一键复制（buildSingleGroupText）、分镜 Markdown 导出
// （buildMarkdown）、AI 视频生成清单导出（buildGenChecklist）。
// ---------------------------------------------------------------------------

export const VIDEO_DECLARATION_ITEMS = [
  "1. 本视频不烧录任何字幕，台词仅用于配音。",
  "2. 人物严格锁定：A的台词只能A外貌的人说，B的台词只能B外貌的人说，严禁互换、串演、换脸。",
  "3. 配音台词必须与分镜台词一字不差，不准改词、加词、漏词。",
] as const;

/**
 * The declaration block, verbatim: the three items' text is unchanged,
 * but v4.94 compresses the block into ONE paragraph line (header + the
 * three items back to back) instead of four separate lines — the copy
 * text had grown a dozen layers and the declaration only needs to be
 * read once, at the top.
 */
export function videoDeclarationLines(): string[] {
  return [`【郑重声明】${VIDEO_DECLARATION_ITEMS.join("")}`];
}

export function buildMarkdown(
  script: ScriptData,
  ctx?: LensMappingContext,
  opts?: LensMappingOptions,
): string {
  const tl = computeTimeline(script);
  const out: string[] = [];
  let sec = 0;
  const head = (title: string) => {
    out.push("", `## ${CN_NUM[sec++] ?? sec}、${title}`, "");
  };

  out.push(`# ${script.title}`, "");
  // v4.70：【郑重声明】置顶，紧跟标题，不藏在镜头备注里。
  out.push(...videoDeclarationLines(), "");
  if (script.pendingItems.length > 0) {
    out.push("## ⚠️ 待确认事项", "");
    for (const item of script.pendingItems) out.push(`- ${item}`);
  }

  head("全局规范");
  out.push(...globalSpecLines(script, ctx), "");

  head("基本信息");
  out.push("| 项目 | 内容 |", "| --- | --- |");
  out.push(`| 片名 | ${script.title} |`);
  out.push(
    `| 分段 | ${tl.groups.length} 个镜头 · ${tl.beatCount} 个节拍 · ${tl.lineCount} 句台词 |`,
  );
  out.push(`| 合计秒数 | ${tl.totalSeconds.toFixed(1)} 秒（台词确认后按 ${script.speechRate} 字/s 换算） |`);
  out.push(
    `| 生成总时长 | ${tl.totalSeconds.toFixed(1)} 秒（与故事总时长一致，镜头之间不重叠、时间码连续） |`,
  );
  out.push("| 画幅 | 16:9 |");
  out.push(`| 语速 | ${script.speechRate} 字/s |`);
  out.push(`| 风格 | ${script.styleLabel} |`);

  head("故事梗概");
  out.push(script.synopsis);

  head("人物表");
  out.push("| 人物 | 身份 | 造型 | 音色 | 语气基调 |", "| --- | --- | --- | --- | --- |");
  for (const r of script.characterRows) {
    out.push(`| ${r.name} | ${r.identity} | ${r.look} | ${r.voice} | ${r.tone} |`);
  }
  out.push(...tempCharacterMarkdownLines(script, ctx));

  const dlgNums = dialogueNumbers(script);
  tl.groups.forEach((g, gi) => {
    head(`镜头${gi + 1}｜${g.title}（${fmtRange(g.start, g.end)} · 全片总时长 ${tl.totalSeconds.toFixed(1)} 秒）`);
    // Same order as the per-lens one-click copy: 风格锁定句（v4.93）
    // first, then 【1】角色映射， then 【2】节拍. No separate scene
    // mapping inside the lens block — the scene is described as text
    // inside each beat's 画面内容.
    out.push(...filmStyleLockLines(script), "");
    out.push(...lensCharacterMappingLines(script, g, ctx, opts), "");
    out.push(...lensBeatLines(script, ctx, g, gi, dlgNums));
    // v4.83：每条分镜提示词（本镜头块）末尾固定带资产图优先规则行。
    // v4.94：v4.93 的短版风格后缀已删——风格锁只留每镜头顶部一次。
    out.push(ASSET_PRIORITY_RULE, "");
  });

  head("后期叠加清单");
  if (script.overlays.length === 0) {
    out.push("（无）");
  } else {
    out.push("| 类型 | 时间码 | 内容 |", "| --- | --- | --- |");
    for (const o of script.overlays) {
      const g = tl.groups[o.groupIndex];
      const tc = g ? fmtTc(g.start) : "—";
      out.push(`| ${o.type} | ${tc} 起 | ${o.content} |`);
    }
    out.push("", "字幕与正文台词逐字一致。");
  }

  head("生成备注");
  for (const n of script.generationNotes) out.push(`- ${n}`);

  head("版本说明");
  out.push(script.versionNote);
  out.push(
    `（本稿由剧本创作工作台生成于 ${new Date(script.generatedAt).toLocaleString("zh-CN")}；时间码按 ${script.speechRate} 字/s 由台词字数自动换算。）`,
  );

  head("覆盖台词清单");
  out.push(...coverageLines(script));
  return out.join("\n");
}

/**
 * v4.91「分镜+人物表导出」专用的分镜生成路径：内容与 buildMarkdown
 * 逐字同源，唯一区别是角色映射跟随 v4.89 的角色造型展开/收起开关
 * ——expandLook=false 时每位人物的条目收为「D=D（长发女孩）」
 * （v4.96 口径；v4.94 是裸条目「D（长发女孩）」，v4.91 当时是
 * 「D=D」且带音色 / 语气基调行）。这是全站唯一跟随开关的导出路
 * 径：buildMarkdown 的其它调用方（全部导出、AI 视频清单、分镜
 * 文档复制全文）都不传 opts、永远完整展开版，与改版前逐字一致。
 */
export function buildStoryboardExportMarkdown(
  script: ScriptData,
  ctx: LensMappingContext | undefined,
  expandLook: boolean,
): string {
  return buildMarkdown(script, ctx, { expandLook });
}

/**
 * Review-stage export: the full script and its lines with NO timing —
 * no timecodes, no shot groups, no durations. Used before the user has
 * confirmed the lines; timed exports (Markdown/SRT/checklist) only exist
 * after storyboard packing.
 */
export function buildReviewMarkdown(script: ScriptData): string {
  const out: string[] = [];
  const lineCount = script.groups.reduce(
    (n, g) => n + g.beats.filter((b) => b.line.trim()).length,
    0,
  );
  const dialogueChars = script.groups.reduce(
    (n, g) =>
      n +
      g.beats.reduce(
        (m, b) => m + (b.line.trim() ? countLineChars(b.line) : 0),
        0,
      ),
    0,
  );
  out.push(`# ${script.title}`, "");
  if (script.pendingItems.length > 0) {
    out.push("## ⚠️ 待确认事项", "");
    for (const item of script.pendingItems) out.push(`- ${item}`);
  }
  out.push("", "## 基本信息", "");
  out.push("| 项目 | 内容 |", "| --- | --- |");
  out.push(`| 片名 | ${script.title} |`);
  out.push(
    `| 结构 | ${script.groups.length} 个剧本段落 · ${lineCount} 句台词 · 台词 ${dialogueChars} 字 |`,
  );
  out.push("| 画幅 | 16:9 |");
  out.push(`| 语速 | ${script.speechRate} 字/s（分镜阶段换算时长用） |`);
  out.push(`| 风格 | ${script.styleLabel} |`);
  out.push("| 阶段 | 剧本审查中（台词未确认，暂无时间码与分镜） |");

  out.push("", "## 故事梗概", "", script.synopsis);

  out.push("", "## 人物表", "");
  out.push("| 人物 | 身份 | 造型 | 音色 | 语气基调 |", "| --- | --- | --- | --- | --- |");
  for (const r of script.characterRows) {
    out.push(`| ${r.name} | ${r.identity} | ${r.look} | ${r.voice} | ${r.tone} |`);
  }
  out.push(...tempCharacterMarkdownLines(script));

  script.groups.forEach((g, gi) => {
    out.push("", `## 段落${gi + 1}｜${g.title}`, "", `场景：${g.sceneName}`, "");
    g.beats.forEach((b, bi) => {
      out.push(`**节拍${bi + 1}**`);
      out.push(`- 画面：${b.visual}`);
      if (b.line.trim()) {
        out.push(`- 台词：${b.speaker}（**${b.emotion}**）："${b.line}"`);
      }
      if (b.sfx.trim()) out.push(`- 音效：${b.sfx}`);
      out.push("");
    });
  });

  out.push("## 后期叠加清单", "");
  if (script.overlays.length === 0) {
    out.push("（无）");
  } else {
    for (const o of script.overlays) out.push(`- ${o.type}：${o.content}`);
  }

  out.push("", "## 生成备注", "");
  for (const n of script.generationNotes) out.push(`- ${n}`);

  out.push("", "## 版本说明", "", script.versionNote);
  out.push(
    `（本稿由剧本创作工作台生成于 ${new Date(script.generatedAt).toLocaleString("zh-CN")}；台词经确认后进入分镜阶段，再按 ${script.speechRate} 字/s 换算时间码。）`,
  );
  return out.join("\n");
}

function srtTime(totalSeconds: number): string {
  const t = Math.max(0, totalSeconds);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  const ms = Math.round((t - Math.floor(t)) * 1000);
  const p = (n: number, w: number) => String(n).padStart(w, "0");
  return `${p(h, 2)}:${p(m, 2)}:${p(s, 2)},${p(ms, 3)}`;
}

export function buildSrt(script: ScriptData): string {
  const tl = computeTimeline(script);
  const blocks: string[] = [];
  let n = 0;
  for (const g of tl.groups) {
    for (const b of g.beats) {
      if (!b.line.trim()) continue;
      n += 1;
      // Speaker prefix on every entry; a line whose speaker was never
      // filled in is prefixed 待确认说话人 so it can never be mistaken
      // for a registered character's line in the dubbing pass.
      const speaker = b.speaker.trim() || "待确认说话人";
      blocks.push(
        `${n}\n${srtTime(b.start)} --> ${srtTime(b.end)}\n${speaker}：${b.line.trim()}`,
      );
    }
  }
  return blocks.join("\n\n") + (blocks.length ? "\n" : "");
}

/** Per-lens generation checklist for 可灵 / 即梦 (16:9). */
export function buildGenChecklist(
  script: ScriptData,
  projectName: string,
  ctx?: LensMappingContext,
  opts?: { pendingLines?: string[] },
): string {
  const tl = computeTimeline(script);
  const out: string[] = [];
  out.push(`# ${script.title} · AI 视频生成清单（可灵 / 即梦）`, "");
  // v4.70：【郑重声明】置顶，紧跟标题，不藏在镜头备注里。
  out.push(...videoDeclarationLines(), "");
  out.push(`项目：${projectName}｜画幅：16:9｜语速：${script.speechRate} 字/s｜故事总时长：${tl.totalSeconds.toFixed(1)} 秒`, "");
  out.push(
    `生成总时长：${tl.totalSeconds.toFixed(1)} 秒（与故事总时长一致，镜头之间不重叠、时间码连续）`,
    "",
  );
  if (script.targetSeconds > 0) {
    const diff = tl.totalSeconds - script.targetSeconds;
    out.push(
      `目标时长：${script.targetSeconds} 秒｜差值：${diff >= 0 ? "+" : ""}${diff.toFixed(1)} 秒（${diff > 0.05 ? "已超目标" : diff < -0.05 ? "未达目标" : "与目标一致"}）`,
      "",
    );
  }
  out.push("## 全局规范", "");
  out.push(...globalSpecLines(script, ctx), "");
  out.push("## 角色锁定", "");
  for (const r of script.characterRows) {
    out.push(`- ${r.name}：${r.identity}；造型：${r.look}（全程与人物资产图一致，不换脸不换装）`);
  }
  const dlgNums = dialogueNumbers(script);
  tl.groups.forEach((g, gi) => {
    out.push("", `## 镜头 ${gi + 1}｜${g.title}`, "");
    out.push(`- 故事时间码：${fmtRange(g.start, g.end)}（故事时长 ${g.duration.toFixed(1)} 秒 · 全片总时长 ${tl.totalSeconds.toFixed(1)} 秒${g.duration > 30.05 ? `，⚠️ 超过 30 秒默认上限${(script.overlongOverride?.lenses ?? []).some((l) => l.lensIndex === gi + 1) ? "（已高权限确认保留）" : ""}，生成前请留意工具的单镜头时长上限` : ""}）`);
    out.push(`- 生成时长：${g.duration.toFixed(1)} 秒（与故事时长一致）`);
    // Same order as the per-lens copy: style lock (v4.93) and
    // character mappings first, then the beats; the scene lives as
    // text inside each beat's 画面内容， not as a separate
    // scene-mapping section.
    out.push(...filmStyleLockLines(script), "");
    out.push(...lensCharacterMappingLines(script, g, ctx), "");
    out.push(...lensBeatLines(script, ctx, g, gi, dlgNums));
    // v4.83：每条分镜提示词（本镜头块）末尾固定带资产图优先规则行。
    // v4.94：v4.93 的短版风格后缀已删——风格锁只留每镜头顶部一次。
    out.push(ASSET_PRIORITY_RULE);
  });
  out.push("", "## 待确认事项状态", "");
  if (opts?.pendingLines && opts.pendingLines.length > 0) {
    out.push("⚠️ 本清单导出时仍有未处理的待确认事项：");
    for (const l of opts.pendingLines) out.push(`- ${l}`);
  } else {
    out.push("待确认清单为空：说话人均已登记为人物名，总时长未超目标。");
  }
  out.push("", "## 全局生成备注", "");
  for (const n of script.generationNotes) out.push(`- ${n}`);
  out.push("- 画幅 16:9；画面内不出现任何文字（字幕、花字均在后期叠加）。");
  out.push("", "## 覆盖台词清单", "");
  out.push(...coverageLines(script));
  return out.join("\n");
}

// ---------------------------------------------------------------------------
// 成片资料包 builders （第 5 轮）: 剧本格式01 全文 / 台词本 / 逐镜头提示词包。
// All three read the STORYBOARD script (groups = lenses), so every
// duration they print matches the storyboard page and the SRT. None of
// them restores the deleted 时间总规划 section: time appears only as
// per-lens / per-beat durations and the film total.
// ---------------------------------------------------------------------------

/**
 * 剧本格式01 全文：⚠️ 待确认事项置顶 → 基本信息 → 故事梗概 → 人物表 →
 * 逐镜头正文（语气/情绪加粗）→ 后期叠加清单 → 生成备注 → 版本说明。
 * `pendingLines` 是导出当刻仍未处理的待确认事项（说话人问题 / 超目标），
 * 与剧本自带的 pendingItems 一起置顶，强制导出时也如实标注。
 */
export function buildFormat01(
  script: ScriptData,
  projectName: string,
  ctx?: LensMappingContext,
  pendingLines: string[] = [],
): string {
  const tl = computeTimeline(script);
  const out: string[] = [];
  out.push(`# ${script.title}（剧本格式01）`, "");
  const pending = [
    ...script.pendingItems,
    ...pendingLines.filter((l) => !script.pendingItems.includes(l)),
  ];
  if (pending.length > 0) {
    out.push("## ⚠️ 待确认事项（置顶）", "");
    for (const item of pending) out.push(`- ${item}`);
    out.push("");
  }
  out.push("## 基本信息", "");
  out.push("| 项目 | 内容 |", "| --- | --- |");
  out.push(`| 片名 | ${script.title} |`);
  out.push(`| 所属项目 | ${projectName} |`);
  out.push(
    `| 结构 | ${tl.groups.length} 个镜头 · ${tl.beatCount} 个节拍 · ${tl.lineCount} 句台词 |`,
  );
  out.push(`| 全片总时长 | ${tl.totalSeconds.toFixed(1)} 秒 |`);
  if (script.targetSeconds > 0) {
    const diff = tl.totalSeconds - script.targetSeconds;
    out.push(
      `| 目标时长 | ${script.targetSeconds} 秒（差值 ${diff >= 0 ? "+" : ""}${diff.toFixed(1)} 秒） |`,
    );
  }
  out.push("| 画幅 | 16:9 |");
  out.push(`| 语速 | ${script.speechRate} 字/s |`);
  out.push(`| 风格 | ${script.styleLabel} |`);

  out.push("", "## 故事梗概", "", script.synopsis);

  out.push("", "## 人物表", "");
  out.push("| 人物 | 身份 | 造型 | 音色 | 语气基调 |", "| --- | --- | --- | --- | --- |");
  for (const r of script.characterRows) {
    out.push(`| ${r.name} | ${r.identity} | ${r.look} | ${r.voice} | ${r.tone} |`);
  }
  out.push(...tempCharacterMarkdownLines(script, ctx));

  out.push("", "## 正文（逐镜头）", "");
  tl.groups.forEach((g, gi) => {
    out.push(
      `### 镜头${gi + 1}｜${g.title}（${fmtRange(g.start, g.end)} · 本镜头 ${g.duration.toFixed(1)} 秒）`,
      "",
      `场景：${g.sceneName}`,
      "",
    );
    g.beats.forEach((b, bi) => {
      out.push(`**节拍${bi + 1}**（${b.duration.toFixed(1)} 秒）`);
      out.push(`- 画面：${b.visual}`);
      if (b.line.trim()) {
        out.push(
          `- 台词：${b.speaker.trim() || "待确认说话人"}（**${b.emotion}**）："${b.line}"`,
        );
      }
      if (b.sfx.trim()) out.push(`- 音效：${b.sfx}`);
      out.push("");
    });
  });

  out.push("## 后期叠加清单", "");
  if (script.overlays.length === 0) {
    out.push("（无）");
  } else {
    out.push("| 类型 | 时间码 | 内容 |", "| --- | --- | --- |");
    for (const o of script.overlays) {
      const g = tl.groups[o.groupIndex];
      const tc = g ? fmtTc(g.start) : "—";
      out.push(`| ${o.type} | ${tc} 起 | ${o.content} |`);
    }
    out.push("", "字幕与正文台词逐字一致。");
  }

  out.push("", "## 生成备注", "");
  for (const n of script.generationNotes) out.push(`- ${n}`);

  out.push("", "## 版本说明", "", script.versionNote);
  out.push(
    `（本稿由剧本创作工作台生成于 ${new Date(script.generatedAt).toLocaleString("zh-CN")}；逐镜头/逐节拍时长按台词字数（去标点）÷ ${script.speechRate} 字/s + 动作秒数换算。）`,
  );
  return out.join("\n");
}

/**
 * 台词本（配音用）：按说话人分组，每位说话人先列音色与语气基调，再按
 * 出场顺序列出全部台词（镜头/节拍位置 + 情绪 + 台词）。说话人为空的
 * 台词单独归入「待确认说话人」一组放在最前，绝不混进任何人物名下。
 */
export function buildDialogueBook(
  script: ScriptData,
  ctx?: LensMappingContext,
  pendingLines: string[] = [],
): string {
  const tl = computeTimeline(script);
  const out: string[] = [];
  out.push(`# ${script.title} · 台词本（按说话人分组）`, "");
  if (pendingLines.length > 0) {
    out.push("## ⚠️ 导出时仍有待确认事项", "");
    for (const l of pendingLines) out.push(`- ${l}`);
    out.push("");
  }
  interface Entry {
    where: string;
    emotion: string;
    line: string;
  }
  const order: string[] = [];
  const bySpeaker = new Map<string, Entry[]>();
  tl.groups.forEach((g, gi) => {
    g.beats.forEach((b, bi) => {
      if (!b.line.trim()) return;
      const key = b.speaker.trim();
      if (!bySpeaker.has(key)) {
        bySpeaker.set(key, []);
        order.push(key);
      }
      bySpeaker.get(key)?.push({
        where: `镜头${gi + 1} 节拍${bi + 1}（${fmtTc(b.start)}）`,
        emotion: b.emotion.trim(),
        line: b.line.trim(),
      });
    });
  });
  const renderGroup = (speaker: string) => {
    const entries = bySpeaker.get(speaker) ?? [];
    const label = speaker === "" ? "待确认说话人" : speaker;
    out.push(`## ${speaker === "" ? "⚠️ " : ""}${label}（${entries.length} 句）`, "");
    if (speaker !== "") {
      const info = resolveCharacterInfo(speaker, script, ctx);
      out.push(`- 音色：${info.voice.trim() || NOT_FILLED}`);
      out.push(`- 语气基调：${info.tone.trim() || NOT_FILLED}`);
      out.push("");
    } else {
      out.push(
        "以下台词在剧本里没有填写说话人，先在审查页映射回人物名或补登记，再配音，不要猜是谁说的。",
        "",
      );
    }
    entries.forEach((e, i) => {
      out.push(
        `${i + 1}. [${e.where}]${e.emotion ? `（${e.emotion}）` : ""} ${e.line}`,
      );
    });
    out.push("");
  };
  // 待确认说话人 first (never merged into a character), then speakers in
  // first-appearance order.
  if (bySpeaker.has("")) renderGroup("");
  for (const s of order) if (s !== "") renderGroup(s);
  if (order.length === 0) out.push("（本剧本暂无台词）", "");
  return out.join("\n");
}

/**
 * 逐镜头生图/生视频提示词包：每个镜头一条独立可用的提示词——画幅
 * 16:9、场景、画面内容、人物映射（造型/音色/语气）、首帧与末帧、
 * 禁用项。人物造型与场景短语在每个镜头里重复写全，不只在全局写一次，
 * 这样单独复制任何一个镜头去生图/生视频都不会丢人物与场景。
 */
export function buildLensPromptPack(
  script: ScriptData,
  projectName: string,
  ctx?: LensMappingContext,
  pendingLines: string[] = [],
): string {
  const tl = computeTimeline(script);
  const out: string[] = [];
  out.push(`# ${script.title} · 逐镜头生图/生视频提示词包`, "");
  out.push(
    `项目：${projectName}｜画幅：16:9｜镜头数：${tl.groups.length}｜全片总时长：${tl.totalSeconds.toFixed(1)} 秒｜语速：${script.speechRate} 字/s`,
    "",
  );
  if (pendingLines.length > 0) {
    out.push("## ⚠️ 导出时仍有待确认事项", "");
    for (const l of pendingLines) out.push(`- ${l}`);
    out.push("");
  }
  tl.groups.forEach((g, gi) => {
    const maps = lensMappings(script, g, ctx);
    const sceneText =
      maps.scenes.length > 0
        ? maps.scenes
            .map(
              (s) =>
                `${s.name}${s.description.trim() ? `（${s.description.trim()}）` : ""}`,
            )
            .join("；")
        : g.sceneName || NOT_FILLED;
    // v5.94：每镜人物行同口径只列已提取人物资产图的人物（见
    // visibleMappingCharacters）；过滤启用且一人不剩时 charText
    // 为空——「人物映射：」行整行不出现、可粘贴提示词里的人物
    // 段同步省去，不写 未填写 占位。过滤未启用（解剖等无卡 id
    // 的上下文）时与改版前逐字一致。
    const visChars = visibleMappingCharacters(maps.characters, ctx);
    const charText =
      visChars.length > 0
        ? visChars
            .map(
              (c) =>
                `${c.name}（造型：${c.look.trim() || NOT_FILLED}；音色：${c.voice.trim() || NOT_FILLED}；语气基调：${c.tone.trim() || NOT_FILLED}）`,
            )
            .join("；")
        : mappingImageFilterEnabled(ctx)
          ? ""
          : NOT_FILLED;
    const visuals = g.beats.map((b) => b.visual.trim()).filter(Boolean);
    const lines = g.beats
      .filter((b) => b.line.trim())
      .map(
        (b) =>
          `${b.speaker.trim() || "待确认说话人"}（${b.emotion.trim()}）："${b.line.trim()}"`,
      );
    const lastVisual = visuals[visuals.length - 1] ?? "";
    out.push(
      `## 镜头 ${gi + 1}｜${g.title}（${fmtRange(g.start, g.end)} · ${g.duration.toFixed(1)} 秒）`,
      "",
    );
    out.push(`- 画幅：16:9，超写实真人短剧质感`);
    out.push(`- 场景：${sceneText}`);
    // v5.94：charText 为空（过滤后一人不剩）时整行不出现。
    if (charText) out.push(`- 人物映射：${charText}`);
    out.push(`- 画面内容：${visuals.join("；") || NOT_FILLED}`);
    if (lines.length > 0) out.push(`- 台词：${lines.join("；")}`);
    // v3.92 严格审核口径进提示词包：神态逐拍写明、切镜方式按场景
    // 关系写明、空镜逐拍计时并写死 ≤2 秒上限（确认分镜时已按同一
    // 口径拦截过超限空镜，这里是给生成工具的执行约束）。
    const exprText = g.beats
      .filter((b) => b.line.trim())
      .map(
        (b) =>
          `${b.speaker.trim() || "待确认说话人"}：${b.emotion.trim() || "按画面表情自然表演"}`,
      )
      .join("；");
    if (exprText) out.push(`- 神态表情：${exprText}（表情与台词情绪一致，眼神、眉头、嘴角都要到位，不面无表情）`);
    const prevGroup = tl.groups[gi - 1];
    const transitionText =
      gi === 0
        ? "开场镜头，无切换"
        : prevGroup && prevGroup.sceneName !== g.sceneName
          ? `场景转场硬切：上一镜头场景「${prevGroup.sceneName}」→ 本镜头场景「${g.sceneName}」，切点落在场景变化处`
          : "同场景硬切衔接：首帧承接上一镜头末帧的人物站位与动作";
    out.push(`- 镜头切换：${transitionText}`);
    const silentText = g.beats
      .map((b, bi) => ({ b, bi }))
      .filter(({ b }) => !b.line.trim())
      .map(({ b, bi }) => `第 ${bi + 1} 拍 ${beatDuration(b, script.speechRate).toFixed(1)} 秒`)
      .join("、");
    out.push(
      `- 空镜控制：无台词节拍${silentText ? `（${silentText}）` : ""}单拍与连续合计都不得超过 2 秒，超时部分压缩或提前切到有人物的画面`,
    );
    out.push(
      gi === 0
        ? `- 首帧衔接：开场镜头，无上一镜头——首帧直接建立场景与人物站位。`
        : `- 首帧衔接：首帧按本镜头第一拍画面生成，生成时长 = 本镜头故事时长 ${g.duration.toFixed(1)} 秒。`,
    );
    out.push(`- 末帧：${lastVisual || NOT_FILLED}`);
    out.push(
      `- 提示词（可直接粘贴）：16:9 超写实真人短剧，场景：${sceneText}${charText ? `；人物：${charText}` : ""}；画面：${visuals.join("，") || NOT_FILLED}；人物神态表情与台词情绪一致、眼神眉头嘴角到位；画面连贯流畅、镜头切换与场景一致、无跳变无串场；空镜不超过 2 秒；自然光影，真实皮肤质感，电影感构图。人物锁定：台词只能由标注造型的本人表演，严禁角色互换串演；台词仅用于配音，画面不烧录任何字幕。`,
    );
    out.push(
      `- 禁用项 / 负面提示词：卡通，动漫，3D 渲染，塑料皮肤，水印，logo，画面内烧录文字/字幕，换脸，服装变化，多余肢体，变形手指（cartoon, anime, 3d render, plastic skin, watermark, logo, text, burned-in subtitles, extra limbs, deformed hands）`,
      "",
    );
  });
  return out.join("\n");
}

// ---------------------------------------------------------------------------
// Per-lens character / scene mappings
//
// A lens's copy text (and its Markdown block) carries the mapping
// blocks for exactly what that lens uses — never the whole project
// cast — followed by the lens's beats, and the asset-priority rule
// line at the very end. v4.83 起映射是三块统一排版（角色 / 场景 /
// 道具，见 lensMappingBlocks）；v4.94 精简后场景只留一行描述句、
// 不再带生图提示词（数据仍在场景卡里）；道具按名匹配本镜头节拍
// 文本。
// (The on-page document shows the same blocks with bold titles, via
// lensMappingLines.)
// Character mapping info is extracted from the character
// card's single 性格/外貌备注 field (labelled segments written as
// “造型：…；音色：…；语气基调：…” plus classifiable appearance / voice /
// tone clauses) and, as a fallback, the script's 人物表 row and the
// emotions of that character's own lines. The card has no separate
// 造型/音色/语气基调 inputs anymore. Character fields still missing
// are written as 未填写 — never invented. (v4.85：场景 / 道具条目
// 不再写 未填写 占位——无数据的条目不进映射正文、特写 framing
// 不列，缺口由 collectMappingGaps 承接，见下方过滤口径。）
// ---------------------------------------------------------------------------

export interface LensMappingCharInfo {
  name: string;
  look: string;
  voice: string;
  tone: string;
  role: string;
  /** v5.21 锁人①：人物卡在库里的稳定 id（characters.id，跨镜头 /
   * 跨版本不变的 characterId）；解剖临时上下文等没有库 id 的来源
   * 为 null。镜头包附图清单按它点名人物，改名 / 改备注都不动它。 */
  characterId: number | null;
  /** v5.21 锁人①：该人物有没有人物资产图（镜头包附图靠它）。 */
  hasImage: boolean;
}

export interface LensMappingSceneInfo {
  name: string;
  description: string;
  /** Asset source line, e.g. 文字描述 / 场景图文件：xxx.png. */
  asset: string;
  /** v4.83：场景卡上的中文生图提示词（有才带，映射块里保留原文）。 */
  promptZh?: string;
}

/** v4.83：道具映射条目（名称 / 描述 / 中文生图提示词）。 */
export interface LensMappingPropInfo {
  name: string;
  description: string;
  promptZh: string;
}

export interface LensMappingContext {
  /** Card data: name + 扮演/身份 + the single 性格/外貌备注 text.
   * v5.21 起可带人物卡的稳定 id 与资产图地址（镜头包附图清单
   * 点名与有无图判定用）；没有这两个字段的来源（解剖临时上下文）
   * 照旧工作，附图清单里相应项标「暂无」。 */
  characters: {
    name: string;
    role: string;
    note: string;
    id?: number;
    imageUrl?: string | null;
  }[];
  scenes: LensMappingSceneInfo[];
  /** v4.83：全片道具资产（名称 / 描述 / 生图提示词）；逐镜头映射时
   * 按道具名在本镜头节拍文本里出现与否过滤。缺省时回落剧本自带
   * 的 propAssets（AI解剖套用写入）。 */
  props?: LensMappingPropInfo[];
  /** Legacy shared scene description slot (v4.03：场景设置已删除，
   * 调用方恒传 undefined；场景只用剧本每段的 sceneName). */
  textSceneDescription?: string;
}

export interface LensMappings {
  characters: LensMappingCharInfo[];
  scenes: LensMappingSceneInfo[];
  /** v4.83：本镜头节拍里实际出现的道具（按名匹配画面/台词/音效）。 */
  props: LensMappingPropInfo[];
}

const NOT_FILLED = "未填写";

/**
 * v3.45：场景映射里禁止再出现的一句固定说明。原则本身不变（不重要
 * 的场景仍用提示词描述、重要场景仍由用户提供场景资产），只是这句
 * 话不再写进任何场景映射输出：分镜页展示、分镜复制、逐镜头提示
 * 词包、生成清单与成套导出都走这里过滤；已存项目里旧场景描述 /
 * 旧分镜带上这句时，展示与导出时同样过滤掉，不改存量数据本身。
 * 只删这一整句（含它前后的连接标点），场景名、其余描述与资产
 * 来源原样保留。
 */
export const FORBIDDEN_SCENE_SENTENCE =
  "场景不重要时用提示词描述，重要场景由用户提供场景资产";

export function stripForbiddenSceneSentence(text: string): string {
  const raw = text ?? "";
  if (!raw.includes("场景不重要")) return raw;
  let out = raw.replace(
    /[；;，,、]?\s*场景不重要时用提示词描述\s*[，,；;]\s*重要场景由用户提供场景资产\s*[。．.]?/g,
    "",
  );
  // 兜底：标点写法不同的同句残片也整段删掉。
  out = out.replace(/场景不重要时用提示词描述[^。；;\n]*重要场景由用户提供场景资产[。．.]?/g, "");
  out = out
    .replace(/[；;，,、]{2,}/g, "；")
    .replace(/^[；;，,、\s]+/, "")
    .replace(/[；;，,、\s]+$/, "");
  return out;
}

const NOTE_LOOK_RE =
  /穿|戴|帽|发型|发色|头发|刘海|外貌|长相|墨镜|眼镜|胡子|寸头|短发|长发|卷发|马尾|身高|体型|纹身|耳环|项链|服装|上衣|衬衫|外套|裙|裤|鞋|造型/;
const NOTE_VOICE_RE = /音色|声音|嗓音|声线|男声|女声|童声/;
const NOTE_TONE_RE = /语气|性格|气质|基调|脾气|人设|话痨|话唠|外冷内热|e人|i人/;

/**
 * Extract 造型 / 音色 / 语气基调 from a character card's note text.
 * Labelled segments (“造型：…；音色：…；语气基调：…”) win; otherwise
 * clauses are classified by keyword (appearance → 造型， voice → 音色，
 * temperament → 语气基调）. Returns empty strings for anything the note
 * does not actually say.
 */
export function parseNoteMapping(note: string): {
  look: string;
  voice: string;
  tone: string;
} {
  const text = note ?? "";
  let look = "";
  let voice = "";
  let tone = "";
  const labelled = /(造型|音色|语气基调|语气)[:：]\s*([^；;。\n]+)/g;
  let m: RegExpExecArray | null;
  while ((m = labelled.exec(text)) !== null) {
    const label = m[1] ?? "";
    const val = (m[2] ?? "").trim();
    if (!val) continue;
    // Several labelled segments of the same kind accumulate (the note
    // is free text and may legitimately carry 造型 twice).
    if (label === "造型") look = look ? `${look}；${val}` : val;
    else if (label === "音色") voice = voice ? `${voice}；${val}` : val;
    else if (label === "语气基调" || label === "语气")
      tone = tone ? `${tone}；${val}` : val;
  }
  const rest = text.replace(
    /(造型|音色|语气基调|语气)[:：]\s*[^；;。\n]+/g,
    "",
  );
  const clauses = rest
    .split(/[；;。\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const looks: string[] = [];
  const voices: string[] = [];
  const tones: string[] = [];
  for (const c of clauses) {
    if (NOTE_VOICE_RE.test(c)) voices.push(c);
    else if (NOTE_LOOK_RE.test(c)) looks.push(c);
    else if (NOTE_TONE_RE.test(c)) tones.push(c);
  }
  if (!look && looks.length > 0) look = looks.join("；");
  if (!voice && voices.length > 0) voice = voices.join("；");
  if (!tone && tones.length > 0) tone = tones.join("；");
  if (!voice) {
    const vm = text.match(/[^\s；;，,。]{0,12}(?:男声|女声|童声)[^\s；;。]*/);
    if (vm) voice = vm[0].trim();
  }
  return { look, voice, tone };
}

/**
 * v5.45：造型分句的外观维度表——判断备注提炼分句与人物表造型是
 * 不是在说同一批维度（发型 / 脸 / 眼镜 / 体型 / 上衣 / 下装 / 鞋 /
 * 头饰 / 配饰 / 手持道具）。维度词只收造型文本里高频、无歧义的
 * 词；归不进任何维度的分句不参与新旧判定（照旧补入、不丢信息）。
 */
const LOOK_ASPECT_RES: readonly { key: string; re: RegExp }[] = [
  {
    key: "hair",
    re: /刘海|马尾|辫|寸头|短发|长发|卷发|直发|光头|发型|发色|盘发|头发|黑发|白发|金发|棕发|红发|染发|发尾|发梢|碎发|冲天发|齐肩|过肩|及肩|披肩/,
  },
  {
    key: "face",
    re: /脸|面部|面容|五官|脸型|颊|下颌|下巴|胡茬|胡子|眉|鼻|唇|妆|痣|雀斑|酒窝|大眼|眼睛|眼角/,
  },
  { key: "eyewear", re: /眼镜|墨镜|护目镜/ },
  { key: "body", re: /体型|身材|身高|体态|胖|瘦|壮|魁梧|高挑|娇小|圆润/ },
  {
    key: "top",
    re: /衬衫|T恤|上衣|外套|夹克|背心|毛衣|卫衣|制服|马甲|针织|开衫|西装|连衣裙|吊带|风衣|大衣|羽绒|长袖|短袖|衫/,
  },
  { key: "bottom", re: /裤|裙/ },
  { key: "footwear", re: /鞋|靴|拖鞋|凉鞋/ },
  { key: "headwear", re: /帽|发箍|发夹|头盔|头巾|发带/ },
  {
    key: "accessory",
    re: /耳钉|耳环|项链|手表|围巾|领带|领结|袖章|纹身|腰带|戒指|手链|徽章|袖标/,
  },
  {
    key: "prop",
    re: /捧|拎|手持|背着|抱着|瓶|盒|手机|书包|双肩包|扩音|喇叭|圆珠笔|计算器/,
  },
];

function lookAspectsOf(text: string): Set<string> {
  const out = new Set<string>();
  for (const a of LOOK_ASPECT_RES) if (a.re.test(text)) out.add(a.key);
  return out;
}

/** 人物表造型算「完整描述」的穿戴维度下限（发型/脸/体型/上下装…）。 */
const LOOK_FULL_WORN_MIN = 4;

const LOOK_DEMO_WORDS = [
  "小学生",
  "中学生",
  "高中生",
  "大学生",
  "未成年",
  "男孩",
  "女孩",
  "男童",
  "女童",
  "男子",
  "女子",
  "男人",
  "女人",
  "男性",
  "女性",
  "男生",
  "女生",
  "少年",
  "少女",
  "儿童",
  "成年",
  "中年",
  "青年",
  "老年",
  "年轻",
  "年长",
  "幼年",
  "壮硕",
  "少妇",
  "姑娘",
  "大叔",
  "阿姨",
  "小伙",
  "汉子",
  "男",
  "女",
  "岁",
];

/** 分句开头的小段是否纯年龄 / 性别信息（如「30-40岁男性」）。 */
function isDemographicSegment(seg: string): boolean {
  let s = (seg ?? "").replace(
    /[\d一二两三四五六七八九十\s\-~～、,，.·/名位个多]+/g,
    "",
  );
  if (!s) return false;
  for (const w of LOOK_DEMO_WORDS) s = s.split(w).join("");
  return s.length === 0;
}

/**
 * 剥掉分句开头的纯年龄 / 性别小段，剩下的才是可比对的外观内容；
 * 整句都是年龄 / 性别时返回空串。返回值只用于判定、不进输出
 * （输出恒用原分句）。
 */
function stripDemographicLead(clause: string): string {
  const segs = clause.split(/[，,、]/);
  let i = 0;
  while (
    i < segs.length - 1 &&
    isDemographicSegment((segs[i] ?? "").trim())
  ) {
    i++;
  }
  if (isDemographicSegment((segs[i] ?? "").trim())) return "";
  return segs.slice(i).join("，");
}

const LOOK_DEMO_SIGNAL_RE =
  /岁|男孩|女孩|男童|女童|男子|女子|男人|女人|男性|女性|少年|少女|中年|青年|成年|儿童|男生|女生/;

/**
 * v5.21 锁人①：冻结的 canonical 造型句。以人物表 characterRows.look
 * 全文为底（结构化字段、逐字为准），再补人物卡备注经关键词提炼出、
 * 人物表里没有的造型分句。旧口径造型只走备注关键词提炼：没有关
 * 键词的分句会被静默丢掉（如 E 的「双手捧红色长盒（内装人参状根
 * 状物）」），同一人物在每个镜头里的造型句因此残缺且随备注写法
 * 漂移。canonical 只由存量数据确定性拼出——同一项目同一人物，
 * 任何镜头、任何一次复制算出来都一字相同。人物表没有造型时回落
 * 备注提炼（与旧口径一致）。
 *
 * v5.45 替换口径（修「同步后新旧造型并存」）：v5.21 的补入是逐字
 * 去重的「只补不删」——人物在分镜页人物表改了造型（面板手改或
 * AI 分析填入）并点同步后，新造型写回人物表行，但人物卡备注没
 * 动，备注提炼出的旧分句与新造型逐字不同、去重拦不住，照旧拼在
 * 新造型后面，两句互相矛盾的造型同时进映射与说话人锁定行（项
 * 目 41 的 A：新造型蓝 T 金裤之后还跟着备注里的「圆脸微胖、白衬
 * 衫配黑领带、黑西裤」）。同步只写人物表行、从不改备注（备注还
 * 兼人物设定区六字段的存储），替换必须发生在拼装口径里：备注
 * 分句先剥开头的年龄 / 性别小段、再按外观维度与人物表造型比对
 * ——①人物表造型已是完整描述（穿戴维度 ≥4）时，穿戴类分句整体
 * 以人物表为准、不再补入（新造型写全了就是替换，没写的维度是
 * 有意不写）；只有带来人物表没有的手持道具 / 动作信息的分句
 * 仍整句补入（v5.21 救回的「常持绿色玻璃瓶与手机」这类签名道
 * 具不丢）。②人物表造型不完整时只补带来新维度的分句，维度全
 * 被人物表覆盖的分句是同一人的旧描述、不拼。③纯年龄 / 性别分
 * 句只在人物表没写年龄性别时补。④归不进任何维度的分句无法判
 * 定新旧，照旧补入（不丢信息）。逐字重复与身份分句的既有守卫
 * 不变；人物表为空仍回落备注提炼全文。
 */
export function canonicalLookOf(
  rowLook: string,
  parsedLook: string,
  identityText?: string,
): string {
  const clauses = (s: string) =>
    (s ?? "")
      .split(/[；;]+/)
      .map((x) => x.trim())
      .filter(Boolean);
  const base = clauses(rowLook);
  if (base.length === 0) return (parsedLook ?? "").trim();
  const seen = new Set(base);
  // 身份原文里的分句不是造型：备注提炼靠关键词匹配，「贯穿全片」
  // 会因「穿」误命中被当成造型分句（如 A 的「小学生，主角，妈妈
  // 的儿子，贯穿全片」）——与身份逐字相同的分句不补进造型句。
  const identity = (identityText ?? "").trim();
  const identityClauses = new Set(clauses(identity));
  const baseText = base.join("；");
  const rowAspects = lookAspectsOf(baseText);
  const rowFull =
    [...rowAspects].filter((a) => a !== "prop").length >=
    LOOK_FULL_WORN_MIN;
  let rowHasDemo = LOOK_DEMO_SIGNAL_RE.test(baseText);
  const out = [...base];
  for (const c of clauses(parsedLook)) {
    if (seen.has(c)) continue;
    if (identityClauses.has(c) || (identity && identity.includes(c))) {
      continue;
    }
    // v5.45：新旧判定（见上方口径）——旧描述分句不再拼到新造型后。
    const rest = stripDemographicLead(c);
    if (!rest) {
      // 纯年龄 / 性别分句：人物表已写就不重复，没写才补一条。
      if (rowHasDemo) continue;
      rowHasDemo = true;
      seen.add(c);
      out.push(c);
      continue;
    }
    const aspects = lookAspectsOf(rest);
    if (aspects.size === 0) {
      // 归不进任何外观维度：无法判定新旧，照旧补入、不丢信息。
      seen.add(c);
      out.push(c);
      continue;
    }
    const fresh = [...aspects].filter((a) => !rowAspects.has(a));
    if (rowFull) {
      // 完整造型整体替换：只有带来新手持道具 / 动作信息的分句补入。
      if (!fresh.includes("prop")) continue;
    } else if (fresh.length === 0) {
      // 不完整造型也只补新维度，全覆盖分句是旧描述。
      continue;
    }
    seen.add(c);
    out.push(c);
    for (const a of aspects) rowAspects.add(a);
  }
  return out.join("；");
}

/**
 * Resolve one character's mapping info: card note extraction first, the
 * storyboard-stage voice override (script.voiceMap) for 音色， then the
 * script's 人物表 row, then — for 语气基调 only — the distinct emotions
 * of that character's own lines. Missing pieces stay empty (callers
 * render 未填写）.
 * v5.21：造型改走 canonicalLookOf 冻结口径（人物表全文打底），并带
 * 上人物卡的稳定 characterId 与有无资产图（镜头包附图清单用）。
 */
export function resolveCharacterInfo(
  name: string,
  script: ScriptData,
  ctx?: LensMappingContext,
): LensMappingCharInfo {
  const key = name.trim();
  const card = (ctx?.characters ?? []).find((c) => c.name.trim() === key);
  const row = script.characterRows.find((r) => r.name.trim() === key);
  const parsed = card
    ? parseNoteMapping(card.note ?? "")
    : { look: "", voice: "", tone: "" };
  let emotionTone = "";
  if (!parsed.tone && !(row?.tone ?? "").trim()) {
    const emos: string[] = [];
    for (const g of script.groups) {
      for (const b of g.beats) {
        const e = b.emotion.trim();
        if (b.speaker.trim() === key && e && !emos.includes(e)) emos.push(e);
      }
    }
    emotionTone = emos.slice(0, 3).join("、");
  }
  const override = script.voiceMap?.[key]?.trim() ?? "";
  return {
    name: key,
    role: card?.role?.trim() || row?.identity?.trim() || "",
    look: canonicalLookOf(
      row?.look ?? "",
      parsed.look,
      row?.identity ?? card?.role ?? "",
    ),
    voice: override || parsed.voice || row?.voice?.trim() || "",
    tone: parsed.tone || row?.tone?.trim() || emotionTone || "",
    characterId: card?.id ?? null,
    hasImage: Boolean(card?.imageUrl),
  };
}

/** Every named character of the project, in card order then 人物表 order. */
export function collectAllCharacters(
  script: ScriptData,
  ctx?: LensMappingContext,
): LensMappingCharInfo[] {
  const names: string[] = [];
  const push = (n: string) => {
    const t = n.trim();
    if (t && !names.includes(t)) names.push(t);
  };
  for (const c of ctx?.characters ?? []) push(c.name);
  for (const r of script.characterRows) push(r.name);
  return names.map((n) => resolveCharacterInfo(n, script, ctx));
}

// ---------------------------------------------------------------------------
// v5.21 锁人②补层：家长称呼（身份第一段「X的妈妈」→ 妈妈）、亲属
// 关系链（小帅 = A）、「小X」昵称特征对位（小胖 = C）三层补在特征
// 提炼之前，且逐层回落——某层取到的名字被占用时继续试下一层，不
// 再整人清零（旧口径下 A/C 同为黑短发男孩：A 先占「短发男孩」，C
// 取到同名即被清空、裸代号出镜，B 也一直没名字）。
// v4.92 角色映射真名绑定：解剖项目的人物表按代号（A/B/C…）排列，但
// 台词里有人名（如 B 喊 A「小帅」），生成视频的模型读不懂人名指谁。
// 台词一字不动，只改映射：条目头由「A=造型：……」改为
// 「A（小帅）=造型：……」，角色块条目后加一行全项目的人物称呼对
// 照表。别名只从项目已有文本里按固定优先级提取、绝不编造新名字：
// ①身份里明确的人名 / 称呼（「窦老师」这类 X 老师、连写的「眼镜
// 男孩」）；②身份＋造型提炼（校长＋爸爸＝校长爸爸、长发＋女孩＝
// 长发女孩）；③梗概与台词 / 画面里对这个人物的称呼（候选名按
// 「谁的画面里反复出现这个名字」对位，如 A 的「小帅」）；④回落
// 身份里的职务称呼（班主任 / 宿管阿姨 / 教导主任 / 纪律委员 /
// 校医等，职务词后面紧跟「的」的是别人的职务、跳过）；四层都取
// 不到就不加括号、只写代号。只对代号式人物名（1–2 个英文字母）
// 启用：普通项目的人物名本身就是真名，映射与改版前逐字一致。
// ---------------------------------------------------------------------------

/** 人物名是代号（A / B / AB 这类）时才需要绑真名。 */
export function isCodeCharacterName(name: string): boolean {
  return /^[A-Za-z]{1,2}$/.test((name ?? "").trim());
}

function aliasIdentitySegments(identity: string): string[] {
  return (identity ?? "")
    .split(/[，,、；;。：:（）()「」【】\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 第①层：身份里现成的人名 / 称呼。 */
function aliasFromIdentity(info: LensMappingCharInfo): string {
  const identity = info.role ?? "";
  const segments = aliasIdentitySegments(identity);
  for (const seg of segments) {
    // 「窦老师」这类姓＋老师：整段 2–3 字、以老师结尾。
    if (/^[一-龥]{1,2}老师$/.test(seg)) return seg;
  }
  // v5.21：身份第一段就是「X的妈妈 / X的爸爸」时，本人就是那位
  // 家长——全片都喊他 / 她「妈妈 / 爸爸」，这就是本人的称呼（如
  // B 身份「小帅的妈妈，种萝卜的农妇」→ 妈妈）。旧口径职务层会把
  // 「X的妈妈」里的称呼判成别人的而跳过，家长因此一直没名字、
  // 复制文本里只剩裸代号。只认第一段整段命中，不认文中散落的。
  const first = segments[0] ?? "";
  const parent = first.match(/^[一-龥]{2,3}的(妈妈|爸爸)$/);
  if (parent?.[1]) return parent[1];
  // 连写的特征＋性别称呼（眼镜男孩 / 长发女孩…）。
  const compound = identity.match(/(眼镜|长发|短发|卷发)(男孩|女孩|男生|女生)/);
  if (compound) return compound[0] ?? "";
  return "";
}

/**
 * v5.21 第①.5层：亲属关系链对位。候选名出现在别人身份的「X的
 * 妈妈 / 爸爸」里（X 是那位家长的孩子），而本人身份明写「妈妈的
 * 儿子 / 女儿 / 孩子」（或爸爸）——X 就是本人。如 B 身份「小帅
 * 的妈妈」+ A 身份「妈妈的儿子」→ 小帅 = A。只认两端都明写的
 * 链，不猜：本人身份没有亲属自述、或没有任何家长身份提到候选
 * 名时，这一层不出结果。
 */
function aliasFromRelation(
  script: ScriptData,
  info: LensMappingCharInfo,
  all: LensMappingCharInfo[],
): string {
  const identity = info.role ?? "";
  for (const kin of ["妈妈", "爸爸"] as const) {
    if (!identity.includes(`${kin}的儿子`) && !identity.includes(`${kin}的女儿`) && !identity.includes(`${kin}的孩子`)) {
      continue;
    }
    for (const other of all) {
      if (other.name === info.name) continue;
      for (const m of (other.role ?? "").matchAll(
        /([一-龥]{2,3})的(?:妈妈|爸爸)/g,
      )) {
        const cand = (m[1] ?? "").trim();
        if (!cand || ALIAS_ADDRESS_STOPWORDS.has(cand)) continue;
        // 候选名必须确实是「那位家长的孩子」：提出候选名的身份本
        // 人得是家长（其身份里带这个亲属称谓指向孩子），且候选名
        // 后紧跟的正是当前核对的 kin 时才算同链。
        if ((other.role ?? "").includes(`${cand}的${kin}`)) return cand;
      }
    }
    // 梗概里「X的妈妈 / 爸爸」同链兜底（家长不在人物表时）。
    for (const m of (script.synopsis ?? "").matchAll(
      /([一-龥]{2,3})的(?:妈妈|爸爸)/g,
    )) {
      const cand = (m[1] ?? "").trim();
      if (cand && !ALIAS_ADDRESS_STOPWORDS.has(cand) && (script.synopsis ?? "").includes(`${cand}的${kin}`)) {
        return cand;
      }
    }
  }
  return "";
}

/**
 * v5.21 第①.6层：「小X / 老X」式昵称按特征字对位。候选名形如
 * 「小胖」（小/老 + 一个特征字）时，看全片人物里谁的身份 + 造型
 * 含这个特征字：全片只有一人命中且正是本人，才绑给本人（如
 * 「小胖」→ 特征字「胖」只在 C 的造型里出现 → 小胖 = C）。多人
 * 命中（如「小帅」的「帅」在 B/C/D 身份里都以「小帅的…」出现）
 * 不猜、跳过，交给关系链等其他层。
 */
function aliasFromNickname(
  info: LensMappingCharInfo,
  candidates: string[],
  all: LensMappingCharInfo[],
): string {
  for (const cand of candidates) {
    const m = cand.match(/^(?:小|老)([一-龥])$/);
    if (!m?.[1]) continue;
    const feature = m[1];
    // 先看造型：特征字只在一人的造型里出现就是硬证据（如「胖」
    // 只在 C 的造型里；E 的身份提到「胖男孩」是在指 C，不算 E
    // 的特征）。造型口径无人或多人命中时，再回落身份＋造型口径。
    const lookOwners = all.filter((c) =>
      (c.look ?? "").split(cand).join("").includes(feature),
    );
    if (lookOwners.length === 1 && lookOwners[0]?.name === info.name) {
      return cand;
    }
    if (lookOwners.length > 1) continue;
    const owners = all.filter((c) =>
      `${c.role ?? ""} ${c.look ?? ""}`.includes(feature),
    );
    // 特征字出现在候选名本身的关系表述里（「小帅的妈妈」里的帅）
    // 不算本人的特征：命中者若其命中只来自「候选名的X」这种他指
    // 表述，剔除后再判唯一。
    const realOwners = owners.filter((c) => {
      const text = `${c.role ?? ""} ${c.look ?? ""}`;
      const stripped = text.split(cand).join("");
      return stripped.includes(feature);
    });
    if (realOwners.length === 1 && realOwners[0]?.name === info.name) {
      return cand;
    }
  }
  return "";
}

/** 第②层：身份＋造型提炼称呼。 */
function aliasFromCompose(info: LensMappingCharInfo): string {
  const identity = info.role ?? "";
  const look = info.look ?? "";
  // 职业＋爸爸 / 妈妈（校长爸爸）：职务词与亲属词都出现在身份里。
  for (const kin of ["爸爸", "妈妈"]) {
    if (!identity.includes(kin)) continue;
    for (const job of [
      "校长",
      "园长",
      "主任",
      "村长",
      "厂长",
      "老板",
      "教练",
      "队长",
      "老师",
    ]) {
      if (identity.includes(job)) return `${job}${kin}`;
    }
  }
  // 特征＋性别：特征与性别词在身份＋造型里各取第一个命中的。
  const text = `${identity} ${look}`;
  const gender = text.match(/女孩|男孩|女生|男生/)?.[0] ?? "";
  if (gender) {
    for (const f of ["眼镜", "长发", "卷发", "短发", "麻花辫", "双马尾"]) {
      if (text.includes(f)) return `${f}${gender}`;
    }
  }
  return "";
}

/** 第③层的停用词：长得像名字、其实不是人名的话。 */
const ALIAS_ADDRESS_STOPWORDS = new Set([
  "老师", "大家", "你们", "我们", "他们", "同学", "同学们", "学生",
  "一个个", "最好", "明天", "昨天", "今天", "现在", "作业", "家长",
  "校长", "手机", "书包", "理由", "肯定", "平时", "儿子", "女儿",
  "情况", "身份", "主角", "龙套", "配角", "女孩", "男孩", "女生",
  "男生", "女同学", "男同学", "小学生", "中学生", "大学生", "青年",
  "男性", "女性", "男人", "女人", "同桌", "爸爸", "妈妈",
]);

/**
 * 第③层的候选名：梗概与台词里出现在「喊人位」（句首 / 那X， /
 * ，X，）或「关系位」（X的爸爸 / 妈妈 / 儿子 / 女儿 / 同桌 /
 * 同学）的 2–3 字词，外加各人物身份里的关系位。X老师型称呼不在
 * 这一层猜归属（只认第①层身份字段），避免把老师的名字安给学生。
 */
function aliasAddressCandidates(script: ScriptData): string[] {
  const found: string[] = [];
  const push = (raw: string) => {
    const t = (raw ?? "").trim();
    if (t.length < 2 || t.length > 3) return;
    if (ALIAS_ADDRESS_STOPWORDS.has(t)) return;
    if (/老师$/.test(t)) return;
    if (!found.includes(t)) found.push(t);
  };
  const scan = (text: string) => {
    for (const m of text.matchAll(
      /(?:^|那|，|、|：|:)([一-龥]{2,3})(?=，|，你)/g,
    )) {
      push(m[1] ?? "");
    }
    for (const m of text.matchAll(
      /([一-龥]{2,3})的(?:爸爸|妈妈|儿子|女儿|同桌|同学)/g,
    )) {
      push(m[1] ?? "");
    }
  };
  scan(script.synopsis ?? "");
  // v5.26 去重：节拍只扫一份来源（分镜阶段以 storyboardGroups 为
  // 准，与 storyboardScript 同口径）。旧写法把 groups 与
  // storyboardGroups 拼起来扫，同一拍的台词被扫两遍——候选集本身
  // 靠 push 去重不受影响，但与第③层对位的双倍计数同源，一并收敛。
  const groups = storyboardScript(script).groups;
  for (const g of groups) {
    for (const b of g.beats) scan(b.line ?? "");
  }
  for (const r of script.characterRows) scan(r.identity ?? "");
  return found;
}

/**
 * 画面里是否真的出现了候选名本身：候选名只是更长职务词的前缀时
 * （「老板」之于「老板娘」），画面里写的其实是那个更长的称呼、
 * 不是候选名——先把更长的职务词整段抹掉再判，免得子串误命中把
 * 别人的称呼记到本人头上（项目 40：导游对「老板娘」说话的一拍，
 * 旧口径把「老板」记给了导游）。
 */
function aliasVisualMentions(visual: string, cand: string): boolean {
  let v = visual ?? "";
  for (const t of ALIAS_TITLE_WORDS) {
    if (t.length > cand.length && t.startsWith(cand)) {
      v = v.split(t).join("");
    }
  }
  return v.includes(cand);
}

/**
 * v5.72 专名登记：每个人物「自己的名字」——①身份第一段就是绰号 /
 * 专名本名时整段就是（如 G 的身份「钢铁胖，穿钢铁侠铠甲…」第一
 * 段「钢铁胖」）；②本人在自己台词里自报的名字（「我是X」「我叫
 * X」）。登记过的名字只属于登记人：第③层对位永远不许把它判给别
 * 人，出口校验（aliasGateCheck）也按这份登记拦截。这是项目 43
 * 错位的根源修复——旧口径里「钢铁胖」没有任何一层认作 G 的专
 * 名，F 训斥 G 的两拍画面里都写了「钢铁胖」，第③层按出现次数
 * 把它判给了先到先得的 F。
 */
const ALIAS_HEAD_GENERIC = new Set([
  "村民", "女性", "男性", "青年", "少年", "少女", "老人", "老奶奶",
  "老爷爷", "奶奶", "爷爷", "大爷", "大妈", "导游", "学生", "老师",
  "孩子", "小孩", "男人", "女人", "主角", "村民组", "路人",
]);

/** 身份第一段（顿号 / 逗号 / 分号切分的第一段）原文。 */
function aliasIdentityHead(identity: string): string {
  return (identity ?? "").split(/[，,、；;。]/)[0]?.trim() ?? "";
}

/** 身份第一段是不是一个可登记的专名（2–4 字纯汉字、无「的」、
 * 不是泛称、不是停用词）。v5.72 回归收紧：首段是「泛称＋职务 /
 * 人口词」的描述短语时不是专名——先剥掉人口 / 机构类泛称词
 * （学校 / 青年 / 男性…），剥完为空、或只剩一个职务词（如「学
 * 校校长」剥完剩「校长」、「青年男性」剥完为空）就不登记，交
 * 给后面的提炼 / 职务层按旧口径取名（项目 38 的 C 仍是校长爸
 * 爸、项目 39 的 E 仍是校长）；「钢铁胖」「白须爷爷」「骑车大
 * 爷」这类带独特修饰的首段剥完仍有独特内容，照常登记。 */
const ALIAS_HEAD_GENERIC_TOKENS = [
  "学校", "青年", "成年", "中年", "老年", "少年", "男性", "女性",
  "男人", "女人", "男孩", "女孩", "男生", "女生", "小学生",
  "中学生", "大学生", "儿童",
];

function aliasHeadProperName(info: LensMappingCharInfo): string {
  const head = aliasIdentityHead(info.role ?? "");
  if (head.length < 2 || head.length > 4) return "";
  if (!/^[一-龥]+$/.test(head)) return "";
  if (head.includes("的")) return "";
  if (ALIAS_HEAD_GENERIC.has(head)) return "";
  if (ALIAS_ADDRESS_STOPWORDS.has(head)) return "";
  if (/老师$/.test(head)) return "";
  let rest = head;
  for (const t of ALIAS_HEAD_GENERIC_TOKENS) {
    rest = rest.split(t).join("");
  }
  if (!rest) return "";
  if (rest !== head && ALIAS_TITLE_WORDS.includes(rest)) return "";
  // 职务词表在本函数之后才声明，运行时调用时已完成模块求值。
  return head;
}

/** 全片专名登记表：名字 → 拥有者代号。先登记者优先，撞名时后
 * 来者不登记（出口校验会再拦一道）。 */
export function claimedAliasNames(
  script: ScriptData,
  chars: LensMappingCharInfo[],
): Map<string, string> {
  const claimed = new Map<string, string>();
  const claim = (name: string, code: string) => {
    const t = (name ?? "").trim();
    if (t && !claimed.has(t)) claimed.set(t, code);
  };
  for (const c of chars) {
    const head = aliasHeadProperName(c);
    if (head) claim(head, c.name);
    if (!isCodeCharacterName(c.name)) claim(c.name, c.name);
  }
  // 本人台词自报（「我是X / 我叫X」）：只认说话人本人的节拍。
  const groups = storyboardScript(script).groups;
  for (const c of chars) {
    for (const g of groups) {
      for (const b of g.beats) {
        if ((b.speaker ?? "").trim() !== c.name) continue;
        for (const m of (b.line ?? "").matchAll(
          /(?:我是|我叫|俺是|咱是)([一-龥]{2,4})/g,
        )) {
          const cand = (m[1] ?? "").trim();
          if (cand && !ALIAS_ADDRESS_STOPWORDS.has(cand)) {
            claim(cand, c.name);
          }
        }
      }
    }
  }
  return claimed;
}

/** 第⓪层（v5.72 最高优先）：身份第一段就是本人的绰号 / 专名时
 * 直接认作本人的别名（如「钢铁胖，…」→ 钢铁胖 = G）。 */
function aliasFromIdentityHead(
  info: LensMappingCharInfo,
  claimed: Map<string, string>,
): string {
  const head = aliasHeadProperName(info);
  if (!head) return "";
  const owner = claimed.get(head);
  if (owner && owner !== info.name) return "";
  return head;
}

/**
 * 第③层对位：候选名归给「自己的节拍画面里最常出现这个名字」的人
 * （解剖分镜的画面描述用真名写人，如「小帅特写」）。至少出现 2 次
 * 才算数，单次出现不猜；已被别人占用的名字跳过。
 * v5.26 去重：节拍只扫一份来源（storyboardScript 口径）。旧写法
 * 把 groups 与 storyboardGroups 拼起来数，同一拍算两遍——项目 40
 * 里导游只有 1 拍画面带「老板」（还是「老板娘」的子串误命中），
 * 双算凑够 2 次把 D 的称呼误占了。
 * v5.72 专名排除：候选名只要登记在别人名下（身份第一段专名 /
 * 本人台词自报），本层直接跳过——画面里出现别人的名字（喊话、
 * 训斥、群像顺带提到）永远不算把这个名字判给当前人的证据。
 */
function aliasFromAddress(
  script: ScriptData,
  info: LensMappingCharInfo,
  candidates: string[],
  taken: Set<string>,
  claimed: Map<string, string>,
): string {
  const groups = storyboardScript(script).groups;
  let best = "";
  let bestScore = 0;
  for (const cand of candidates) {
    if (taken.has(cand)) continue;
    const owner = claimed.get(cand);
    if (owner && owner !== info.name) continue;
    let score = 0;
    for (const g of groups) {
      for (const b of g.beats) {
        if (
          (b.speaker ?? "").trim() === info.name &&
          aliasVisualMentions(b.visual ?? "", cand)
        ) {
          score += 1;
        }
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = cand;
    }
  }
  return bestScore >= 2 ? best : "";
}

const ALIAS_TITLE_WORDS = [
  "教导主任", "纪律委员", "宿管阿姨", "班主任", "校医", "校长",
  "园长", "主任", "班长", "学习委员", "体育委员", "组长", "队长",
  "医生", "护士", "老师", "保安", "门卫", "警察", "村长", "老板娘",
  "老板", "店长", "教练", "服务员", "司机", "厨师",
  // v5.72 补词：长词在前（「老奶奶」先于「奶奶」），让甘蔗林老奶
  // 奶这类人物在职务层就能拿到自己的称呼，不必掉进第③层称呼对
  // 位里跟别人抢名字（项目 43 的 F）。
  "老奶奶", "老爷爷", "奶奶", "爷爷", "大爷", "大妈", "导游", "村民",
];

/** 第④层：回落身份里的职务称呼（整段命中优先，其次文中命中）。
 * 文中命中按词表顺序取第一个：长词排在短词前（「老板娘」在
 * 「老板」之前），身份写「老板娘」时整词优先，不被子串截断。 */
function aliasFromTitle(info: LensMappingCharInfo): string {
  const identity = info.role ?? "";
  const segments = aliasIdentitySegments(identity);
  for (const seg of segments) {
    if (ALIAS_TITLE_WORDS.includes(seg)) return seg;
  }
  for (const t of ALIAS_TITLE_WORDS) {
    const idx = identity.indexOf(t);
    if (idx < 0) continue;
    // 「校长的儿子」里校长是别人的职务，不是本人的称呼，跳过。
    if (identity[idx + t.length] === "的") continue;
    return t;
  }
  return "";
}

export interface CharacterAliasPair {
  code: string;
  alias: string;
  /** v5.72：这个别名是哪一步定下来的（面板展示用）。 */
  source?: string;
}

/** v5.72 出口校验拦下的一条：哪位人物的哪个别名因为什么被拦。 */
export interface AliasGateIssue {
  code: string;
  alias: string;
  reason: string;
}

export interface CharacterAliasReport {
  pairs: CharacterAliasPair[];
  issues: AliasGateIssue[];
}

/**
 * v5.72 出口校验（守门员）：所有提示词出口共用 projectCharacter-
 * Aliases 这一把锁——别名在离开推导层之前逐条断言：
 *   ① 别名不得等于另一位人物的专名（身份第一段专名 / 台词自报
 *      名 / 非代号人物的本名）；
 *   ② 同一个别名不得绑给两个人（先到者保留，后来者拦下）；
 *   ③ 别名不得等于人物自己的代号。
 * 断言不过的别名整条拦下、该人物退回裸代号输出，并记一条 issue
 * 供分镜页标红提示——宁可不带别名，也绝不发错别名。手动钉死的
 * 别名同样过这道校验（钉死的是「以我填的为准」，不是「错的也
 * 发」）。
 */
function aliasGateCheck(
  pairs: CharacterAliasPair[],
  claimed: Map<string, string>,
): AliasGateIssue[] {
  const issues: AliasGateIssue[] = [];
  const seen = new Map<string, string>();
  for (const p of pairs) {
    if (!p.alias) continue;
    const owner = claimed.get(p.alias);
    if (owner && owner !== p.code) {
      issues.push({
        code: p.code,
        alias: p.alias,
        reason: `这个名字是 ${owner} 的专名（身份 / 台词自报），不能绑给 ${p.code}，已拦下、只发裸代号。`,
      });
      p.alias = "";
      continue;
    }
    if (p.alias === p.code) {
      issues.push({
        code: p.code,
        alias: p.alias,
        reason: "别名和代号相同，已拦下。",
      });
      p.alias = "";
      continue;
    }
    const first = seen.get(p.alias);
    if (first && first !== p.code) {
      issues.push({
        code: p.code,
        alias: p.alias,
        reason: `这个别名已经绑给 ${first}，两个人不能共用一个名字，已拦下、只发裸代号。`,
      });
      p.alias = "";
      continue;
    }
    seen.set(p.alias, p.code);
  }
  return issues;
}

/**
 * 全项目人物的真名绑定（代号序＝人物卡序＋人物表序）：逐人按层
 * 级优先级取别名，同一别名只绑给第一个取到的人（后面的人退回无
 * 别名，不抢名）。非代号式人物名 alias 恒为空字符串。
 * v5.72：新增第⓪层「身份首段专名」最高优先；第③层排除他人专
 * 名；全部结果最后过 aliasGateCheck 出口校验；script.aliasOver-
 * rides 里手动钉死的人物跳过推导直接用钉死值（仍过校验）。
 */
export function projectCharacterAliasReport(
  script: ScriptData,
  ctx?: LensMappingContext,
): CharacterAliasReport {
  const chars = collectAllCharacters(script, ctx);
  const candidates = aliasAddressCandidates(script);
  const claimed = claimedAliasNames(script, chars);
  const taken = new Set<string>();
  const overrides = script.aliasOverrides ?? {};
  const pairs: CharacterAliasPair[] = chars.map((c) => {
    if (
      isCodeCharacterName(c.name) &&
      Object.prototype.hasOwnProperty.call(overrides, c.name)
    ) {
      const pinned = (overrides[c.name] ?? "").trim();
      if (pinned) taken.add(pinned);
      return { code: c.name, alias: pinned, source: "手动钉死" };
    }
    let alias = "";
    let source = "";
    if (isCodeCharacterName(c.name)) {
      // v5.21：逐层往下试，某层取到的名字已被别人占用时不再整人
      // 清空、继续试下一层（旧口径：A 先占「短发男孩」后，C 在特
      // 征层取到同名就被整人清零、后面的台词层 / 关系层都没机会，
      // C 因此一直裸代号）。新增两层排在特征提炼之前：①.5 亲属
      // 关系链（小帅 = A）、①.6「小X」昵称特征对位（小胖 = C）——
      // 真名 / 昵称优先于「短发男孩」这类描述性提炼，描述撞名时
      // 后来者继续往下找自己的真名。
      // v5.72：第⓪层「身份首段专名」排在所有层之前（钢铁胖 = G）。
      const layers: { name: string; run: () => string }[] = [
        { name: "身份首段专名", run: () => aliasFromIdentityHead(c, claimed) },
        { name: "身份现成称呼", run: () => aliasFromIdentity(c) },
        { name: "亲属关系链", run: () => aliasFromRelation(script, c, chars) },
        { name: "昵称特征对位", run: () => aliasFromNickname(c, candidates, chars) },
        { name: "身份提炼", run: () => aliasFromCompose(c) },
        {
          name: "台词称呼对位",
          run: () => aliasFromAddress(script, c, candidates, taken, claimed),
        },
        { name: "职务称呼", run: () => aliasFromTitle(c) },
      ];
      for (const layer of layers) {
        const cand = layer.run();
        if (cand && cand !== c.name && !taken.has(cand)) {
          alias = cand;
          source = layer.name;
          break;
        }
      }
      if (alias) taken.add(alias);
    }
    return { code: c.name, alias, source };
  });
  const issues = aliasGateCheck(pairs, claimed);
  return { pairs, issues };
}

export function projectCharacterAliases(
  script: ScriptData,
  ctx?: LensMappingContext,
): CharacterAliasPair[] {
  return projectCharacterAliasReport(script, ctx).pairs;
}

/**
 * 人物称呼对照表行（用户逐字定稿格式）：只列取到别名的人物、按
 * 代号顺序；一个别名都没取到时整行不出现（返回空字符串）。
 */
export function characterAliasTableLine(
  pairs: CharacterAliasPair[],
): string {
  const named = pairs.filter((p) => p.alias);
  if (named.length === 0) return "";
  return `人物称呼对照：${named
    .map((p) => `${p.alias}=${p.code}`)
    .join("；")}。台词中出现的人名均指代号对应的人物，不得另起新人。`;
}

/** 条目头里的人物标签：有别名写「A（小帅）」，没有只写代号。 */
function characterMappingLabel(code: string, alias: string): string {
  return alias ? `${code}（${alias}）` : code;
}

// ---------------------------------------------------------------------------
// v5.21 锁人②：画面称呼对位——把画面描述里的绰号 / 描述词（红衣男
// 孩、胖男孩、黄衣妈妈、玩偶、三人、四人…）在复制 / 导出文本里换
// 成人物标签「代号（真名）」，让模型不用再猜谁是谁。存量剧本数据
// 一字不改，只在拼装复制文本时转换；推导全部来自项目已有数据
// （别名、身份、canonical 造型），认不准的绝不替换：
//   · 强描述词：别名 / 本名、「胖+性别词」、「颜色衣+性别词 / 别
//     名」、玩偶系全套——从身份 + 造型里确定性拼出，命中即认定。
//   · 弱描述词：裸性别词（「女孩」「小女孩」）——只有该性别词全
//     片唯一一位人物时才启用（两个男孩时「男孩」指谁都说不准，
//     不启用、不替换）。
//   · 集体名词（「三人」「三名小孩」「两名男孩」）：按本拍在场
//     人物集合（画面里真被点名 / 描写的 + 从上一镜头同场景结尾
//     承接的）核对人数，人数恰好对上才展开成逐人标签；对不上
//     原样保留，绝不猜人。
// ---------------------------------------------------------------------------

export interface CharacterVisualDescriptor {
  code: string;
  alias: string;
  label: string;
  strong: string[];
  weak: string[];
  /** "男" / "女" / ""（身份 + 造型里第一个性别词归一）。 */
  gender: string;
  isChild: boolean;
  /**
   * v5.27：这个代号实际代表几个人（群像人物如「以大伯、二舅为首
   * 的三人组」= 3，其余 = 1）。只从本人身份 / 造型里明写的「N 人
   * 组」「N 名青年男子」这类自述提炼，提炼不出按 1 算。集体名词
   * 展开时按它核对人数（「三名热心村民」对上的正是这一个代号）。
   */
  groupSize: number;
  /** v5.27：本人就是村民（身份 / 造型里明写村民），供「N 名村民」类集体名词对位。 */
  isVillager: boolean;
}

/** v5.27：代号实际代表的人数（见 CharacterVisualDescriptor.groupSize）。 */
function descriptorGroupSize(info: LensMappingCharInfo): number {
  const text = `${info.role ?? ""} ${info.look ?? ""}`;
  const m = text.match(
    /([二两三四五六七八九]|\d+)\s*(?:人组|名(?:壮硕|年轻|中年|老年)?(?:青年|男子|女子|男人|女人))/,
  );
  if (!m?.[1]) return 1;
  const n = COLLECTIVE_NUMERALS[m[1]] ?? Number.parseInt(m[1], 10);
  return Number.isFinite(n) && n >= 2 ? n : 1;
}

/**
 * v5.27：本人职务 / 亲属称呼类描述词的候选词表——别名推导的职务
 * 词表（ALIAS_TITLE_WORDS）之外补三类：导游（职务词表里原本没有，
 * 而画面最常拿它写导游本人，如项目 40 的 C：没别名、又没有任何
 * 强描述词，画面里写「导游举喇叭」时认不出是他）；村民类；亲属
 * 称呼（群像人物的成员称呼，如 E 的「二舅」——E 的别名只取到
 * 「大伯」，画面写「二舅特写」时同样认不出）。
 */
const DERIVED_DESCRIPTOR_WORDS: string[] = [
  ...ALIAS_TITLE_WORDS,
  "导游",
  "热心村民",
  "村民",
  "大伯",
  "二舅",
  "三舅",
  "大舅",
  "小姨",
  "大姨",
  "舅舅",
  "叔叔",
  "伯伯",
  "婶婶",
  "姑姑",
  "大爷",
  "大妈",
  "奶奶",
  "爷爷",
  "外公",
  "外婆",
];

/**
 * v5.27：从「本人文本」里提炼职务 / 亲属称呼类描述词候选。范围严
 * 格限定本人：身份第一段（后面的段常在讲别人——A 的身份第三段
 * 「小姨、大伯、二舅都是亲戚」写的是他的亲戚，不是他本人）+ 造
 * 型全文；群像人物（groupSize > 1）再加身份全文（成员称呼就是
 * 这个「人物」自己的一部分）。长词先消费（「热心村民」先于「村
 * 民」、「老板娘」先于「老板」），命中「热心村民」时泛称「村民」
 * 一并收（画面常只写「村民在身后」）；服装色 + 背心（「黑背心」）
 * 只在颜色与背心在造型里挨得近时提。候选是否最终启用，由
 * characterVisualDescriptors 里的无歧义守卫决定（同一词被两人以
 * 上推出 = 有歧义，整词丢弃、谁都不绑——如项目 40 里 C 与 E 都
 * 穿黑背心，「黑背心」就不绑任何人，靠导游 / 二舅认人）。
 */
function derivedSelfDescriptorWords(info: LensMappingCharInfo): string[] {
  const role = info.role ?? "";
  const look = info.look ?? "";
  const firstSeg = aliasIdentitySegments(role)[0] ?? "";
  let scope = `${firstSeg} ${look}`;
  if (descriptorGroupSize(info) > 1) scope = `${role} ${look}`;
  const found: string[] = [];
  let rest = scope;
  const words = [...DERIVED_DESCRIPTOR_WORDS].sort(
    (a, b) => b.length - a.length,
  );
  for (const w of words) {
    if (!w || !rest.includes(w)) continue;
    found.push(w);
    rest = rest.split(w).join("");
    if (w === "热心村民" && !found.includes("村民")) found.push("村民");
  }
  for (const color of clothingColorsOf(look)) {
    const re = new RegExp(`${color}[^。；，、]{0,6}背心`);
    if (re.test(look)) {
      const w = `${color}背心`;
      if (!found.includes(w)) found.push(w);
    }
  }
  return found;
}

function descriptorGenderWord(info: LensMappingCharInfo): string {
  // 只认本人造型里的性别词，其次身份第一段（本人身份的开头）：
  // 身份后段常提到别人（E 的身份写「据胖男孩61s称呼」），拿全段
  // 匹配会把别人的性别安到本人头上。
  const fromLook = (info.look ?? "").match(/男孩|男生|女孩|女生/)?.[0];
  if (fromLook) return fromLook;
  const firstClause = (info.role ?? "").split(/[；;，,]/)[0] ?? "";
  return firstClause.match(/男孩|男生|女孩|女生/)?.[0] ?? "";
}

function descriptorIsChild(info: LensMappingCharInfo): boolean {
  const t = `${info.role ?? ""} ${info.look ?? ""}`;
  if (/小学生|中学生|儿童|小孩/.test(t)) return true;
  const range = t.match(/(\d{1,2})\s*(?:-|~|～|到)\s*(\d{1,2})\s*岁/);
  if (range?.[2]) return Number(range[2]) <= 17;
  const single = t.match(/(\d{1,2})\s*岁/);
  if (single?.[1]) return Number(single[1]) <= 17;
  return false;
}

/** 造型里「颜色 + 衣物」的颜色字（红背心 / 黄色…T恤 / 蓝制服…）。 */
function clothingColorsOf(look: string): string[] {
  const colors: string[] = [];
  for (const color of ["红", "黄", "蓝", "白", "黑", "绿", "紫", "粉", "灰", "橙"]) {
    const re = new RegExp(
      `${color}[^。；，、]{0,12}(?:背心|T恤|上衣|外套|衬衫|毛衣|裙|裤|大衣|制服|校服|连衣裙)`,
    );
    if (re.test(look ?? "")) colors.push(color);
  }
  return colors;
}

/** 全片人物的画面描述词表（见本段头注）。 */
export function characterVisualDescriptors(
  script: ScriptData,
  ctx?: LensMappingContext,
): CharacterVisualDescriptor[] {
  const chars = collectAllCharacters(script, ctx);
  const aliasByCode = new Map(
    projectCharacterAliases(script, ctx).map((p) => [p.code, p.alias]),
  );
  const genderCount = new Map<string, number>();
  for (const c of chars) {
    const g = descriptorGenderWord(c);
    if (g) genderCount.set(g, (genderCount.get(g) ?? 0) + 1);
  }
  // v5.27：职务 / 亲属称呼类描述词（导游、二舅、热心村民…）先逐人
  // 提候选，再过无歧义守卫——同一词被两人以上推出说明画面里写这
  // 个词时指谁都说不准，整词丢弃、谁都不绑（与弱描述词「全片唯
  // 一才启用」同一原则）。守卫只作用于这批新词，既有强描述词
  // （别名 / 胖 + 性别词 / 颜色衣…）口径一字未动。
  const derivedByCode = new Map<string, string[]>();
  {
    const perChar = chars.map((c) => ({
      code: c.name,
      words: derivedSelfDescriptorWords(c),
    }));
    const counts = new Map<string, number>();
    for (const p of perChar) {
      for (const w of p.words) counts.set(w, (counts.get(w) ?? 0) + 1);
    }
    for (const p of perChar) {
      derivedByCode.set(
        p.code,
        p.words.filter((w) => (counts.get(w) ?? 0) === 1),
      );
    }
  }
  return chars.map((c) => {
    const alias = aliasByCode.get(c.name) ?? "";
    const text = `${c.role ?? ""} ${c.look ?? ""}`;
    const genderWord = descriptorGenderWord(c);
    const strong: string[] = [];
    const push = (d: string) => {
      const t = (d ?? "").trim();
      if (t.length >= 2 && !strong.includes(t)) strong.push(t);
    };
    if (alias) push(alias);
    if (!isCodeCharacterName(c.name)) push(c.name);
    for (const w of derivedByCode.get(c.name) ?? []) push(w);
    // 玩偶系称呼只给「本人就是玩偶形态」的人：造型是袋鼠 / 身份
    // 或造型明说玩偶形象、玩偶造型。配饰上的小玩偶（B 发箍上的
    // 小熊玩偶）不算——否则画面里写「玩偶」时会错绑到配饰主人。
    const dollForm =
      (c.look ?? "").includes("袋鼠") ||
      /玩偶(?:形象|造型)/.test(text) ||
      /(?:形象|造型)[^。；]{0,10}玩偶/.test(text);
    if (dollForm) {
      if (text.includes("袋鼠")) {
        push("黄色袋鼠玩偶");
        push("袋鼠玩偶");
      }
      push("黄色玩偶");
      push("玩偶");
      if (text.includes("袋鼠")) push("袋鼠");
    }
    // 「胖」只认本人造型（身份里提到别人胖不算，如 E 身份里的
    // 「胖男孩」指的是 C）。
    if ((c.look ?? "").includes("胖") && genderWord) push(`胖${genderWord}`);
    for (const color of clothingColorsOf(c.look ?? "")) {
      if (genderWord) push(`${color}衣${genderWord}`);
      if (alias) push(`${color}衣${alias}`);
    }
    const weak: string[] = [];
    if (genderWord && (genderCount.get(genderWord) ?? 0) === 1) {
      weak.push(genderWord, `小${genderWord}`);
    }
    return {
      code: c.name,
      alias,
      label: characterMappingLabel(c.name, alias),
      strong,
      weak,
      gender:
        genderWord === "男孩" || genderWord === "男生"
          ? "男"
          : genderWord === "女孩" || genderWord === "女生"
            ? "女"
            : "",
      isChild: descriptorIsChild(c),
      groupSize: descriptorGroupSize(c),
      isVillager: text.includes("村民"),
    };
  });
}

/** 一段画面里被点名 / 描写到的人物代号（强弱描述词任一命中）。 */
function visualRefCodes(
  visual: string,
  descriptors: CharacterVisualDescriptor[],
): Set<string> {
  const out = new Set<string>();
  const v = visual ?? "";
  if (!v) return out;
  for (const d of descriptors) {
    if (
      d.strong.some((w) => v.includes(w)) ||
      d.weak.some((w) => v.includes(w))
    ) {
      out.add(d.code);
    }
  }
  return out;
}

/** 画面里写明离场的人物（描述词命中且同段画面出现「离场」）。 */
function visualRemovedCodes(
  visual: string,
  descriptors: CharacterVisualDescriptor[],
): Set<string> {
  const out = new Set<string>();
  const v = visual ?? "";
  if (!v.includes("离场")) return out;
  for (const d of descriptors) {
    if (
      d.strong.some((w) => v.includes(w)) ||
      d.weak.some((w) => v.includes(w))
    ) {
      out.add(d.code);
    }
  }
  return out;
}

/** 一个分镜组最后一个场景段（以「场景转场」切镜依据分段）结尾时
 * 画面在场的人物集合（只按画面点名累计，离场剔除）。 */
function segmentFinalCast(
  beats: Beat[],
  descriptors: CharacterVisualDescriptor[],
): string[] {
  let start = 0;
  beats.forEach((b, i) => {
    if (i > 0 && (b.cutReason ?? "") === "场景转场") start = i;
  });
  const set = new Set<string>();
  for (let i = start; i < beats.length; i++) {
    const b = beats[i];
    if (!b) continue;
    for (const code of visualRefCodes(b.visual ?? "", descriptors)) {
      set.add(code);
    }
    for (const code of visualRemovedCodes(b.visual ?? "", descriptors)) {
      set.delete(code);
    }
  }
  return [...set];
}

export interface LensScreenCast {
  /** 本镜头内到本拍为止、画面里真被点名 / 描写过的人物（离场已剔除）。 */
  confirmed: string[];
  /** confirmed + 从上一镜头同场景结尾承接过来的人物（离场已剔除）。 */
  inclusive: string[];
}

/**
 * 逐拍在场人物集合：confirmed 只认本镜头画面点名；inclusive 再加
 * 上一镜头最后一个场景段结尾的在场人物（两镜头共用场景名时才承
 * 接——同一拨人接着演）。说话人不直接算在场（电话 / 画外音的人
 * 不在画面里），只认画面点名。
 */
export function lensScreenCasts(
  script: ScriptData,
  groupIndex: number,
  ctx?: LensMappingContext,
): LensScreenCast[] {
  const tl = computeTimeline(script);
  const group = tl.groups[groupIndex];
  if (!group) return [];
  const descriptors = characterVisualDescriptors(script, ctx);
  const inclusive = new Set<string>();
  if (groupIndex > 0) {
    const prev = tl.groups[groupIndex - 1];
    if (prev) {
      const prevScenes = new Set(
        prev.sceneName
          .split("/")
          .map((s) => s.trim())
          .filter(Boolean),
      );
      const sharesScene = group.sceneName
        .split("/")
        .map((s) => s.trim())
        .some((s) => s && prevScenes.has(s));
      if (sharesScene) {
        for (const code of segmentFinalCast(prev.beats, descriptors)) {
          inclusive.add(code);
        }
      }
    }
  }
  const confirmed = new Set<string>();
  return group.beats.map((b) => {
    const refs = visualRefCodes(b.visual ?? "", descriptors);
    const removed = visualRemovedCodes(b.visual ?? "", descriptors);
    for (const code of refs) {
      confirmed.add(code);
      inclusive.add(code);
    }
    for (const code of removed) {
      confirmed.delete(code);
      inclusive.delete(code);
    }
    return { confirmed: [...confirmed], inclusive: [...inclusive] };
  });
}

const COLLECTIVE_NUMERALS: Record<string, number> = {
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};

// v5.27：种类词补「孩子 / 儿童 / 村民（含热心村民）」——项目 40 的
// 画面实际就用「两个孩子」「四个孩子」「三名热心村民」写人，旧词
// 表只有「小孩」一种说法，这些集体词永远展不开，只在画面里出现
// 的人进不了映射、复制文本里也原样留着裸集体词让模型猜。
const COLLECTIVE_RE =
  /([二两三四五六七八九]|\d+)(名|个)?(小孩|孩子|儿童|学生|男孩|女孩|男生|女生|热心村民|村民|人)/g;

/** 一个集体名词在本拍在场集合里能恰好对上的人物（对不上返回 null）。 */
function pickCollective(
  count: number,
  kind: string,
  cast: LensScreenCast,
  descriptors: CharacterVisualDescriptor[],
): CharacterVisualDescriptor[] | null {
  if (!count || count < 2) return null;
  const pick = (codes: string[]) =>
    descriptors.filter(
      (d) => codes.includes(d.code) && collectiveKindMatches(d, kind),
    );
  for (const codes of [cast.confirmed, cast.inclusive]) {
    const picked = pick(codes);
    // v5.27：人数按 groupSize 合计——群像人物一个代号就是几个人
    // （E 一个代号 = 三人组），「三名热心村民」对上的正是它一个；
    // 普通人物 groupSize 恒为 1，与旧口径 picked.length === count
    // 逐字等价。
    const total = picked.reduce((s, d) => s + d.groupSize, 0);
    if (picked.length > 0 && total === count) return picked;
  }
  return null;
}

const REMAINDER_NUMERALS: Record<number, string> = {
  1: "一",
  2: "两",
  3: "三",
  4: "四",
  5: "五",
  6: "六",
  7: "七",
  8: "八",
  9: "九",
};

function collectiveKindMatches(
  d: CharacterVisualDescriptor,
  kind: string,
): boolean {
  return kind === "小孩" || kind === "孩子" || kind === "儿童" || kind === "学生"
    ? d.isChild
    : kind === "男孩" || kind === "男生"
      ? d.gender === "男"
      : kind === "女孩" || kind === "女生"
        ? d.gender === "女"
        : kind === "村民" || kind === "热心村民"
          ? d.isVillager
          : true;
}

/**
 * v5.27 集体名词的可展开人物（展开不了返回 null）：人数恰好对
 * 上 → 全部展开；人数比在场有卡人物多（画面里还有没建卡的龙
 * 套）→ 展开到有卡人物、剩余的只是没卡的龙套（文本侧注明剩余
 * 人数、不编造人物）。在场有卡人物比短语人数还多（短语只指其
 * 中一部分、指谁不明）时不展开、不猜。
 */
function collectivePickInfo(
  count: number,
  kind: string,
  cast: LensScreenCast,
  descriptors: CharacterVisualDescriptor[],
): { picked: CharacterVisualDescriptor[]; total: number } | null {
  const exact = pickCollective(count, kind, cast, descriptors);
  if (exact) {
    return {
      picked: exact,
      total: exact.reduce((s, d) => s + d.groupSize, 0),
    };
  }
  if (!count || count < 2) return null;
  // inclusive ⊇ confirmed（同场承接只进 inclusive），部分展开取
  // inclusive 一份即可；picked 按构造含该集合里全部同类人物，
  // 不会漏掉已确认在场的人。
  const picked = descriptors.filter(
    (d) => cast.inclusive.includes(d.code) && collectiveKindMatches(d, kind),
  );
  const total = picked.reduce((s, d) => s + d.groupSize, 0);
  if (picked.length === 0 || total >= count) return null;
  return { picked, total };
}

/**
 * v5.27 集体名词展开文本（展开不了返回 null）：恰好对上 → 逐人
 * 标签；多出来的是龙套 → 「A（小帅）、B（长发女孩）和另外两个
 * 孩子」——点名有卡人物 + 注明剩余人数，总人数不写错、裸集体
 * 词不留在复制文本里（派工口径）。
 */
function expandCollectiveMatch(
  count: number,
  kind: string,
  counter: string,
  cast: LensScreenCast,
  descriptors: CharacterVisualDescriptor[],
): string | null {
  const info = collectivePickInfo(count, kind, cast, descriptors);
  if (!info) return null;
  const labels = info.picked.map((d) => d.label).join("、");
  if (info.total === count) return labels;
  const rest = count - info.total;
  const restText = REMAINDER_NUMERALS[rest] ?? String(rest);
  const unit = counter || (kind === "村民" || kind === "热心村民" ? "名" : "个");
  return `${labels}和另外${restText}${unit}${kind}`;
}

/** 集体名词展开（恰好对上逐人换；多出来的是龙套则展开 + 注明剩余人数；都不是原样返回）。
 * 紧跟在「另外」后面的短语是剩余 / 子集指代（如部分展开自己写出
 * 的「和另外两个孩子」、原文的「另外两个孩子」），不再二次展开。 */
function expandCollectivesInText(
  text: string,
  cast: LensScreenCast,
  descriptors: CharacterVisualDescriptor[],
): string {
  return (text ?? "").replace(
    COLLECTIVE_RE,
    (
      whole: string,
      numRaw: string,
      counter: string,
      kind: string,
      offset: number,
      src: string,
    ) => {
      if (offset >= 2 && src.slice(offset - 2, offset) === "另外") {
        return whole;
      }
      const count =
        COLLECTIVE_NUMERALS[numRaw] ?? Number.parseInt(numRaw, 10);
      return (
        expandCollectiveMatch(count, kind, counter ?? "", cast, descriptors) ??
        whole
      );
    },
  );
}

/** 一段画面里能成功展开的集体名词所指的人物代号（出场判定用；
 * 部分展开（有卡人物 + 龙套凑数）时有卡人物同样算出场）。 */
function collectiveExpansionCodes(
  text: string,
  cast: LensScreenCast,
  descriptors: CharacterVisualDescriptor[],
): string[] {
  const out = new Set<string>();
  for (const m of (text ?? "").matchAll(COLLECTIVE_RE)) {
    const count =
      COLLECTIVE_NUMERALS[m[1] ?? ""] ?? Number.parseInt(m[1] ?? "", 10);
    const info = collectivePickInfo(count, m[3] ?? "", cast, descriptors);
    if (info) for (const d of info.picked) out.add(d.code);
  }
  return [...out];
}

/** 描述词 → 人物标签替换（长词优先、占位符防二次替换进标签内部）。 */
function replaceDescriptorsInText(
  text: string,
  pairs: { descriptor: string; label: string }[],
): string {
  const sorted = [...pairs].sort(
    (a, b) => b.descriptor.length - a.descriptor.length,
  );
  let out = text ?? "";
  const labels = new Map<string, string>();
  sorted.forEach((p, i) => {
    if (!p.descriptor || !out.includes(p.descriptor)) return;
    const token = `\uE100${i}\uE101`;
    out = out.split(p.descriptor).join(token);
    labels.set(token, p.label);
  });
  for (const [token, label] of labels) {
    out = out.split(token).join(label);
  }
  return out;
}

/**
 * 逐拍画面文本修正器（与 computeTimeline 的节拍同序）：先把描述词
 * 换成人物标签，再把集体名词按本拍在场集合展开。只用在本镜头真
 * 出场人物的描述词（lensMappings 口径），不在场的人不替换、也不
 * 会被写进这个镜头。
 */
export function lensVisualFixers(
  script: ScriptData,
  groupIndex: number,
  ctx?: LensMappingContext,
): ((text: string) => string)[] {
  const tl = computeTimeline(script);
  const group = tl.groups[groupIndex];
  if (!group) return [];
  const descriptors = characterVisualDescriptors(script, ctx);
  const byCode = new Map(descriptors.map((d) => [d.code, d]));
  const castCodes = lensMappings(script, group, ctx).characters.map(
    (c) => c.name,
  );
  const pairs: { descriptor: string; label: string }[] = [];
  for (const code of castCodes) {
    const d = byCode.get(code);
    if (!d) continue;
    for (const w of [...d.strong, ...d.weak]) {
      if (w !== d.label) pairs.push({ descriptor: w, label: d.label });
    }
  }
  const casts = lensScreenCasts(script, groupIndex, ctx);
  return group.beats.map((_b, bi) => {
    const cast = casts[bi] ?? { confirmed: [], inclusive: [] };
    return (text: string) => {
      // v5.27：能展开的集体短语先整段占位保护，再做描述词替换——
      // 「三名热心村民」里的「热心村民」本身就是 E 的描述词，若先
      // 替换就会变成「三名E（大伯）」、集体短语被吃掉再也展不开。
      // 保护针对恰好对上与部分展开（有卡人物 + 注明剩余人数）两
      // 种；展开不了的保持原样走描述词替换（与旧口径一致）。
      const held: string[] = [];
      const shielded = (text ?? "").replace(
        COLLECTIVE_RE,
        (
          whole: string,
          numRaw: string,
          counter: string,
          kind: string,
          offset: number,
          src: string,
        ) => {
          // 「另外X个…」是剩余 / 子集指代，不展开（同 expandCollectivesInText 口径）。
          if (offset >= 2 && src.slice(offset - 2, offset) === "另外") {
            return whole;
          }
          const count =
            COLLECTIVE_NUMERALS[numRaw] ?? Number.parseInt(numRaw, 10);
          const expanded = expandCollectiveMatch(
            count,
            kind,
            counter ?? "",
            cast,
            descriptors,
          );
          if (!expanded) return whole;
          const token = `\uE200${held.length}\uE201`;
          held.push(expanded);
          return token;
        },
      );
      let out = replaceDescriptorsInText(shielded, pairs);
      for (let i = 0; i < held.length; i++) {
        out = out.split(`\uE200${i}\uE201`).join(held[i] ?? "");
      }
      // 兜底再走一遍旧展开（占位保护没覆盖到的短语若因描述词替换
      // 后人数对上，仍按同一口径展开；对不上原样保留）。
      return expandCollectivesInText(out, cast, descriptors);
    };
  });
}

/**
 * v5.21 锁人②：说话人绑脸行——有台词的节拍在台词行后带一行，把
 * 本句说话人与他的 canonical 造型句钉在一起（谁张嘴说话，就写谁
 * 的脸）。说话人不在人物表 / 人物卡里（认不出）时不写这一行，
 * 不猜。
 */
export function speakerBindingLine(
  script: ScriptData,
  ctx: LensMappingContext | undefined,
  speakerName: string,
): string {
  const key = (speakerName ?? "").trim();
  if (!key) return "";
  const chars = collectAllCharacters(script, ctx);
  const info = chars.find((c) => c.name === key);
  if (!info) return "";
  const alias =
    projectCharacterAliases(script, ctx).find((p) => p.code === key)
      ?.alias ?? "";
  const label = characterMappingLabel(key, alias);
  const look = (info.look ?? "").trim();
  return look
    ? `说话人锁定：本句由${label}开口说，造型：${look}——只有这张脸张嘴说话，其他人不许代说。`
    : `说话人锁定：本句由${label}开口说，其他人不许代说。`;
}

/** Every distinct scene used by the storyboard, resolved like lens scenes. */
export function collectAllScenes(
  script: ScriptData,
  ctx?: LensMappingContext,
): LensMappingSceneInfo[] {
  const names: string[] = [];
  for (const g of script.groups) {
    for (const part of g.sceneName.split("/")) {
      const t = part.trim();
      if (t && !names.includes(t)) names.push(t);
    }
  }
  return names.map((name) => {
    const found = (ctx?.scenes ?? []).find((s) => s.name.trim() === name);
    if (found)
      return {
        name,
        description: stripForbiddenSceneSentence(found.description),
        asset: stripForbiddenSceneSentence(found.asset),
        promptZh: (found.promptZh ?? "").trim(),
      };
    const textDesc = stripForbiddenSceneSentence(
      (ctx?.textSceneDescription ?? "").trim(),
    );
    if (textDesc) return { name, description: textDesc, asset: "文字描述" };
    return { name, description: "", asset: "" };
  });
}

export interface GlobalSpecData {
  characters: LensMappingCharInfo[];
  scenes: LensMappingSceneInfo[];
}

export function globalSpecData(
  script: ScriptData,
  ctx?: LensMappingContext,
): GlobalSpecData {
  return {
    characters: collectAllCharacters(script, ctx),
    scenes: collectAllScenes(script, ctx),
  };
}

/**
 * The 全局规范 block that heads every storyboard output (page, per-lens
 * copy, Markdown, generation checklist), following the reference layout:
 * 画幅 / 资产说明 / 角色映射 / 场景映射 / 音色 / 语速 / 禁用.
 */
export function globalSpecLines(
  script: ScriptData,
  ctx?: LensMappingContext,
): string[] {
  const { characters, scenes } = globalSpecData(script, ctx);
  // v5.94：全局规范的人物口径与逐镜头角色映射一致——工作台项
  // 目上下文里只列已提取人物资产图的人物：资产说明的人数只计
  // 有图人物，角色映射行与音色行只列有图人物；过滤启用且一人
  // 不剩时这两行整行不出现（与 v4.85 场景映射行同口径）。过滤
  // 未启用（解剖临时上下文）时与改版前逐字一致。
  const filterOn = mappingImageFilterEnabled(ctx);
  const visChars = visibleMappingCharacters(characters, ctx);
  const lines: string[] = [];
  lines.push(
    "- **画幅**：16:9，no text, no watermark（画面内禁止烧录任何文字/字幕/水印/logo，字幕后期压制）",
  );
  const sceneAsset =
    scenes.length > 0 && scenes.some((s) => s.asset.trim())
      ? scenes
          .map((s) => s.asset.trim())
          .filter(Boolean)
          .join("；")
      : "无场景资产图（场景随剧本各段场景名与画面描述写入）";
  lines.push(
    `- **资产说明**：人物资产=人物资产图（共 ${visChars.length} 位，见项目人物资产图）；场景资产=${sceneAsset}`,
  );
  if (visChars.length > 0) {
    lines.push(
      `- **角色映射**：${visChars
        .map((c) => `${c.name}=${c.name}（${c.role || NOT_FILLED}）`)
        .join("；")}`,
    );
  } else if (!filterOn) {
    lines.push(`- **角色映射**：${NOT_FILLED}`);
  }
  // v4.85：全局规范的场景映射同样只列有数据、非特写 framing 的
  // 条目；一条有效条目都没有时整行不出现，不写 未填写 占位。
  const specScenes = visibleSceneMappings(scenes);
  if (specScenes.length > 0) {
    lines.push(
      `- **场景映射**：${specScenes
        .map((s) => {
          const desc = s.description.trim() || (s.promptZh ?? "").trim();
          const asset = s.asset.trim();
          const detail = asset ? `${desc}，资产：${asset}` : desc;
          return `${s.name}=${s.name}（${detail}）`;
        })
        .join("；")}`,
    );
  }
  if (visChars.length > 0) {
    lines.push(
      `- **音色**：${visChars
        .map((c) => `${c.name}=${c.voice.trim() || NOT_FILLED}`)
        .join("；")}`,
    );
  } else if (!filterOn) {
    lines.push(`- **音色**：${NOT_FILLED}`);
  }
  lines.push(`- **语速**：${script.speechRate} 字/秒，节奏紧凑`);
  lines.push(
    "- **禁用**：cartoon, anime, 3d render, plastic skin, extra limbs, watermark, logo, text",
  );
  return lines;
}

export function lensMappings(
  script: ScriptData,
  group: ScriptGroup,
  ctx?: LensMappingContext,
): LensMappings {
  const descriptors = characterVisualDescriptors(script, ctx);
  // Known character names, in project-card order then 人物表 order.
  const knownNames: string[] = [];
  const pushName = (n: string) => {
    const t = n.trim();
    if (t && !knownNames.includes(t)) knownNames.push(t);
  };
  for (const c of ctx?.characters ?? []) pushName(c.name);
  for (const r of script.characterRows) pushName(r.name);

  // Characters actually appearing in this lens, in first-appearance
  // order: the beat's speaker first, then any known name the beat's
  // visual / sfx mentions (entrances, silent appearances).
  const used: LensMappingCharInfo[] = [];
  const usedNames = new Set<string>();
  const markUsed = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || usedNames.has(trimmed)) return;
    usedNames.add(trimmed);
    used.push(resolveCharacterInfo(trimmed, script, ctx));
  };
  // v5.21：逐拍在场集合（集体名词展开与出场判定共用同一口径）。
  // 本函数只拿到 group 本体，按标题 + 节拍数 + 首拍签名在时间线
  // 里定位它是第几个镜头，定位不到就不承接、不展开判定。
  const tlGroups = computeTimeline(script).groups;
  const firstBeat = group.beats[0];
  const groupIndex = tlGroups.findIndex(
    (g) =>
      g.title === group.title &&
      g.beats.length === group.beats.length &&
      (!firstBeat ||
        (g.beats[0]?.visual === firstBeat.visual &&
          g.beats[0]?.line === firstBeat.line)),
  );
  const casts =
    groupIndex >= 0 ? lensScreenCasts(script, groupIndex, ctx) : [];
  group.beats.forEach((b, bi) => {
    if (b.speaker.trim()) markUsed(b.speaker);
    const haystack = `${b.visual} ${b.sfx}`;
    for (const k of knownNames) {
      if (k && haystack.includes(k)) markUsed(k);
    }
    // v5.21：画面用绰号 / 描述词写人时（红衣男孩、胖男孩、妈妈、
    // 玩偶…）也算出场——旧口径只认说话人与代号原名，静默出场、
    // 只被描写的人会被漏出本镜头映射。描述词表见
    // characterVisualDescriptors（认不准的不启用，不会误报）。
    for (const code of visualRefCodes(haystack, descriptors)) {
      markUsed(code);
    }
    // 集体名词（「三名小孩」）能按在场集合展开时，被展开点到的
    // 人也算本镜头出场（如镜头 3 里只以「三名小孩」出现的 D）。
    const cast = casts[bi];
    if (cast) {
      for (const code of collectiveExpansionCodes(
        b.visual ?? "",
        cast,
        descriptors,
      )) {
        markUsed(code);
      }
    }
  });

  // Scenes actually used: the lens's sceneName may join several scenes
  // with " / " when a lens spans a scene change.
  // v5.27：拆分后按名去重——按秒切镜把已拼好的场景名当整体比较，
  // 同一场景会被拼两遍（项目 40 快照 v14 镜头 1 出现「木质售票亭 /
  // 木质售票亭」），映射里同一场景列两行纯属噪声。只去重、不改名、
  // 不动存量数据（服务端 segmentScenes 已同口径收口，见 rules.ts）。
  const sceneNames: string[] = [];
  for (const part of group.sceneName.split("/")) {
    const t = part.trim();
    if (t && !sceneNames.includes(t)) sceneNames.push(t);
  }
  const scenes: LensMappingSceneInfo[] = sceneNames.map((name) => {
    const found = (ctx?.scenes ?? []).find((s) => s.name.trim() === name);
    if (found)
      return {
        name,
        description: stripForbiddenSceneSentence(found.description),
        asset: stripForbiddenSceneSentence(found.asset),
        promptZh: (found.promptZh ?? "").trim(),
      };
    const textDesc = stripForbiddenSceneSentence(
      (ctx?.textSceneDescription ?? "").trim(),
    );
    if (textDesc) return { name, description: textDesc, asset: "文字描述" };
    return { name, description: "", asset: "" };
  });

  // v4.83 道具映射：全片道具资产（ctx.props 优先，回落剧本自带的
  // propAssets）里，只列本镜头节拍文本（画面 / 台词 / 音效）里真
  // 出现过的道具——与角色映射「只列本镜头出场人物」同一口径，没
  // 出现的道具不硬塞进这个镜头。
  const allProps: LensMappingPropInfo[] = (ctx?.props ?? script.propAssets ?? [])
    .map((p) => ({
      name: (p.name ?? "").trim(),
      description: (p.description ?? "").trim(),
      promptZh: (p.promptZh ?? "").trim(),
    }))
    .filter((p) => p.name);
  const props: LensMappingPropInfo[] =
    allProps.length === 0
      ? []
      : allProps.filter((p) =>
          group.beats.some((b) =>
            `${b.visual} ${b.line} ${b.sfx}`.includes(p.name),
          ),
        );

  return { characters: used, scenes, props };
}

/**
 * v4.85 映射只呈现有效条目（用户定案，只动场景 / 道具，角色不动）：
 * 「XX面部特写」「XX特写」这类以「特写」结尾的名字是镜头景别、
 * 不是独立地点——展示层一律过滤（数据保留、不删库，景别信息本
 * 来就在镜头描述的景别 / 运镜字段里）；场景 / 道具条目只有在描
 * 述或生图提示词任一非空时才算「有数据」进映射，没数据的条目不
 * 在映射正文里占位写 未填写——它们由分镜页的轻量「待补充」提
 * 示单独承接（collectMappingGaps），导出文本里不出现提示。
 */
export function isCloseupFramingName(name: string): boolean {
  return /特写$/.test((name ?? "").trim());
}

/** 场景条目是否有数据：描述或中文生图提示词任一非空。 */
export function sceneMappingHasData(s: LensMappingSceneInfo): boolean {
  return !!(s.description.trim() || (s.promptZh ?? "").trim());
}

/** 道具条目是否有数据：描述或中文生图提示词任一非空。 */
export function propMappingHasData(p: LensMappingPropInfo): boolean {
  return !!(p.description.trim() || p.promptZh.trim());
}

/** 映射正文里真正呈现的场景条目：有数据、且不是特写 framing。 */
export function visibleSceneMappings(
  scenes: LensMappingSceneInfo[],
): LensMappingSceneInfo[] {
  return scenes.filter(
    (s) => !isCloseupFramingName(s.name) && sceneMappingHasData(s),
  );
}

/** 映射正文里真正呈现的道具条目：有数据才呈现。 */
export function visiblePropMappings(
  props: LensMappingPropInfo[],
): LensMappingPropInfo[] {
  return props.filter(propMappingHasData);
}

/**
 * v5.94 角色映射只列「已提取人物资产图」的人物（用户点名：没
 * 有提取的人物资产图不要出现在角色映射当中——项目 44 的 C/F/G
 * 人物卡已删、台词还在分镜里，映射正文却按出场列出他们、写
 * 「C=造型：未填写」占位）。判定 = resolveCharacterInfo 已算
 * 的 hasImage（人物卡 imageUrl 非空才为真；卡被删了、或卡还
 * 在但没图，都是假），没图的人物整条不出现、不写占位。
 * 例外守卫：过滤只在「工作台项目上下文」启用——上下文里的
 * 人物带了人物卡 id（App.buildMappingContext 传入）才算数；
 * AI 解剖临时上下文（analysisbench mappingCtxOf）的人物没有
 * id、也没有 imageUrl，那里的映射保持原样全列，否则解剖结
 * 果页的分镜表会丢光人物。
 * 过滤只在映射正文呈现层做：lensMappings 本身（出场判定、描
 * 述词替换、附图清单、切镜核对、说话人锁定行）一字不动；台
 * 词、人物卡、人物表、审查页「待确认人物」提示都不动。
 */
export function mappingImageFilterEnabled(
  ctx?: LensMappingContext,
): boolean {
  return (ctx?.characters ?? []).some((c) => typeof c.id === "number");
}

/** 映射正文里真正呈现的人物条目：过滤启用时只留有资产图的人。 */
export function visibleMappingCharacters(
  chars: LensMappingCharInfo[],
  ctx?: LensMappingContext,
): LensMappingCharInfo[] {
  return mappingImageFilterEnabled(ctx)
    ? chars.filter((c) => c.hasImage)
    : chars;
}

export interface MappingGaps {
  scenes: string[];
  props: string[];
}

/**
 * v4.85 待补充清单（分镜页轻量提示专用，不进任何导出文本）：全片
 * 镜头引用过、但没有描述 / 提示词数据的场景名与道具名（去重、首
 * 次出现序）。特写 framing 不算缺数据——它不需要独立场景资产，
 * 直接不出现，也不进待补充。
 */
export function collectMappingGaps(
  script: ScriptData,
  ctx?: LensMappingContext,
): MappingGaps {
  const scenes: string[] = [];
  const props: string[] = [];
  for (const g of script.groups) {
    const m = lensMappings(script, g, ctx);
    for (const s of m.scenes) {
      if (isCloseupFramingName(s.name)) continue;
      if (!sceneMappingHasData(s) && !scenes.includes(s.name))
        scenes.push(s.name);
    }
    for (const p of m.props) {
      if (!propMappingHasData(p) && !props.includes(p.name))
        props.push(p.name);
    }
  }
  return { scenes, props };
}

/**
 * v4.83 资产图优先规则（用户逐字定稿，一个字不许改）：每条分镜
 * 提示词（每个镜头块）的末尾固定带这一行——分镜页一键复制、
 * Markdown 导出、AI 视频清单导出三处共用同一常量，防漂移。
 */
export const ASSET_PRIORITY_RULE =
  "资产图优先规则：用户提供了人物、场景、道具的资产图，就优先使用资产图；如果没有，就使用分镜中描述的提示词。";

/**
 * v5.91 切镜规则（问题 #23「111220」追加，用户原话「同一个动作没
 * 做完别切新镜头」）：重分组版本（Seedance 每镜 20–30 秒版 / 强
 * 制 30 秒版、H3 每镜 10–15 秒版）的逐镜头文本末尾带这一行给视
 * 频模型——同一个动作必须完整做完再切镜。H3 版的同义句写在
 * detailed_description 开场（见 buildH3TextForGroup），按剧情版
 * 不带（分组与文本口径照旧）。
 */
export const ACTION_CUT_RULE_LINE =
  "切镜规则：同一个动作没有做完，不要切到下一个镜头；当前动作必须完整做完、落到结束姿态之后再切镜，不要把一个动作切到一半就换镜头。";

// ---------------------------------------------------------------------------
// v4.93 全片风格锁定 + 每镜头站位（v4.95 站位改「固定站位每拍都带」）
//
// 用户是一镜一复制去生成视频：每个镜头单独发给视频模型，模型之间
// 没有记忆，提示词里没写死风格就按默认去猜（一镜超写实、一镜动
// 漫）。所以风格锁不能只写在文档顶部——每个镜头复制出去的文本里
// 都自带同一段锁定句（v4.94 起排在文本最顶部、郑重声明之前，只
// 留这一次；v4.93 曾在末尾再带一句短版后缀，v4.94 按用户定案删
// 除）。锁定句全文由项目级设置
// script.filmStyle 生成：没改过（空 / 缺失）就是下面逐字定稿的默
// 认两行；用户在分镜页改了，全片所有镜头一起变。styleLabel（剧本
// 风格）/ stylePreset（语气）与画面风格无关，绝不复用、绝不覆盖。
// 站位同理：v4.93/v4.94 只在第一拍带一次，节拍单拿出去生成时看
// 不到站位、整组生成时模型越往后越忘——v4.95 起站位拆成两层：
// 固定站位（只写位置、不写动作，每个镜头一条、组内每一拍都带
// 同一句）+ 本拍动作（只写在当前拍的画面内容里，不进站位行）。
//
// v5.24（第 1 档【0】）口径更新：逐镜头复制的两条拼装路径
// （buildSingleGroupText / buildSingleGroupTextForModel，镜头包
// 正文同源）按用户派工拍板把全局头收敛为只在镜头 1 写一次——
// 风格锁定句 + 郑重声明只进镜头 1 的复制文本，镜头 2 起不再重
// 复，上文 v4.93 的「每镜头自带」口径对这两条路径作废；
// buildMarkdown / buildGenChecklist 本档未动，仍按原口径每镜头
// 块带锁定句（导出整份文档时文档级声明另置顶一份）。
// ---------------------------------------------------------------------------

/** 默认全片风格锁定句（用户逐字定稿，中文在前、英文在后）。 */
export const DEFAULT_FILM_STYLE_LOCK_LINES = [
  "全片统一风格：超写实真人实拍，电影质感，自然光，真实皮肤纹理、毛孔、汗毛、自然皮脂光泽，拒绝磨皮塑料感；非动漫、非卡通、非3D渲染、非插画、非CG卡通；同一批人物、同一造型、同一场景、同一光线。",
  "Hyper-realistic live-action, cinematic, natural light, real skin texture, NOT anime, NOT cartoon, NOT 3D render, NOT illustration.",
] as const;

/**
 * v4.93 的默认短版风格后缀（用户逐字定稿）：曾在每镜头提示词末尾
 * 再带一句；v4.94 起按用户定案不再进任何复制 / 导出文本（风格锁
 * 只留每镜头顶部一次）。常量与 filmStyleSuffix 保留备查，不再被
 * 拼装函数引用。
 */
export const DEFAULT_FILM_STYLE_SUFFIX =
  "超写实真人实拍，电影感，真实皮肤，同一人物同一造型";

/** 当前生效的风格锁定句全文（多行以 \n 连接）：设置为空 = 默认。 */
export function filmStyleLockText(script: ScriptData): string {
  const custom = (script.filmStyle ?? "").trim();
  return custom || DEFAULT_FILM_STYLE_LOCK_LINES.join("\n");
}

/** 当前生效的风格锁定句，逐行返回（复制 / 导出逐字用这一份）。 */
export function filmStyleLockLines(script: ScriptData): string[] {
  return filmStyleLockText(script)
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 是否还在用默认风格（没改过项目级全片风格设置）。 */
export function isDefaultFilmStyle(script: ScriptData): boolean {
  return !(script.filmStyle ?? "").trim();
}

/**
 * 短版风格后缀（v4.94 起不再拼进复制 / 导出文本，仅保留备查）：
 * 默认风格时逐字用定稿句；用户改过风格时取其锁定句第一行的第一
 * 分句作缩写（同口径、仍是用户自己的原话，不另编）。
 */
export function filmStyleSuffix(script: ScriptData): string {
  if (isDefaultFilmStyle(script)) return DEFAULT_FILM_STYLE_SUFFIX;
  const first = (filmStyleLockLines(script)[0] ?? "")
    .replace(/^全片统一风格：/, "")
    .split(/[，；。]/)[0]
    ?.trim();
  return first || DEFAULT_FILM_STYLE_SUFFIX;
}

/**
 * 本镜头固定站位行（trim 后）；空 = 这一行不进复制与导出。
 * v4.95：这一行只写位置、不写动作，组内每一拍都带同一句。
 */
export function groupBlockingLine(group: ScriptGroup): string {
  return (group.blocking ?? "").trim();
}

/**
 * 在画面 / 旧站位子句里找人用的键：代号人物用真名找（画面用真名
 * 写人），真名人物用本名找；纯代号（A / B）绝不直接搜（会误命中
 * 字母）。画面常把人写短（「长发女孩」只写「女孩」、「校长爸爸」
 * 只写「校长」）：别名是「特征＋性别」或「职务＋亲属」时补一个短
 * 键，但短键只在不与他人冲突、且出现在子句前半段（主语位）时才
 * 认（见 fixedPositionFromClause）。
 */
interface BlockingSeeker {
  code: string;
  key: string;
  extraKey: string;
  label: string;
  /**
   * v5.25：v5.21 画面描述词表里的强描述词（绰号口径：红衣男孩、
   * 胖男孩、玩偶…）——画面常用绰号写人、位置词又常不在同一子
   * 句，旧 seeker 只认别名 / 本名导致整组提炼为空（任务 A 定
   * 位）。提炼先认这份别名对照（含绰号）再匹配位置词。
   */
  descKeys: string[];
}

function blockingSeekers(script: ScriptData): BlockingSeeker[] {
  const aliasByCode = new Map(
    projectCharacterAliases(script).map((p) => [p.code, p.alias]),
  );
  // v5.25：描述词表按代号索引（强描述词才进 seeker；弱描述词
  // 是裸性别词、指人不准，不进站位提炼）。
  const descByCode = new Map(
    characterVisualDescriptors(script).map((d) => [d.code, d.strong]),
  );
  // 全员性别词（判断短称呼键是否唯一）：取身份 + 造型里第一个
  // 性别词；同一性别词被多人共用时，短键会指错人，不启用。
  const genderOf = (r: CharacterRow): string =>
    `${r.identity} ${r.look}`.match(/男孩|女孩|男生|女生/)?.[0] ?? "";
  return script.characterRows
    .map((r) => {
      const alias = aliasByCode.get(r.name) ?? "";
      const key = alias || (isCodeCharacterName(r.name) ? "" : r.name);
      let extraKey = "";
      const compound = alias.match(
        /^(?:眼镜|长发|卷发|短发|麻花辫|双马尾)(男孩|女孩|男生|女生)$/,
      );
      if (compound?.[1]) {
        const g = compound[1];
        const shared = script.characterRows.some(
          (o) => o.name !== r.name && genderOf(o) === g,
        );
        if (!shared) extraKey = g;
      }
      const jobKin = alias.match(
        /^(校长|园长|主任|村长|厂长|老板|教练|队长|老师)(?:爸爸|妈妈)$/,
      );
      if (!extraKey && jobKin?.[1]) {
        const job = jobKin[1];
        const clash = script.characterRows.some(
          (o) =>
            o.name !== r.name &&
            ((aliasByCode.get(o.name) ?? "") === job || o.name === job),
        );
        if (!clash) extraKey = job;
      }
      const descKeys = (descByCode.get(r.name) ?? []).filter(
        (w) => w !== key && w !== extraKey,
      );
      return {
        code: r.name,
        key,
        extraKey,
        label: alias ? `${r.name}（${alias}）` : r.name,
        descKeys,
      };
    })
    // v5.25：旧口径只留有主钥（别名 / 本名）的人——任务 A 定
    // 位整组提炼为空的主因之一：画面里只有绰号（红衣男孩 /
    // 胖男孩）的人若没有别名就整员被丢。现放宽为有绰号键
    // （descKeys，v5.21 描述词表的强描述词）也留；空主钥在
    // clauseHits / seekersNamedIn 里有守卫，不会误命中。
    .filter((s) => s.key || s.descKeys.length > 0);
}

/** 固定站位只认这些位置词（画面左 / 中 / 右、前 / 中 / 背景落点、
 * 讲台 / 课桌 / 黑板 / 门口等场景落点）；按出现顺序拼位置短语。 */
const BLOCKING_LOCATION_RE =
  /画面左侧三分之一处|画面左前方|画面右前方|画面左后方|画面右后方|画面左侧|画面右边|画面右侧|画面中后方|画面后方|画面中央|画面中间|黑板前|黑板旁|讲台后|讲台前|讲台旁|讲桌后|讲桌前|讲桌旁|课桌前|课桌旁|课桌上|前排|后排|后方|教室|门口|门边|窗边|窗前|路边|车旁|进门|桌上|桌前/g;

/** 位置词归一：讲桌 = 讲台（场景口径），进门落点记门口，桌上 /
 * 课桌上在坐姿里记课桌。 */
function normalizeBlockingLocationToken(token: string): string {
  if (token.startsWith("讲桌")) return `讲台${token.slice(2)}`;
  if (token === "进门") return "门口";
  if (token === "桌上" || token === "课桌上") return "课桌";
  if (token === "桌前") return "课桌前";
  return token;
}

function blockingLocationOf(clause: string, sceneName: string): string {
  const tokens: string[] = [];
  for (const m of clause.matchAll(BLOCKING_LOCATION_RE)) {
    const t = normalizeBlockingLocationToken(m[0]);
    if (!tokens.includes(t)) tokens.push(t);
  }
  let loc = tokens.join("");
  // 「前排 / 后排」是排位、要落在教室里才完整：场景是教室且句中
  // 还没写教室时补上（镜头 7 定稿口径「坐教室前排课桌」）。
  if (/^(前排|后排)/.test(loc) && sceneName.includes("教室")) {
    loc = `教室${loc}`;
  }
  return loc;
}

/** 姿势只留坐 / 站：明写站 / 坐优先；落在课桌 / 排位 = 坐，其余
 * 有落点 = 站。 */
function blockingPostureOf(clause: string, location: string): string {
  if (/站/.test(clause)) return "站";
  if (/坐|就座/.test(clause)) return "坐";
  if (/课桌|前排|后排/.test(location)) return "坐";
  return location ? "站" : "";
}

/** 一个子句里被点名的人物（任一键命中：别名 / 本名 / 短键 /
 * v5.25 描述词绰号键），按出现位置排序；placed 里的人跳过。 */
function clauseHits(
  clause: string,
  seekers: BlockingSeeker[],
  placed?: Set<string>,
): { seeker: BlockingSeeker; idx: number }[] {
  const hits: { seeker: BlockingSeeker; idx: number }[] = [];
  for (const s of seekers) {
    if (placed?.has(s.code)) continue;
    // 空主钥（只有绰号键的人）不能走 indexOf：indexOf("") 恒
    // 为 0 会把每句都误判命中。
    let idx = s.key ? clause.indexOf(s.key) : -1;
    if (idx < 0 && s.extraKey) {
      const ei = clause.indexOf(s.extraKey);
      if (ei >= 0 && ei <= clause.length / 2) idx = ei;
    }
    if (idx < 0) {
      for (const dk of s.descKeys) {
        const di = clause.indexOf(dk);
        if (di >= 0 && (idx < 0 || di < idx)) idx = di;
      }
    }
    if (idx >= 0) hits.push({ seeker: s, idx });
  }
  hits.sort((a, b) => a.idx - b.idx);
  return hits;
}

/** 一段文本里被点名过的全部人物（集体名词人数核对用）。 */
function seekersNamedIn(
  text: string,
  seekers: BlockingSeeker[],
): BlockingSeeker[] {
  return seekers.filter(
    (s) =>
      (s.key !== "" && text.includes(s.key)) ||
      (s.extraKey !== "" && text.includes(s.extraKey)) ||
      s.descKeys.some((dk) => text.includes(dk)),
  );
}

/**
 * 一个子句 → 一条纯位置站位（「人物标签、… + 坐/站 + 位置
 * （，面向X）」）：只取人物、位置词与朝向，子句里的动作（对视
 * 偷笑、抬头看讲台、说话之类）一律丢弃——动作只属于本拍的画
 * 面内容，不进固定站位、更不许串到别的节拍。取不到人物或位置
 * 时返回 ""。placed 给定时，已被前面子句占位的人物不再重复入选。
 */
function fixedPositionFromClause(
  clause: string,
  seekers: BlockingSeeker[],
  sceneName: string,
  placed?: Set<string>,
): string {
  const hits = clauseHits(clause, seekers, placed);
  if (hits.length === 0) return "";
  const location = blockingLocationOf(clause, sceneName);
  if (!location) return "";
  const posture = blockingPostureOf(clause, location);
  if (!posture) return "";
  for (const h of hits) placed?.add(h.seeker.code);
  const facing = clause.match(/面向(左|右|镜头)/)?.[1];
  return `${hits.map((h) => h.seeker.label).join("、")}${posture}${location}${facing ? `，面向${facing}` : ""}`;
}

/** 一次提炼出的一条落位：哪几个人、在哪（位置词原文）、什么
 * 姿势、朝向哪。deriveGroupBlocking（整行文本）用这份扫描结果。 */
export interface BlockingPlacement {
  persons: BlockingSeeker[];
  location: string;
  posture: string;
  facing: string;
}

/**
 * 全组落位扫描（v4.95 同句提炼 + v5.25 两点改进）：
 *  ① 人物键先认 v5.21 别名对照（含绰号描述词，见 descKeys）；
 *  ② 跨子句对位——任务 A 定位的整组提炼为空主因：人物在子句
 *     一、位置词在子句二（「红衣男孩和胖男孩站在门口，画面左
 *     侧是…」式）。同一拍内先点名没位置的人记为 pending，紧
 *     跟着出现位置词的子句把 pending 的人落到这个位置上；
 *  ③ 集体名词（「三人」）子句带位置词、且本拍被点名未落位
 *     的人数恰好对上时，把这批人一起落位；对不上不猜。
 * 一个人只取第一处明确位置；提炼不出的人不进结果（留空，
 * 不编造）。
 */
export function deriveGroupPlacements(
  script: ScriptData,
  group: ScriptGroup,
): BlockingPlacement[] {
  const seekers = blockingSeekers(script);
  const placed = new Set<string>();
  const placements: BlockingPlacement[] = [];
  const sceneName = group.sceneName ?? "";
  for (const b of group.beats) {
    const visual = b.visual ?? "";
    const clauses = visual
      .split(/[，；。]/)
      .map((s) => s.trim())
      .filter(Boolean);
    let pending: { seeker: BlockingSeeker; idx: number }[] = [];
    for (const clause of clauses) {
      const hits = clauseHits(clause, seekers, placed);
      const location = blockingLocationOf(clause, sceneName);
      if (hits.length > 0 && location) {
        const posture = blockingPostureOf(clause, location);
        if (posture) {
          placements.push({
            persons: hits.map((h) => h.seeker),
            location,
            posture,
            facing: clause.match(/面向(左|右|镜头)/)?.[1] ?? "",
          });
          for (const h of hits) placed.add(h.seeker.code);
          const hitCodes = new Set(hits.map((h) => h.seeker.code));
          pending = pending.filter((p) => !hitCodes.has(p.seeker.code));
        }
      } else if (hits.length > 0) {
        for (const h of hits) {
          if (!pending.some((p) => p.seeker.code === h.seeker.code)) {
            pending.push(h);
          }
        }
      } else if (location) {
        const posture = blockingPostureOf(clause, location);
        if (!posture) continue;
        const facing = clause.match(/面向(左|右|镜头)/)?.[1] ?? "";
        if (pending.length > 0) {
          placements.push({
            persons: pending.map((p) => p.seeker),
            location,
            posture,
            facing,
          });
          for (const p of pending) placed.add(p.seeker.code);
          pending = [];
        } else {
          const m = clause.match(COLLECTIVE_RE);
          const numRaw = m?.[1];
          if (numRaw) {
            const n =
              COLLECTIVE_NUMERALS[numRaw] ??
              Number.parseInt(numRaw, 10);
            if (Number.isFinite(n) && n > 0) {
              const named = seekersNamedIn(visual, seekers).filter(
                (s) => !placed.has(s.code),
              );
              if (named.length === n) {
                placements.push({
                  persons: named,
                  location,
                  posture,
                  facing,
                });
                for (const s of named) placed.add(s.code);
              }
            }
          }
        }
      }
      if (seekers.length > 0 && placed.size >= seekers.length) break;
    }
    if (seekers.length > 0 && placed.size >= seekers.length) break;
  }
  return placements;
}

/**
 * 固定站位初值提炼（v4.93 建立、v4.95 改纯位置口径）：只从本组
 * 现有画面描述里提炼已明确写出的人物位置——逐拍逐子句找人物，
 * 每人只取位置成分（坐 / 站 + 位置词 + 朝向）拼成一条；本拍动
 * 作不进站位，景别 / 机位不再拼进站位（已在每拍运镜里）。一个
 * 人只取第一处明确位置；一个都提炼不出就返回空字符串（留空、
 * 不写占位）。只在 parseScript 给还没有 blocking 字段的存量分
 * 镜组调用一次，画面描述原文一字不改。
 */
export function deriveGroupBlocking(
  script: ScriptData,
  group: ScriptGroup,
): string {
  const placements = deriveGroupPlacements(script, group);
  if (placements.length === 0) return "";
  const segments = placements.map(
    (p) =>
      `${p.persons.map((s) => s.label).join("、")}${p.posture}${p.location}${p.facing ? `，面向${p.facing}` : ""}`,
  );
  return `站位：${segments.join("，")}。`;
}

/** 旧站位里出现这些词 = 混着本拍动作（不是纯位置文本）。 */
const BLOCKING_ACTION_RE =
  /对视|偷笑|说话|讲课|收作业|看向|望向|盯着|抬头|转头|回头|低头|点头|摇头|举手|伸手|撑桌|瞪|哭|笑|指着|拿着|握着|拉着|摸着|喊|质问|训斥|吃|喝|写字|跑|坐下|站起|起身|挥手|拍桌|打电话|汇报|告状|催促|辩解|保证|下令|追问|逼问|求情|撒娇|炫耀|回怼|点破|嘀咕|接话|糊弄|夸|告辞|反问/;

/**
 * 存量站位去动作化（v4.95）：旧提炼 / 旧编辑留下的站位字符串里
 * 若带「景别：…；机位：…；」前缀或混着本拍动作，就按同一套纯
 * 位置拼装只留位置成分作固定站位初值——前缀与动作成分去掉，
 * 一个位置都提炼不出就留空（该行不进复制与导出、不写占位）。
 * 已是纯位置文本（无前缀、无动作词）的值原样返回、一字不动。
 * 动作不另存：它本来就在对应节拍的画面内容里，原样保留。
 */
export function sanitizeFixedBlocking(
  script: ScriptData,
  group: ScriptGroup,
  raw: string,
): string {
  const text = raw.trim();
  if (!text) return text;
  if (!/景别|机位/.test(text) && !BLOCKING_ACTION_RE.test(text)) return text;
  const seekers = blockingSeekers(script);
  // 砍掉「站位：」之前的景别 / 机位前缀段；没有「站位：」时整串
  // 当正文（前缀段会在逐段拼装时因取不到人物 + 位置被丢掉）。
  const marker = text.indexOf("站位：");
  const body = marker >= 0 ? text.slice(marker + "站位：".length) : text;
  const segments: string[] = [];
  for (const part of body.split(/[；。]/)) {
    const seg = fixedPositionFromClause(
      part.trim(),
      seekers,
      group.sceneName ?? "",
    );
    if (seg && !segments.includes(seg)) segments.push(seg);
  }
  if (segments.length === 0) return "";
  return `站位：${segments.join("，")}。`;
}

/**
 * v4.83 映射排版重定义（用户定案，角色 / 场景 / 道具三块统一）：
 * 标题独立成行（「角色映射：」/「场景映射：」/「道具映射：」），
 * 下面条目以「名称=…」直接开头、条目之间空行分隔；旧版每段重复
 * 「角色映射：A=…」前缀的写法作废，条目内字段行不变（角色 =
 * 造型 / 音色 / 语气基调；场景 = 描述 / 资产，有生图提示词时再加
 * 一行原文保留；道具 = 描述，有生图提示词时同样保留）。描述为空
 * 但有生图提示词时，描述位直接用提示词顶上。
 * v4.85 起场景 / 道具改口径：只列有数据（描述或提示词任一非空）
 * 的条目，特写 framing 不列，没数据的条目不在正文写 未填写 占
 * 位（走分镜页待补充提示，见 collectMappingGaps），整类无有效
 * 条目时整个块不出现；角色块口径不变（缺项仍写 未填写）。
 * 只列本镜头实际出场的人物（首次出场序）、本镜头的场景、本镜头
 * 节拍里出现过的道具（lensMappings 口径）。
 * v4.29 人物锁定保留：角色块条目后按本镜头人物逐人写死「谁的台
 * 词只能谁外貌的人说」+ 总禁互换 / 串演 / 换脸。（v4.94 起该重
 * 复段已删——郑重声明第 2 条与映射本身已经锁定，见函数内注释。）
 * 本函数是分镜页一键复制、Markdown 导出、AI 视频清单导出共用
 * 的映射来源，一处覆盖三处。
 */
/**
 * v4.89 角色造型展开开关的选项：开关只管造型展开与否，口径历版
 * 不变。收起形态历版：v4.89「名称=名称」且带音色 / 语气基调行
 * → v4.92「A（小帅）=A」→ v4.94 条目只写条目头「A（小帅）」、音
 * 色 / 语气基调行两态都不带 → v4.96 用户定案改回带等号：
 * 「A=A（小帅）」（等号左边裸代号、右边代号加括号真名；取不到
 * 真名时只写代号、不加空括号）。缺省（不传）= 展开——Markdown
 * 导出与 AI 视频清单导出不传此选项，永远是完整展开版；分镜页展
 * 示（lensMappingLines）与分镜页一键复制（buildSingleGroupText）
 * 按开关状态传。v4.91 起多一个例外：「分镜+人物表导出」经
 * buildStoryboardExportMarkdown 显式传开关状态，是唯一跟随开关
 * 的导出路径。
 * v4.92 起条目头独立于开关恒带真名（见 projectCharacterAliases）：
 * 展开态「A（小帅）=造型：……」、收起态「A=A（小帅）」，括号真
 * 名两种状态都不丢；人物称呼对照表行同样与开关无关，五处出口
 * 恒带。
 */
export interface LensMappingOptions {
  expandLook?: boolean;
}

export function lensMappingBlocks(
  script: ScriptData,
  group: ScriptGroup,
  ctx?: LensMappingContext,
  opts?: LensMappingOptions,
): string[] {
  const expandLook = opts?.expandLook !== false;
  const m = lensMappings(script, group, ctx);
  // v4.94 复制模板精简（用户点名授权的删除，见 lensMappingLines 同
  // 口径）：块按「有内容才出现」拼装、块间空行分隔，顺序改成
  // 场景 → 人物 → 道具。
  // ①场景不再是「场景映射：」整块：每个场景一行「场景：名——描
  //   述一句话」；生图提示词整段与「资产：…」行都不再进视频复制
  //   文本（那是生静态场景设定图用的、写着空镜无人，与本镜有人
  //   对话冲突）——只删文本，场景卡里的 promptZh/promptEn 数据
  //   一字不动，生场景图时照旧用。
  // ②人物条目只剩条目头：展开态「A（小帅）=造型：……」、收起态
  //   「A=A（小帅）」（v4.96 用户定案：等号左边裸代号、右边代号
  //   加括号真名；无真名时只写代号、不加空括号——取代 v4.94 的
  //   裸条目「A（小帅）」与 v4.92 的「A（小帅）=A」）；音色 /
  //   语气基调行不再进视频复制文本（配音用，数据保留在人物表
  //   与台词本）；条目后的「人物锁定：…」重复段删除（郑重声明
  //   第 2 条与映射本身已经说了）；人物称呼对照表保留。
  // ③道具条目只留描述一行，生图提示词行同口径删除。
  const blocks: string[][] = [];
  const visScenes = visibleSceneMappings(m.scenes);
  if (visScenes.length > 0) {
    blocks.push(
      visScenes.map((s) => {
        const desc = s.description.trim();
        return desc ? `场景：${s.name}——${desc}` : `场景：${s.name}`;
      }),
    );
  }
  // v5.94：角色块只列过滤后留下的人物（visibleMappingCharacters，
  // 工作台项目上下文里只剩已提取人物资产图的人）；过滤后一人不
  // 剩时整个角色块不出现（与 v4.85 场景 / 道具同口径），不写
  // 未填写 占位。过滤未启用（解剖临时上下文）时保持旧口径：
  // 本镜头无人出场仍写「角色映射：/ 未填写」。
  const visChars = visibleMappingCharacters(m.characters, ctx);
  if (visChars.length > 0) {
    const charBlock: string[] = ["角色映射："];
    // v4.92：条目头带真名（A（小帅）=造型：……）；条目后跟一行
    // 人物称呼对照表。
    // v5.27：对照表按本镜头出场人物过滤——旧口径整行取全项目别名
    // 表，本镜没出场的人也列进去（项目 40 按秒并成 2 镜后，镜头 1
    // 多出大伯=E、镜头 2 多出老板娘=D，模型会被没出场的人干扰）。
    // 只改这一行的入参，别名推导本身（projectCharacterAliases）
    // 一字未动；无别名的人本来就不进对照表，口径不变。
    // v5.94：对照表同步只列过滤后留下的人物（inLens 取 visChars）。
    const aliasPairs = projectCharacterAliases(script, ctx);
    const aliasByCode = new Map(aliasPairs.map((p) => [p.code, p.alias]));
    visChars.forEach((c, i) => {
      if (i > 0) charBlock.push("");
      const alias = aliasByCode.get(c.name) ?? "";
      const label = characterMappingLabel(c.name, alias);
      charBlock.push(
        expandLook
          ? `${label}=造型：${c.look.trim() || NOT_FILLED}`
          : alias
            ? `${c.name}=${label}`
            : `${label}`,
      );
    });
    const inLens = new Set(visChars.map((c) => c.name));
    const aliasLine = characterAliasTableLine(
      aliasPairs.filter((p) => inLens.has(p.code)),
    );
    if (aliasLine) charBlock.push(aliasLine);
    blocks.push(charBlock);
  } else if (!mappingImageFilterEnabled(ctx)) {
    blocks.push(["角色映射：", NOT_FILLED]);
  }
  const visProps = visiblePropMappings(m.props);
  if (visProps.length > 0) {
    const propBlock: string[] = ["道具映射："];
    visProps.forEach((p, i) => {
      if (i > 0) propBlock.push("");
      const desc = p.description.trim();
      const prompt = p.promptZh.trim();
      propBlock.push(`${p.name}=描述：${desc || prompt}`);
    });
    blocks.push(propBlock);
  }
  return blocks.flatMap((b, i) => (i > 0 ? ["", ...b] : b));
}

/**
 * 兼容旧名：三处导出 / 复制一直以这个名字取映射块，v4.83 起它
 * 返回的就是上面的三块统一排版（角色 + 场景 + 道具）。
 */
export function lensCharacterMappingLines(
  script: ScriptData,
  group: ScriptGroup,
  ctx?: LensMappingContext,
  opts?: LensMappingOptions,
): string[] {
  return lensMappingBlocks(script, group, ctx, opts);
}

/**
 * The mapping blocks shown on the storyboard page (bold titles).
 * 与 lensMappingBlocks 同口径：v4.85 起场景 / 道具只列有数据的条
 * 目、特写 framing 不列、整类无有效条目时整个块不出现；v4.94 起
 * 场景 / 人物 / 道具三块与复制版逐项一致精简（见 lensMappingBlocks
 * 的 v4.94 注释）。
 */
export function lensMappingLines(
  script: ScriptData,
  group: ScriptGroup,
  ctx?: LensMappingContext,
  opts?: LensMappingOptions,
): string[] {
  const expandLook = opts?.expandLook !== false;
  const m = lensMappings(script, group, ctx);
  // v4.94：与 lensMappingBlocks 逐项同口径（页面显示与复制 / 导
  // 出不许两套）——场景一行「场景：名——描述」、无生图提示词行
  // 与资产行；人物条目只剩条目头（收起态 v4.96 起写「A=A（小
  // 帅）」：裸代号=代号（真名），无真名只写代号），
  // 无音色 / 语气基调行；道具只留描述一行。顺序同为场景 → 人
  // 物 → 道具。
  const blocks: string[][] = [];
  const visScenes = visibleSceneMappings(m.scenes);
  if (visScenes.length > 0) {
    blocks.push(
      visScenes.map((s) => {
        const desc = s.description.trim();
        return desc ? `场景：${s.name}——${desc}` : `场景：${s.name}`;
      }),
    );
  }
  // v5.94：与 lensMappingBlocks 逐项同口径——只列过滤后留下的
  // 人物（工作台项目上下文里只剩已提取人物资产图的人），对照表
  // 同步只列留下的人；过滤后一人不剩时整个角色块不出现，过滤
  // 未启用（解剖临时上下文）时保持旧口径（无人出场写 未填写）。
  const visChars = visibleMappingCharacters(m.characters, ctx);
  if (visChars.length > 0) {
    const charBlock: string[] = ["**角色映射**："];
    // v4.92：与 lensMappingBlocks 同口径——条目头带真名、条目后跟
    // 人物称呼对照表，页面显示与复制 / 导出逐字一致。
    // v5.27：对照表同样按本镜头出场人物过滤（见 lensMappingBlocks）。
    const aliasPairs = projectCharacterAliases(script, ctx);
    const aliasByCode = new Map(aliasPairs.map((p) => [p.code, p.alias]));
    visChars.forEach((c, i) => {
      if (i > 0) charBlock.push("");
      const alias = aliasByCode.get(c.name) ?? "";
      const label = characterMappingLabel(c.name, alias);
      charBlock.push(
        expandLook
          ? `${label}=造型：${c.look.trim() || NOT_FILLED}`
          : alias
            ? `${c.name}=${label}`
            : `${label}`,
      );
    });
    const inLens = new Set(visChars.map((c) => c.name));
    const aliasLine = characterAliasTableLine(
      aliasPairs.filter((p) => inLens.has(p.code)),
    );
    if (aliasLine) charBlock.push(aliasLine);
    blocks.push(charBlock);
  } else if (!mappingImageFilterEnabled(ctx)) {
    blocks.push(["**角色映射**：", NOT_FILLED]);
  }
  const visProps = visiblePropMappings(m.props);
  if (visProps.length > 0) {
    const propBlock: string[] = ["**道具映射**："];
    visProps.forEach((p, i) => {
      if (i > 0) propBlock.push("");
      const desc = p.description.trim();
      const prompt = p.promptZh.trim();
      propBlock.push(`${p.name}=描述：${desc || prompt}`);
    });
    blocks.push(propBlock);
  }
  return blocks.flatMap((b, i) => (i > 0 ? ["", ...b] : b));
}

// ---------------------------------------------------------------------------
// Beat blocks in the reference layout (learned from the user's sample
// storyboard file — format only, never its plot or characters):
//
//   节拍N｜对应台词号 / 过渡动作 / 静默 …
//   （v4.97 起标题行不再带「（镜头内进度 a%–b%）」：用户实测该百分比
//   进度标记会干扰视频模型分析、引发跳拍，只删这段文字本身；对应
//   台词编号、时间码、秒数、切镜依据全部保留，底层进度数值仍在
//   beatDisplay 里照常计算、只是不再渲染进标题行。）
//   画面内容：……；末帧：……。
//   人物对话：角色（音色，语气）："台词" / （无台词，动作说明）
//   运镜：……
//   音效：<…>+<…>（仅本拍有音效时才有这一行）
//
// v4.94 精简前的排版还逐拍带「快切感：……」与「画面内无烧录文字
// （字幕后期压制）。」两行，已按用户定案删除（见 formatBeatLines）。
//
// 快切感 and 运镜 are not stored fields: they are derived deterministically
// from the beat's stored cut reason, camera/scale words already present
// in its 画面 text, and its emotion — never invented plot content.
// ---------------------------------------------------------------------------

/** Annotation after the progress bracket: which line a beat carries. */
export function beatAnnotation(
  beat: Beat,
  dialogueNo: number | null,
): string {
  if (beat.line.trim()) return `对应台词${dialogueNo ?? ""}`;
  const v = beat.visual ?? "";
  if (/交叉/.test(v) && /对峙|沉默|静默/.test(v)) return "静默+交叉剪辑";
  if (/交叉/.test(v)) return "交叉剪辑";
  if (/对峙|沉默|静默|无言/.test(v)) return "静默";
  return "过渡动作";
}

function splitVisualFinal(visual: string): {
  content: string;
  finalFrame: string;
} {
  const v = (visual ?? "").trim();
  const idx = v.indexOf("末帧");
  if (idx >= 0) {
    const content = v
      .slice(0, idx)
      .replace(/[；;，,。\s]+$/, "");
    const fin = v
      .slice(idx)
      .replace(/^末帧[:：]?\s*/, "")
      .replace(/[。\s]+$/, "");
    return { content: content || v, finalFrame: fin || v };
  }
  const frags = v
    .split(/[，,、；;。]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const last = frags.length > 0 ? (frags[frags.length - 1] ?? v) : v;
  return { content: v.replace(/[。\s]+$/, ""), finalFrame: last };
}

function deriveQuickCut(beat: Beat, annotation: string): string {
  if (annotation.includes("交叉"))
    return "交叉剪辑，快慢交替，悬念拉满。";
  if (annotation === "静默") return "短暂停顿，静默蓄势，节奏由紧转松。";
  switch (beat.cutReason) {
    case "开场节拍":
      return "开场建立，快切入场，节奏起势。";
    case "场景转场":
      return "硬切转场，空间切换干脆，紧张感推进。";
    case "人物出入场":
      return "人物出入场，行动感爆发，快切推进。";
    case "说话人切换":
      return "正反打切换，话轮交接紧凑，对话节奏密集。";
    case "情绪转折":
      return "情绪转折，节奏顿挫，反差感拉满。";
    case "悬念/反转点":
      return "悬念/反转点，快切感拉满，爆点突出。";
    case "动作转折":
      return "动作转折，突然推进，力度感拉满。";
    default:
      return beat.line.trim()
        ? "对话推进，快切紧凑。"
        : "动作过渡，快切推进。";
  }
}

function deriveCamera(visual: string, beat: Beat): string {
  const v = visual ?? "";
  const scale =
    ["中全景", "全景", "中景", "近景", "特写", "远景"].find((s) =>
      v.includes(s),
    ) ?? "";
  if (/快速切换|交叉|→/.test(v) || /交叉/.test(beat.visual ?? "")) {
    return `快速切换${scale ? `——${scale}` : "——多机位"}，切换点由画面内动作实现。`;
  }
  const move = /跟拍|跟随/.test(v)
    ? "跟拍"
    : /推镜|推近/.test(v)
      ? "推镜"
      : /拉镜|拉远/.test(v)
        ? "拉镜"
        : /摇镜/.test(v)
          ? "摇镜"
          : "固定机位";
  const shotScale = scale || "中景";
  return beat.line.trim()
    ? `${move}、${shotScale}，人物对话与表情由画面内实现。`
    : `${move}、${shotScale}，动作由画面内实现。`;
}

/** 音效 in the reference format: each sound wrapped in <…>, joined by +. */
export function formatSfx(sfx: string): string {
  const parts = (sfx ?? "")
    .split(/[、,，;；+]+/)
    .map((s) => s.trim().replace(/^[<《]+|[>》]+$/g, "").trim())
    .filter(Boolean);
  if (parts.length === 0) return "（无）";
  return parts.map((p) => `<${p}>`).join("+");
}

export interface BeatDisplay {
  annotation: string;
  /** Lens-internal progress (0–100% within THIS lens, not the whole film). */
  progressStart: number;
  progressEnd: number;
  visualContent: string;
  finalFrame: string;
  dialogueText: string;
  quickCut: string;
  camera: string;
  sfxFormatted: string;
  voice: string;
}

/**
 * All display fields of one timed beat, in the reference field order.
 * Progress is LENS-INTERNAL: each lens's beats run 0% → 100% within
 * that lens (lens 1's beats go 0%–100%, lens 2's beats restart at 0%
 * and go to 100% again). The beat keeps its absolute timecode via
 * beat.start / beat.end; `lensStart` / `lensDuration` anchor the
 * percentage so a percentage alone is never ambiguous.
 */
export function beatDisplay(
  script: ScriptData,
  ctx: LensMappingContext | undefined,
  beat: TimedBeat,
  dialogueNo: number | null,
  lensStart: number,
  lensDuration: number,
  opts?: {
    /** v5.27：只用于无台词拍的「（无台词，动作说明）」摘要——摘
     * 要取自画面原文，拼装侧把本拍画面修正器传进来，让摘要里的
     * 描述词 / 集体名词与「画面内容」行同口径（点名到人），复
     * 制文本里不留裸集体词。有台词的台词行永不经此修正（台词
     * 原文一字不动）。不传 = 旧口径（分镜文档屏显等）。 */
    noteVisualFix?: (text: string) => string;
  },
): BeatDisplay {
  const annotation = beatAnnotation(beat, dialogueNo);
  const dur = lensDuration > 0 ? lensDuration : 1;
  const clampPct = (v: number) => Math.min(100, Math.max(0, v));
  const { content, finalFrame } = splitVisualFinal(beat.visual);
  let dialogueText: string;
  let voice = "";
  if (beat.line.trim()) {
    const info = resolveCharacterInfo(beat.speaker, script, ctx);
    voice = info.voice.trim();
    const emotion = beat.emotion.trim();
    const emotionLabel = emotion
      ? emotion.endsWith("语气")
        ? emotion
        : `${emotion}语气`
      : "语气未填写";
    dialogueText = `${beat.speaker}（${voice || NOT_FILLED}，${emotionLabel}）："${beat.line.trim()}"`;
  } else {
    const desc =
      annotation === "静默+交叉剪辑"
        ? "对峙静默+交叉剪辑"
        : annotation === "交叉剪辑"
          ? "交叉剪辑"
          : annotation === "静默"
            ? "静默/对峙"
            : (opts?.noteVisualFix ?? ((t: string) => t))(
                (beat.visual ?? "").split(/[；;。]/)[0]?.trim() ?? "",
              ).slice(0, 24) || "动作过渡";
    dialogueText = `（无台词，${desc}）`;
  }
  return {
    annotation,
    progressStart: clampPct(((beat.start - lensStart) / dur) * 100),
    progressEnd: clampPct(((beat.end - lensStart) / dur) * 100),
    visualContent: content,
    finalFrame,
    dialogueText,
    quickCut: deriveQuickCut(beat, annotation),
    camera: deriveCamera(beat.visual, beat),
    sfxFormatted: formatSfx(beat.sfx),
    voice,
  };
}

/** One beat block as plain/Markdown text lines, reference field order. */
export function formatBeatLines(
  script: ScriptData,
  ctx: LensMappingContext | undefined,
  beat: TimedBeat,
  localNo: number,
  dialogueNo: number | null,
  lensStart: number,
  lensDuration: number,
  opts?: {
    /** v5.21：本拍画面文本修正（描述词换标签 + 集体名词展开）。 */
    visualFix?: (text: string) => string;
  },
): string[] {
  const d = beatDisplay(script, ctx, beat, dialogueNo, lensStart, lensDuration, {
    noteVisualFix: opts?.visualFix,
  });
  const fix = opts?.visualFix ?? ((t: string) => t);
  // v4.94 精简：每拍只留画面 + 台词 + 运镜——「快切感」行与
  // 「画面内无烧录文字」行删除（不烧录字幕郑重声明第 1 条已经
  // 说了，不用每拍重复）；音效只有本拍真有音效时才写一行，没
  // 有就不写（不再写「音效：（无）」）。
  // v4.97：标题行删除「（镜头内进度 X%–Y%）」整段——只删这段文字，
  // 对应台词编号 / 时间码 / 秒数 / 切镜依据原样保留；beatDisplay 的
  // progressStart/progressEnd 仍照常计算（数据不动），只是不再渲染。
  // v5.21：画面内容过 visualFix（绰号换人物标签、集体名词展开成
  // 逐人名单，存量数据不动）；有台词的拍在台词行后加一行说话人
  // 绑脸行（说话人 + 他的 canonical 造型句）。
  const lines = [
    `节拍${localNo}｜${d.annotation} ${fmtRange(beat.start, beat.end)} · ${beat.duration.toFixed(1)} 秒 · 切镜依据：${beat.cutReason?.trim() || "剧情分析"}`,
    `画面内容：${fix(d.visualContent)}；末帧：${fix(d.finalFrame)}。`,
    `人物对话：${d.dialogueText}`,
  ];
  if (beat.line.trim()) {
    const binding = speakerBindingLine(script, ctx, beat.speaker);
    if (binding) lines.push(binding);
  }
  lines.push(`运镜：${d.camera}`);
  if ((beat.sfx ?? "").trim()) lines.push(`音效：${d.sfxFormatted}`);
  return lines;
}

/**
 * 一个镜头的全部节拍行（每拍一块、块间空行）：v4.93 起本组有站
 * 位行时插在「画面内容」之后、「人物对话」之前；v4.95 改为固定
 * 站位组内每一拍都带同一句（旧口径只插第一拍——节拍 2/3/4 单拿
 * 去生成时看不到站位、整组生成时模型越往后越忘）。固定站位只写
 * 位置不写动作，本拍动作只在各拍自己的画面内容里。位置在四处
 * 出口（逐镜头复制 / Markdown / AI 清单 / 分镜+人物表导出的分
 * 镜部分）里逐字一致。固定站位为空时整行不出现、不写占位。
 */
export function lensBeatLines(
  script: ScriptData,
  ctx: LensMappingContext | undefined,
  group: TimedGroup,
  groupIndex: number,
  dlgNums: (number | null)[][],
): string[] {
  const lines: string[] = [];
  // v4.95 固定站位整行文本（groupBlockingLine）；为空时整行不出现。
  const blocking = groupBlockingLine(group);
  const fixers = lensVisualFixers(script, groupIndex, ctx);
  group.beats.forEach((b, bi) => {
    const block = formatBeatLines(
      script,
      ctx,
      b,
      bi + 1,
      dlgNums[groupIndex]?.[bi] ?? null,
      group.start,
      group.duration,
      {
        visualFix: fixers[bi],
      },
    );
    if (blocking) {
      const vi = block.findIndex((l) => l.startsWith("画面内容："));
      block.splice(vi >= 0 ? vi + 1 : 1, 0, blocking);
    }
    lines.push(...block, "");
  });
  return lines;
}

// ---------------------------------------------------------------------------
// v5.83：镜头之间不再做「首帧重叠」——旧口径（v4.94 以前）每个后续
// 镜头生成时提前 1 秒、首帧 = 上一镜头末帧，用户实判这套说法没起
// 到作用、亲口要求整套删除：拼装里不再写重叠段、不再写「首帧=上
// 一镜头末帧」、不再写生成起始点提前，节拍 / 时间轴标题也不再提
// 重叠帧；时间码按不重叠连续计算，生成时长 = 故事时长。旧的
// lensOverlapLines / lensOverlapInfo / lensGenerationSeconds 已删。
// ---------------------------------------------------------------------------

/** Dialogue numbers (1-based, storyboard order) per beat, null when silent. */
export function dialogueNumbers(script: ScriptData): (number | null)[][] {
  const tl = computeTimeline(script);
  let n = 0;
  return tl.groups.map((g) =>
    g.beats.map((b) => (b.line.trim() ? ++n : null)),
  );
}

// ---------------------------------------------------------------------------
// Coverage list （覆盖台词清单） — the closing table of a storyboard
// document: every beat in storyboard order, silent beats included as
// 动作 / 静默 / 交叉剪辑 rows, followed by the totals line.
// ---------------------------------------------------------------------------

export interface CoverageRow {
  /** Global beat number across the whole storyboard (1-based). */
  globalBeat: number;
  dialogueNo: number | null;
  annotation: string;
  speakerLabel: string;
  content: string;
}

export interface CoverageData {
  rows: CoverageRow[];
  totalSeconds: number;
  beatCount: number;
  dialogueCount: number;
  actionCount: number;
  crossCount: number;
  silenceCount: number;
  summary: string;
}

export function coverageData(script: ScriptData): CoverageData {
  const tl = computeTimeline(script);
  const rows: CoverageRow[] = [];
  let global = 0;
  let dlg = 0;
  let action = 0;
  let cross = 0;
  let silence = 0;
  for (const g of tl.groups) {
    for (const b of g.beats) {
      global += 1;
      const no = b.line.trim() ? ++dlg : null;
      const annotation = beatAnnotation(b, no);
      if (!b.line.trim()) {
        if (annotation.includes("交叉")) cross += 1;
        else if (annotation === "静默") silence += 1;
        else action += 1;
      }
      const speakerLabel = b.line.trim()
        ? b.speaker.trim() || NOT_FILLED
        : annotation === "过渡动作"
          ? "（动作）"
          : annotation.includes("交叉")
            ? "（静默）"
            : annotation === "静默"
              ? "（静默）"
              : "（过渡）";
      const content = b.line.trim()
        ? b.line.trim()
        : (b.visual ?? "").split(/[；;。]/)[0]?.trim() || b.visual;
      rows.push({
        globalBeat: global,
        dialogueNo: no,
        annotation,
        speakerLabel,
        content,
      });
    }
  }
  const extras: string[] = [];
  if (action > 0) extras.push(`${action}个动作过渡`);
  if (cross > 0) extras.push(`${cross}段交叉剪辑`);
  if (silence > 0) extras.push(`${silence}个静默`);
  const summary =
    `> 总时长：约${tl.totalSeconds.toFixed(1)}秒｜共${global}节拍` +
    (extras.length > 0 ? `（含${extras.join("+")}）` : "") +
    `｜覆盖台词${dlg > 0 ? `1–${dlg}` : "无"}（共${dlg}句台词）`;
  return {
    rows,
    totalSeconds: tl.totalSeconds,
    beatCount: global,
    dialogueCount: dlg,
    actionCount: action,
    crossCount: cross,
    silenceCount: silence,
    summary,
  };
}

/** Coverage table + totals as Markdown lines (heading added by caller). */
export function coverageLines(script: ScriptData): string[] {
  const cov = coverageData(script);
  const lines: string[] = [];
  lines.push("| 节拍 | 台词号 | 角色 | 台词内容 |", "| --- | --- | --- | --- |");
  for (const r of cov.rows) {
    lines.push(
      `| ${r.globalBeat} | ${r.dialogueNo ?? "—"} | ${r.speakerLabel} | ${r.content} |`,
    );
  }
  lines.push("", cov.summary);
  return lines;
}


// ---------------------------------------------------------------------------
// Per-lens copy text (single lens only) — v4.94 精简后的固定顺序
// (每加一版只加不减、攒了十来层重复，用户定案整版做减法):
//   【1】全片风格锁定句 (v4.93 引入、v4.94 起只留顶部这一次：全文
//        由项目级 filmStyle 设置生成，默认逐字定稿两行，全片每镜
//        一致；v4.93 的末尾短版后缀已删)
//   【2】【郑重声明】 (v4.70 三条硬规则，v4.94 压缩成一段一行)
//   【3】映射 (v4.94: 场景一行「场景：名——描述一句话」在前；其后
//        角色映射——只列本镜头出场人物、条目只剩条目头、带人物
//        称呼对照表；道具映射只留描述行；无生图提示词、无资产
//        行、无音色 / 语气基调行、无人物锁定重复段)
//   【4】节拍 (each beat its own block, blank line between beats;
//        每拍只留画面 + 台词 + 运镜，音效非空才写；v4.93: 本组
//        站位行插在画面内容之后、人物对话之前；v4.95: 改为固定
//        站位每一拍都带同一句，只写位置不写动作)
//   【5】资产图优先规则行 (v4.83: 固定文案逐字）
//   （v5.83：原【4】首帧重叠一行整段删除，见 lensBeatLines 上方注。）
// Nothing else: no lens title, no totals/statistics, no 全局规范， no
// 时间总规划， no 覆盖清单， no generation notes. A scene change
// starts a new beat block rather than being squeezed into the same
// line/paragraph.
// ---------------------------------------------------------------------------

export function buildSingleGroupText(
  script: ScriptData,
  groupIndex: number,
  ctx?: LensMappingContext,
  opts?: LensMappingOptions,
): string {
  const tl = computeTimeline(script);
  const g = tl.groups[groupIndex];
  if (!g) return "";
  const lines: string[] = [];
  // v4.94：风格锁定句排最前（只留顶部一次），郑重声明紧随其后。
  // v5.24 第 1 档【0】：全局头（风格锁定句 + 郑重声明）只在镜头 1
  // 写一次——八段骨架的全局头收敛口径（用户 2026-11-07 派工拍
  // 板，取代 v4.93/v4.94 的每镜头自带口径）；镜头 2 起不再重复。
  if (groupIndex === 0) {
    lines.push(...filmStyleLockLines(script), "");
    lines.push(...videoDeclarationLines(), "");
  }
  lines.push(...lensCharacterMappingLines(script, g, ctx, opts));
  // v5.24 第 1 档：角色映射块之后加 @Image N 绑定行。
  const bindingLine = lensImageBindingLine(script, g, ctx);
  if (bindingLine) lines.push(bindingLine);
  lines.push("");
  const dlgNums = dialogueNumbers(script);
  lines.push(...lensBeatLines(script, ctx, g, groupIndex, dlgNums));
  // v4.83：本条分镜提示词末尾固定带资产图优先规则行（逐字定稿）。
  lines.push(ASSET_PRIORITY_RULE);
  return lines.join("\n").trim();
}

// ---------------------------------------------------------------------------
// v4.98 按视频模型分叉的逐镜头复制（只改一键复制出去的文本；分镜页
// 显示、Markdown 导出、AI 视频清单导出、分镜+人物表导出仍走上面的
// buildSingleGroupText / buildMarkdown / buildGenChecklist 通用版，
// 一字未动）。
//
// 共用骨架（四档都有，与 v4.97 基线一致）：风格锁定句、郑重声明三
// 条、场景一行、角色映射 + 称呼对照表、固定站位、资产图优先规则、
// 台词原文一字不动（站位在 2.5 / 2.0 是每拍都带，v4.99 起 Fast /
// Mini 改为开头只写一次，见下）。v5.24（第 1 档）起四档与通用版
// 同步在角色映射块之后加「参考图绑定」行
// （lensImageBindingLine：出场顺序 @Image N、无图不占号）。
// v5.24 第 1 档【0】再收敛一处：全局头（风格锁定句 + 郑重声明）
// 只在镜头 1 写一次、镜头 2 起两处拼装（本函数与通用版）都不再
// 重复。只在下面列出的点上分叉：
//   · Seedance 2.5（时间戳版）：每拍标题行改为本镜头内相对时间戳
//     「0.0s-1.3s：…」（从本镜头第一拍起算 0 秒、保留一位小数）；
//     台词写成「说话人台词（语气）：台词内容」（说话人用称呼对照
//     表里的真名 / 称呼，语气取该行台词已有的情感字段、没有则取人
//     物语气基调、再没有就不写括号）；风格锁定句之后、场景行之前
//     加一行「一句话概述」（只用已有数据拼：本镜出场人物 + 场景名
//     + 本镜事件（镜头标题）+ 超写实风格 + 主运镜，不编新内容）；
//     其余（切镜依据、运镜、秒数）保留。
//   · Seedance 2.0（镜头序号版）：每拍标题行改为「镜头N：…」（本
//     镜头内从 1 编号，Seedance 的镜头 = 工作台的节拍）；删掉标题
//     行里的绝对时间码与每拍秒数（只删标题行里的，其余部分与基
//     线逐字一致）；台词用花括号 {台词内容}；音效本
//     来就按 2.0 符号表写（音效 <…>），没有音乐 / 字幕数据就不写
//     音乐（）/ 字幕【】；其余（切镜依据、运镜、画面、站位）保留。
//   · Seedance 2.0 Fast（v4.99 单镜锁死版，实测省字策略、非官方
//     要求）：不再是 2.0 的删繁变体，而是单镜结构——①删每拍
//     「镜头N：」序号标题，各拍按顺序排列为连续动作（无标题行、
//     无时间戳）；②风格锁定句与场景行之后、动作序列之前加一行锁
//     死句「一镜到底，{主运镜}，全程无切镜、无转场。」（主运镜 =
//     本镜头第一拍运镜的第一段；无运镜数据时锁死句不带运镜段）；
//     ③固定站位只在锁死句之后写一次（与每拍站位行同一句原文），
//     每拍不再重复站位；④每拍运镜行删除（运镜已由锁死句写清）；
//     ⑤台词改为 {角色用中文说："台词原文"} 单独成行（角色名用称
//     呼对照表里的真名 / 称呼，台词原文一字不动），音乐 / 音效仍
//     按 2.0 符号表（有才写）；⑥每拍画面只留主动作分句（第一个句
//     号「。」或分号「；」前的部分，含末帧段一并按此切分）；
//     ⑦风格锁定句只保留中文行、删英文行；⑧每拍无切镜依据（标题
//     行已删、无处可带）。保留：郑重声明三条、场景一行、角色映射
//     + 称呼对照表（含解释句全文）、资产图优先规则。
//   · Seedance 2.0 Mini（v4.99）：与新 Fast 同为单镜锁死结构（删
//     镜头序号、锁死句、站位开头一次、每拍无运镜行、台词同为
//     {角色用中文说："…"} 单独成行、风格锁只留中文行、无切镜依
//     据），再压两处——①画面在 Fast 主动作分句基础上只保留第一
//     个逗号（，/、）前的部分（分句内无逗号则与 Fast 相同）；
//     ②称呼对照表只保留映射部分，删去后面「台词中出现的人名均指
//     代号对应的人物，不得另起新人。」这句解释。
// 删繁只影响 Fast / Mini 档复制文本，工作台数据与 2.0 / 2.5 档
// 一字未动（2.0 / 2.5 的拼装路径与 v4.98 逐字一致）。
// ---------------------------------------------------------------------------

export type VideoModelId =
  | "seedance25"
  | "seedance20"
  | "seedance20fast"
  | "seedance20mini";

export const VIDEO_MODELS: {
  id: VideoModelId;
  label: string;
  /** 单次生成时长上限（秒）：2.5 为 30，2.0 系列为 15。 */
  limitSeconds: number;
}[] = [
  { id: "seedance25", label: "Seedance 2.5", limitSeconds: 30 },
  { id: "seedance20", label: "Seedance 2.0", limitSeconds: 15 },
  { id: "seedance20fast", label: "Seedance 2.0 Fast", limitSeconds: 15 },
  { id: "seedance20mini", label: "Seedance 2.0 Mini", limitSeconds: 15 },
];

export function videoModelById(
  id: string | null | undefined,
): (typeof VIDEO_MODELS)[number] {
  return VIDEO_MODELS.find((m) => m.id === id) ?? VIDEO_MODELS[0]!;
}

function isSeedance20Family(model: VideoModelId): boolean {
  return model !== "seedance25";
}

function isFastOrMini(model: VideoModelId): boolean {
  return model === "seedance20fast" || model === "seedance20mini";
}

/** 运镜只保留第一个描述：按「、」或「，」切分取第一段。 */
function firstCameraSegment(camera: string): string {
  return (camera ?? "").split(/[、，]/)[0]?.trim() || (camera ?? "").trim();
}

/** Fast / Mini：风格锁定句只保留中文行（删英文行）。 */
function styleLinesForModel(
  script: ScriptData,
  model: VideoModelId,
): string[] {
  const all = filmStyleLockLines(script);
  if (!isFastOrMini(model)) return all;
  const zh = all.filter((l) => /[㐀-鿿]/.test(l));
  return zh.length > 0 ? zh : all.slice(0, 1);
}

/** Mini：称呼对照表只保留映射部分，删去后面的解释句。 */
function mappingLinesForModel(
  script: ScriptData,
  group: TimedGroup,
  ctx: LensMappingContext | undefined,
  opts: LensMappingOptions | undefined,
  model: VideoModelId,
): string[] {
  const lines = lensCharacterMappingLines(script, group, ctx, opts);
  if (model !== "seedance20mini") return lines;
  return lines.map((line) => {
    if (!line.startsWith("人物称呼对照：")) return line;
    const idx = line.indexOf("台词中出现的人名均指代号对应的人物");
    return idx > 0 ? line.slice(0, idx) : line;
  });
}

/** 2.5 一句话概述：只用已有数据拼，不编新内容。 */
function overviewLineFor25(
  script: ScriptData,
  ctx: LensMappingContext | undefined,
  group: TimedGroup,
  dlgNums: (number | null)[][],
  groupIndex: number,
): string {
  const m = lensMappings(script, group, ctx);
  const aliasByCode = new Map(
    projectCharacterAliases(script, ctx).map((p) => [p.code, p.alias]),
  );
  const chars = m.characters.map((c) =>
    characterMappingLabel(c.name, aliasByCode.get(c.name) ?? ""),
  );
  const firstBeat = group.beats[0];
  let mainCamera = "";
  if (firstBeat) {
    const d = beatDisplay(
      script,
      ctx,
      firstBeat,
      dlgNums[groupIndex]?.[0] ?? null,
      group.start,
      group.duration,
    );
    mainCamera = firstCameraSegment(d.camera);
  }
  const charsText = chars.length > 0 ? `${chars.join("、")}在` : "";
  const eventText = group.title.trim() ? `，${group.title.trim()}` : "";
  const cameraText = mainCamera ? `，主运镜：${mainCamera}` : "";
  return `一句话概述：${charsText}${group.sceneName}${eventText}，超写实真人实拍${cameraText}。`;
}

function dialogueLineForModel(
  script: ScriptData,
  ctx: LensMappingContext | undefined,
  beat: TimedBeat,
  d: BeatDisplay,
  model: VideoModelId,
): string {
  if (!beat.line.trim()) return `人物对话：${d.dialogueText}`;
  const line = beat.line.trim();
  if (model === "seedance25") {
    const aliasByCode = new Map(
      projectCharacterAliases(script, ctx).map((p) => [p.code, p.alias]),
    );
    const speaker = beat.speaker.trim() || "待确认说话人";
    const displayName = aliasByCode.get(speaker) || speaker;
    const tone =
      beat.emotion.trim() ||
      resolveCharacterInfo(speaker, script, ctx).tone.trim();
    return tone
      ? `人物对话：${displayName}台词（${tone}）：${line}`
      : `人物对话：${displayName}台词：${line}`;
  }
  if (isFastOrMini(model)) {
    // v4.99 单镜锁死版：台词单独成行 {角色用中文说："台词原文"}，
    // 角色名用称呼对照表里的真名 / 称呼（与 2.5 同口径解析），台
    // 词原文一字不动，只改包装格式；无台词拍仍走上面的基线行。
    const aliasByCode = new Map(
      projectCharacterAliases(script, ctx).map((p) => [p.code, p.alias]),
    );
    const speaker = beat.speaker.trim() || "待确认说话人";
    const displayName = aliasByCode.get(speaker) || speaker;
    return `{${displayName}用中文说："${line}"}`;
  }
  if (isSeedance20Family(model)) {
    const braced = d.dialogueText.replace(`："${line}"`, `：{${line}}`);
    return `人物对话：${braced === d.dialogueText ? `${beat.speaker}：{${line}}` : braced}`;
  }
  return `人物对话：${d.dialogueText}`;
}

/**
 * v4.99 Fast / Mini 画面主动作分句：整串「画面内容；末帧：…。」按
 * 第一个句号「。」或分号「；」切分，只取前段（末帧段随之切掉）。
 * 与 v4.98 Mini 的机械切分口径完全一致，本版上移到 Fast 与 Mini。
 */
function mainActionClause(d: BeatDisplay): string {
  const full = `${d.visualContent}；末帧：${d.finalFrame}。`;
  return full.split(/[。；]/)[0]?.trim() || d.visualContent;
}

/** v4.99 Mini 再压一档：主动作分句里第一个逗号（，/、）前的部分；分句内无逗号则与 Fast 相同。 */
function miniActionClause(main: string): string {
  const idx = main.search(/[，、]/);
  return idx > 0 ? main.slice(0, idx).trim() : main;
}

/**
 * v4.99 Fast / Mini 单镜锁死句：主运镜 = 本镜头第一拍运镜的第一段
 * （与 overviewLineFor25 同口径取 beatDisplay.camera 再切第一段）；
 * 取不到运镜数据时不带运镜段，绝不凭空编造。
 */
function lockLineForFastMini(
  script: ScriptData,
  ctx: LensMappingContext | undefined,
  group: TimedGroup,
  groupIndex: number,
  dlgNums: (number | null)[][],
): string {
  const firstBeat = group.beats[0];
  let mainCamera = "";
  if (firstBeat) {
    const d = beatDisplay(
      script,
      ctx,
      firstBeat,
      dlgNums[groupIndex]?.[0] ?? null,
      group.start,
      group.duration,
    );
    mainCamera = firstCameraSegment(d.camera);
  }
  return mainCamera
    ? `一镜到底，${mainCamera}，全程无切镜、无转场。`
    : "一镜到底，全程无切镜、无转场。";
}

/**
 * v4.99 Fast / Mini 动作序列：无「镜头N：」标题行、无切镜依据、
 * 无每拍运镜行、无每拍站位（站位已移到开头只写一次），各拍按顺
 * 序排列为连续动作——每拍只剩画面（主动作分句，Mini 再压到第一
 * 个逗号前）+ 台词行 + 音效行（非空才写）。
 */
function beatLinesForFastMini(
  script: ScriptData,
  ctx: LensMappingContext | undefined,
  group: TimedGroup,
  groupIndex: number,
  dlgNums: (number | null)[][],
  model: VideoModelId,
): string[] {
  const lines: string[] = [];
  const fixers = lensVisualFixers(script, groupIndex, ctx);
  group.beats.forEach((b, bi) => {
    const fix = fixers[bi] ?? ((t: string) => t);
    const raw = beatDisplay(
      script,
      ctx,
      b,
      dlgNums[groupIndex]?.[bi] ?? null,
      group.start,
      group.duration,
      { noteVisualFix: fix },
    );
    // v5.21：画面先过本拍修正（绰号换标签 + 集体名词展开）再切分。
    const d: BeatDisplay = {
      ...raw,
      visualContent: fix(raw.visualContent),
      finalFrame: fix(raw.finalFrame),
    };
    const main = mainActionClause(d);
    const visual =
      model === "seedance20mini" ? miniActionClause(main) : main;
    const block = [
      `画面内容：${visual}。`,
      dialogueLineForModel(script, ctx, b, d, model),
    ];
    if (b.line.trim()) {
      const binding = speakerBindingLine(script, ctx, b.speaker);
      if (binding) block.push(binding);
    }
    if ((b.sfx ?? "").trim()) block.push(`音效：${d.sfxFormatted}`);
    lines.push(...block, "");
  });
  return lines;
}

function beatLinesForModel(
  script: ScriptData,
  ctx: LensMappingContext | undefined,
  group: TimedGroup,
  groupIndex: number,
  dlgNums: (number | null)[][],
  model: VideoModelId,
): string[] {
  // v4.99：Fast / Mini 走单镜锁死版动作序列（独立分支，2.5 / 2.0
  // 的拼装路径在下面、一字未动，与 v4.98 逐字一致）。
  if (isFastOrMini(model)) {
    return beatLinesForFastMini(script, ctx, group, groupIndex, dlgNums, model);
  }
  const lines: string[] = [];
  const blocking = groupBlockingLine(group);
  const fixers = lensVisualFixers(script, groupIndex, ctx);
  group.beats.forEach((b, bi) => {
    const fix = fixers[bi] ?? ((t: string) => t);
    const raw = beatDisplay(
      script,
      ctx,
      b,
      dlgNums[groupIndex]?.[bi] ?? null,
      group.start,
      group.duration,
      { noteVisualFix: fix },
    );
    // v5.21：画面过本拍修正（绰号换标签 + 集体名词展开）。
    const d: BeatDisplay = {
      ...raw,
      visualContent: fix(raw.visualContent),
      finalFrame: fix(raw.finalFrame),
    };
    const cutReason = b.cutReason?.trim() || "剧情分析";
    let title: string;
    if (model === "seedance25") {
      const relStart = (b.start - group.start).toFixed(1);
      const relEnd = (b.end - group.start).toFixed(1);
      title = `${relStart}s-${relEnd}s：${d.annotation} · ${b.duration.toFixed(1)} 秒 · 切镜依据：${cutReason}`;
    } else {
      title = `镜头${bi + 1}：${d.annotation} · 切镜依据：${cutReason}`;
    }
    const visualLine = `画面内容：${d.visualContent}；末帧：${d.finalFrame}。`;
    // v5.21：有台词的拍在台词行后加说话人绑脸行（四档一致）。
    const binding = b.line.trim()
      ? speakerBindingLine(script, ctx, b.speaker)
      : "";
    const block = [
      title,
      visualLine,
      ...(blocking ? [blocking] : []),
      dialogueLineForModel(script, ctx, b, d, model),
      ...(binding ? [binding] : []),
      `运镜：${d.camera}`,
    ];
    if ((b.sfx ?? "").trim()) block.push(`音效：${d.sfxFormatted}`);
    lines.push(...block, "");
  });
  return lines;
}

export function buildSingleGroupTextForModel(
  script: ScriptData,
  groupIndex: number,
  ctx?: LensMappingContext,
  opts?: LensMappingOptions & { videoModel?: VideoModelId; actionCutRule?: boolean },
): string {
  const model: VideoModelId = opts?.videoModel ?? "seedance25";
  const tl = computeTimeline(script);
  const g = tl.groups[groupIndex];
  if (!g) return "";
  const dlgNums = dialogueNumbers(script);
  const lines: string[] = [];
  // v5.24 第 1 档【0】：全局头（风格锁定句 + 郑重声明）只在镜头 1
  // 写一次，四档一致；镜头 2 起直接从本镜内容起（2.5 的一句话概
  // 述是本镜数据拼的、不是全局头，逐镜头保留）。
  if (groupIndex === 0) {
    lines.push(...styleLinesForModel(script, model));
  }
  if (model === "seedance25") {
    lines.push(overviewLineFor25(script, ctx, g, dlgNums, groupIndex));
  }
  lines.push("");
  if (groupIndex === 0) {
    lines.push(...videoDeclarationLines(), "");
  }
  lines.push(...mappingLinesForModel(script, g, ctx, opts, model));
  // v5.24 第 1 档：四档共用——角色映射块之后加 @Image N 绑定行
  // （与通用版 buildSingleGroupText 同一位置口径）。
  const bindingLine = lensImageBindingLine(script, g, ctx);
  if (bindingLine) lines.push(bindingLine);
  lines.push("");
  if (isFastOrMini(model)) {
    // v4.99 单镜锁死版开头：锁死句单独一行，其后固定站位只写一次
    // （与 2.0 / 2.5 每拍站位行同一句原文），再进动作序列。固定
    // 站位为空时这一行不写（v4.95 口径）。
    lines.push(lockLineForFastMini(script, ctx, g, groupIndex, dlgNums));
    const blocking = groupBlockingLine(g);
    if (blocking) lines.push(blocking);
    lines.push("");
  }
  lines.push(...beatLinesForModel(script, ctx, g, groupIndex, dlgNums, model));
  lines.push(ASSET_PRIORITY_RULE);
  // v5.91：只有重分组版本（Seedance 20–30 秒版 / 强制 30 秒版）
  // 在末尾多带切镜规则一行；按剧情版不带、逐字照旧。
  if (opts?.actionCutRule) lines.push(ACTION_CUT_RULE_LINE);
  return lines.join("\n").trim();
}

// ---------------------------------------------------------------------------
// v5.21 锁人③：镜头包——逐镜头一键复制从「纯文字」升级为带附图清
// 单的镜头包：清单点名本镜头每位出场人物的稳定 characterId 与要
// attach 的单人头部特写（从人物资产图右侧特写区裁出；v5.22 已删
// 分镜页的「下载参考图包」自动裁切打包，裁切不准、改由用户自备），生成
// 方式改走图生视频：镜头 1 用人物特写图起画，镜头 N>1 用上一镜
// 头末帧截图作首帧图 + 本镜人物特写双图输入。清单段是给用户的
// 操作说明（不用粘给模型），其后的提示词正文与
// buildSingleGroupTextForModel 逐字一致、四档口径不变。
// ---------------------------------------------------------------------------

export interface LensCastEntry {
  code: string;
  alias: string;
  label: string;
  characterId: number | null;
  hasImage: boolean;
}

/** 本镜头出场人物（lensMappings 口径）+ 稳定 characterId / 有无图。 */
export function lensCastEntries(
  script: ScriptData,
  group: ScriptGroup,
  ctx?: LensMappingContext,
): LensCastEntry[] {
  const m = lensMappings(script, group, ctx);
  const aliasByCode = new Map(
    projectCharacterAliases(script, ctx).map((p) => [p.code, p.alias]),
  );
  return m.characters.map((c) => {
    const alias = aliasByCode.get(c.name) ?? "";
    return {
      code: c.name,
      alias,
      label: characterMappingLabel(c.name, alias),
      characterId: c.characterId,
      hasImage: c.hasImage,
    };
  });
}

/**
 * v5.24（1:1 复刻升级第 1 档）：人物—参考图绑定行——把本镜头出场
 * 人物逐人绑到用户 attach 的参考图编号上（@Image N），让模型不用
 * 再猜哪张脸是谁。编号口径（用户拍板 (a)）：跟随 lensCastEntries
 * 的实际出场顺序、与镜头包附图清单同序；只有真有资产图的人物才
 * 占编号，无资产图的写「暂无参考图」不占号（没图可 attach 就不
 * 该让后面的编号错位）。本镜头没人出场时返回空串、不进正文。
 * 拼装位置：角色映射块之后（通用版与四档共用）。
 */
export function lensImageBindingLine(
  script: ScriptData,
  group: ScriptGroup,
  ctx?: LensMappingContext,
): string {
  const cast = lensCastEntries(script, group, ctx);
  if (cast.length === 0) return "";
  let n = 0;
  const parts = cast.map((e) => {
    if (!e.hasImage) return `${e.label}暂无参考图`;
    n += 1;
    return `${e.label}对应参考图 @Image ${n}`;
  });
  return `参考图绑定：${parts.join("、")}。`;
}

export interface LensMappingDiffRow {
  /** 新分镜里的镜头序号（1 起）。 */
  lensIndex: number;
  title: string;
  /** 新镜头映射里的全部人物标签（出场顺序）。 */
  characters: string[];
  /** 本镜新增：新镜头有、覆盖同段节拍的旧镜头里没有的人物标签。 */
  added: string[];
  /** 本镜移出：旧镜头有、新镜头没有的人物标签。 */
  removed: string[];
}

/**
 * v5.27：重新切镜前的新旧角色映射对照（确认分镜的保存前核对用）。
 * 旧分镜取 script.storyboardGroups、新分镜是调用方按同一份共享规
 * 则（buildStoryboardGroups / buildStoryboardFromCuts /
 * buildStoryboardBySegments）本地算出的候选组；逐个新镜头与「覆
 * 盖了同一段节拍的旧镜头们」比人物集合：新镜头的人物标签走
 * lensCastEntries（与分镜页映射、镜头包附图清单同一口径），旧镜
 * 头取所有与新镜头节拍范围相交的旧镜头的人物并集。只返回有人物
 * 变化的镜头（新增或移出非空）；切法没变（每镜人物集合与旧分镜
 * 逐镜相同）时返回空数组，调用方据此直接放行、不打扰用户。没
 * 有旧分镜（首次确认）时返回空数组。
 */
export function lensMappingDiff(
  script: ScriptData,
  newGroups: ScriptGroup[],
  ctx?: LensMappingContext,
): LensMappingDiffRow[] {
  const oldGroups = script.storyboardGroups ?? [];
  if (oldGroups.length === 0 || newGroups.length === 0) return [];
  const oldView = storyboardScript(script);
  const newView: ScriptData = {
    ...script,
    stage: "storyboard",
    storyboardGroups: newGroups,
    groups: newGroups,
  };
  const rangesOf = (groups: ScriptGroup[]) => {
    const out: { start: number; end: number }[] = [];
    let cur = 0;
    for (const g of groups) {
      out.push({ start: cur, end: cur + g.beats.length });
      cur += g.beats.length;
    }
    return out;
  };
  const oldRanges = rangesOf(oldGroups);
  const newRanges = rangesOf(newGroups);
  const rows: LensMappingDiffRow[] = [];
  newGroups.forEach((g, j) => {
    const r = newRanges[j];
    if (!r) return;
    const newLabels = lensCastEntries(newView, g, ctx).map((e) => e.label);
    const oldLabels: string[] = [];
    oldGroups.forEach((og, oi) => {
      const or = oldRanges[oi];
      if (!or) return;
      if (or.start < r.end && r.start < or.end) {
        for (const e of lensCastEntries(oldView, og, ctx)) {
          if (!oldLabels.includes(e.label)) oldLabels.push(e.label);
        }
      }
    });
    const added = newLabels.filter((l) => !oldLabels.includes(l));
    const removed = oldLabels.filter((l) => !newLabels.includes(l));
    if (added.length > 0 || removed.length > 0) {
      rows.push({
        lensIndex: j + 1,
        title: g.title,
        characters: newLabels,
        added,
        removed,
      });
    }
  });
  return rows;
}

export function buildLensPackageText(
  script: ScriptData,
  groupIndex: number,
  ctx?: LensMappingContext,
  opts?: LensMappingOptions & { videoModel?: VideoModelId },
): string {
  const model = videoModelById(opts?.videoModel ?? "seedance25");
  const tl = computeTimeline(script);
  const g = tl.groups[groupIndex];
  if (!g) return "";
  const cast = lensCastEntries(script, g, ctx);
  const lines: string[] = [];
  lines.push(
    `【镜头包】镜头${groupIndex + 1}｜${g.title} · ${model.label} · 图生视频`,
  );
  lines.push("操作清单（这一段是给你照着 attach 图片用的，不用粘给模型）：");
  lines.push(
    "生成方式：图生视频——先把下面附图按编号 attach 到生成工具（豆包 / Seedance）的参考图，再粘贴后面的提示词正文；不要纯文字生成，纯文字就是之前人物乱跳、错人开口的原因。",
  );
  lines.push(
    "附图清单（编号与提示词正文里的「参考图绑定」行同序同号：只有真有资产图的人物才占编号）：",
  );
  if (cast.length === 0) {
    lines.push("本镜头没有出场人物，不用附图。");
  } else {
    // v5.27：编号口径与 lensImageBindingLine 统一为「有图才占号」——
    // 旧口径清单按出场顺序给所有人编号（含无图者）、绑定行只给有
    // 图者编号，两套编号在同一镜头里对不上（无图者夹在中间时，
    // 清单 #3 与正文 @Image 3 不是同一个人），用户 attach 图片时
    // 极易对错位。无图者改列「无附图」行、不占号。
    let imgNo = 0;
    cast.forEach((e) => {
      const idText =
        e.characterId != null ? ` · characterId ${e.characterId}` : "";
      if (e.hasImage) {
        imgNo += 1;
        lines.push(
          `附图 #${imgNo} = ${e.label} 的单人头部特写（从他的人物资产图右侧头部特写区裁出）${idText}`,
        );
      } else {
        lines.push(
          `无附图 = ${e.label}：暂无人物资产图，这一位没有附图可传，只能靠正文造型句锁定，生成时盯紧别换脸${idText}`,
        );
      }
    });
  }
  if (groupIndex === 0) {
    lines.push(
      "首帧：这是第一个镜头，没有上一镜头末帧——首帧直接用附图里第一位人物的头部特写起画（或按正文第一拍画面先生一张首帧图）。",
    );
  } else {
    lines.push(
      "首帧：把上一镜头生成好的视频截最后一帧存成图片，作为本镜头的首帧图上传；再 attach 本镜头附图，首帧图 + 人物特写图双图输入（首帧管衔接、特写管长相）。",
    );
  }
  lines.push("");
  lines.push("【提示词正文（从下一行开始整段粘给模型）】");
  lines.push(buildSingleGroupTextForModel(script, groupIndex, ctx, opts));
  return lines.join("\n").trim();
}

// ---------------------------------------------------------------------------
// v5.31 MiniMax H3 六段式提示词拼装（两版：按剧情版 + 每镜 10–15 秒版；
// v5.90 起第 2 版由 20–30 秒版改为 10–15 秒版、按转折点切镜）
//
// v5.30 的未兑现项：H3 两版此前只在聊天解剖流程里出词、工作台内没
// 有拼装，人物表改了造型 / 性别 / 音色点「同步到分镜提示词」后 H3
// 带不上新值。这一节把拼装做进工作台：与四档 Seedance / 通用版同
// 源——全部从 characterRows + 人物卡现算（resolveCharacterInfo 的
// canonical 造型句与 voiceMap 音色、lensCastEntries 的出场顺序与
// 有无资产图），人物表一同步保存，这一节的输出自动跟着变，没有
// 第二份缓存。格式按 MiniMax H3 中文提示词规范（用户上传的
// minimax-h3-zh-prompt 资料）：六段固定顺序 subject_definitions /
// summary / retention_analysis / detailed_description /
// overall_soundscape / non_diegetic_music，段间空一行；叙述简体中
// 文、结构标签保持英文；只输出提示词本身（逐镜头复制时不带任何
// 工作台说明）。确定性拼装口径（不编造）：
//   · 一镜头 = 一段 H3 提示词，[Shot N] = 镜头内节拍，一拍一镜、
//     按原序从 [Shot 1] 编到 [Shot N]，不删拍、不并拍、不跳号；
//     [Shot 2] 起带相对本镜头起点的 At MM:SS.mmm 切点（< 总时长）。
//   · <Subject N> 按本镜头出场顺序编号（与 lensCastEntries / 镜
//     头包附图清单同序）；<Picture N> 只给真有资产图的人物编号
//     （有图才占号，与 v5.24 绑定行同口径），没图的人物定义句不
//     写 <Picture N>、不虚构参考图。定义句 =「<Subject N> 是
//     <Picture N> 中的{身份首段}，{canonical 造型}。」+ 音色句
//     （音色是同步范围的一部分，定义段是它在 H3 里的落点）。
//   · (Sx) 按本镜头内发声顺序从 (S1) 起编、同一人全程复用；台词
//     逐字照节拍原文，结构 = 主体标签 + (Sx) + 中文发声动词（由
//     本拍 emotion 确定性映射）+ <d>[Chinese] 台词</d>；多人同说
//     一句（说话人栏多个代号）走 (S1,S2) 齐声式。说话人认不到
//     已定义主体时按剧本原名引用、不编造主体。
//   · 画面文本走与 lensVisualFixers 同一套提炼（描述词 / 集体名
//     词展开），只是把人物标签换成 <Subject N>；运镜写英文枚举
//     （Push In / Static Shot 等，由画面运镜词确定性映射，
//     认不出回 Static Shot；裸「摇镜」无方向时定
//     Pan Left，中文句仍写「缓缓摇动」不编方向）。
//   · retention 的 appears in 与正文实际写出的 [Shot N] 同源计
//     算（在场集合 = lensScreenCasts inclusive ∪ 本拍说话人）。
//   · 风格开场取项目全片风格锁定句的中文行；环境音只用节拍自
//     带的音效原文汇总，不新编声音；不要配乐 → non_diegetic_
//     music 恒写 N/A（工作台没有配乐数据）。
// 两版的差别只在镜头分组：按剧情版 = 已确认的 storyboardGroups
// 原样；10–15 秒版（v5.90）= 把同一批节拍按顺序重新并成每镜
// 10–15 秒的组，换镜优先落在剧情转折点上（见 h3ShortGroups）。
// v5.91 起 10–15 秒版多一条：同一个动作没做完不切镜（动作链整
// 段同进同出，见 actionUnits 上方说明），且逐镜正文开场带切镜
// 规则一句；按剧情版分组与文本逐字不变。
// v6.12 起两版再加「身高与衔接」纯文字口径（用户定：人物资产图
// 已生成好、图不能改，只能改提示词文字；定版图 / 首帧图路线不
// 做）：①人物行 heightAnchor（身高锚点，用户手填）有值时原样
// 追加到该人物 H3 定义句末尾，空值定义句一字不变；②summary
// 末尾恒加「全片人物相对身高、左右站位与光线方向保持不变。」；
// ③retention 每人保留行加「相对身高与体型保持不变」、另加一
// 行场景保留行带「光线方向保持不变」（已有同义句不重复加）；
// ④detailed_description 逐拍新规（两版同口径，句序全片统一：
// 承接句 → 停顿句 → 机位句 → 尺度锁句 → 平视机位句 → 画面句
// → 末帧 / 结束姿态句 → 音效句 → 台词句）：多人同框且非特写 /
// 近景的拍在机位句后带一段固定尺度锁句（H3_SCALE_LOCK，全片
// 逐字复用同一句）；第 2 拍起带承接句——只复述上一拍末帧状态
// （splitVisualFinal 的末帧文本经同一套标签提炼，缺数据就少
// 写、绝不编造），其后接「先停顿约半秒，再开始本镜的主要动
// 作。」再出本拍内容与对白；每拍结尾确保有停得住的结束姿态
// （原文有「末帧」走既有末帧句、末帧片段本身带停住类词视为
// 已有，都没有时才补一句通用停住句，不新增动作 / 道具 / 位
// 置）；多人全身 / 中景类拍（全景 / 中全景 / 中景）原文未指定
// 仰拍 / 俯拍时加「镜头为平视机位。」一句、已指定的机位句一
// 字不动，近景 / 特写不加任何身高要求句。跨切标记：本拼装此
// 前没有 <scenetrans> / <cutoff> 的既有规范，本版不自创新格
// 式（见 v6.12 回执说明）；不写「首帧等于上一镜末帧」类承诺、
// 不新增参考图编号。
// 重分组只影响这一节的 H3 输出，不动已确认的分镜结构、不写回
// 任何数据。旧 20–30 秒分组（h3DurationGroups）H3 不再使用，
// 只剩 Seedance 每镜 20–30 秒版继续用同一函数。
// ---------------------------------------------------------------------------

export interface H3LensPrompt {
  /** 本版内的镜头序号（1 起）。 */
  lensIndex: number;
  title: string;
  /** 本镜头时长（秒，computeTimeline 口径）。 */
  duration: number;
  /** [Shot N] 数 = 本镜头节拍数。 */
  shotCount: number;
  /** 六段提示词全文（只含提示词本身）。 */
  text: string;
}

/** H3 切点时间码：MM:SS.mmm（相对本镜头起点）。 */
function h3Timecode(sec: number): string {
  const t = Math.max(0, sec);
  let m = Math.floor(t / 60);
  const s = t - m * 60;
  let ss = Math.floor(s);
  let ms = Math.round((s - ss) * 1000);
  if (ms >= 1000) {
    ms = 0;
    ss += 1;
  }
  if (ss >= 60) {
    ss = 0;
    m += 1;
  }
  return `${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
}

/** 一批摊平节拍 → 一个镜头组（标题首段 → 末段、场景名拆分去重，
 * 与 rules 的 segmentTitle / segmentScenes 同口径）。 */
function h3GroupFromFlat(items: FlatBeat[]): ScriptGroup {
  const firstTitle = items[0]?.sectionTitle ?? "";
  const lastTitle = items[items.length - 1]?.sectionTitle ?? firstTitle;
  const scenes: string[] = [];
  for (const fb of items) {
    for (const part of (fb.sceneName ?? "").split("/")) {
      const s = part.trim();
      if (s && !scenes.includes(s)) scenes.push(s);
    }
  }
  return {
    title:
      lastTitle && lastTitle !== firstTitle
        ? `${firstTitle} → ${lastTitle}`
        : firstTitle,
    sceneName: scenes.join(" / "),
    beats: items.map((fb) => fb.beat),
  };
}

// ---------------------------------------------------------------------------
// v5.91 动作没做完不切镜（问题 #23「111220」追加，用户原话「同一
// 个动作没做完别切新镜头」）：三个重分组版本（H3 每镜 10–15 秒
// 版 / Seedance 每镜 20–30 秒版 / Seedance 强制 30 秒版）切镜头
// 时多一条硬规矩——同一个动作的连续节拍（下称「动作链」）整段
// 装进同一个镜头，不许从动作中间切开。判定（确定性，只看节拍
// 自带信号，与 rules.shotCutReason 同一套信号源）：下一拍相对
// 上一拍同段、同场，切分原因不是强信号（场景转场 / 悬念·反转
// 点 / 人物出入场 / 开场节拍），并命中任一续接证据——①两拍都
// 没有台词（无声动作相连）；②下一拍画面带续接词（继续 / 接着 /
// 紧接着 / 随后 / 仍然 / 仍在 / 还在 / 同全景 / 同机位 / 同画
// 面）；③下一拍画面是「边…边…」句式（前一个动作在本拍进行
// 中）。装组时一个动作链 = 一个单元（整段同进同出）：链装不进
// 当前镜就整段挪到下一镜（强制 30 秒版宁可多留白）。链本身比
// 装组上限还长时（H3 版 18 秒 = 15 秒目标 + 宽限、Seedance 两
// 版 30 秒）装不进任何一镜，只能退回逐拍装、在节拍边界切（节
// 拍仍不可拆）。按剧情版不走重分组、不受这条规矩影响。
// ---------------------------------------------------------------------------

const ACTION_CHAIN_BREAK_REASONS = new Set([
  "场景转场",
  "悬念/反转点",
  "人物出入场",
  "开场节拍",
]);

const ACTION_CONTINUE_RE =
  /继续|接着|紧接着|随后|仍然|仍在|还在|同全景|同机位|同画面/;

const ACTION_WHILE_RE = /边[^，。；、]{1,10}边/;

/** 下一拍是否续接上一拍没做完的同一个动作（见上方 v5.91 说明）。 */
function beatContinuesAction(prev: FlatBeat, fb: FlatBeat): boolean {
  if (fb.sectionTitle !== prev.sectionTitle) return false;
  if (fb.sceneName !== prev.sceneName) return false;
  if (ACTION_CHAIN_BREAK_REASONS.has(fb.cutReason)) return false;
  const a = prev.beat;
  const b = fb.beat;
  if (a.line.trim() === "" && b.line.trim() === "") return true;
  const visual = b.visual ?? "";
  return ACTION_CONTINUE_RE.test(visual) || ACTION_WHILE_RE.test(visual);
}

interface ActionUnit {
  items: FlatBeat[];
  duration: number;
  /** 所属动作链编号（同一链拆出的逐拍单元共用一个编号）。 */
  chainId: number;
}

/**
 * 把摊平节拍并成「装组单元」：一个动作链 = 一个单元（整段同进
 * 同出）；链本身长于 splitAboveSec 时装不进任何一镜，退回逐拍
 * 单元（仍共用 chainId，调用方据此认出链内边界）。
 */
function actionUnits(flat: FlatBeat[], splitAboveSec: number): ActionUnit[] {
  const chains: FlatBeat[][] = [];
  flat.forEach((fb, i) => {
    const prev = i > 0 ? flat[i - 1] : undefined;
    const last = chains[chains.length - 1];
    if (prev && last && beatContinuesAction(prev, fb)) {
      last.push(fb);
    } else {
      chains.push([fb]);
    }
  });
  const units: ActionUnit[] = [];
  chains.forEach((items, chainId) => {
    const duration = items.reduce((s, fb) => s + fb.duration, 0);
    if (items.length > 1 && duration > splitAboveSec) {
      for (const fb of items) {
        units.push({ items: [fb], duration: fb.duration, chainId });
      }
    } else {
      units.push({ items, duration, chainId });
    }
  });
  return units;
}

/**
 * 20–30 秒分组：全片节拍（分镜阶段口径）按顺序重新并组，目标
 * 是每组高于 20 秒、低于 30 秒。算法（确定性）：先按总时长 ÷
 * 25 秒定组数 n（四舍五入、至少 1），每组目标秒数 = 总时长 ÷
 * n；逐拍累积，当前组已达目标秒数、或再并一拍就会到 30 秒
 * （且当前组已 ≥15 秒）时收组，最后一组取剩余——避免先把前
 * 面的组塞满、末尾留个十秒碎组。节拍不可拆，个别组仍可能略
 * 超范围（单拍过长 / 总时长本身凑不进区间），界面逐段标实际
 * 秒数。v5.90 起 H3 第 2 版改用 h3ShortGroups（10–15 秒、按转
 * 折点切），本函数只剩 Seedance 每镜 20–30 秒版使用，不写回
 * 分镜结构。v5.91 起按 actionUnits 装组：同一个动作没做完不切
 * 开，动作链整段同进同出（见 actionUnits 上方说明）；没有动作
 * 链时（单元 = 单拍）与旧口径逐字一致。
 */
export function h3DurationGroups(script: ScriptData): ScriptGroup[] {
  const view = storyboardScript(script);
  const flat = flattenStoryboardBeats(view);
  if (flat.length === 0) return [];
  const total = flat.reduce((s, fb) => s + fb.duration, 0);
  const n = Math.max(1, Math.min(flat.length, Math.round(total / 25)));
  const target = total / n;
  const units = actionUnits(flat, 30);
  const packs: { items: FlatBeat[]; duration: number }[] = [];
  let cur: { items: FlatBeat[]; duration: number } = { items: [], duration: 0 };
  units.forEach((u, i) => {
    const isLastUnit = i === units.length - 1;
    if (
      cur.items.length > 0 &&
      packs.length < n - 1 &&
      !isLastUnit &&
      cur.duration >= 15 &&
      (cur.duration >= target || cur.duration + u.duration >= 30)
    ) {
      packs.push(cur);
      cur = { items: [], duration: 0 };
    }
    cur.items.push(...u.items);
    cur.duration += u.duration;
  });
  if (cur.items.length > 0) packs.push(cur);
  return packs.map((p) => h3GroupFromFlat(p.items));
}

/**
 * v5.90 H3 第 2 版（每镜 10–15 秒版）的镜头分组：按剧情切割、
 * 在转折点换镜。转折点（下一拍相对上一拍）= ①强信号：下一拍
 * 切分原因 ∈ {场景转场，悬念/反转点，人物出入场}（rules.
 * shotCutReason 口径，与 suggestPlotCuts 的强切点同一套）；
 * ②换段 / 换场：sectionTitle 或 sceneName 与上一拍不同；
 * ③说话人交接：相邻两拍说话人不同、且至少一拍有台词（换人
 * 说话或另一人开口）；④情绪变化：相邻两拍情绪不同、且至少一
 * 拍有台词。（③④比 shotCutReason 的「说话人切换 / 情绪转折」
 * 略宽：那边要求两拍都有台词，无台词拍接台词拍的交接在那边只
 * 记「动作转折」、在这里仍算转折点。）算法（确定性）：逐拍累
 * 积——当前组攒够 10 秒后，遇到转折点就在转折点之前收组、新
 * 镜头从转折拍开始；没攒够 10 秒时即使遇到转折点也不切（不
 * 留碎组）；一直没等到转折点、当前组已满 15 秒时才在当前拍
 * 收组（再等只会更超）。节拍不可拆：转折点来得晚时个别组会
 * 略超 15 秒、单拍本身超 15 秒时该组只能超、最后一组可能不
 * 足 10 秒，界面逐段标实际秒数。只用于 H3 10–15 秒版拼装，
 * 不写回分镜结构。v5.91 起按 actionUnits 装组：切点正赶上一个
 * 动作做到一半时不切、等动作做完（动作链整段同进同出，组可
 * 因此到 18 秒）；动作链本身比 18 秒还长时退回逐拍装，链内边
 * 界上转折点不切、只认满 15 秒的兜底切（动作链比一镜还长，
 * 只能在节拍边界切开）。没有动作链时与旧口径逐字一致。
 */
const H3_STRONG_CUT_REASONS = new Set([
  "场景转场",
  "悬念/反转点",
  "人物出入场",
]);

function h3IsTurningPoint(prev: FlatBeat, fb: FlatBeat): boolean {
  if (H3_STRONG_CUT_REASONS.has(fb.cutReason)) return true;
  if (fb.sectionTitle !== prev.sectionTitle) return true;
  if (fb.sceneName !== prev.sceneName) return true;
  const a = prev.beat;
  const b = fb.beat;
  const eitherHasLine = a.line.trim() !== "" || b.line.trim() !== "";
  if (!eitherHasLine) return false;
  if (
    a.speaker.trim() !== "" &&
    b.speaker.trim() !== "" &&
    a.speaker.trim() !== b.speaker.trim()
  ) {
    return true;
  }
  if (
    a.emotion.trim() !== "" &&
    b.emotion.trim() !== "" &&
    a.emotion.trim() !== b.emotion.trim()
  ) {
    return true;
  }
  return false;
}

export function h3ShortGroups(script: ScriptData): ScriptGroup[] {
  const view = storyboardScript(script);
  const flat = flattenStoryboardBeats(view);
  if (flat.length === 0) return [];
  const units = actionUnits(flat, 18);
  const packs: { items: FlatBeat[]; duration: number }[] = [];
  let cur: { items: FlatBeat[]; duration: number } = { items: [], duration: 0 };
  let prevUnit: ActionUnit | null = null;
  for (const u of units) {
    if (cur.items.length > 0 && prevUnit) {
      const prevBeat = prevUnit.items[prevUnit.items.length - 1];
      const firstBeat = u.items[0];
      // 链内边界 = 同一动作链被 18 秒上限拆成逐拍单元后的单元
      // 之间：动作还没做完，转折点不切、只认满 15 秒兜底切。
      const midChain = u.chainId === prevUnit.chainId;
      const isTurningPoint =
        prevBeat != null &&
        firstBeat != null &&
        h3IsTurningPoint(prevBeat, firstBeat);
      if (
        (!midChain &&
          ((cur.duration >= 10 && isTurningPoint) || cur.duration >= 15)) ||
        (midChain && cur.duration >= 15)
      ) {
        packs.push(cur);
        cur = { items: [], duration: 0 };
      }
    }
    cur.items.push(...u.items);
    cur.duration += u.duration;
    prevUnit = u;
  }
  if (cur.items.length > 0) packs.push(cur);
  return packs.map((p) => h3GroupFromFlat(p.items));
}

/** 本拍音效原文分项（去掉 <…> 包裹，与 formatSfx 同切分口径）。 */
function h3SfxParts(sfx: string): string[] {
  return (sfx ?? "")
    .split(/[、,，;；+]+/)
    .map((s) => s.trim().replace(/^[<《]+|[>》]+$/g, "").trim())
    .filter(Boolean);
}

/** H3 发声动词：由本拍 emotion 确定性映射（语气写在 <d> 外面）。 */
function h3SpeakVerb(emotion: string): string {
  const e = (emotion ?? "").trim();
  if (!e) return "说出";
  if (/喊|吼|叫嚷/.test(e)) return "喊出";
  if (/低声|小声|轻声|悄声|低语/.test(e)) return "低声说出";
  if (/笑/.test(e)) return "带着笑意说出";
  if (/哭|哽咽|颤抖|发抖|哽/.test(e)) return "颤抖着说出";
  if (/怒|愤|生气|质问/.test(e)) return "提高声音说出";
  if (/温柔|温和|轻柔/.test(e)) return "温和地说出";
  if (/惊|急|慌/.test(e)) return "急切地说出";
  if (e.length <= 5) return `${e}地说出`;
  return "说出";
}

const H3_SCALE_WORDS = [
  "大特写",
  "中全景",
  "中近景",
  "全景",
  "近景",
  "特写",
  "远景",
  "中景",
] as const;

/** v6.12 尺度锁句（固定全文）：多人同框且非特写 / 近景的拍在机
 * 位句后原样带这一句，全片每个符合条件的镜头一字不改地复用。 */
const H3_SCALE_LOCK =
  "参考图只用于锁定脸型、发型与服装，不用于决定身高与身材比例；各人相对身高与体型全片保持不变；同框站立时双脚站在同一地面上，不垫高、不错位站立，不因机位变化改变相对身高。";

/** v6.12 近景家族（特写 / 近景类）：这些景别的拍不加尺度锁句、
 * 不加任何身高要求句（中近景含「近景」、按近景家族处理）。 */
const H3_CLOSE_SCALES: ReadonlySet<string> = new Set([
  "大特写",
  "特写",
  "近景",
  "中近景",
]);

/** v6.12 停得住的结束状态词：本拍末帧片段里带任一词，视为结尾
 * 已有可停住的结束姿态，不再补通用停住句。 */
const H3_HOLD_WORDS = [
  "停住",
  "停在",
  "停下",
  "站定",
  "站住",
  "坐定",
  "定格",
  "落下",
  "垂下",
  "放下",
  "看向",
  "望向",
  "盯着",
  "静止",
  "不动",
  "收住",
  "顿住",
];

/** 本拍机位句：景别 + 英文运镜枚举 + 中文运镜说明（一段一句）。 */
function h3CameraSentence(beat: Beat): string {
  const v = beat.visual ?? "";
  const scale = H3_SCALE_WORDS.find((s) => v.includes(s)) ?? "中景";
  const moveText = v;
  let move = "Static Shot";
  let suffix = "镜头保持静止";
  if (/跟拍|跟随/.test(moveText)) {
    move = "Tracking Shot";
    suffix = "镜头跟随主体移动";
  } else if (/推/.test(moveText)) {
    move = "Push In";
    suffix = "镜头缓缓推近";
  } else if (/拉/.test(moveText)) {
    move = "Pull Out";
    suffix = "镜头缓缓拉远";
  } else if (/环绕/.test(moveText)) {
    move = "Arc Shot";
    suffix = "镜头绕主体环绕移动";
  } else if (/左摇|摇向左/.test(moveText)) {
    move = "Pan Left";
    suffix = "镜头向左摇";
  } else if (/右摇|摇向右/.test(moveText)) {
    move = "Pan Right";
    suffix = "镜头向右摇";
  } else if (/摇/.test(moveText)) {
    // 裸「摇镜」没有方向信息：英文枚举定 Pan Left，中文句不编方向。
    move = "Pan Left";
    suffix = "镜头缓缓摇动";
  } else if (/左移/.test(moveText)) {
    move = "Truck Left";
    suffix = "镜头向左平移";
  } else if (/右移/.test(moveText)) {
    move = "Truck Right";
    suffix = "镜头向右平移";
  } else if (/上摇/.test(moveText)) {
    move = "Tilt Up";
    suffix = "镜头向上摇";
  } else if (/下摇/.test(moveText)) {
    move = "Tilt Down";
    suffix = "镜头向下摇";
  } else if (/手持/.test(moveText)) {
    move = "Shake Slightly";
    suffix = "手持轻微晃动";
  }
  return `${scale}，${move}，${suffix}。`;
}

/** 集体名词展开（H3 版）：与 expandCollectiveMatch 同口径，展开
 * 文本里的人物标签换成 <Subject N>；展开不了返回 null。 */
function h3ExpandCollective(
  count: number,
  kind: string,
  counter: string,
  cast: LensScreenCast,
  descriptors: CharacterVisualDescriptor[],
  tagOf: Map<string, string>,
): string | null {
  const info = collectivePickInfo(count, kind, cast, descriptors);
  if (!info) return null;
  const tags = info.picked
    .map((d) => tagOf.get(d.code))
    .filter((t): t is string => Boolean(t));
  if (tags.length === 0) return null;
  if (info.total === count) return tags.join("、");
  const rest = count - info.total;
  const restText = REMAINDER_NUMERALS[rest] ?? String(rest);
  const unit =
    counter || (kind === "村民" || kind === "热心村民" ? "名" : "个");
  return `${tags.join("、")}和另外${restText}${unit}${kind}`;
}

function h3ExpandCollectivesInText(
  text: string,
  cast: LensScreenCast,
  descriptors: CharacterVisualDescriptor[],
  tagOf: Map<string, string>,
): string {
  return (text ?? "").replace(
    COLLECTIVE_RE,
    (
      whole: string,
      numRaw: string,
      counter: string,
      kind: string,
      offset: number,
      src: string,
    ) => {
      if (offset >= 2 && src.slice(offset - 2, offset) === "另外") {
        return whole;
      }
      const count =
        COLLECTIVE_NUMERALS[numRaw] ?? Number.parseInt(numRaw, 10);
      return (
        h3ExpandCollective(count, kind, counter ?? "", cast, descriptors, tagOf) ??
        whole
      );
    },
  );
}

/**
 * H3 版画面文本修正：与 lensVisualFixers 同一套提炼（集体名词先
 * 占位保护、再换描述词、最后兜底展开），人物标签一律换成
 * <Subject N>；另外补两类 H3 必须的引用形式——「A（小帅）」标
 * 签形与裸代号（代号式人物名、非字母边界守卫），保证正文里人
 * 物只以主体标签出现。
 */
function h3FixVisualText(
  text: string,
  cast: LensScreenCast,
  descriptors: CharacterVisualDescriptor[],
  tagOf: Map<string, string>,
): string {
  const pairs: { descriptor: string; label: string }[] = [];
  for (const d of descriptors) {
    const tag = tagOf.get(d.code);
    if (!tag) continue;
    for (const w of [...d.strong, ...d.weak]) {
      if (w !== tag) pairs.push({ descriptor: w, label: tag });
    }
    if (d.label && d.label !== tag) {
      pairs.push({ descriptor: d.label, label: tag });
    }
  }
  const held: string[] = [];
  const shielded = (text ?? "").replace(
    COLLECTIVE_RE,
    (
      whole: string,
      numRaw: string,
      counter: string,
      kind: string,
      offset: number,
      src: string,
    ) => {
      if (offset >= 2 && src.slice(offset - 2, offset) === "另外") {
        return whole;
      }
      const count =
        COLLECTIVE_NUMERALS[numRaw] ?? Number.parseInt(numRaw, 10);
      const expanded = h3ExpandCollective(
        count,
        kind,
        counter ?? "",
        cast,
        descriptors,
        tagOf,
      );
      if (!expanded) return whole;
      const token = `\uE200${held.length}\uE201`;
      held.push(expanded);
      return token;
    },
  );
  let out = replaceDescriptorsInText(shielded, pairs);
  for (let i = 0; i < held.length; i++) {
    out = out.split(`\uE200${i}\uE201`).join(held[i] ?? "");
  }
  out = h3ExpandCollectivesInText(out, cast, descriptors, tagOf);
  // 裸代号补替换：只对代号式人物名（1–2 个英文字母）、只在非字母
  // 边界处替换，避免误伤英文词与已生成的 <Subject N> 标签。
  for (const d of descriptors) {
    const tag = tagOf.get(d.code);
    if (!tag || !isCodeCharacterName(d.code)) continue;
    const re = new RegExp(`(^|[^A-Za-z])${d.code}(?=$|[^A-Za-z])`, "g");
    out = out.replace(re, (_m: string, pre: string) => `${pre}${tag}`);
  }
  return out;
}

/**
 * 一个镜头的 H3 六段提示词全文。script 必须是「groups = 目标分
 * 组」的视图（按剧情版传 storyboardScript(script)，10–15 秒版
 * 传换上 h3ShortGroups 的视图），groupIndex 是该视图内的镜
 * 头下标。镜头不存在返回空串。
 */
export function buildH3TextForGroup(
  script: ScriptData,
  groupIndex: number,
  ctx?: LensMappingContext,
  opts?: { actionCutRule?: boolean },
): string {
  const tl = computeTimeline(script);
  const g = tl.groups[groupIndex];
  if (!g) return "";
  const cast = lensCastEntries(script, g, ctx);
  // 主体编号：按出场顺序（lensCastEntries 与附图清单同序）；
  // 参考图编号只有真有资产图的人物才占号（与绑定行同口径）。
  const tagOf = new Map<string, string>();
  const pictureOf = new Map<string, number>();
  cast.forEach((e, i) => {
    tagOf.set(e.code, `<Subject ${i + 1}>`);
    if (e.hasImage) pictureOf.set(e.code, pictureOf.size + 1);
  });
  const infos = new Map(
    cast.map((e) => [e.code, resolveCharacterInfo(e.code, script, ctx)]),
  );
  const descriptors = characterVisualDescriptors(script, ctx);
  const screenCasts = lensScreenCasts(script, groupIndex, ctx);

  // 说话人解析：说话人栏整体 / 分段命中出场人物的代号、别名或
  // 标签才绑主体；多段全部命中且 ≥2 人 = 齐声。认不到返回 null，
  // 正文按剧本原名引用、不编造主体。
  const resolveSpeaker = (
    raw: string,
  ): { codes: string[]; chorus: boolean } | null => {
    const whole = (raw ?? "").trim();
    if (!whole) return null;
    const byName = (p: string): string | null => {
      const t = p.trim();
      if (!t) return null;
      const hit =
        cast.find((e) => e.code === t) ??
        cast.find((e) => e.alias !== "" && e.alias === t) ??
        cast.find((e) => e.label === t);
      return hit ? hit.code : null;
    };
    const parts = whole
      .split(/[、,，/＋+]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length >= 2) {
      const codes = parts.map(byName);
      if (codes.every((c): c is string => c != null)) {
        return { codes: [...new Set(codes)], chorus: true };
      }
    }
    const single = byName(whole);
    return single ? { codes: [single], chorus: false } : null;
  };

  // (Sx) 编号：按本镜头内发声顺序逐人分配、同一人全程复用（齐声
  // 时拼每位说话人自己的编号作 (S1,S2)）。认不到主体的说话人按
  // 剧本原名单独占一个编号。
  const speakerNo = new Map<string, number>();
  for (const beat of g.beats) {
    if (!beat.line.trim()) continue;
    const r = resolveSpeaker(beat.speaker);
    if (r) {
      for (const c of r.codes) {
        const key = `C:${c}`;
        if (!speakerNo.has(key)) speakerNo.set(key, speakerNo.size + 1);
      }
    } else {
      const key = `R:${beat.speaker.trim()}`;
      if (!speakerNo.has(key)) speakerNo.set(key, speakerNo.size + 1);
    }
  }

  // 每位主体出现的 [Shot N]（retention 的 appears in 与正文同源：
  // 在场 = 本拍画面在场集合 ∪ 本拍说话人）。
  const appearsIn = new Map<string, number[]>();
  g.beats.forEach((beat, bi) => {
    const present = new Set<string>(
      screenCasts[bi]?.inclusive ?? [],
    );
    const r = beat.line.trim() ? resolveSpeaker(beat.speaker) : null;
    if (r) for (const c of r.codes) present.add(c);
    for (const code of present) {
      if (!tagOf.has(code)) continue;
      const arr = appearsIn.get(code) ?? [];
      arr.push(bi + 1);
      appearsIn.set(code, arr);
    }
  });

  // ---- detailed_description -------------------------------------------
  const styleChinese = filmStyleLockLines(script).filter((l) =>
    /[一-鿿]/.test(l),
  );
  const styleCore = (styleChinese[0] ?? "")
    .replace(/^全片统一风格：/, "")
    .replace(/[。.\s]+$/, "");
  const sceneName = (g.sceneName ?? "").trim();
  const openingParts: string[] = [];
  if (styleCore) openingParts.push(`${styleCore}。`);
  if (sceneName) {
    openingParts.push(`本镜头场景是${sceneName}，同一场光线方向保持一致。`);
  }
  // v5.91：只有 10–15 秒版（重分组版）在开场多带切镜规则一句；
  // 按剧情版不带、逐字照旧。
  if (opts?.actionCutRule) {
    openingParts.push(
      "切镜规则：同一个动作没有做完不要切到下一个镜头，必须等当前动作完整做完、落到结束姿态之后再切镜。",
    );
  }

  const shotTexts: string[] = [];
  g.beats.forEach((beat, bi) => {
    const beatCast = screenCasts[bi] ?? { confirmed: [], inclusive: [] };
    const sentences: string[] = [];
    // v6.12 句序（全片统一）：承接句 → 停顿句 → 机位句 → 尺度锁
    // 句 → 平视机位句 → 画面句 → 末帧 / 结束姿态句 → 音效句 →
    // 台词句。
    const visualText = beat.visual ?? "";
    const scale =
      H3_SCALE_WORDS.find((s) => visualText.includes(s)) ?? "中景";
    const multiPerson = beatCast.inclusive.length >= 2;
    // 承接句（第 2 拍起）：只复述上一拍的末帧状态（splitVisual-
    // Final 的末帧文本经同一套标签提炼——站位 / 站坐 / 朝向 /
    // 道具 / 动作落点都在这段原文里），上一拍没有可用文本就整
    // 句不写、绝不编造；光向由开场场景句与 summary 的全片句承
    // 担，不在承接句里另编。
    if (bi >= 1) {
      const prevBeat = g.beats[bi - 1];
      const prevCast = screenCasts[bi - 1] ?? {
        confirmed: [],
        inclusive: [],
      };
      const prevFinal = prevBeat
        ? splitVisualFinal(prevBeat.visual ?? "").finalFrame
        : "";
      const prevFinalFixed = prevFinal
        ? h3FixVisualText(prevFinal, prevCast, descriptors, tagOf).replace(
            /[。；;\s]+$/,
            "",
          )
        : "";
      if (prevFinalFixed) {
        sentences.push(`承接上一镜结尾：${prevFinalFixed}。`);
        sentences.push("先停顿约半秒，再开始本镜的主要动作。");
      }
    }
    sentences.push(h3CameraSentence(beat));
    // 尺度锁句：多人同框且非特写 / 近景的拍才带，固定全文复用。
    if (multiPerson && !H3_CLOSE_SCALES.has(scale)) {
      sentences.push(H3_SCALE_LOCK);
    }
    // 平视机位：多人全身 / 中景类拍（全景 / 中全景 / 中景）且原
    // 文未指定仰拍 / 俯拍时才加一句；已指定的机位句一字不动。
    if (
      multiPerson &&
      (scale === "全景" || scale === "中全景" || scale === "中景") &&
      !/仰拍|俯拍|仰视|俯视|仰角|俯角/.test(visualText)
    ) {
      sentences.push("镜头为平视机位。");
    }
    const { content, finalFrame } = splitVisualFinal(beat.visual ?? "");
    const fixedContent = h3FixVisualText(
      content,
      beatCast,
      descriptors,
      tagOf,
    ).replace(/[。；;\s]+$/, "");
    if (fixedContent) sentences.push(`${fixedContent}。`);
    const fixedFinal =
      finalFrame && finalFrame !== content
        ? h3FixVisualText(finalFrame, beatCast, descriptors, tagOf).replace(
            /[。；;\s]+$/,
            "",
          )
        : "";
    let endPoseWritten = false;
    if ((beat.visual ?? "").includes("末帧") && fixedFinal) {
      sentences.push(`最后停在${fixedFinal}。`);
      endPoseWritten = true;
    }
    // 结束姿态兜底：没有末帧句、且末帧片段（无「末帧」标记时 =
    // 画面最后一小段）里也没有停得住的状态词时，才补一句通用
    // 停住句——只说停住、不新增动作 / 道具 / 位置；本拍完全没
    // 有画面文本时不补（无从谈起结束姿态）。
    if (!endPoseWritten) {
      const tailText = fixedFinal || fixedContent;
      const hasHold = H3_HOLD_WORDS.some((w) => tailText.includes(w));
      if (!hasHold && tailText) {
        sentences.push(
          beatCast.inclusive.length > 0
            ? "本镜动作在此停住，人物保持结束姿态。"
            : "画面在此停住。",
        );
      }
    }
    const sfxParts = h3SfxParts(beat.sfx);
    if (sfxParts.length > 0) {
      sentences.push(`能听到${sfxParts.join("、")}。`);
    }
    const line = beat.line.trim();
    if (line) {
      const r = resolveSpeaker(beat.speaker);
      const verb = h3SpeakVerb(beat.emotion);
      if (r && r.chorus) {
        const tags = r.codes
          .map((c) => tagOf.get(c))
          .filter((t): t is string => Boolean(t));
        const perNums = r.codes
          .map((c) => speakerNo.get(`C:${c}`))
          .filter((n): n is number => n != null);
        if (tags.length === r.codes.length && perNums.length === r.codes.length) {
          sentences.push(
            `${tags.join(" 和 ")} (${perNums.map((n) => `S${n}`).join(",")}) 齐声说出，<d>[Chinese] ${line}</d>`,
          );
        }
      } else if (r) {
        const tag = tagOf.get(r.codes[0] ?? "");
        const sNo = speakerNo.get(`C:${r.codes[0] ?? ""}`);
        if (tag && sNo != null) {
          sentences.push(
            `${tag} (S${sNo}) ${verb}，<d>[Chinese] ${line}</d>`,
          );
        }
      } else {
        // 说话人不在本镜头已定义主体里：按剧本原名引用，不断台词。
        const sNo = speakerNo.get(`R:${beat.speaker.trim()}`);
        if (sNo != null) {
          sentences.push(
            `${beat.speaker.trim()} (S${sNo}) ${verb}，<d>[Chinese] ${line}</d>`,
          );
        }
      }
    }
    const timePrefix =
      bi === 0 ? "" : ` At ${h3Timecode(beat.start - g.start)},`;
    shotTexts.push(`[Shot ${bi + 1}]${timePrefix} ${sentences.join("")}`);
  });

  // appears in 与正文逐字对齐（兜底并集）：画面文本经标签形 / 裸
  // 代号替换后点到的人，画面在场集合（描述词口径）未必检出——
  // 正文里真写出了 <Subject N> 的镜头，retention 必须有这一镜，
  // 两边不一致就是规范明令禁止的错位。
  shotTexts.forEach((t, bi) => {
    for (const m of t.matchAll(/<Subject (\d+)>/g)) {
      const e = cast[Number(m[1]) - 1];
      if (!e) continue;
      const arr = appearsIn.get(e.code) ?? [];
      if (!arr.includes(bi + 1)) {
        arr.push(bi + 1);
        appearsIn.set(e.code, arr);
      }
    }
  });
  for (const arr of appearsIn.values()) arr.sort((a, b) => a - b);

  // ---- subject_definitions --------------------------------------------
  const defLines: string[] = [];
  if (cast.length === 0) {
    defLines.push(
      `本镜头没有出场人物${sceneName ? `，只有${sceneName}的空镜与环境` : ""}。`,
    );
  }
  cast.forEach((e, i) => {
    const info = infos.get(e.code);
    const lookText = (info?.look ?? "")
      .split(/[；;]+/)
      .map((x) => x.trim())
      .filter(Boolean)
      .join("，");
    const row = script.characterRows.find((r) => r.name.trim() === e.code);
    const identityFirst =
      (row?.identity ?? info?.role ?? "")
        .split(/[，,、；;]+/)
        .map((x) => x.trim())
        .filter(Boolean)[0] ?? "";
    const descParts: string[] = [];
    if (identityFirst && !lookText.includes(identityFirst)) {
      descParts.push(identityFirst);
    }
    if (lookText) descParts.push(lookText);
    const desc = descParts.join("，") || e.label;
    const pic = pictureOf.get(e.code);
    let lineText =
      pic != null
        ? `<Subject ${i + 1}> 是 <Picture ${pic}> 中的${desc}。`
        : `<Subject ${i + 1}> 是${desc}。`;
    const voice = (info?.voice ?? "").trim();
    if (voice) lineText += `音色是${voice}。`;
    // v6.12 身高锚点：人物行手填值有值才在定义句末尾原样追加
    // （不加字、不改字、不补标点），空值时定义句与原来一字相同。
    const anchor = (row?.heightAnchor ?? "").trim();
    if (anchor) lineText += anchor;
    defLines.push(lineText);
  });

  // ---- summary ----------------------------------------------------------
  const tagsAll = cast.map((e) => tagOf.get(e.code)).filter(Boolean);
  // v6.12：summary 末尾恒加全片身高 / 站位 / 光向不变一句（两
  // 种镜头同口径）。
  const summary =
    (cast.length > 0
      ? `[reference generation] 把本镜头「${g.title}」拍成一段约 ${g.duration.toFixed(1)} 秒的视频：${tagsAll.join("、")}在${sceneName || "本场景"}推进这一段剧情，人物外貌、发型与服装和参考图保持一致，台词逐字照原文说出，不烧录字幕。`
      : `[reference generation] 把本镜头「${g.title}」拍成一段约 ${g.duration.toFixed(1)} 秒的视频：${sceneName || "本场景"}的空镜与环境，镜头语言和全片保持一致，不烧录字幕。`) +
    "全片人物相对身高、左右站位与光线方向保持不变。";

  // ---- retention_analysis ----------------------------------------------
  const retLines: string[] = [];
  cast.forEach((e, i) => {
    const info = infos.get(e.code);
    const lookHead =
      (info?.look ?? "")
        .split(/[；;，,]+/)
        .map((x) => x.trim())
        .filter(Boolean)
        .slice(0, 3)
        .join("、") || "外貌与服装";
    const shots = appearsIn.get(e.code) ?? [];
    const appearsText =
      shots.length > 0
        ? ` (appears in ${shots.map((n) => `[Shot ${n}]`).join(", ")})`
        : "";
    // v6.12：每人保留行加「相对身高与体型保持不变」（行里已有
    // 这句时不重复加）。
    const heightClause = `${lookHead}保持不变`.includes("相对身高与体型")
      ? ""
      : "，相对身高与体型保持不变";
    retLines.push(
      `<Subject ${i + 1}>${appearsText}: fully_preserved - ${lookHead}保持不变${heightClause}，只有表情、动作与朝向随剧情改变。`,
    );
  });
  cast.forEach((e, i) => {
    const pic = pictureOf.get(e.code);
    if (pic == null) return;
    retLines.push(
      `<Picture ${pic}> (人物 <Subject ${i + 1}> 的参考图): fully_preserved - <Subject ${i + 1}> 的外貌、发型与服装以这张参考图为准。`,
    );
  });
  // v6.12 场景保留行：有场景名且已有人物 / 参考图保留行时补一行
  // 场景保留（带「光线方向保持不变」）；已有任何一行写了这句就
  // 不重复加。无人物镜头的兜底行本身已写「场景与光线保持一
  // 致」（同义），不再叠加场景行。
  if (
    sceneName &&
    retLines.length > 0 &&
    !retLines.some((l) => l.includes("光线方向保持不变"))
  ) {
    retLines.push(
      `${sceneName}（本镜头场景）: fully_preserved - 场景布置保持不变，光线方向保持不变。`,
    );
  }
  if (retLines.length === 0) {
    retLines.push("本镜头无人物主体需要保留，场景与光线保持一致。");
  }

  // ---- overall_soundscape ------------------------------------------------
  const allSfx: string[] = [];
  for (const beat of g.beats) {
    for (const p of h3SfxParts(beat.sfx)) {
      if (!allSfx.includes(p)) allSfx.push(p);
    }
  }
  const soundscape = `${sceneName ? `${sceneName}的环境底噪` : "环境底噪"}贯穿本镜头，切镜时不断。${
    allSfx.length > 0 ? `跟画面动作同步的现场声有${allSfx.join("、")}。` : ""
  }对白贴近、清楚，带一点现场的自然回声。`;

  const sections = [
    `subject_definitions:\n${defLines.join("\n")}`,
    `summary:\n${summary}`,
    `retention_analysis:\n${retLines.join("\n")}`,
    `detailed_description:\n${[...openingParts, ...shotTexts].filter(Boolean).join("\n")}`,
    `overall_soundscape:\n${soundscape}`,
    `non_diegetic_music:\nN/A`,
  ];
  return sections.join("\n\n");
}

/** H3 两版之一的逐镜头拼装（内部共用：换分组视图后逐镜拼）。 */
function buildH3Version(
  view: ScriptData,
  ctx?: LensMappingContext,
  opts?: { actionCutRule?: boolean },
): H3LensPrompt[] {
  const tl = computeTimeline(view);
  return tl.groups.map((g, gi) => ({
    lensIndex: gi + 1,
    title: g.title,
    duration: g.duration,
    shotCount: g.beats.length,
    text: buildH3TextForGroup(view, gi, ctx, opts),
  }));
}

/** 按剧情版：镜头 = 已确认的 storyboardGroups，一镜一段 H3。 */
export function buildH3PlotVersion(
  script: ScriptData,
  ctx?: LensMappingContext,
): H3LensPrompt[] {
  return buildH3Version(storyboardScript(script), ctx);
}

/** 每镜 10–15 秒版（v5.90）：同一批节拍按 h3ShortGroups（按剧情
 * 在转折点切割、每镜 10–15 秒）重新并组后逐镜拼。v5.91 起逐镜
 * 正文开场带切镜规则一句（opts.actionCutRule 强制开）。 */
export function buildH3ShortVersion(
  script: ScriptData,
  ctx?: LensMappingContext,
): H3LensPrompt[] {
  const base = storyboardScript(script);
  const view: ScriptData = { ...base, groups: h3ShortGroups(script) };
  return buildH3Version(view, ctx, { actionCutRule: true });
}

/** @deprecated v5.90 起 H3 第 2 版改用 buildH3ShortVersion；保留
 * 导出仅为兼容旧引用，界面不再调用。 */
export function buildH3DurationVersion(
  script: ScriptData,
  ctx?: LensMappingContext,
): H3LensPrompt[] {
  const base = storyboardScript(script);
  const view: ScriptData = { ...base, groups: h3DurationGroups(script) };
  return buildH3Version(view, ctx);
}

/** 「复制全部」文本：逐镜头提示词前后加镜头头行，段与段之间空行。 */
export function buildH3FullText(
  lenses: H3LensPrompt[],
  versionLabel: string,
): string {
  return lenses
    .map(
      (l) =>
        `【${versionLabel} · 镜头${l.lensIndex}｜${l.title}（约 ${l.duration.toFixed(1)} 秒）】\n${l.text}`,
    )
    .join("\n\n");
}

// ---------------------------------------------------------------------------
// v5.38 Seedance 提示词（v5.90 起三版）：分镜页的汇总区，与 H3 区
// 并排——按剧情版用已确认分镜镜头、每镜 20–30 秒版用
// h3DurationGroups 同一重组口径、强制 30 秒版用
// seedanceForced30Groups（只改呈现分组，不写回、不动已确认分镜
// 结构）。每镜头文本不新拼：直接调 buildSingleGroupTextForModel
// （与分镜页逐镜头「一键复制」同一个函数、同一份 opts：
// expandLook + videoModel），按剧情版逐镜头与「一键复制」同镜头
// 同模型逐字一致；四档格式分叉（2.5 时间戳 / 2.0 系列镜头序号 /
// Fast 单镜锁死 / Mini 画面再压）全部由该函数本身保证。例外两
// 处：①强制 30 秒版的纯白留白段——内容装不满 30 秒时在该镜头
// 文本末尾追加一段纯白留白说明（见 buildSeedanceForced30Version）；
// ②v5.91 切镜规则行——每镜 20–30 秒版与强制 30 秒版（重分组
// 版）逐镜文本末尾多带 ACTION_CUT_RULE_LINE 一行，按剧情版不带。
// ---------------------------------------------------------------------------

export interface SeedanceLensPrompt {
  /** 本版内的镜头序号（1 起）。 */
  lensIndex: number;
  title: string;
  /** 本镜头时长（秒，computeTimeline 口径；强制 30 秒版 = 内容
   * 秒数 + 纯白留白秒数，凑满 30 秒）。 */
  duration: number;
  /** 本镜头节拍数。 */
  beatCount: number;
  /** 本镜头 Seedance 提示词全文（与「一键复制」同口径）。 */
  text: string;
  /** 强制 30 秒版专用：剧情内容本身的秒数（其余版本不带）。 */
  contentDuration?: number;
  /** 强制 30 秒版专用：末尾纯白留白的秒数（0 = 不留白）。 */
  padSeconds?: number;
}

/** Seedance 两版之一的逐镜头拼装（内部共用：换分组视图后逐镜拼）。 */
function buildSeedanceVersion(
  view: ScriptData,
  ctx: LensMappingContext | undefined,
  opts?: LensMappingOptions & { videoModel?: VideoModelId; actionCutRule?: boolean },
): SeedanceLensPrompt[] {
  const tl = computeTimeline(view);
  return tl.groups.map((g, gi) => ({
    lensIndex: gi + 1,
    title: g.title,
    duration: g.duration,
    beatCount: g.beats.length,
    text: buildSingleGroupTextForModel(view, gi, ctx, opts),
  }));
}

/** 按剧情版：镜头 = 已确认的 storyboardGroups，一镜一段。 */
export function buildSeedancePlotVersion(
  script: ScriptData,
  ctx?: LensMappingContext,
  opts?: LensMappingOptions & { videoModel?: VideoModelId },
): SeedanceLensPrompt[] {
  return buildSeedanceVersion(storyboardScript(script), ctx, opts);
}

/** 每镜 20–30 秒版：同一批节拍按 h3DurationGroups 重新并组后逐镜拼。
 * v5.91 起逐镜文本末尾带切镜规则一行（opts.actionCutRule 强制开）。 */
export function buildSeedanceDurationVersion(
  script: ScriptData,
  ctx?: LensMappingContext,
  opts?: LensMappingOptions & { videoModel?: VideoModelId },
): SeedanceLensPrompt[] {
  const base = storyboardScript(script);
  const view: ScriptData = { ...base, groups: h3DurationGroups(script) };
  return buildSeedanceVersion(view, ctx, { ...opts, actionCutRule: true });
}

/**
 * v5.90 强制 30 秒版的镜头分组：全片节拍按顺序往每镜 30 秒里
 * 装，节拍不可拆——当前组再装下一拍就会超过 30 秒时收组，缺的
 * 秒数记为该组末尾的纯白留白（padSeconds，如内容 27 秒、下一
 * 拍 4 秒装不进 → 留白 3 秒，下一拍从下一镜开始）；最后一组不
 * 足 30 秒同样留白补满。单拍本身超过 30 秒时该组只能超、不留
 * 白（切不开）。留白只记秒数，拼文本时才落成纯白段，不写回
 * 分镜结构。v5.91 起按 actionUnits 装组：同一个动作没做完不切
 * 开——动作链整段装不进当前镜时整段挪到下一镜、当前镜多留白
 * 补满（宁可多留白也不拆动作）；动作链本身超 30 秒时退回逐拍
 * 装。没有动作链时与旧口径逐字一致。
 */
export function seedanceForced30Groups(script: ScriptData): {
  groups: ScriptGroup[];
  pads: number[];
} {
  const view = storyboardScript(script);
  const flat = flattenStoryboardBeats(view);
  if (flat.length === 0) return { groups: [], pads: [] };
  const units = actionUnits(flat, 30);
  const packs: { items: FlatBeat[]; duration: number }[] = [];
  let cur: { items: FlatBeat[]; duration: number } = { items: [], duration: 0 };
  for (const u of units) {
    if (cur.items.length > 0 && cur.duration + u.duration > 30.05) {
      packs.push(cur);
      cur = { items: [], duration: 0 };
    }
    cur.items.push(...u.items);
    cur.duration += u.duration;
  }
  if (cur.items.length > 0) packs.push(cur);
  const pads = packs.map((p) => {
    const pad = Math.round((30 - p.duration) * 10) / 10;
    return pad >= 0.05 ? pad : 0;
  });
  return { groups: packs.map((p) => h3GroupFromFlat(p.items)), pads };
}

/**
 * 强制 30 秒版（v5.90）：每镜内容按 seedanceForced30Groups 装组，
 * 逐镜文本仍走 buildSingleGroupTextForModel；有留白的镜头在文本
 * 末尾追加纯白留白段——写明内容到第几秒结束、剩余几秒画面纯白
 * （无人物 / 无场景 / 无文字 / 无台词），凑满 30 秒。duration
 * 字段 = 内容 + 留白（≈30 秒），contentDuration / padSeconds 供
 * 界面分开标注。
 */
export function buildSeedanceForced30Version(
  script: ScriptData,
  ctx?: LensMappingContext,
  opts?: LensMappingOptions & { videoModel?: VideoModelId },
): SeedanceLensPrompt[] {
  const base = storyboardScript(script);
  const { groups, pads } = seedanceForced30Groups(script);
  const view: ScriptData = { ...base, groups };
  const tl = computeTimeline(view);
  return tl.groups.map((g, gi) => {
    const pad = pads[gi] ?? 0;
    // v5.91：强制 30 秒版逐镜文本末尾同样带切镜规则一行（在纯
    // 白留白段之前，留白段仍是全文最后一段）。
    let text = buildSingleGroupTextForModel(view, gi, ctx, {
      ...opts,
      actionCutRule: true,
    });
    if (pad > 0) {
      text +=
        `\n\n【纯白留白】本镜头剧情内容到约 ${g.duration.toFixed(1)} 秒结束，` +
        `最后 ${pad.toFixed(1)} 秒（${g.duration.toFixed(1)}s–30.0s）画面纯白处理：` +
        `纯白画面，不出现任何人物、场景、物品、文字或字幕，无台词、无动作、无声音，` +
        `保持纯白直到本镜头满 30.0 秒结束。`;
    }
    return {
      lensIndex: gi + 1,
      title: g.title,
      duration: g.duration + pad,
      beatCount: g.beats.length,
      text,
      contentDuration: g.duration,
      padSeconds: pad,
    };
  });
}

/** 「复制全部」文本：逐镜头提示词前后加镜头头行，段与段之间空行。 */
export function buildSeedanceFullText(
  lenses: SeedanceLensPrompt[],
  versionLabel: string,
): string {
  return lenses
    .map(
      (l) =>
        `【${versionLabel} · 镜头${l.lensIndex}｜${l.title}（约 ${l.duration.toFixed(1)} 秒${
          l.padSeconds && l.padSeconds > 0
            ? `，含纯白留白 ${l.padSeconds.toFixed(1)} 秒`
            : ""
        }）】\n${l.text}`,
    )
    .join("\n\n");
}

// ---------------------------------------------------------------------------
// Small browser helpers
// ---------------------------------------------------------------------------

export function downloadText(filename: string, text: string, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** 把一个 Blob 以指定文件名触发一次浏览器下载（全站下载共用）。 */
function triggerBlobDownload(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
}

/**
 * 取回一张原图的原始字节并定出无损文件名：不经过卡面预览图
 * （≤480px JPEG）、不重编码、不压缩、不改尺寸、不转格式。扩展名
 * 按取回字节的真实 MIME 定（取不到 MIME 时才回落看原图地址的
 * 后缀，再不行用 png）。取回失败直接抛带真实原因的错误（HTTP
 * 状态码 / 网络异常原文），由调用方原样写给用户，不吞原因。
 */
export async function fetchOriginalImageBytes(
  url: string,
  baseName: string,
): Promise<{ blob: Blob; filename: string; sizeBytes: number; mimeType: string }> {
  let resp: Response;
  try {
    resp = await fetch(url);
  } catch (e) {
    throw new Error(
      `取原图失败（网络异常）：${e instanceof Error ? e.message : String(e)}`,
    );
  }
  if (!resp.ok) throw new Error(`原图下载 HTTP ${resp.status}`);
  const blob = await resp.blob();
  if (blob.size === 0) throw new Error("原图是空的（0 字节），没有下载");
  const mimeType = blob.type || "";
  const extByMime: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/bmp": "bmp",
    "image/avif": "avif",
  };
  let ext = extByMime[mimeType] ?? "";
  if (!ext) {
    const m = url.split(/[?#]/)[0]?.match(/\.([a-zA-Z0-9]{2,5})$/);
    if (m?.[1]) ext = m[1].toLowerCase() === "jpeg" ? "jpg" : m[1].toLowerCase();
  }
  if (!ext) ext = "png";
  const safeBase =
    baseName.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, " ").trim() ||
    "人物资产图";
  const filename = `${safeBase}.${ext}`;
  return { blob, filename, sizeBytes: blob.size, mimeType: mimeType || `image/${ext}` };
}

/**
 * 无损下载原图：取回原图字节后原样落盘一张（见上方
 * fetchOriginalImageBytes 的口径）。返回实际下载的文件名、字节数
 * 与 MIME，供界面写清下载结果。
 */
export async function downloadOriginalImage(
  url: string,
  baseName: string,
): Promise<{ filename: string; sizeBytes: number; mimeType: string }> {
  const got = await fetchOriginalImageBytes(url, baseName);
  triggerBlobDownload(got.blob, got.filename);
  return { filename: got.filename, sizeBytes: got.sizeBytes, mimeType: got.mimeType };
}

// ---------------------------------------------------------------------------
// ZIP 打包（stored 无压缩）：给「一次下多张图」用。浏览器（含 Muse
// 壳内嵌 Chromium）会把程序逐个触发的第 2、第 3 次下载当作「自动
// 下载」拦下（且点击已脱离用户手势、拦了也不吭声），旧版三比例
// 导出就是这样丢图的：页面报「已导出 3 个」实际只落 1 张甚至 0 张。
// 改法：多张图先在本地合成一个 ZIP、只触发一次下载，从根上绕开
// 多次下载拦截。图片本身已是压缩格式，ZIP 只做 stored 直存（不
// 再压一遍——不改一个字节、速度也最快），解开后每张仍是无损原图。
// ---------------------------------------------------------------------------

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = (CRC32_TABLE[(c ^ (bytes[i] ?? 0)) & 0xff] ?? 0) ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/** 把若干已取回的字节合成一个 stored（无压缩）ZIP Blob。 */
export function buildStoredZip(
  entries: { filename: string; bytes: Uint8Array }[],
): Blob {
  const enc = new TextEncoder();
  const chunks: BlobPart[] = [];
  const central: BlobPart[] = [];
  let offset = 0;
  // DOS 日期/时间（ZIP 要求）：用当前本地时间，只作存档时间戳。
  const now = new Date();
  const dosTime =
    (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate =
    ((now.getFullYear() - 1980) << 9) |
    ((now.getMonth() + 1) << 5) |
    now.getDate();
  for (const entry of entries) {
    const nameBytes = enc.encode(entry.filename);
    const crc = crc32(entry.bytes);
    const size = entry.bytes.length;
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true); // version needed
    local.setUint16(6, 0x0800, true); // UTF-8 文件名标志
    local.setUint16(8, 0, true); // stored
    local.setUint16(10, dosTime, true);
    local.setUint16(12, dosDate, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, size, true);
    local.setUint32(22, size, true);
    local.setUint16(26, nameBytes.length, true);
    local.setUint16(28, 0, true);
    chunks.push(local.buffer, nameBytes, entry.bytes);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true);
    cen.setUint16(4, 20, true);
    cen.setUint16(6, 20, true);
    cen.setUint16(8, 0x0800, true);
    cen.setUint16(10, 0, true);
    cen.setUint16(12, dosTime, true);
    cen.setUint16(14, dosDate, true);
    cen.setUint32(16, crc, true);
    cen.setUint32(20, size, true);
    cen.setUint32(24, size, true);
    cen.setUint16(28, nameBytes.length, true);
    cen.setUint32(42, offset, true);
    central.push(cen.buffer, nameBytes);
    offset += 30 + nameBytes.length + size;
  }
  const centralSize = central.reduce(
    (sum, part) =>
      sum + (part instanceof ArrayBuffer ? part.byteLength : (part as Uint8Array).length),
    0,
  );
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...chunks, ...central, end.buffer], {
    type: "application/zip",
  });
}

/** 把一个已取回字节的 Blob 以 zip 文件名触发一次下载。 */
export function downloadZipBlob(zipBlob: Blob, zipBaseName: string): string {
  const safeBase =
    zipBaseName.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, " ").trim() ||
    "图片打包";
  const filename = `${safeBase}.zip`;
  triggerBlobDownload(zipBlob, filename);
  return filename;
}

/** 字节数显示：B / KB / MB，下载结果提示用。 */
export function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

/** Fetch an image URL and return { dataBase64, mimeType } (for JSON export). */
export async function urlToBase64(
  url: string,
): Promise<{ dataBase64: string; mimeType: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("read failed"));
      reader.readAsDataURL(blob);
    });
    const comma = dataUrl.indexOf(",");
    if (comma < 0) return null;
    return {
      dataBase64: dataUrl.slice(comma + 1),
      mimeType: blob.type || "image/jpeg",
    };
  } catch {
    return null;
  }
}

/**
 * Downscale an image URL to a JPEG thumbnail for model vision input.
 * Returns null when the image cannot be loaded/decoded.
 */
export async function urlToThumbnail(
  url: string,
  caption: string,
  maxSize = 640,
  quality = 0.82,
): Promise<{ dataBase64: string; mimeType: string; caption: string } | null> {
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("img load failed"));
      el.src = url;
    });
    // v3.66：等真正解码完再量尺寸；解码不出有效尺寸（图还没就绪 /
    // 地址返回的不是真图）直接放弃这次缩略，绝不生成 1×1 占位预览
    // 写回服务端毒化卡面。
    try {
      await img.decode();
    } catch {
      /* decode 失败时下面按自然尺寸再判一次 */
    }
    if (img.naturalWidth < 16 || img.naturalHeight < 16) return null;
    const scale = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const cx = canvas.getContext("2d");
    if (!cx) return null;
    cx.fillStyle = "#ffffff";
    cx.fillRect(0, 0, w, h);
    cx.drawImage(img, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    const comma = dataUrl.indexOf(",");
    if (comma < 0) return null;
    return { dataBase64: dataUrl.slice(comma + 1), mimeType: "image/jpeg", caption };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// P1 提交用参考图降采样（v3.83）：生图提交（封面生成 / 生图面板）带
// 人物参考图时，不再把原图整张 Base64 塞进提交请求——原图动辄
// 8MB+，4 张合计 26M 字符的请求体在浏览器到动作网关这一层就被
// 掐断（确定性失败、且只能显示通用文案，请求根本到不了服务端）。
// 改为提交前在客户端把「给模型看的副本」压到最长边 1024px 的
// JPEG（urlToThumbnail 同一套画布路径）：单张约几百 KB，4 张合计
// 也稳在请求上限内。只压提交副本——库里原图、无损下载、卡面数据
// 一字不动。降采样失败（解码不了）才回落原图，且原图 Base64 超过
// 3M 字符（约 2.2MB）就不再硬塞：返回 null。v5.04 起封面页调用方
// 拿到 null 不再丢图：改走中转——原图字节分片送服务端拼回、特
// 权层 PIL 逐档压缩后托管（见 coverbench 的 relayReference 与
// chunkedupload 的 uploadImageUrlInChunks）；只有真读不到 / 传不
// 上去才点名报真实原因，绝不静默丢图、也绝不重演大请求体失败。
// v6.00 起直连解码失败先走第二通道：把图片字节取回浏览器本地、
// 用本地对象地址再走同一套画布降采样（与生图面板「本地压小副
// 本再直塞」的同一方案），绕开站内图片地址响应头对直连解码的
// 影响——中转只剩本地连字节也解不动时的最后兜底。
// ---------------------------------------------------------------------------

export type SubmitRefImage = { dataBase64: string; mimeType: string };

export const SUBMIT_REF_MAX_EDGE = 1024;
export const SUBMIT_REF_FALLBACK_MAX_B64 = 3_000_000;

/** 从图片地址取一张提交用参考图（降采样副本；说明见上方）。 */
export async function urlToSubmitReference(
  url: string,
): Promise<SubmitRefImage | null> {
  const thumb = await urlToThumbnail(url, "", SUBMIT_REF_MAX_EDGE);
  if (thumb) {
    return { dataBase64: thumb.dataBase64, mimeType: thumb.mimeType };
  }
  // v6.00 第二通道（与生图面板同一方案：图片字节先回到浏览器
  // 本地、在本地压成小副本再直塞提交）：直连图片地址解码失败
  // 时（站内图片地址带 sandbox / nosniff 响应头，部分浏览器 /
  // WebView 里 <img> 直连解码会被拦或失败——项目 44 的 8K 三视
  // 图原图在封面页实测压不动、被迫走分片中转），改走原始字
  // 节：先把图片字节取回本地，再用本地对象地址喂给同一套画布
  // 降采样。字节在本地解码不受地址响应头影响，9MB 级原图也能
  // 当场压成 1024px 小副本，取图不再动不动掉进分片中转；只有
  // 本地画布连字节也解不动时才返回 null、由封面页走中转兜底。
  let blob: Blob | null = null;
  try {
    const resp = await fetch(url);
    if (resp.ok) blob = await resp.blob();
  } catch {
    blob = null;
  }
  if (blob && (blob.type === "" || blob.type.startsWith("image/"))) {
    const objectUrl = URL.createObjectURL(blob);
    try {
      const local = await urlToThumbnail(objectUrl, "", SUBMIT_REF_MAX_EDGE);
      if (local) {
        return { dataBase64: local.dataBase64, mimeType: local.mimeType };
      }
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
    // 本地画布仍压不动、但原图小到能直塞时，字节直接编码返回
    // （与旧回落同一 3M 字符上限，只是字节已在手里、不再重取）。
    if (Math.ceil(blob.size / 3) * 4 <= SUBMIT_REF_FALLBACK_MAX_B64) {
      const dataUrl = await new Promise<string | null>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
      if (dataUrl) {
        const comma = dataUrl.indexOf(",");
        if (comma >= 0) {
          return {
            dataBase64: dataUrl.slice(comma + 1),
            mimeType: blob.type || "image/jpeg",
          };
        }
      }
    }
    return null;
  }
  const orig = await urlToBase64(url);
  if (!orig) return null;
  if (orig.dataBase64.length > SUBMIT_REF_FALLBACK_MAX_B64) return null;
  return orig;
}

/** 已有 Base64 的参考图（生图面板的上传参考图）同样降采样后提交。 */
export async function dataRefToSubmitReference(
  dataBase64: string,
  mimeType: string,
): Promise<SubmitRefImage | null> {
  const thumb = await urlToThumbnail(
    `data:${mimeType};base64,${dataBase64}`,
    "",
    SUBMIT_REF_MAX_EDGE,
  );
  if (thumb) {
    return { dataBase64: thumb.dataBase64, mimeType: thumb.mimeType };
  }
  if (dataBase64.length > SUBMIT_REF_FALLBACK_MAX_B64) return null;
  return { dataBase64, mimeType };
}
