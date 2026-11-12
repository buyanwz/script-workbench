// v3.76 内容指纹：把「1:1 复刻」从数量对上升级为内容逐项对上。
//
// 导出时从服务端全库清单（exportBackupManifest 的返回，本身就带每个
// 项目的完整剧本 JSON、每张储存库卡的全部字段、每张基因卡的全部文
// 字段、每张图的 etag——etag 即图片字节的 SHA-256）算出一份指纹写进
// 复刻包：
//   · 项目：名 + 大纲哈希 + 剧本 JSON 的 SHA-256 + 每份快照的 SHA-256
//   · 储存库卡：名 + 全部填写字段（10 部位中英文 / 身份 / 备注 / 性格
//     / 分类 / 锁定）的规范串 SHA-256
//   · 基因卡：模式 id + 卡版本 + 全部文字段与权重的规范串 SHA-256
//   · 图片：全部图片 etag 的去重排序集合（etag 就是字节 SHA-256）
//   · 数量：清单 counts 原样
// 导入结束后，新工作台回读自己的全库清单、用同一口径再算一份指纹，
// 与包内指纹逐项比对（子集口径：包内每一项都必须在新台找到内容完全
// 一致的对应项；新台导入前已有的额外数据不算未对上、只在明细里注
// 明）。比对结果进导入核对清单——内容级 1:1 是否成立由哈希说话，
// 不再只靠数量和肉眼抽查。
//
// 两边必须同口径：本模块是唯一实现，导出与导入后核对都调它；规范
// 串用数组 JSON.stringify（字段顺序由数组顺序固定，不依赖对象键
// 序）；哈希统一走 sha256Hex（与图片校验同一入口）。

import { sha256Hex } from "./sha256";
import type { api, ApiResponse } from "./api";

type Manifest = ApiResponse<typeof api, "exportBackupManifest">;

export type ContentFingerprint = {
  v: 1;
  counts: Manifest["counts"];
  projects: {
    name: string;
    outlineSha: string;
    scriptSha: string | null;
    versionShas: string[];
    // v5.87：储存箱状态规范串（在不在储存箱 / 分类 / 星级 / 存入
    // 时间）的哈希；旧包指纹没有此字段，比对时按未带处理不判错。
    archiveSha?: string;
  }[];
  presets: { name: string; sha: string }[];
  geneCards: { modeId: number; version: number; sha: string }[];
  imageShas: string[];
};

const enc = new TextEncoder();
const textSha = (s: string): Promise<string> => sha256Hex(enc.encode(s));

export async function computeFingerprintFromManifest(
  m: Manifest,
): Promise<ContentFingerprint> {
  const projects: ContentFingerprint["projects"] = [];
  for (const p of m.projects) {
    const versionShas: string[] = [];
    const versions = [...p.versions].sort((a, b) => a.versionNo - b.versionNo);
    for (const v of versions) versionShas.push(await textSha(v.scriptJson));
    projects.push({
      name: p.name,
      outlineSha: await textSha(p.outline),
      scriptSha: p.scriptJson == null ? null : await textSha(p.scriptJson),
      versionShas,
      archiveSha: await textSha(
        JSON.stringify([
          p.archived ? 1 : 0,
          p.archiveCategory ?? "",
          p.stars ?? 0,
          p.archivedAt ?? null,
        ]),
      ),
    });
  }
  const presets: ContentFingerprint["presets"] = [];
  for (const p of m.presets) {
    const canonical = JSON.stringify([
      p.name,
      p.locked ? 1 : 0,
      p.personZh, p.personEn,
      p.hairZh, p.hairEn,
      p.hatZh, p.hatEn,
      p.faceZh, p.faceEn,
      p.neckZh, p.neckEn,
      p.topZh, p.topEn,
      p.armsZh, p.armsEn,
      p.bottomZh, p.bottomEn,
      p.shoesZh, p.shoesEn,
      p.extraZh, p.extraEn,
      p.cardRole,
      p.cardNote,
      p.personality,
      p.category,
      p.fromCard ? 1 : 0,
    ]);
    presets.push({ name: p.name, sha: await textSha(canonical) });
  }
  const geneCards: ContentFingerprint["geneCards"] = [];
  for (const mode of m.modes) {
    for (const c of mode.cards) {
      const canonical = JSON.stringify([
        c.themeStyle, c.rhythmStyle, c.dialogueStyle, c.pixelStyle,
        c.hookStyle, c.emotionCurve, c.narrativeStructure,
        c.interactionDesign, c.viralSummary, c.weightsJson,
        c.adjustmentLog, c.framesJson, c.transcriptText, c.rhythmPoints,
        c.addedTags, c.correctedTags, c.stability, c.sourceVideo,
        c.confirmed,
      ]);
      geneCards.push({
        modeId: mode.id,
        version: c.version,
        sha: await textSha(canonical),
      });
    }
  }
  const imageSet = new Set<string>();
  const noteRef = (ref: { etag: string } | null) => {
    if (ref && ref.etag) imageSet.add(ref.etag);
  };
  for (const p of m.presets) for (const im of p.images) noteRef(im.image);
  for (const pr of m.projects) {
    for (const c of pr.characters) noteRef(c.image);
  }
  for (const r of m.imageGenRecords) noteRef(r.stagedImage);
  return {
    v: 1,
    counts: m.counts,
    projects,
    presets,
    geneCards,
    imageShas: [...imageSet].sort(),
  };
}

export type FingerprintRow = { label: string; ok: boolean; detail: string };
export type FingerprintReport = {
  allOk: boolean;
  rows: FingerprintRow[];
  summary: string;
};

const COUNT_LABELS: [keyof Manifest["counts"], string][] = [
  ["projects", "项目"],
  ["archivedProjects", "储存箱项目"],
  ["presets", "储存库卡"],
  ["presetImages", "储存库图片"],
  ["characterImages", "项目人物图"],
  ["totalUniqueImages", "去重后图片"],
  ["snapshots", "版本快照"],
  ["styleCards", "风格卡"],
  ["trainingRecords", "训练记录"],
  ["imageGenRecords", "生图记录"],
  ["stagedImages", "生图暂存图"],
  ["modesWithCards", "带基因卡的模式"],
];

/** 子集口径逐项比对：包内（expected）每一项都必须在新台（actual）
 * 找到内容完全一致的对应项；新台多出的（导入前已有的数据）不算未
 * 对上、只在明细注明。 */
export function compareFingerprints(
  expected: ContentFingerprint,
  actual: ContentFingerprint,
): FingerprintReport {
  const rows: FingerprintRow[] = [];

  const shortCounts: string[] = [];
  for (const [key, label] of COUNT_LABELS) {
    if (actual.counts[key] < expected.counts[key])
      shortCounts.push(`${label} 包内 ${expected.counts[key]}、新台只有 ${actual.counts[key]}`);
  }
  rows.push({
    label: "数量清单",
    ok: shortCounts.length === 0,
    detail:
      shortCounts.length === 0
        ? "每一项数量都不低于包内清单"
        : `数量对不上：${shortCounts.join("；")}`,
  });

  // 项目：按（名 + 大纲哈希 + 剧本哈希 + 快照哈希列）多重集匹配。
  const actualProjects = [...actual.projects];
  const missingProjects: string[] = [];
  for (const ep of expected.projects) {
    const idx = actualProjects.findIndex(
      (ap) =>
        ap.name === ep.name &&
        ap.outlineSha === ep.outlineSha &&
        ap.scriptSha === ep.scriptSha &&
        ap.versionShas.length === ep.versionShas.length &&
        ap.versionShas.every((s, i) => s === ep.versionShas[i]) &&
        // v5.87：包内指纹带了储存箱状态哈希时，状态也要对上才算
        // 同一个项目对上（旧包没带此字段则不查这一项）。
        (ep.archiveSha == null || ap.archiveSha === ep.archiveSha),
    );
    if (idx < 0) missingProjects.push(ep.name || "未命名项目");
    else actualProjects.splice(idx, 1);
  }
  rows.push({
    label: "项目内容（大纲 + 剧本 + 快照逐份哈希）",
    ok: missingProjects.length === 0,
    detail:
      missingProjects.length === 0
        ? `${expected.projects.length} 个项目的大纲、剧本与全部版本快照内容逐字一致`
        : `内容对不上的项目：${missingProjects.join("、")}`,
  });

  const actualPresets = [...actual.presets];
  const missingPresets: string[] = [];
  for (const ep of expected.presets) {
    const idx = actualPresets.findIndex(
      (ap) => ap.name === ep.name && ap.sha === ep.sha,
    );
    if (idx < 0) missingPresets.push(ep.name || "未命名卡");
    else actualPresets.splice(idx, 1);
  }
  rows.push({
    label: "储存库卡内容（全部填写字段哈希）",
    ok: missingPresets.length === 0,
    detail:
      missingPresets.length === 0
        ? `${expected.presets.length} 张卡的全部填写字段逐字一致`
        : `内容对不上的卡：${missingPresets.join("、")}`,
  });

  const actualCards = [...actual.geneCards];
  const missingCards: string[] = [];
  for (const ec of expected.geneCards) {
    const idx = actualCards.findIndex(
      (ac) =>
        ac.modeId === ec.modeId &&
        ac.version === ec.version &&
        ac.sha === ec.sha,
    );
    if (idx < 0) missingCards.push(`模式${ec.modeId} v${ec.version} 基因卡`);
    else actualCards.splice(idx, 1);
  }
  rows.push({
    label: "爆款基因卡内容（八维 + 摘要 + 权重哈希）",
    ok: missingCards.length === 0,
    detail:
      missingCards.length === 0
        ? `${expected.geneCards.length} 张基因卡全文与权重逐字一致`
        : `内容对不上的基因卡：${missingCards.join("、")}`,
  });

  const actualImages = new Set(actual.imageShas);
  const missingImages = expected.imageShas.filter((s) => !actualImages.has(s));
  rows.push({
    label: "图片字节（逐张 SHA-256）",
    ok: missingImages.length === 0,
    detail:
      missingImages.length === 0
        ? `${expected.imageShas.length} 张图片的字节哈希全部在新台对上`
        : `${missingImages.length} 张图片的字节哈希在新台找不到（缺图或字节不一致）`,
  });

  const failed = rows.filter((r) => !r.ok);
  return {
    allOk: failed.length === 0,
    rows,
    summary:
      failed.length === 0
        ? "内容指纹全部一致（数量 / 项目 / 卡 / 基因卡 / 图片字节逐项哈希对上）"
        : `内容指纹 ${failed.length} 项未对上：${failed.map((r) => r.label).join("、")}`,
  };
}

/** 下载前自检：包结构必须齐全才允许把文件交给用户——执行单在第一
 * 项、规格与指纹在位、数据段数量与清单一致、图片段与应打包张数对
 * 上（完整包）或与缺图数对得上（不完整包）。任一项不过就抛错拦下
 * 下载，不让用户拿到一个自称完整实则残缺的包。 */
export function assertPackageSelfCheck(pkg: {
  counts: Manifest["counts"];
  replicationSpec?: unknown;
  contentFingerprint?: ContentFingerprint;
  projects: unknown[];
  presets: unknown[];
  modes: { cards: unknown[]; records: unknown[] }[];
  imageGenRecords?: unknown[];
  images: unknown[];
  incomplete?: { missingImages: unknown[] } | null;
  jobsTotal: number;
}): void {
  const firstKey = Object.keys(pkg)[0];
  if (firstKey !== "RESTORE_一键复刻执行单")
    throw new Error("打包自检没过：文件第一项不是一键复刻执行单，已拦下下载，请重试打包");
  if (!pkg.replicationSpec)
    throw new Error("打包自检没过：包内缺复刻规格（replicationSpec），已拦下下载，请重试打包");
  if (!pkg.contentFingerprint)
    throw new Error("打包自检没过：包内缺内容指纹，已拦下下载，请重试打包");
  const fp = pkg.contentFingerprint;
  if (
    fp.projects.length !== pkg.counts.projects ||
    pkg.projects.length !== pkg.counts.projects
  )
    throw new Error("打包自检没过：项目数与清单对不上，已拦下下载，请重试打包");
  if (
    fp.presets.length !== pkg.counts.presets ||
    pkg.presets.length !== pkg.counts.presets
  )
    throw new Error("打包自检没过：储存库卡数与清单对不上，已拦下下载，请重试打包");
  const cardTotal = pkg.modes.reduce((n, m) => n + m.cards.length, 0);
  const recordTotal = pkg.modes.reduce((n, m) => n + m.records.length, 0);
  if (
    cardTotal !== pkg.counts.styleCards ||
    recordTotal !== pkg.counts.trainingRecords
  )
    throw new Error("打包自检没过：基因卡 / 训练记录数与清单对不上，已拦下下载，请重试打包");
  if ((pkg.imageGenRecords?.length ?? 0) !== pkg.counts.imageGenRecords)
    throw new Error("打包自检没过：生图记录数与清单对不上，已拦下下载，请重试打包");
  const missing = pkg.incomplete?.missingImages.length ?? 0;
  if (pkg.images.length + missing !== pkg.jobsTotal)
    throw new Error(
      `打包自检没过：图片段 ${pkg.images.length} 张 + 缺图 ${missing} 张 ≠ 应打包 ${pkg.jobsTotal} 张，已拦下下载，请重试打包`,
    );
}
