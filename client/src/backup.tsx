// v5.87 打包只下数据包：点一次只下载一个 JSON 数据包，不再另外
// 生成独立复刻页（工作台程序本身已经在 GitHub 上，不用打进备份）；
// 项目连储存箱里的剧本一起打包——每个项目带储存箱状态（在不在储
// 存箱、分类、星级、存入时间）与储存箱分类名单，导入后原样回到储
// 存箱；训练进度（训练记录、模式与基因卡）、储存库卡与图片、生图
// 记录与暂存图、本机设置与未保存草稿照旧打包；监控账号与监控视
// 频、封面生成记录、工作台程序与任何 Key 都不打包。导入恢复继续
// 在工作台里用这个数据包完成。
// v3.78 一次点击两个文件：JSON 复刻包 + 独立复刻页（replicaview.ts
// 生成的单文件 HTML，同布局/同窗口顺序/单套深色主题/全量数据与图片字
// 节内嵌，双击离线可开），并在下载前对成品 JSON 文本做回读自验
// （重新解析 + 逐张复核图片字节数与 SHA-256）。v3.78 把复刻页从
// 只读浏览升级为可编辑的离线功能复刻：页内可改基础设置/人物/大
// 纲/剧本逐节拍/储存库卡/基因卡并自动存本机，时长同公式重算、分
// 镜可按时长打包或按剧本段重切（超 30 秒只警告），剧本格式01 /
// SRT / 逐镜头提示词包可导出，改后数据可导回成包格式兼容的 JSON
// 拿回本台导入；打包完成后还可直接在应用内预览复刻页（沙箱
// iframe 渲染同一份 HTML），不用等下载落盘才能看它长什么样。不
// 在复刻页内的只剩 AI 生成与 Geeknow 生图两类服务端/凭证功能，
// 完整工作台仍按包内执行单在新账号重建 + 导入，边界照实写明。
// v3.76 一键 1:1 复刻包：页底更新日志旁的「打包备份」与「导入备份」。
// 一个文件装齐复刻所需的全部内容，不再需要单独的规格文件：
//   ⓪ 一键复刻执行单（文件第一项 RESTORE_一键复刻执行单）：给新账号
//      Muse 的编号步骤（验包 → 照规格重建 → 一次导入 → 指纹验收 →
//      重连 Geeknow → 收尾报告）。v3.76 起执行单写明零口头指令口径：
//      用户在新账号只需把这一个文件发过去、可以不附任何文字，文件
//      本身就是指令，那边的 Muse 见文件即按单执行，不等用户再
//      打字说明（v3.75 还需要用户说一句「照包里的执行单做」）；
//   ① 布局 + 功能规格：replication.ts 的 REPLICATION_SPEC（双台结构、
//      窗口顺序、主题色值、纸面规格、全部功能规则、表结构）随包
//      写入 replicationSpec 字段，另有人可读的 REPLICATION_一键复刻
//      说明（含验收清单，数量按本次导出填好）；
//   ② 数据：服务端 exportBackupManifest 出全库清单（项目 / 储存库卡 /
//      模式基因卡 / 分类 / 版本快照 / 生图记录与暂存图，每张图带取图
//      地址 + 字节数 + etag；etag 即字节 SHA-256），本页逐张取回真实
//      字节、校验字节数与实算 SHA-256 后把字节本身（Base64）写进
//      包——清单本身不含字节，包里绝不只写图片地址引用；
//   ③ 本机状态：localSettings（界面设置白名单）+ localDrafts（未保
//      存的剧本草稿与生图面板草稿），导入时自动恢复、剧本草稿按新
//      项目 id 重新挂接。
//   ④ 内容指纹（v3.76，fingerprint.ts）：导出时从全库清单算出逐项
//      内容哈希（项目大纲/剧本/快照、储存库卡全字段、基因卡全文与
//      权重、全部图片字节 SHA-256）写进包内 contentFingerprint；导
//      入结束后新台回读自身清单同口径再算一份逐项比对，结果进核对
//      清单——内容级 1:1 由哈希对上证明，不再只对数量。打包下载前
//      还有结构自检：执行单不在第一项 / 缺规格 / 缺指纹 / 各段数量
//      与清单对不上，任一项不过就拦下下载、不让残缺包流出。
// 包里不含任何凭证 / Key（Geeknow 在新账号重连一次）。
//
// 导出失败隔离（v3.75）：每张图自动重试 3 次；仍失败的只记进失败
// 清单（卡名 / 图名 / 原因），已取回的图保留在本次打包会话里，可
// 以只补失败图续跑；只有用户明确勾选确认，才生成带 incomplete
// 缺图清单的不完整包，导入时会先把缺图清单亮出来。
//
// 导入：选复刻包（兼容 v3.70–v3.74 的旧包，缺的段按空处理）→ 先判
// 空（非空库先提示「新增不覆盖」并确认）→ 图片走分片通道 → 按储存
// 库卡 → 项目 → 模式 → 生图记录顺序逐项导入（暂存图拼回恢复），
// 每项独立成败、失败可单独重试、已导入的不回滚 → 恢复本机设置与
// 草稿 → 核对清单逐项对上。

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { bytesToBase64 } from "./sdk-local";
import { api, type ApiResponse } from "./api";
import { downloadText } from "./scriptlib";
import { sha256Hex } from "./sha256";
import {
uploadImageFileInChunks,
type ChunkedImageRef,
} from "./chunkedupload";
import {
REPLICATION_SPEC,
REPLICATION_PACKAGE_VERSION,
buildAcceptanceChecklist,
buildExecutionSheet,
buildReplicationText,
collectLocalSettings,
applyLocalSettings,
collectLocalDrafts,
applyLocalDrafts,
type ReplicationSpec,
} from "./replication";
import {
computeFingerprintFromManifest,
compareFingerprints,
assertPackageSelfCheck,
type ContentFingerprint,
type FingerprintReport,
} from "./fingerprint";

type Manifest = ApiResponse<typeof api, "exportBackupManifest">;
type ManifestPreset = Manifest["presets"][number];
type ManifestProject = Manifest["projects"][number];
type ManifestMode = Manifest["modes"][number];

type PkgImage = {
  id: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  dataBase64: string;
};

type PkgPreset = Omit<ManifestPreset, "images"> & {
  images: {
    oldId: number;
    fileName: string;
    mimeType: string;
    sortOrder: number;
    imageId: string;
  }[];
};
type PkgProject = Omit<ManifestProject, "characters"> & {
  characters: (Omit<ManifestProject["characters"][number], "image"> & {
    imageId: string | null;
  })[];
  // v4.03：场景设置已删除——包内项目不再带 sceneMode / sceneText /
  // sceneImages；旧包读入时在 onPickFile 里整段剥除（见 normalize）。
};
// 包内生图记录：清单里的暂存图取图引用（stagedImage）换成包内图片
// id（stagedImageId）；暂存图没能取回字节时为 null，记录导入后按
// 已失效处理。旧包（v3.74 及更早）没有 stagedImageId 字段，导入时
// 按 undefined 处理（等同 null）。
type PkgGenRecord = Omit<Manifest["imageGenRecords"][number], "stagedImage"> & {
  stagedImageId?: string | null;
};
type BackupPackage = {
  format: string;
  packageVersion: number;
  // v3.74 复刻包新增段；旧包（v3.70–v3.73）没有这些字段，导入时
  // 全部可选、缺失按空处理。
  replicationVersion?: number;
  replicationSpec?: ReplicationSpec;
  acceptanceChecklist?: string[];
  // v3.76 新增段：内容指纹（逐项内容哈希）。旧包没有此字段，导入时
  // 不做指纹核对、核对清单也不列这一行（不拿不存在的项判未对上）。
  contentFingerprint?: ContentFingerprint;
  localSettings?: Record<string, string>;
  // v3.75 新增段：未保存草稿（导入按新项目 id 重新挂接）与不完整
  // 包的缺图清单（完整包为 null / 缺失）。
  localDrafts?: Record<string, string>;
  incomplete?: { missingImages: { label: string; reason: string }[] } | null;
  baseline: string;
  exportedAt: string;
  counts: Manifest["counts"];
  categories: Manifest["categories"];
  // v5.87：储存箱分类名单（旧包没有此字段，导入时按空处理）。
  archiveCategories?: string[];
  presets: PkgPreset[];
  projects: PkgProject[];
  modes: ManifestMode[];
  imageGenRecords?: PkgGenRecord[];
  images: PkgImage[];
};

type FailKind =
  | "preset"
  | "presetImage"
  | "project"
  | "characterImage"
  | "mode"
  | "genRecords";
type FailItem = {
  id: string;
  kind: FailKind;
  label: string;
  detail: string;
  presetOldId?: number;
  imageIndex?: number;
  projectOldId?: number;
  characterOldId?: number;
  modeId?: number;
  retrying?: boolean;
  resolved?: boolean;
};

function errText(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// sha256Hex 在 ./sha256：优先 crypto.subtle，subtle 在非安全上下文
// 里不存在（undefined）时回落纯 JS 实现——v3.72 及之前直接调
// crypto.subtle.digest 会抛 “Cannot read properties of undefined
// (reading 'digest')”，打包在第一张图校验时整包中止。

function fmtBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

function buildReadme(
  counts: Manifest["counts"],
  exportedAt: string,
  baseline: string,
): string {
  // 与服务端清单自带的 README 同一份口径（v3.76 一键复刻包）；
  // 服务端清单带了 readme 时优先用服务端那份，这里只作兜底。
  return [
    "剧本创作工作台 · 一键 1:1 复刻包（打开包先看这一段：这一个文件就是完整复刻包，不用再找第二个文件）",
    "",
    `导出时间：${exportedAt}`,
    `工作台基线版本：${baseline}`,
    `包内数量清单：项目 ${counts.projects} 个（其中 ${counts.archivedProjects ?? 0} 个在储存箱里，储存箱状态随项目一起打包、导入后原样回到储存箱）；储存库人物卡 ${counts.presets} 张；储存库图片 ${counts.presetImages} 张；项目人物图 ${counts.characterImages} 张；图片按内容（字节 SHA-256）去重后共 ${counts.totalUniqueImages} 张（同一张图多处引用、或在存储里存了多份相同字节，只存一份）；版本快照 ${counts.snapshots} 份；带爆款基因卡的模式 ${counts.modesWithCards} 个（模式1在内），风格卡共 ${counts.styleCards} 张、训练记录共 ${counts.trainingRecords} 条；生图记录 ${counts.imageGenRecords} 条，其中 ${counts.stagedImages ?? 0} 条的暂存图本体也随包迁移。不打包：监控账号与监控视频、封面生成记录、工作台程序本身（已在 GitHub 上）、任何 Key 与凭证。`,
    "这个包装了 1:1 复刻需要的全部内容：⓪一键复刻执行单——文件第一项「RESTORE_一键复刻执行单」是给新账号 Muse 的编号步骤（先验包 → 照规格重建 → 一次导入 → 指纹验收 → 重连 Geeknow → 收尾报告），用户在新账号只需把这一个文件发过去、可以不附任何文字，文件本身就是指令，不用再转述任何步骤；①布局排版 + 功能——包内 replicationSpec 字段是机器可读的完整规格（双台结构与窗口顺序、主题全部色值（单套深空未来）、审查页纸面规格、字号阶梯、全部功能规则、数据库表结构），另有人可读的 REPLICATION_一键复刻说明；②内容数据——项目 / 储存库卡 / 模式基因卡 / 训练记录 / 生图记录与暂存图本体都在包内数据段，图片是真实字节（逐张写清字节数与 SHA-256、导入时逐张复验，不是图片地址引用）；③本机状态——包内 localSettings 字段带了储存库查看档位与鼠标放大、指引档案与已看状态，localDrafts 字段带了未保存的剧本草稿（导入时按新项目 id 重新挂接）与生图面板草稿，在新工作台里导入本包时自动恢复；④内容指纹（v3.76）——包内 contentFingerprint 字段带了逐项内容哈希（项目大纲/剧本/快照、储存库卡全部字段、基因卡全文与权重、全部图片字节 SHA-256），导入结束后新台会自动回读自身数据同口径再算一份逐项比对并给出明细，内容级 1:1 由哈希对上证明、不再只对数量。打包下载前还有结构自检与成品回读自验（把即将下载的文本重新解析、逐张复核图片字节数与 SHA-256），缺项或对不上会拦下下载。v5.87 起打包只下载这一个数据包文件，不再另外生成独立复刻页——工作台程序本身已经在 GitHub 上，备份只装用户数据；恢复时在工作台里点「导入备份」上传本包即可。项目含储存箱里的项目（储存箱状态随项目打包、导入后原样回到储存箱）；监控账号与监控视频、封面生成记录不打包。包里不含任何账号凭证与 Geeknow 的 Key。",
    "图片校验字段说明（etag 与 SHA-256 的关系，必须分清）：清单（导出清单与包内图片的引用信息）里每张图带的 etag，就是该图字节的 SHA-256 校验值——etag 即 SHA-256，是同一个值，不是两种算法。但清单本身只有 etag、字节数与取图地址，不含图片字节；清单里的 etag 只能用来核对字节对不对，不能证明下载包里含字节。图片字节只在下载的复刻文件里：打包时逐张从服务端取回真实字节，先核对字节数、再实算 SHA-256 与 etag 比对，通过后才把字节本身写进包，包内每张图另存它自己的 sha256 字段；导入时再逐张按字节数与 sha256 复验。所以「包里含字节」的依据是下载文件里的图片数据段本身，不是一份只有 etag 的清单。",
    "打包失败口径（v3.75）：逐张取图时每张自动重试 3 次；重试后仍失败的图只记进失败清单（写清卡名 / 图名与原因），已经取回的图片保留，可以只补失败的那几张续跑，不用从头重取。只有用户在打包窗口里明确勾选确认后，才会生成「不完整包」：包内 incomplete 字段逐条写明缺了哪几张图，导入时也会先把缺图清单亮出来；不勾选就不会生成残缺包。",
    "",
    "未收录项（只有一项）：",
    "Geeknow 连接与凭证不进包：凭证永不进任何备份文件（安全底线）；新账号在新工作台里重新走安全连接接一次 Geeknow 才能生图，Key 不要贴在聊天里。生图记录与暂存图、未保存的本机草稿都已随包（见上），不再是未收录项。",
    "",
    "新账号 1:1 复刻只用这一个文件：把本文件发给新账号的 Muse 即可（可以不附任何文字，文件本身就是指令），那边的 Muse 会按文件第一项的执行单，先验包、再照 replicationSpec 重建同款工作台、再用同一个包导入全部数据、最后按 acceptanceChecklist 与 contentFingerprint 逐项核对并报告（导入结束工作台自身也会自动跑一遍指纹核对）；用户需要出面的只有在新工作台里重新连接一次 Geeknow。全部对上才算复刻完成，核对通过前不要退旧账号、不要删旧工作台、本地这份文件多处保存。",
    "（如果新账号已经有同款工作台，也可以直接在工作台里点「导入备份」上传本文件：只恢复数据、生图记录与暂存图、本机界面设置与草稿，不重建应用。）",
  ].join("\n");
}

export function BackupControls() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"export" | "import">("export");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [exportDone, setExportDone] = useState<{
    counts: Manifest["counts"];
    fileSize: number;
    exportedAt: string;
    incompleteCount: number;
    // v3.77：下载前回读自验通过的图片张数。
    verifiedImages: number;
  } | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  // 导出失败隔离：本次打包会话里已取回的图片保留（关窗不丢、只补
  // 失败图续跑），失败清单逐条带卡名 / 图名与原因。
  type ImgJob = {
    key: string;
    blobKey: string;
    url: string;
    mimeType: string;
    sizeBytes: number;
    etag: string;
    missing: boolean;
    label: string;
  };
  type ExportSession = {
    manifest: Manifest;
    jobs: ImgJob[];
    done: Map<string, Omit<PkgImage, "id">>;
  };
  type ExportFail = { key: string; label: string; reason: string };
  const exportSessionRef = useRef<ExportSession | null>(null);
  const [exportFails, setExportFails] = useState<ExportFail[]>([]);
  const [exportKept, setExportKept] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [confirmIncomplete, setConfirmIncomplete] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const pkgRef = useRef<BackupPackage | null>(null);
  const [pkgInfo, setPkgInfo] = useState<{
    counts: Manifest["counts"];
    exportedAt: string;
    baseline: string;
    // 是否是 v3.74 复刻包（带规格）；旧包为 false，导入时缺段按空。
    hasReplication: boolean;
    // v3.75：是否带一键复刻执行单；不完整包缺的图数与清单。
    hasExecutionSheet: boolean;
    incompleteMissing: { label: string; reason: string }[];
    // v3.76：是否带内容指纹（导入后自动逐项哈希核对）。
    hasFingerprint: boolean;
    // v5.87：包里在储存箱里的项目数（旧包按项目行现算，可能为 0）。
    archivedProjects: number;
  } | null>(null);
  // 本次导入恢复的本机界面设置项数（0 = 包里没带或没恢复成）。
  const [settingsApplied, setSettingsApplied] = useState(0);
  // 本次导入恢复的本机草稿：applied 恢复项数、skipped 因对应项目
  // 没导入成功而跳过的剧本草稿数；null = 还没导入完。
  const [draftsApplied, setDraftsApplied] = useState<{
    applied: number;
    skipped: number;
  } | null>(null);
  // v3.76 内容指纹自动核对结果（导入结束后回读本台清单同口径再算
  // 一份与包内指纹逐项比对）；null = 本次导入还没核对完或包里没带
  // 指纹（旧包）。error 非空 = 自动核对本身没跑完（回读失败），按
  // 未对上处理并写明原因，不假装通过。
  const [fingerprintReport, setFingerprintReport] = useState<
    (FingerprintReport & { error?: string }) | null
  >(null);
  const [pkgError, setPkgError] = useState<string | null>(null);
  const [target, setTarget] = useState<{
    projectCount: number;
    presetCount: number;
    presetImageCount: number;
    modesWithCards: number;
  } | null>(null);
  const [confirmedNonEmpty, setConfirmedNonEmpty] = useState(false);
  const [importPhase, setImportPhase] = useState("");
  const [importDone, setImportDone] = useState(false);
  const [tally, setTally] = useState({
    projectsOk: 0,
    // v5.87：包里在储存箱里的项目数与已按储存箱状态恢复的个数。
    archivedExpected: 0,
    archivedOk: 0,
    presetsOk: 0,
    presetImagesOk: 0,
    versionsOk: 0,
    versionsExpected: 0,
    mode1CardsOk: 0,
    mode1Expected: 0,
    mode1CurrentSet: false,
    styleCardsOk: 0,
    styleCardsExpected: 0,
    trainingRecordsOk: 0,
    trainingRecordsExpected: 0,
    genRecordsOk: 0,
    genRecordsExpected: 0,
    genStagedOk: 0,
    genStagedExpected: 0,
  });
  const [fails, setFails] = useState<FailItem[]>([]);
  const presetMapRef = useRef<Map<number, number>>(new Map());
  const projectMapRef = useRef<Map<number, number>>(new Map());
  const characterMapRef = useRef<Map<string, number>>(new Map());
  // 每个模式最近一次导入的风格卡 / 训练记录成功数：核对清单按模式
  // 汇总，单独重试某个模式时覆盖它自己那份，不重复累计。
  const modeResultsRef = useRef<Map<number, { cardsOk: number; recordsOk: number }>>(new Map());
  const failSeq = useRef(0);

  const addFail = (f: Omit<FailItem, "id">) => {
    failSeq.current += 1;
    const id = `fail-${failSeq.current}`;
    setFails((prev) => [...prev, { ...f, id }]);
  };

  // ---------------------------------------------------------------- export
  // 取回一张图的真实字节：核对字节数、实算 SHA-256 与 etag 比对。
  // 网络类失败每张自动重试 3 次；缺失图与校验对不上不靠重试解决，
  // 但也只抛给失败清单，不中止整包（失败隔离在 runExportJobs 里）。
  const fetchOneImage = async (job: ImgJob): Promise<Omit<PkgImage, "id">> => {
    if (job.missing || !job.url) {
      throw new Error("这张图在存储里已经找不到了（引用还在、图已不在）");
    }
    let lastErr: unknown = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const resp = await fetch(job.url);
        if (!resp.ok) throw new Error(`服务端返回 ${resp.status}`);
        const buf = await resp.arrayBuffer();
        if (job.sizeBytes > 0 && buf.byteLength !== job.sizeBytes) {
          throw new Error(
            `字节数对不上（应为 ${job.sizeBytes}，实际 ${buf.byteLength}）`,
          );
        }
        const sha = await sha256Hex(buf);
        if (job.etag && sha !== job.etag) {
          throw new Error(
            "取回字节实算的 SHA-256 与清单 etag（etag 即 SHA-256）不一致，字节可能不完整",
          );
        }
        return {
          mimeType: job.mimeType,
          sizeBytes: buf.byteLength,
          sha256: sha,
          dataBase64: bytesToBase64(new Uint8Array(buf)),
        };
      } catch (e) {
        lastErr = e;
        if (attempt < 3)
          await new Promise((r) => setTimeout(r, 600 * attempt));
      }
    }
    throw lastErr instanceof Error
      ? lastErr
      : new Error("图片字节取不回来（网络错误）");
  };

  // 组装并下载复刻包。incomplete 为 null = 完整包；非 null = 用户已
  // 明确确认的不完整包，缺图清单写进包内 incomplete 字段并在执行单
  // 与 README 顶部加警告横幅，导入时也会先亮出来。
  const finalizeExport = async (
    session: ExportSession,
    incomplete: { missingImages: { label: string; reason: string }[] } | null,
  ) => {
    const m = session.manifest;
    try {
      setProgress("正在组装备份文件…");
      // 图片 id 按任务顺序在组装时统一编号，续跑 / 重试不影响编号。
      const images: PkgImage[] = [];
      const keyToId = new Map<string, string>();
      for (const job of session.jobs) {
        const got = session.done.get(job.key);
        if (!got) continue;
        const id = `img-${images.length + 1}`;
        keyToId.set(job.key, id);
        images.push({ ...got, id });
      }
      const idOf = (
        ref: { blobKey: string; etag: string } | null,
      ): string | null =>
        ref ? (keyToId.get(ref.etag || ref.blobKey) ?? null) : null;
      const localSettings = collectLocalSettings();
      const localDrafts = collectLocalDrafts();
      let readme =
        m.readme || buildReadme(m.counts, m.exportedAt, m.baseline);
      let sheet =
        m.executionSheet ||
        buildExecutionSheet(m.counts, m.exportedAt, m.baseline);
      if (incomplete) {
        const banner = `【不完整包警告】这个包缺 ${incomplete.missingImages.length} 张图：${incomplete.missingImages.map((x) => x.label).join("；")}。每张的原因逐条写在包内 incomplete 字段里，复刻出的工作台会缺这几张图；能补取时建议回旧工作台重新打包完整包。`;
        readme = `${banner}\n\n${readme}`;
        sheet = `${banner}\n\n${sheet}`;
      }
      // v3.76 内容指纹：从同一份全库清单算逐项内容哈希（项目大纲 /
      // 剧本 / 快照、储存库卡全字段、基因卡全文与权重、图片字节
      // SHA-256 集合），随包带走；导入后新台同口径再算一份逐项比
      // 对，内容级 1:1 由哈希证明。
      setProgress("正在计算内容指纹（逐项内容哈希）…");
      const contentFingerprint = await computeFingerprintFromManifest(m);
      const pkg: BackupPackage & {
        "RESTORE_一键复刻执行单": string;
        "README_使用流程": string;
        "REPLICATION_一键复刻说明": string;
      } = {
        // 文件第一项就是一键复刻执行单：给新账号 Muse 的编号步骤，
        // 用户只需把文件发过去（可以不附任何文字，文件本身就是指令）。
        "RESTORE_一键复刻执行单": sheet,
        // 第二项 README：优先用服务端清单自带的那份（清单本身也带
        // readme 字段，两处同一份文本），缺失时本地兜底。
        "README_使用流程": readme,
        // 第三项人可读的复刻说明：一个文件复刻的方法与验收清单
        // （数量按本次导出填好），不用解析嵌套字段就能照着做。
        "REPLICATION_一键复刻说明": buildReplicationText(
          m.counts,
          m.exportedAt,
          m.baseline,
        ),
        format: m.format,
        packageVersion: REPLICATION_PACKAGE_VERSION,
        replicationVersion: m.replicationVersion,
        // 机器可读的完整复刻规格：布局 / 主题 / 功能规则 / 表结构。
        replicationSpec: REPLICATION_SPEC,
        acceptanceChecklist: buildAcceptanceChecklist(m.counts),
        // v3.76 内容指纹：导入后自动逐项哈希核对的比对基准。
        contentFingerprint,
        localSettings,
        localDrafts,
        incomplete,
        baseline: m.baseline,
        exportedAt: m.exportedAt,
        counts: m.counts,
        categories: m.categories,
        // v5.87：储存箱分类名单随包，导入时补建缺失分类。
        archiveCategories: m.archiveCategories,
        presets: m.presets.map((p) => ({
          ...p,
          images: p.images.map((im) => ({
            oldId: im.oldId,
            fileName: im.fileName,
            mimeType: im.mimeType,
            sortOrder: im.sortOrder,
            imageId: idOf(im.image) ?? "",
          })),
        })),
        projects: m.projects.map((pr) => ({
          ...pr,
          characters: pr.characters.map((c) => ({
            ...c,
            image: undefined,
            imageId: idOf(c.image),
          })),
        })) as unknown as PkgProject[],
        modes: m.modes,
        // 生图记录：暂存图引用换成包内图片 id（没取回字节时为 null）。
        imageGenRecords: m.imageGenRecords.map((r) => {
          const { stagedImage, ...rest } = r;
          return { ...rest, stagedImageId: idOf(stagedImage) };
        }),
        images,
      };
      // characters 上多余的 image 字段清干净（只留 imageId）。
      for (const pr of pkg.projects as unknown as Record<string, unknown>[]) {
        for (const c of pr.characters as Record<string, unknown>[]) delete c.image;
      }
      // v3.76 下载前结构自检：执行单须在第一项、规格与指纹须在位、
      // 各数据段数量须与清单一致、图片段张数须与应打包张数对上
      // （不完整包按缺图数抵扣）。任一项不过就抛错拦下下载，三个
      // 调用方（打包 / 只补失败图 / 生成不完整包）都会把错误显示
      // 出来，不会静默流出残缺包。
      assertPackageSelfCheck({ ...pkg, jobsTotal: session.jobs.length });
      const text = JSON.stringify(pkg);
      const fileSize = new Blob([text]).size;
      const stamp = m.exportedAt.slice(0, 10).replace(/-/g, "");
      // v3.77 下载前回读自验：把即将下载的这串文本当成一个刚拿到的
      // 文件重新解析，逐张图解码字节复核字节数与 SHA-256，并核对
      // 指纹段与各段数量——验的就是用户真正会拿到的那份字节，不
      // 是内存里的组装对象；任一项对不上就抛错拦下下载。
      setProgress("正在回读自验下载文件（重新解析 + 逐张复核图片哈希）…");
      const reparsed = JSON.parse(text) as BackupPackage & {
        "RESTORE_一键复刻执行单"?: string;
      };
      if (Object.keys(reparsed)[0] !== "RESTORE_一键复刻执行单")
        throw new Error("回读自验没过：下载文件第一项不是一键复刻执行单，已拦下下载，请重试打包");
      if (!reparsed.contentFingerprint)
        throw new Error("回读自验没过：下载文件里读不到内容指纹，已拦下下载，请重试打包");
      if (
        reparsed.projects.length !== m.counts.projects ||
        reparsed.presets.length !== m.counts.presets ||
        (reparsed.imageGenRecords?.length ?? 0) !== m.counts.imageGenRecords
      )
        throw new Error("回读自验没过：下载文件的数据段数量与清单对不上，已拦下下载，请重试打包");
      let verifiedImages = 0;
      for (const im of reparsed.images) {
        const bytes = b64ToBytes(im.dataBase64);
        if (im.sizeBytes > 0 && bytes.length !== im.sizeBytes)
          throw new Error(`回读自验没过：图片 ${im.id} 字节数对不上，已拦下下载，请重试打包`);
        const sha = await sha256Hex(bytes);
        if (sha !== im.sha256)
          throw new Error(`回读自验没过：图片 ${im.id} 的 SHA-256 对不上，已拦下下载，请重试打包`);
        verifiedImages += 1;
      }
      // v5.87：只下载这一个数据包文件，不再另外生成独立复刻页。
      downloadText(
        `剧本工作台数据包_${stamp}.json`,
        text,
        "application/json;charset=utf-8",
      );
      setExportDone({
        counts: m.counts,
        fileSize,
        exportedAt: m.exportedAt,
        incompleteCount: incomplete?.missingImages.length ?? 0,
        verifiedImages,
      });
      setExportFails([]);
      setExportKept(null);
      setConfirmIncomplete(false);
      exportSessionRef.current = null;
      setProgress("");
    } finally {
      setBusy(false);
    }
  };

  // 跑一批取图任务（onlyKeys 为 null = 全部未完成的；否则只跑指定
  // 的失败图续跑）。全部取回就直接组装下载完整包；有失败就停在失
  // 败清单上，已取回的保留在会话里，不从头重来。
  const runExportJobs = async (
    session: ExportSession,
    onlyKeys: Set<string> | null,
  ) => {
    const pending = session.jobs.filter(
      (j) => !session.done.has(j.key) && (!onlyKeys || onlyKeys.has(j.key)),
    );
    const fails: ExportFail[] = [];
    for (const job of pending) {
      setProgress(
        `正在打包图片（已取回 ${session.done.size} / ${session.jobs.length}）：${job.label}`,
      );
      try {
        session.done.set(job.key, await fetchOneImage(job));
      } catch (e) {
        fails.push({
          key: job.key,
          label: job.label,
          reason: errText(e, "图片字节取不回来"),
        });
      }
    }
    if (fails.length === 0 && session.done.size === session.jobs.length) {
      await finalizeExport(session, null);
      return;
    }
    setExportFails(fails);
    setExportKept({ done: session.done.size, total: session.jobs.length });
    setConfirmIncomplete(false);
    setProgress("");
    setBusy(false);
  };

  const doExport = async () => {
    setBusy(true);
    setExportError(null);
    setExportDone(null);
    setExportFails([]);
    setExportKept(null);
    setConfirmIncomplete(false);
    exportSessionRef.current = null;
    try {
      setProgress("正在读取工作台全部数据（项目、储存库卡、模式）…");
      const m = await api.exportBackupManifest({});
      // 收集去重图片（同一内容多处引用只打包一份字节）。
      const jobs = new Map<string, ImgJob>();
      const note = (
        ref: { blobKey: string; url: string; mimeType: string; sizeBytes: number; etag: string; missing: boolean } | null,
        label: string,
      ) => {
        if (!ref) return;
        // 按内容去重：etag 即字节的 SHA-256，相同字节只打包一份，
        // 哪怕它在存储里有两个 blobKey。etag 缺失时才按 blobKey。
        const dk = ref.etag || ref.blobKey;
        if (!jobs.has(dk)) jobs.set(dk, { key: dk, ...ref, label });
      };
      for (const p of m.presets)
        p.images.forEach((im, i) =>
          note(im.image, `储存库卡「${p.name}」第 ${i + 1} 张图（${im.fileName || "未命名图"}）`),
        );
      for (const pr of m.projects) {
        for (const c of pr.characters)
          if (c.image) note(c.image, `项目「${pr.name}」人物「${c.name}」的资产图`);
      }
      // v3.75：生图记录的暂存图本体也进包（与上面同一条校验通道）。
      for (const r of m.imageGenRecords)
        if (r.stagedImage)
          note(
            r.stagedImage,
            `生图记录「${r.personName || "未命名人物"}」的暂存图`,
          );
      const session: ExportSession = {
        manifest: m,
        jobs: [...jobs.values()],
        done: new Map(),
      };
      exportSessionRef.current = session;
      await runExportJobs(session, null);
    } catch (e) {
      setExportError(errText(e, "打包失败，请重试"));
      setProgress("");
      setBusy(false);
    }
  };

  // 只补失败的那几张：已取回的图片在会话里保留，不从头重取。
  const retryExportFails = async () => {
    const session = exportSessionRef.current;
    if (!session || exportFails.length === 0) return;
    setBusy(true);
    setExportError(null);
    try {
      await runExportJobs(session, new Set(exportFails.map((f) => f.key)));
    } catch (e) {
      setExportError(errText(e, "重试失败图片时出错，请再试"));
      setProgress("");
      setBusy(false);
    }
  };

  // 用户明确确认后才生成不完整包：缺图逐条写进包内 incomplete。
  const exportIncompletePackage = async () => {
    const session = exportSessionRef.current;
    if (!session || exportFails.length === 0) return;
    setBusy(true);
    setExportError(null);
    try {
      await finalizeExport(session, {
        missingImages: exportFails.map((f) => ({
          label: f.label,
          reason: f.reason,
        })),
      });
    } catch (e) {
      setExportError(errText(e, "生成不完整包失败，请重试"));
      setProgress("");
      setBusy(false);
    }
  };

  // ---------------------------------------------------------------- import
  const onPickFile = async (file: File) => {
    setPkgError(null);
    setPkgInfo(null);
    setTarget(null);
    setImportDone(false);
    setFails([]);
    setConfirmedNonEmpty(false);
    setDraftsApplied(null);
    setFingerprintReport(null);
    pkgRef.current = null;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as BackupPackage & {
        "RESTORE_一键复刻执行单"?: string;
      };
      if (
        !parsed ||
        parsed.format !== "script-workbench-backup" ||
        typeof parsed.packageVersion !== "number" ||
        !Array.isArray(parsed.presets) ||
        !Array.isArray(parsed.projects) ||
        !Array.isArray(parsed.images)
      ) {
        throw new Error("这不是剧本工作台的备份 / 复刻文件（格式标记对不上），没有导入任何东西");
      }
      // v4.03：旧包剥除——场景设置已删除，旧包里的 sceneMode /
      // sceneText / sceneImages 在读入时整段剥掉不导入；包内指纹里
      // 属于场景图的哈希同步剔除，免得核对时把「按新规矩丢弃的
      // 场景图」误报成未对上。
      {
        const sceneSha = new Set<string>();
        for (const pr of parsed.projects as unknown as Record<string, unknown>[]) {
          const scenes = (pr.sceneImages ?? []) as { imageId?: string }[];
          for (const sc of scenes) {
            const img = sc.imageId
              ? parsed.images.find((x) => x.id === sc.imageId)
              : undefined;
            if (img?.sha256) sceneSha.add(img.sha256);
          }
          delete pr.sceneImages;
          delete pr.sceneMode;
          delete pr.sceneText;
        }
        if (parsed.contentFingerprint && sceneSha.size > 0) {
          parsed.contentFingerprint = {
            ...parsed.contentFingerprint,
            imageShas: parsed.contentFingerprint.imageShas.filter(
              (h) => !sceneSha.has(h),
            ),
          };
        }
        delete (parsed.counts as unknown as Record<string, unknown>).sceneImages;
      }
      pkgRef.current = parsed;
      setSettingsApplied(0);
      setPkgInfo({
        counts: parsed.counts,
        exportedAt: parsed.exportedAt,
        baseline: parsed.baseline,
        hasReplication: !!parsed.replicationSpec,
        hasExecutionSheet:
          typeof parsed["RESTORE_一键复刻执行单"] === "string" &&
          parsed["RESTORE_一键复刻执行单"].length > 0,
        incompleteMissing: parsed.incomplete?.missingImages ?? [],
        hasFingerprint: !!parsed.contentFingerprint,
        archivedProjects:
          parsed.counts.archivedProjects ??
          parsed.projects.filter((p) => !!p.archived).length,
      });
      const t = await api.getBackupTargetInfo({});
      setTarget(t);
    } catch (e) {
      setPkgError(
        e instanceof SyntaxError
          ? "备份文件读不出来（文件内容不是完整备份数据，可能下载不完整），没有导入任何东西"
          : errText(e, "备份文件读取失败，没有导入任何东西"),
      );
    }
  };

  const imageBytesOf = (imageId: string): { bytes: Uint8Array; mimeType: string } => {
    const pkg = pkgRef.current;
    const img = pkg?.images.find((x) => x.id === imageId);
    if (!img) throw new Error("备份包里找不到这张图的数据");
    return { bytes: b64ToBytes(img.dataBase64), mimeType: img.mimeType };
  };

  const uploadPkgImage = async (
    imageId: string,
    fileName: string,
  ): Promise<ChunkedImageRef> => {
    const pkg = pkgRef.current;
    const img = pkg?.images.find((x) => x.id === imageId);
    if (!img) throw new Error("备份包里找不到这张图的数据");
    const { bytes, mimeType } = imageBytesOf(imageId);
    // 导入前逐张复验包内写的字节数与 SHA-256：对不上就中止这一项
    // 并把文件名写进失败原因，不把坏字节存进工作台。
    if (img.sizeBytes > 0 && bytes.length !== img.sizeBytes) {
      throw new Error(
        `图片「${fileName || imageId}」校验失败：字节数对不上（包内记录 ${img.sizeBytes}，实际 ${bytes.length}），这张图没有导入`,
      );
    }
    const sha = await sha256Hex(bytes);
    if (img.sha256 && sha !== img.sha256) {
      throw new Error(
        `图片「${fileName || imageId}」校验失败：SHA-256 不一致，包内字节可能不完整，这张图没有导入`,
      );
    }
    const blob = new Blob([bytes as BlobPart], { type: mimeType });
    const file = new File([blob], fileName || "image", { type: mimeType });
    return uploadImageFileInChunks(file);
  };

  const importOnePreset = async (preset: PkgPreset, withCategories: boolean) => {
    const pkg = pkgRef.current!;
    const uploaded: { fileName: string; sortOrder: number; image: ChunkedImageRef }[] = [];
    for (let i = 0; i < preset.images.length; i++) {
      const im = preset.images[i]!;
      try {
        const ref = await uploadPkgImage(im.imageId, im.fileName);
        uploaded.push({ fileName: im.fileName, sortOrder: im.sortOrder, image: ref });
      } catch (e) {
        addFail({
          kind: "presetImage",
          label: `储存库卡「${preset.name}」第 ${i + 1} 张图`,
          detail: errText(e, "图片上传失败"),
          presetOldId: preset.oldId,
          imageIndex: i,
        });
      }
    }
    try {
      const res = await api.importBackupLibrary({
        categories: withCategories ? pkg.categories : [],
        presets: [
          {
            oldId: preset.oldId,
            name: preset.name,
            locked: preset.locked,
            personZh: preset.personZh,
            personEn: preset.personEn,
            hairZh: preset.hairZh,
            hairEn: preset.hairEn,
            hatZh: preset.hatZh,
            hatEn: preset.hatEn,
            faceZh: preset.faceZh,
            faceEn: preset.faceEn,
            neckZh: preset.neckZh,
            neckEn: preset.neckEn,
            topZh: preset.topZh,
            topEn: preset.topEn,
            armsZh: preset.armsZh,
            armsEn: preset.armsEn,
            bottomZh: preset.bottomZh,
            bottomEn: preset.bottomEn,
            shoesZh: preset.shoesZh,
            shoesEn: preset.shoesEn,
            extraZh: preset.extraZh,
            extraEn: preset.extraEn,
            cardRole: preset.cardRole,
            cardNote: preset.cardNote,
            personality: preset.personality ?? "",
            category: preset.category,
            fromCard: preset.fromCard,
            images: uploaded,
          },
        ],
      });
      const r = res.results[0];
      if (!r) throw new Error("服务端没有返回这张卡的导入结果");
      if (!r.ok || r.newId == null) {
        addFail({
          kind: "preset",
          label: `储存库卡「${preset.name}」`,
          detail: r.error ?? "导入失败",
          presetOldId: preset.oldId,
        });
        return;
      }
      presetMapRef.current.set(preset.oldId, r.newId);
      setTally((t) => ({
        ...t,
        presetsOk: t.presetsOk + 1,
        presetImagesOk: t.presetImagesOk + r.imagesOk,
      }));
      for (const msg of r.imageErrors) {
        const mm = msg.match(/第 (\d+) 张图/);
        const idx = mm ? Number(mm[1]) - 1 : -1;
        addFail({
          kind: "presetImage",
          label: `储存库卡「${preset.name}」${idx >= 0 ? `第 ${idx + 1} 张图` : "图片"}`,
          detail: msg,
          presetOldId: preset.oldId,
          imageIndex: idx >= 0 ? idx : undefined,
        });
      }
    } catch (e) {
      addFail({
        kind: "preset",
        label: `储存库卡「${preset.name}」`,
        detail: errText(e, "导入失败"),
        presetOldId: preset.oldId,
      });
    }
  };

  const importOneProject = async (project: PkgProject) => {
    const charRefs = new Map<number, ChunkedImageRef>();
    for (const c of project.characters) {
      if (!c.imageId) continue;
      try {
        charRefs.set(c.oldId, await uploadPkgImage(c.imageId, `${c.name}.img`));
      } catch (e) {
        addFail({
          kind: "characterImage",
          label: `项目「${project.name}」人物「${c.name}」的资产图`,
          detail: errText(e, "图片上传失败"),
          projectOldId: project.oldId,
          characterOldId: c.oldId,
        });
      }
    }
    try {
      const res = await api.importBackupProjects({
        presetIdMap: [...presetMapRef.current.entries()].map(([oldId, newId]) => ({
          oldId,
          newId,
        })),
        // v5.87：储存箱分类名单（旧包没有就传空数组，服务端跳过）。
        archiveCategories: pkgRef.current?.archiveCategories ?? [],
        projects: [
          {
            oldId: project.oldId,
            name: project.name,
            // v5.87 储存箱状态随包恢复（旧包四项为空，按普通项目）。
            archived: project.archived ?? undefined,
            archiveCategory: project.archiveCategory ?? undefined,
            stars: project.stars ?? undefined,
            archivedAt: project.archivedAt ?? undefined,
            outline: project.outline,
            speechRate: project.speechRate,
            stylePreset: project.stylePreset,
            styleCustom: project.styleCustom,
            targetSeconds: project.targetSeconds,
            selectedModeId: project.selectedModeId,
            prevOutline: project.prevOutline,
            // v4.04 重合率结果随包迁移（旧包没有这几项时传 undefined）。
            outlineOverlapRate: project.outlineOverlapRate ?? undefined,
            outlineOverlapFragmentsJson:
              project.outlineOverlapFragmentsJson ?? undefined,
            outlineOverlapOutline: project.outlineOverlapOutline ?? undefined,
            outlineOverlapModeId: project.outlineOverlapModeId ?? undefined,
            outlineOverlapModeName: project.outlineOverlapModeName ?? undefined,
            // v4.24 发布文案随包迁移（旧包没有此项时传 undefined）。
            publishCopyJson: project.publishCopyJson ?? undefined,
            // v4.79 项目来源标记随包迁移（旧包没有此项时传 undefined）。
            source: project.source ?? undefined,
            scriptJson: project.scriptJson,
            characters: project.characters.map((c) => ({
              oldId: c.oldId,
              name: c.name,
              role: c.role,
              note: c.note,
              sortOrder: c.sortOrder,
              sourcePresetOldId: c.sourcePresetOldId,
              sourcePresetName: c.sourcePresetName,
              imagePromptZh: c.imagePromptZh ?? "",
              imagePromptEn: c.imagePromptEn ?? "",
              image: charRefs.get(c.oldId) ?? null,
            })),
            versions: project.versions,
          },
        ],
      });
      const r = res.results[0];
      if (!r) throw new Error("服务端没有返回这个项目的导入结果");
      if (!r.ok || r.newId == null) {
        addFail({
          kind: "project",
          label: `项目「${project.name}」`,
          detail: r.error ?? "导入失败",
          projectOldId: project.oldId,
        });
        return;
      }
      projectMapRef.current.set(project.oldId, r.newId);
      for (const cm of r.characterIdMap)
        characterMapRef.current.set(`${project.oldId}:${cm.oldId}`, cm.newId);
      setTally((t) => ({
        ...t,
        projectsOk: t.projectsOk + 1,
        // v5.87：这个项目在包里是储存箱状态且导入成功，计入已恢复。
        archivedOk: t.archivedOk + (project.archived ? 1 : 0),
        versionsOk: t.versionsOk + r.versionsOk,
      }));
      for (const msg of r.characterImageErrors) {
        const mm = msg.match(/人物「(.+?)」/);
        const ch = mm
          ? project.characters.find((c) => c.name === mm[1])
          : undefined;
        addFail({
          kind: "characterImage",
          label: `项目「${project.name}」人物「${ch?.name ?? mm?.[1] ?? ""}」的资产图`,
          detail: msg,
          projectOldId: project.oldId,
          characterOldId: ch?.oldId,
        });
      }
    } catch (e) {
      addFail({
        kind: "project",
        label: `项目「${project.name}」`,
        detail: errText(e, "导入失败"),
        projectOldId: project.oldId,
      });
    }
  };

  const importModes = async (onlyModeId?: number) => {
    const pkg = pkgRef.current!;
    const modes = pkg.modes.filter(
      (m) => onlyModeId == null || m.id === onlyModeId,
    );
    if (modes.length === 0) return;
    try {
      const res = await api.importBackupModes({
        modes: modes.map((m) => ({
          id: m.id,
          styleTags: m.styleTags,
          progress: m.progress,
          stability: m.stability,
          statusOverride: m.statusOverride,
          coreLogic: m.coreLogic ?? "",
          lastTrainedAt: m.lastTrainedAt,
          currentCardOldId: m.currentCardOldId,
          cards: m.cards.map((c) => ({
            oldId: c.oldId,
            themeStyle: c.themeStyle,
            rhythmStyle: c.rhythmStyle,
            dialogueStyle: c.dialogueStyle,
            pixelStyle: c.pixelStyle,
            hookStyle: c.hookStyle,
            emotionCurve: c.emotionCurve,
            narrativeStructure: c.narrativeStructure,
            interactionDesign: c.interactionDesign,
            viralSummary: c.viralSummary,
            weightsJson: c.weightsJson,
            adjustmentLog: c.adjustmentLog,
            framesJson: c.framesJson,
            transcriptText: c.transcriptText,
            rhythmPoints: c.rhythmPoints,
            addedTags: c.addedTags,
            correctedTags: c.correctedTags,
            stability: c.stability,
            sourceVideo: c.sourceVideo,
            confirmed: c.confirmed,
            version: c.version,
            createdAt: c.createdAt,
          })),
          records: m.records.map((r) => ({
            kind: r.kind,
            videoName: r.videoName,
            videoType: r.videoType,
            videoSizeBytes: r.videoSizeBytes,
            videoDurationSec: r.videoDurationSec,
            hintsJson: r.hintsJson,
            status: r.status,
            error: r.error,
            analysisSummary: r.analysisSummary,
            conflict: r.conflict,
            styleCardBefore: r.styleCardBefore,
            styleCardAfter: r.styleCardAfter,
            progressBefore: r.progressBefore,
            progressAfter: r.progressAfter,
            stabilityBefore: r.stabilityBefore,
            stabilityAfter: r.stabilityAfter,
            revocable: r.revocable,
            revoked: r.revoked,
            feedbackReasons: r.feedbackReasons,
            weightChanges: r.weightChanges,
            createdAt: r.createdAt,
          })),
        })),
      });
      for (const r of res.results) {
        if (!r.ok) {
          addFail({
            kind: "mode",
            label: `模式${r.modeId}`,
            detail: r.error ?? "模式导入失败",
            modeId: r.modeId,
          });
        } else {
          modeResultsRef.current.set(r.modeId, {
            cardsOk: r.cardsOk,
            recordsOk: r.recordsOk,
          });
          let styleCardsOk = 0;
          let trainingRecordsOk = 0;
          for (const v of modeResultsRef.current.values()) {
            styleCardsOk += v.cardsOk;
            trainingRecordsOk += v.recordsOk;
          }
          if (r.modeId === 1) {
            const expected =
              pkg.modes.find((m) => m.id === 1)?.cards.length ?? 0;
            setTally((t) => ({
              ...t,
              mode1CardsOk: r.cardsOk,
              mode1Expected: expected,
              mode1CurrentSet: r.currentCardSet,
              styleCardsOk,
              trainingRecordsOk,
            }));
          } else {
            setTally((t) => ({ ...t, styleCardsOk, trainingRecordsOk }));
          }
        }
      }
    } catch (e) {
      for (const m of modes)
        addFail({
          kind: "mode",
          label: `模式${m.id}`,
          detail: errText(e, "模式导入失败"),
          modeId: m.id,
        });
    }
  };

  // 生图记录导入（v3.74）：数据都导入完、id 映射齐了之后调用。
  // 记录逐条新增；失败只记一条可重试的失败项，不拖垮已导入的数据。
  // v3.75：暂存图本体随包恢复——逐条把包内暂存图字节走分片通道传
  // 回去，服务端拼回存成新暂存图、记录状态原样保留；某条暂存图
  // 上传失败时那条按没带字节导入（已出图记录会标已失效），并记一
  // 条可重试的失败项，不拖垮其他记录。
  const importGenRecords = async () => {
    const pkg = pkgRef.current!;
    const records = pkg.imageGenRecords ?? [];
    if (records.length === 0) {
      setTally((t) => ({ ...t, genRecordsOk: 0, genStagedOk: 0 }));
      return;
    }
    const stagedRefs = new Map<number, ChunkedImageRef>();
    let stagedUploadFailed = 0;
    for (let i = 0; i < records.length; i++) {
      const r = records[i]!;
      if (!r.stagedImageId) continue;
      try {
        stagedRefs.set(
          i,
          await uploadPkgImage(
            r.stagedImageId,
            `生图暂存图-${r.personName || i + 1}.img`,
          ),
        );
      } catch {
        stagedUploadFailed += 1;
      }
    }
    try {
      const res = await api.importBackupImageGenRecords({
        presetIdMap: [...presetMapRef.current.entries()].map(([oldId, newId]) => ({
          oldId,
          newId,
        })),
        characterIdMap: [...characterMapRef.current.entries()].map(
          ([key, newId]) => ({
            oldId: Number(key.split(":")[1]),
            newId,
          }),
        ),
        projectIdMap: [...projectMapRef.current.entries()].map(([oldId, newId]) => ({
          oldId,
          newId,
        })),
        records: records.map((r, i) => ({
          personName: r.personName,
          presetOldId: r.presetOldId,
          presetName: r.presetName,
          characterOldId: r.characterOldId,
          characterName: r.characterName,
          projectOldId: r.projectOldId,
          promptZh: r.promptZh,
          promptEn: r.promptEn,
          model: r.model,
          quality: r.quality,
          ratio: r.ratio,
          threeView: r.threeView,
          taskId: r.taskId,
          line: r.line,
          status: r.status,
          stagedKey: r.stagedKey,
          stagedImage: stagedRefs.get(i) ?? null,
          mimeType: r.mimeType,
          error: r.error,
          savedPresetOldId: r.savedPresetOldId,
          savedPresetName: r.savedPresetName,
          savedCharacterOldId: r.savedCharacterOldId,
          savedCharacterName: r.savedCharacterName,
          createdAt: r.createdAt,
        })),
      });
      setTally((t) => ({
        ...t,
        genRecordsOk: res.imported,
        genStagedOk: res.stagedRestored,
      }));
      if (res.failed > 0) {
        addFail({
          kind: "genRecords",
          label: `生图记录（${res.failed} 条没导入成功）`,
          detail: "生图记录导入时有几条没存进去，可以单独重试整批（会新增，不覆盖已有记录）",
        });
      }
      if (stagedUploadFailed > 0) {
        addFail({
          kind: "genRecords",
          label: `生图暂存图（${stagedUploadFailed} 张没能传回）`,
          detail: "对应记录已按没带暂存图导入（已出图的那几条会标为已失效）；可以单独重试整批生图记录，暂存图会再传一次（记录会新增一份，不覆盖）",
        });
      }
    } catch (e) {
      addFail({
        kind: "genRecords",
        label: "生图记录",
        detail: errText(e, "生图记录导入失败"),
      });
    }
  };

  const runImport = async () => {
    const pkg = pkgRef.current;
    if (!pkg) return;
    setBusy(true);
    setImportDone(false);
    setFails([]);
    setSettingsApplied(0);
    setDraftsApplied(null);
    setFingerprintReport(null);
    presetMapRef.current = new Map();
    projectMapRef.current = new Map();
    characterMapRef.current = new Map();
    modeResultsRef.current = new Map();
    setTally({
      projectsOk: 0,
      archivedExpected: pkg.projects.filter((p) => !!p.archived).length,
      archivedOk: 0,
      presetsOk: 0,
      presetImagesOk: 0,
      versionsOk: 0,
      versionsExpected: pkg.projects.reduce(
        (n, p) => n + p.versions.length,
        0,
      ),
      mode1CardsOk: 0,
      mode1Expected: pkg.modes.find((m) => m.id === 1)?.cards.length ?? 0,
      mode1CurrentSet: false,
      styleCardsOk: 0,
      styleCardsExpected: pkg.counts.styleCards,
      trainingRecordsOk: 0,
      trainingRecordsExpected: pkg.counts.trainingRecords,
      genRecordsOk: 0,
      genRecordsExpected: (pkg.imageGenRecords ?? []).length,
      genStagedOk: 0,
      genStagedExpected: (pkg.imageGenRecords ?? []).filter(
        (r) => !!r.stagedImageId,
      ).length,
    });
    try {
      for (let i = 0; i < pkg.presets.length; i++) {
        setImportPhase(`正在导入储存库卡 ${i + 1} / ${pkg.presets.length}：${pkg.presets[i]!.name}`);
        await importOnePreset(pkg.presets[i]!, i === 0);
      }
      for (let i = 0; i < pkg.projects.length; i++) {
        setImportPhase(`正在导入项目 ${i + 1} / ${pkg.projects.length}：${pkg.projects[i]!.name}`);
        await importOneProject(pkg.projects[i]!);
      }
      setImportPhase("正在导入模式与爆款基因卡…");
      await importModes();
      setImportPhase("正在导入生图记录…");
      await importGenRecords();
      // 本机界面设置最后恢复：主题、储存库查看偏好、指引档案与
      // 已看状态。恢复后提示刷新一次让主题与偏好全部生效。
      if (pkg.localSettings) {
        setSettingsApplied(applyLocalSettings(pkg.localSettings));
      }
      // 未保存草稿最后恢复：剧本草稿按旧→新项目 id 重新挂接（项目
      // 都导入完、映射齐了才能挂对），生图面板草稿直接写回。
      if (pkg.localDrafts) {
        setDraftsApplied(
          applyLocalDrafts(pkg.localDrafts, projectMapRef.current),
        );
      }
      // v3.76 内容指纹自动核对：回读本台全库清单、用与导出完全相同
      // 的口径再算一份指纹，与包内指纹逐项比对（子集口径：包内每
      // 一项都要在新台找到内容一致的对应项）。核对本身跑不完（回
      // 读失败）时记为未对上并写明原因，不假装通过；旧包没带指纹
      // 就跳过这一行。
      if (pkg.contentFingerprint) {
        setImportPhase("正在自动核对内容指纹（逐项内容哈希比对）…");
        try {
          const now = await api.exportBackupManifest({});
          const actual = await computeFingerprintFromManifest(now);
          setFingerprintReport(
            compareFingerprints(pkg.contentFingerprint, actual),
          );
        } catch (e) {
          setFingerprintReport({
            allOk: false,
            rows: [],
            summary: "内容指纹自动核对没能跑完",
            error: errText(e, "回读本工作台数据失败"),
          });
        }
      }
      setImportPhase("");
      setImportDone(true);
      void queryClient.invalidateQueries();
    } finally {
      setBusy(false);
    }
  };

  const retryFail = async (f: FailItem) => {
    const pkg = pkgRef.current;
    if (!pkg || f.resolved) return;
    setFails((prev) =>
      prev.map((x) => (x.id === f.id ? { ...x, retrying: true } : x)),
    );
    try {
      if (f.kind === "preset" && f.presetOldId != null) {
        const preset = pkg.presets.find((p) => p.oldId === f.presetOldId);
        if (!preset) throw new Error("备份包里找不到这张卡");
        const before = presetMapRef.current.has(f.presetOldId);
        await importOnePreset(preset, false);
        if (!before && presetMapRef.current.has(f.presetOldId)) {
          setFails((prev) =>
            prev.map((x) => (x.id === f.id ? { ...x, resolved: true } : x)),
          );
        }
      } else if (
        f.kind === "presetImage" &&
        f.presetOldId != null &&
        f.imageIndex != null
      ) {
        const preset = pkg.presets.find((p) => p.oldId === f.presetOldId);
        const newId = presetMapRef.current.get(f.presetOldId);
        const im = preset?.images[f.imageIndex];
        if (!preset || newId == null || !im)
          throw new Error("这张卡还没有导入成功，先重试导入这张卡");
        const ref = await uploadPkgImage(im.imageId, im.fileName);
        await api.addAssetPresetImagesChunked({
          presetId: newId,
          images: [ref],
        });
        setTally((t) => ({ ...t, presetImagesOk: t.presetImagesOk + 1 }));
        setFails((prev) =>
          prev.map((x) => (x.id === f.id ? { ...x, resolved: true } : x)),
        );
      } else if (f.kind === "project" && f.projectOldId != null) {
        const project = pkg.projects.find((p) => p.oldId === f.projectOldId);
        if (!project) throw new Error("备份包里找不到这个项目");
        const before = projectMapRef.current.has(f.projectOldId);
        await importOneProject(project);
        if (!before && projectMapRef.current.has(f.projectOldId)) {
          setFails((prev) =>
            prev.map((x) => (x.id === f.id ? { ...x, resolved: true } : x)),
          );
        }
      } else if (
        f.kind === "characterImage" &&
        f.projectOldId != null &&
        f.characterOldId != null
      ) {
        const project = pkg.projects.find((p) => p.oldId === f.projectOldId);
        const ch = project?.characters.find((c) => c.oldId === f.characterOldId);
        const newCharId = characterMapRef.current.get(
          `${f.projectOldId}:${f.characterOldId}`,
        );
        if (!project || !ch || !ch.imageId || newCharId == null)
          throw new Error("对应的人物卡还没有导入成功，先重试导入这个项目");
        const ref = await uploadPkgImage(ch.imageId, `${ch.name}.img`);
        await api.setCharacterImageChunked({
          id: newCharId,
          image: ref,
        });
        setFails((prev) =>
          prev.map((x) => (x.id === f.id ? { ...x, resolved: true } : x)),
        );
      } else if (f.kind === "genRecords") {
        // 整批重导（新增、不覆盖）；若再次失败，importGenRecords 会
        // 再记一条新的失败项，所以本条直接标记已处理。
        await importGenRecords();
        setFails((prev) =>
          prev.map((x) => (x.id === f.id ? { ...x, resolved: true } : x)),
        );
      } else if (f.kind === "mode" && f.modeId != null) {
        const before = fails.filter(
          (x) => x.kind === "mode" && x.modeId === f.modeId && !x.resolved,
        ).length;
        await importModes(f.modeId);
        void before;
        setFails((prev) =>
          prev.map((x) => (x.id === f.id ? { ...x, resolved: true } : x)),
        );
      } else {
        throw new Error("这项缺少定位信息，无法单独重试，请重新导入整个备份（会新增一份，不覆盖已导入的）");
      }
      void queryClient.invalidateQueries();
    } catch (e) {
      setFails((prev) =>
        prev.map((x) =>
          x.id === f.id
            ? { ...x, retrying: false, detail: `${x.detail}；重试仍失败：${errText(e, "请再试")}` }
            : x,
        ),
      );
      return;
    }
    setFails((prev) =>
      prev.map((x) => (x.id === f.id ? { ...x, retrying: false } : x)),
    );
  };

  // ------------------------------------------------------------------- UI
  const targetNonEmpty =
    target != null && (target.projectCount > 0 || target.presetCount > 0);
  const activeFails = fails.filter((f) => !f.resolved);
  const pkgCounts = pkgInfo?.counts;
  const checkRows: { label: string; expected: string; got: string; ok: boolean }[] =
    pkgCounts && importDone
      ? [
          {
            label: "项目",
            expected: `${pkgCounts.projects} 个`,
            got: `${tally.projectsOk} 个`,
            ok: tally.projectsOk === pkgCounts.projects,
          },
          // v5.87：储存箱项目单独一行——只在包里真有储存箱项目时列
          // （旧包没有储存箱状态时不列，不拿不存在的项判未对上）。
          ...(tally.archivedExpected > 0
            ? [
                {
                  label: "储存箱项目（导入后仍在储存箱）",
                  expected: `${tally.archivedExpected} 个`,
                  got: `${tally.archivedOk} 个`,
                  ok: tally.archivedOk === tally.archivedExpected,
                },
              ]
            : []),
          {
            label: "储存库卡",
            expected: `${pkgCounts.presets} 张`,
            got: `${tally.presetsOk} 张`,
            ok: tally.presetsOk === pkgCounts.presets,
          },
          {
            label: "储存库图片",
            expected: `${pkgCounts.presetImages} 张`,
            got: `${tally.presetImagesOk} 张`,
            ok: tally.presetImagesOk === pkgCounts.presetImages,
          },
          {
            label: "版本快照",
            expected: `${tally.versionsExpected} 份`,
            got: `${tally.versionsOk} 份`,
            ok: tally.versionsOk === tally.versionsExpected,
          },
          {
            label: "风格卡",
            expected: `${pkgCounts.styleCards} 张`,
            got: `${tally.styleCardsOk} 张`,
            ok: tally.styleCardsOk === pkgCounts.styleCards,
          },
          {
            label: "训练记录",
            expected: `${pkgCounts.trainingRecords} 条`,
            got: `${tally.trainingRecordsOk} 条`,
            ok: tally.trainingRecordsOk === pkgCounts.trainingRecords,
          },
          {
            label: "模式1基因卡",
            expected: `${tally.mode1Expected} 张卡 · 完整`,
            got: `${tally.mode1CardsOk} 张卡${tally.mode1CurrentSet ? " · 当前卡已指向" : " · 当前卡未指向"}`,
            ok:
              tally.mode1CardsOk === tally.mode1Expected &&
              (tally.mode1Expected === 0 || tally.mode1CurrentSet),
          },
          {
            label: "生图记录",
            expected: `${tally.genRecordsExpected} 条`,
            got: `${tally.genRecordsOk} 条`,
            ok: tally.genRecordsOk === tally.genRecordsExpected,
          },
          // 暂存图只在包里真带了暂存图时才列这一行（旧包 / 无暂存图
          // 时不列，不拿不存在的项判未对上）。
          ...(tally.genStagedExpected > 0
            ? [
                {
                  label: "生图暂存图",
                  expected: `${tally.genStagedExpected} 张随包恢复`,
                  got: `${tally.genStagedOk} 张已恢复`,
                  ok: tally.genStagedOk === tally.genStagedExpected,
                },
              ]
            : []),
          {
            label: "本机界面设置",
            expected: "随包恢复",
            got:
              settingsApplied > 0
                ? `已恢复 ${settingsApplied} 项（刷新页面后全部生效）`
                : "包里未带（旧包或本机存储不可用）",
            // 旧包本来就不带设置，不算未对上；复刻包带了却没恢复成
            // 才算未对上。
            ok: !pkgInfo?.hasReplication || settingsApplied > 0,
          },
          {
            label: "本机草稿",
            expected: "随包恢复",
            got: pkgRef.current?.localDrafts
              ? draftsApplied
                ? `已恢复 ${draftsApplied.applied} 项${draftsApplied.skipped > 0 ? `，${draftsApplied.skipped} 份剧本草稿因对应项目没导入成功被跳过` : ""}（刷新页面后生效）`
                : "未恢复"
              : "包里未带（旧包或旧台没有未保存草稿）",
            // 旧包 / 没草稿的包不算未对上；包里带了草稿却一份都没
            // 挂上才算未对上（部分跳过会在失败清单里另有说明）。
            ok:
              !pkgRef.current?.localDrafts ||
              Object.keys(pkgRef.current.localDrafts).length === 0 ||
              (draftsApplied?.applied ?? 0) > 0,
          },
          // 内容指纹行只在包里真带了指纹（v3.76 起的包）时才列：
          // 旧包本来就没指纹，不列、不判未对上。核对跑不完（error）
          // 按未对上显示并写明原因，不假装通过。
          ...(pkgRef.current?.contentFingerprint
            ? [
                {
                  label: "内容指纹（内容级 1:1 自动核对）",
                  expected: "包内每一项内容哈希都在本台对上",
                  got: fingerprintReport
                    ? fingerprintReport.error
                      ? `自动核对没跑完：${fingerprintReport.error}，请按验收清单人工核对`
                      : fingerprintReport.summary
                    : "正在核对…",
                  ok: !!fingerprintReport && !fingerprintReport.error && fingerprintReport.allOk,
                },
              ]
            : []),
        ]
      : [];
  const allChecked = checkRows.length > 0 && checkRows.every((r) => r.ok) && activeFails.length === 0;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="工作台备份">
        <button
          type="button"
          className="btn btn-sm shrink-0 font-bold"
          style={{ borderColor: "var(--terra)", color: "var(--walnut)" }}
          aria-label="打包备份：只下载一个数据包文件，装全部项目（含储存箱里的剧本与储存箱状态）、训练记录与模式基因卡、储存库卡与图片、生图记录与暂存图、本机设置与未保存草稿；不打包监控账号、工作台程序与任何 Key"
          onClick={() => {
            setTab("export");
            setOpen(true);
          }}
        >
          打包备份
        </button>
        <button
          type="button"
          className="btn btn-sm shrink-0 font-bold"
          style={{ borderColor: "var(--terra)", color: "var(--walnut)" }}
          aria-label="导入备份：上传数据包，把项目（含储存箱状态）、储存库卡与图片、模式与训练记录、生图记录与暂存图、本机界面设置与未保存草稿恢复到本工作台（新增不覆盖）"
          onClick={() => {
            setTab("import");
            setOpen(true);
          }}
        >
          导入备份
        </button>
      </div>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
          style={{
            background: "rgba(3, 5, 9, 0.62)",
            paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
          }}
          role="dialog"
          aria-modal="true"
          aria-label="工作台打包备份"
          onClick={() => !busy && setOpen(false)}
        >
          <div
            className="max-h-[86vh] w-full max-w-lg overflow-y-auto rounded-[14px] border p-5"
            style={{
              borderColor: "var(--border)",
              background: "var(--surface)",
              boxShadow: "var(--shadow-card)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <p className="font-display text-lg font-bold">工作台打包备份</p>
              <button
                type="button"
                className="btn btn-sm shrink-0"
                aria-label="关闭备份窗口"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                关闭
              </button>
            </div>
            <div className="seg mt-3" role="group" aria-label="备份方式切换">
              <button
                type="button"
                aria-pressed={tab === "export"}
                onClick={() => setTab("export")}
              >
                打包备份（导出）
              </button>
              <button
                type="button"
                aria-pressed={tab === "import"}
                onClick={() => setTab("import")}
              >
                导入备份（恢复）
              </button>
            </div>

            {tab === "export" && (
              <div className="mt-4 text-sm leading-6">
                <p>
                  点一次，只下载<strong>一个数据包文件</strong>，里面只装你的数据。工作台程序本身已经在 GitHub 上，不再打进备份里，也不再另外生成独立复刻页。恢复时在工作台里点「导入备份」上传这个数据包就能完成。
                </p>
                <div
                  className="mt-3 rounded-[var(--radius)] border p-3"
                  style={{ borderColor: "var(--border)" }}
                  aria-label="打包范围说明"
                >
                  <p className="font-bold">会打包的（都在这一个文件里）：</p>
                  <ul className="mt-1 list-disc pl-5">
                    <li>全部剧本项目——<strong>包括储存箱里的剧本</strong>，连它在储存箱里的分类、星级和存入时间一起打包，导入后原样回到储存箱</li>
                    <li>训练进度：训练记录、5 个模式和爆款基因卡</li>
                    <li>人物资产库：全部人物卡的信息和图片（图片是真实字节，不是地址）</li>
                    <li>生图记录和暂存图、本机界面设置、还没保存的草稿</li>
                  </ul>
                  <p className="mt-2 font-bold">不会打包的：</p>
                  <ul className="mt-1 list-disc pl-5">
                    <li>监控账号和监控视频（一直不打包）</li>
                    <li>工作台程序本身（已经在 GitHub 上）</li>
                    <li>任何 Key 和账号凭证（照旧不打包，恢复后重新连接一次即可）</li>
                  </ul>
                </div>
                <details className="help-fold">
                  <summary aria-label="数据包内容说明（点开查看）">打包规则细节（说明）</summary>
                  <div className="help-fold-body">
                    数据包里除了上面的用户数据，还带三样恢复用的东西：①一键复刻执行单（文件第一项，给新账号 Muse 的编号步骤：新账号只需把这一个文件发过去、可以不附文字，重建、导入、验收都按单做完）；②布局与功能规格（工作台已在 GitHub 上，这份规格只作重建时的对照）；③内容指纹（逐项内容哈希，导入后自动逐项核对，内容对不对由哈希说话）。图片逐张取真实字节、写清字节数与 SHA-256，导入时逐张复验。下载前先自检包结构、再回读逐张复核图片哈希，缺项或对不上就拦下不下载。打包逐张取图、每张自动重试 3 次：个别图失败只记进失败清单，可只补失败图续跑，不会整包作废。
                  </div>
                </details>
                {progress && (
                  <p className="mt-3" role="status" aria-label="打包进度">
                    {progress}
                  </p>
                )}
                {exportError && (
                  <p className="mt-3 font-bold" style={{ color: "var(--terra)" }} role="alert">
                    {exportError}
                  </p>
                )}
                {exportFails.length > 0 && (
                  <div
                    className="mt-3 rounded-[var(--radius)] border p-3"
                    style={{ borderColor: "var(--terra)", background: "var(--bad-soft)" }}
                    role="alert"
                    aria-label="打包失败图片清单"
                  >
                    <p className="font-bold">
                      有 {exportFails.length} 张图重试 3 次后仍没取回来，包还没有生成。
                      {exportKept
                        ? `已经取回的 ${exportKept.done} / ${exportKept.total} 张都保留着，不会白取——可以只补下面这几张，或先去处理图本身再回来续跑。`
                        : ""}
                    </p>
                    <ul className="mt-1 list-disc pl-5">
                      {exportFails.map((f) => (
                        <li key={f.key}>
                          {f.label}：{f.reason}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={busy}
                        aria-label="只重试失败的图片，已取回的不重取"
                        onClick={() => void retryExportFails()}
                      >
                        {busy ? "重试中…" : `只重试失败图片（${exportFails.length} 张）`}
                      </button>
                    </div>
                    <label className="mt-2 flex cursor-pointer items-start gap-2">
                      <input
                        type="checkbox"
                        className="mt-1.5"
                        checked={confirmIncomplete}
                        onChange={(e) => setConfirmIncomplete(e.target.checked)}
                        aria-label="确认生成缺图的不完整复刻包"
                      />
                      <span>
                        我知道这个包会缺上面 {exportFails.length} 张图（缺图清单会逐条
                        写进包里、导入时也会先亮出来），仍要生成不完整包。
                      </span>
                    </label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={busy || !confirmIncomplete}
                        aria-label="生成不完整复刻包并下载（缺图清单写进包内）"
                        onClick={() => void exportIncompletePackage()}
                      >
                        生成不完整包并下载
                      </button>
                    </div>
                  </div>
                )}
                {exportDone && (
                  <div
                    className="mt-3 rounded-[var(--radius)] border p-3"
                    style={{ borderColor: "var(--border)", background: "var(--ok-soft)" }}
                    role="status"
                    aria-label="打包完成清单"
                  >
                    <p className="font-bold">
                      {exportDone.incompleteCount > 0
                        ? `打包完成，不完整数据包已下载（缺 ${exportDone.incompleteCount} 张图，清单已写进包内）。`
                        : "打包完成，数据包已下载（这次只下载了这一个文件）。"}
                    </p>
                    <ul className="mt-1 list-disc pl-5">
                      <li>
                        下载前回读自验已通过：即将下载的包已按成品文件重新解析，{exportDone.verifiedImages} 张图片逐张复核字节数与 SHA-256 全部对上
                      </li>
                      <li>一键复刻执行单：已放在数据包文件第一项（新账号把文件发给 Muse 即可、可以不附任何文字，文件本身就是指令）</li>
                      <li>内容指纹：项目 / 卡 / 基因卡 / 图片的逐项内容哈希已随包（导入后新台会自动逐项核对）</li>
                      <li>复刻规格：布局 / 主题 / 功能规则 / 表结构已随包（文件第三项就是人可读复刻说明）</li>
                      <li>
                        项目 {exportDone.counts.projects} 个
                        {(exportDone.counts.archivedProjects ?? 0) > 0
                          ? `（其中 ${exportDone.counts.archivedProjects} 个在储存箱里，储存箱状态已随包，导入后原样回到储存箱）`
                          : ""}
                      </li>
                      <li>储存库卡 {exportDone.counts.presets} 张</li>
                      <li>
                        图片 {exportDone.counts.totalUniqueImages} 张（按内容
                        SHA-256 去重后；储存库 {exportDone.counts.presetImages}{" "}
                        张、人物图 {exportDone.counts.characterImages} 张，均为真实字节）
                      </li>
                      <li>
                        版本快照 {exportDone.counts.snapshots} 份；带爆款基因卡的
                        模式 {exportDone.counts.modesWithCards} 个（风格卡{" "}
                        {exportDone.counts.styleCards} 张、训练记录{" "}
                        {exportDone.counts.trainingRecords} 条）；生图记录{" "}
                        {exportDone.counts.imageGenRecords} 条（其中暂存图{" "}
                        {exportDone.counts.stagedImages ?? 0} 张本体随包）；本机
                        界面设置与未保存草稿已随包
                      </li>
                      <li>文件大小 {fmtBytes(exportDone.fileSize)}</li>
                      <li>导出时间 {new Date(exportDone.exportedAt).toLocaleString()}</li>
                    </ul>
                    <p className="mt-2">
                      恢复方法：在工作台里点「导入备份」上传这个数据包
                      就能把数据导回来（导入结束会自动做指纹核对）；换
                      账号时把数据包发给新账号的 Muse 即可（可以不附
                      任何文字，文件本身就是指令），那边会按文件第一项
                      的执行单先验包、再照包内规格重建工作台、再导入数
                      据、最后按内容指纹逐项哈希核对并报告。核对通过前
                      不要退旧账号、不要删旧工作台。
                    </p>
                  </div>
                )}
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={() => setOpen(false)}
                  >
                    关闭
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busy}
                    aria-label="开始打包备份并下载"
                    onClick={() => void doExport()}
                  >
                    {busy ? "打包中…" : "打包备份并下载"}
                  </button>
                </div>
              </div>
            )}

            {tab === "import" && (
              <div className="mt-4 text-sm leading-6">
                <p>
                  上传数据包恢复数据（旧版包也能导入）。包里在储存箱里的项目，导入后仍回到储存箱。导入是<strong>新增</strong>：不覆盖、不删除已有数据。
                </p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  aria-label="选择备份文件"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) void onPickFile(f);
                  }}
                />
                <div className="mt-3">
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    aria-label="选择备份文件上传"
                    onClick={() => fileRef.current?.click()}
                  >
                    选择备份文件
                  </button>
                </div>
                {pkgError && (
                  <p className="mt-3 font-bold" style={{ color: "var(--terra)" }} role="alert">
                    {pkgError}
                  </p>
                )}
                {pkgInfo && target && (
                  <div
                    className="mt-3 rounded-[var(--radius)] border p-3"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <p>
                      {pkgInfo.hasReplication ? "数据包（带复刻规格）" : "数据包"}（基线{" "}
                      {pkgInfo.baseline}，导出于{" "}
                      {new Date(pkgInfo.exportedAt).toLocaleString()}）：项目{" "}
                      {pkgInfo.counts.projects} 个
                      {pkgInfo.archivedProjects > 0
                        ? `（其中 ${pkgInfo.archivedProjects} 个在储存箱里，导入后仍回到储存箱）`
                        : ""}
                      、储存库卡 {pkgInfo.counts.presets}{" "}
                      张、图片 {pkgInfo.counts.totalUniqueImages} 张（去重后）、带基因卡
                      的模式 {pkgInfo.counts.modesWithCards} 个、生图记录{" "}
                      {pkgInfo.counts.imageGenRecords ?? 0} 条
                      {pkgInfo.hasReplication
                        ? `；包内带复刻规格${pkgInfo.hasExecutionSheet ? "与一键复刻执行单" : ""}${pkgInfo.hasFingerprint ? "与内容指纹（导入后自动逐项哈希核对）" : ""}、本机界面设置与未保存草稿，导入后自动恢复`
                        : "；这是旧版备份包，不带复刻规格与本机界面设置，只恢复数据"}
                      。
                    </p>
                    {pkgInfo.incompleteMissing.length > 0 && (
                      <div
                        className="mt-2 rounded-[var(--radius)] border p-2.5"
                        style={{ borderColor: "var(--terra)", background: "var(--bad-soft)" }}
                        role="alert"
                        aria-label="不完整包缺图清单"
                      >
                        <p className="font-bold">
                          这是个不完整包：打包时有 {pkgInfo.incompleteMissing.length}{" "}
                          张图没能取回，导入后这些位置会缺图：
                        </p>
                        <ul className="mt-1 list-disc pl-5">
                          {pkgInfo.incompleteMissing.map((x, i) => (
                            <li key={i}>
                              {x.label}：{x.reason}
                            </li>
                          ))}
                        </ul>
                        <p className="mt-1">
                          能回旧工作台重新打包完整包时，建议先补完整再导入。
                        </p>
                      </div>
                    )}
                    <p className="mt-1">
                      本工作台现在有：项目 {target.projectCount} 个、储存库卡{" "}
                      {target.presetCount} 张。
                      {targetNonEmpty
                        ? "导入会新增一份，不覆盖已有数据。"
                        : "当前是空库，可以直接导入。"}
                    </p>
                    {targetNonEmpty && !importDone && (
                      <label className="mt-2 flex cursor-pointer items-start gap-2">
                        <input
                          type="checkbox"
                          className="mt-1.5"
                          checked={confirmedNonEmpty}
                          onChange={(e) => setConfirmedNonEmpty(e.target.checked)}
                          aria-label="确认导入会新增不覆盖已有数据"
                        />
                        <span>我知道了：导入会新增，不覆盖已有数据，确认后开始。</span>
                      </label>
                    )}
                  </div>
                )}
                {importPhase && (
                  <p className="mt-3" role="status" aria-label="导入进度">
                    {importPhase}
                  </p>
                )}
                {importDone && (
                  <div
                    className="mt-3 rounded-[var(--radius)] border p-3"
                    style={{
                      borderColor: "var(--border)",
                      background: allChecked ? "var(--ok-soft)" : "var(--accent-soft)",
                    }}
                    role="status"
                    aria-label="导入核对清单"
                  >
                    <p className="font-bold">
                      {allChecked
                        ? "导入完成，核对清单逐项对上。"
                        : "导入已跑完，但核对清单还有未对上的项（见下方，可单独重试失败项）。"}
                    </p>
                    <ul className="mt-1 list-disc pl-5">
                      {checkRows.map((r) => (
                        <li key={r.label}>
                          {r.label}：包内 {r.expected} · 已导入 {r.got} ·{" "}
                          {r.ok ? "对上" : "未对上"}
                        </li>
                      ))}
                    </ul>
                    {fingerprintReport && fingerprintReport.rows.length > 0 && (
                      <div className="mt-2" aria-label="内容指纹逐项明细">
                        <p className="font-bold">内容指纹逐项明细（内容级核对）：</p>
                        <ul className="mt-1 list-disc pl-5">
                          {fingerprintReport.rows.map((r) => (
                            <li key={r.label}>
                              {r.label}：{r.detail} · {r.ok ? "对上" : "未对上"}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <p className="mt-2">
                      再打开一个项目确认人物和分镜都对；本机界面设置与草稿
                      已随包恢复的，刷新一次页面让主题、查看偏好与草稿全部
                      生效；新账号里还要重新连接一次 Geeknow 才能生图（Key
                      不在包里）。核对通过前不要退旧账号、不要删旧工作台。
                    </p>
                  </div>
                )}
                {fails.length > 0 && (
                  <div className="mt-3" aria-label="导入失败清单">
                    <p className="font-bold">失败 / 待处理（{activeFails.length} 项未解决）</p>
                    <ul className="mt-1 space-y-2">
                      {fails.map((f) => (
                        <li
                          key={f.id}
                          className="rounded-[var(--radius)] border p-2.5"
                          style={{
                            borderColor: "var(--border)",
                            opacity: f.resolved ? 0.6 : 1,
                          }}
                        >
                          <p>
                            {f.label}
                            {f.resolved ? "（已重试成功）" : ""}
                          </p>
                          <p className="text-[13px] leading-5 text-[var(--dim)]">
                            {f.detail}
                          </p>
                          {!f.resolved && (
                            <button
                              type="button"
                              className="btn btn-sm mt-1.5"
                              disabled={busy || f.retrying}
                              aria-label={`单独重试：${f.label}`}
                              onClick={() => void retryFail(f)}
                            >
                              {f.retrying ? "重试中…" : "单独重试这一项"}
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={() => setOpen(false)}
                  >
                    关闭
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={
                      busy ||
                      !pkgInfo ||
                      importDone ||
                      (targetNonEmpty && !confirmedNonEmpty)
                    }
                    aria-label="开始导入备份"
                    onClick={() => void runImport()}
                  >
                    {busy ? "导入中…" : "开始导入"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
