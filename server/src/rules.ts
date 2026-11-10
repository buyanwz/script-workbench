// ---------------------------------------------------------------------------
// 核心规则 · 唯一实现（服务端与客户端共用同一份）
//
// 本文件是工作台全部核心口径的唯一出处，服务端 actions 与客户端
// scriptlib 都从这里取用，任何一处都不再另写一份：
//   1. 时长试算：节拍时长 = 台词字数（去空白与标点）÷ 语速 + 动作秒数；
//      逐段/逐镜头与全片总时长、超目标、超 30 秒与不可拆节拍判定。
//   2. 待确认人物校验：有台词节拍的说话人必须登记为人物名——空说话人、
//      未登记、称呼（角色/扮演）非人物名三类问题。
//   3. 分镜分组：按时间窗打包镜头，节拍切分原因来自剧情信号（场景转场 /
//      人物出入场 / 说话人切换 / 情绪转折 / 悬念·反转点 / 动作转折 /
//      开场节拍），每镜头 30 秒硬顶。超限绝不自动拆分：只检出超长镜头
//      （哪个镜头、超多少秒、含哪些节拍）交用户二选一——缩减内容，或
//      在再分配预览里自己选切分点后按其确认的切分生成。
// 本文件是纯函数模块（无服务端/浏览器依赖），因此可以被两端安全引用。
// ---------------------------------------------------------------------------

export interface RulesBeat {
  visual: string;
  sfx: string;
  speaker: string;
  emotion: string;
  line: string;
  actionSeconds: number;
  cutReason?: string;
  /**
   * v4.86 AI解剖 1:1 时间戳：ASR 转写给出的本拍在原视频里的起止秒
   * （0.1 精度）。只有解剖套用进来的节拍带这两个字段；带齐且
   * endSec > startSec 时 beatTiming 以实测跨度为准（台词零丢失 +
   * 总时长对齐的质量门靠它），普通生成节拍没有这两个字段、一律
   * 走原语速公式，一字不变。
   */
  startSec?: number;
  endSec?: number;
}

export interface RulesGroup {
  title: string;
  sceneName: string;
  beats: RulesBeat[];
}

export interface StoryboardConfig {
  groupSeconds: number;
  /**
   * v3.56 切镜方式（可选加法，缺省 = 现行行为，旧数据一字不变）：
   * "duration" 按时长打包（现行）；"segment" 按剧本段切镜——一个
   * 剧本段等于一个镜头。只有用户在分镜确认页主动选了 segment 并
   * 重新确认后，存下的配置才带这个字段。
   */
  mode?: "duration" | "segment";
}

export interface RulesScript {
  groups: RulesGroup[];
  speechRate: number;
  targetSeconds: number;
  storyboardConfig?: StoryboardConfig;
}

export const DEFAULT_STORYBOARD_CONFIG: StoryboardConfig = {
  groupSeconds: 30,
};

/** 镜头数计划：count = ceil(总时长 ÷ 每镜头秒数)，末镜取剩余。 */
export function lensPlan(
  totalSeconds: number,
  lensSeconds: number,
): { count: number; lastSeconds: number } {
  const per = lensSeconds > 0 ? lensSeconds : 30;
  const total = Math.max(0, totalSeconds);
  const count = Math.max(1, Math.ceil(total / per - 1e-9));
  return { count, lastSeconds: total - (count - 1) * per };
}

/** 台词实际字数：去掉空白与全部标点，只计真正占发声时间的字。 */
export function countLineChars(line: string): number {
  return line.replace(/[\s\p{P}]/gu, "").length;
}

export interface BeatTiming {
  dialogueSeconds: number;
  actionSeconds: number;
  totalSeconds: number;
}

/** 统一节拍计时：台词字数（去标点）÷ 语速 + 动作秒数。 */
export function beatTiming(beat: RulesBeat, rate: number): BeatTiming {
  const r = rate > 0 ? rate : 5;
  // v4.86：带 ASR 实测起止秒的节拍（AI解剖套用）以实测跨度计时，
  // 台词时长仍按字数/语速算、余下记作动作时长，总数与实测一致。
  const as = beat.startSec;
  const ae = beat.endSec;
  if (
    typeof as === "number" &&
    typeof ae === "number" &&
    Number.isFinite(as) &&
    Number.isFinite(ae) &&
    ae > as
  ) {
    const total = Math.round((ae - as) * 10) / 10;
    if (beat.line.trim()) {
      const dialogue = Math.min(total, Math.max(0.1, countLineChars(beat.line) / r));
      return {
        dialogueSeconds: dialogue,
        actionSeconds: Math.round((total - dialogue) * 10) / 10,
        totalSeconds: total,
      };
    }
    return { dialogueSeconds: 0, actionSeconds: total, totalSeconds: total };
  }
  const s = Number(beat.actionSeconds);
  if (beat.line.trim()) {
    const dialogue = Math.max(0.1, countLineChars(beat.line) / r);
    const action = Number.isFinite(s) && s > 0 ? Math.min(10, s) : 0;
    return {
      dialogueSeconds: dialogue,
      actionSeconds: action,
      totalSeconds: dialogue + action,
    };
  }
  const action =
    Number.isFinite(s) && s > 0 ? Math.min(10, Math.max(0.5, s)) : 2;
  return { dialogueSeconds: 0, actionSeconds: action, totalSeconds: action };
}

export function beatDuration(beat: RulesBeat, rate: number): number {
  return beatTiming(beat, rate).totalSeconds;
}

// ---------------------------------------------------------------------------
// 时长试算
// ---------------------------------------------------------------------------

export interface GroupDuration {
  title: string;
  totalSeconds: number;
  dialogueSeconds: number;
  actionSeconds: number;
  beatSeconds: number[];
  overLimit: boolean;
}

export interface DurationSummary {
  groups: GroupDuration[];
  totalSeconds: number;
  dialogueSeconds: number;
  actionSeconds: number;
  targetSeconds: number;
  diffSeconds: number | null;
  overTarget: boolean;
  hasUnsplittableBeat: boolean;
}

export function durationSummary(
  script: RulesScript,
  groups: RulesGroup[],
): DurationSummary {
  const rate = script.speechRate > 0 ? script.speechRate : 5;
  let total = 0;
  let dialogue = 0;
  let action = 0;
  let unsplittable = false;
  const out: GroupDuration[] = groups.map((g) => {
    let gTotal = 0;
    let gDialogue = 0;
    let gAction = 0;
    const beatSeconds = g.beats.map((b) => {
      const t = beatTiming(b, rate);
      gTotal += t.totalSeconds;
      gDialogue += t.dialogueSeconds;
      gAction += t.actionSeconds;
      if (t.totalSeconds > 30.05) unsplittable = true;
      return t.totalSeconds;
    });
    total += gTotal;
    dialogue += gDialogue;
    action += gAction;
    return {
      title: g.title,
      totalSeconds: gTotal,
      dialogueSeconds: gDialogue,
      actionSeconds: gAction,
      beatSeconds,
      overLimit: gTotal > 30.05,
    };
  });
  const target = script.targetSeconds > 0 ? script.targetSeconds : 0;
  return {
    groups: out,
    totalSeconds: total,
    dialogueSeconds: dialogue,
    actionSeconds: action,
    targetSeconds: target,
    diffSeconds: target > 0 ? total - target : null,
    overTarget: target > 0 && total - target > 0.05,
    hasUnsplittableBeat: unsplittable,
  };
}

// ---------------------------------------------------------------------------
// 待确认人物校验
// ---------------------------------------------------------------------------

export interface SpeakerIssueBeatRef {
  groupIndex: number;
  beatIndex: number;
  linePreview: string;
}

export interface SpeakerIssue {
  kind: "empty" | "unregistered" | "alias";
  speaker: string;
  suggestedName?: string;
  beats: SpeakerIssueBeatRef[];
}

export interface SpeakerRegistryEntry {
  name: string;
  aliases: string[];
}

export function collectSpeakerIssues(
  script: RulesScript,
  registry: SpeakerRegistryEntry[],
): SpeakerIssue[] {
  const names = new Set<string>();
  const aliasToName = new Map<string, string>();
  for (const entry of registry) {
    const name = entry.name.trim();
    if (!name) continue;
    names.add(name);
    for (const alias of entry.aliases) {
      const a = alias.trim();
      if (a && a !== name && !aliasToName.has(a)) aliasToName.set(a, name);
    }
  }
  const issues: SpeakerIssue[] = [];
  const grouped = new Map<string, SpeakerIssue>();
  script.groups.forEach((g, gi) => {
    g.beats.forEach((b, bi) => {
      if (!b.line.trim()) return;
      const speaker = b.speaker.trim();
      const ref: SpeakerIssueBeatRef = {
        groupIndex: gi,
        beatIndex: bi,
        linePreview: b.line.trim().slice(0, 10),
      };
      if (!speaker) {
        issues.push({ kind: "empty", speaker: "", beats: [ref] });
        return;
      }
      if (names.has(speaker)) return;
      const suggested = aliasToName.get(speaker);
      const kind = suggested ? "alias" : "unregistered";
      const key = `${kind}:${speaker}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.beats.push(ref);
      } else {
        const issue: SpeakerIssue = {
          kind,
          speaker,
          suggestedName: suggested,
          beats: [ref],
        };
        grouped.set(key, issue);
        issues.push(issue);
      }
    });
  });
  return issues;
}

// ---------------------------------------------------------------------------
// 临时人物表（与待确认人物清单共用同一份检出）
//
// 剧本里出现（说话人 / 画面描述 / 梗概 / 大纲 / 待确认事项里点名）但不在
// 正式人物表（人物表行 + 第 1 步人物卡）里的人，进临时人物表。检出与
// 待确认清单共用同一份：说话人类临时人物直接来自 collectSpeakerIssues
// 的结果，其余来源（画面 / 梗概 / 大纲 / 待确认事项）只在这一个函数里
// 补充扫描，两处不再各算各的。处理状态（转正 / 群演 / 映射 / 删除）存
// 在剧本数据的 tempCharacterStates 里，随保存与快照一起走：
//   - extra（无台词群演）：只出画面、不给台词；一旦又有台词，状态变
//     extra-with-dialogue，重新拦截、重新提示；
//   - deleted / mapped：台词与画面提及已清除后不再出现；若日后又有
//     他的台词（dialogueCount > 0），重新按 pending 检出。
// ---------------------------------------------------------------------------

export interface TempCharacterState {
  disposition: "pending" | "extra" | "deleted" | "mapped";
  look: string;
  voice: string;
  tone: string;
  kind?: "single" | "group";
  mappedTo?: string;
}

export interface TempCharacterSource {
  type: "speaker" | "visual" | "synopsis" | "outline" | "pending";
  groupIndex: number;
  beatIndex: number;
  preview: string;
}

export interface TempCharacter {
  name: string;
  /** 群像（同学们 / 围观群众 / 林哥小弟这类人数不定）还是单人。 */
  isGroup: boolean;
  sources: TempCharacterSource[];
  dialogueCount: number;
  /** 涉及的节拍数（说话或画面提及，去重）。 */
  beatCount: number;
  hasDialogue: boolean;
  issueKind: "unregistered" | "alias" | null;
  suggestedName?: string;
  disposition: TempCharacterState["disposition"];
  status: "pending" | "extra-ok" | "extra-with-dialogue";
  look: string;
  voice: string;
  tone: string;
}

/** 群像类名字：以「们」结尾、群众/众人/围观、或以「小弟」结尾的跟班称呼。 */
export function isGroupTempName(name: string): boolean {
  const n = name.trim();
  return (
    /们$/.test(n) ||
    n.includes("群众") ||
    n.includes("众人") ||
    n.includes("围观") ||
    /小弟$/.test(n) ||
    /跟班/.test(n)
  );
}

const TEMP_GROUP_WORDS = [
  "同学们",
  "学生们",
  "家长们",
  "老师们",
  "孩子们",
  "小弟们",
  "小伙伴们",
  "围观群众",
  "围观的人",
  "群众",
  "众人",
  "路人",
  "跟班们",
];

/** 正式人物名/称呼 + 关系后缀 = 临时人物候选（如 小帅+爸爸、林哥+小弟）。 */
const TEMP_SUFFIXES = [
  "爸爸",
  "妈妈",
  "父亲",
  "母亲",
  "哥哥",
  "姐姐",
  "弟弟",
  "妹妹",
  "小弟",
  "小妹",
  "同学",
  "同桌",
  "老师",
  "朋友",
  "邻居",
  "家长",
  "爷爷",
  "奶奶",
  "叔叔",
  "阿姨",
  "儿子",
  "女儿",
  "队友",
  "同事",
];

function tempSnippet(text: string, name: string): string {
  const idx = text.indexOf(name);
  if (idx < 0) return text.slice(0, 24);
  const start = Math.max(0, idx - 10);
  const end = Math.min(text.length, idx + name.length + 14);
  return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
}

export function collectTempCharacters(
  script: RulesScript & {
    synopsis?: string;
    pendingItems?: string[];
  },
  registry: SpeakerRegistryEntry[],
  opts?: {
    outline?: string;
    states?: Record<string, TempCharacterState>;
  },
): TempCharacter[] {
  const formalNames = new Set<string>();
  const bases: string[] = [];
  const pushBase = (v: string) => {
    const t = v.trim();
    if (t && !bases.includes(t)) bases.push(t);
  };
  for (const e of registry) {
    const n = e.name.trim();
    if (n) formalNames.add(n);
    pushBase(e.name);
    for (const a of e.aliases) pushBase(a);
  }

  interface CorpusText {
    type: TempCharacterSource["type"];
    groupIndex: number;
    beatIndex: number;
    text: string;
  }
  const corpus: CorpusText[] = [];
  if (script.synopsis?.trim())
    corpus.push({ type: "synopsis", groupIndex: -1, beatIndex: -1, text: script.synopsis });
  if (opts?.outline?.trim())
    corpus.push({ type: "outline", groupIndex: -1, beatIndex: -1, text: opts.outline });
  for (const item of script.pendingItems ?? []) {
    if (item.trim())
      corpus.push({ type: "pending", groupIndex: -1, beatIndex: -1, text: item });
  }
  script.groups.forEach((g, gi) => {
    g.beats.forEach((b, bi) => {
      if (b.visual.trim())
        corpus.push({ type: "visual", groupIndex: gi, beatIndex: bi, text: b.visual });
    });
  });

  interface Acc {
    name: string;
    sources: TempCharacterSource[];
    sourceKeys: Set<string>;
    beatKeys: Set<string>;
    dialogueCount: number;
    issueKind: "unregistered" | "alias" | null;
    suggestedName?: string;
  }
  const accs = new Map<string, Acc>();
  const ensure = (name: string): Acc => {
    const existing = accs.get(name);
    if (existing) return existing;
    const acc: Acc = {
      name,
      sources: [],
      sourceKeys: new Set<string>(),
      beatKeys: new Set<string>(),
      dialogueCount: 0,
      issueKind: null,
    };
    accs.set(name, acc);
    return acc;
  };
  const addSource = (acc: Acc, src: TempCharacterSource) => {
    const key = `${src.type}:${src.groupIndex}:${src.beatIndex}`;
    if (!acc.sourceKeys.has(key)) {
      acc.sourceKeys.add(key);
      acc.sources.push(src);
    }
    if (src.groupIndex >= 0) acc.beatKeys.add(`${src.groupIndex}-${src.beatIndex}`);
  };

  // 1) 说话人来源：直接用待确认清单的检出结果（同一份，不另算）。
  for (const issue of collectSpeakerIssues(script, registry)) {
    if (!issue.speaker) continue; // 空说话人没有名字，只留在待确认清单里
    const acc = ensure(issue.speaker);
    acc.issueKind = issue.kind === "alias" ? "alias" : "unregistered";
    acc.suggestedName = issue.suggestedName;
    acc.dialogueCount += issue.beats.length;
    for (const ref of issue.beats) {
      addSource(acc, {
        type: "speaker",
        groupIndex: ref.groupIndex,
        beatIndex: ref.beatIndex,
        preview: ref.linePreview,
      });
    }
  }

  // 2) 文字来源扫描：梗概 / 大纲 / 待确认事项 / 画面里点名的新人物。
  for (const ct of corpus) {
    for (const base of bases) {
      for (const suf of TEMP_SUFFIXES) {
        const cand = base + suf;
        if (formalNames.has(cand)) continue;
        if (ct.text.includes(cand)) {
          addSource(ensure(cand), {
            type: ct.type,
            groupIndex: ct.groupIndex,
            beatIndex: ct.beatIndex,
            preview: tempSnippet(ct.text, cand),
          });
        }
      }
    }
    for (const w of TEMP_GROUP_WORDS) {
      if (formalNames.has(w)) continue;
      if (ct.text.includes(w)) {
        addSource(ensure(w), {
          type: ct.type,
          groupIndex: ct.groupIndex,
          beatIndex: ct.beatIndex,
          preview: tempSnippet(ct.text, w),
        });
      }
    }
  }

  // 3) 已知临时人物在其它文字里的提及也补进出处（画面/梗概/大纲）。
  for (const acc of accs.values()) {
    for (const ct of corpus) {
      if (ct.text.includes(acc.name)) {
        addSource(acc, {
          type: ct.type,
          groupIndex: ct.groupIndex,
          beatIndex: ct.beatIndex,
          preview: tempSnippet(ct.text, acc.name),
        });
      }
    }
  }

  // 3b) 画面里常只用后缀称呼指代他（「爸爸停在课桌旁」=小帅爸爸、
  // 「两名小弟」=林哥小弟）：全名已由其它来源确认存在时，画面里单独
  // 出现的 爸爸/妈妈/小弟 也算他的画面出处，免得出处漏掉大半节拍。
  for (const acc of accs.values()) {
    const suffix = ["爸爸", "妈妈", "小弟"].find(
      (s) => acc.name.length > s.length && acc.name.endsWith(s),
    );
    if (!suffix) continue;
    for (const ct of corpus) {
      if (ct.type !== "visual") continue;
      if (ct.text.includes(acc.name)) continue;
      if (ct.text.includes(suffix)) {
        addSource(acc, {
          type: "visual",
          groupIndex: ct.groupIndex,
          beatIndex: ct.beatIndex,
          preview: tempSnippet(ct.text, suffix),
        });
      }
    }
  }

  const out: TempCharacter[] = [];
  for (const acc of accs.values()) {
    const state = opts?.states?.[acc.name];
    const disposition = state?.disposition ?? "pending";
    const hasDialogue = acc.dialogueCount > 0;
    // 已删除 / 已映射且没有台词残留：处理完毕，不再出现。
    if ((disposition === "deleted" || disposition === "mapped") && !hasDialogue)
      continue;
    let status: TempCharacter["status"] = "pending";
    if (disposition === "extra")
      status = hasDialogue ? "extra-with-dialogue" : "extra-ok";
    out.push({
      name: acc.name,
      isGroup: state?.kind
        ? state.kind === "group"
        : isGroupTempName(acc.name),
      sources: acc.sources,
      dialogueCount: acc.dialogueCount,
      beatCount: acc.beatKeys.size,
      hasDialogue,
      issueKind: acc.issueKind,
      suggestedName: acc.suggestedName,
      disposition,
      status,
      look: state?.look ?? "",
      voice: state?.voice ?? "",
      tone: state?.tone ?? "",
    });
  }
  const rank = (t: TempCharacter) => (t.status === "extra-ok" ? 1 : 0);
  out.sort((a, b) => rank(a) - rank(b));
  return out;
}

// ---------------------------------------------------------------------------
// 分镜分组（镜头打包 + 节拍切分原因 + 30 秒硬顶：超限只检出、不自动拆）
// ---------------------------------------------------------------------------

const ENTER_EXIT_RE =
  /推门|进门|出门|走进|走出|走来|走去|进来|出去|进入|离开|起身|站起|坐下|出现|赶到|跑进|跑出|上车|下车|冲进|闯进/;
const REVERSAL_RE =
  /突然|竟然|原来|没想到|震惊|愣住|呆住|回头|发现|揭穿|反转|定格|黑屏|僵住|脸色一变|瞪大/;

export function shotCutReason(
  prev: RulesBeat | null,
  beat: RulesBeat,
  sceneChanged: boolean,
  isFirst: boolean,
): string {
  if (isFirst) return "开场节拍";
  if (sceneChanged) return "场景转场";
  if (REVERSAL_RE.test(beat.visual) || REVERSAL_RE.test(beat.line)) {
    return "悬念/反转点";
  }
  if (ENTER_EXIT_RE.test(beat.visual)) return "人物出入场";
  if (
    prev &&
    prev.line.trim() &&
    beat.line.trim() &&
    prev.speaker.trim() &&
    beat.speaker.trim() &&
    prev.speaker.trim() !== beat.speaker.trim()
  ) {
    return "说话人切换";
  }
  if (
    prev &&
    prev.line.trim() &&
    beat.line.trim() &&
    prev.speaker.trim() === beat.speaker.trim() &&
    prev.emotion.trim() &&
    beat.emotion.trim() &&
    prev.emotion.trim() !== beat.emotion.trim()
  ) {
    return "情绪转折";
  }
  return "动作转折";
}

/**
 * 旧拆分提示类型：仅为兼容既有返回结构保留。自动拆分已取消，
 * packStoryboard 永远返回空的 splitNotices，界面不再展示拆分提示。
 */
export interface SplitNotice {
  lensIndex: number;
  duration: number;
  parts: number;
}

export interface StoryboardPack {
  groups: RulesGroup[];
  splitNotices: SplitNotice[];
}

/** 一个节拍在全片节拍序列中的定位（再分配预览与缩减高亮共用）。 */
export interface FlatBeat {
  /** 全片顺序下标（0 起），切分点按这个下标表达。 */
  flatIndex: number;
  groupIndex: number;
  beatIndex: number;
  sectionTitle: string;
  sceneName: string;
  beat: RulesBeat;
  duration: number;
  dialogueSeconds: number;
  actionSeconds: number;
  cutReason: string;
}

/**
 * 把剧本全部节拍按顺序摊平，并按与镜头打包完全相同的口径算出每拍
 * 时长与切分原因（场景是否变化、与上一拍的关系）。
 */
export function flattenStoryboardBeats(script: RulesScript): FlatBeat[] {
  const rate = script.speechRate > 0 ? script.speechRate : 5;
  const out: FlatBeat[] = [];
  let prevBeat: RulesBeat | null = null;
  let prevScene = "";
  let seenAny = false;
  script.groups.forEach((section, gi) => {
    section.beats.forEach((beat, bi) => {
      const sceneChanged = seenAny && section.sceneName !== prevScene;
      const cutReason = shotCutReason(prevBeat, beat, sceneChanged, !seenAny);
      const t = beatTiming(beat, rate);
      out.push({
        flatIndex: out.length,
        groupIndex: gi,
        beatIndex: bi,
        sectionTitle: section.title,
        sceneName: section.sceneName,
        beat: { ...beat, cutReason },
        duration: t.totalSeconds,
        dialogueSeconds: t.dialogueSeconds,
        actionSeconds: t.actionSeconds,
        cutReason,
      });
      prevBeat = beat;
      prevScene = section.sceneName;
      seenAny = true;
    });
  });
  return out;
}

interface LensSegment {
  /** 段内节拍的 flatIndex 列表（连续）。 */
  flatIndices: number[];
  title: string;
  sceneName: string;
  duration: number;
}

function segmentScenes(flat: FlatBeat[], indices: number[]): string {
  const scenes: string[] = [];
  for (const i of indices) {
    // v5.27：按「 / 」拆开逐个场景名去重——旧口径把每段已拼好的场
    // 景名当整体比较，同一场景在两段里写法只差一点（或本身就是拼
    // 接串）时会被整体保留、再拼出「木质售票亭 / 木质售票亭」这类
    // 重复。拆开按名去重后，同一场景在一个镜头里只出现一次。
    for (const part of (flat[i]?.sceneName ?? "").split("/")) {
      const s = part.trim();
      if (s && !scenes.includes(s)) scenes.push(s);
    }
  }
  return scenes.join(" / ");
}

/**
 * v5.27：镜头标题 = 首段标题，跨段时补末段标题（「首段 → 末段」）。
 * 旧口径只留首段标题：按秒并成大镜头后，一个镜头横跨好几段剧情，
 * 标题只写第一段的名字，用户对着标题找不到后半段演的是什么。起
 * 止时间不在标题里重复（各出口的镜头头行本来就带时间段）。
 */
function segmentTitle(flat: FlatBeat[], seg: LensSegment): string {
  const first =
    flat[seg.flatIndices[0] ?? 0]?.sectionTitle ?? seg.title;
  const last =
    flat[seg.flatIndices[seg.flatIndices.length - 1] ?? 0]?.sectionTitle ??
    seg.title;
  return last && last !== first ? `${first} → ${last}` : first;
}

/** 按每镜头秒数的时间窗把摊平节拍切成镜头段（原始分配，不做任何超限处理）。 */
function rawLensSegments(
  flat: FlatBeat[],
  lensSeconds: number,
): LensSegment[] {
  const per = lensSeconds > 0 ? lensSeconds : 30;
  const segments: LensSegment[] = [];
  let cursor = 0;
  let cur: LensSegment | null = null;
  let curWindow = -1;
  for (const fb of flat) {
    const window = Math.floor(cursor / per + 1e-9);
    if (!cur || window !== curWindow) {
      cur = {
        flatIndices: [],
        title: fb.sectionTitle,
        sceneName: fb.sceneName,
        duration: 0,
      };
      segments.push(cur);
      curWindow = window;
    }
    cur.flatIndices.push(fb.flatIndex);
    cur.duration += fb.duration;
    cursor += fb.duration;
  }
  for (const seg of segments) {
    seg.sceneName = segmentScenes(flat, seg.flatIndices);
    seg.title = segmentTitle(flat, seg);
  }
  return segments;
}

/** 按用户确认的切分点（在这些 flatIndex 的节拍之后切一刀）切成镜头段。 */
function cutLensSegments(flat: FlatBeat[], cutAfter: number[]): LensSegment[] {
  const cuts = new Set(cutAfter);
  const segments: LensSegment[] = [];
  let cur: LensSegment | null = null;
  for (const fb of flat) {
    if (!cur) {
      cur = {
        flatIndices: [],
        title: fb.sectionTitle,
        sceneName: fb.sceneName,
        duration: 0,
      };
      segments.push(cur);
    }
    cur.flatIndices.push(fb.flatIndex);
    cur.duration += fb.duration;
    if (cuts.has(fb.flatIndex) && fb.flatIndex < flat.length - 1) cur = null;
  }
  for (const seg of segments) {
    seg.sceneName = segmentScenes(flat, seg.flatIndices);
    seg.title = segmentTitle(flat, seg);
  }
  return segments;
}

function segmentsToGroups(flat: FlatBeat[], segments: LensSegment[]): RulesGroup[] {
  return segments.map((seg) => ({
    title: seg.title,
    sceneName: seg.sceneName,
    beats: seg.flatIndices.map((i) => flat[i]!.beat),
  }));
}

// ---------------------------------------------------------------------------
// 超长镜头检出（30 秒硬顶）：只检出、只报告，绝不在这里拆分或改稿。
// ---------------------------------------------------------------------------

export interface OverlongBeatInfo {
  groupIndex: number;
  beatIndex: number;
  /** 在该镜头内是第几拍（0 起）。 */
  beatIndexInLens: number;
  duration: number;
  dialogueSeconds: number;
  actionSeconds: number;
  speaker: string;
  linePreview: string;
  visualPreview: string;
}

export interface OverlongLens {
  /** 原始分配里的镜头序号（1 起）。 */
  lensIndex: number;
  title: string;
  sceneName: string;
  duration: number;
  /** 超出 30 秒的秒数。 */
  overBy: number;
  beats: OverlongBeatInfo[];
}

function segmentsOverlong(
  flat: FlatBeat[],
  segments: LensSegment[],
): OverlongLens[] {
  const out: OverlongLens[] = [];
  segments.forEach((seg, si) => {
    if (seg.duration <= 30.05) return;
    out.push({
      lensIndex: si + 1,
      title: seg.title,
      sceneName: seg.sceneName,
      duration: seg.duration,
      overBy: seg.duration - 30,
      beats: seg.flatIndices.map((fi, k) => {
        const fb = flat[fi]!;
        return {
          groupIndex: fb.groupIndex,
          beatIndex: fb.beatIndex,
          beatIndexInLens: k,
          duration: fb.duration,
          dialogueSeconds: fb.dialogueSeconds,
          actionSeconds: fb.actionSeconds,
          speaker: fb.beat.speaker,
          linePreview: fb.beat.line.trim().slice(0, 24),
          visualPreview: fb.beat.visual.trim().slice(0, 32),
        };
      }),
    });
  });
  return out;
}

/** 检出按当前每镜头秒数分配后超过 30 秒的镜头（不拆分、不改动任何数据）。 */
export function detectOverlongLenses(
  script: RulesScript,
  config?: StoryboardConfig,
): OverlongLens[] {
  const cfg = config ?? script.storyboardConfig ?? DEFAULT_STORYBOARD_CONFIG;
  const flat = flattenStoryboardBeats(script);
  return segmentsOverlong(flat, rawLensSegments(flat, cfg.groupSeconds));
}

/** 检出按用户切分点分配后仍超过 30 秒的镜头。 */
export function detectOverlongForCuts(
  script: RulesScript,
  cutAfterFlat: number[],
): OverlongLens[] {
  const flat = flattenStoryboardBeats(script);
  return segmentsOverlong(flat, cutLensSegments(flat, cutAfterFlat));
}

/**
 * 建议切分点：原始时间窗边界 + 超长镜头内部按节拍贪心补切，使每段
 * 尽量 ≤30 秒（单拍本身超 30 秒的切不开，不在此处理）。只作再分配
 * 预览的初始建议，用户可在预览里任意增删，最终以用户确认为准。
 */
export function suggestStoryboardCuts(
  script: RulesScript,
  config?: StoryboardConfig,
): number[] {
  const cfg = config ?? script.storyboardConfig ?? DEFAULT_STORYBOARD_CONFIG;
  const flat = flattenStoryboardBeats(script);
  const cuts = new Set<number>();
  for (const seg of rawLensSegments(flat, cfg.groupSeconds)) {
    const last = seg.flatIndices[seg.flatIndices.length - 1];
    if (last != null && last < flat.length - 1) cuts.add(last);
    let acc = 0;
    for (const fi of seg.flatIndices) {
      const d = flat[fi]!.duration;
      if (acc > 0 && acc + d > 30.05 && fi > 0) {
        cuts.add(fi - 1);
        acc = 0;
      }
      acc += d;
    }
  }
  return [...cuts].sort((a, b) => a - b);
}

/**
 * 按剧情信号建议切分点：场景转场 / 悬念·反转点 / 人物出入场处优先
 * 切，再贪心补切保证每段尽量 ≤30 秒。同样只是预览建议。
 */
export function suggestPlotCuts(script: RulesScript): number[] {
  const flat = flattenStoryboardBeats(script);
  const strong = new Set(["场景转场", "悬念/反转点", "人物出入场"]);
  const cuts = new Set<number>();
  let acc = 0;
  flat.forEach((fb, i) => {
    if (i > 0 && strong.has(fb.cutReason)) {
      cuts.add(i - 1);
      acc = 0;
    }
    if (acc > 0 && acc + fb.duration > 30.05) {
      cuts.add(i - 1);
      acc = 0;
    }
    acc += fb.duration;
  });
  return [...cuts].sort((a, b) => a - b);
}

/** 把摊平节拍按给定段切成镜头组（预览与最终生成共用）。 */
export function storyboardSegmentsForCuts(
  script: RulesScript,
  cutAfterFlat: number[],
): { title: string; sceneName: string; duration: number; flatIndices: number[] }[] {
  const flat = flattenStoryboardBeats(script);
  return cutLensSegments(flat, cutAfterFlat).map((seg) => ({
    title: seg.title,
    sceneName: seg.sceneName,
    duration: seg.duration,
    flatIndices: [...seg.flatIndices],
  }));
}

/** 原始分配里每个 flatIndex 属于第几个镜头（1 起），供预览标注来源镜头。 */
export function rawLensIndexByFlat(
  script: RulesScript,
  config?: StoryboardConfig,
): number[] {
  const cfg = config ?? script.storyboardConfig ?? DEFAULT_STORYBOARD_CONFIG;
  const flat = flattenStoryboardBeats(script);
  const out = new Array<number>(flat.length).fill(1);
  rawLensSegments(flat, cfg.groupSeconds).forEach((seg, si) => {
    for (const fi of seg.flatIndices) out[fi] = si + 1;
  });
  return out;
}

/**
 * 镜头打包：只做按每镜头秒数的时间窗分配，返回原始镜头组。
 * 不再有「超 30 秒按节拍自动拆分」：某个镜头超 30 秒时原样返回，
 * 由 detectOverlongLenses 检出、服务端拦截、用户选择缩减或在预览
 * 里自己选切分点（buildStoryboardFromCuts）后才生成最终分镜。
 */
export function packStoryboard(
  script: RulesScript,
  config?: StoryboardConfig,
): StoryboardPack {
  const cfg = config ?? script.storyboardConfig ?? DEFAULT_STORYBOARD_CONFIG;
  const flat = flattenStoryboardBeats(script);
  return {
    groups: segmentsToGroups(flat, rawLensSegments(flat, cfg.groupSeconds)),
    splitNotices: [],
  };
}

export function buildStoryboardGroups(
  script: RulesScript,
  config?: StoryboardConfig,
): RulesGroup[] {
  return packStoryboard(script, config).groups;
}

// ---------------------------------------------------------------------------
// v3.56 按剧本段切镜（新增选项，不取代按时长打包）：一个剧本段等于
// 一个镜头，镜头标题 = 段标题、场景 = 段场景、时长 = 段时长，段内
// 节拍顺序不变（双层项目的现在层在前、以前层在后原样保留）。节拍的
// 切分原因仍走 flattenStoryboardBeats 同一份口径。空段不生成镜头。
// 单段超 30 秒不在这里处理：由 detectOverlongForSegments 检出，走
// 现有 30 秒软顶三选一，绝不静默拆分。
// ---------------------------------------------------------------------------

export function buildStoryboardBySegments(
  script: RulesScript,
): RulesGroup[] {
  const flat = flattenStoryboardBeats(script);
  const out: RulesGroup[] = [];
  script.groups.forEach((g, gi) => {
    const beats = flat
      .filter((fb) => fb.groupIndex === gi)
      .map((fb) => fb.beat);
    if (beats.length === 0) return;
    out.push({ title: g.title, sceneName: g.sceneName, beats });
  });
  return out;
}

/** 按剧本段切镜口径下检出超 30 秒的段（=镜头）：只检出、不拆分。 */
export function detectOverlongForSegments(
  script: RulesScript,
): OverlongLens[] {
  const flat = flattenStoryboardBeats(script);
  const segments: LensSegment[] = [];
  script.groups.forEach((g, gi) => {
    const idx = flat
      .filter((fb) => fb.groupIndex === gi)
      .map((fb) => fb.flatIndex);
    if (idx.length === 0) return;
    segments.push({
      flatIndices: idx,
      title: g.title,
      sceneName: g.sceneName,
      duration: idx.reduce((s, i) => s + (flat[i]?.duration ?? 0), 0),
    });
  });
  return segmentsOverlong(flat, segments);
}

// ---------------------------------------------------------------------------
// v3.56 三处一致警告（只警告、不拦截）：大纲 ↔ 剧本 ↔ 分镜对不上的
// 地方列成只读清单，展示在保存 / 确认分镜的现有校验结果旁。警告
// 永远不进 blockers、不改 validateScriptData 的任何现有口径；用户
// 点「已知晓，仍确认」后照常继续。检出条件：
//   1. 大纲组标题与剧本段标题不一致 / 大纲组数 ≠ 剧本段数（大纲里
//      认不出「第X组」标题时整条跳过，不拿大纲散文硬比）；
//   2. 分镜某个镜头包含两个以上剧本段的内容（按节拍顺序对位）；
//   3. 模式1双层项目里：同一位未分层的妈妈在两个层都说话，或现在
//      层与以前层在同一段里来回交错超过一次切换（跨层串场迹象）；
//   4. 单个节拍超过 3 秒（模式1快节奏口径，只提醒）。
// ---------------------------------------------------------------------------

function extractOutlineGroupTitles(outline: string): string[] {
  const titles: string[] = [];
  for (const rawLine of outline.split(/\r?\n/)) {
    const line = rawLine
      .trim()
      .replace(/^#+\s*/, "")
      .replace(/\*\*/g, "");
    const m =
      line.match(
        /^第\s*[一二三四五六七八九十\d]+\s*组\s*[：:、.．\-—]?\s*(.+?)\s*$/,
      ) ?? line.match(/^组\s*\d+\s*[：:、.．\-—]?\s*(.+?)\s*$/);
    const t = m?.[1]?.trim();
    if (t) titles.push(t);
  }
  return titles;
}

function outlineTitleMatches(outlineTitle: string, scriptTitle: string): boolean {
  const norm = (s: string) =>
    s.replace(/[\s\p{P}]/gu, "").replace(/组$/, "");
  const a = norm(outlineTitle);
  const b = norm(scriptTitle);
  if (!a || !b) return true;
  return a === b || a.includes(b) || b.includes(a);
}

export function collectConsistencyWarnings(
  script: RulesScript & { storyboardGroups?: RulesGroup[] },
  opts?: { outline?: string; dualLayer?: boolean },
): string[] {
  const warnings: string[] = [];
  // 1) 大纲 ↔ 剧本：组数与逐组标题。
  const outlineTitles = extractOutlineGroupTitles(opts?.outline ?? "");
  if (outlineTitles.length > 0) {
    if (outlineTitles.length !== script.groups.length)
      warnings.push(
        `大纲组数与剧本段数不一致：大纲 ${outlineTitles.length} 组，剧本 ${script.groups.length} 段`,
      );
    outlineTitles.forEach((t, i) => {
      const st = script.groups[i]?.title?.trim();
      if (st != null && !outlineTitleMatches(t, st))
        warnings.push(
          `第 ${i + 1} 组标题不一致：大纲是「${t}」，剧本是「${st}」`,
        );
    });
  }
  // 2) 分镜镜头跨段：镜头节拍与剧本节拍同序对位，数每个镜头覆盖
  // 了几个剧本段。
  if (script.storyboardGroups && script.storyboardGroups.length > 0) {
    const flatSeg: number[] = [];
    script.groups.forEach((g, gi) =>
      g.beats.forEach(() => flatSeg.push(gi)),
    );
    let cursor = 0;
    script.storyboardGroups.forEach((lens, li) => {
      const segs = new Set<number>();
      for (let k = 0; k < lens.beats.length; k++) {
        const s = flatSeg[cursor + k];
        if (s != null) segs.add(s);
      }
      cursor += lens.beats.length;
      if (segs.size > 1)
        warnings.push(
          `分镜镜头 ${li + 1}「${lens.title}」包含 ${segs.size} 个剧本段的内容（镜头跨段）`,
        );
    });
  }
  // 3) 模式1双层：层 = 说话人名以「现在 / 以前」开头所标示的时空。
  if (opts?.dualLayer) {
    const layerOf = (name: string): "now" | "past" | null =>
      name.startsWith("现在")
        ? "now"
        : name.startsWith("以前")
          ? "past"
          : null;
    script.groups.forEach((g, gi) => {
      const present = new Set<string>();
      g.beats.forEach((b) => {
        const l = layerOf(b.speaker.trim());
        if (l) present.add(l);
      });
      if (present.size < 2) return;
      const runs: string[] = [];
      g.beats.forEach((b) => {
        const l = layerOf(b.speaker.trim());
        if (l && runs[runs.length - 1] !== l) runs.push(l);
      });
      if (runs.length > 2)
        warnings.push(
          `第 ${gi + 1} 段「${g.title}」里现在层与以前层来回交错（切换 ${runs.length - 1} 次）：双层项目层间应只有一次硬切，交错出现像是有人物跨层说话`,
        );
      const momLayers = new Set<string>();
      let ctx: string | null = null;
      g.beats.forEach((b) => {
        const sp = b.speaker.trim();
        const l = layerOf(sp);
        if (l) ctx = l;
        else if (sp.includes("妈妈") && ctx) momLayers.add(ctx);
      });
      if (momLayers.size > 1)
        warnings.push(
          `第 ${gi + 1} 段「${g.title}」里同一位妈妈（名字未分现在 / 以前）在两个层里都说话：双层项目的两位妈妈不是同一个人`,
        );
    });
  }
  // 4) 单拍超 3 秒（快节奏口径）。
  const rate = script.speechRate > 0 ? script.speechRate : 5;
  let longCount = 0;
  let firstLong = "";
  script.groups.forEach((g, gi) => {
    g.beats.forEach((b, bi) => {
      const d = beatDuration(b, rate);
      if (d > 3.05) {
        longCount += 1;
        if (!firstLong)
          firstLong = `第 ${gi + 1} 段·节拍 ${bi + 1}（${d.toFixed(1)} 秒）`;
      }
    });
  });
  if (longCount > 0)
    warnings.push(
      `有 ${longCount} 个节拍超过 3 秒（如 ${firstLong}）：模式1快节奏口径是单拍 1–3 秒`,
    );
  return warnings;
}

/** 按用户在再分配预览里确认的切分点生成镜头组（服务端最终校验同口径）。 */
export function buildStoryboardFromCuts(
  script: RulesScript,
  cutAfterFlat: number[],
): RulesGroup[] {
  const flat = flattenStoryboardBeats(script);
  return segmentsToGroups(flat, cutLensSegments(flat, cutAfterFlat));
}

export function storyboardSplitNotices(
  script: RulesScript,
  config?: StoryboardConfig,
): SplitNotice[] {
  void script;
  void config;
  return [];
}

// ---------------------------------------------------------------------------
// v3.92 严格审核（用户口径：剧本保证对话流畅不卡壳、无错别字、人物
// 对话准确；分镜提示词保证画面流畅准确、人物神态表情到位、镜头切换
// 符合画面场景、空镜时长不得超过 2 秒）。
//
// 两层机制，共用这一份实现（服务端校验 / 确认分镜拦截 / 页面清单 /
// AI 深度审核的确定性部分都从这里取）：
//   1) 确定性硬规则（本节，纯函数、可复现）：错别字词表与标点形态、
//      结巴/填充词/超长句、问答衔接、自称他人、画面为空、空镜计时
//      （无台词且画面里没有人物的节拍 = 空镜，单拍与连续合计都不得
//      超过 2 秒）、台词节拍神态表情证据、镜头内场景转场与景别运镜
//      说明。硬问题（blocker）进 validateScriptData 的 blockers 并在
//      确认分镜时对候选分镜再跑一遍分镜口径，拦住不生成；提醒
//      （warning）只列清单、不拦截。
//   2) AI 深度审核（actions.ts 的 runStrictAudit）：通读全稿查语义
//      层问题（读着卡壳、别字、人物口吻/身份错位、表情笼统、切镜
//      与场景不合），结果只展示、不自动改稿、不进硬拦截。
// ---------------------------------------------------------------------------

export type StrictCategory =
  | "dialogue_fluency"
  | "typo"
  | "character_accuracy"
  | "visual_continuity"
  | "expression"
  | "camera_transition"
  | "empty_shot";

export const STRICT_CATEGORY_LABELS: Record<StrictCategory, string> = {
  dialogue_fluency: "对话流畅",
  typo: "错别字",
  character_accuracy: "人物对话准确",
  visual_continuity: "画面流畅准确",
  expression: "神态表情",
  camera_transition: "镜头切换",
  empty_shot: "空镜时长",
};

export interface StrictIssue {
  severity: "blocker" | "warning";
  category: StrictCategory;
  scope: "script" | "storyboard";
  /** 段下标（0 起）；分镜口径下是镜头下标。 */
  groupIndex: number;
  beatIndex: number;
  /** 分镜口径下的镜头号（1 起）；剧本口径为空。 */
  lensIndex?: number;
  message: string;
  /** 原文证据（台词 / 画面片段），只引用不改写。 */
  evidence: string;
  suggestion: string;
}

export interface StrictAuditSummary {
  blockerCount: number;
  warningCount: number;
  passed: boolean;
  byCategory: Partial<Record<StrictCategory, { blockers: number; warnings: number }>>;
}

/** 常见确定错写（成语/常用词别字）：出现即错，逐条给出正写。 */
const KNOWN_TYPOS: [string, string][] = [
  ["迫不急待", "迫不及待"],
  ["再接再励", "再接再厉"],
  ["不径而走", "不胫而走"],
  ["一愁莫展", "一筹莫展"],
  ["走头无路", "走投无路"],
  ["翻来复去", "翻来覆去"],
  ["默守成规", "墨守成规"],
  ["世外桃园", "世外桃源"],
  ["甘败下风", "甘拜下风"],
  ["悬梁刺骨", "悬梁刺股"],
  ["出类拔粹", "出类拔萃"],
  ["谈笑风声", "谈笑风生"],
  ["按装", "安装"],
  ["幅射", "辐射"],
  ["针贬", "针砭"],
  ["脉博", "脉搏"],
  ["峻工", "竣工"],
  ["修茸", "修葺"],
  ["杀戳", "杀戮"],
];

const EXPRESSION_RE =
  /表情|眼神|脸色|面色|皱眉|眉头|瞪|眯|笑|哭|泪|惊|怒|慌|愣|呆|咬牙|挑眉|抿嘴|撇嘴|脸红|涨红|发白| grimace|expression/i;
const CAMERA_RE =
  /特写|近景|中景|全景|远景|大特写|推镜|拉镜|摇镜|移镜|跟拍|跟随镜头|俯拍|仰拍|平拍|机位|镜头|景别/;
const EMPTY_VISUAL_RE = /空镜|空景|无人|空无一人|没有人|空荡荡|空场/;
const GENERIC_EMOTIONS = new Set(["说话", "正常", "平静", "无", "开口", "平淡", "自然"]);
const FILLER_RE = /嗯|啊|呃|额|那个|这个/g;

function strictPush(
  out: StrictIssue[],
  issue: StrictIssue,
): void {
  out.push(issue);
}

function countOccurrences(text: string, sub: string): number {
  if (!sub) return 0;
  let n = 0;
  let i = text.indexOf(sub);
  while (i >= 0) {
    n++;
    i = text.indexOf(sub, i + sub.length);
  }
  return n;
}

/** 一句台词的确定性检查（错别字形态 + 流畅度），剧本/分镜共用。 */
function auditLineText(
  out: StrictIssue[],
  base: Omit<StrictIssue, "severity" | "category" | "message" | "evidence" | "suggestion">,
  line: string,
  speaker: string,
  registeredNames: string[],
): void {
  const t = line.trim();
  if (!t) return;
  const ev = t.slice(0, 30);
  // —— 错别字：确定错写词表 ——
  for (const [wrong, right] of KNOWN_TYPOS) {
    if (t.includes(wrong))
      strictPush(out, {
        ...base,
        severity: "blocker",
        category: "typo",
        message: `台词里有错别字：「${wrong}」应为「${right}」`,
        evidence: ev,
        suggestion: `把「${wrong}」改成「${right}」`,
      });
  }
  // —— 错别字形态：重复标点 / 混杂标点 / 括号引号不配对 / 句子没说完 ——
  const dupPunct = t.match(/([，。！？；：、])\1/);
  if (dupPunct)
    strictPush(out, {
      ...base,
      severity: "blocker",
      category: "typo",
      message: `台词里有重复标点「${dupPunct[0]}」，像是打错字`,
      evidence: ev,
      suggestion: "删掉多余的那个标点",
    });
  if (/[！？][！？][！？]|[，。][！？；]/.test(t))
    strictPush(out, {
      ...base,
      severity: "blocker",
      category: "typo",
      message: "台词里标点连用过多，像是打错字",
      evidence: ev,
      suggestion: "一处停顿只留一个标点（感叹/疑问最多连用两个）",
    });
  const pairs: [string, string][] = [
    ["「", "」"],
    ["『", "』"],
    ["《", "》"],
    ["“", "”"],
    ["（", "）"],
  ];
  for (const [open, close] of pairs) {
    if (countOccurrences(t, open) !== countOccurrences(t, close))
      strictPush(out, {
        ...base,
        severity: "blocker",
        category: "typo",
        message: `台词里「${open}」与「${close}」数量对不上，引号/括号没配对`,
        evidence: ev,
        suggestion: "补上或删掉多余的那一半符号",
      });
  }
  if (/[，、：；]$/.test(t))
    strictPush(out, {
      ...base,
      severity: "blocker",
      category: "dialogue_fluency",
      message: "这句台词以逗号/顿号/冒号结尾，像是没说完就断了",
      evidence: ev,
      suggestion: "把这句话补完整，或与下一句合并",
    });
  // —— 流畅：结巴式重复（同一短语连说 3 次以上，笑声除外） ——
  const rep = t.match(/(.{2,3})\1\1/);
  if (rep && !/哈|嘿|呵|笑/.test(rep[1] ?? ""))
    strictPush(out, {
      ...base,
      severity: "warning",
      category: "dialogue_fluency",
      message: `台词里「${rep[1]}」连说了 3 次以上，读起来卡壳（若是故意结巴可忽略）`,
      evidence: ev,
      suggestion: "删到只说一次，或改写成顺口的说法",
    });
  // —— 流畅：填充词过多 ——
  const fillers = t.match(FILLER_RE)?.length ?? 0;
  if (fillers >= 3)
    strictPush(out, {
      ...base,
      severity: "warning",
      category: "dialogue_fluency",
      message: `这句里有 ${fillers} 处「嗯/啊/那个/这个」类填充词，读起来容易卡壳`,
      evidence: ev,
      suggestion: "删掉填充词，只留要说的内容",
    });
  // —— 流畅：一句太长 ——
  const chars = countLineChars(t);
  if (chars > 45)
    strictPush(out, {
      ...base,
      severity: "warning",
      category: "dialogue_fluency",
      message: `这句台词 ${chars} 个字，一口气说不完、容易卡壳`,
      evidence: ev,
      suggestion: "拆成两句短句，或分到两个节拍里说",
    });
  // —— 人物准确：自称他人名字 ——
  const selfName = t.match(/我叫\s*([^\s，。！？、]{1,5})/);
  if (selfName && speaker) {
    const claimed = (selfName[1] ?? "").trim();
    if (claimed && claimed !== speaker && registeredNames.includes(claimed))
      strictPush(out, {
        ...base,
        severity: "blocker",
        category: "character_accuracy",
        message: `说话人是「${speaker}」，台词却自称「我叫${claimed}」，人物对不上`,
        evidence: ev,
        suggestion: "改说话人，或改台词里的名字",
      });
  }
}

/**
 * 剧本口径严格审核（审查稿段落）：逐拍查台词与画面。硬问题 =
 * 确定错别字/标点形态错误、自称他人、画面为空；其余为提醒。
 */
export function collectStrictIssues(
  script: RulesScript,
  registry: SpeakerRegistryEntry[],
): StrictIssue[] {
  const out: StrictIssue[] = [];
  const registeredNames = registry.map((e) => e.name.trim()).filter(Boolean);
  script.groups.forEach((g, gi) => {
    g.beats.forEach((b, bi) => {
      const base = { scope: "script" as const, groupIndex: gi, beatIndex: bi };
      const line = b.line.trim();
      const visual = b.visual.trim();
      if (line) {
        auditLineText(out, base, line, b.speaker.trim(), registeredNames);
        // 相邻重复台词
        const prev = g.beats[bi - 1];
        if (prev && prev.line.trim() === line)
          strictPush(out, {
            ...base,
            severity: "warning",
            category: "dialogue_fluency",
            message: "这句台词与上一拍一字不差地重复了一遍",
            evidence: line.slice(0, 30),
            suggestion: "删掉重复的那句，或改写后半句",
          });
        // 问答衔接：问句之后同一人继续说 = 自问自答嫌疑；下一拍
        // 无人回应且不是本段收尾 = 问句悬空提醒。
        if (/[？?]$/.test(line.replace(/[」”』）)]*$/, ""))) {
          const next = g.beats[bi + 1];
          if (next && next.line.trim() && next.speaker.trim() === b.speaker.trim() && b.speaker.trim())
            strictPush(out, {
              ...base,
              severity: "warning",
              category: "dialogue_fluency",
              message: `「${b.speaker.trim()}」问完紧接着还是自己说，像自问自答，对话不连贯`,
              evidence: line.slice(0, 30),
              suggestion: "让对方先接一句，或把问句改成陈述句",
            });
          else if (next && !next.line.trim())
            strictPush(out, {
              ...base,
              severity: "warning",
              category: "dialogue_fluency",
              message: "这句是问句，下一拍没人接话，问句悬空",
              evidence: line.slice(0, 30),
              suggestion: "给下一拍补一句回应，或用动作明确回应",
            });
        }
        // 神态：台词拍没有情绪标注、画面里也没有表情描写（提醒级，
        // 分镜口径下同一问题升为硬问题）。
        if (!b.emotion.trim() && !EXPRESSION_RE.test(visual))
          strictPush(out, {
            ...base,
            severity: "warning",
            category: "expression",
            message: "这句台词没有情绪/神态标注，画面里也没写表情，分镜时会缺神态",
            evidence: line.slice(0, 30),
            suggestion: "补上情绪（如：瞪大眼、咬牙）或在画面里写清表情",
          });
      }
      // 画面：为空 = 硬问题；过短 = 提醒。
      if (!visual)
        strictPush(out, {
          ...base,
          severity: "blocker",
          category: "visual_continuity",
          message: "这个节拍的画面描述是空的，分镜提示词没有画面可写",
          evidence: line.slice(0, 30) || "（无台词节拍）",
          suggestion: "补上这一拍的画面：谁在哪、在做什么",
        });
      else if (visual.length < 8 && (line || b.actionSeconds > 0))
        strictPush(out, {
          ...base,
          severity: "warning",
          category: "visual_continuity",
          message: `画面描述只有 ${visual.length} 个字，太短，生成画面容易跑偏`,
          evidence: visual,
          suggestion: "写清人物、动作与所在场景",
        });
    });
  });
  return out;
}

/**
 * 空镜判定：无台词，且画面里没有出现任何一位登记人物（也没有说话
 * 人），或画面明写空镜/无人。空镜节拍的时长按统一公式算（无台词
 * 节拍时长 = 动作秒数）。
 */
export function isEmptyShotBeat(
  beat: RulesBeat,
  registeredNames: string[],
): boolean {
  if (beat.line.trim()) {
    // 有旁白/台词压在空景上仍算空镜画面（画面里没人）。
    if (!EMPTY_VISUAL_RE.test(beat.visual)) return false;
    return !registeredNames.some((n) => n && beat.visual.includes(n));
  }
  if (EMPTY_VISUAL_RE.test(beat.visual)) return true;
  if (beat.speaker.trim()) return false;
  return !registeredNames.some((n) => n && beat.visual.includes(n));
}

/**
 * 分镜口径严格审核（对已打包/候选的镜头组跑）：空镜 ≤2 秒（单拍与
 * 连续空镜合计都算，硬拦截）、台词拍神态证据（硬拦截）、画面为空
 * （硬拦截）、镜头内场景转场与整镜景别/运镜说明（提醒）。
 */
export function collectStoryboardStrictIssues(
  script: RulesScript & { storyboardGroups?: RulesGroup[] },
  registry: SpeakerRegistryEntry[],
): StrictIssue[] {
  const out: StrictIssue[] = [];
  const groups = script.storyboardGroups ?? [];
  const registeredNames = registry.map((e) => e.name.trim()).filter(Boolean);
  const rate = script.speechRate > 0 ? script.speechRate : 5;
  groups.forEach((lens, li) => {
    let emptyRun = 0;
    let emptyRunBeats = 0;
    let emptyRunStart = -1;
    const flushEmptyRun = (endBeat: number) => {
      // 单拍空镜超限已由单拍条目单独报告，连续合计只报多拍情形，
      // 免得同一拍被重复计两条。
      if (emptyRun > 2.05 && emptyRunStart >= 0 && emptyRunBeats >= 2)
        strictPush(out, {
          severity: "blocker",
          category: "empty_shot",
          scope: "storyboard",
          groupIndex: li,
          beatIndex: emptyRunStart,
          lensIndex: li + 1,
          message: `镜头 ${li + 1} 里从第 ${emptyRunStart + 1} 拍起连续空镜共 ${emptyRun.toFixed(1)} 秒，超过 2 秒上限`,
          evidence: lens.beats[emptyRunStart]?.visual.trim().slice(0, 30) ?? "",
          suggestion: "把连续空镜压到 2 秒以内：删减空镜拍、给空镜加人物动作，或提前切到有人物的画面",
        });
      emptyRun = 0;
      emptyRunBeats = 0;
      emptyRunStart = -1;
      void endBeat;
    };
    let lensHasCamera = false;
    lens.beats.forEach((b, bi) => {
      const base = {
        scope: "storyboard" as const,
        groupIndex: li,
        beatIndex: bi,
        lensIndex: li + 1,
      };
      const line = b.line.trim();
      const visual = b.visual.trim();
      if (line) auditLineText(out, base, line, b.speaker.trim(), registeredNames);
      if (!visual)
        strictPush(out, {
          ...base,
          severity: "blocker",
          category: "visual_continuity",
          message: `镜头 ${li + 1} 第 ${bi + 1} 拍画��描述为空，提示词没有画面可写`,
          evidence: line.slice(0, 30) || "（无台词节拍）",
          suggestion: "补上这一拍的画面：谁在哪、在做什么",
        });
      if (CAMERA_RE.test(visual)) lensHasCamera = true;
      // —— 空镜 ≤2 秒 ——
      const dur = beatDuration(b, rate);
      if (isEmptyShotBeat(b, registeredNames)) {
        if (emptyRunStart < 0) emptyRunStart = bi;
        emptyRun += dur;
        emptyRunBeats += 1;
        if (!line && dur > 2.05)
          strictPush(out, {
            ...base,
            severity: "blocker",
            category: "empty_shot",
            message: `镜头 ${li + 1} 第 ${bi + 1} 拍是空镜（无台词、画面里没有人物），时长 ${dur.toFixed(1)} 秒，超过 2 秒上限`,
            evidence: visual.slice(0, 30),
            suggestion: "把这一拍的动作秒数压到 2 秒以内，或给画面加人物/台词",
          });
      } else {
        flushEmptyRun(bi);
      }
      // —— 神态表情：台词拍必须有可用神态 ——
      if (line) {
        const emotion = b.emotion.trim();
        const visualHasExpr = EXPRESSION_RE.test(visual);
        if (!emotion && !visualHasExpr)
          strictPush(out, {
            ...base,
            severity: "blocker",
            category: "expression",
            message: `镜头 ${li + 1} 第 ${bi + 1} 拍有台词却没有神态表情（情绪没填、画面也没写表情），提示词里人物会面无表情`,
            evidence: line.slice(0, 30),
            suggestion: "补上这一拍的情绪/神态（如：瞪大眼、咬牙切齿），或在画面里写清表情",
          });
        else if (emotion && GENERIC_EMOTIONS.has(emotion) && !visualHasExpr)
          strictPush(out, {
            ...base,
            severity: "warning",
            category: "expression",
            message: `镜头 ${li + 1} 第 ${bi + 1} 拍的情绪只写了「${emotion}」，太笼统，神态不到位`,
            evidence: line.slice(0, 30),
            suggestion: "换成具体的神态：眼神、眉头、嘴角怎么动",
          });
      }
      // —— 镜头切换：镜头内部出现场景转场 ——
      if (bi > 0 && b.cutReason === "场景转场")
        strictPush(out, {
          ...base,
          severity: "warning",
          category: "camera_transition",
          message: `镜头 ${li + 1} 内部第 ${bi + 1} 拍发生了场景转场，一个镜头跨了两个场景，提示词会串场`,
          evidence: visual.slice(0, 30),
          suggestion: "在再分配预览里把切分点落在转场处，让转场成为镜头之间的切换",
        });
    });
    flushEmptyRun(lens.beats.length);
    if (!lensHasCamera && lens.beats.length > 0)
      strictPush(out, {
        severity: "warning",
        category: "camera_transition",
        scope: "storyboard",
        groupIndex: li,
        beatIndex: 0,
        lensIndex: li + 1,
        message: `镜头 ${li + 1} 全镜没有景别/运镜说明（特写/近景/推镜等），提示词只能默认中景`,
        evidence: lens.beats[0]?.visual.trim().slice(0, 30) ?? "",
        suggestion: "在画面里补一处景别或运镜，如「近景，镜头缓推」",
      });
  });
  return out;
}

export function strictAuditSummary(issues: StrictIssue[]): StrictAuditSummary {
  const byCategory: StrictAuditSummary["byCategory"] = {};
  let blockerCount = 0;
  let warningCount = 0;
  for (const i of issues) {
    const slot = (byCategory[i.category] ??= { blockers: 0, warnings: 0 });
    if (i.severity === "blocker") {
      blockerCount++;
      slot.blockers++;
    } else {
      warningCount++;
      slot.warnings++;
    }
  }
  return { blockerCount, warningCount, passed: blockerCount === 0, byCategory };
}

// ---------------------------------------------------------------------------
// 结构化校验结果（服务端在保存剧本与确认分镜时返回，客户端只展示）
// ---------------------------------------------------------------------------

export interface ScriptValidation {
  /** 审查稿（原始段落口径）的时长试算。 */
  reviewDuration: DurationSummary;
  /** 待确认人物清单。 */
  speakerIssues: SpeakerIssue[];
  /** 临时人物表（与待确认清单共用同一份检出）。 */
  tempCharacters: TempCharacter[];
  /** 人物表/说话人超出第 1 步登记人物的名字（确认分镜拦截项）。 */
  extraCharacters: string[];
  /** v3.92 严格审核（剧本口径）问题清单：硬问题同时进 blockers。 */
  strictIssues: StrictIssue[];
  /** v3.92 严格审核汇总（通过 = 无硬问题）。 */
  strictSummary: StrictAuditSummary;
  /** 确认分镜拦截原因（空数组 = 可确认）。 */
  blockers: string[];
  /**
   * v4.16 人物资产提醒（只提醒、不拦截）：人物资产卡按新流程在确认
   * 分镜之后才建，所以「剧本里的人还没建人物卡 / 说话人未登记 /
   * 临时人物未处理」这类问题一律只进这里展示，不再进 blockers。
   */
  characterWarnings: string[];
}

export function validateScriptData(
  script: RulesScript & {
    characterRows?: { name: string }[];
    synopsis?: string;
    pendingItems?: string[];
    tempCharacterStates?: Record<string, TempCharacterState>;
  },
  registry: SpeakerRegistryEntry[],
  registeredNames: string[],
  outline = "",
  options?: {
    // v4.79：AI解剖一键套用生成的项目（projects.source = "ai-dissect"）
    // 分镜确认时跳过严格审核——严格硬问题仍照常检出并留在
    // strictIssues / strictSummary 里供面板展示，但不再写进 blockers
    // 拦截确认分镜。其余拦截（台词没写说话人 / 超目标 / 单拍超 30 秒）
    // 与本开关无关，照旧。
    skipStrictBlockers?: boolean;
  },
): ScriptValidation {
  const reviewDuration = durationSummary(script, script.groups);
  const speakerIssues = collectSpeakerIssues(script, registry);
  const tempCharacters = collectTempCharacters(script, registry, {
    outline,
    states: script.tempCharacterStates,
  });
  const inputNames = new Set(registeredNames.map((n) => n.trim()).filter(Boolean));
  const extras = new Set<string>();
  for (const r of script.characterRows ?? []) {
    const n = r.name.trim();
    if (n && !inputNames.has(n)) extras.add(n);
  }
  for (const g of script.groups) {
    for (const b of g.beats) {
      const n = b.speaker.trim();
      if (n && !inputNames.has(n)) extras.add(n);
    }
  }
  const extraCharacters = [...extras];
  const blockers: string[] = [];
  // v4.16：没有人物资产卡不再拦截任何一步（人物资产改为确认分镜后
  // 在分镜页「按分镜写资产提示词」才建）。与人物卡缺失相关的问题
  // 全部降为文字提醒（characterWarnings）：未登记人物、说话人未登
  // 记 / 称呼非人物名、临时人物未处理。唯一仍拦截的是「有台词却没
  // 写说话人」——那是台词本身缺信息、与有没有资产卡无关。
  const characterWarnings: string[] = [];
  if (extraCharacters.length > 0)
    characterWarnings.push(
      `剧本里出现了还没记入人物的人物：${extraCharacters.join("、")}（不拦截：生成剧本时本应由系统自动设计并加入——有台词的进正式人物表、无台词的记为群演；如刚手动改稿或导入新增，审查页会自动补上，也可点「重新自动加入」；人物资产提示词仍在确认分镜后写）`,
    );
  const emptySpeakerIssues = speakerIssues.filter((i) => i.kind === "empty");
  const cardSpeakerIssues = speakerIssues.filter((i) => i.kind !== "empty");
  if (cardSpeakerIssues.length > 0)
    characterWarnings.push(
      `待确认人物清单还有 ${cardSpeakerIssues.length} 项未处理（未登记 / 称呼非人物名）（不拦截：确认分镜后可在分镜页按分镜写资产提示词建卡，台词归属也可以之后再映射）`,
    );
  if (emptySpeakerIssues.length > 0)
    blockers.push(
      `有 ${emptySpeakerIssues.length} 处台词没写说话人：先在审查页给这些节拍补上说话人再确认分镜`,
    );
  if (reviewDuration.overTarget)
    blockers.push(
      `全片总时长 ${reviewDuration.totalSeconds.toFixed(1)} 秒，超过目标 ${reviewDuration.targetSeconds} 秒（超 ${(reviewDuration.totalSeconds - reviewDuration.targetSeconds).toFixed(1)} 秒）`,
    );
  if (reviewDuration.hasUnsplittableBeat)
    blockers.push(
      "有单个节拍超过 30 秒：节拍不会被切开，先缩短那句台词或拆成两个节拍",
    );
  // 新人物检出提醒（v4.16 起只提醒、不拦截；v4.17 起生成时自动分拣）：
  // 与待确认清单共用检出——说话人类已由上面 speakerIssues 的提醒覆盖，
  // 这里只补文字来源（画面/梗概/大纲点名）的新人物与「已记群演却又有
  // 台词」的重新提示，避免同一人重复报。v4.17 起新人物在生成剧本并
  // 保存时由服务端 autoDesignNewCharacters 自动分拣（有台词进正式
  // 人物表并建卡、无台词记为群演），这里剩下的只是手动改稿 / 导入后
  // 还没被自动补上的残留提醒，不卡确认分镜。
  const speakerIssueNames = new Set(
    speakerIssues.map((i) => i.speaker).filter(Boolean),
  );
  for (const t of tempCharacters) {
    if (t.status === "extra-with-dialogue")
      characterWarnings.push(
        `已记为无台词群演的「${t.name}」又有 ${t.dialogueCount} 句台词：有台词就该进正式人物表——审查页会自动把 TA 转入正式人物，也可在审查页「本次生成已自动加入」清单里把 TA 移入正式表、映射或删台词（不拦截确认分镜）`,
      );
    else if (t.status === "pending" && !speakerIssueNames.has(t.name))
      characterWarnings.push(
        `新出现的人物「${t.name}」还没被自动分拣：生成时本应自动处理（有台词进正式人物表、无台词记为群演）；如刚手动改稿新增，审查页会自动补上（不拦截确认分镜）`,
      );
  }
  // v3.92 严格审核（剧本口径）：硬问题进拦截（逐项清单在页面
  // 「严格审核」面板里，拦截文案只汇总计数与前两项，避免整段刷屏）。
  // v4.79 例外：skipStrictBlockers（AI解剖套用项目）时硬问题只检出
  // 展示、不进 blockers——这类项目分镜确认跳过严格审核。
  const strictIssues = collectStrictIssues(script, registry);
  const strictSummary = strictAuditSummary(strictIssues);
  if (strictSummary.blockerCount > 0 && !options?.skipStrictBlockers) {
    const first = strictIssues
      .filter((i) => i.severity === "blocker")
      .slice(0, 2)
      .map((i) => i.message)
      .join("；");
    blockers.push(
      `严格审核未通过：剧本有 ${strictSummary.blockerCount} 项硬问题（${first}${strictSummary.blockerCount > 2 ? "；等" : ""}）——先在审查页「严格审核」清单里逐项改完再确认分镜`,
    );
  }
  return {
    reviewDuration,
    speakerIssues,
    tempCharacters,
    extraCharacters,
    strictIssues,
    strictSummary,
    blockers,
    characterWarnings,
  };
}

// ---------------------------------------------------------------------------
// v3.96 爆款审核（融入 ceoifung/ai-short-drama 的多级审核门禁方法论：
// Stage 2「剧本审核官按 L1 rubric 审核，不过就打回，最多 2 轮」）。
// 与 v3.92 严格审核分工：严格审核查通用文字质量（错别字 / 标点 /
// 病句），爆款审核查内容爆款度 + 当前模式的基因卡铁律。
//
// 本节是确定性部分（纯函数、与服务端 / 客户端共用一份）：
//   - L1-合规：脏话词表、暴力细节特写词（画面）——出现即硬问题；
//   - L1-质量：说话人不在人物表（角色名不一致）、超长书面句提醒；
//   - L1-爆款三要素的形态侧：开头第一拍无台词又无强钩子画面词、
//     结尾最后一拍无钩子信号词——只作提醒，语义判定由服务端
//     runViralAudit 的 AI 审核官给出（可升为硬问题）；
//   - 模式铁律（有基因卡才注入）：
//     模式1（现在 vs 以前双层对比）——双层结构完整性（大纲与剧本
//     都要分得出 现在层 / 以前层）、跨层对话拦截（同段内两层来回
//     交错、跨层点名喊话、同一位未分层妈妈在两层说话）、快节奏
//     （单拍超过 3 秒 = 硬问题，v3.56 的同名警告在此升级为拦截）、
//     以前小孩主导（含双层的段，反转落点必须是以前层收尾）；
//     模式2（荒诞规则合集）——确定性只查合集段数过少，立规则 /
//     一本正经执行 / 梗句硬切 / 荒诞递增 / 最强反转收尾由 AI 审。
//   模式 3–5 未训练（无基因卡）或未选模式：只跑通用三项，结论由
//   服务端注明「未注入模式铁律」。
// 审核只读不改稿；打回重写是另一个动作（rewriteScriptForViral）。
// ---------------------------------------------------------------------------

export type ViralCategory =
  | "compliance"
  | "viral_hook"
  | "viral_escalation"
  | "viral_ending"
  | "quality"
  | "mode_rule";

export const VIRAL_CATEGORY_LABELS: Record<ViralCategory, string> = {
  compliance: "L1-合规",
  viral_hook: "L1-爆款·黄金三秒",
  viral_escalation: "L1-爆款·冲突升级",
  viral_ending: "L1-爆款·结尾钩子",
  quality: "L1-质量",
  mode_rule: "模式铁律",
};

export interface ViralIssue {
  severity: "blocker" | "warning";
  category: ViralCategory;
  /** 命中的检查项名（如「跨层对话」「黄金三秒」），结论必须点名。 */
  rule: string;
  /** 段下标（0 起）；-1 = 全片 / 大纲级问题。 */
  groupIndex: number;
  /** 节拍下标（0 起）；-1 = 整段 / 全片级。 */
  beatIndex: number;
  message: string;
  evidence: string;
  suggestion: string;
}

export interface ViralAuditSummary {
  blockerCount: number;
  warningCount: number;
  passed: boolean;
}

export function viralAuditSummary(issues: ViralIssue[]): ViralAuditSummary {
  let blockerCount = 0;
  let warningCount = 0;
  for (const i of issues) {
    if (i.severity === "blocker") blockerCount++;
    else warningCount++;
  }
  return { blockerCount, warningCount, passed: blockerCount === 0 };
}

/**
 * 剧本内容哈希（FNV-1a）：只覆盖段落正文（标题 / 场景 / 每拍画面、
 * 音效、说话人、情绪、台词、动作秒数）。爆款审核结论按这份哈希与
 * 稿子绑定：审完之后稿子再被改动（哈希对不上），门禁重新关闭，
 * 必须重审。客户端与服务端共用同一份实现，必然一致。
 */
export function scriptContentHash(script: RulesScript): string {
  const payload = JSON.stringify(
    script.groups.map((g) => [
      g.title,
      g.sceneName,
      g.beats.map((b) => [
        b.visual,
        b.sfx,
        b.speaker,
        b.emotion,
        b.line,
        b.actionSeconds,
      ]),
    ]),
  );
  let h = 0x811c9dc5;
  for (let i = 0; i < payload.length; i++) {
    h ^= payload.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `h${(h >>> 0).toString(16)}`;
}

/** 脏话（确定违规口径）：出现即不合规，喜剧内容同样适用。 */
const PROFANITY_WORDS = [
  "他妈的",
  "你妈的",
  "操你",
  "肏你",
  "傻逼",
  "煞笔",
  "妈的个",
  "贱人",
  "贱货",
  "婊子",
  "王八蛋",
  "滚蛋",
  "去死吧",
  "草泥马",
  "尼玛",
];

/** 暴力细节特写词：冲突只能靠台词与表情体现，不写血腥特写。 */
const VIOLENCE_CLOSEUP_WORDS = [
  "鲜血四溅",
  "血流满面",
  "满脸是血",
  "血肉模糊",
  "断肢",
  "砍头",
  "捅进",
  "捅穿",
  "刀子插进",
  "开膛",
  "脑浆",
  "眼珠爆",
  "骨头断裂声",
];

/** 开头强钩子的画面信号词（形态侧判定，语义判定归 AI 审核官）。 */
const HOOK_VISUAL_RE =
  /哭|喊|怒吼|吼|瞪|摔|砸|掀|冲|抢|夺|惊|愣|僵|冲突|对峙|质问|指着|特写|巴掌|耳光|炸响|翻脸|掀桌/;
/** 结尾钩子信号词：互动提问 / 悬念 / 最强反转的形态标记。 */
const ENDING_HOOK_RE =
  /[？?]|如果是你|你会|你们说|评论|点亮|点赞|关注|没想到|竟然|原来是|反转|结果是|猜猜|到底是|悬念|未完|下集|谁能想到|奥特曼|meme|狂欢/;

type LayerKind = "now" | "past";

/** 说话人 / 文本所属的层：名字或文本以「现在 / 以前」为层标记。 */
function layerOfName(name: string): LayerKind | null {
  const n = name.trim();
  if (n.startsWith("现在")) return "now";
  if (n.startsWith("以前")) return "past";
  return null;
}

export interface ViralAuditOptions {
  /** 当前项目选中的模式（0 = 未选）。 */
  modeId: number;
  /** 该模式是否有基因卡（无卡则不注入模式铁律）。 */
  hasGeneCard: boolean;
  /** 项目大纲原文（模式1 的双层结构完整性要查大纲有没有分层）。 */
  outline: string;
}

export function collectViralIssues(
  script: RulesScript,
  registry: SpeakerRegistryEntry[],
  opts: ViralAuditOptions,
): ViralIssue[] {
  const out: ViralIssue[] = [];
  const push = (i: ViralIssue) => out.push(i);
  const knownNames = new Set<string>();
  for (const e of registry) {
    const n = e.name.trim();
    if (n) knownNames.add(n);
  }
  const rate = script.speechRate > 0 ? script.speechRate : 5;

  script.groups.forEach((g, gi) => {
    g.beats.forEach((b, bi) => {
      const line = b.line.trim();
      const visual = b.visual.trim();
      // —— L1-合规：脏话 ——
      if (line) {
        for (const w of PROFANITY_WORDS) {
          if (line.includes(w))
            push({
              severity: "blocker",
              category: "compliance",
              rule: "无脏话",
              groupIndex: gi,
              beatIndex: bi,
              message: `台词里有脏话「${w}」，违反平台合规口径（喜剧内容同样不许）`,
              evidence: line.slice(0, 30),
              suggestion: `把「${w}」换成不带脏字的说法，冲突靠语气和表情体现`,
            });
        }
      }
      // —— L1-合规：暴力细节特写 ——
      for (const w of VIOLENCE_CLOSEUP_WORDS) {
        if (visual.includes(w))
          push({
            severity: "blocker",
            category: "compliance",
            rule: "无暴力细节特写",
            groupIndex: gi,
            beatIndex: bi,
            message: `画面里有暴力细节特写「${w}」，违反平台合规口径`,
            evidence: visual.slice(0, 30),
            suggestion: "删掉血腥特写，冲突改用台词、表情和声音效果体现",
          });
      }
      // —— L1-质量：角色名与人物表一致 ——
      if (line) {
        const sp = b.speaker.trim();
        if (sp && knownNames.size > 0 && !knownNames.has(sp))
          push({
            severity: "blocker",
            category: "quality",
            rule: "角色名与人物表一致",
            groupIndex: gi,
            beatIndex: bi,
            message: `说话人「${sp}」不在人物表里，角色名对不上`,
            evidence: line.slice(0, 30),
            suggestion: "把说话人改成人物表里登记的名字，或先在人物表补登记",
          });
        // —— L1-质量：台词口语化（无书面长句）——
        const chars = countLineChars(line);
        if (chars > 30)
          push({
            severity: "warning",
            category: "quality",
            rule: "台词口语化",
            groupIndex: gi,
            beatIndex: bi,
            message: `这句台词 ${chars} 个字，偏书面长句，不像人嘴里说出来的话`,
            evidence: line.slice(0, 30),
            suggestion: "拆成两句 5–12 字的口语短句，一问一答推进",
          });
      }
    });
  });

  // —— L1-爆款·黄金三秒（形态侧）：第一拍没台词、画面也没有强
  // 冲突信号，先给提醒；是否有强钩子由 AI 审核官做语义判定。
  const firstGroup = script.groups[0];
  const firstBeat = firstGroup?.beats[0];
  if (firstBeat) {
    if (!firstBeat.line.trim() && !HOOK_VISUAL_RE.test(firstBeat.visual))
      push({
        severity: "warning",
        category: "viral_hook",
        rule: "黄金三秒",
        groupIndex: 0,
        beatIndex: 0,
        message:
          "开头第一拍没有台词、画面里也看不到强冲突信号（哭喊 / 对峙 / 反常动作），黄金三秒可能抓不住人",
        evidence: firstBeat.visual.trim().slice(0, 30) || "（第一拍画面为空）",
        suggestion:
          "第一拍直接上强钩子：一句带冲突的台词或一个反常画面（如小孩夸张哭喊、怒吼质问），不要先铺垫背景",
      });
  }
  // —— L1-爆款·结尾钩子（形态侧）：最后一拍找不到钩子信号词。
  const lastGi = script.groups.length - 1;
  const lastGroup = script.groups[lastGi];
  const lastBeat = lastGroup?.beats[lastGroup.beats.length - 1];
  if (lastBeat) {
    const tail = `${lastBeat.line} ${lastBeat.visual}`;
    if (!ENDING_HOOK_RE.test(tail))
      push({
        severity: "warning",
        category: "viral_ending",
        rule: "结尾钩子",
        groupIndex: lastGi,
        beatIndex: (lastGroup?.beats.length ?? 1) - 1,
        message:
          "结尾最后一拍看不到钩子信号（互动提问 / 悬念 / 最强反转都没有明确落点），观众看完就划走",
        evidence: (lastBeat.line.trim() || lastBeat.visual.trim()).slice(0, 30),
        suggestion:
          "把全片最强反转留到最后一拍收尾，或结尾加一句互动提问（如「如果是你，你会怎么做？」）",
      });
  }

  // —— 模式铁律（有基因卡才注入） ——
  if (opts.hasGeneCard && opts.modeId === 1) {
    collectMode1IronIssues(script, opts.outline, rate, push);
  } else if (opts.hasGeneCard && opts.modeId === 2) {
    // 模式2 确定性部分：荒诞规则合集靠段数撑密度，段太少先提醒；
    // 立规则 / 认真执行 / 梗句硬切 / 荒诞递增 / 最强反转由 AI 审。
    if (script.groups.length > 0 && script.groups.length < 3)
      push({
        severity: "warning",
        category: "mode_rule",
        rule: "合集段数",
        groupIndex: -1,
        beatIndex: -1,
        message: `全片只有 ${script.groups.length} 段：荒诞规则合集靠多段并列撑密度（原片 6–11 段），段数太少撑不起合集感`,
        evidence: "",
        suggestion: "补到至少 3 段以上，每段一条新规则、一个梗句收尾",
      });
  }
  return out;
}

/** 模式1 铁律（双层对比）：四项硬检查，全部点名到段到拍。 */
function collectMode1IronIssues(
  script: RulesScript,
  outline: string,
  rate: number,
  push: (i: ViralIssue) => void,
): void {
  const ruleBase = { category: "mode_rule" as const };
  // 每拍的层：优先看说话人名的层标记；无台词或说话人未标层时，
  // 看画面里点名的分层人物；再不行看段标题 / 场景名的层标记。
  const layerNames: Record<LayerKind, Set<string>> = {
    now: new Set<string>(),
    past: new Set<string>(),
  };
  script.groups.forEach((g) => {
    g.beats.forEach((b) => {
      const l = layerOfName(b.speaker);
      if (l && b.speaker.trim()) layerNames[l].add(b.speaker.trim());
    });
  });
  const beatLayer = (g: RulesGroup, b: RulesBeat): LayerKind | null => {
    const bySpeaker = layerOfName(b.speaker);
    if (bySpeaker) return bySpeaker;
    for (const l of ["now", "past"] as LayerKind[]) {
      for (const n of layerNames[l]) {
        if (n && b.visual.includes(n)) return l;
      }
    }
    return layerOfName(g.title) ?? layerOfName(g.sceneName);
  };

  // —— 铁律 1：双层结构完整性 ——
  const outlineHasNow = /现在(层|段|小孩|的)/.test(outline);
  const outlineHasPast = /以前(层|段|小孩|的)/.test(outline);
  if (outline.trim() && !(outlineHasNow && outlineHasPast))
    push({
      ...ruleBase,
      severity: "blocker",
      rule: "双层结构完整性",
      groupIndex: -1,
      beatIndex: -1,
      message:
        "大纲没有明确分出「现在层 / 以前层」：模式1 是双层对比结构，大纲先分层、剧本才能照着分层写",
      evidence: outline.trim().slice(0, 30),
      suggestion: "在大纲里把每组明确拆成现在层一段、以前层一段，两层分别写清人物与事件",
    });
  const layersPresent = new Set<LayerKind>();
  script.groups.forEach((g) => {
    g.beats.forEach((b) => {
      const l = beatLayer(g, b);
      if (l) layersPresent.add(l);
    });
    const gl = layerOfName(g.title) ?? layerOfName(g.sceneName);
    if (gl) layersPresent.add(gl);
  });
  if (!layersPresent.has("past"))
    push({
      ...ruleBase,
      severity: "blocker",
      rule: "双层结构完整性",
      groupIndex: -1,
      beatIndex: -1,
      message:
        "全片找不到「以前层」（说话人 / 段标题 / 场景都没有以前层标记）：模式1 必须现在层铺垫、以前层反转，两层缺一不可",
      evidence: "",
      suggestion: "给以前层的段落与人物明确标上「以前」标记（如以前小孩、以前妈妈），并保证每组都有以前层收尾",
    });
  if (!layersPresent.has("now"))
    push({
      ...ruleBase,
      severity: "blocker",
      rule: "双层结构完整性",
      groupIndex: -1,
      beatIndex: -1,
      message:
        "全片找不到「现在层」（说话人 / 段标题 / 场景都没有现在层标记）：模式1 必须现在层铺垫、以前层反转，两层缺一不可",
      evidence: "",
      suggestion: "给现在层的段落与人物明确标上「现在」标记（如现在小孩、现在妈妈）",
    });

  script.groups.forEach((g, gi) => {
    const layers = g.beats.map((b) => beatLayer(g, b));
    // —— 铁律 2：跨层对话拦截 ——
    // (a) 同段内两层来回交错（层序列切换超过 1 次）= 有人跨层说话。
    const runs: LayerKind[] = [];
    for (const l of layers) {
      if (l && runs[runs.length - 1] !== l) runs.push(l);
    }
    if (runs.length > 2) {
      const crossAt = layers.findIndex(
        (l, i) => l != null && i > 0 && layers.slice(0, i).some((p) => p != null && p !== l) && layers[i - 1] !== l,
      );
      push({
        ...ruleBase,
        severity: "blocker",
        rule: "跨层对话",
        groupIndex: gi,
        beatIndex: Math.max(0, crossAt),
        message: `第 ${gi + 1} 段「${g.title}」里现在层与以前层来回交错（切换 ${runs.length - 1} 次）：两层是不同时空，层间只能硬切对比，人物不能跨层对话 / 点评 / 串场`,
        evidence: g.beats[Math.max(0, crossAt)]?.line.trim().slice(0, 30) ?? "",
        suggestion: "把这一段拆成现在层一段、以前层一段：层内自己人对话，层与层之间只硬切，不互相接话",
      });
    }
    // (b) 台词里点名喊对方层的人物 = 跨层喊话。
    g.beats.forEach((b, bi) => {
      const myLayer = layerOfName(b.speaker);
      if (!myLayer || !b.line.trim()) return;
      const other: LayerKind = myLayer === "now" ? "past" : "now";
      for (const n of layerNames[other]) {
        if (n && b.line.includes(n)) {
          push({
            ...ruleBase,
            severity: "blocker",
            rule: "跨层对话",
            groupIndex: gi,
            beatIndex: bi,
            message: `「${b.speaker.trim()}」（${myLayer === "now" ? "现在层" : "以前层"}）的台词里直接点名了${other === "now" ? "现在层" : "以前层"}的「${n}」：两个时空的人不能互相喊话`,
            evidence: b.line.trim().slice(0, 30),
            suggestion: "删掉这句跨层喊话，改成本层人物之间的对话，反差靠硬切后的画面对比出来",
          });
          break;
        }
      }
    });
    // (c) 同一位未分层的妈妈在两个层里都说话 = 串场妈妈。
    {
      const momLayers = new Set<LayerKind>();
      let ctxLayer: LayerKind | null = null;
      g.beats.forEach((b) => {
        const l = beatLayer(g, b);
        if (l) ctxLayer = l;
        const sp = b.speaker.trim();
        if (sp.includes("妈妈") && !layerOfName(sp) && ctxLayer)
          momLayers.add(ctxLayer);
      });
      if (momLayers.size > 1)
        push({
          ...ruleBase,
          severity: "blocker",
          rule: "跨层对话",
          groupIndex: gi,
          beatIndex: -1,
          message: `第 ${gi + 1} 段「${g.title}」里同一位妈妈（名字未分现在 / 以前）在两个层里都说话：两位妈妈是不同时空的不同人，不能串场`,
          evidence: "",
          suggestion: "把两位妈妈分开命名（现在妈妈 / 以前妈妈），各自只在本层说话",
        });
    }
    // —— 铁律 4：以前小孩主导（含双层的段，反转必须落在以前层） ——
    const present = new Set(layers.filter(Boolean) as LayerKind[]);
    if (present.size === 2) {
      let lastLayer: LayerKind | null = null;
      let lastIdx = -1;
      layers.forEach((l, i) => {
        if (l) {
          lastLayer = l;
          lastIdx = i;
        }
      });
      if (lastLayer === "now")
        push({
          ...ruleBase,
          severity: "blocker",
          rule: "以前小孩主导",
          groupIndex: gi,
          beatIndex: lastIdx,
          message: `第 ${gi + 1} 段「${g.title}」最后落在现在层：模式1 每组的反转与梗句收尾必须落在以前层（以前小孩主导），现在层只负责铺垫`,
          evidence: g.beats[lastIdx]?.line.trim().slice(0, 30) ?? "",
          suggestion: "把这一段的收尾换成以前层的梗句：以前小孩用童言梗定格后硬切下一组",
        });
    }
  });

  // —— 铁律 3：快节奏（单拍超过 3 秒 = 硬问题；v3.56 同名警告
  // 在爆款审核里升级为拦截）。逐拍点名，最多列 12 条防刷屏。
  let longCount = 0;
  script.groups.forEach((g, gi) => {
    g.beats.forEach((b, bi) => {
      const d = beatDuration(b, rate);
      if (d > 3.05) {
        longCount++;
        if (longCount <= 12)
          push({
            ...ruleBase,
            severity: "blocker",
            rule: "快节奏·单拍超3秒",
            groupIndex: gi,
            beatIndex: bi,
            message: `这一拍 ${d.toFixed(1)} 秒，超过模式1 快节奏的单拍 3 秒上限（1–3 秒一镜、梗后立刻硬切）`,
            evidence: (b.line.trim() || b.visual.trim()).slice(0, 30),
            suggestion: "把这句台词拆短（5–12 字一句）或把动作秒数压下来，让这一拍回到 3 秒以内",
          });
      }
    });
  });
  if (longCount > 12)
    push({
      ...ruleBase,
      severity: "blocker",
      rule: "快节奏·单拍超3秒",
      groupIndex: -1,
      beatIndex: -1,
      message: `全片共有 ${longCount} 个节拍超过 3 秒（上面只列了前 12 个）：模式1 是快节奏硬标准，慢节奏即不合格`,
      evidence: "",
      suggestion: "逐拍拆短台词、压缩动作秒数，全片回到 1–3 秒一拍",
    });
}
