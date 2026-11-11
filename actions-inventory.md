# actions.ts 服务端动作清点（工作台 v5.69 源码）

来源：`~/workspace/github-upload/script-workbench/server/src/actions.ts`（19,183 行）
定义模式：全文件只有一个导出 `export const Actions = { … } satisfies ActionsModule`（第 6096 行起，第 19166 行结束）；每个动作都是其中一条 `动作名: defineAction({ description / request / response / handler })`。用途优先取动作自带的 `description` 字段原文，过长的截取首句。

**动作总数：171**（无重名）

| # | 动作名 | 行号 | 用途 |
|---|---|---|---|
| 1 | `listProjects` | 6097 | 列出全部剧本项目（名称、是否已有剧本、人物数、大纲状态、最近更新时间）。 |
| 2 | `createProject` | 6132 | 新建一个剧本项目，可带项目名，返回新项目 id。 |
| 3 | `getProject` | 6149 | 读取一个项目的完整详情（基础设置、人物卡、故事大纲与剧本）。 |
| 4 | `renameProject` | 6159 | 修改项目名称。 |
| 5 | `deleteProject` | 6177 | 删除一个项目及其人物卡、剧本等全部内容，不可恢复。 |
| 6 | `archiveProjects` | 6236 | 把一批项目存入储存箱（数据完整保留，工作区列表不再显示）。 |
| 7 | `unarchiveProjects` | 6267 | 把一批项目从储存箱取回工作区（分类与星级保留）。 |
| 8 | `setProjectStars` | 6289 | 给储存箱里的项目打星（0–5 星）。 |
| 9 | `setProjectArchiveCategory` | 6307 | 把一个已存入储存箱的项目移到另一个分类。 |
| 10 | `listArchiveCategories` | 6325 | 列出储存箱分类（默认「暂时不用」「已使用」，含每个分类下已存项目数）。 |
| 11 | `createArchiveCategory` | 6379 | 新建一个储存箱分类。 |
| 12 | `renameArchiveCategory` | 6412 | 给储存箱分类改名（其下项目的分类名同步更新）。 |
| 13 | `deleteArchiveCategory` | 6451 | 删除一个储存箱分类（其下项目自动移回「暂时不用」，项目不删）。 |
| 14 | `batchDeleteProjects` | 6484 | 批量删除项目：每个项目删除前先存一份完整快照（可从快照恢复），再删项目及全部关联数据。 |
| 15 | `listDeleteSnapshots` | 6584 | 列出批量删除前自动保存的项目快照（可恢复 / 可永久删除）。 |
| 16 | `restoreDeleteSnapshot` | 6616 | 把一份批量删除快照恢复成一个新项目（数据完整还原）。 |
| 17 | `deleteDeleteSnapshot` | 6731 | 永久删除一份批量删除快照（其独占的图片一并清理）。 |
| 18 | `updateSettings` | 6771 | 保存项目的基础设置（语速、剧本风格、目标时长等）。 |
| 19 | `generateOutlineDraft` | 6833 | 按当前项目的人物、模式与设置让 AI 写一版故事大纲草稿，不直接覆盖现有大纲。 |
| 20 | `generateStoryFlow` | 6942 | 按当前选中模式的训练规则与爆款公式生成一份故事大概流程草稿（一句话前提+前3秒钩子+分段流程），只返回草稿不落盘。 |
| 21 | `adoptAiOutline` | 7053 | 采用 AI 大纲草稿覆盖当前大纲，覆盖前自动备份原大纲。 |
| 22 | `restoreOutlineBackup` | 7085 | 恢复 AI 覆盖前备份的故事大纲原文。 |
| 23 | `generatePublishCopy` | 7127 | 按当前项目的剧本标题、梗概、人物与金句花字，为抖音/快手/B站/小红书/视频号/好看视频 6 个平台各生成一套发布文案（标题+简介+话题）并存入项目。 |
| 24 | `savePublishCopy` | 7309 | 保存用户手动修改过的 6 平台发布文案到项目。 |
| 25 | `checkOutlineOverlap` | 7357 | 计算当前大纲与所选模式训练视频的重合率，并列出重合片段。 |
| 26 | `writeOutlineCharacterPrompts` | 7545 | 按大纲角色位为每个人物写中英文生图提示词，供用户预览确认。 |
| 27 | `confirmOutlineCharacterPrompts` | 7631 | 把确认后的人物生图提示词预填到对应人物卡上。 |
| 28 | `generateScriptAssetPrompts` | 7712 | 按当前剧本的人物与场景设定生成人物和场景的资产图提示词，供用户预览确认。 |
| 29 | `applyScriptAssetPrompts` | 7913 | 把确认后的人物与场景资产提示词落到人物卡和场景资产卡上。 |
| 30 | `generateStoryboardAssetPrompts` | 8065 | 按已确认的分镜归并去重出唯一人物与场景，为每个人物和场景写一份资产图提示词，供用户预览确认。 |
| 31 | `applyStoryboardAssetPrompts` | 8332 | 把确认后的分镜资产提示词落卡：同名卡已存在的跳过，只为新人物和新场景建卡。 |
| 32 | `updateSceneAsset` | 8455 | 修改一张场景资产卡的名字、设定说明和生图提示词。 |
| 33 | `upsertSceneAssetDescription` | 8495 | 按场景名补写场景设定说明：有同名场景资产卡就更新说明，没有就新建一张只带说明的卡。 |
| 34 | `deleteSceneAsset` | 8544 | 删除一张场景资产卡。 |
| 35 | `uploadImageChunk` | 8573 | 上传一张人物资产图的一个分片（大图分片上传用）。 |
| 36 | `discardImageChunks` | 8602 | 丢弃一次未完成分片上传的全部暂存分片。 |
| 37 | `addCharacter` | 8617 | 给项目新增一张人物卡，可同时带一张人物图片。 |
| 38 | `addCharacterChunked` | 8688 | 用已收齐的分片拼成整图，给项目新增一张带图的人物卡。 |
| 39 | `updateCharacter` | 8783 | 修改人物卡的名字、备注和生图提示词等字段。 |
| 40 | `setCharacterImage` | 8842 | 给人物卡设置或更换资产图。 |
| 41 | `setCharacterImageChunked` | 8883 | 用分片拼出的整图给人物卡设置或更换资产图，可同时记下图来自哪张储存库卡。 |
| 42 | `backfillPresetSourcesByImage` | 8962 | 按图片字节（SHA-256）给项目里还没有来源记录的人物补记它来自哪张储存库卡，逐人回证据，认不出的留空。 |
| 43 | `deleteCharacter` | 9105 | 删除一张人物卡及其资产图。 |
| 44 | `analyzeCharacter` | 9136 | 用 AI 看人物图，生成外貌与造型描述建议供采用。 |
| 45 | `adoptCharacterAnalysis` | 9222 | 把人物图分析结果采用进人物卡备注。 |
| 46 | `analyzePresetAppearance` | 9268 | 用 AI 看储存库人物卡图片，填写其外貌字段。 |
| 47 | `generateScriptPlan` | 9448 | 按大纲与基础设置生成全剧节拍规划，是分段生成剧本的第一步。 |
| 48 | `generateScriptSegment` | 9546 | 按节拍规划生成剧本的某一段正文。 |
| 49 | `autoDesignNewCharacters` | 9639 | 生成剧本后把新出现的人物自动设计并记入：有台词的进正式人物表并建卡，无台词的记为群演。 |
| 50 | `saveScript` | 9987 | 把整份剧本（台词修改、阶段与分镜数据）保存到项目。 |
| 51 | `validateScript` | 10110 | 校验剧本结构与时长，返回问题清单。 |
| 52 | `runStrictAudit` | 10180 | 对剧本跑严格审查规则门禁，返回不通过项。 |
| 53 | `runViralAudit` | 10328 | 对剧本跑爆款基因审查，给出与所选模式基因卡的对照结论。 |
| 54 | `rewriteScriptForViral` | 10490 | 按爆款审查结论让 AI 重写剧本。 |
| 55 | `confirmStoryboard` | 10641 | 确认台词并生成分镜（把剧本切成镜头并计算时长）。 |
| 56 | `purgeAllVersionSnapshots` | 10859 | 删除全部项目的自动版本快照（清空 project_versions），返回删掉的份数。 |
| 57 | `importProject` | 10876 | 导入一份项目 JSON，新建为一个项目。 |
| 58 | `listAssetPresets` | 10994 | 列出人物资产储存库的全部卡片、图片与分类。 |
| 59 | `createAssetCategory` | 11031 | 在人物资产储存库新建一个分类。 |
| 60 | `renameAssetCategory` | 11048 | 重命名储存库分类，其下卡片归属同步更新。 |
| 61 | `deleteAssetCategory` | 11070 | 删除储存库分类，其下卡片改归未分类。 |
| 62 | `saveAssetPreset` | 11087 | 新建或更新一张储存库人物卡（外貌字段与卡面信息）。 |
| 63 | `applyAssetClassifications` | 11186 | 把 v5.50 系统分类表按卡名（A–R）写入储存库各卡的性别 / 年龄组 / 存疑 / 判断依据四字段，只改这四项。 |
| 64 | `deleteAssetPreset` | 11240 | 删除一张储存库人物卡及其图片。 |
| 65 | `addAssetPresetImages` | 11270 | 给储存库人物卡添加图片。 |
| 66 | `addAssetPresetImagesChunked` | 11320 | 用分片拼图给储存库人物卡添加图片。 |
| 67 | `deleteAssetPresetImage` | 11375 | 删除储存库人物卡上的一张图片；删的是主体图时下一张接任主体、卡片造型跟新主体走，删到一张不剩时卡片造型文字保留；图片 blob 只在无其他引用时才清。 |
| 68 | `setAssetPresetImagePrimary` | 11458 | 把储存库人物卡的某张图片设为主图（主体图）：卡片造型同步换成这张图的造型，音色与语气基调不动；新主体图还没有造型时沿用卡片现有造型。 |
| 69 | `importProjectCharactersToLibrary` | 11543 | 把某个项目的人物卡批量导入人物资产储存库。 |
| 70 | `planSyncCharacterToLibrary` | 11635 | 预览一张人物卡同步到储存库的方案（新建还是更新哪张卡）。 |
| 71 | `syncCharacterToLibrary` | 11742 | 按预览方案把一张人物卡同步到储存库。 |
| 72 | `sendPresetToScript` | 11910 | 把储存库人物卡发布到某个项目的人物列表。 |
| 73 | `listModes` | 12024 | 列出 5 个模式及各自的训练进度、稳定度与当前基因卡摘要。 |
| 74 | `listModeSummaries` | 12042 | 列出 5 个模式的轻量摘要（名称、状态、进度、稳定度、基因标签），供模式选择卡片与模式名展示使用；不含基因卡全文与训练记录。 |
| 75 | `updateModeCoreLogic` | 12061 | 保存某个模式的底层逻辑文本。 |
| 76 | `listModeSuggestions` | 12084 | 读取某个模式的全部优化建议（按时间倒序）。 |
| 77 | `addModeSuggestion` | 12108 | 给某个模式新增一条优化建议。 |
| 78 | `deleteModeSuggestion` | 12127 | 删除某个模式下的一条优化建议。 |
| 79 | `listMonitorAccounts` | 12145 | 读取监控账号名单（按添加顺序）。 |
| 80 | `addMonitorAccount` | 12170 | 往监控账号名单里新增一个账号（平台、账号名、主页链接、备注）。 |
| 81 | `updateMonitorAccount` | 12223 | 修改监控名单里一个账号的平台、账号名、主页链接或备注。 |
| 82 | `deleteMonitorAccount` | 12268 | 从监控名单里删除一个账号及其全部视频卡片（删了就不再监控它），并留删除墓碑：达人墓碑拦该达人此后全部自动投递，其每张卡另留视频墓碑；用户手动粘贴该达人视频回来则整户解除。名下卡片对应的云端视频文件同步删除（v4.64）。 |
| 83 | `listMonitorFeed` | 12307 | 读取监控页全部数据：账号分组及每个账号下按发布时间倒序的视频卡片，外加作者自定义分组列表与服务端清除下限（clearedAtMs，0=从未清除）。 |
| 84 | `fetchMonitorVideo` | 12379 | 把一条快手视频原始信息（18 项：原 12 项 + 快手号/粉丝数/获赞/达人简介/评论量/采集时间）整理成视频卡片存下（按达人主页归入账号、同一视频不重复存）。 |
| 85 | `refreshMonitorVideoLinks` | 12606 | 按视频ID精确匹配一张已有的监控视频卡片，只更新它的链接字段（视频文件链接 / 封面链接 / 视频链接，传了且不同才写），其他字段一律不动、不建新卡。 |
| 86 | `deleteMonitorVideo` | 12658 | 删除监控页里的一张视频卡片（只删这条卡片，账号和其他卡片不动），并留一条删除墓碑：同一条视频的自动上报再到也不会把卡建回来，用户手动粘贴回来则自动解除墓碑。 |
| 87 | `createMonitorGroup` | 12698 | 新建一个作者自定义分组（监控页「按作者分组」用），返回新分组 id。 |
| 88 | `renameMonitorGroup` | 12729 | 给一个作者自定义分组改名（组内达人的归属不变）。 |
| 89 | `deleteMonitorGroup` | 12754 | 删除一个作者自定义分组：组内达人回到未分组，达人与视频卡片都不删。 |
| 90 | `setMonitorAccountGroup` | 12772 | 把一个监控达人归入某个作者自定义分组（groupId 为 null = 移到未分组）。 |
| 91 | `clearMonitorVideos` | 12799 | 一键清除监控页全部视频卡片：只删视频，达人名单与作者分组设置保留；同时把清除时刻写入服务端共享下限（monitor_meta），供所有标签页/浏览器的中转过滤与桥接拦截共用，并给每张被清的卡留删除墓碑（同一视频的自动上报再到也不重建，手动粘贴回来可解除）。 |
| 92 | `getMonitorCleanupStatus` | 12853 | 读取监控页 3 天留存清理的状态（上次清理时间、下次预计时间、删除日志、最近一轮无数据未判定清单）；打开监控页时若距上次清理已超 24 小时，本次调用会先自动执行一轮清理（发布超 3 天且点赞<1000、播放<50000 的卡片删除并同步删云端，0/0 无数据的不删）再返回状态，autoRan 标明本轮是否自动跑过。 |
| 93 | `previewMonitorCleanup` | 12961 | 预览监控页 3 天留存清理：按现行口径（发布超 3 天、publishedAt 为空按入库时间；点赞<1000 且播放<50000 才删；任一达标留；点赞播放均为 0 的进无数据未判定不删）算出将删清单与未判定清单，只读不删不写。 |
| 94 | `runMonitorCleanup` | 12981 | 执行监控页 3 天留存清理（手动）：服务端重新判定后删除符合条件的卡片（发布超 3 天且点赞<1000、播放<50000），逐卡写删除日志并同步删除云端文件；点赞播放均为 0 的不删、回未判定清单。删除不可恢复。 |
| 95 | `getCloudStorage` | 13006 | 读取云端视频存储状态（对应 brief 的 GET /api/cloud-storage）：used_bytes = video-cloud/state.json 里 downloaded 各项 size 累加，quota_bytes 固定 8GB（8589934592），video_count = downloaded 条目数；云端目录或 state.json 缺失时按 0 容错返回。 |
| 96 | `getCloudVideo` | 13027 | 取一条视频的云端播放地址（对应 brief 的 GET /api/cloud-video/:videoId）：云端（~/workspace/video-cloud/videos/{videoId}.mp4）有这个文件时，把它同步进本站 blob 并回同源播放地址 url（可拖进度条），exists=true；没有文件回 exists=false（404 口径），播放器据此回退快手原直链。 |
| 97 | `saveCloudVideo` | 13136 | 把一条监控视频手动存到云端（对应 brief 的 POST /api/cloud-save，body {videoId, url}，url 是卡片当前的 video_play_url）：服务端经特权层直接下载 url 到 ~/workspace/video-cloud/videos/{videoId}.mp4（超时 60 秒、单文件上限 500MB），再以文件锁 + 锁内重读合并 + 原子写更新 state.json 的 downloaded[videoId] = {file, size, at}，不覆盖定时任务同时写入的数据。 |
| 98 | `detectCloudScenes` | 13205 | 对一条已存云端的视频做内容感知场景切分（v4.75）：服务端对 ~/workspace/video-cloud/videos/{videoId}.mp4 跑场景检测（优先 PySceneDetect 的 ContentDetector，没装时回落 ffmpeg 内置 scene 评分），回切分点秒数数组与总时长，供 AI 解剖第 2 步把切分点当节拍窗边界（替代均匀时间窗）。 |
| 99 | `listCloudSavedVideos` | 13248 | 列出云端已存的视频清单（video-cloud/state.json 的 downloaded 全部条目：videoId / 文件名 / 字节数 / 存入时刻 at 原文）：卡片据此显示「已存云端」状态（下次打开保持），「云端已存」视图据此过滤并按 at 倒序排列。 |
| 100 | `enqueueCloudVideos` | 13272 | 把批量勾选的监控视频加入云端后台下载队列（v4.67）：只把条目写入 ~/workspace/video-cloud/queue.json 并确保后台下载进程在跑就立刻返回，下载由后台进程以 3 并发逐个完成（单个超时 60 秒、500MB 上限；403 链接过期直接记失败不重试、提示重新采集；网络超时/中断自动重试 1 次），前端不用等。 |
| 101 | `getCloudQueueStatus` | 13323 | 读取云端后台下载队列状态（queue.json 最新批次）：总数 / 已完成 / 成功 / 失败 / 是否还在跑 / 每条的状态（queued 排队中、downloading 存入中、success 成功、failed 失败+原因）。 |
| 102 | `retryCloudQueueFailed` | 13393 | 重试云端后台队列里的失败条目（v4.69）：按队列条目 id 只把 failed 的重置回排队中、由后台进程重新下载，已成功的条目不重复下；itemIds 传空数组 = 重试本批全部失败条目。 |
| 103 | `getDissectQueue` | 13422 | 读取「待解剖队列」（v4.88）：监控页点「发送到聊天解剖」排队的视频，服务端存 monitor_meta、刷新不丢；每条带实时判定的已解剖状态与对应分析记录 / 已套用项目 id（聊天解剖存了记录才算已解剖，查不到不报错）。 |
| 104 | `addDissectQueueItem` | 13433 | 把一条视频加入「待解剖队列」（v4.88）：同 videoId 已在队列里不重复入队、只回 added=false；队列存服务端 monitor_meta，刷新不丢。 |
| 105 | `removeDissectQueueItem` | 13472 | 把一条视频移出「待解剖队列」（v4.88）：只删队列条目，不动监控卡片、分析记录与已套用项目。 |
| 106 | `listVideoAnalyses` | 13494 | 列出全部「分析模仿」记录（最近改过的排最前），供分析模仿页的记录列表展示。 |
| 107 | `saveVideoAnalysis` | 13537 | 保存一条「分析模仿」记录：不带 id = 新建，带 id = 覆盖更新那一条。全部字段都是用户在分析表单里填的大白话文本，原样存。 |
| 108 | `pingDissectAi` | 13652 | AI 解剖预检：发一次极小的推理确认 AI 服务连通，不产出解剖内容、不消耗解剖配额。 |
| 109 | `startCloudTranscription` | 13687 | AI解剖转写层（云端·启动）：对已存云端的视频启动本地 Whisper 后台转写任务，立刻回任务号；结果用 pollTranscription 轮询取（转写在后台跑，不受单次请求时限限制）。 |
| 110 | `startUploadedTranscription` | 13716 | AI解剖转写层（上传音频·启动）：拼回浏览器分片上传的 16kHz 单声道 WAV 并启动本地 Whisper 后台转写任务，立刻回任务号；结果用 pollTranscription 轮询取。 |
| 111 | `pollTranscription` | 13755 | AI解剖转写层（轮询）：查后台转写任务状态；done 时回逐句台词 + 0.1 秒时间戳 + 声线簇 + 置信度，running 时只回状态。 |
| 112 | `dissectTextPlan` | 13795 | AI解剖纯文本回落规划：拿不到音频时按标题与描述定镜头划分（每镜起止秒 + 一句话梗概）与全片梗概，供融合层估计模式使用。 |
| 113 | `dissectFuseWindow` | 13895 | AI解剖融合层：一个时间窗内把 ASR 台词与关键帧融合——给镜头写标题/场景/景别/机位、给每句台词配画面与情绪、把声线簇对位到人物代号；台词原文不经模型改动。 |
| 114 | `dissectFinalizeAssets` | 14146 | AI解剖输出层资产定稿：给代码已筛定的 2~4 位主角与全部场景写资产提示词、按硬标准收关键道具，补全片梗概与生成备注。 |
| 115 | `applyDissection` | 14372 | 把 AI 解剖结果一键套用为新剧本项目（分镜阶段）并按资产清单建人物卡与场景卡。 |
| 116 | `deleteVideoAnalysis` | 14572 | 删除一条「分析模仿」记录（只删这一条分析，监控页的视频卡片不受影响）。 |
| 117 | `seedMonitorSampleData` | 14586 | 幂等写入用户提供的参考视频（快手达人「幻熊」《当你是亿万富翁！》）作为监控页的第一张卡片，已存在则不重复写。 |
| 118 | `fetchRelayIntake` | 14675 | 经服务端代理拉取跨浏览器中转里的新上报（服务端内置中转地址与密钥，前端不直连中转；v4.49 起在服务端把 reportedAt 归一化为数字时间戳做数值过滤，被拦的旧上报连原因一并返回；v4.50 起过滤下限取客户端 since 与服务端共享清除下限的较大者）。 |
| 119 | `forwardRefreshToRelay` | 14850 | 把一次「刷新链接」写回成功的新链接转发到跨浏览器中转（同协议 POST /report），让只读中转的 cron 下载器下一轮拿到新链接、不再对旧过期链接反复 403。只转发不写库；失败只回原因供前端打日志。 |
| 120 | `testRelayConnection` | 14939 | 经服务端代理测试中转连通性（ping 免密钥 + intake 带密钥两步），返回每步结果供监控页展示。 |
| 121 | `selectProjectMode` | 15006 | 给当前项目选择一个模式。 |
| 122 | `submitModeTraining` | 15025 | 提交一个训练视频给某个模式分析，生成或更新爆款基因卡。 |
| 123 | `updateStyleCard` | 15235 | 修改一张爆款基因卡的风格字段与权重。 |
| 124 | `confirmStyleCard` | 15282 | 确认或否定一张待确认的爆款基因卡。 |
| 125 | `undoModeTraining` | 15314 | 撤销一次模式训练，回滚基因卡、进度与稳定度。 |
| 126 | `resetMode` | 15360 | 重置一个模式，清空其基因卡与训练记录。 |
| 127 | `geeknowImageModels` | 15393 | 查询 Geeknow 线路可用的生图模型列表。 |
| 128 | `optimizeImagePrompt` | 15433 | 用 AI 优化一段生图提示词。 |
| 129 | `generateGeeknowImage` | 15531 | 同步提交 Geeknow 生图并等待出图，只在用户点生成时调用。 |
| 130 | `submitGeeknowImageTask` | 15626 | 提交一个 Geeknow 异步生图任务并返回任务号，只在用户点生成时调用。 |
| 131 | `pollGeeknowImageTask` | 15779 | 按任务号查询 Geeknow 生图进度，出图后暂存图片。 |
| 132 | `probeGeeknowAuth` | 15875 | 检测 Geeknow 凭证是否可用，只验通断、不生图。 |
| 133 | `createImageGenRecord` | 15929 | 新建一条生图记录（提交成功后立刻落库）。 |
| 134 | `listImageGenRecords` | 16001 | 列出生图记录，可按项目筛选。 |
| 135 | `updateImageGenRecord` | 16029 | 更新一条生图记录的状态、暂存图与保存目标。 |
| 136 | `deleteImageGenRecord` | 16082 | 删除一条生图记录，不动已保存到卡上的图。 |
| 137 | `analyzeScriptForCover` | 16134 | 分析项目剧本，生成封面方案（只定人物站位、标题位置、标题风格）与中英文提示词。 |
| 138 | `translateCoverSignature` | 16171 | 封面分析第二步：把方案的站位、标题位置、标题风格重译成英文并重拼中英文提示词。 |
| 139 | `startCoverAnalysisJob` | 16206 | 封面分析任务（启动）：建一条分析任务并立刻回任务号，不跑推理；分析由 runCoverAnalysisJobStep 逐段推进、pollCoverAnalysisJob 轮询取结果。 |
| 140 | `runCoverAnalysisJobStep` | 16242 | 封面分析任务（推进一段）：执行任务当前段的推理并把结果落库后返回任务最新状态；同段已在认领窗口内执行时直接回 running，不重复跑推理。 |
| 141 | `pollCoverAnalysisJob` | 16393 | 封面分析任务（轮询）：只读任务行回当前状态，完成时带最终分析结果（与同步分析同形状）；不跑任何推理、不提交生图。 |
| 142 | `saveCharPending` | 16464 | 人物待确认草稿深存：只改项目 scriptJson 的 charPending 里某一个人的记录（分析/手改的待确认值），其余字段原样不动；record 为 null 表示清掉该人的待确认记录。 |
| 143 | `startCharAnalysisJob` | 16530 | 人物 AI 分析任务（启动）：在既有封面分析任务表里建一条带 char-analysis 标记的单人物分析任务并立刻回任务号，不跑推理；分析由 runCharAnalysisJobStep 推进、pollCharAnalysisJob 轮询取结果。 |
| 144 | `runCharAnalysisJobStep` | 16565 | 人物 AI 分析任务（推进）：执行任务的那一次推理（造型按人物图、音色与语气基调按台词与身份推断；v5.44 带图时先按图中可见综合特征判读性别、音色随判读对齐并经服务端性别校验拦截；v5.46 完整性关：首轮缺项自动补跑一次只补缺项、补跑产出复用同一套性别校验，仍缺的字段随结果点名回页面）并把结果落库后返回任务最新状态；认领窗口内重复推进直接回 running，不重复跑推理。 |
| 145 | `pollCharAnalysisJob` | 16713 | 人物 AI 分析任务（轮询）：只读任务行回当前状态，完成时带三字段分析结果（造型 / 音色 / 语气基调 + 是否带图 + v5.44 性别判读与拦截标记 + v5.46 完整性三件：是否补跑过 / 补跑补上的字段 / 仍缺的字段，只供回执、永不回填性别字段）；不跑任何推理、不写人物数据、不提交生图。 |
| 146 | `startPresetAnalysisJob` | 16794 | 储存库卡 AI 分析任务（启动）：在既有封面分析任务表里建一条带 preset-char-analysis 标记的单卡分析任务并立刻回任务号，不跑推理；分析由 runPresetAnalysisJobStep 推进、pollPresetAnalysisJob 轮询取结果。 |
| 147 | `runPresetAnalysisJobStep` | 16844 | 储存库卡 AI 分析任务（推进）：执行任务的那一次推理（造型按卡的主图、音色与语气基调按图加备注里的身份/年龄/分类推断，卡无台词；性别判读与拦截、完整性关与一次补跑与分镜页人物分析同口径）并把结果落库后返回任务最新状态；认领窗口内重复推进直接回 running，不重复跑推理。 |
| 148 | `pollPresetAnalysisJob` | 16986 | 储存库卡 AI 分析任务（轮询）：只读任务行回当前状态，完成时带三字段分析结果（造型 / 音色 / 语气基调 + 是否带图 + 性别判读与拦截标记 + 完整性三件，只供回执、永不回填性别字段）；不跑任何推理、不写卡片数据、不提交生图。 |
| 149 | `savePresetPending` | 17054 | 储存库卡待确认草稿深存：只改写一张卡的 AI 分析待确认值（造型/音色/语气基调 + 每字段来源 + 任务号 + 时间），其余字段原样不动；record 为 null 表示清掉待确认值（确认前留底保留）。 |
| 150 | `confirmPresetPending` | 17117 | 储存库卡待确认转正：把指定字段（或全部）的 AI 待确认值写进卡片备注的已存段，确认前先把已存值留底一份供恢复；restore=true 时把留底的确认前已存值写回。永不写性别字段。 |
| 151 | `startPresetImageLookJob` | 17268 | 单图造型分析任务（启动）：给储存库某张卡的某一张图建一条只分析造型的任务并回任务号，不跑推理；由 runPresetImageLookJobStep 推进、pollPresetImageLookJob 轮询。 |
| 152 | `runPresetImageLookJobStep` | 17315 | 单图造型分析任务（推进）：执行那一次只看这张图的造型推理并把结果落库后返回；认领窗口内重复推进直接回 running。结果只是这张图的待确认建议值，不写已存造型、不动卡片其他字段。 |
| 153 | `pollPresetImageLookJob` | 17424 | 单图造型分析任务（轮询）：只读任务行回当前状态，完成时带这张图的造型分析结果（只供回执与待确认回填）；不跑推理、不写任何数据。 |
| 154 | `savePresetImagePending` | 17461 | 单图造型待确认深存：只改写某张卡某一张图的待确认造型（值 + 任务号 + 时间），已存造型与卡片其他字段原样不动；record 为 null 表示清掉这张图的待确认值（确认前留底保留）。 |
| 155 | `confirmPresetImagePending` | 17504 | 单图造型待确认转正：把某一张图的待确认造型写进这张图的已存造型，确认前先把已存造型留底一份供恢复；这张图是主体图时卡片造型段同步换成新造型，不是主体图时卡片造型不动。 |
| 156 | `saveCoverPromptDraft` | 17613 | 保存封面提示词草稿：按项目 + 风格存中英文两份（聊天分析出的提示词直达封面页第三步，同键覆盖）；只存文本，不触发生成。 |
| 157 | `getCoverPromptDraft` | 17667 | 读取封面提示词草稿：按项目 + 风格回中英文提示词与保存时间；没有草稿时 found=false。只读，不触发生成。 |
| 158 | `createCoverRecord` | 17704 | 新建一条封面生成记录。 |
| 159 | `listCoverRecords` | 17786 | 列出某个项目的封面生成记录。 |
| 160 | `updateCoverRecord` | 17804 | 更新一条封面记录的状态与暂存图。 |
| 161 | `deleteCoverRecord` | 17839 | 删除一条封面生成记录。 |
| 162 | `saveImagePreview` | 17859 | 把一张图片暂存为预览图供页面展示。 |
| 163 | `saveGeneratedImageToPreset` | 17942 | 把生成好的图片保存到储存库人物卡上。 |
| 164 | `saveGeneratedImageToCharacter` | 17983 | 把生成好的图片保存到项目人物卡上。 |
| 165 | `saveGeneratedImageToSceneAsset` | 18023 | 把生成好的图片保存到项目场景资产卡上。 |
| 166 | `exportBackupManifest` | 18066 | 导出备份清单（项目、储存库、模式与生图记录的索引）。 |
| 167 | `getBackupTargetInfo` | 18376 | 查询备份导入目标的现有数据概况。 |
| 168 | `importBackupLibrary` | 18407 | 从备份导入人物资产储存库（分类、卡片与图片）。 |
| 169 | `importBackupProjects` | 18569 | 从备份导入剧本项目。 |
| 170 | `importBackupModes` | 18810 | 从备份导入模式与基因卡数据。 |
| 171 | `importBackupImageGenRecords` | 19027 | 从备份导入生图记录。 |

## 非动作导出 / 顶层辅助（不超过 10 条）

全文件唯一的 `export` 语句就是 `export const Actions` 本身（第 6096 行）；其余均为文件内部辅助函数／常量（不导出），代表性如下：

| 名称 | 行号 | 说明 |
|---|---|---|
| `makeAndStorePreviewFromBytes` | 1035 | 由字节生成预览图并存 blob（供生图／导入链路复用） |
| `assembleChunkedImage` | 1051 | 把分片上传暂存的各片拼回完整图片字节 |
| `MODE_SEEDS` | 3386 | 5 个模式的种子定义（模式 1–5） |
| `ensureModes` | 3589 | 确保 5 个模式行已落库（不存在则建） |
| `loadModeSummary` | 3706 | 读单个模式的摘要（进度／稳定度／基因标签） |
| `runCoverAnalysisMain` | 4713 | 封面分析的核心推理实现（供 start/run 动作调用） |
| `runCharAnalysisMain` | 5224 | 人物 AI 分析的核心推理实现 |
| `runPresetAnalysisMain` | 5626 | 储存库卡 AI 分析的核心推理实现 |
| `runPresetImageLookMain` | 5969 | 单图造型分析的核心推理实现 |
| `geeknowSizeFor` | 19171 | 按比例＋质量档换算 Geeknow 生图尺寸（文件末尾、Actions 对象之外） |

注：文件内顶层 `function` 共约 112 个（含上述），其余为 zod 校验结构、常量与小工具函数，未逐一列出。
