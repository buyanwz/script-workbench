// Drizzle schema for the script-creation workbench.
//
// One project = one short-drama script in progress:
//   step 1: characters (uploaded asset images + name/role/note) and the
//           overall story outline, kept on the project row;
//   step 2: basic settings (speech rate, scene mode, style, target length);
//   step 3: the generated script, stored as one JSON document on the
//           project row so line edits can be saved back wholesale and all
//           timecodes recomputed client-side from line length / speech rate.
//
// Uploaded images live in ctx.blobs; only their keys are kept here.

import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const projects = sqliteTable("projects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().default("未命名项目"),
  // 项目来源标记（v4.79）："" = 普通项目；"ai-dissect" = 由分析模仿页
  // 「AI解剖」一键套用生成的项目。带此标记的项目在分镜确认时跳过
  // 严格审核拦截（标记长期有效，用户后续自由改分镜不受影响）。
  // applyDissection 建项目时打标；存量项目按 video_analyses 的
  // applied_project_id 关联在 migration 0030 里回填。
  source: text("source").notNull().default(""),
  outline: text("outline").notNull().default(""),
  // Real, not integer: the user can set a custom decimal rate (e.g. 5.5).
  speechRate: real("speech_rate").notNull().default(5),
  // Legacy scene-setting columns (v4.03：场景设置整体删除）。Kept in
  // the schema so existing databases keep loading, but no longer read
  // or written by any action: project reads ignore them and every save
  // path strips them. Scene description now lives only in the
  // outline / script prompts the user writes.
  sceneMode: text("scene_mode", { enum: ["text", "image"] })
    .notNull()
    .default("text"),
  sceneText: text("scene_text").notNull().default(""),
  stylePreset: text("style_preset").notNull().default("幽默风趣"),
  styleCustom: text("style_custom").notNull().default(""),
  // Optional target script length in seconds; 0 = unset (write at the
  // outline's natural length). Only a generation reference, never a cap.
  targetSeconds: integer("target_seconds").notNull().default(0),
  // v3.49 模式系统：当前项目选中的模式（0 = 未选模式）。模式本体是
  // 全局的 5 个固定模式（modes 表），每个项目只记自己选中哪个。
  selectedModeId: integer("selected_mode_id").notNull().default(0),
  // The outline as it was right before an AI-written draft was adopted
  // over it (“AI填写覆盖前” backup). Empty = no backup. Adopting an AI
  // outline never silently destroys a hand-written one.
  prevOutline: text("prev_outline").notNull().default(""),
  // 训练视频重合率（v4.04）：最近一次 checkOutlineOverlap 的结果。
  // rate 为 null = 还没算过；outlineOverlapOutline 存算时用的大纲原文，
  // 客户端拿它与当前大纲比对，不一致即「已修改未重算」。fragmentsJson
  // 是重合片段数组（训练视频原文 / 大纲对应句 / 说明）的 JSON 文本。
  outlineOverlapRate: integer("outline_overlap_rate"),
  outlineOverlapFragmentsJson: text("outline_overlap_fragments_json")
    .notNull()
    .default("[]"),
  outlineOverlapOutline: text("outline_overlap_outline").notNull().default(""),
  outlineOverlapModeId: integer("outline_overlap_mode_id").notNull().default(0),
  outlineOverlapModeName: text("outline_overlap_mode_name").notNull().default(""),
  outlineOverlapComputedAt: integer("outline_overlap_computed_at", {
    mode: "timestamp_ms",
  }),
  // 项目储存箱（v4.76）：archived=1 的项目从工作区项目列表 / 下拉框
  // 里过滤掉，只在「储存箱」页签里出现；剧本、分镜、封面记录、版本
  // 历史等全部数据原样保留，取回只是把 archived 改回 0。
  // archiveCategory 是储存箱分类名（默认「暂时不用」，分类表见
  // projectArchiveCategories；分类改名时同步改本列）。stars 0–5 星。
  // archivedAt = 存入时刻（取回后置空）。
  archived: integer("archived").notNull().default(0),
  archiveCategory: text("archive_category").notNull().default("暂时不用"),
  stars: integer("stars").notNull().default(0),
  archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
  // 发布文案（v4.24）：「生成发布文案」按 6 个平台（抖音 / 快手 /
  // B站 / 小红书 / 视频号 / 好看视频）各生成一套标题 + 简介 + 话题，
  // 结果以 JSON 数组存本列（[{platform, title, intro, topics[]}]，
  // 平台顺序固定），随项目保存、导出整个项目时拼成独立的
  // 《发布文案_6平台.md》。空数组 = 还没生成过。
  publishCopyJson: text("publish_copy_json").notNull().default("[]"),
  // JSON-serialized ScriptData (see actions.ts) or null before generation.
  scriptJson: text("script_json"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const characters = sqliteTable("characters", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id")
    .notNull()
    .references(() => projects.id),
  name: text("name").notNull().default(""),
  role: text("role").notNull().default(""),
  note: text("note").notNull().default(""),
  // Legacy columns from the short-lived separate 造型/音色/语气基调 card
  // fields. No longer read or written as separate fields: on project
  // load any remaining content is merged back into `note` (labelled
  // segments) and these are cleared. Kept in the schema so existing
  // databases keep loading.
  look: text("look").notNull().default(""),
  voice: text("voice").notNull().default(""),
  tone: text("tone").notNull().default(""),
  imageBlobKey: text("image_blob_key"),
  imageMime: text("image_mime"),
  // 生图提示词（v3.94）：「一键写人物提示词」按大纲角色位写好、经用户
  // 预览确认后预填到卡上的中英文提示词（已含超写实CG画风句与三视图
  // 排版句）。卡上可改；点卡片「生成图」打开生图面板时优先用这份词。
  // 空 = 没有预填过，面板照旧按备注 / 关联预设拼词。
  imagePromptZh: text("image_prompt_zh").notNull().default(""),
  imagePromptEn: text("image_prompt_en").notNull().default(""),
  // Library provenance (v3.41): set when this card was published from
  // the 人物资产储存库； null for hand-created cards. Display-only —
  // shown read-only under the card's single name field.
  sourcePresetId: integer("source_preset_id"),
  sourcePresetName: text("source_preset_name").notNull().default(""),
  // 1 once the retired 扮演/身份 (role) value has been folded into the
  // note as an “身份：…” segment by the load-time migration, so the
  // card can tell the user once that the move happened.
  roleMigrated: integer("role_migrated").notNull().default(0),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// One row per saved version snapshot of a project's script. Snapshots are
// taken on script generation, line confirmation, re-storyboarding, the
// manual “保存为新版本” button, and automatically right before a restore
// (so a rollback never destroys the state it replaces). `versionNo` is
// sequential per project (V1, V2, …) and never reused within a project.
export const projectVersions = sqliteTable("project_versions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id")
    .notNull()
    .references(() => projects.id),
  versionNo: integer("version_no").notNull().default(1),
  // The full script JSON as it was at snapshot time.
  scriptJson: text("script_json").notNull(),
  stage: text("stage", { enum: ["review", "storyboard"] })
    .notNull()
    .default("review"),
  // Lens count / total seconds at snapshot time (0 in the review stage).
  lensCount: integer("lens_count").notNull().default(0),
  totalSeconds: real("total_seconds").notNull().default(0),
  autoNote: text("auto_note").notNull().default(""),
  userNote: text("user_note").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ---------------------------------------------------------------------------
// 3:4 人物资产储存库 (integrated second workbench in the same fixed page).
// Its presets live in their own tables and are NOT synced with the
// standalone 3:4 workbench artifact. `assetMeta` records one-time
// bookkeeping (whether the two starter presets have ever been seeded, so
// deleting them does not resurrect them).
// ---------------------------------------------------------------------------

export const assetMeta = sqliteTable("asset_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull().default(""),
});

export const assetPresets = sqliteTable("asset_presets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().default(""),
  locked: integer("locked").notNull().default(0),
  personZh: text("person_zh").notNull().default(""),
  personEn: text("person_en").notNull().default(""),
  hairZh: text("hair_zh").notNull().default(""),
  hairEn: text("hair_en").notNull().default(""),
  hatZh: text("hat_zh").notNull().default(""),
  hatEn: text("hat_en").notNull().default(""),
  faceZh: text("face_zh").notNull().default(""),
  faceEn: text("face_en").notNull().default(""),
  neckZh: text("neck_zh").notNull().default(""),
  neckEn: text("neck_en").notNull().default(""),
  topZh: text("top_zh").notNull().default(""),
  topEn: text("top_en").notNull().default(""),
  armsZh: text("arms_zh").notNull().default(""),
  armsEn: text("arms_en").notNull().default(""),
  bottomZh: text("bottom_zh").notNull().default(""),
  bottomEn: text("bottom_en").notNull().default(""),
  shoesZh: text("shoes_zh").notNull().default(""),
  shoesEn: text("shoes_en").notNull().default(""),
  extraZh: text("extra_zh").notNull().default(""),
  extraEn: text("extra_en").notNull().default(""),
  // Character-card face fields (v3.24 rebuild): the library is a
  // character-card library, not a text-only template list. `cardRole` /
  // `cardNote` are the card's 扮演/身份 and 性格或外貌备注, kept verbatim
  // (merged 造型/音色/语气基调 segments stay merged, never split back).
  // `fromCard` marks presets rebuilt from a script project's character
  // card; publishing one writes role + note back verbatim.
  cardRole: text("card_role").notNull().default(""),
  cardNote: text("card_note").notNull().default(""),
  // Library-only organisation (v3.26): the category name this card is
  // filed under. Pure storage bookkeeping — never published to a
  // script project. "未分类" is the default / fallback bucket.
  category: text("category").notNull().default("未分类"),
  // 系统分类（v5.50）：性别（男 / 女）× 年龄组（成年 / 未成年，18 岁
  // 为界）两级归类，与上面的用户自管 category 完全独立、互不覆盖。
  // classUncertain 标记分类存疑（拿不准、待用户定），classNote 存
  // 一句判断依据。三者都可为空（未归类），不影响任何既有字段。
  gender: text("gender").notNull().default(""),
  ageGroup: text("age_group").notNull().default(""),
  classUncertain: integer("class_uncertain").notNull().default(0),
  classNote: text("class_note").notNull().default(""),
  // AI 分析待确认草稿（v5.53）：储存库卡 AI 分析（造型 / 音色 /
  // 语气基调）的结果先深存这七列、标「未确认」，用户在详情悬浮
  // 窗里确认后才写进 cardNote 的已存段——分析永不直接覆盖已存
  // 值、永不写 gender。pendingSource 是每字段来源 JSON
  // （{"look":"analysis"|"manual"|null,…}），pendingRollback 是
  // 确认前已存值 JSON（一层，供「恢复上一版」）。发布到剧本 /
  // 拼装 / 导出备份永不读这七列（备份导出逐字段拼装、本就不含；
  // 备份导入走显式字段插入、新行这七列按默认值为空）。
  pendingLook: text("pending_look").notNull().default(""),
  pendingVoice: text("pending_voice").notNull().default(""),
  pendingTone: text("pending_tone").notNull().default(""),
  pendingSource: text("pending_source").notNull().default(""),
  pendingJobId: text("pending_job_id").notNull().default(""),
  pendingUpdatedAt: integer("pending_updated_at").notNull().default(0),
  pendingRollback: text("pending_rollback").notNull().default(""),
  fromCard: integer("from_card").notNull().default(0),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Images stored ON a library card (v3.24): one card can hold several
// asset images — rebuilt from a script character card or imported by
// the user through the same upload path; both share this one table and
// the same publish logic. The first image (lowest sortOrder) is the
// 主图 that publishing sends to the script character card (which holds
// exactly one image). Image bytes live in ctx.blobs; only keys here.
// A blob key may be shared with a script character card (the server
// blob API cannot copy bytes), so blob deletion is reference-checked.
export const assetPresetImages = sqliteTable("asset_preset_images", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  presetId: integer("preset_id")
    .notNull()
    .references(() => assetPresets.id),
  // Original upload file name (shown on the card so the user can tell
  // the stored images apart); empty for images rebuilt from a card.
  fileName: text("file_name").notNull().default(""),
  imageBlobKey: text("image_blob_key").notNull(),
  imageMime: text("image_mime").notNull().default("image/jpeg"),
  // 按图存的造型（v5.56）：同一人的每张换装图各存自己的造型；
  // 卡片的造型（cardNote 的「造型：」段）恒等于当前主体图
  // （sortOrder 最小那张）的造型——切换主体时服务端同步换、
  // 换回来恢复。主体图 look 为空时沿用卡片现有造型（读取时由
  // toAssetPresetOut 把卡面造型回填进主体图落盘）。
  look: text("look").notNull().default(""),
  // 单图造型 AI 分析待确认（v5.56，深存口径同 v5.53 卡级
  // pending）：新图 / 缺造型非主体图的「分析造型」结果先存
  // pendingLook，确认后才写进这张图的 look；pendingRollback
  // 是确认前这张图已存造型的 JSON 留底（{"look": "..."}），
  // 供恢复上一版。分析永不直接覆盖 look。
  pendingLook: text("pending_look").notNull().default(""),
  pendingJobId: text("pending_job_id").notNull().default(""),
  pendingUpdatedAt: integer("pending_updated_at").notNull().default(0),
  pendingRollback: text("pending_rollback").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Library categories (v3.26): user-managed filing buckets for library
// cards. A category row exists even while it holds no cards, so empty
// categories survive reloads; deleting one re-files its cards under
// 未分类 instead of deleting them. Card counts are computed from
// asset_presets.category, never stored here.
export const assetCategories = sqliteTable("asset_categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ---------------------------------------------------------------------------
// v3.49 模式系统（功能优先第一版）：模式1—5 各自独立训练、独立分析、
// 独立保存风格，模式间默认不互通。花朵图形只预留 iconSlot，第一版用
// 圆形编号占位。训练在独立窗口完成，记录与风格卡都落库持久化，
// 关闭窗口不中断（任务状态即库里的状态）。
// ---------------------------------------------------------------------------

export const modes = sqliteTable("modes", {
  id: integer("id").primaryKey(),
  name: text("name").notNull().default(""),
  // 预留给后续花朵视觉的图标槽位名，第一版不渲染花朵图形。
  iconSlot: text("icon_slot").notNull().default(""),
  // 已学风格标签（JSON 数组字符串）。
  styleTags: text("style_tags").notNull().default("[]"),
  progress: integer("progress").notNull().default(0),
  // 稳定度：高 / 中 / 低（未训练时为空字符串）。
  stability: text("stability").notNull().default(""),
  // 状态覆盖："" = 按进度自动判定；"conflict" = 风格冲突待确认。
  statusOverride: text("status_override").notNull().default(""),
  // 底层逻辑（v4.09）：用户在模式卡上自己总结、可改的底层逻辑文本。
  // 空字符串 = 还没写过，读取时按模式返回默认预填（模式1/2 方法论、
  // 模式3–5 占位句），用户保存后以本列为准。
  coreLogic: text("core_logic").notNull().default(""),
  currentStyleCardId: integer("current_style_card_id"),
  lastTrainedAt: integer("last_trained_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const styleCards = sqliteTable("style_cards", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  modeId: integer("mode_id")
    .notNull()
    .references(() => modes.id),
  themeStyle: text("theme_style").notNull().default(""),
  rhythmStyle: text("rhythm_style").notNull().default(""),
  dialogueStyle: text("dialogue_style").notNull().default(""),
  pixelStyle: text("pixel_style").notNull().default(""),
  // v3.53 爆款基因卡新增四维 + 提炼摘要 + 权重 + 多模态证据
  hookStyle: text("hook_style").notNull().default(""),
  emotionCurve: text("emotion_curve").notNull().default(""),
  narrativeStructure: text("narrative_structure").notNull().default(""),
  interactionDesign: text("interaction_design").notNull().default(""),
  viralSummary: text("viral_summary").notNull().default(""),
  weightsJson: text("weights_json").notNull().default('{"theme":100,"rhythm":100,"dialogue":100,"pixel":100,"hook":100,"emotion":100,"narrative":100,"interaction":100}'),
  adjustmentLog: text("adjustment_log").notNull().default("[]"),
  framesJson: text("frames_json").notNull().default("[]"),
  transcriptText: text("transcript_text").notNull().default(""),
  rhythmPoints: text("rhythm_points").notNull().default(""),
  addedTags: text("added_tags").notNull().default("[]"),
  correctedTags: text("corrected_tags").notNull().default("[]"),
  stability: text("stability").notNull().default("低"),
  sourceVideo: text("source_video").notNull().default(""),
  // pending 待确认 / confirmed 已确认 / rejected 已否定
  confirmed: text("confirmed").notNull().default("pending"),
  version: integer("version").notNull().default(1),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const trainingRecords = sqliteTable("training_records", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  modeId: integer("mode_id")
    .notNull()
    .references(() => modes.id),
  // training = 视频投喂训练；feedback = 已下线的「像/不像」反馈历史记录
  // （v4.01 起不再产生新条目，历史行保留不删，仍可查看与撤销回滚）。
  kind: text("kind").notNull().default("training"),
  videoName: text("video_name").notNull().default(""),
  videoType: text("video_type").notNull().default(""),
  videoSizeBytes: integer("video_size_bytes").notNull().default(0),
  videoDurationSec: real("video_duration_sec").notNull().default(0),
  // 用户投喂时填的结构化字段（JSON）：题材/情绪/节奏/对话/像素提示。
  hintsJson: text("hints_json").notNull().default("{}"),
  // queued 排队 / analyzing 分析中 / success 成功 / failed 失败
  status: text("status").notNull().default("queued"),
  error: text("error").notNull().default(""),
  analysisSummary: text("analysis_summary").notNull().default(""),
  conflict: integer("conflict").notNull().default(0),
  styleCardBefore: text("style_card_before").notNull().default(""),
  styleCardAfter: text("style_card_after").notNull().default(""),
  progressBefore: integer("progress_before").notNull().default(0),
  progressAfter: integer("progress_after").notNull().default(0),
  stabilityBefore: text("stability_before").notNull().default(""),
  stabilityAfter: text("stability_after").notNull().default(""),
  revocable: integer("revocable").notNull().default(1),
  revoked: integer("revoked").notNull().default(0),
  feedbackReasons: text("feedback_reasons").notNull().default("[]"),
  weightChanges: text("weight_changes").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ---------------------------------------------------------------------------
// v4.21 本模式优化建议：用户在分镜页最下方写下的、针对某个模式的改进
// 意见（看完按这个模式生成并拍成的视频之后留下的）。按 mode_id 存储，
// 与项目无关——同一模式的所有项目共用一份建议；下次用该模式生成
// （剧本生成 / 生成故事流程 / AI填写大纲）时，服务端把该模式的全部
// 建议作为优化要求注入提示词。删除是单条硬删（用户明确点删即删）。
// ---------------------------------------------------------------------------

export const modeSuggestions = sqliteTable("mode_suggestions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  modeId: integer("mode_id")
    .notNull()
    .references(() => modes.id),
  content: text("content").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ---------------------------------------------------------------------------
// v3.61 生图记录：每次提交成功立刻落一条，刷新 / 重开 / 切项目都在。
// 一条记录 = 一个服务商任务（任务号唯一对应），多任务并行时各记各的；
// 记录只存提示词、设置、任务号、状态、暂存图 key 与保存目标，绝不
// 存任何凭证。删记录只删条目，不动已保存到卡上的图（图在 blobs 与
// asset_preset_images / characters 里，与记录无引用关系）。
// status: submitted 已提交 / generating 生成中 / done 已出图 /
//         failed 失败 / expired 任务号已失效
// ---------------------------------------------------------------------------

export const imageGenRecords = sqliteTable("image_gen_records", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  personName: text("person_name").notNull().default(""),
  presetId: integer("preset_id"),
  presetName: text("preset_name").notNull().default(""),
  characterId: integer("character_id"),
  characterName: text("character_name").notNull().default(""),
  projectId: integer("project_id"),
  promptZh: text("prompt_zh").notNull().default(""),
  promptEn: text("prompt_en").notNull().default(""),
  model: text("model").notNull().default(""),
  quality: text("quality").notNull().default(""),
  ratio: text("ratio").notNull().default(""),
  threeView: integer("three_view").notNull().default(1),
  taskId: text("task_id"),
  // 所用线路（本版固定 geeknow.top 主机，只记主机名，不记任何凭证）。
  line: text("line").notNull().default("geeknow.top"),
  status: text("status").notNull().default("submitted"),
  stagedKey: text("staged_key"),
  mimeType: text("mime_type"),
  error: text("error"),
  savedPresetId: integer("saved_preset_id"),
  savedPresetName: text("saved_preset_name").notNull().default(""),
  savedCharacterId: integer("saved_character_id"),
  savedCharacterName: text("saved_character_name").notNull().default(""),
  // v4.15 场景资产：这条记录是为哪张场景资产卡生成的、图最后存到了
  // 哪张场景卡（与人物口径并列，互不混用）。
  sceneAssetId: integer("scene_asset_id"),
  sceneAssetName: text("scene_asset_name").notNull().default(""),
  savedSceneAssetId: integer("saved_scene_asset_id"),
  savedSceneAssetName: text("saved_scene_asset_name").notNull().default(""),
  // v5.61 参考图溯源：这次提交实际带了几张参考图（refImageCount）、
  // 到底发没发给服务商（refSent 1/0）、来源（refSource：从人物卡带入 /
  // 手动上传 / 从人物卡带入＋手动上传 / 未发送 / 无参考图），以及实际
  // 托管链接逐条的 SHA-256 哈希（refHostHashes，JSON 数组；链接本身
  // 是公开图床临时地址、不落库，与封面记录 v5.16 同口径）。本版之
  // 前的历史行三字段为 null、哈希为空串，页面显示「无溯源记录
  // （旧版本）」，不回填、不改写。
  refImageCount: integer("ref_image_count"),
  refSent: integer("ref_sent"),
  refSource: text("ref_source"),
  refHostHashes: text("ref_host_hashes").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ---------------------------------------------------------------------------
// 分片上传暂存（人物资产图无大小限制）：一张大图在客户端按片切开，
// 每片的 Base64 文本先落这张表，收齐后由完成动作拼回完整 Base64、
// 解码存进 ctx.blobs，再删掉这些分片行。分片只是传输手段，不是
// 资产数据本身；未完成的分片行不对应任何卡片图片。
// ---------------------------------------------------------------------------

export const uploadChunks = sqliteTable("upload_chunks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  uploadId: text("upload_id").notNull(),
  chunkIndex: integer("chunk_index").notNull().default(0),
  totalChunks: integer("total_chunks").notNull().default(1),
  dataBase64: text("data_base64").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ---------------------------------------------------------------------------
// 封面生成记录（封面生成页）：一次封面生图任务一条。与生图记录分开存：
// 封面有自己的分析方案（analysisJson = CoverPlan）、标题、所选风格与
// 画幅，历史按项目查。记录只存提示词、方案、任务号、状态与暂存图
// key，绝不存任何凭证。status 与生图记录同口径：submitted 已提交 /
// generating 生成中 / done 已出图 / failed 失败 / expired 任务号已失效。
// ---------------------------------------------------------------------------

export const coverGenerations = sqliteTable("cover_generations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id")
    .notNull()
    .references(() => projects.id),
  projectName: text("project_name").notNull().default(""),
  // 封面主标题（vs 时为「A VS B」合称）。
  title: text("title").notNull().default(""),
  styleId: text("style_id").notNull().default("explosive_vs"),
  styleName: text("style_name").notNull().default(""),
  ratio: text("ratio").notNull().default("3:4"),
  layoutType: text("layout_type").notNull().default("vs"),
  promptZh: text("prompt_zh").notNull().default(""),
  promptEn: text("prompt_en").notNull().default(""),
  // JSON-serialized CoverPlan（见 coverstyles.ts）——分析方案原文。
  analysisJson: text("analysis_json").notNull().default(""),
  model: text("model").notNull().default(""),
  quality: text("quality").notNull().default(""),
  taskId: text("task_id"),
  line: text("line").notNull().default("geeknow.top"),
  status: text("status").notNull().default("submitted"),
  // v5.16 附图自证三件套 + 降级原因：这次提交实际带上了几张参考图
  // （refCount）、带的是哪几位人物卡（refCharIds，JSON 数组、提交
  // 顺序）、这些图托管到图床后的链接 SHA-256 哈希（refHostHashes，
  // JSON 数组、与提交顺序对应，只存哈希不存链接本身）；零图降级
  // 时 degradeReason 写明大白话原因（如「无图降级：未勾选图床同
  // 意」）。v5.16 之前的历史行 refCount 为 null、两数组为空串——
  // 不回填、不改写，页面展示时留空。
  refCount: integer("ref_count"),
  refCharIds: text("ref_char_ids").notNull().default(""),
  refHostHashes: text("ref_host_hashes").notNull().default(""),
  degradeReason: text("degrade_reason"),
  // v5.23 取图过程证据（JSON）：每次提交把取图这一步发生了什么存
  // 下来——图床同意状态（consent）、已选人物位数（selectedCount）、
  // 已选上传图张数（uploadedSelected）、实际取到的人物图数
  // （fetchedCount）与上传图数（uploadedFetched）、被上限挤掉的人名
  // （crowdedOut）、逐个失败原因（failures[{name, reason}]）与一
  // 句总失败步（failStep，如「未勾选图床同意，取图未开始」）。背
  // 景：记录 id 43 是 0 图提交，但同意 / 勾选 / 取图失败三者当时
  // 都没落库，事后无法判定卡在哪一步。v5.23 之前的历史行为空
  // 串——不回填、不改写（id 43 原样保留）。
  refFetchJson: text("ref_fetch_json").notNull().default(""),
  stagedKey: text("staged_key"),
  mimeType: text("mime_type"),
  error: text("error"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ---------------------------------------------------------------------------
// v5.08 封面分析任务（异步任务制）：v5.07 带 5 张人物资产图的分析
// 是一次同步推理，时长压在网关等待上限（约 50–60 秒）边缘、成败
// 看运气（项目 39 实报两次被掐、无方案无缓存）。改任务制：点分析
// 先建一条任务行（秒回任务号），分析分两段由页面逐段驱动
// （stage=main 主方案推理 → stage=en 英文签名重译），每段结果先
// 落本表再回页面；单段请求被网关掐断时结果不丢，页面轮询
// pollCoverAnalysisJob 照样取回，刷新 / 重进页面也能凭任务号续
// 上。status: running 进行中 / done 已完成 / failed 失败；
// planJson = 主段完成后的第一步结果（CoverAnalysisResult 的
// JSON），resultJson = 全部完成后的最终结果（同形状）；
// stepStartedAt = 当前段最近一次开始执行的时刻（毫秒），同段在
// 认领窗口内重复调用直接回 running、不重复跑推理（防网关重试
// 造成同段并发双跑）。
// ---------------------------------------------------------------------------

export const coverAnalysisJobs = sqliteTable("cover_analysis_jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id")
    .notNull()
    .references(() => projects.id),
  styleId: text("style_id").notNull().default(""),
  ratio: text("ratio").notNull().default("3:4"),
  // running / done / failed
  status: text("status").notNull().default("running"),
  // main 主方案推理 / en 英文签名重译
  stage: text("stage").notNull().default("main"),
  planJson: text("plan_json").notNull().default(""),
  resultJson: text("result_json").notNull().default(""),
  error: text("error").notNull().default(""),
  stepStartedAt: integer("step_started_at"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ---------------------------------------------------------------------------
// v5.14 封面提示词草稿（聊天分析直达第三步）：封面分析改走聊天框后
// （v5.10），助手在聊天里出的中英文封面提示词此前只能靠用户手动
// 复制粘贴进第三步的提示词框。本表按（项目 + 风格）存一份草稿：
// 助手（经 saveCoverPromptDraft 动作）把提示词写进来，封面页打开
// 时读出（getCoverPromptDraft）自动填入中英文提示词框并标明来源
// 是聊天分析；用户仍可亲手改，改完以框内为准。草稿只是预填，不
// 触发任何生成——生成永远由用户在页面上亲手点。同一（项目 + 风
// 格）只留最新一份，重复保存即覆盖。
// ---------------------------------------------------------------------------

export const coverPromptDrafts = sqliteTable("cover_prompt_drafts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id")
    .notNull()
    .references(() => projects.id),
  styleId: text("style_id").notNull().default(""),
  promptZh: text("prompt_zh").notNull().default(""),
  promptEn: text("prompt_en").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ---------------------------------------------------------------------------
// v4.15 场景资产卡：审查页「生成资产提示词」按当前剧本的段落场景
// （groups.sceneName）为每个场景建一张卡，放在「人物与大纲」页的
// 「人物资产图」区域与人物卡同网格同尺寸展示。卡里存场景名、场景
// 设定说明与中英文生图提示词（服务端拼场景规范句），图片位先空，
// 出图只能由用户在卡上亲手点「生成图」走既有生图流程（生图禁令
// 不变）；生成结果可经 saveGeneratedImageToSceneAsset 存回本卡。
// 这不是 v4.03 删掉的「场景设置」：没有项目级场景配置，卡只来自
// 剧本本身，删卡不影响剧本与分镜的 sceneName。
// ---------------------------------------------------------------------------

export const sceneAssetCards = sqliteTable("scene_asset_cards", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id")
    .notNull()
    .references(() => projects.id),
  name: text("name").notNull().default(""),
  description: text("description").notNull().default(""),
  promptZh: text("prompt_zh").notNull().default(""),
  promptEn: text("prompt_en").notNull().default(""),
  imageBlobKey: text("image_blob_key"),
  imageMime: text("image_mime"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ---------------------------------------------------------------------------
// v4.25 监控账号：用户在「监控账号」页自己填的对标账号名单（平台 +
// 账号名 + 主页链接 + 备注）。只是名单本身，不含任何监控结果、作品
// 数据或登录凭证；助手侧每天按这份名单查新作品并在聊天里推送。
// ---------------------------------------------------------------------------

// v4.43 作者自定义分组：用户自己建的达人分组（如「搞笑类」
// 「剧情类」「重点盯」），服务端存储，换浏览器不丢。分组本身
// 独立成表（空分组也保留）；达人经 monitor_accounts.group_id
// 归入一个分组，null = 未分组。删分组只解绑达人，不删达人/视频。
export const monitorGroups = sqliteTable("monitor_groups", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const monitorAccounts = sqliteTable("monitor_accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  // 快手 / 抖音 / 视频号 / 小红书 / 其他
  platform: text("platform").notNull().default("快手"),
  name: text("name").notNull().default(""),
  // v4.30：达人ID（快手主页链接 /profile/<id> 里的 id，或填表时手填）。
  creatorId: text("creator_id").notNull().default(""),
  url: text("url").notNull().default(""),
  note: text("note").notNull().default(""),
  // v4.43：所属作者自定义分组（monitor_groups.id），null = 未分组。
  groupId: integer("group_id").references(() => monitorGroups.id),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// v4.30 监控视频：每个被监控账号下的视频卡片数据。字段对齐快手
// 视频详情：视频ID / 视频链接 / 描述 / 封面链接 / 视频文件链接 /
// 时长文本 / 点赞 / 播放 / 发布时间。按 published_at 倒序展示。
// v4.37 补扩展采集格式的另外 6 项：快手号 / 粉丝数 / 获赞（达人
// 累计获赞）/ 达人简介（可多行）/ 评论量 / 采集时间——随采集这
// 一条视频时的达人快照一起存本行，详情窗按粘贴原文 18 项渲染。
export const monitorVideos = sqliteTable("monitor_videos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  accountId: integer("account_id")
    .notNull()
    .references(() => monitorAccounts.id),
  videoId: text("video_id").notNull().default(""),
  videoUrl: text("video_url").notNull().default(""),
  description: text("description").notNull().default(""),
  coverUrl: text("cover_url").notNull().default(""),
  videoFileUrl: text("video_file_url").notNull().default(""),
  durationText: text("duration_text").notNull().default(""),
  likeCount: integer("like_count").notNull().default(0),
  playCount: integer("play_count").notNull().default(0),
  publishedAt: integer("published_at", { mode: "timestamp_ms" }),
  kuaishouId: text("kuaishou_id").notNull().default(""),
  fansCount: integer("fans_count").notNull().default(0),
  totalLikeCount: integer("total_like_count").notNull().default(0),
  creatorBio: text("creator_bio").notNull().default(""),
  commentCount: integer("comment_count").notNull().default(0),
  collectedAt: integer("collected_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// v4.50 监控页服务端元数据（键值）：目前只存一个键
// monitor_clear_floor_ms —— 最近一次「一键清除」的服务端时刻
// （毫秒数字串）。它是全服务端共享的清除下限：任何浏览器 / 标签
// 页的 fetchRelayIntake 过滤与监控页 feed 出参都读它，使「清除」
// 不再只活在一个页面的 localStorage 里（v4.48/v4.49 两版复活的共
// 同盲区：下限只存客户端单机状态，桥接通道与其它标签页 / 浏览器
// 完全看不见）。行不存在 = 从没清除过，下限按 0 处理。
export const monitorMeta = sqliteTable("monitor_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull().default(""),
});

// v4.54 删除墓碑（单删 / 删达人 / 一键清除「删了又回来」的根治）：
// 此前的删除只删 monitor_videos / monitor_accounts 活行，不留任何
// 「删过」记录，而自动投递（扩展桥接补推 / 中转双发第二份 / 在途
// 轮询批次）的去重只查活行——卡一删，去重即失效，同一条上报再
// 到就畅通重建（沙箱实测：单删后重投同 payload → duplicated=false
// 新卡建回；删达人后重投 → 达人 + 卡片整组重建）。墓碑把「删过
// 什么」落服务端：自动投递（fetchMonitorVideo 带 fromIntake）命
// 中墓碑按重复跳过并回执已消费；用户手动粘贴 / Excel 导入（不带
// fromIntake）命中则先清掉对应墓碑再正常建卡——手动捞回永远可
// 以，自动回流永远不行。video 墓碑按（达人链接 + 视频ID/链接）
// 定位，与活行去重同一口径；account 墓碑只由「删除达人」写入、
// 按达人链接整户拦截，一键清除不写（清除后达人仍在监控名单里、
// 新作品照常进）。
export const monitorDeletedVideos = sqliteTable("monitor_deleted_videos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  creatorUrl: text("creator_url").notNull().default(""),
  videoId: text("video_id").notNull().default(""),
  videoUrl: text("video_url").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const monitorDeletedAccounts = sqliteTable("monitor_deleted_accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  creatorUrl: text("creator_url").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// v5.55 监控 3 天留存清理的删除日志：每删一张卡写一行（视频ID /
// 标题 / 达人 / 点赞 / 播放 / 发布时间 / 删除时间 / 触发方式 /
// 本轮 run_id），监控页「清理记录」里可查。删除不可恢复，日志
// 只作备查；「无数据未判定」（点赞与播放均为 0）不写这里——它
// 不是删除，最近一轮的未判定清单存 monitor_meta
// （monitor_cleanup_last_report），每次清理覆盖刷新。
export const monitorCleanupLog = sqliteTable("monitor_cleanup_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  runId: text("run_id").notNull().default(""),
  // manual = 页面「立即清理」确认后删；auto = 打开监控页时距上
  // 次清理超 24 小时的自动清理。
  trigger: text("trigger").notNull().default("manual"),
  videoId: text("video_id").notNull().default(""),
  title: text("title").notNull().default(""),
  creatorName: text("creator_name").notNull().default(""),
  likeCount: integer("like_count").notNull().default(0),
  playCount: integer("play_count").notNull().default(0),
  publishedAt: integer("published_at", { mode: "timestamp_ms" }),
  deletedAt: integer("deleted_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ---------------------------------------------------------------------------
// v4.55 分析模仿：用户对监控页某条视频做的「爆款拆解 + 模仿方案」
// 记录。一条记录 = 一次分析，独立成表、与项目无关（同监控页口径），
// 服务端存储、换浏览器不丢。第一节「视频基础信息」从视频卡片点
// 「分析」时自动带入（标题取描述首行），也可从「分析模仿」页新建
// 空白分析后手填；like/play 以纯数字存，published_text 按卡片上的
// 「YYYY-MM-DD HH:mm」文本存（表单里可手改，不做时间解析）。
// 第二～五节是用户定的大白话模板：爆款拆解（钩子/结构/节奏/幽默
// 机制/情绪曲线）、可复刻 vs 需改写、模仿方案（保留骨架/替换方案/
// 套用模式）、一句话总结。全部纯文本，用户后续可自行调整填法。
// ---------------------------------------------------------------------------

export const videoAnalyses = sqliteTable("video_analyses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  // 一、视频基础信息
  videoId: text("video_id").notNull().default(""),
  videoUrl: text("video_url").notNull().default(""),
  title: text("title").notNull().default(""),
  creatorName: text("creator_name").notNull().default(""),
  durationText: text("duration_text").notNull().default(""),
  likeCount: integer("like_count").notNull().default(0),
  playCount: integer("play_count").notNull().default(0),
  publishedText: text("published_text").notNull().default(""),
  // 二、爆款拆解
  hook: text("hook").notNull().default(""),
  structure: text("structure").notNull().default(""),
  rhythm: text("rhythm").notNull().default(""),
  humor: text("humor").notNull().default(""),
  emotion: text("emotion").notNull().default(""),
  // 三、可复刻 vs 需改写
  reusable: text("reusable").notNull().default(""),
  mustRewrite: text("must_rewrite").notNull().default(""),
  // 四、模仿方案
  keepSkeleton: text("keep_skeleton").notNull().default(""),
  replacePlan: text("replace_plan").notNull().default(""),
  pattern: text("pattern").notNull().default(""),
  // 五、一句话总结
  summary: text("summary").notNull().default(""),
  // v4.56 AI解剖：视频文件链接（video_play_url，浏览器本地抽帧用，
  // 从监控卡片点「分析」时随第一节一并带入）与视频描述全文（标题
  // 只是描述首行，解剖需要全文 + 话题作上下文）；dissectionJson 是
  // 最近一次 AI 解剖的结构化结果（分镜表 + 资产准备清单，JSON 文
  // 本，空 = 还没解剖过）；appliedProjectId 记「一键套用」生成的
  // 剧本项目 id（null = 还没套用过）。
  videoFileUrl: text("video_file_url").notNull().default(""),
  description: text("description").notNull().default(""),
  dissectionJson: text("dissection_json").notNull().default(""),
  appliedProjectId: integer("applied_project_id"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ---------------------------------------------------------------------------
// v4.76 项目储存箱分类：用户在储存箱里管理的分类名单。默认两条
// 「暂时不用」「已使用」由 listArchiveCategories 在表为空时补种。
// 分类只是名字——项目侧只存分类名字符串（projects.archive_category），
// 改名同步改项目行，删分类把其下项目移回「暂时不用」，都不删项目。
// ---------------------------------------------------------------------------

export const projectArchiveCategories = sqliteTable(
  "project_archive_categories",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull().unique(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
);

// ---------------------------------------------------------------------------
// v4.76 批量删除前快照：批量删除项目时，每个待删项目先把整行数据
// （项目行 + 人物卡 + 场景资产卡 + 场景图 + 版本快照 + 封面记录）
// 序列化成一份 JSON 存进本表再执行删除，误删可从快照整项目恢复。
// payload 里只存图片 blob key 不存字节；批量删除路径不删这些 blob
// （留给快照恢复用），永久删除快照时才按引用计数清理。
// ---------------------------------------------------------------------------

export const projectDeleteSnapshots = sqliteTable(
  "project_delete_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    projectName: text("project_name").notNull().default(""),
    payloadJson: text("payload_json").notNull().default(""),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
);

// Legacy scene-image table (v4.03：场景设置整体删除）: no action reads
// or writes it any more; rows are only cleaned up when their project
// is deleted. Kept so existing databases keep loading.
export const sceneImages = sqliteTable("scene_images", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id")
    .notNull()
    .references(() => projects.id),
  name: text("name").notNull().default(""),
  // Scene description / note used by the per-lens scene mapping, plus the
  // original upload file name (shown as the asset source in copy text).
  description: text("description").notNull().default(""),
  fileName: text("file_name").notNull().default(""),
  imageBlobKey: text("image_blob_key").notNull(),
  imageMime: text("image_mime").notNull().default("image/jpeg"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});
