// ---------------------------------------------------------------------------
// Privileged handlers — Geeknow（GeekAI）图片中转调用（v3.58 生图悬浮窗）。
//
// 为什么走特权层：生图调用由内嵌 Python 小程序发往 Geeknow，
// Key 不经过动作层落库、不进日志。P4 起不再走 Muse 平台的
// dynamic_credentials 代理凭证（exe 环境里不存在）：Key 按
// “动作入参 apiKey/apiBase > 请求头（工作台「生图接口总设置」）
// > 环境变量 GEEKNOW_API_KEY/GEEKNOW_API_BASE”的顺序解析后由
// handler 放进当次 payload，Python 侧有 Key 走 Bearer 头，没 Key
// 明确报错、绝不静默用假 Key。
//
// 实际请求由一个内嵌的 Python 小程序完成（与连接器 helper 同一条
// 凭证路径）：
//   - models：GET /v1/models，只回图片类模型 id（只读、不花钱）。
//   - generate：POST /v1/images/generations（OpenAI 兼容口径），
//     优先取 b64_json；只回 url 时在下载超时内把图片字节取回。
//     失败按用户设定的重试次数重试（4xx 鉴权 / 参数错误不重试，
//     直接把服务商的错误原文带回去，不编造原因）。
// 结果只通过 stdout 的一行 RESULT_JSON: 回传，图片以 base64 交回
// 动作层存入 ctx.blobs；stderr 只用于失败时截取尾部说明，不含凭证
// （请求头里的代理值不会被打印）。
// ---------------------------------------------------------------------------

import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { resolveDataDir } from "./db";
import { pythonHelperEnv, resolvePython } from "./python-runtime";
import {
definePrivilegedContracts,
definePrivilegedHandlers,
z,
} from "./local-sdk";
import { resolveGeeknowCredentials } from "./geeknow";

export const privileged = definePrivilegedContracts({
  geeknowListImageModels: {
    request: z.object({}),
    response: z.object({
      ok: z.boolean(),
      models: z.array(z.string()),
      error: z.string().nullable(),
    }),
    timeoutMs: 120_000,
  },
  geeknowGenerateImage: {
    request: z.object({
      model: z.string().min(1).max(120),
      prompt: z.string().min(1).max(8000),
      quality: z.string().min(1).max(40),
      size: z.string().min(3).max(40),
      requestTimeoutSec: z.number().int().min(10).max(600),
      downloadTimeoutSec: z.number().int().min(10).max(600),
      retryCount: z.number().int().min(0).max(10),
      referenceImages: z
        .array(
          z.object({
            dataBase64: z.string().min(1).max(20_000_000),
            mimeType: z.string().min(1).max(100),
          }),
        )
        .max(16),
    }),
    response: z.object({
      ok: z.boolean(),
      imageBase64: z.string().nullable(),
      mimeType: z.string().nullable(),
      error: z.string().nullable(),
      // v3.64：同一次调用顺带生成的 JPEG 预览（v5.57 起 ≤480px /
      // quality 68，原图不动）；
      // 预览生成失败时为 null，调用方回落到原图，不算生成失败。
      previewBase64: z.string().nullable(),
    }),
    timeoutMs: 1_800_000,
  },
  // v3.60 异步生图：同步等图会被守护进程 30 秒上限掐断，改成先提交
  // 拿任务号（几秒返回）、再用短调用轮询。提交本身绝不自动重试，
  // 避免重复提交重复计费；重试只发生在轮询（只读查询，不计费）。
  // v4.22 参考图通道恢复（用户明确要求、推翻 v4.05 停用）：异步端
  // 点的 image 字段只收 http(s) 链接（data: Base64 会被 400 拒）；
  // 带 referenceImages 的提交先在特权层把降采样副本换成 https 链
  // 接再提交。v5.97 起换链接走 host_reference_images 双路线：主
  // 路线 Geeknow 自家上传（presign + PUT，v5.97 沙箱实测通），回
  // 退 uguu.se 公开图床。本层收到的参考图即视为已同意发送；托管
  // 失败整单失败并写清原因，不静默丢图。同步 generate 契约把参
  // 考图以 data: 直传 Geeknow 本站接口不变。
  geeknowSubmitImageTask: {
    request: z.object({
      model: z.string().min(1).max(120),
      prompt: z.string().min(1).max(8000),
      quality: z.string().min(1).max(40),
      size: z.string().min(3).max(40),
      requestTimeoutSec: z.number().int().min(10).max(600),
      downloadTimeoutSec: z.number().int().min(10).max(600),
      retryCount: z.number().int().min(0).max(10),
      referenceImages: z
        .array(
          z.object({
            // v5.04：上限放宽到 100M 字符——中转分片拼回的原图整
            // 张透传到本层（本地进程间调用，不走动作网关），到手
            // 立刻由 host_reference_images 的 PIL 阶梯压成 ≤2.5MB
            // 的托管副本，不落库、不进任何记录。
            dataBase64: z.string().min(1).max(100_000_000),
            mimeType: z.string().min(1).max(100),
          }),
        )
        .max(16),
      // v5.95：参考图已在上一步（geeknowHostReferenceImages）换好
      // 的托管链接——带它进来时提交一步不再现传图床，只剩一次
      // Geeknow 调用，稳在守护进程 30 秒预算内。与 referenceImages
      // 二选一（链接优先）；都不带 = 纯文字提交。
      referenceImageUrls: z
        .array(z.string().min(1).max(2000))
        .max(16)
        .optional(),
      // v3.83 提交设置：用户自填 Key / API 地址（可空）。Key 只经
      // 本契约透传到助手进程用于当次请求头，绝不落库、不进日志
      // 与任何返回字段；为空时再按请求头（总设置）> 环境变量的
      // 顺序取 Key，仍没有则明确报“未填 Geeknow Key”。
      apiKey: z.string().min(1).max(400).optional(),
      apiBase: z.string().min(1).max(300).optional(),
    }),
    response: z.object({
      ok: z.boolean(),
      taskId: z.string().nullable(),
      imageBase64: z.string().nullable(),
      mimeType: z.string().nullable(),
      error: z.string().nullable(),
      previewBase64: z.string().nullable(),
      // v5.16：本次提交实际带上的参考图托管链接（提交顺序；v5.97
      // 起可能是 Geeknow 自家 r2.geeknow.ai 链接或 uguu.se 回退链
      // 接）——只在提交成功时随回执带回供封面记录算哈希自证「带
      // 了哪几张图」；链接本身不落库（记录只存 SHA-256 哈希），
      // 失败 / 无参考图时为空数组。
      refImageUrls: z.array(z.string()),
      // v5.97：内联图兜底路径这次实际走的托管路线（geeknow /
      // uguu）；走预托管链接或无参考图时为 null。
      hostRoute: z.string().nullable(),
      // v5.95：失败出在哪一步——host_timeout / host_error（图床托
      // 管步，没提交不计费）/ submit_timeout（已发出、建没建不确
      // 定）/ submit_unreachable（没连上、确定没建）/ auth / http /
      // submit_error；成功时为 null。供上层把报错写成大白话并说
      // 清能不能直接重试。authFailed 保留 v3.84 起的鉴权标记。
      stage: z.string().nullable(),
      authFailed: z.boolean(),
    }),
    timeoutMs: 120_000,
  },
  // v5.95 参考图托管独立一步（v5.97 改主路线）：把参考图降采样
  // 副本逐张换成 https 链接，只换链接——不建任务、不计费。与提
  // 交拆开后各自独占守护进程 30 秒预算：托管整步共用 24 秒截止。
  // v5.97 主路线改走 Geeknow 自家上传（POST /api/upload/presign
  // 拿预签名地址 → PUT 字节 → public_url，r2.geeknow.ai），自家
  // 上传走不通才自动回退 uguu.se 公开图床；两条都失败才报错。
  // 鉴权与 submit 同口径（apiKey / apiBase 可选透传）。回执带
  // route（geeknow / uguu）写明实际走的路线。链接只随回执返回
  // 供紧接着的提交使用，不落库（记录只存哈希，与 v5.16 同口
  // 径）。失败整步失败、写清哪张图卡在哪一步，绝不部分成功
  // （少一张图提交出去就是静默丢图）。
  geeknowHostReferenceImages: {
    request: z.object({
      referenceImages: z
        .array(
          z.object({
            dataBase64: z.string().min(1).max(100_000_000),
            mimeType: z.string().min(1).max(100),
          }),
        )
        .min(1)
        .max(16),
      // v5.97：与 submit 相同的可选自填 Key / API 地址——presign
      // 自家上传要带同一套鉴权才走得通；为空走已连接凭证。
      apiKey: z.string().min(1).max(400).optional(),
      apiBase: z.string().min(1).max(300).optional(),
    }),
    response: z.object({
      ok: z.boolean(),
      urls: z.array(z.string()),
      error: z.string().nullable(),
      stage: z.string().nullable(),
      // v5.97：这次实际走的路线——geeknow（自家上传）/ uguu
      // （公开图床回退）；失败时为 null。
      route: z.string().nullable(),
    }),
    timeoutMs: 120_000,
  },
  // v3.84 提交前只读鉴权预检：用「实际将生效的凭证 + 地址」向异步
  // 提交端点发一个不存在的模型名——鉴权先于选路，401/403 = 生效
  // 凭证被拒，其余错误（如 503 model_not_found）= 鉴权已通过。
  // 永不创建任务、永不计费，只回答「这次提交会不会被凭证卡住、
  // 卡住的是自填 Key 还是已连接凭证」。ok=false 表示预检本身没查
  // 成（网络 / 凭证通道问题），结论不成立，调用方不得据此拦截。
  geeknowProbeAuth: {
    request: z.object({
      apiKey: z.string().min(1).max(400).optional(),
      apiBase: z.string().min(1).max(300).optional(),
    }),
    response: z.object({
      ok: z.boolean(),
      authOk: z.boolean(),
      usedCustomKey: z.boolean(),
      httpStatus: z.number().nullable(),
      error: z.string().nullable(),
    }),
    timeoutMs: 120_000,
  },
  geeknowPollImageTask: {
    request: z.object({
      taskId: z.string().min(1).max(300),
      downloadTimeoutSec: z.number().int().min(10).max(600),
      apiKey: z.string().min(1).max(400).optional(),
      apiBase: z.string().min(1).max(300).optional(),
    }),
    response: z.object({
      ok: z.boolean(),
      // pending 生成中 / done 已出图 / failed 服务商判定失败 /
      // notfound 任务号不存在或已过期 / auth 鉴权失败（Key 问题）/
      // error 其他查询错误（可继续轮询）
      status: z.string(),
      imageBase64: z.string().nullable(),
      mimeType: z.string().nullable(),
      error: z.string().nullable(),
      previewBase64: z.string().nullable(),
    }),
    timeoutMs: 120_000,
  },
  // v3.64 预览图生成：把一张原图（上传图字节由动作层以 Base64 交
  // 过来）缩成最长边 ≤480px 的 JPEG 预览（v5.57 降质口径）。只做预览，原图字节不经
  // 这里改动；失败回 ok:false，调用方回落到原图显示，不拦原图保存。
  makeImagePreview: {
    request: z.object({
      dataBase64: z.string().min(1).max(48_000_000),
      mimeType: z.string().min(1).max(100),
    }),
    response: z.object({
      ok: z.boolean(),
      imageBase64: z.string().nullable(),
      error: z.string().nullable(),
    }),
    timeoutMs: 120_000,
  },
  // v3.67 一键填写发色测色预处理：对客户端送来的主图缩略图做头发
  // 区域采样（顶部头发带，去近白背景与肤色像素），把主导发色像素
  // 聚类后转 LAB、用 CIEDE2000 与发色调色板算色差分类，回报颜色
  // 名与置信度。只测色、不做生成；测不准回 confidence:"low"，由
  // 动作层与用户在预览里核对，绝不冒充确定结果。
  measureHairColor: {
    request: z.object({
      dataBase64: z.string().min(1).max(48_000_000),
      mimeType: z.string().min(1).max(100),
    }),
    response: z.object({
      ok: z.boolean(),
      colorName: z.string().nullable(),
      labL: z.number().nullable(),
      labA: z.number().nullable(),
      labB: z.number().nullable(),
      nearestDeltaE: z.number().nullable(),
      secondDeltaE: z.number().nullable(),
      clusterShare: z.number(),
      confidence: z.enum(["high", "medium", "low"]),
      error: z.string().nullable(),
    }),
    timeoutMs: 120_000,
  },
  // v4.41 中转代理：监控页跨浏览器中转改走服务端代理。浏览器在
  // artifact iframe 里直连中转 Worker 会被 CSP 的 connect-src 拦
  // 掉（Failed to fetch），改由本特权层在宿主机上代拉：中转地址
  // 与密钥只写在本文件（服务端配置），不进前端代码、不进任何
  // 日志与返回字段；前端只调同源动作拿 {ok, reports}。
  relayFetchIntake: {
    request: z.object({
      since: z.string().max(300).default(""),
    }),
    response: z.object({
      ok: z.boolean(),
      httpStatus: z.number().nullable(),
      bodyJson: z.string().nullable(),
      error: z.string().nullable(),
    }),
    timeoutMs: 120_000,
  },
  relayPing: {
    request: z.object({}),
    response: z.object({
      ok: z.boolean(),
      httpStatus: z.number().nullable(),
      bodyJson: z.string().nullable(),
      error: z.string().nullable(),
    }),
    timeoutMs: 120_000,
  },
  // 【第 8 档·监控断供恢复】刷新回程转发：工作台收到扩展刷新回传
  // 并写回成功后，把新链接以同协议上报 POST 到中转 /report，让只
  // 读中转 intake 的 cron 下载器下一轮拿到新链接。请求只带动作层
  // 拼好的 payloadJson（smzs-monitor-intake/1 协议体），中转地址
  // 与密钥仍只在 RELAY_PY 服务端配置里，不进请求、不进日志。
  relayPostReport: {
    request: z.object({
      payloadJson: z.string().min(1).max(20000),
    }),
    response: z.object({
      ok: z.boolean(),
      httpStatus: z.number().nullable(),
      bodyJson: z.string().nullable(),
      error: z.string().nullable(),
    }),
    timeoutMs: 120_000,
  },
  // v4.64 视频云端对接：宿主机 ~/workspace/video-cloud/ 是定时任务
  // 维护的本地视频云（videos/{videoId}.mp4 + state.json 的
  // downloaded 清单）。动作层没有文件系统权限，读 / 删都经本层：
  // 存储统计（容错读 state.json）、单文件 stat、分块读字节（动作
  // 层拼回完整文件存 ctx.blobs 后同源播放）、删除同步（删文件 +
  // 从 state.json 移除条目）。videoId 一律先过白名单正则
  // ^[A-Za-z0-9_-]+$，拼路径前校验，绝不允许目录穿越。
  cloudStorageInfo: {
    request: z.object({}),
    response: z.object({
      ok: z.boolean(),
      usedBytes: z.number(),
      videoCount: z.number(),
      // v4.65：downloaded 清单明细（videoId / 文件名 / 字节数 /
      // 存入时刻原文），供卡片「已存云端」状态与「云端已存」
      // 视图（按 at 倒序）使用；at 归一化成字符串（数字毫秒转
      // ISO 串），解析不了的原样带回、客户端按 0 处理。
      entries: z.array(
        z.object({
          videoId: z.string(),
          file: z.string(),
          size: z.number(),
          at: z.string(),
        }),
      ),
      error: z.string().nullable(),
    }),
    timeoutMs: 30_000,
  },
  cloudVideoStat: {
    request: z.object({ videoId: z.string().min(1).max(120) }),
    response: z.object({
      exists: z.boolean(),
      sizeBytes: z.number(),
    }),
    timeoutMs: 30_000,
  },
  cloudVideoReadChunk: {
    request: z.object({
      videoId: z.string().min(1).max(120),
      offset: z.number().int().min(0),
      length: z.number().int().min(1).max(4_194_304),
    }),
    response: z.object({
      ok: z.boolean(),
      dataBase64: z.string().nullable(),
      bytesRead: z.number(),
      totalSize: z.number(),
      error: z.string().nullable(),
    }),
    timeoutMs: 60_000,
  },
  cloudVideoDelete: {
    request: z.object({
      videoIds: z.array(z.string().min(1).max(120)).max(500),
    }),
    response: z.object({
      ok: z.boolean(),
      deletedCount: z.number(),
      error: z.string().nullable(),
    }),
    timeoutMs: 60_000,
  },
  // v4.65 手动「存云端」（对应 brief 的 POST /api/cloud-save）：
  // 用户在卡片上点一次才下一次——把 url（当前 video_play_url）
  // 直接下载到 videos/{videoId}.mp4，再更新 state.json 的
  // downloaded[videoId] = {file, size, at}。下载超时 60 秒、单
  // 文件上限 500MB（超限中止并删半截文件）；state.json 更新走
  // 文件锁 + 锁内重读最新内容合并 + tmp/rename 原子写，不覆盖
  // 定时任务同时写入的其它条目。已存过的直接回 alreadySaved，
  // 不重复下载。
  cloudVideoDownload: {
    request: z.object({
      videoId: z.string().min(1).max(120),
      url: z.string().min(1).max(4000),
    }),
    response: z.object({
      ok: z.boolean(),
      alreadySaved: z.boolean(),
      sizeBytes: z.number(),
      error: z.string().nullable(),
    }),
    timeoutMs: 120_000,
  },
  // v4.75 AI解剖场景切分：对云端视频文件做内容感知场景检测，
  // 切分点（秒）供解剖第 2 步当节拍窗边界，替代均匀时间窗。
  // 检测走 SCENE_DETECT_PY：优先 PySceneDetect（ContentDetector），
  // 本机没装 scenedetect 时回落 ffmpeg 的 scene 选择器（同为内容
  // 感知帧差检测）；method 如实回传用了哪条通道，两条都跑不出来
  // 回 method="none"、ok=false，客户端据此回落本地帧间差异分段。
  cloudSceneDetect: {
    request: z.object({ videoId: z.string().min(1).max(120) }),
    response: z.object({
      ok: z.boolean(),
      method: z.enum(["pyscenedetect", "ffmpeg", "none"]),
      durationSec: z.number(),
      cuts: z.array(z.number()),
      error: z.string().nullable(),
    }),
    timeoutMs: 180_000,
  },
  // v4.86 AI解剖转写层：Whisper 级 ASR。用户 AI 网关（Geeknow，
  // OpenAI 兼容口径）经实测没有音频转写通道（/v1/audio/transcriptions
  // 对 whisper-1 / gpt-4o-transcribe 均回 503 model_not_found），故按
  // 方案定稿降级服务端本地 Whisper：运行时装在
  // ~/workspace/video-cloud/asr/（venv 里的 faster-whisper 1.2.1 +
  // small 模型，CPU int8），缺失时本层首次调用自动自举（建 venv、
  // pip 安装、经 hf-mirror / huggingface.co 下载模型四件套，断点续
  // 传）。转写脚本 TRANSCRIBE_PY 输出逐句（按词级时间戳在句末标点
  // 与 ≥0.7 秒停顿处再切细）segments：每句起止秒（0.1 精度）、原文、
  // 置信度与低置信标记、外加按声学特征（log-mel 均值/方差 + 基频）
  // 聚出的声线簇标签（S1/S2…，簇→人物对位由融合层完成）。
  // segments 以 JSON 字符串回传（segmentsJson），避免契约里再抄
  // 一份数组结构；动作层解析并校验后下发。
  // v4.86 转写层改后台任务制（审计修正）：同步等转写跑完会撞动作
  // 网关时限（25 秒短片冷启动也要约 35 秒、长片按约 1.4 倍实时增
  // 长），故拆成「启动 + 轮询」——启动只把任务 spec 落盘并拉起
  // detached 的 runner 进程（与特权进程脱钩，页面关掉也继续跑），
  // 立刻回 jobId；轮询读结果文件。这样单次动作都是秒级，长片转写
  // 不再受单次请求时限约束。云端版按 videoId 定文件、上传版把音频
  // 字节落成任务源文件（runner 跑完自删）。
  startCloudTranscription: {
    request: z.object({ videoId: z.string().min(1).max(120) }),
    response: z.object({
      ok: z.boolean(),
      jobId: z.string().nullable(),
      error: z.string().nullable(),
    }),
    timeoutMs: 600_000,
  },
  startTranscriptionUpload: {
    request: z.object({
      dataBase64: z.string().min(1).max(48_000_000),
      fileName: z.string().max(200).default("audio.wav"),
    }),
    response: z.object({
      ok: z.boolean(),
      jobId: z.string().nullable(),
      error: z.string().nullable(),
    }),
    timeoutMs: 600_000,
  },
  pollTranscription: {
    request: z.object({ jobId: z.string().min(1).max(120) }),
    response: z.object({
      status: z.enum(["running", "done", "failed"]),
      ok: z.boolean(),
      durationSec: z.number(),
      segmentsJson: z.string(),
      segmentCount: z.number(),
      error: z.string().nullable(),
    }),
    timeoutMs: 30_000,
  },
  // v4.67 「存云端」改后台队列：入队只把条目追加进
  // ~/workspace/video-cloud/queue.json（与 state.json 同目录）并
  // 确保后台下载进程在跑，立刻返回——下载由独立后台进程
  // （queue-worker.py，detached）以 3 并发逐个处理，前端不用等。
  // 队列文件持久化：页面刷新不丢；后台进程不在时（服务端重启 /
  // 进程退出），状态查询与入队都会把它重新拉起、未完成条目续跑
  //（downloading 会被重置回 queued）。失败口径在 worker 内：
  // 403/410 链接过期直接记失败不重试（提示重新采集）；网络超时 /
  // 中断自动重试 1 次；单个下载超时 60 秒、单文件上限 500MB。
  cloudQueueEnqueue: {
    request: z.object({
      items: z
        .array(
          z.object({
            videoId: z.string().min(1).max(120),
            url: z.string().max(4000),
            title: z.string().max(500).default(""),
            creatorName: z.string().max(200).default(""),
          }),
        )
        .min(1)
        .max(200),
    }),
    response: z.object({
      ok: z.boolean(),
      queued: z.number(),
      batchId: z.string().nullable(),
      error: z.string().nullable(),
    }),
    timeoutMs: 30_000,
  },
  cloudQueueStatus: {
    request: z.object({}),
    response: z.object({
      ok: z.boolean(),
      running: z.boolean(),
      batchId: z.string().nullable(),
      total: z.number(),
      done: z.number(),
      success: z.number(),
      failed: z.number(),
      finishedAt: z.string().nullable(),
      items: z.array(
        z.object({
          id: z.string(),
          videoId: z.string(),
          title: z.string(),
          creatorName: z.string(),
          status: z.string(),
          error: z.string().nullable(),
          attempts: z.number(),
          sizeBytes: z.number(),
        }),
      ),
      error: z.string().nullable(),
    }),
    timeoutMs: 30_000,
  },
  // v4.69 失败清单重试：只把 queue.json 里指定的 failed 条目重置
  // 回 queued（itemIds 为空数组 = 本批全部 failed），清掉
  // batchFinishedAt 并确保后台进程在跑续下——已 success 的条目
  // 一字不动、绝不重复下载。重试仍走 worker 既有口径（60 秒超
  // 时、500MB 上限、网络失败自动再试 1 次）。
  cloudQueueRetryFailed: {
    request: z.object({
      itemIds: z.array(z.string().min(1).max(120)).max(200),
    }),
    response: z.object({
      ok: z.boolean(),
      retried: z.number(),
      error: z.string().nullable(),
    }),
    timeoutMs: 30_000,
  },
});

// 与连接器 bin/geeknow.py 同一条调用口径，但不截断输出（模型列表
// 与图片 base64 都可能远超 8000 字），结果以 RESULT_JSON 行回传。
const GEEKNOW_PY = `
import json, sys, base64, time, socket, urllib.request, urllib.error

# P4：exe 环境没有 Muse 平台的 dynamic_credentials 代理凭证机制，
# read_json_response 在此本地实现（与原 helper 等价：分块读完
# body 再 json.loads，非 JSON 抛错）。
def read_json_response(resp):
    chunks = []
    while True:
        chunk = resp.read(65536)
        if not chunk:
            break
        chunks.append(chunk)
    body = b"".join(chunks)
    try:
        return json.loads(body.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise RuntimeError("provider response was not valid JSON") from exc

ALLOWED = ["geeknow.top", "api.geeknow.top", "www.geeknow.top"]
BASE = "https://api.geeknow.top"

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args):
        raise RuntimeError("redirect refused, verify the endpoint")

def opener():
    return urllib.request.build_opener(NoRedirect())

# v3.83 提交设置：用户可自填 API 地址与 Key（封面页两个小输入框）。
# 地址为空用默认 BASE；填了必须是 https:// 开头的完整地址（带不带
# /v1 后缀都认）。鉴权口径：填了 Key → 直接用 Bearer 头（Key 只用
# 于当次请求，绝不打印、绝不拼进任何错误文案）；没填 Key → 明确
# 报错，不再走任何代理凭证（exe 环境里没有该机制）。
def effective_base(req_in):
    raw = (req_in.get("apiBase") or "").strip()
    if not raw:
        return BASE, None
    try:
        u = urllib.parse.urlparse(raw)
    except Exception:
        return None, "API 地址格式不对：请填写完整的 https:// 地址"
    if u.scheme != "https" or not u.hostname:
        return None, "API 地址格式不对：需要以 https:// 开头的完整地址"
    base = raw.rstrip("/")
    if base.endswith("/v1"):
        base = base[:-3].rstrip("/")
    return base, None

def apply_auth(req, req_in, host):
    key = (req_in.get("apiKey") or "").strip()
    if key:
        req.add_header("Authorization", "Bearer " + key)
        return None
    return "未填 Geeknow Key，请在工作台生图设置里填写"

# v5.95 超时判定：urllib 的超时会以 TimeoutError / socket.timeout
# 本体、或 URLError.reason 的形式冒出来，三种都认。
def is_timeout_exc(e):
    if isinstance(e, (TimeoutError, socket.timeout)):
        return True
    reason = getattr(e, "reason", None)
    if isinstance(reason, (TimeoutError, socket.timeout)):
        return True
    return "timed out" in str(e).lower()

# v5.97 Geeknow 自家上传单张：presign（钳 presign_timeout）+ PUT
# 字节到预签名地址（钳 put_timeout）。PUT 不带任何鉴权头——地址
# 本身已签名（SignedHeaders 只含 content-type 与 host），多带头
# 反而可能让签名失效。成功回 (public_url, None)；失败回
# (None, {"error", "stage"})，其中该地址走不了自家上传（地址格
# 式不对 / 不在已连接凭证白名单内且没自填 Key）标 unavailable，
# 调用方照常回退、不算用户错误。
def upload_ref_geeknow(img_bytes, label, req_in, presign_timeout, put_timeout):
    base, berr = effective_base(req_in)
    if berr:
        return None, {"error": berr, "stage": "host_error", "unavailable": True}
    host = urllib.parse.urlparse(base).hostname or ""
    try:
        data = json.dumps({"file_name": "cover-ref.jpg", "content_type": "image/jpeg"}).encode("utf-8")
        pr = urllib.request.Request(base + "/api/upload/presign", data=data, method="POST")
        pr.add_header("Content-Type", "application/json")
        aerr = apply_auth(pr, req_in, host)
        if aerr:
            return None, {"error": aerr, "stage": "host_error", "unavailable": True}
        with opener().open(pr, timeout=presign_timeout) as resp:
            body = read_json_response(resp)
    except urllib.error.HTTPError as e:
        detail = ""
        try:
            detail = e.read().decode("utf-8", "replace")[:200]
        except Exception:
            detail = ""
        return None, {"error": label + "向 Geeknow 申请自家上传地址失败 HTTP " + str(e.code) + ("：" + detail if detail else ""), "stage": "host_error"}
    except Exception as e:
        if is_timeout_exc(e):
            return None, {"error": label + "向 Geeknow 申请自家上传地址超时了", "stage": "host_timeout"}
        return None, {"error": label + "向 Geeknow 申请自家上传地址失败：" + type(e).__name__ + ": " + str(e)[:200], "stage": "host_error"}
    d = body.get("data") if isinstance(body, dict) else None
    if not isinstance(d, dict):
        d = body if isinstance(body, dict) else {}
    upload_url = d.get("upload_url")
    public_url = d.get("public_url")
    method = d.get("method") if isinstance(d.get("method"), str) and d.get("method") else "PUT"
    ctype = d.get("content_type") if isinstance(d.get("content_type"), str) and d.get("content_type") else "image/jpeg"
    if not (isinstance(upload_url, str) and upload_url.startswith("https://") and isinstance(public_url, str) and public_url.startswith("https://")):
        return None, {"error": label + "Geeknow 自家上传没返回可用的上传地址（返回里缺 upload_url / public_url）", "stage": "host_error"}
    try:
        ur = urllib.request.Request(upload_url, data=img_bytes, method=method)
        ur.add_header("Content-Type", ctype)
        ur.add_header("Connection", "close")
        with urllib.request.build_opener().open(ur, timeout=put_timeout) as resp:
            resp.read()
            if resp.status < 200 or resp.status >= 300:
                return None, {"error": label + "往 Geeknow 自家空间传图失败 HTTP " + str(resp.status), "stage": "host_error"}
    except urllib.error.HTTPError as e:
        detail = ""
        try:
            detail = e.read().decode("utf-8", "replace")[:200]
        except Exception:
            detail = ""
        return None, {"error": label + "往 Geeknow 自家空间传图失败 HTTP " + str(e.code) + ("：" + detail if detail else ""), "stage": "host_error"}
    except Exception as e:
        if is_timeout_exc(e):
            return None, {"error": label + "往 Geeknow 自家空间传图超时了", "stage": "host_timeout"}
        return None, {"error": label + "往 Geeknow 自家空间传图失败：" + type(e).__name__ + ": " + str(e)[:200], "stage": "host_error"}
    return public_url, None

# v5.95：deadline_ts = 本次调用的共享截止时刻（time.time() 口径）。
# 逐张上传的超时不再写死 30 秒，而是「剩多少时间用多少」并钳在
# 15 秒内——守护进程整次动作只有 30 秒预算，托管这一步必须给后
# 面的提交留出时间，绝不许出现「托管 30 秒 + 提交 25 秒」这种串
# 行超预算的组合。失败回 (None, {"error", "stage"}, None)：stage
# 区分 host_timeout（托管太慢/超时）与 host_error（其他托管失
# 败），供上层写清是哪一步出的问题；两种都表示还没提交、不会
# 计费。成功回 (urls, None, route)：route = geeknow（全走自家
# 上传）/ uguu（全走公开图床回退）/ mixed（两种都有）。
# v5.97：primary_deadline_ts = 自家上传路线的时间段截止——每张
# 图先在该截止内走自家上传（presign 钳 4 秒、PUT 钳 6 秒），走
# 不通立刻用 deadline_ts 内的剩余时间改走 uguu.se；两段相加不
# 超 deadline_ts。req_in 为空（没鉴权信息）时直接走回退路线。
def host_reference_images(refs, deadline_ts=None, req_in=None, primary_deadline_ts=None):
    import io, uuid
    from PIL import Image
    urls = []
    routes = []
    for idx, r in enumerate(refs):
        label = "第 " + str(idx + 1) + " 张参考图"
        try:
            raw = base64.b64decode(r["dataBase64"])
            im = Image.open(io.BytesIO(raw))
            im.load()
            rgba = im.convert("RGBA")
            bg = Image.new("RGB", rgba.size, (255, 255, 255))
            bg.paste(rgba, mask=rgba.split()[3])
            # v5.04 中转压缩阶梯（用户明确要求：过大就中转压缩、
            # 不再报错丢图）：托管副本目标 ≤2.5MB。第一档就是原口
            # 径（最长边 1024 / quality 85，正常图到此为止、与旧
            # 行为逐字一致）；超了逐档降 quality 与边长（70→55、
            # 1024→768→512）；仍超才裁剪——裁剪保顶部（人脸所在）
            # 与水平居中、只从底部和两侧逐档收窄（0.9→0.5），保
            # 人物主体、头发与服装，不裁头。全程保留见过的最小一
            # 份兜底，尺寸不再成为托管失败的原因。只压这份中转副
            # 本，库里原图一字不动。
            HOST_TARGET_BYTES = 2_500_000
            def encode_ref(img, edge, quality):
                t = img.copy()
                t.thumbnail((edge, edge), Image.LANCZOS)
                b = io.BytesIO()
                t.save(b, "JPEG", quality=quality)
                return b.getvalue()
            img_bytes = None
            for edge, q in [(1024, 85), (1024, 70), (1024, 55), (768, 70), (768, 55), (512, 70), (512, 55)]:
                cand = encode_ref(bg, edge, q)
                if img_bytes is None or len(cand) < len(img_bytes):
                    img_bytes = cand
                if len(cand) <= HOST_TARGET_BYTES:
                    img_bytes = cand
                    break
            if img_bytes is None or len(img_bytes) > HOST_TARGET_BYTES:
                W, H = bg.size
                for frac in (0.9, 0.8, 0.7, 0.6, 0.5):
                    w2 = max(1, int(W * frac))
                    h2 = max(1, int(H * frac))
                    x0 = (W - w2) // 2
                    cand = encode_ref(bg.crop((x0, 0, x0 + w2, h2)), 512, 55)
                    if len(cand) < len(img_bytes):
                        img_bytes = cand
                    if len(cand) <= HOST_TARGET_BYTES:
                        img_bytes = cand
                        break
        except Exception as e:
            return None, {"error": label + "没能处理成可上传的副本：" + type(e).__name__ + ": " + str(e)[:200], "stage": "host_error"}, None
        # v5.97 主路线：先走 Geeknow 自家上传（只在 primary 截止内
        # 试；presign 钳 4 秒、PUT 钳 6 秒）。走通就用自家链接，
        # 不再碰公开图床。
        geek_err = None
        if req_in is not None and primary_deadline_ts is not None:
            prem = primary_deadline_ts - time.time()
            if prem >= 1.5:
                gurl, geek_err = upload_ref_geeknow(img_bytes, label, req_in, max(1.0, min(4.0, prem)), max(1.5, min(6.0, prem)))
                if gurl:
                    urls.append(gurl)
                    routes.append("geeknow")
                    continue
            elif geek_err is None:
                geek_err = {"error": label + "还没开始传，Geeknow 自家上传的时间段已经用完了", "stage": "host_timeout"}
        # 回退路线：uguu.se 公开图床，用整步截止内的剩余时间。
        if deadline_ts is not None:
            remain = deadline_ts - time.time()
            if remain < 2.0:
                uerr = {"error": label + "还没开始传，前面几张图换链接已经把时间用完了", "stage": "host_timeout"}
                if geek_err:
                    uerr = {"error": "先走 Geeknow 自家上传没走通（" + geek_err["error"] + "），自动改走公开图床也没走通：" + uerr["error"], "stage": "host_timeout"}
                return None, uerr, None
            up_timeout = max(2.0, min(15.0, remain))
        else:
            up_timeout = 30
        try:
            boundary = "----hatchref" + uuid.uuid4().hex
            crlf = chr(13) + chr(10)
            head = "--" + boundary + crlf + 'Content-Disposition: form-data; name="files[]"; filename="cover-ref.jpg"' + crlf + "Content-Type: image/jpeg" + crlf + crlf
            tail = crlf + "--" + boundary + "--" + crlf
            body = head.encode("utf-8") + img_bytes + tail.encode("ascii")
            hr = urllib.request.Request("https://uguu.se/upload.php", data=body, method="POST")
            hr.add_header("Content-Type", "multipart/form-data; boundary=" + boundary)
            hr.add_header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36")
            with opener().open(hr, timeout=up_timeout) as hresp:
                hbody = read_json_response(hresp)
            url = None
            if isinstance(hbody, dict):
                files = hbody.get("files")
                if isinstance(files, list) and files and isinstance(files[0], dict):
                    u = files[0].get("url")
                    if isinstance(u, str) and u.startswith("https://"):
                        url = u
            if not url:
                uerr = {"error": label + "上传到公开图床后没拿到可用链接（图床返回：" + json.dumps(hbody, ensure_ascii=False)[:200] + "）", "stage": "host_error"}
                if geek_err:
                    uerr = {"error": "先走 Geeknow 自家上传没走通（" + geek_err["error"] + "），自动改走公开图床也没走通：" + uerr["error"], "stage": "host_error"}
                return None, uerr, None
            urls.append(url)
            routes.append("uguu")
        except urllib.error.HTTPError as e:
            detail = ""
            try:
                detail = e.read().decode("utf-8", "replace")[:200]
            except Exception:
                detail = ""
            uerr = {"error": label + "上传公开图床失败 HTTP " + str(e.code) + ("：" + detail if detail else ""), "stage": "host_error"}
            if geek_err:
                uerr = {"error": "先走 Geeknow 自家上传没走通（" + geek_err["error"] + "），自动改走公开图床也没走通：" + uerr["error"], "stage": "host_error"}
            return None, uerr, None
        except Exception as e:
            if is_timeout_exc(e):
                uerr = {"error": label + "上传到公开图床超时了（图床这会儿响应太慢）", "stage": "host_timeout"}
            else:
                uerr = {"error": label + "上传公开图床失败：" + type(e).__name__ + ": " + str(e)[:200], "stage": "host_error"}
            if geek_err:
                uerr = {"error": "先走 Geeknow 自家上传没走通（" + geek_err["error"] + "），自动改走公开图床也没走通：" + uerr["error"], "stage": uerr["stage"]}
            return None, uerr, None
    if routes and all(x == "geeknow" for x in routes):
        route = "geeknow"
    elif routes and all(x == "uguu" for x in routes):
        route = "uguu"
    elif routes:
        route = "mixed"
    else:
        route = None
    return urls, None, route

# 图片文件在 r2.geeknow.ai 上：默认 Python UA 会被 403 拒绝，带
# 浏览器 UA 才放行（实测）。所有取图下载都走这里，不带凭证头
# （公开文件地址），只带 UA 与 Accept。
def download_image(url, timeout):
    dr = urllib.request.Request(url, method="GET")
    dr.add_header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36")
    dr.add_header("Accept", "image/*,*/*")
    with opener().open(dr, timeout=timeout) as dresp:
        raw = dresp.read()
        mime = dresp.headers.get_content_type() or "image/png"
    return raw, mime

# v3.64 预览图（v5.57 降质：最长边 ≤480px、quality 68，与客户端
# 补生成同口径）：原图字节缩成小 JPEG（白底铺平透明），只作卡面
# 预览、原图一字不动。任何失败都回 None，绝不让预览问题把一张
# 已生成 / 已下载成功的原图变成失败。
def make_preview_b64(raw):
    try:
        import io
        from PIL import Image
        im = Image.open(io.BytesIO(raw))
        im.load()
        rgba = im.convert("RGBA")
        bg = Image.new("RGB", rgba.size, (255, 255, 255))
        bg.paste(rgba, mask=rgba.split()[3])
        bg.thumbnail((480, 480), Image.LANCZOS)
        buf = io.BytesIO()
        bg.save(buf, "JPEG", quality=68)
        return base64.b64encode(buf.getvalue()).decode("ascii")
    except Exception:
        return None

def preview_of_b64(b64):
    try:
        return make_preview_b64(base64.b64decode(b64))
    except Exception:
        return None

def emit(obj):
    sys.stdout.write("RESULT_JSON:" + json.dumps(obj, ensure_ascii=False) + "\\n")
    sys.stdout.flush()

def find_task_id(body):
    if not isinstance(body, dict):
        return None
    for k in ("task_id", "taskId", "id", "job_id"):
        v = body.get(k)
        if isinstance(v, str) and v:
            return v
    d = body.get("data")
    if isinstance(d, dict):
        return find_task_id(d)
    return None

def status_text(body):
    vals = []
    if isinstance(body, dict):
        vals.append(body.get("status"))
        vals.append(body.get("state"))
        d = body.get("data")
        if isinstance(d, dict):
            vals.append(d.get("status"))
            vals.append(d.get("state"))
        r = body.get("result")
        if isinstance(r, dict):
            vals.append(r.get("status"))
            vals.append(r.get("state"))
    for v in vals:
        if isinstance(v, str) and v:
            return v.lower()
    return ""

def provider_message(body):
    if isinstance(body, dict):
        for k in ("error", "message", "detail", "msg"):
            v = body.get(k)
            if isinstance(v, str) and v:
                return v[:400]
            if isinstance(v, dict):
                m = v.get("message")
                if isinstance(m, str) and m:
                    return m[:400]
        d = body.get("data")
        if isinstance(d, dict):
            return provider_message(d)
    return ""

def extract_image(body):
    containers = [body]
    if isinstance(body, dict):
        for k in ("data", "result"):
            sub = body.get(k)
            if isinstance(sub, dict):
                containers.append(sub)
    for c in containers:
        if not isinstance(c, dict):
            continue
        items = c.get("data")
        if isinstance(items, list) and items and isinstance(items[0], dict):
            first = items[0]
            if first.get("b64_json"):
                return first["b64_json"], None
            if first.get("url"):
                return None, first["url"]
        if c.get("b64_json"):
            return c["b64_json"], None
        if c.get("url"):
            return None, c["url"]
        iu = c.get("image_url")
        if isinstance(iu, str) and iu:
            return None, iu
    return None, None

def http_error_emit(e, prefix, extra=None):
    detail = ""
    try:
        detail = e.read().decode("utf-8", "replace")[:400]
    except Exception:
        detail = ""
    out = {"ok": False, "error": prefix + " HTTP " + str(e.code) + ("：" + detail if detail else "")}
    if extra:
        out.update(extra)
    emit(out)

def main():
    req_in = json.load(sys.stdin)
    mode = req_in.get("mode")
    if mode == "models":
        try:
            base, berr = effective_base(req_in)
            if berr:
                emit({"ok": False, "models": [], "error": berr})
                return
            host = urllib.parse.urlparse(base).hostname or ""
            r = urllib.request.Request(base + "/v1/models", method="GET")
            aerr = apply_auth(r, req_in, host)
            if aerr:
                emit({"ok": False, "models": [], "error": aerr})
                return
            with opener().open(r, timeout=60) as resp:
                body = read_json_response(resp)
            ids = []
            for d in body.get("data", []):
                mid = d.get("id")
                if isinstance(mid, str):
                    ids.append(mid)
            keys = ("image", "seedream", "flux", "dall", "midjourney", "mj-", "omni")
            imgs = [i for i in ids if any(k in i.lower() for k in keys) and "kling" not in i.lower() and "video" not in i.lower()]
            emit({"ok": True, "models": imgs, "error": None})
        except urllib.error.HTTPError as e:
            detail = ""
            try:
                detail = e.read().decode("utf-8", "replace")[:400]
            except Exception:
                detail = ""
            emit({"ok": False, "models": [], "error": "Geeknow 接口返回 HTTP " + str(e.code) + ("：" + detail if detail else "")})
        except Exception as e:
            emit({"ok": False, "models": [], "error": "读取模型列表失败：" + type(e).__name__ + ": " + str(e)[:400]})
        return
    if mode == "hostrefs":
        # v5.95 参考图托管独立一步（与提交拆开、各走各的 30 秒预
        # 算）：只换链接、不建任务、不计费。整步共用一个 24 秒截
        # 止时间（留 6 秒余量给进程启动与回执）。
        # v5.97：主路线 Geeknow 自家上传的时间段 = 前段（1 张图约
        # 8 秒、每多一张加 2 秒、上限 16 秒），走不通自动改走
        # uguu.se 用剩余时间再试；两段相加不超 24 秒。回执带
        # route 写明实际路线；失败时 error 已写清两条各败在哪。
        refs = req_in.get("referenceImages") or []
        if not refs:
            emit({"ok": True, "urls": [], "error": None, "stage": None, "route": None})
            return
        host_start = time.time()
        primary_secs = min(16.0, 6.0 + 2.0 * len(refs))
        img_urls, herr, route = host_reference_images(refs, host_start + 24.0, req_in, host_start + primary_secs)
        if herr:
            emit({"ok": False, "urls": [], "error": herr["error"], "stage": herr["stage"], "route": None})
            return
        emit({"ok": True, "urls": img_urls, "error": None, "stage": None, "route": route})
        return
    if mode == "submit":
        # 异步提交：一次短调用，只拿任务号，绝不在这里等出图，也绝不
        # 自动重试提交（重试提交 = 可能重复计费）。提交等待在服务端
        # 钳到 25 秒内，稳在守护进程 30 秒预算之下。
        # v5.95：整步共用一个截止时间（开始后 24 秒，留 6 秒余量）：
        # 客户端一般先走 hostrefs 把参考图换好链接、提交时直接带
        # referenceImageUrls 进来，这一步就只剩一次 Geeknow 调用；
        # 万一还带了内联图进来（旧路径），托管只准用截止时间内的
        # 前段（最多约 14 秒），剩下的全留给提交——两步相加永远
        # 小于守护进程 30 秒预算，不再串行超预算被掐断。
        payload = {
            "model": req_in["model"],
            "prompt": req_in["prompt"],
            "n": 1,
            "size": req_in["size"],
            "quality": req_in["quality"],
            "response_format": "b64_json",
        }
        submit_start = time.time()
        submit_deadline = submit_start + 24.0
        refs = req_in.get("referenceImages") or []
        prehosted = req_in.get("referenceImageUrls") or []
        hosted_ref_urls = []
        submit_host_route = None
        if prehosted:
            # v5.95 主路径：参考图已在上一步（hostrefs）换好链接，
            # 这里直接用，不再现传图床——提交只剩一次 Geeknow 调用。
            hosted_ref_urls = [u for u in prehosted if isinstance(u, str) and u.startswith("https://")]
            if hosted_ref_urls:
                payload["image"] = hosted_ref_urls
        elif refs:
            # v4.22 恢复带参考图提交（用户明确要求、推翻 v4.05 停
            # 用）：异步接口的 image 字段只收 http(s) 链接，先把参
            # 考图降采样副本换成链接再带上提交。托管失败整单失败、
            # 写清原因、不提交不计费，绝不静默丢图。
            # v5.95：托管只准用到开始后约 14 秒，余量全留给提交。
            # v5.97：与 hostrefs 同一套双路线——前约 7 秒先走
            # Geeknow 自家上传，走不通自动改走 uguu.se 用剩余的托
            # 管时间；req_in 里带与提交同一套 apiKey / apiBase。
            img_urls, herr, host_route = host_reference_images(refs, submit_start + 14.0, req_in, submit_start + 7.0)
            if herr:
                if herr["stage"] == "host_timeout":
                    emit({"ok": False, "taskId": None, "imageBase64": None, "mimeType": None, "stage": "host_timeout", "error": "参考图换链接超时了：" + herr["error"] + "。这一步在提交之前，这次没有提交、任务没有建、不会计费，可以直接再点一次生成重试。"})
                else:
                    emit({"ok": False, "taskId": None, "imageBase64": None, "mimeType": None, "stage": "host_error", "error": "参考图没能换成链接，这次没有提交、不会计费：" + herr["error"] + "。可以稍后重试；或取消参考图（并去掉提示词里「以随附的人物资产图为准」约束）用纯文字生成。"})
                return
            payload["image"] = img_urls
            hosted_ref_urls = img_urls
            submit_host_route = host_route
        remain = submit_deadline - time.time()
        if remain < 3.0:
            emit({"ok": False, "taskId": None, "imageBase64": None, "mimeType": None, "stage": "host_timeout", "error": "参考图换链接太慢，还没轮到向 Geeknow 提交时间就用完了：这次没有提交、任务没有建、不会计费，可以直接再点一次生成重试。"})
            return
        sub_timeout = max(1.0, min(float(req_in.get("requestTimeoutSec", 60)), 25.0, remain))
        dl_timeout = float(req_in.get("downloadTimeoutSec", 60))
        base, berr = effective_base(req_in)
        if berr:
            emit({"ok": False, "taskId": None, "imageBase64": None, "mimeType": None, "error": berr})
            return
        host = urllib.parse.urlparse(base).hostname or ""
        try:
            data = json.dumps(payload).encode("utf-8")
            r = urllib.request.Request(base + "/v1/images/generations/async", data=data, method="POST")
            r.add_header("Content-Type", "application/json")
            aerr = apply_auth(r, req_in, host)
            if aerr:
                emit({"ok": False, "taskId": None, "imageBase64": None, "mimeType": None, "error": aerr})
                return
            with opener().open(r, timeout=sub_timeout) as resp:
                body = read_json_response(resp)
        except urllib.error.HTTPError as e:
            extra = {"stage": "http"}
            if e.code in (401, 403):
                extra = {"authFailed": True, "stage": "auth"}
            http_error_emit(e, "Geeknow 异步提交失败", extra)
            return
        except Exception as e:
            # v5.95 超时分清是哪种：等回复超时 = 请求多半已经发到
            # Geeknow 了，任务到底建没建没法确认，明说不确定、不让
            # 用户盲目重点（重点可能重复计费）；连接层就失败（连不
            # 上 / 域名解析失败 / 连接被拒）= 请求根本没送达，任务
            # 确定没建，可以直接重试。
            if is_timeout_exc(e):
                emit({"ok": False, "taskId": None, "imageBase64": None, "mimeType": None, "stage": "submit_timeout", "error": "提交已经发给 Geeknow 了，但等它回任务号等超时了——这次任务到底建没建，现在没法确认。先别马上再点生成（万一已经建好，重点一次会重复计费）：等一两分钟，先看下面的生图记录 / 封面记录里有没有新任务冒出来，或去 Geeknow 控制台对一下；确认没有，再重新生成。"})
            elif isinstance(e, urllib.error.URLError):
                emit({"ok": False, "taskId": None, "imageBase64": None, "mimeType": None, "stage": "submit_unreachable", "error": "没连上 Geeknow（" + type(e).__name__ + "：" + str(e)[:200] + "）：请求根本没送达，这次没有提交、任务没有建、不会计费，可以直接再点一次生成重试。"})
            else:
                emit({"ok": False, "taskId": None, "imageBase64": None, "mimeType": None, "stage": "submit_error", "error": "Geeknow 异步提交失败：" + type(e).__name__ + ": " + str(e)[:400]})
            return
        tid = find_task_id(body)
        if tid:
            emit({"ok": True, "taskId": tid, "imageBase64": None, "mimeType": None, "error": None, "refImageUrls": hosted_ref_urls, "hostRoute": submit_host_route})
            return
        # 个别模型可能同步直接回图（没有任务号）：照单收下，不算失败。
        b64, url = extract_image(body)
        try:
            if b64:
                emit({"ok": True, "taskId": None, "imageBase64": b64, "mimeType": "image/png", "error": None, "previewBase64": preview_of_b64(b64), "refImageUrls": hosted_ref_urls, "hostRoute": submit_host_route})
                return
            if url:
                raw, mime = download_image(url, dl_timeout)
                emit({"ok": True, "taskId": None, "imageBase64": base64.b64encode(raw).decode("ascii"), "mimeType": mime, "error": None, "previewBase64": make_preview_b64(raw), "refImageUrls": hosted_ref_urls, "hostRoute": submit_host_route})
                return
        except Exception as e:
            emit({"ok": False, "taskId": None, "imageBase64": None, "mimeType": None, "error": "提交已返回但取图失败：" + type(e).__name__ + ": " + str(e)[:400]})
            return
        emit({"ok": False, "taskId": None, "imageBase64": None, "mimeType": None, "error": "Geeknow 异步提交没有返回任务号：" + json.dumps(body, ensure_ascii=False)[:300]})
        return
    if mode == "poll":
        # 轮询任务状态：一次短调用（钳到 25 秒内）。只读查询，不计费、
        # 不产生新任务；出图时才在下载超时内把图片字节取回。
        tid = str(req_in.get("taskId", "")).strip()
        dl_timeout = float(req_in.get("downloadTimeoutSec", 60))
        if not tid:
            emit({"ok": False, "status": "failed", "imageBase64": None, "mimeType": None, "error": "缺少任务号，无法查询生图任务"})
            return
        base, berr = effective_base(req_in)
        if berr:
            emit({"ok": False, "status": "auth", "imageBase64": None, "mimeType": None, "error": berr})
            return
        host = urllib.parse.urlparse(base).hostname or ""
        try:
            r = urllib.request.Request(base + "/v1/images/generations/async/" + urllib.parse.quote(tid, safe=""), method="GET")
            aerr = apply_auth(r, req_in, host)
            if aerr:
                emit({"ok": False, "status": "auth", "imageBase64": None, "mimeType": None, "error": aerr})
                return
            with opener().open(r, timeout=20) as resp:
                body = read_json_response(resp)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                emit({"ok": False, "status": "notfound", "imageBase64": None, "mimeType": None, "error": "任务号不存在或已过期（HTTP 404），这个任务查不到了"})
            elif e.code in (401, 403):
                emit({"ok": False, "status": "auth", "imageBase64": None, "mimeType": None, "error": "Geeknow 鉴权失败（HTTP " + str(e.code) + "）：连接凭证未生效，请重新连接 Geeknow"})
            else:
                http_error_emit(e, "查询生图任务失败", {"status": "error", "imageBase64": None, "mimeType": None})
            return
        except Exception as e:
            emit({"ok": False, "status": "error", "imageBase64": None, "mimeType": None, "error": "查询生图任务失败：" + type(e).__name__ + ": " + str(e)[:400]})
            return
        st = status_text(body)
        if st in ("failed", "error", "cancelled", "canceled", "rejected", "expired"):
            msg = provider_message(body) or "服务商判定这张图生成失败"
            emit({"ok": False, "status": "failed", "imageBase64": None, "mimeType": None, "error": msg})
            return
        b64, url = extract_image(body)
        done_states = ("succeeded", "success", "successful", "completed", "complete", "done", "finished")
        if st in done_states or b64 or url:
            try:
                if b64:
                    emit({"ok": True, "status": "done", "imageBase64": b64, "mimeType": "image/png", "error": None, "previewBase64": preview_of_b64(b64)})
                    return
                if url:
                    raw, mime = download_image(url, dl_timeout)
                    emit({"ok": True, "status": "done", "imageBase64": base64.b64encode(raw).decode("ascii"), "mimeType": mime, "error": None, "previewBase64": make_preview_b64(raw)})
                    return
            except Exception as e:
                emit({"ok": False, "status": "error", "imageBase64": None, "mimeType": None, "error": "图片已生成但下载失败（可继续查询）：" + type(e).__name__ + ": " + str(e)[:400]})
                return
            emit({"ok": False, "status": "error", "imageBase64": None, "mimeType": None, "error": "任务显示已完成，但返回里没有图片数据（可继续查询）"})
            return
        emit({"ok": True, "status": "pending", "imageBase64": None, "mimeType": None, "error": None})
        return
    if mode == "probe":
        # v3.84 只读鉴权预检：不存在的模型名提交到异步端点。鉴权
        # 先于选路：401/403 = 生效凭证被拒；其余 HTTP 错误（503
        # model_not_found 等）说明鉴权已通过、只是没有可用渠道——
        # 任务不会被创建、不计费。凭证本身绝不打印、绝不拼进报错。
        used_key = bool((req_in.get("apiKey") or "").strip())
        base, berr = effective_base(req_in)
        if berr:
            emit({"ok": False, "authOk": False, "usedCustomKey": used_key, "httpStatus": None, "error": berr})
            return
        host = urllib.parse.urlparse(base).hostname or ""
        payload = {"model": "__auth_probe_nonexistent_model__", "prompt": "auth probe", "n": 1, "size": "1024x1024", "quality": "standard", "response_format": "b64_json"}
        try:
            data = json.dumps(payload).encode("utf-8")
            r = urllib.request.Request(base + "/v1/images/generations/async", data=data, method="POST")
            r.add_header("Content-Type", "application/json")
            aerr = apply_auth(r, req_in, host)
            if aerr:
                emit({"ok": False, "authOk": False, "usedCustomKey": used_key, "httpStatus": None, "error": aerr})
                return
            with opener().open(r, timeout=20) as resp:
                read_json_response(resp)
            emit({"ok": True, "authOk": True, "usedCustomKey": used_key, "httpStatus": 200, "error": None})
            return
        except urllib.error.HTTPError as e:
            detail = ""
            try:
                detail = e.read().decode("utf-8", "replace")[:300]
            except Exception:
                detail = ""
            if e.code in (401, 403):
                emit({"ok": True, "authOk": False, "usedCustomKey": used_key, "httpStatus": e.code, "error": "HTTP " + str(e.code) + ("：" + detail if detail else "")})
            else:
                emit({"ok": True, "authOk": True, "usedCustomKey": used_key, "httpStatus": e.code, "error": None})
            return
        except Exception as e:
            emit({"ok": False, "authOk": False, "usedCustomKey": used_key, "httpStatus": None, "error": "预检没能完成：" + type(e).__name__ + ": " + str(e)[:300]})
            return
    # generate
    payload = {
        "model": req_in["model"],
        "prompt": req_in["prompt"],
        "n": 1,
        "size": req_in["size"],
        "quality": req_in["quality"],
        "response_format": "b64_json",
    }
    refs = req_in.get("referenceImages") or []
    if refs:
        payload["image"] = ["data:" + r["mimeType"] + ";base64," + r["dataBase64"] for r in refs]
    attempts = 1 + max(0, min(10, int(req_in.get("retryCount", 5))))
    req_timeout = float(req_in.get("requestTimeoutSec", 60))
    dl_timeout = float(req_in.get("downloadTimeoutSec", 60))
    last_err = "生成失败"
    base, berr = effective_base(req_in)
    if berr:
        emit({"ok": False, "imageBase64": None, "mimeType": None, "error": berr})
        return
    host = urllib.parse.urlparse(base).hostname or ""
    for attempt in range(attempts):
        try:
            data = json.dumps(payload).encode("utf-8")
            r = urllib.request.Request(base + "/v1/images/generations", data=data, method="POST")
            r.add_header("Content-Type", "application/json")
            aerr = apply_auth(r, req_in, host)
            if aerr:
                last_err = aerr
                break
            with opener().open(r, timeout=req_timeout) as resp:
                body = read_json_response(resp)
            items = body.get("data") or []
            if not items:
                raise RuntimeError("接口没有返回图片数据：" + json.dumps(body, ensure_ascii=False)[:300])
            first = items[0]
            b64 = first.get("b64_json")
            if b64:
                emit({"ok": True, "imageBase64": b64, "mimeType": "image/png", "error": None, "previewBase64": preview_of_b64(b64)})
                return
            url = first.get("url")
            if url:
                raw, mime = download_image(url, dl_timeout)
                emit({"ok": True, "imageBase64": base64.b64encode(raw).decode("ascii"), "mimeType": mime, "error": None, "previewBase64": make_preview_b64(raw)})
                return
            raise RuntimeError("接口返回里既没有 b64_json 也没有图片 url")
        except urllib.error.HTTPError as e:
            detail = ""
            try:
                detail = e.read().decode("utf-8", "replace")[:400]
            except Exception:
                detail = ""
            last_err = "Geeknow 接口返回 HTTP " + str(e.code) + ("：" + detail if detail else "")
            if e.code in (400, 401, 403, 404):
                break
        except Exception as e:
            last_err = "生成请求失败：" + type(e).__name__ + ": " + str(e)[:400]
        if attempt + 1 < attempts:
            time.sleep(2)
    emit({"ok": False, "imageBase64": None, "mimeType": None, "error": last_err})

main()
`;

// v4.41 中转代理小程序：/ping（免密钥只读 GET，验中转本身通不
// 通）、/intake?since=（带 x-token 只读 GET 拉新上报），以及
// 【第 8 档】/report（带 x-token POST 一条同协议上报——刷新回程
// 转发新链接给 cron 下载器）。中转
// 地址与密钥是本工作台服务端内置配置（用户自部署的私有中转、
// 按其明确要求内置），只出现在这段服务端代码里：不拼进任何错
// 误文案、不打印、原样返回的 bodyJson 是中转自己的响应（里面
// 没有密钥）。失败时只回 HTTP 状态码与截断后的响应原文/异常名。
const RELAY_PY = `
import json, os, sys, urllib.request, urllib.error, urllib.parse

BASE = "https://smzs-relay.weathered-breeze-337c.workers.dev"
TOKEN = os.environ.get("SMZS_RELAY_TOKEN", "")

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args):
        raise RuntimeError("redirect refused, verify the endpoint")

def opener():
    return urllib.request.build_opener(NoRedirect())

def emit(obj):
    sys.stdout.write("RESULT_JSON:" + json.dumps(obj, ensure_ascii=False) + "\\n")
    sys.stdout.flush()

def do_get(path, with_token):
    if with_token and not TOKEN:
        return None, None, "中转站 token 未配置（U6 待定：等用户拍板后再接通）"
    r = urllib.request.Request(BASE + path, method="GET")
    if with_token:
        r.add_header("x-token", TOKEN)
    r.add_header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36")
    try:
        with opener().open(r, timeout=20) as resp:
            body = resp.read().decode("utf-8", "replace")
            return resp.status, body, None
    except urllib.error.HTTPError as e:
        body = ""
        try:
            body = e.read().decode("utf-8", "replace")
        except Exception:
            body = ""
        return e.code, body, None
    except Exception as e:
        return None, None, type(e).__name__ + ": " + str(e)[:300]

def do_post(path, payload):
    if not TOKEN:
        return None, None, "中转站 token 未配置（U6 待定：等用户拍板后再接通）"
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    r = urllib.request.Request(BASE + path, data=data, method="POST")
    r.add_header("x-token", TOKEN)
    r.add_header("Content-Type", "application/json")
    r.add_header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36")
    try:
        with opener().open(r, timeout=20) as resp:
            body = resp.read().decode("utf-8", "replace")
            return resp.status, body, None
    except urllib.error.HTTPError as e:
        body = ""
        try:
            body = e.read().decode("utf-8", "replace")
        except Exception:
            body = ""
        return e.code, body, None
    except Exception as e:
        return None, None, type(e).__name__ + ": " + str(e)[:300]

def main():
    req_in = json.load(sys.stdin)
    mode = req_in.get("mode")
    if mode == "ping":
        status, body, err = do_get("/ping", False)
        if err:
            emit({"ok": False, "httpStatus": None, "bodyJson": None, "error": "中转 ping 没通：" + err})
            return
        emit({"ok": status == 200, "httpStatus": status, "bodyJson": body, "error": None if status == 200 else "中转 ping 返回 HTTP " + str(status)})
        return
    if mode == "report":
        try:
            payload = json.loads(str(req_in.get("payloadJson") or ""))
        except Exception:
            emit({"ok": False, "httpStatus": None, "bodyJson": None, "error": "上报内容不是合法 JSON，未发送"})
            return
        if not isinstance(payload, dict) or payload.get("protocol") != "smzs-monitor-intake/1" or not payload.get("reportedAt") or not isinstance(payload.get("rows"), list):
            emit({"ok": False, "httpStatus": None, "bodyJson": None, "error": "上报内容不符合 smzs-monitor-intake/1 协议，未发送"})
            return
        status, body, err = do_post("/report", payload)
        if err:
            emit({"ok": False, "httpStatus": None, "bodyJson": None, "error": "中转不可达：" + err})
            return
        emit({"ok": status == 200, "httpStatus": status, "bodyJson": body, "error": None if status == 200 else "中转返回 HTTP " + str(status)})
        return
    since = str(req_in.get("since") or "")
    path = "/intake?since=" + urllib.parse.quote(since, safe="")
    status, body, err = do_get(path, True)
    if err:
        emit({"ok": False, "httpStatus": None, "bodyJson": None, "error": "中转不可达：" + err})
        return
    emit({"ok": status == 200, "httpStatus": status, "bodyJson": body, "error": None if status == 200 else "中转返回 HTTP " + str(status)})

main()
`;

// v4.65 云端下载小助手：特权层运行时的 fetch 在本机回环 / 部分
// CDN 上会被直接重置连接（ECONNRESET），而 urllib 是本文件其
// 它通道（中转代拉）一直在用的成熟路径——下载也走它：流式
// 分块写调用方给的临时文件，总时限 60 秒（deadline 逐块查），
// 单文件上限由调用方传 maxBytes（Content-Length 预检 + 边读
// 边计数双拦）；结果只回结构化字段（kind / httpStatus /
// sizeBytes / error），文件改名与清单更新由 Node 侧做。
const CLOUD_DL_PY = `
import json, sys, time, urllib.request, urllib.error

MAX_SECONDS = 60

def emit(obj):
    sys.stdout.write("RESULT_JSON:" + json.dumps(obj, ensure_ascii=False) + "\\n")
    sys.stdout.flush()

def main():
    req_in = json.load(sys.stdin)
    url = str(req_in.get("url") or "")
    tmp_path = str(req_in.get("tmpPath") or "")
    max_bytes = int(req_in.get("maxBytes") or 0)
    deadline = time.time() + MAX_SECONDS
    r = urllib.request.Request(url, method="GET")
    r.add_header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36")
    try:
        resp = urllib.request.urlopen(r, timeout=20)
    except urllib.error.HTTPError as e:
        emit({"ok": False, "kind": "http", "httpStatus": e.code, "sizeBytes": 0, "error": "HTTP " + str(e.code)})
        return
    except Exception as e:
        emit({"ok": False, "kind": "network", "httpStatus": None, "sizeBytes": 0, "error": type(e).__name__ + ": " + str(e)[:300]})
        return
    total = 0
    try:
        with resp:
            declared = resp.headers.get("Content-Length")
            if declared:
                try:
                    if int(declared) > max_bytes:
                        emit({"ok": False, "kind": "oversize", "httpStatus": resp.status, "sizeBytes": 0, "error": "declared " + declared})
                        return
                except ValueError:
                    pass
            with open(tmp_path, "wb") as f:
                while True:
                    if time.time() > deadline:
                        emit({"ok": False, "kind": "timeout", "httpStatus": resp.status, "sizeBytes": total, "error": "deadline 60s"})
                        return
                    chunk = resp.read(262144)
                    if not chunk:
                        break
                    total += len(chunk)
                    if total > max_bytes:
                        emit({"ok": False, "kind": "oversize", "httpStatus": resp.status, "sizeBytes": total, "error": "streamed over limit"})
                        return
                    f.write(chunk)
    except Exception as e:
        emit({"ok": False, "kind": "network", "httpStatus": None, "sizeBytes": total, "error": type(e).__name__ + ": " + str(e)[:300]})
        return
    emit({"ok": True, "kind": "done", "httpStatus": resp.status, "sizeBytes": total, "error": None})

main()
`;

// v4.75 场景检测小助手：对一个本地视频文件做内容感知场景切分。
// 首选 PySceneDetect（ContentDetector，阈值 27，业界事实标准）；
// 没装 scenedetect / cv2 时回落 ffmpeg 的 select='gt(scene,0.40)'
// + showinfo（ffmpeg 内置的帧差场景评分，同样是内容感知切分）。
// 切分点后处理：排序、去掉片头 0.5 秒内与片尾 1 秒内的点、相邻
// 点近于 1.5 秒只留第一个。只回结构化结果（method / durationSec
// / cuts），不碰任何文件。
const SCENE_DETECT_PY = `
import json, re, subprocess, sys

def emit(obj):
    sys.stdout.write("RESULT_JSON:" + json.dumps(obj, ensure_ascii=False) + "\\n")
    sys.stdout.flush()

def probe_duration(path):
    try:
        r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path], capture_output=True, text=True, timeout=30)
        return float((r.stdout or "").strip())
    except Exception:
        return 0.0

def clean_cuts(cuts, duration):
    out = []
    for c in sorted(float(x) for x in cuts):
        if c < 0.5:
            continue
        if duration > 0 and c > duration - 1.0:
            continue
        if out and c - out[-1] < 1.5:
            continue
        out.append(round(c, 1))
    return out

def via_pyscenedetect(path):
    from scenedetect import detect, ContentDetector
    scenes = detect(path, ContentDetector(threshold=27.0), show_progress=False)
    cuts = []
    duration = 0.0
    for start, end in scenes:
        cuts.append(start.get_seconds())
        duration = max(duration, end.get_seconds())
    cuts = cuts[1:] if len(cuts) > 1 else []
    return duration, cuts

def via_ffmpeg(path):
    duration = probe_duration(path)
    cmd = ["ffmpeg", "-v", "info", "-i", path, "-filter:v", "select='gt(scene,0.40)',showinfo", "-an", "-f", "null", "-"]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    cuts = []
    for line in (r.stderr or "").splitlines():
        if "showinfo" not in line:
            continue
        m = re.search(r"pts_time:\\s*([0-9]+(?:\\.[0-9]+)?)", line)
        if m:
            cuts.append(float(m.group(1)))
    return duration, cuts

def main():
    req_in = json.load(sys.stdin)
    path = str(req_in.get("path") or "")
    errors = []
    for method, fn in (("pyscenedetect", via_pyscenedetect), ("ffmpeg", via_ffmpeg)):
        try:
            duration, cuts = fn(path)
            if duration <= 0:
                duration = probe_duration(path)
            emit({"ok": True, "method": method, "durationSec": round(float(duration), 1), "cuts": clean_cuts(cuts, duration), "error": None})
            return
        except Exception as e:
            errors.append(method + ": " + type(e).__name__ + ": " + str(e)[:200])
    emit({"ok": False, "method": "none", "durationSec": 0, "cuts": [], "error": "; ".join(errors)[:400]})

main()
`;

// v4.67 云端后台队列 worker：由特权层写入
// ~/workspace/video-cloud/queue-worker.py 并以 detached 方式拉起的
// 独立进程，与工作台页面、服务端动作进程都无关——页面关掉照下，
// 进程退出后由下一次入队 / 状态查询重新拉起续跑。队列状态全在
// queue.json（与 state.json 同目录），本进程只通过加锁的原子写
// 更新它；并发 3（ThreadPoolExecutor），单个下载 60 秒 deadline、
// 500MB 上限，下载成功后以同样的文件锁口径合并进 state.json。
// 失败分类：http 403/410 直接失败不重试（链接过期、提示重采）；
// oversize 直接失败；timeout / network 自动重试 1 次再记失败。
// 收不全（Content-Length 声明长度与实收不符）按 network 计、可重试
// 1 次（P5 修：urllib 在干净 FIN 断开时不抛错，原代码会把半截文件记成功）。
const QUEUE_WORKER_PY = `
import json, os, re, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor

BASE = os.path.join(os.environ["DATA_DIR"], "video-cloud") if os.environ.get("DATA_DIR") else os.path.expanduser("~/workspace/video-cloud")
QUEUE_PATH = os.path.join(BASE, "queue.json")
STATE_PATH = os.path.join(BASE, "state.json")
VIDEOS_DIR = os.path.join(BASE, "videos")
QUEUE_LOCK = QUEUE_PATH + ".lock"
STATE_LOCK = STATE_PATH + ".lock"
PID_PATH = os.path.join(BASE, "queue-worker.pid")
ID_RE = re.compile(r"^[A-Za-z0-9_-]+$")
MAX_BYTES = 500 * 1024 * 1024
MAX_SECONDS = 60
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"

def acquire_lock(path):
    deadline = time.time() + 15
    while True:
        try:
            fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.write(fd, str(os.getpid()).encode())
            os.close(fd)
            return True
        except FileExistsError:
            try:
                st = os.stat(path)
                if time.time() - st.st_mtime > 60:
                    os.unlink(path)
                    continue
            except OSError:
                continue
            if time.time() > deadline:
                return False
            time.sleep(0.1)

def release_lock(path):
    try:
        os.unlink(path)
    except OSError:
        pass

def load_queue():
    try:
        with open(QUEUE_PATH, "r", encoding="utf-8") as f:
            q = json.load(f)
        if isinstance(q, dict) and isinstance(q.get("items"), list):
            return q
    except Exception:
        pass
    return {"version": 1, "batchId": None, "batchFinishedAt": None, "items": []}

def save_queue(q):
    tmp = QUEUE_PATH + ".tmp-" + str(os.getpid())
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(q, f, ensure_ascii=False, indent=2)
    os.replace(tmp, QUEUE_PATH)

def update_item(item_id, fields):
    if not acquire_lock(QUEUE_LOCK):
        return
    try:
        q = load_queue()
        for it in q["items"]:
            if it.get("id") == item_id:
                it.update(fields)
                break
        save_queue(q)
    except Exception:
        pass
    finally:
        release_lock(QUEUE_LOCK)

def now_iso():
    return time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime())

def state_stamp():
    return time.strftime("%Y-%m-%d %H:%M", time.localtime())

def upsert_state(video_id, entry):
    if not acquire_lock(STATE_LOCK):
        raise RuntimeError("state lock busy")
    try:
        state = {}
        try:
            with open(STATE_PATH, "r", encoding="utf-8") as f:
                parsed = json.load(f)
            if isinstance(parsed, dict):
                state = parsed
        except Exception:
            state = {}
        downloaded = state.get("downloaded")
        if not isinstance(downloaded, dict):
            downloaded = {}
        downloaded[video_id] = entry
        state["downloaded"] = downloaded
        tmp = STATE_PATH + ".tmp-" + str(os.getpid())
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(state, f, ensure_ascii=False, indent=2)
        os.replace(tmp, STATE_PATH)
    finally:
        release_lock(STATE_LOCK)

def already_saved_size(video_id):
    try:
        with open(STATE_PATH, "r", encoding="utf-8") as f:
            state = json.load(f)
        downloaded = state.get("downloaded") or {}
        if video_id in downloaded:
            st = os.stat(os.path.join(VIDEOS_DIR, video_id + ".mp4"))
            if st.st_size > 0:
                return st.st_size
    except Exception:
        pass
    return 0

def download_once(url, tmp_path):
    deadline = time.time() + MAX_SECONDS
    req = urllib.request.Request(url, method="GET")
    req.add_header("User-Agent", UA)
    try:
        resp = urllib.request.urlopen(req, timeout=20)
    except urllib.error.HTTPError as e:
        return ("http", e.code, 0, "HTTP " + str(e.code))
    except Exception as e:
        return ("network", None, 0, type(e).__name__ + ": " + str(e)[:200])
    status = getattr(resp, "status", None)
    total = 0
    declared_len = None
    try:
        with resp:
            declared = resp.headers.get("Content-Length")
            if declared:
                try:
                    declared_len = int(declared)
                    if declared_len > MAX_BYTES:
                        return ("oversize", status, 0, "declared too big")
                except ValueError:
                    pass
            with open(tmp_path, "wb") as f:
                while True:
                    if time.time() > deadline:
                        return ("timeout", status, total, "deadline 60s")
                    chunk = resp.read(262144)
                    if not chunk:
                        break
                    total += len(chunk)
                    if total > MAX_BYTES:
                        return ("oversize", status, total, "streamed over limit")
                    f.write(chunk)
    except Exception as e:
        return ("network", None, total, type(e).__name__ + ": " + str(e)[:200])
    # P5 修复（2026-11-10）：urllib 在对方中途断开（干净 FIN）时，
    # read() 只返回已收到的部分字节、再返回 b''，不抛 IncompleteRead，
    # 原代码会把半截文件当 success 存盘（实测 20480/245760 字节记成功）。
    # 声明了 Content-Length 就必须收满，否则按网络中断计（可自动重试 1 次）。
    if declared_len is not None and total != declared_len:
        return ("network", status, total, "incomplete: got %d of %d bytes" % (total, declared_len))
    return ("done", status, total, None)

def fail(item_id, attempts, msg):
    update_item(item_id, {"status": "failed", "error": msg, "attempts": attempts, "finishedAt": now_iso()})

def process_item(item):
    item_id = item.get("id")
    video_id = str(item.get("videoId") or "")
    url = str(item.get("url") or "")
    if not ID_RE.match(video_id):
        fail(item_id, 1, "视频ID不合法，没法存入云端。")
        return
    if not url:
        fail(item_id, 1, "这条视频没有文件链接（采集时没拿到），请重新采集后再存。")
        return
    if not (url.startswith("http://") or url.startswith("https://")):
        fail(item_id, 1, "视频链接格式不对，没法下载。")
        return
    existing = already_saved_size(video_id)
    if existing > 0:
        update_item(item_id, {"status": "success", "error": None, "sizeBytes": existing, "attempts": 1, "finishedAt": now_iso()})
        return
    try:
        os.makedirs(VIDEOS_DIR, exist_ok=True)
    except Exception as e:
        fail(item_id, 1, "云端目录建不出来：" + str(e)[:200])
        return
    final_path = os.path.join(VIDEOS_DIR, video_id + ".mp4")
    tmp_path = final_path + ".qpart-" + str(os.getpid()) + "-" + str(item_id)[-8:]
    attempts = 0
    while True:
        attempts += 1
        kind, status, size, err = download_once(url, tmp_path)
        if kind == "done" and size > 0:
            try:
                os.replace(tmp_path, final_path)
            except Exception as e:
                fail(item_id, attempts, "下载完成了但存入云端目录失败：" + str(e)[:200])
                return
            try:
                upsert_state(video_id, {"file": video_id + ".mp4", "size": size, "at": state_stamp()})
            except Exception as e:
                fail(item_id, attempts, "视频已经下载到云端，但清单（state.json）没更新成：" + str(e)[:200])
                return
            update_item(item_id, {"status": "success", "error": None, "sizeBytes": size, "attempts": attempts, "finishedAt": now_iso()})
            return
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        if kind == "done":
            fail(item_id, attempts, "下载失败：文件是空的，没有存成。")
            return
        if kind == "http":
            if status in (403, 410):
                fail(item_id, attempts, "链接已过期（对方返回 " + str(status) + "），请重新采集后再存。")
            else:
                fail(item_id, attempts, "下载失败：对方返回 " + str(status) + "，没有下载成功。")
            return
        if kind == "oversize":
            fail(item_id, attempts, "这个视频文件超过 500MB 上限，没有下载。")
            return
        if attempts < 2:
            update_item(item_id, {"attempts": attempts})
            continue
        if kind == "timeout":
            fail(item_id, attempts, "下载超时（60 秒没下完），已自动重试 1 次仍失败。")
        else:
            fail(item_id, attempts, "下载失败（网络中断：" + str(err) + "），已自动重试 1 次仍失败。")
        return

def main():
    try:
        os.makedirs(VIDEOS_DIR, exist_ok=True)
    except Exception:
        pass
    try:
        with open(PID_PATH, "w", encoding="utf-8") as f:
            f.write(str(os.getpid()))
    except Exception:
        pass
    if acquire_lock(QUEUE_LOCK):
        try:
            q = load_queue()
            changed = False
            for it in q["items"]:
                if it.get("status") == "downloading":
                    it["status"] = "queued"
                    changed = True
            if changed:
                save_queue(q)
        except Exception:
            pass
        finally:
            release_lock(QUEUE_LOCK)
    executor = ThreadPoolExecutor(max_workers=3)
    futures = {}
    try:
        while True:
            for fid in [k for k, fu in futures.items() if fu.done()]:
                fu = futures.pop(fid)
                try:
                    fu.result()
                except Exception:
                    pass
            q = load_queue()
            items = q.get("items") or []
            queued = [it for it in items if it.get("status") == "queued"]
            slots = 3 - len(futures)
            if slots > 0 and queued:
                for it in queued[:slots]:
                    iid = it.get("id")
                    if iid in futures:
                        continue
                    claimed = False
                    snapshot = None
                    if acquire_lock(QUEUE_LOCK):
                        try:
                            q2 = load_queue()
                            for it2 in q2["items"]:
                                if it2.get("id") == iid and it2.get("status") == "queued":
                                    it2["status"] = "downloading"
                                    it2["startedAt"] = now_iso()
                                    claimed = True
                                    snapshot = dict(it2)
                                    break
                            if claimed:
                                save_queue(q2)
                        except Exception:
                            claimed = False
                        finally:
                            release_lock(QUEUE_LOCK)
                    if claimed and snapshot is not None:
                        futures[iid] = executor.submit(process_item, snapshot)
                time.sleep(0.2)
                continue
            if not queued and not futures:
                if items and all(it.get("status") in ("success", "failed") for it in items):
                    if acquire_lock(QUEUE_LOCK):
                        try:
                            q3 = load_queue()
                            its = q3.get("items") or []
                            if its and all(x.get("status") in ("success", "failed") for x in its) and not q3.get("batchFinishedAt"):
                                q3["batchFinishedAt"] = now_iso()
                                save_queue(q3)
                        except Exception:
                            pass
                        finally:
                            release_lock(QUEUE_LOCK)
                break
            time.sleep(0.4)
    finally:
        executor.shutdown(wait=True)
        try:
            with open(PID_PATH, "r", encoding="utf-8") as f:
                cur = f.read().strip()
            if cur == str(os.getpid()):
                os.unlink(PID_PATH)
        except Exception:
            pass

main()
`;

type GeeknowRaw = {
  ok?: unknown;
  kind?: unknown;
  sizeBytes?: unknown;
  models?: unknown;
  imageBase64?: unknown;
  mimeType?: unknown;
  error?: unknown;
  taskId?: unknown;
  status?: unknown;
  authFailed?: unknown;
  authOk?: unknown;
  usedCustomKey?: unknown;
  httpStatus?: unknown;
  bodyJson?: unknown;
  previewBase64?: unknown;
  refImageUrls?: unknown;
  urls?: unknown;
  stage?: unknown;
  // v5.97 参考图托管双路线回传。
  route?: unknown;
  hostRoute?: unknown;
  colorName?: unknown;
  labL?: unknown;
  labA?: unknown;
  labB?: unknown;
  nearestDeltaE?: unknown;
  secondDeltaE?: unknown;
  clusterShare?: unknown;
  confidence?: unknown;
  // v4.75 场景检测小助手（SCENE_DETECT_PY）的回传字段。
  method?: unknown;
  durationSec?: unknown;
  cuts?: unknown;
};

// v3.64 预览图小程序（v5.57 降质：≤480px、quality 68，与客户端
// 补生成同口径）：与 Geeknow 同一条 python3 运行时，只用 PIL 把
// 原图缩成小 JPEG；不碰任何网络与凭证。
const PREVIEW_PY = `
import json, sys, base64, io
sys.path.insert(0, "/opt/muse/skills/custom-connector-setup/bin")

def emit(obj):
    sys.stdout.write("RESULT_JSON:" + json.dumps(obj, ensure_ascii=False) + "\\n")
    sys.stdout.flush()

def main():
    req_in = json.load(sys.stdin)
    try:
        from PIL import Image
        raw = base64.b64decode(req_in["dataBase64"])
        im = Image.open(io.BytesIO(raw))
        im.load()
        rgba = im.convert("RGBA")
        bg = Image.new("RGB", rgba.size, (255, 255, 255))
        bg.paste(rgba, mask=rgba.split()[3])
        bg.thumbnail((480, 480), Image.LANCZOS)
        buf = io.BytesIO()
        bg.save(buf, "JPEG", quality=68)
        emit({"ok": True, "imageBase64": base64.b64encode(buf.getvalue()).decode("ascii"), "error": None})
    except Exception as e:
        emit({"ok": False, "imageBase64": None, "error": "预览图生成失败：" + type(e).__name__ + ": " + str(e)[:300]})

main()
`;

// v3.67 发色测色小程序：头发带采样 + LAB / CIEDE2000 分类。
// 采样带取画面顶部 2%–30%（这些人物资产图里头发都在上方：左侧头部
// 特写与各全身像的头部）；剔除近白背景（高亮低饱和）与肤色盒像素
// （L 42–88、a 6–26、b 4–28 且 r>g>b），剩余像素按 Lab 量化聚类，
// 主导簇取均值 Lab，与发色调色板逐个算 CIEDE2000 色差取最近名。
// 置信度由主导簇占比、最近色差、与第二名间距共同决定，测不准回
// low，绝不硬报确定颜色。只用 PIL + math，不碰网络与凭证。
const HAIR_PY = `
import json, sys, base64, io, math

def emit(obj):
    sys.stdout.write("RESULT_JSON:" + json.dumps(obj, ensure_ascii=False) + "\\n")
    sys.stdout.flush()

def srgb_to_lab(r, g, b):
    def f(c):
        c = c / 255.0
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    R, G, B = f(r), f(g), f(b)
    X = R * 0.4124 + G * 0.3576 + B * 0.1805
    Y = R * 0.2126 + G * 0.7152 + B * 0.0722
    Z = R * 0.0193 + G * 0.1192 + B * 0.9505
    X, Y, Z = X / 0.95047, Y / 1.0, Z / 1.08883
    def g(t):
        return t ** (1 / 3) if t > 0.008856 else 7.787 * t + 16 / 116
    fx, fy, fz = g(X), g(Y), g(Z)
    return (116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz))

def ciede2000(lab1, lab2):
    L1, a1, b1 = lab1
    L2, a2, b2 = lab2
    C1 = math.hypot(a1, b1)
    C2 = math.hypot(a2, b2)
    Cbar = (C1 + C2) / 2
    G = 0.5 * (1 - math.sqrt(Cbar ** 7 / (Cbar ** 7 + 25 ** 7))) if Cbar > 0 else 0.5
    a1p = a1 * (1 + G)
    a2p = a2 * (1 + G)
    C1p = math.hypot(a1p, b1)
    C2p = math.hypot(a2p, b2)
    def hp(ap, b):
        if ap == 0 and b == 0:
            return 0.0
        h = math.degrees(math.atan2(b, ap))
        return h + 360 if h < 0 else h
    h1p = hp(a1p, b1)
    h2p = hp(a2p, b2)
    dLp = L2 - L1
    dCp = C2p - C1p
    if C1p * C2p == 0:
        dhp = 0.0
    else:
        dhp = h2p - h1p
        if dhp > 180:
            dhp -= 360
        elif dhp < -180:
            dhp += 360
    dHp = 2 * math.sqrt(C1p * C2p) * math.sin(math.radians(dhp) / 2)
    Lbarp = (L1 + L2) / 2
    Cbarp = (C1p + C2p) / 2
    if C1p * C2p == 0:
        hbarp = h1p + h2p
    elif abs(h1p - h2p) <= 180:
        hbarp = (h1p + h2p) / 2
    elif h1p + h2p < 360:
        hbarp = (h1p + h2p + 360) / 2
    else:
        hbarp = (h1p + h2p - 360) / 2
    T = (1 - 0.17 * math.cos(math.radians(hbarp - 30)) + 0.24 * math.cos(math.radians(2 * hbarp)) + 0.32 * math.cos(math.radians(3 * hbarp + 6)) - 0.20 * math.cos(math.radians(4 * hbarp - 63)))
    dTheta = 30 * math.exp(-(((hbarp - 275) / 25) ** 2))
    Rc = 2 * math.sqrt(Cbarp ** 7 / (Cbarp ** 7 + 25 ** 7)) if Cbarp > 0 else 0.0
    Sl = 1 + (0.015 * (Lbarp - 50) ** 2) / math.sqrt(20 + (Lbarp - 50) ** 2)
    Sc = 1 + 0.045 * Cbarp
    Sh = 1 + 0.015 * Cbarp * T
    Rt = -math.sin(math.radians(2 * dTheta)) * Rc
    return math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh))

PALETTE = [
    ("黑色", (10, 0, 0)),
    ("深棕色", (22, 5, 11)),
    ("棕色", (34, 9, 17)),
    ("浅棕色", (48, 11, 22)),
    ("金色", (68, 5, 33)),
    ("红色", (38, 44, 22)),
    ("粉色", (72, 40, 2)),
    ("橙色", (56, 36, 46)),
    ("灰色", (55, 0, 0)),
    ("银白色", (84, 0, 2)),
    ("蓝色", (38, 10, -32)),
    ("紫色", (34, 27, -27)),
    ("绿色", (46, -36, 16)),
]

def main():
    req_in = json.load(sys.stdin)
    try:
        from PIL import Image
        raw = base64.b64decode(req_in["dataBase64"])
        im = Image.open(io.BytesIO(raw))
        im.load()
        rgb = im.convert("RGB")
        rgb.thumbnail((360, 360), Image.LANCZOS)
        W, H = rgb.size
        px = rgb.load()
        y0 = int(H * 0.02)
        y1 = max(y0 + 4, int(H * 0.30))
        bins = {}
        kept = 0
        for y in range(y0, y1, 2):
            for x in range(0, W, 2):
                r, g, b = px[x, y]
                mx = max(r, g, b)
                mn = min(r, g, b)
                sat = 0 if mx == 0 else (mx - mn) / mx
                if mn > 228 and sat < 0.14:
                    continue
                L, A, Bc = srgb_to_lab(r, g, b)
                if 42 <= L <= 88 and 6 <= A <= 26 and 4 <= Bc <= 28 and r > g > b:
                    continue
                kept += 1
                key = (int(L // 10), int(A // 10), int(Bc // 10))
                if key not in bins:
                    bins[key] = [0, 0.0, 0.0, 0.0]
                cell = bins[key]
                cell[0] += 1
                cell[1] += L
                cell[2] += A
                cell[3] += Bc
        if kept < 200 or not bins:
            emit({"ok": False, "colorName": None, "labL": None, "labA": None, "labB": None, "nearestDeltaE": None, "secondDeltaE": None, "clusterShare": 0, "confidence": "low", "error": "头发区域可采样像素太少，测不出主导发色"})
            return
        top = max(bins.values(), key=lambda c: c[0])
        center = (top[1] / top[0], top[2] / top[0], top[3] / top[0])
        members = [c for c in bins.values() if ciede2000((c[1] / c[0], c[2] / c[0], c[3] / c[0]), center) <= 12]
        tot = sum(c[0] for c in members)
        mean = (sum(c[1] for c in members) / tot, sum(c[2] for c in members) / tot, sum(c[3] for c in members) / tot)
        share = tot / kept
        dists = sorted(((ciede2000(mean, lab), name) for name, lab in PALETTE), key=lambda t: t[0])
        d0, name0 = dists[0]
        d1 = dists[1][0]
        if share >= 0.45 and d0 <= 5 and (d1 - d0) >= 2.5:
            conf = "high"
        elif share >= 0.25 and d0 <= 9:
            conf = "medium"
        else:
            conf = "low"
        emit({"ok": True, "colorName": name0, "labL": round(mean[0], 1), "labA": round(mean[1], 1), "labB": round(mean[2], 1), "nearestDeltaE": round(d0, 2), "secondDeltaE": round(d1, 2), "clusterShare": round(share, 3), "confidence": conf, "error": None})
    except Exception as e:
        emit({"ok": False, "colorName": None, "labL": None, "labA": None, "labB": None, "nearestDeltaE": None, "secondDeltaE": None, "clusterShare": 0, "confidence": "low", "error": "发色测色失败：" + type(e).__name__ + ": " + str(e)[:300]})

main()
`;

function runPythonHelper(
  script: string,
  payload: Record<string, unknown>,
): Promise<GeeknowRaw> {
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>;
    let py: ReturnType<typeof resolvePython>;
    try {
      py = resolvePython();
    } catch (e) {
      resolve({
        ok: false,
        error: e instanceof Error ? e.message : "找不到可用的 Python",
      });
      return;
    }
    try {
      child = spawn(py.cmd, [...py.argsPrefix, "-c", script], {
        stdio: ["pipe", "pipe", "pipe"],
        env: pythonHelperEnv(),
      });
    } catch {
      resolve({ ok: false, error: "无法启动图片处理程序" });
      return;
    }
    const outChunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    let settled = false;
    const done = (v: GeeknowRaw) => {
      if (settled) return;
      settled = true;
      resolve(v);
    };
    child.stdout?.on("data", (d: Buffer) => outChunks.push(d));
    child.stderr?.on("data", (d: Buffer) => errChunks.push(d));
    child.on("error", () =>
      done({ ok: false, error: "无法启动 Geeknow 调用程序" }),
    );
    child.on("close", () => {
      const text = Buffer.concat(outChunks).toString("utf8");
      const line = text
        .split("\n")
        .find((l) => l.startsWith("RESULT_JSON:"));
      if (!line) {
        const tail = Buffer.concat(errChunks).toString("utf8").slice(-300);
        done({
          ok: false,
          error: `Geeknow 调用没有返回结果${tail ? `：${tail}` : ""}`,
        });
        return;
      }
      try {
        done(JSON.parse(line.slice("RESULT_JSON:".length)) as GeeknowRaw);
      } catch {
        done({ ok: false, error: "Geeknow 返回结果无法解析" });
      }
    });
    child.stdin?.write(JSON.stringify(payload));
    child.stdin?.end();
  });
}

export const privilegedHandlers = definePrivilegedHandlers(privileged, {
  async geeknowListImageModels(_args, auth) {
    const raw = await runPythonHelper(GEEKNOW_PY, {
      mode: "models",
      ...resolveGeeknowCredentials(undefined, auth),
    });
    const models = Array.isArray(raw.models)
      ? raw.models.filter((m): m is string => typeof m === "string")
      : [];
    return {
      ok: raw.ok === true,
      models,
      error:
        typeof raw.error === "string"
          ? raw.error
          : raw.ok === true
            ? null
            : "Geeknow 模型列表读取失败",
    };
  },
  async geeknowGenerateImage(args, auth) {
    const raw = await runPythonHelper(GEEKNOW_PY, {
      mode: "generate",
      model: args.model,
      prompt: args.prompt,
      quality: args.quality,
      size: args.size,
      requestTimeoutSec: args.requestTimeoutSec,
      downloadTimeoutSec: args.downloadTimeoutSec,
      retryCount: args.retryCount,
      referenceImages: args.referenceImages,
      ...resolveGeeknowCredentials(undefined, auth),
    });
    const ok = raw.ok === true && typeof raw.imageBase64 === "string";
    return {
      ok,
      imageBase64: typeof raw.imageBase64 === "string" ? raw.imageBase64 : null,
      mimeType: typeof raw.mimeType === "string" ? raw.mimeType : null,
      error:
        typeof raw.error === "string"
          ? raw.error
          : ok
            ? null
            : "Geeknow 生图失败",
      previewBase64:
        typeof raw.previewBase64 === "string" ? raw.previewBase64 : null,
    };
  },
  async geeknowSubmitImageTask(args, auth) {
    const raw = await runPythonHelper(GEEKNOW_PY, {
      mode: "submit",
      model: args.model,
      prompt: args.prompt,
      quality: args.quality,
      size: args.size,
      requestTimeoutSec: args.requestTimeoutSec,
      downloadTimeoutSec: args.downloadTimeoutSec,
      retryCount: args.retryCount,
      referenceImages: args.referenceImages,
      referenceImageUrls: args.referenceImageUrls,
      ...resolveGeeknowCredentials(
        { apiKey: args.apiKey, apiBase: args.apiBase },
        auth,
      ),
    });
    const ok = raw.ok === true;
    return {
      ok,
      taskId: typeof raw.taskId === "string" ? raw.taskId : null,
      imageBase64: typeof raw.imageBase64 === "string" ? raw.imageBase64 : null,
      mimeType: typeof raw.mimeType === "string" ? raw.mimeType : null,
      error:
        typeof raw.error === "string"
          ? raw.error
          : ok
            ? null
            : "Geeknow 异步提交失败",
      previewBase64:
        typeof raw.previewBase64 === "string" ? raw.previewBase64 : null,
      refImageUrls: Array.isArray(raw.refImageUrls)
        ? raw.refImageUrls.filter(
            (u): u is string => typeof u === "string",
          )
        : [],
      stage: typeof raw.stage === "string" ? raw.stage : null,
      authFailed: raw.authFailed === true,
      hostRoute: typeof raw.hostRoute === "string" ? raw.hostRoute : null,
    };
  },
  async geeknowHostReferenceImages(args, auth) {
    const raw = await runPythonHelper(GEEKNOW_PY, {
      mode: "hostrefs",
      referenceImages: args.referenceImages,
      ...resolveGeeknowCredentials(
        { apiKey: args.apiKey, apiBase: args.apiBase },
        auth,
      ),
    });
    const ok = raw.ok === true;
    return {
      ok,
      urls: Array.isArray(raw.urls)
        ? raw.urls.filter((u): u is string => typeof u === "string")
        : [],
      error:
        typeof raw.error === "string"
          ? raw.error
          : ok
            ? null
            : "参考图换链接失败",
      stage: typeof raw.stage === "string" ? raw.stage : null,
      route: typeof raw.route === "string" ? raw.route : null,
    };
  },
  async geeknowProbeAuth(args, auth) {
    const raw = await runPythonHelper(GEEKNOW_PY, {
      mode: "probe",
      ...resolveGeeknowCredentials(
        { apiKey: args.apiKey, apiBase: args.apiBase },
        auth,
      ),
    });
    return {
      ok: raw.ok === true,
      authOk: raw.authOk === true,
      usedCustomKey: raw.usedCustomKey === true,
      httpStatus: typeof raw.httpStatus === "number" ? raw.httpStatus : null,
      error: typeof raw.error === "string" ? raw.error : null,
    };
  },
  async geeknowPollImageTask(args, auth) {    const raw = await runPythonHelper(GEEKNOW_PY, {
      mode: "poll",
      taskId: args.taskId,
      downloadTimeoutSec: args.downloadTimeoutSec,
      ...resolveGeeknowCredentials(
        { apiKey: args.apiKey, apiBase: args.apiBase },
        auth,
      ),
    });
    const status =
      typeof raw.status === "string"
        ? raw.status
        : raw.ok === true
          ? "pending"
          : "error";
    return {
      ok: raw.ok === true,
      status,
      imageBase64: typeof raw.imageBase64 === "string" ? raw.imageBase64 : null,
      mimeType: typeof raw.mimeType === "string" ? raw.mimeType : null,
      error:
        typeof raw.error === "string"
          ? raw.error
          : raw.ok === true
            ? null
            : "查询生图任务失败",
      previewBase64:
        typeof raw.previewBase64 === "string" ? raw.previewBase64 : null,
    };
  },
  async makeImagePreview(args) {
    const raw = await runPythonHelper(PREVIEW_PY, {
      dataBase64: args.dataBase64,
      mimeType: args.mimeType,
    });
    const ok = raw.ok === true && typeof raw.imageBase64 === "string";
    return {
      ok,
      imageBase64: typeof raw.imageBase64 === "string" ? raw.imageBase64 : null,
      error:
        typeof raw.error === "string"
          ? raw.error
          : ok
            ? null
            : "预览图生成失败",
    };
  },
  async measureHairColor(args) {
    const raw = await runPythonHelper(HAIR_PY, {
      dataBase64: args.dataBase64,
      mimeType: args.mimeType,
    });
    const num = (v: unknown) =>
      typeof v === "number" && Number.isFinite(v) ? v : null;
    const conf =
      raw.confidence === "high" || raw.confidence === "medium"
        ? raw.confidence
        : "low";
    return {
      ok: raw.ok === true,
      colorName: typeof raw.colorName === "string" ? raw.colorName : null,
      labL: num(raw.labL),
      labA: num(raw.labA),
      labB: num(raw.labB),
      nearestDeltaE: num(raw.nearestDeltaE),
      secondDeltaE: num(raw.secondDeltaE),
      clusterShare: num(raw.clusterShare) ?? 0,
      confidence: conf as "high" | "medium" | "low",
      error:
        typeof raw.error === "string"
          ? raw.error
          : raw.ok === true
            ? null
            : "发色测色失败",
    };
  },
  async relayFetchIntake(args) {
    const raw = await runPythonHelper(RELAY_PY, {
      mode: "intake",
      since: args.since,
    });
    return {
      ok: raw.ok === true,
      httpStatus: typeof raw.httpStatus === "number" ? raw.httpStatus : null,
      bodyJson: typeof raw.bodyJson === "string" ? raw.bodyJson : null,
      error:
        typeof raw.error === "string"
          ? raw.error
          : raw.ok === true
            ? null
            : "中转代理调用失败",
    };
  },
  async relayPing() {
    const raw = await runPythonHelper(RELAY_PY, { mode: "ping" });
    return {
      ok: raw.ok === true,
      httpStatus: typeof raw.httpStatus === "number" ? raw.httpStatus : null,
      bodyJson: typeof raw.bodyJson === "string" ? raw.bodyJson : null,
      error:
        typeof raw.error === "string"
          ? raw.error
          : raw.ok === true
            ? null
            : "中转 ping 失败",
    };
  },
  async relayPostReport(args) {
    const raw = await runPythonHelper(RELAY_PY, {
      mode: "report",
      payloadJson: args.payloadJson,
    });
    return {
      ok: raw.ok === true,
      httpStatus: typeof raw.httpStatus === "number" ? raw.httpStatus : null,
      bodyJson: typeof raw.bodyJson === "string" ? raw.bodyJson : null,
      error:
        typeof raw.error === "string"
          ? raw.error
          : raw.ok === true
            ? null
            : "中转上报失败",
    };
  },
  async cloudStorageInfo() {
    const { downloaded } = await readCloudDownloaded();
    let usedBytes = 0;
    let videoCount = 0;
    const entries: { videoId: string; file: string; size: number; at: string }[] =
      [];
    for (const [videoId, entry] of Object.entries(downloaded)) {
      videoCount += 1;
      const rec =
        entry && typeof entry === "object"
          ? (entry as { file?: unknown; size?: unknown; at?: unknown })
          : {};
      const size =
        typeof rec.size === "number" && Number.isFinite(rec.size) && rec.size > 0
          ? rec.size
          : 0;
      usedBytes += size;
      let at = "";
      if (typeof rec.at === "number" && Number.isFinite(rec.at)) {
        const d = new Date(rec.at);
        at = Number.isNaN(d.getTime()) ? String(rec.at) : d.toISOString();
      } else if (typeof rec.at === "string") {
        at = rec.at;
      }
      entries.push({
        videoId,
        file: typeof rec.file === "string" ? rec.file : "",
        size,
        at,
      });
    }
    return { ok: true, usedBytes, videoCount, entries, error: null };
  },
  async cloudVideoStat(args) {
    if (!CLOUD_VIDEO_ID_RE.test(args.videoId)) {
      return { exists: false, sizeBytes: 0 };
    }
    try {
      const st = await fs.stat(cloudVideoFilePath(args.videoId));
      if (!st.isFile()) return { exists: false, sizeBytes: 0 };
      return { exists: true, sizeBytes: st.size };
    } catch {
      return { exists: false, sizeBytes: 0 };
    }
  },
  async cloudVideoReadChunk(args) {
    if (!CLOUD_VIDEO_ID_RE.test(args.videoId)) {
      return {
        ok: false,
        dataBase64: null,
        bytesRead: 0,
        totalSize: 0,
        error: "视频ID不合法",
      };
    }
    let fh: Awaited<ReturnType<typeof fs.open>> | null = null;
    try {
      fh = await fs.open(cloudVideoFilePath(args.videoId), "r");
    } catch {
      return {
        ok: false,
        dataBase64: null,
        bytesRead: 0,
        totalSize: 0,
        error: "云端没有这个视频文件",
      };
    }
    try {
      const st = await fh.stat();
      const totalSize = st.size;
      if (args.offset >= totalSize) {
        return { ok: true, dataBase64: "", bytesRead: 0, totalSize, error: null };
      }
      const want = Math.min(args.length, totalSize - args.offset);
      const buf = Buffer.alloc(want);
      const { bytesRead } = await fh.read(buf, 0, want, args.offset);
      return {
        ok: true,
        dataBase64: buf.subarray(0, bytesRead).toString("base64"),
        bytesRead,
        totalSize,
        error: null,
      };
    } catch (e) {
      return {
        ok: false,
        dataBase64: null,
        bytesRead: 0,
        totalSize: 0,
        error: "读取云端视频失败：" + (e instanceof Error ? e.message : String(e)),
      };
    } finally {
      await fh.close().catch(() => undefined);
    }
  },
  async cloudVideoDelete(args) {
    const ids = [
      ...new Set(args.videoIds.filter((id) => CLOUD_VIDEO_ID_RE.test(id))),
    ];
    let deletedCount = 0;
    for (const id of ids) {
      try {
        await fs.unlink(cloudVideoFilePath(id));
        deletedCount += 1;
      } catch {
        // 文件不存在不报错（删除同步的既定口径）。
      }
    }
    // state.json 同步移除条目：文件缺失 / 损坏时容错跳过（视频文件
    // 已经删掉，清单下次由下载任务重写时也不会再算这条）。
    try {
      const statePath = cloudStatePath();
      const raw = await fs.readFile(statePath, "utf8");
      const parsed: unknown = JSON.parse(raw);
      if (
        parsed &&
        typeof parsed === "object" &&
        "downloaded" in parsed &&
        (parsed as { downloaded?: unknown }).downloaded &&
        typeof (parsed as { downloaded?: unknown }).downloaded === "object"
      ) {
        const state = parsed as {
          downloaded: Record<string, unknown>;
          [k: string]: unknown;
        };
        let changed = false;
        for (const id of ids) {
          if (id in state.downloaded) {
            delete state.downloaded[id];
            changed = true;
          }
        }
        if (changed) {
          const tmp = statePath + ".tmp";
          await fs.writeFile(tmp, JSON.stringify(state, null, 2), "utf8");
          await fs.rename(tmp, statePath);
        }
      }
    } catch {
      // state.json 读不到 / 写不回都不拦删除本身。
    }
    return { ok: true, deletedCount, error: null };
  },
  async cloudVideoDownload(args) {
    const fail = (error: string) => ({
      ok: false,
      alreadySaved: false,
      sizeBytes: 0,
      error,
    });
    if (!CLOUD_VIDEO_ID_RE.test(args.videoId)) {
      return fail("视频ID不合法（只允许字母、数字、下划线、中划线）。");
    }
    let target: URL;
    try {
      target = new URL(args.url);
    } catch {
      return fail("视频链接格式不对，没法下载。");
    }
    if (target.protocol !== "http:" && target.protocol !== "https:") {
      return fail("视频链接不是 http(s) 地址，没法下载。");
    }
    const MAX_BYTES = 500 * 1024 * 1024; // 单文件上限 500MB
    const finalPath = cloudVideoFilePath(args.videoId);
    try {
      await fs.mkdir(path.dirname(finalPath), { recursive: true });
    } catch (e) {
      return fail(
        "云端目录建不出来：" + (e instanceof Error ? e.message : String(e)),
      );
    }
    // 已存过（清单里有 + 文件在）直接回成功，不重复下载、不重复计费流量。
    const { downloaded } = await readCloudDownloaded();
    if (args.videoId in downloaded) {
      try {
        const st = await fs.stat(finalPath);
        if (st.isFile() && st.size > 0) {
          return {
            ok: true,
            alreadySaved: true,
            sizeBytes: st.size,
            error: null,
          };
        }
      } catch {
        // 清单有记录但文件不在了 → 照常重新下载。
      }
    }
    // 下载走 CLOUD_DL_PY 小助手（urllib 流式分块写临时文件、
    // 总时限 60 秒、上限 500MB 双拦）：本运行时的 fetch 在回环
    // 与部分 CDN 上会被直接重置连接（实测 ECONNRESET），urllib
    // 是本文件其它通道一直在用的成熟路径。下完先落临时名再
    // rename 成正式文件，半截文件永远不会被播放器读到；任何
    // 失败先删临时文件再回原因。
    const tmpPath =
      finalPath + `.part-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
    const raw = await runPythonHelper(CLOUD_DL_PY, {
      url: target.toString(),
      tmpPath,
      maxBytes: MAX_BYTES,
    });
    const dropTmp = async () => {
      try {
        await fs.unlink(tmpPath);
      } catch {
        // 临时文件不在不报错。
      }
    };
    if (raw.ok !== true) {
      await dropTmp();
      const kind = typeof raw.kind === "string" ? raw.kind : "";
      const status =
        typeof raw.httpStatus === "number" ? raw.httpStatus : null;
      if (kind === "http" && status !== null) {
        return fail(
          status === 403 || status === 410
            ? `下载失败：链接已过期（对方返回 ${status}），先点卡片上的「刷新链接」拿新链接再存。`
            : `下载失败：对方返回 ${status}，没有下载成功。`,
        );
      }
      if (kind === "oversize") {
        return fail("这个视频文件超过 500MB 上限，没有下载。");
      }
      if (kind === "timeout") {
        return fail("下载超时（60 秒没下完），请稍后再试。");
      }
      return fail(
        "下载失败：" +
          (typeof raw.error === "string" && raw.error
            ? raw.error
            : "网络错误，请稍后再试。"),
      );
    }
    const total = typeof raw.sizeBytes === "number" ? raw.sizeBytes : 0;
    if (total <= 0) {
      await dropTmp();
      return fail("下载失败：文件是空的，没有存成。");
    }
    try {
      await fs.rename(tmpPath, finalPath);
    } catch (e) {
      await dropTmp();
      return fail(
        "下载完成了但存入云端目录失败：" +
          (e instanceof Error ? e.message : String(e)),
      );
    }
    // 更新 state.json：文件锁内重读最新内容再合并写回（tmp +
    // rename 原子写），定时任务同时下的其它视频条目不被覆盖。
    // at 与定时任务既有条目同一格式（本机时间「YYYY-MM-DD
    // HH:mm」），清单文件里不混两种写法。
    try {
      await upsertCloudDownloaded(args.videoId, {
        file: `${args.videoId}.mp4`,
        size: total,
        at: cloudNowStamp(),
      });
    } catch (e) {
      return fail(
        "视频已经下载到云端，但清单（state.json）没更新成：" +
          (e instanceof Error ? e.message : String(e)),
      );
    }
    return { ok: true, alreadySaved: false, sizeBytes: total, error: null };
  },
  // v4.75：对云端视频文件跑 SCENE_DETECT_PY 做场景切分（优先
  // PySceneDetect、回落 ffmpeg 内容感知），只读文件、不写任何东西。
  async cloudSceneDetect(args) {
    const none = (error: string) => ({
      ok: false,
      method: "none" as const,
      durationSec: 0,
      cuts: [] as number[],
      error,
    });
    if (!CLOUD_VIDEO_ID_RE.test(args.videoId)) {
      return none("视频ID不合法");
    }
    const filePath = cloudVideoFilePath(args.videoId);
    try {
      const st = await fs.stat(filePath);
      if (!st.isFile()) return none("云端没有这个视频文件");
    } catch {
      return none("云端没有这个视频文件");
    }
    const raw = await runPythonHelper(SCENE_DETECT_PY, { path: filePath });
    const cuts = Array.isArray(raw.cuts)
      ? raw.cuts.filter((c): c is number => typeof c === "number" && Number.isFinite(c))
      : [];
    const method: "pyscenedetect" | "ffmpeg" | "none" =
      raw.method === "pyscenedetect"
        ? "pyscenedetect"
        : raw.method === "ffmpeg"
          ? "ffmpeg"
          : "none";
    return {
      ok: raw.ok === true && method !== "none",
      method,
      durationSec: typeof raw.durationSec === "number" ? raw.durationSec : 0,
      cuts,
      error:
        typeof raw.error === "string"
          ? raw.error
          : raw.ok === true
            ? null
            : "场景检测没有返回结果",
    };
  },
  // v4.86 转写层（后台任务制）：云端视频文件就在宿主机上，启动
  // 只校验文件存在 + 落任务，立刻回 jobId。
  async startCloudTranscription(args) {
    const fail = (error: string) => ({ ok: false, jobId: null as string | null, error });
    if (!CLOUD_VIDEO_ID_RE.test(args.videoId)) {
      return fail("视频ID不合法");
    }
    const filePath = cloudVideoFilePath(args.videoId);
    try {
      const st = await fs.stat(filePath);
      if (!st.isFile()) return fail("云端没有这个视频文件");
    } catch {
      return fail("云端没有这个视频文件");
    }
    return startTranscriptionJob(filePath, false);
  },
  // v4.86 转写层（后台任务制）：浏览器上传的音频字节落成任务源
  // 文件再启动任务，runner 跑完自删源文件；音频不离开本机。
  async startTranscriptionUpload(args) {
    const fail = (error: string) => ({ ok: false, jobId: null as string | null, error });
    const tmpDir = path.join(asrDir(), "tmp");
    const tmpPath = path.join(
      tmpDir,
      `upload-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.wav`,
    );
    try {
      await fs.mkdir(tmpDir, { recursive: true });
      await fs.writeFile(tmpPath, Buffer.from(args.dataBase64, "base64"));
    } catch (e) {
      return fail(
        "上传音频落盘失败：" + (e instanceof Error ? e.message : String(e)),
      );
    }
    const started = await startTranscriptionJob(tmpPath, true);
    if (!started.ok) {
      await fs.unlink(tmpPath).catch(() => undefined);
    }
    return started;
  },
  // v4.86 转写轮询：结果文件在 = 已定稿（ok 决定 done/failed）；
  // 只有 spec = 还在跑；都没有 = 任务不存在，按 failed 报清。
  async pollTranscription(args) {
    const base = {
      ok: false,
      durationSec: 0,
      segmentsJson: "",
      segmentCount: 0,
      error: null as string | null,
    };
    if (!asrJobIdOk(args.jobId)) {
      return { ...base, status: "failed" as const, error: "转写任务号不合法" };
    }
    const jobsDir = asrJobsDir();
    const resultPath = path.join(jobsDir, args.jobId + ".json");
    try {
      const raw = await fs.readFile(resultPath, "utf8");
      const parsed = JSON.parse(raw) as {
        ok?: boolean;
        durationSec?: number;
        segments?: unknown[];
        error?: string | null;
      };
      const segments = Array.isArray(parsed.segments) ? parsed.segments : [];
      const ok = parsed.ok === true;
      return {
        status: ok ? ("done" as const) : ("failed" as const),
        ok,
        durationSec: typeof parsed.durationSec === "number" ? parsed.durationSec : 0,
        segmentsJson: ok ? JSON.stringify(segments) : "",
        segmentCount: ok ? segments.length : 0,
        error:
          typeof parsed.error === "string"
            ? parsed.error
            : ok
              ? null
              : "本地转写失败",
      };
    } catch {
      // 结果文件还没写出来：看 spec 在不在。
    }
    try {
      await fs.stat(path.join(jobsDir, args.jobId + ".spec.json"));
      return { ...base, status: "running" as const };
    } catch {
      return {
        ...base,
        status: "failed" as const,
        error: "转写任务不存在（可能已过期被清理），请重新解剖。",
      };
    }
  },
  async cloudQueueEnqueue(args) {
    const fail = (error: string) => ({
      ok: false,
      queued: 0,
      batchId: null as string | null,
      error,
    });
    try {
      await fs.mkdir(cloudBaseDir(), { recursive: true });
    } catch (e) {
      return fail(
        "云端目录建不出来：" + (e instanceof Error ? e.message : String(e)),
      );
    }
    const release = await acquireCloudQueueLock();
    if (!release) return fail("云端队列正忙（文件锁等不到），请稍后再试。");
    let batchId: string;
    let queuedCount = 0;
    try {
      const queue = await readCloudQueueFile();
      const running = queue.items.some(
        (it) => it.status === "queued" || it.status === "downloading",
      );
      batchId =
        running && queue.batchId
          ? queue.batchId
          : `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const items: CloudQueueItem[] = running ? [...queue.items] : [];
      const stamp = new Date().toISOString();
      // v5.69 入队去重：同一个 videoId 在本批里只留一条——已在
      // 本批中（排队 / 存入中 / 已成功 / 已失败都算）的跳过，本
      // 次入队清单内部重复的也只取第一条。修的真实案例：第一批
      // 还在下载时同一条视频被再次勾选入队（客户端「已存」只看
      // state.json、看不见还在队列里的），结果窗里同一 videoId
      // 记了两条成功。已存云端的文件本身不删、不动。
      const seenVideoIds = new Set(items.map((it) => it.videoId));
      let added = 0;
      args.items.forEach((item, i) => {
        if (seenVideoIds.has(item.videoId)) return;
        seenVideoIds.add(item.videoId);
        added += 1;
        items.push({
          id: `q-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`,
          videoId: item.videoId,
          url: item.url,
          title: item.title ?? "",
          creatorName: item.creatorName ?? "",
          status: "queued",
          error: null,
          attempts: 0,
          sizeBytes: 0,
          enqueuedAt: stamp,
          startedAt: null,
          finishedAt: null,
        });
      });
      await writeCloudQueueFile({
        version: 1,
        batchId,
        batchFinishedAt: running ? queue.batchFinishedAt : null,
        items,
      });
      queuedCount = added;
    } catch (e) {
      return fail(
        "写入云端队列失败：" + (e instanceof Error ? e.message : String(e)),
      );
    } finally {
      await release();
    }
    await ensureCloudQueueWorker();
    return { ok: true, queued: queuedCount, batchId, error: null };
  },
  async cloudQueueStatus() {
    const queue = await readCloudQueueFile();
    const hasPending = queue.items.some(
      (it) => it.status === "queued" || it.status === "downloading",
    );
    // 续跑：队列里还有没跑完的条目但后台进程不在（服务端重启 /
    // 进程被杀）→ 重新拉起，downloading 会在 worker 启动时重置
    // 回 queued 续跑。状态查询每几秒来一次，这里只做存活检查，
    // 进程活着时几乎零成本。
    if (hasPending) {
      await ensureCloudQueueWorker();
    }
    let success = 0;
    let failed = 0;
    for (const it of queue.items) {
      if (it.status === "success") success += 1;
      else if (it.status === "failed") failed += 1;
    }
    return {
      ok: true,
      running: hasPending,
      batchId: queue.batchId,
      total: queue.items.length,
      done: success + failed,
      success,
      failed,
      finishedAt: queue.batchFinishedAt,
      items: queue.items.map((it) => ({
        id: it.id,
        videoId: it.videoId,
        title: it.title,
        creatorName: it.creatorName,
        status: it.status,
        error: it.error,
        attempts: it.attempts,
        sizeBytes: it.sizeBytes,
      })),
      error: null,
    };
  },
  async cloudQueueRetryFailed(args) {
    const fail = (error: string) => ({ ok: false, retried: 0, error });
    const release = await acquireCloudQueueLock();
    if (!release) return fail("云端队列正忙（文件锁等不到），请稍后再试。");
    let retried = 0;
    try {
      const queue = await readCloudQueueFile();
      const wanted =
        args.itemIds.length > 0 ? new Set(args.itemIds) : null;
      const stamp = new Date().toISOString();
      const items = queue.items.map((it) => {
        if (it.status !== "failed") return it;
        if (wanted && !wanted.has(it.id)) return it;
        retried += 1;
        return {
          ...it,
          status: "queued",
          error: null,
          attempts: 0,
          sizeBytes: 0,
          enqueuedAt: stamp,
          startedAt: null,
          finishedAt: null,
        };
      });
      if (retried === 0) {
        return fail("没有可重试的失败条目（可能已经存好了，或正在重试中）。");
      }
      await writeCloudQueueFile({
        version: 1,
        batchId: queue.batchId,
        batchFinishedAt: null,
        items,
      });
    } catch (e) {
      return fail(
        "重试入队失败：" + (e instanceof Error ? e.message : String(e)),
      );
    } finally {
      await release();
    }
    await ensureCloudQueueWorker();
    return { ok: true, retried, error: null };
  },
});

// ---------------------------------------------------------------------------
// v4.86 AI解剖转写层（本地 Whisper）：TRANSCRIBE_PY 由 venv 里的
// python 执行（faster-whisper 1.2.1 + small 模型，CPU int8）。
// 输入一条视频或音频文件路径：ffmpeg 先抽 16kHz 单声道 WAV，再转
// 写（词级时间戳 + VAD），按词级时间戳在句末标点与 ≥0.7 秒停顿处
// 把 Whisper 段再切成「一句台词」的粒度；每句算置信度（avg_logprob
// / no_speech_prob）与声学特征（log-mel 均值/方差 + 基频中位数），
// 按余弦相似度 ≥0.94 且基频相容做凝聚聚类，给每句一个声线簇标签
// （S1/S2…，按首次出现排序）。聚类只做初步分组（偏多分不偏并）：
// 簇→人物 A/B/C 的对位由融合层结合画面与对话内容完成。
// ---------------------------------------------------------------------------

const TRANSCRIBE_PY = `
import json, math, os, subprocess, sys

def emit(obj):
    sys.stdout.write("RESULT_JSON:" + json.dumps(obj, ensure_ascii=False) + "\\n")
    sys.stdout.flush()

TERMINAL = set("。！？!?；;…")

def split_utterances(seg):
    words = [w for w in (seg.words or []) if (w.word or "").strip()]
    if not words:
        t = (seg.text or "").strip()
        if not t:
            return []
        return [{"start": seg.start, "end": seg.end, "text": t}]
    out = []
    cur = []
    prev = None
    for w in words:
        if prev is not None:
            gap = w.start - prev.end
            prev_text = (prev.word or "").strip()
            if gap >= 0.7 or (prev_text and prev_text[-1] in TERMINAL):
                if cur:
                    out.append(cur)
                cur = []
        cur.append(w)
        prev = w
    if cur:
        out.append(cur)
    res = []
    for group in out:
        text = "".join((w.word or "") for w in group).strip()
        if text:
            probs = [float(w.probability) for w in group if getattr(w, "probability", None) is not None]
            prob = (sum(probs) / len(probs)) if probs else None
            res.append({"start": group[0].start, "end": group[-1].end, "text": text, "prob": prob})
    return res

def mel_filterbank(sr, n_fft, n_mels, fmin, fmax):
    import numpy as np
    def hz_to_mel(f):
        return 2595.0 * math.log10(1.0 + f / 700.0)
    def mel_to_hz(m):
        return 700.0 * (10.0 ** (m / 2595.0) - 1.0)
    lo, hi = hz_to_mel(fmin), hz_to_mel(fmax)
    pts = [mel_to_hz(lo + (hi - lo) * i / (n_mels + 1)) for i in range(n_mels + 2)]
    bins = [int((n_fft + 1) * p / sr) for p in pts]
    fb = np.zeros((n_mels, n_fft // 2 + 1))
    for i in range(n_mels):
        a, b, c = bins[i], bins[i + 1], bins[i + 2]
        for k in range(a, b):
            if b > a:
                fb[i, k] = (k - a) / (b - a)
        for k in range(b, c):
            if c > b:
                fb[i, k] = (c - k) / (c - b)
    return fb

def utterance_feature(audio, sr, start, end, fb, window):
    import numpy as np
    s = audio[int(start * sr):int(end * sr)]
    if len(s) < int(0.3 * sr):
        return None
    frame, hop = 400, 160
    if len(s) < frame:
        s = np.pad(s, (0, frame - len(s)))
    frames = []
    for off in range(0, len(s) - frame + 1, hop):
        frames.append(s[off:off + frame] * window)
    if not frames:
        return None
    spec = np.abs(np.fft.rfft(np.stack(frames), n=512)) ** 2
    mel = spec @ fb.T
    logmel = np.log(mel + 1e-6)
    feat = np.concatenate([logmel.mean(axis=0), logmel.std(axis=0) * 0.5])
    f0s = []
    n = len(s)
    for q in (0.2, 0.35, 0.5, 0.65, 0.8):
        c0 = int(n * q)
        seg = s[c0:c0 + 800]
        if len(seg) < 800:
            continue
        seg = seg - seg.mean()
        if float(np.max(np.abs(seg))) < 0.02:
            continue
        corr = np.correlate(seg, seg, mode="full")[len(seg) - 1:]
        lo, hi = int(sr / 400), int(sr / 70)
        if hi <= lo or hi >= len(corr):
            continue
        peak = lo + int(np.argmax(corr[lo:hi]))
        if corr[peak] > 0.3 * corr[0]:
            f0s.append(sr / peak)
    if f0s:
        f0s.sort()
        f0dim = max(-1.0, min(1.0, math.log2(f0s[len(f0s) // 2] / 120.0)))
    else:
        f0dim = 0.0
    feat = np.concatenate([feat, np.array([f0dim * 4.0])])
    nrm = float(np.linalg.norm(feat))
    if nrm <= 0:
        return None
    return feat / nrm, f0dim

def cluster_utterances(feats, utts):
    import numpy as np
    n = len(utts)
    labels = ["S1"] * n
    idx = [i for i in range(n) if feats[i] is not None]
    if not idx:
        return labels
    clusters = [{"members": [i], "vec": feats[i][0], "f0": feats[i][1]} for i in idx]
    while len(clusters) > 1:
        best = None
        for a in range(len(clusters)):
            for b in range(a + 1, len(clusters)):
                s = float(np.dot(clusters[a]["vec"], clusters[b]["vec"]))
                if abs(clusters[a]["f0"] - clusters[b]["f0"]) <= 0.7 and s >= 0.92:
                    if best is None or s > best[0]:
                        best = (s, a, b)
        if best is None:
            break
        _, a, b = best
        members = clusters[a]["members"] + clusters[b]["members"]
        vec = np.mean([feats[i][0] for i in members], axis=0)
        nrm = float(np.linalg.norm(vec))
        if nrm > 0:
            vec = vec / nrm
        clusters[a] = {"members": members, "vec": vec, "f0": sum(feats[i][1] for i in members) / len(members)}
        del clusters[b]
    clusters.sort(key=lambda c: min(utts[i]["start"] for i in c["members"]))
    label_of = {}
    for ci, c in enumerate(clusters):
        for i in c["members"]:
            label_of[i] = "S" + str(ci + 1)
    for i in range(n):
        if i in label_of:
            labels[i] = label_of[i]
        else:
            j = min(idx, key=lambda k: abs(utts[k]["start"] - utts[i]["start"]))
            labels[i] = label_of[j]
    return labels

def main():
    req = json.load(sys.stdin)
    src = str(req.get("path") or "")
    model_dir = str(req.get("modelDir") or "")
    work_dir = str(req.get("workDir") or "")
    wav = ""
    try:
        os.makedirs(work_dir, exist_ok=True)
        wav = os.path.join(work_dir, "asr-" + str(os.getpid()) + ".wav")
        r = subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src, "-vn", "-ar", "16000", "-ac", "1", wav], capture_output=True, text=True, timeout=600)
        if r.returncode != 0 or not os.path.exists(wav):
            emit({"ok": False, "durationSec": 0, "segments": [], "error": "提取音频失败：" + (r.stderr or "")[:300]})
            return
        from faster_whisper import WhisperModel, decode_audio
        model = WhisperModel(model_dir, device="cpu", compute_type="int8")
        segs, info = model.transcribe(wav, language="zh", beam_size=5, word_timestamps=True, vad_filter=True, vad_parameters={"min_silence_duration_ms": 400})
        utts = []
        for s in segs:
            lp = float(s.avg_logprob or 0)
            ns = float(s.no_speech_prob or 0)
            conf = max(0.0, min(1.0, 1.0 + lp))
            for p in split_utterances(s):
                prob = p.get("prob")
                if prob is not None:
                    uconf = max(0.0, min(1.0, float(prob)))
                    ulow = bool(uconf < 0.55 or ns > 0.6)
                else:
                    uconf = conf
                    ulow = bool(lp < -0.85 or ns > 0.6)
                utts.append({"start": round(float(p["start"]), 1), "end": round(float(p["end"]), 1), "text": p["text"], "confidence": round(uconf, 2), "lowConfidence": ulow})
        import numpy as np
        audio = decode_audio(wav, sampling_rate=16000)
        fb = mel_filterbank(16000, 512, 40, 80.0, 4000.0)
        window = np.hanning(400)
        feats = [utterance_feature(audio, 16000, u["start"], u["end"], fb, window) for u in utts]
        labels = cluster_utterances(feats, utts)
        for u, lab in zip(utts, labels):
            u["cluster"] = lab
        emit({"ok": True, "durationSec": round(float(info.duration), 1), "segments": utts, "error": None})
    except Exception as e:
        emit({"ok": False, "durationSec": 0, "segments": [], "error": "本地转写失败：" + type(e).__name__ + ": " + str(e)[:300]})
    finally:
        if wav:
            try:
                os.unlink(wav)
            except OSError:
                pass

main()
`;

function asrDir(): string {
  return path.join(resolveDataDir(), "video-cloud", "asr");
}

function asrVenvPython(): string {
  // Windows 上 venv 的解释器在 Scripts/python.exe，Linux/macOS 在 bin/python。
  return process.platform === "win32"
    ? path.join(asrDir(), "venv", "Scripts", "python.exe")
    : path.join(asrDir(), "venv", "bin", "python");
}

function asrModelDir(): string {
  return path.join(asrDir(), "models");
}

/** 在宿主机上跑一条命令并收全 stdout/stderr（转写运行时自举与转写
 * 本身都用它；超时直接 kill 并报错，不留僵尸进程）。 */
function runShellCapture(
  cmd: string,
  args: string[],
  opts: { stdin?: string; timeoutMs: number; env?: NodeJS.ProcessEnv },
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"], env: opts.env });
    } catch (e) {
      resolve({
        code: null,
        stdout: "",
        stderr: e instanceof Error ? e.message : String(e),
      });
      return;
    }
    const outChunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        // 已退出
      }
    }, opts.timeoutMs);
    child.stdout?.on("data", (d: Buffer) => outChunks.push(d));
    child.stderr?.on("data", (d: Buffer) => errChunks.push(d));
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ code: null, stdout: "", stderr: e.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        code,
        stdout: Buffer.concat(outChunks).toString("utf8"),
        stderr: Buffer.concat(errChunks).toString("utf8"),
      });
    });
    if (opts.stdin !== undefined) child.stdin?.write(opts.stdin);
    child.stdin?.end();
  });
}

// ASR 运行时自举（只在缺失时跑一次，进程内串行）：建 venv → pip 装
// faster-whisper==1.2.1 + av==12.3.0（av 更高版本改了 av.open 的
// metadata_errors 参数、与 faster-whisper 1.2.1 不兼容，必须锁版）
// → 下载 small 模型四件套（hf-mirror 优先、huggingface.co 兜底，
// curl 断点续传 + 重试；model.bin 字节数精确校验；连接挂起 0 字节
// 时 --speed-limit/--speed-time 30 秒即断开重试，不等满 600 秒 --max-time）。
const ASR_MODEL_FILES: { name: string; size: number }[] = [
  { name: "config.json", size: 2370 },
  { name: "tokenizer.json", size: 2203239 },
  { name: "vocabulary.txt", size: 459861 },
  { name: "model.bin", size: 483546902 },
];

let asrEnsurePromise: Promise<void> | null = null;

function ensureAsrRuntime(): Promise<void> {
  if (!asrEnsurePromise) {
    asrEnsurePromise = (async () => {
      const py = asrVenvPython();
      const modelDir = asrModelDir();
      let pyOk = false;
      try {
        pyOk = (await fs.stat(py)).isFile();
      } catch {
        pyOk = false;
      }
      if (pyOk) {
        const chk = await runShellCapture(
          py,
          ["-c", "import faster_whisper, av"],
          { timeoutMs: 60_000 },
        );
        pyOk = chk.code === 0;
      }
      if (!pyOk) {
        await fs.mkdir(asrDir(), { recursive: true });
        const venvDir = path.join(asrDir(), "venv");
        const basePy = resolvePython();
        // pip 解包/建轮子要写临时目录：沙箱 /tmp 只有 512M 且常满，
        // 一律改走 workspace 磁盘上的 DATA_DIR，避免 No space left。
        // Windows 上 pip 认 TEMP/TMP，Linux 认 TMPDIR，三处都指过去。
        const pipTmp = path.join(asrDir(), "pip-tmp");
        await fs.mkdir(pipTmp, { recursive: true });
        const pipEnv: NodeJS.ProcessEnv = {
          ...process.env,
          TMPDIR: pipTmp,
          TEMP: pipTmp,
          TMP: pipTmp,
          PIP_CACHE_DIR: path.join(asrDir(), "pip-cache"),
        };
        // ① 先按标准流程建 venv。Windows 内嵌 Python（embeddable 版
        // 没有 ensurepip，python -m venv 默认失败）与个别缺
        // python3-venv 的 Linux 会在这一步失败，走 ② 回落。
        let venv = await runShellCapture(
          basePy.cmd,
          [...basePy.argsPrefix, "-m", "venv", venvDir],
          { timeoutMs: 300_000 },
        );
        if (venv.code !== 0) {
          // ② 回落：--without-pip 建裸 venv（不装 pip 就不碰
          // ensurepip），再用 get-pip.py 单独把 pip 装进 venv。
          await fs.rm(venvDir, { recursive: true, force: true }).catch(() => undefined);
          venv = await runShellCapture(
            basePy.cmd,
            [...basePy.argsPrefix, "-m", "venv", "--without-pip", venvDir],
            { timeoutMs: 300_000 },
          );
          if (venv.code !== 0) {
            throw new Error("建 Whisper 运行环境（venv）失败：" + venv.stderr.slice(-300));
          }
        }
        // ③ venv 里没有 pip 时（--without-pip 的情况），用
        // get-pip.py 引导安装 pip；下载失败报明确错误，不静默跳过。
        const pipCheck = await runShellCapture(py, ["-m", "pip", "--version"], {
          timeoutMs: 60_000,
          env: pipEnv,
        });
        if (pipCheck.code !== 0) {
          const getPipPath = path.join(asrDir(), "get-pip.py");
          let haveGetPip = false;
          try {
            haveGetPip = (await fs.stat(getPipPath)).size > 1000;
          } catch {
            haveGetPip = false;
          }
          if (!haveGetPip) {
            const dl = await runShellCapture(
              "curl",
              ["-sfL", "--retry", "3", "--retry-all-errors", "--speed-limit", "1000", "--speed-time", "30", "--max-time", "120", "-o", getPipPath, "https://bootstrap.pypa.io/get-pip.py"],
              { timeoutMs: 180_000 },
            );
            try {
              haveGetPip = dl.code === 0 && (await fs.stat(getPipPath)).size > 1000;
            } catch {
              haveGetPip = false;
            }
          }
          if (!haveGetPip) {
            throw new Error(
              "建 Whisper 运行环境失败：venv 里没有 pip，且 get-pip.py 下载失败（请检查网络后重试；Windows 内嵌 Python 须联网下载 get-pip.py）",
            );
          }
          const boot = await runShellCapture(py, [getPipPath, "--disable-pip-version-check"], {
            timeoutMs: 600_000,
            env: pipEnv,
          });
          if (boot.code !== 0) {
            throw new Error("安装 pip（get-pip.py）失败：" + boot.stderr.slice(-300));
          }
        }
        const pip = await runShellCapture(
          py,
          ["-m", "pip", "install", "--quiet", "--disable-pip-version-check", "faster-whisper==1.2.1", "av==12.3.0"],
          { timeoutMs: 900_000, env: pipEnv },
        );
        if (pip.code !== 0) {
          throw new Error("安装 faster-whisper 失败：" + pip.stderr.slice(-300));
        }
      }
      await fs.mkdir(modelDir, { recursive: true });
      for (const f of ASR_MODEL_FILES) {
        const dest = path.join(modelDir, f.name);
        let have = 0;
        try {
          have = (await fs.stat(dest)).size;
        } catch {
          have = 0;
        }
        if (have === f.size) continue;
        let done = false;
        for (const base of ["https://hf-mirror.com", "https://huggingface.co"]) {
          for (let attempt = 0; attempt < 4 && !done; attempt += 1) {
            await runShellCapture(
              "curl",
              ["-sfL", "--retry", "3", "--retry-all-errors", "--speed-limit", "1000", "--speed-time", "30", "-C", "-", "--max-time", "600", "-o", dest, `${base}/Systran/faster-whisper-small/resolve/main/${f.name}`],
              { timeoutMs: 660_000 },
            );
            try {
              done = (await fs.stat(dest)).size === f.size;
            } catch {
              done = false;
            }
          }
          if (done) break;
        }
        if (!done) {
          throw new Error(`Whisper 模型文件 ${f.name} 下载不完整（网络多次中断），过一会儿再点一次解剖会自动续传补齐`);
        }
      }
    })().catch((e) => {
      // 自举失败不缓存失败结果：下一次调用重新尝试（断点都在磁盘上）。
      asrEnsurePromise = null;
      throw e;
    });
  }
  return asrEnsurePromise;
}

// ---------------------------------------------------------------------------
// v4.86 转写后台任务（审计修正：同步转写撞动作时限）：启动把 spec
// 落盘 + 拉起 detached runner，runner 自己跑 transcribe.py 并把
// RESULT_JSON 解析后原子写结果文件；轮询只读文件。任务文件留
// asr/jobs/，启动时顺手清 24 小时前的旧任务。
// ---------------------------------------------------------------------------

const TRANSCRIBE_JOB_PY = `
import json, os, subprocess, sys

def main():
    spec_path = sys.argv[1]
    with open(spec_path, "r", encoding="utf-8") as f:
        spec = json.load(f)
    result_path = str(spec.get("resultPath") or "")
    payload = {"ok": False, "durationSec": 0, "segments": [], "error": "转写任务没有产出结果"}
    try:
        req = json.dumps({"path": spec.get("path") or "", "modelDir": spec.get("modelDir") or "", "workDir": spec.get("workDir") or ""})
        r = subprocess.run([sys.executable, str(spec.get("scriptPath") or "")], input=req, capture_output=True, text=True, timeout=1700)
        line = ""
        for l in (r.stdout or "").splitlines():
            if l.startswith("RESULT_JSON:"):
                line = l
                break
        if line:
            payload = json.loads(line[len("RESULT_JSON:"):])
        elif r.stderr:
            payload = {"ok": False, "durationSec": 0, "segments": [], "error": "本地转写没有返回结果：" + r.stderr[-300:]}
    except Exception as e:
        payload = {"ok": False, "durationSec": 0, "segments": [], "error": "转写任务失败：" + type(e).__name__ + ": " + str(e)[:300]}
    finally:
        if spec.get("deleteSource"):
            try:
                os.unlink(str(spec.get("path") or ""))
            except OSError:
                pass
    if result_path:
        tmp = result_path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False)
        os.replace(tmp, result_path)

main()
`;

function asrJobsDir(): string {
  return path.join(asrDir(), "jobs");
}

function asrJobIdOk(jobId: string): boolean {
  return /^asr-[0-9]+-[a-z0-9]+$/.test(jobId);
}

async function startTranscriptionJob(
  sourcePath: string,
  deleteSource: boolean,
): Promise<{ ok: boolean; jobId: string | null; error: string | null }> {
  const fail = (error: string) => ({ ok: false, jobId: null, error });
  try {
    await ensureAsrRuntime();
  } catch (e) {
    return fail(
      "本地转写运行时没准备好：" + (e instanceof Error ? e.message : String(e)),
    );
  }
  const scriptPath = path.join(asrDir(), "transcribe.py");
  const runnerPath = path.join(asrDir(), "transcribe-job.py");
  try {
    await fs.writeFile(scriptPath, TRANSCRIBE_PY, "utf8");
    await fs.writeFile(runnerPath, TRANSCRIBE_JOB_PY, "utf8");
  } catch (e) {
    return fail(
      "转写脚本写入失败：" + (e instanceof Error ? e.message : String(e)),
    );
  }
  const jobsDir = asrJobsDir();
  try {
    await fs.mkdir(jobsDir, { recursive: true });
    // 顺手清 24 小时前的旧任务文件（结果与 spec 成对清）。
    const cutoff = Date.now() - 24 * 3600 * 1000;
    for (const name of await fs.readdir(jobsDir)) {
      try {
        const st = await fs.stat(path.join(jobsDir, name));
        if (st.mtimeMs < cutoff) await fs.unlink(path.join(jobsDir, name));
      } catch {
        // 单个清不掉不拦启动
      }
    }
  } catch (e) {
    return fail(
      "转写任务目录准备失败：" + (e instanceof Error ? e.message : String(e)),
    );
  }
  const jobId = `asr-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const specPath = path.join(jobsDir, jobId + ".spec.json");
  const resultPath = path.join(jobsDir, jobId + ".json");
  try {
    await fs.writeFile(
      specPath,
      JSON.stringify({
        path: sourcePath,
        modelDir: asrModelDir(),
        workDir: path.join(asrDir(), "tmp"),
        scriptPath,
        resultPath,
        deleteSource,
      }),
      "utf8",
    );
  } catch (e) {
    return fail(
      "转写任务写入失败：" + (e instanceof Error ? e.message : String(e)),
    );
  }
  try {
    const child = spawn(asrVenvPython(), [runnerPath, specPath], {
      detached: true,
      stdio: "ignore",
      // 转写脚本里 ffmpeg 走 PATH：把内嵌 ffmpeg 目录与 DATA_DIR 一起透传，
      // runner 再原样传给它拉起的 TRANSCRIBE_PY。
      env: pythonHelperEnv(),
    });
    child.on("error", () => undefined);
    child.unref();
  } catch (e) {
    return fail(
      "转写任务拉起失败：" + (e instanceof Error ? e.message : String(e)),
    );
  }
  return { ok: true, jobId, error: null };
}

// ---------------------------------------------------------------------------
// v4.64 视频云端（~/workspace/video-cloud/）路径与 state 读取。
// videoId 白名单正则与动作层同一口径：只允许字母 / 数字 / 下划线 /
// 中划线，杜绝 ../ 之类目录穿越；文件名恒为 <videoId>.mp4。
// ---------------------------------------------------------------------------

const CLOUD_VIDEO_ID_RE = /^[A-Za-z0-9_-]+$/;

function cloudBaseDir(): string {
  return path.join(resolveDataDir(), "video-cloud");
}

function cloudStatePath(): string {
  return path.join(cloudBaseDir(), "state.json");
}

function cloudVideoFilePath(videoId: string): string {
  return path.join(cloudBaseDir(), "videos", videoId + ".mp4");
}

// state.json 里 at 的既有格式：本机时间「YYYY-MM-DD HH:mm」
//（与定时任务写的一致），手动存云端的新条目沿用同一格式。
function cloudNowStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function readCloudDownloaded(): Promise<{
  downloaded: Record<string, unknown>;
}> {
  try {
    const raw = await fs.readFile(cloudStatePath(), "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      const d = (parsed as { downloaded?: unknown }).downloaded;
      if (d && typeof d === "object") {
        return { downloaded: d as Record<string, unknown> };
      }
    }
  } catch {
    // state.json 缺失 / 损坏 → 按空清单容错。
  }
  return { downloaded: {} };
}

// v4.65 在锁内给 state.json 的 downloaded 合并一条记录：
// ① 文件锁（state.json.lock 独占创建，抢不到每 100ms 重试、
// 最多等约 10 秒；锁文件超过 60 秒视为残留死锁、强行接管，
// 防一次崩溃把后面的写入永远堵死）；
// ② 拿到锁后重读 state.json 最新全文（顶层其它键原样保留），
// 只改 downloaded[videoId] 一条；
// ③ tmp + rename 原子写回，读到一半的进程永远看不到半截 JSON。
async function upsertCloudDownloaded(
  videoId: string,
  entry: { file: string; size: number; at: string },
): Promise<void> {
  const statePath = cloudStatePath();
  const lockPath = statePath + ".lock";
  let lockFh: Awaited<ReturnType<typeof fs.open>> | null = null;
  for (let attempt = 0; attempt < 100 && !lockFh; attempt += 1) {
    try {
      lockFh = await fs.open(lockPath, "wx");
    } catch {
      try {
        const st = await fs.stat(lockPath);
        if (Date.now() - st.mtimeMs > 60_000) {
          await fs.unlink(lockPath);
          continue;
        }
      } catch {
        // 锁刚被释放 → 直接重试创建。
        continue;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  if (!lockFh) {
    throw new Error("云端清单正忙（文件锁等不到），请稍后再试");
  }
  try {
    let state: Record<string, unknown> = {};
    try {
      const raw = await fs.readFile(statePath, "utf8");
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        state = parsed as Record<string, unknown>;
      }
    } catch {
      // state.json 还不存在 → 从空对象建起。
    }
    const downloaded =
      state.downloaded && typeof state.downloaded === "object"
        ? (state.downloaded as Record<string, unknown>)
        : {};
    downloaded[videoId] = entry;
    state.downloaded = downloaded;
    const tmp =
      statePath +
      `.tmp-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
    await fs.writeFile(tmp, JSON.stringify(state, null, 2), "utf8");
    await fs.rename(tmp, statePath);
  } finally {
    try {
      await lockFh.close();
    } catch {
      // 关不上不影响释放。
    }
    try {
      await fs.unlink(lockPath);
    } catch {
      // 锁文件不在不报错。
    }
  }
}

// ---------------------------------------------------------------------------
// v4.67 云端后台队列（queue.json，与 state.json 同目录）：
// 文件形状 {version, batchId, batchFinishedAt, items[]}——一个
// batch = 一次（或运行中追加的）批量入队；新批次开始时整表替换，
// 运行中入队追加进同一批次。TS 侧（本节）只负责入队与状态读，
// 下载与状态推进全在 QUEUE_WORKER_PY 后台进程里；两边共用同一
// 把 queue.json.lock 文件锁（独占创建、100ms 重试、锁超 60 秒
// 视为残留接管），写入一律 tmp + rename 原子替换，读者永远看不
// 到半截 JSON。锁只在读写文件的瞬间持有，下载不持锁。
// ---------------------------------------------------------------------------

type CloudQueueItem = {
  id: string;
  videoId: string;
  url: string;
  title: string;
  creatorName: string;
  status: string;
  error: string | null;
  attempts: number;
  sizeBytes: number;
  enqueuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

type CloudQueueFile = {
  version: number;
  batchId: string | null;
  batchFinishedAt: string | null;
  items: CloudQueueItem[];
};

function cloudQueuePath(): string {
  return path.join(cloudBaseDir(), "queue.json");
}

function cloudQueueWorkerPath(): string {
  return path.join(cloudBaseDir(), "queue-worker.py");
}

function cloudQueuePidPath(): string {
  return path.join(cloudBaseDir(), "queue-worker.pid");
}

async function readCloudQueueFile(): Promise<CloudQueueFile> {
  const empty: CloudQueueFile = {
    version: 1,
    batchId: null,
    batchFinishedAt: null,
    items: [],
  };
  try {
    const raw = await fs.readFile(cloudQueuePath(), "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return empty;
    const q = parsed as {
      batchId?: unknown;
      batchFinishedAt?: unknown;
      items?: unknown;
    };
    const items: CloudQueueItem[] = [];
    if (Array.isArray(q.items)) {
      for (const rawItem of q.items) {
        if (!rawItem || typeof rawItem !== "object") continue;
        const it = rawItem as Record<string, unknown>;
        items.push({
          id: typeof it.id === "string" ? it.id : "",
          videoId: typeof it.videoId === "string" ? it.videoId : "",
          url: typeof it.url === "string" ? it.url : "",
          title: typeof it.title === "string" ? it.title : "",
          creatorName: typeof it.creatorName === "string" ? it.creatorName : "",
          status: typeof it.status === "string" ? it.status : "queued",
          error: typeof it.error === "string" ? it.error : null,
          attempts: typeof it.attempts === "number" ? it.attempts : 0,
          sizeBytes: typeof it.sizeBytes === "number" ? it.sizeBytes : 0,
          enqueuedAt: typeof it.enqueuedAt === "string" ? it.enqueuedAt : "",
          startedAt: typeof it.startedAt === "string" ? it.startedAt : null,
          finishedAt: typeof it.finishedAt === "string" ? it.finishedAt : null,
        });
      }
    }
    return {
      version: 1,
      batchId: typeof q.batchId === "string" ? q.batchId : null,
      batchFinishedAt:
        typeof q.batchFinishedAt === "string" ? q.batchFinishedAt : null,
      items,
    };
  } catch {
    // queue.json 缺失 / 损坏 → 按空队列容错。
    return empty;
  }
}

async function writeCloudQueueFile(queue: CloudQueueFile): Promise<void> {
  const queuePath = cloudQueuePath();
  const tmp =
    queuePath + `.tmp-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  await fs.writeFile(tmp, JSON.stringify(queue, null, 2), "utf8");
  await fs.rename(tmp, queuePath);
}

async function acquireCloudQueueLock(): Promise<(() => Promise<void>) | null> {
  const lockPath = cloudQueuePath() + ".lock";
  let lockFh: Awaited<ReturnType<typeof fs.open>> | null = null;
  for (let attempt = 0; attempt < 100 && !lockFh; attempt += 1) {
    try {
      lockFh = await fs.open(lockPath, "wx");
    } catch {
      try {
        const st = await fs.stat(lockPath);
        if (Date.now() - st.mtimeMs > 60_000) {
          await fs.unlink(lockPath);
          continue;
        }
      } catch {
        continue;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  if (!lockFh) return null;
  const fh = lockFh;
  return async () => {
    try {
      await fh.close();
    } catch {
      // 关不上不影响释放。
    }
    try {
      await fs.unlink(lockPath);
    } catch {
      // 锁文件不在不报错。
    }
  };
}

async function cloudQueueWorkerAlive(): Promise<boolean> {
  try {
    const raw = await fs.readFile(cloudQueuePidPath(), "utf8");
    const pid = Number(raw.trim());
    if (!Number.isFinite(pid) || pid <= 0) return false;
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// 确保后台下载进程在跑：脚本每次按当前代码重写（幂等），pid
// 文件里的进程活着就不重复拉起；拉起用 detached + unref，进程
// 与本特权进程脱钩——页面关掉、服务端重启都不影响它继续下；
// 它退出后下一次入队 / 状态查询会再把队列续跑起来。拉起失败不
// 抛错：队列文件已经落盘，状态查询还会重试拉起。
//
// P5 修复（2026-11-10，队列 worker 3 并发验证实测）：原来这里有竞态——
// worker 启动后约 100ms 才自己写 pid 文件，入队后紧跟的状态查询
// （前端正常顺序）在这窗口里查不到 pid，会再拉一个 worker；
// 两个 worker 会把同一批条目各下载一遍（实测每条 2 次请求）。
// 修法：① 进程内加拉起互斥（并发的 ensure 共用一次拉起）；
// ② 拉起方用 spawn 返回的 pid 立即写 pid 文件占位（就是 worker
// 本人的 pid，worker 退出时按值比对清理的逻辑不受影响）。
let queueWorkerStartPromise: Promise<void> | null = null;
async function ensureCloudQueueWorker(): Promise<void> {
  try {
    if (await cloudQueueWorkerAlive()) return;
    if (queueWorkerStartPromise) {
      await queueWorkerStartPromise;
      return;
    }
    queueWorkerStartPromise = (async () => {
      if (await cloudQueueWorkerAlive()) return;
      const workerPath = cloudQueueWorkerPath();
      await fs.writeFile(workerPath, QUEUE_WORKER_PY, "utf8");
      const py = resolvePython();
      const child = spawn(py.cmd, [...py.argsPrefix, workerPath], {
        detached: true,
        stdio: "ignore",
        // DATA_DIR 显式透传：QUEUE_WORKER_PY 用它定位 video-cloud。
        env: pythonHelperEnv(),
      });
      child.on("error", () => undefined);
      child.unref();
      if (typeof child.pid === "number") {
        try {
          await fs.writeFile(cloudQueuePidPath(), String(child.pid), "utf8");
        } catch {
          // pid 占位写不上不拦拉起（worker 自己启动时还会再写一次）。
        }
      }
    })();
    try {
      await queueWorkerStartPromise;
    } finally {
      queueWorkerStartPromise = null;
    }
  } catch {
    // 拉起失败不拦入队 / 状态查询。
  }
}
