// ---------------------------------------------------------------------------
// 封面生成页（剧本工作台第五个窗口，左侧列表在「分镜」之下）：
//   按当前项目的剧本分析封面 → 选风格与比例 → 用户亲手点「生成封面」
//   出图。流程四步：
//   ① 选封面风格（风格库在 server/src/coverstyles.ts，第一套是按
//      用户参考图逐张分析出的「爆款VS对抗」，规则在页内逐条可看；
//      后续新增风格只往风格库里加，页面自动多一项）；
//   ② 点「分析剧本」——服务端推理读本项目的大纲 / 剧本 / 人物 /
//      已选模式基因卡，定出封面方案（版式、标题两边、钩子、气泡
//      台词、上封面人物、核心道具、主题特效、背景），并按所选风格
//      的规则拼好中英文提示词。分析只改文字，不提交任何生图。
//   ③ 方案与提示词都可手改；人物参考图默认勾选全部有图人物（上限
//      与提交通道同口径 16 张，v5.03 前是写死的 4 位），生成时带上参考图保证封面人物与资产图是同一个人同一
//      套衣服。v3.83 起带的是降采样副本（最长边 1024px）：原图整张
//      Base64 曾让请求体在网关层被掐断、确定性提交失败（P1）；
//      库里原图与无损下载不动。提交失败文案透出真实状态码与错误
//      原文，不再只有一句通用文案（P0）。提交设置另有 Key（密码
//      框、只存内存、填了当次优先）与 API 地址两个小输入框，为空
//      时走已连接的安全凭证、流程不变。v5.70 起这两个框下面多一
//      层：生图接口总设置（顶部「生图」面板里维护、只存本机），
//      生效顺序 = 本页单次输入 > 总设置 > 已连接凭证，逐项解析见
//      imageapi.ts；本页设置区只显示当前生效来源一行，不另设一份
//      总设置输入。v3.84 起点「生成封面」先
//      跑一次只读鉴权预检（不存在的模型名探异步提交端点，不建
//      任务、不计费）：实际将生效的凭证被拒就拦下提交，并分清是
//      自填 Key 被拒还是已连接凭证被拒——401 Invalid token 是
//      「请求到了 Geeknow、但带去的 token 不被认」，无效 token 的
//      请求不会记进控制台使用日志；设置区另有「检测当前填写」
//      按钮可随时手动预检同一件事。
//   ④ 点「生成封面」才提交 Geeknow 异步任务（比例 16:9 / 3:4 /
//      4:3）；提交立刻落一条封面记录，之后只轮询同一任务号续查，
//      打开页面 / 刷新只续查、不重提；失败后重新生成必须是用户再
//      点一次并二次确认的新任务、明示重新计费（生图禁令同生图窗）。
//   出图后在记录里小图展示（v3.89 缩小布局：双列网格 + 高约
//   176px，点开弹层看大图）+ 无损下载（原图字节原样，不走预览图）。
//   v3.91：一键导出三比例改打包下载——旧版逐个触发三次下载，第
//   2、3 次脱离点击手势被浏览器当「自动下载」拦下且不吭声，页面
//   却报已导出（用户实报无法下载图片）；改为三张原图并行取回、
//   stored 直存打成一个 ZIP 只下载一次，取回失败写真实原因。
//   v3.90：提示词浓缩——分析先定「签名版」字段（标题钩子、道具
//   状态变化 + 身份锚点、每人只给动作/情绪/识别特征、背景一个关
//   键词、特效 ≤2、气泡 ≤2、一句额外重点），主提示词改为短稿拼
//   装（中文约 400 字、英文由服务端以签名为输入重新生成约 900
//   字符），详细描述与风格规则整段只作完整版备查（页面可切换查
//   看）；签名覆盖度 <90% 时整份回退完整版并写清缺哪几项。提交
//   副本仍是主词 + 画幅适配句、≤3900 的口径不变（短稿远在限
//   内）；清空重拼走新短稿口径，方案详细字段会按签名版一并浓
//   缩、完整版备查随之变短。生图禁令不变。
//   v3.89：重新生成不再丢参考图——旧版写死 withRefs:false，而
//   提示词硬约束「以随附的人物资产图为准」，没图时上游模型只回
//   文字「请上传角色参考图」被包成 400 upstream_text_reply；
//   现在按记录方案的封面人物名单重新匹配有图人物一起带上
//   （v4.22 起名单全无图也不再拦下：走 submitCover 的自动降级，
//   去掉约束句后按纯文字提交）。
//   v3.98：同一病根补到首次提交——单张生成与一键三比例此前从不
//   做这道对账：参考图全清空、或项目压根没有带图人物时，提示词
//   里的约束句照样以零图纯文本发出，必撞同样的 400。现在三条提
//   交路径（单张 / 三比例 / 记录重提）全走 submitCover 这一个入
//   口，提交前统一对账（promptHasCharacterConstraint × 实际取到
//   的参考图数）。部分缺失（方案里有人没选 / 没图 / 送达失败）
//   时提交前亮一条黄色提醒写清缺谁，不再静默提交。页上把人往死
//   路引的旧文案（无图人物时的说明、参考图区的旧说明）同步改成
//   实话。（对账的处置 v4.22 改为自动降级，见下条。）
//   v3.86 参考图改走链接（历史）：Geeknow 异步接口的 image 字
//   段只收 http(s) 链接、拒 data: Base64（真机实测 400「image
//   only supports http(s) image URLs for async image tasks」）。
//   当时借鉴字字动画：提交时把参考图降采样副本临时托管到匿名
//   公开图床换链接再提交，托管须经用户具名同意。
//   v4.05 安全修正（历史）：该图床链路曾整体下线、带参考图的封
//   面生成整体停用（勾了参考图整单拦下）。
//   v4.22 恢复参考图生成（用户明确要求「必须需要有参考图来生成
//   封面」、推翻 v4.05 停用）：①传图通道恢复 v3.86 已实测的公开
//   图床方案——特权层在提交时把参考图降采样副本临时上传到
//   uguu.se 换 https 链接再交给 Geeknow（直传与签名链接此前均
//   实测走不通）；②单次知情同意：参考图区有具名同意勾选，如实
//   写明副本将上传到公开图床、任何拿到链接的人都能查看、临时
//   托管短期自动删除、勾选只在本次打开页面期间有效——勾了才
//   上传，不勾选不拦单：自动降级纯文字生成（v5.16 起同意改按
//   项目记忆、刷新不归零，且无图降级前先弹一次明确确认，见文
//   末 v5.16 说明）；③约束联动：实际带
//   上参考图时提示词里的「外貌与服装以随附的人物资产图为准」
//   约束原样保留；一张图都没带上时，提交副本（及这条记录存下
//   的提示词）用 stripCharacterConstraint 自动去掉约束句，页面
//   上的提示词原文不动，不再要求用户手动删；④一键三比例与记
//   录重新生成走同一 submitCover 入口、同一套逻辑。生图面板同
//   口径（同意勾选在各自面板内）。
//   v4.23：风格选择旁加参照图——三款风格各一张小缩略图（52×68）
//   紧挨风格下拉排布，图取自当初提炼风格时学过的那批认可封面
//   里每款的代表作（风格1《以前的小孩 VS 现在的小孩》/ 风格2
//   《送给朋友的祝福》/ 风格3《小时候开智前做过的事》，图片随
//   客户端打包在 assets/）；点缩略图在页内弹层看大图（与封面
//   记录大图预览同款，不开新标签页）；当前选中风格的缩略图带
//   描边标明。参照图只作展示，不参与生图提交。
//   v4.28：第三步提示词正下方新增「上传参考图片」入口——用户可
//   为这张封面直接上传任意参考图（不限于人物资产图），与第二
//   步勾选的人物参考图一起走 submitCover 同一条提交通道：勾了
//   图床同意才取图、降采样后由特权层上传 uguu.se 换链接；上传
//   图优先提交、与人物参考图合计最多 16 张（MAX_COVER_REF_IMAGES，
//   与提交通道同口径；v5.03 前写死 4 张），超额 / 取图失败都
//   在提交前点名告知，不静默丢图。上传图只存本页组件内存
//   （data URL），不落库、不进备份，刷新即清空；项目没有带图
//   人物时第二步不渲染同意勾选，上传区补同一份同意勾选（同一
//   refHostConsent 状态）。
//   v4.29：第二步分析拆成两次顺序请求（修「总是网关超时」）——
//   服务端原先在一次请求里串行做主方案推理 + 英文签名重译，
//   合计约 50–60 秒超过网关等待上限、每次都被掐断。现第一步
//   analyzeScriptForCover 只出方案与中文稿（英文先给完整版），
//   enPending 时本页自动接力 translateCoverSignature 补英文浓
//   缩稿；第二步失败只降级英文并在说明里点名，方案不跟着失败。
//   v5.04：封面名单与人物卡两套名字对齐——人物卡 name 存代号
//   （A–E），方案 mainCharacters 存真名 / 称呼，两边此前用字符
//   串精确相等硬比、五处全落空（卡片全员误报不在名单、按封面
//   人物选无反应、分析后自动勾选失效、记录重提配 0 张图、提
//   交前警告误报缺人）；且名单按构图只有 2–4 位、项目可有 5
//   人。本页立 resolvePlanCharacter 三层解析（代号精确相等 →
//   scriptlib 别名表 → 备注 / 生图提示词子串兜底）供五处共用；
//   生效名单 = 方案名单 ∪ 已选参考；提交时 syncCoverPrompt-
//   Names 只改提示词的人物行、按实际提交顺序同步名字表，记
//   录存同步后的提示词。服务端与 coverstyles 拼词一字未动。
//   v5.05：人物行再加代号与逐人位置、并加一行参考图绑定（用
//   户判断：提示词里没有 A / B / C、没有人物位置，所以模型
//   对不上参考图——经项目 38 封面记录 id 23 的实际提交提示词
//   核实成立：人物行只有真名、无代号无逐人位置、分析
//   characterPoses 里的方位词拼词时被丢掉、全篇无参考图绑
//   定）。syncCoverPromptNames 升级为 syncCoverPromptChars：
//   分析返回 / 英文第二步 / 按方案重拼在落页面前先同步，提交
//   时按实际取图顺序再同步，展示与提交同一份；位置只取已有
//   数据（已写位置 → characterPoses 方位词 → 版式兜底），
//   人物外貌分段原文一字不动。服务端与 coverstyles 拼词仍
//   一字未动，风格库 10 款未动。
//   v5.06：封面提速 + 简化（用户报障：分析太慢、整页繁琐浪费
//   时间）。
//   慢点实查有三：①分析是两次串行推理（主方案 + 英文签名重
//   译），页面要等第二步落地才算「分析完」，而第一步的方案与
//   中英文稿其实已经可生成；②方案只存组件状态——再点分析、
//   切风格、重进页面一律从零重跑；③一键三比例是串行循环，
//   每个比例都把参考图重新取一遍（大图还要再走一遍中转分
//   片）、鉴权预检也探三遍，一个等一个。改法：①第一步落地
//   即结束「分析中」，英文浓缩稿改后台接力（回来自动换上，
//   期间可直接生成，英文先用完整版）；服务端分析摘要再收紧
//   （只发标题 / 梗概 / 人物 / 场景 / 风格与定钩子的台词，不
//   发整份分镜逐拍全文）。②分析结果按内容指纹缓存（大纲 /
//   剧本 / 人物 / 风格设置 / 所选模式任一变了指纹就变）：指
//   纹与风格都没变时点「分析」直接复用上次结果、重进页面自
//   动恢复，另有「强制重新分析」可手动重跑；「按当前方案重
//   新拼提示词」会把改后的方案写回缓存，不被旧缓存盖掉。
//   ③取图抽成 fetchCoverRefs：一键三比例只取一次图、只探一
//   次预检，三个比例改 Promise.all 并行提交，各自落记录、
//   各自轮询、逐比例列结果；submitCover 新增 preparedRefs /
//   skipProbe 入参并改回 {ok, error}（并行时逐比例失败原因
//   各记各的，不再共用一条会被覆盖的报错）。提示词三份仍共
//   用同一份（只差画幅适配句），v5.05 的代号 / 位置 / 参考
//   图绑定原样保留。
//   简化（同版追加，用户点名「不要那么繁琐」）：默认路径收
//   到最短——进页面（缓存命中自动恢复方案）→ 点分析（或免
//   点）→ 勾一次图床同意 → 点「一键生成三比例」，共 2–3 次
//   点击。①方案逐项编辑默认收起，只留一行摘要（标题 + 上
//   封面人物）与「展开方案细节（可改）」；②中英文提示词默
//   认收起，只留「查看 / 编辑提示词」入口与字数结论（超线
//   提醒留在收起态外）；③一键三比例去掉二次确认、一次点
//   击直接提交（按钮文案写明 3 个任务 · 3 次计费，计费披
//   露不减）；④参考图本就默认全选 + 分析后按名单自动勾
//   选，未动。图床同意仍按 v4.22 已披露口径：只在本次打开
//   页面期间有效、刷新要重勾——那是上传公开图床的具名同
//   意，不是状态丢失的 bug，本版不绕过。风格库 10 款、生
//   图禁令一字未动。
//   v5.07：分析看图——点「分析」时把有图的人物资产图（一人一
//   张、最多 5 张）随文字一起发给 AI，提示词写死「严格参照人
//   物资产图」（图与文字不一致以图为准），先按图排版再定标
//   题；分析缓存认图（指纹带资产图地址），图新增 / 更换自动
//   失效。生成提示词的人物行同步带上这句。
//   v5.08：修两个用户实报的问题。①分析改后台任务制（项目 39
//   实报：带 5 张图的同步分析被网关在 50–60 秒掐断、红字报超
//   时无方案）：点「分析」先 startCoverAnalysisJob 在服务端
//   建任务行，本页循环 runCoverAnalysisJobStep 步进驱动（服
//   务端 150 秒认领窗口挡重复推理）、pollCoverAnalysisJob 只
//   读状态；每步结果先落库再回页面，单次响应被网关掐断只丢
//   响应不丢结果；任务 id + 内容指纹存本机，刷新 / 重进页面
//   自动接着同一个任务取结果。主方案与英文浓缩稿两步都进任
//   务（v4.29 / v5.06 的页面侧接力退役），done 时一次拿到完
//   整结果。②修人物代号 / 位置 / 绑定映射（记录 28–30 实
//   证：提交提示词里「B（小帅）」重复三行、D 女孩整行丢
//   失）：方案名解析新增特征锚定层（resolvePlanCharForPlan
//   ——用签名里的识别特征对卡片备注 + 生图提示词打分定卡，
//   「小帅」靠「红色无袖篮球背心」锚回 A）；resolvePlan-
//   Character 删除任意子串兜底遍（所有格提及必误伤）；参考
//   图与人物行条目按卡去重（一张卡只占一个参考图编号）；
//   posFromPoses 跳过所有格提及定位置、补「左阵营 / 右阵
//   营 / 左：/ 右：」方位词、删任意锚点兜底。服务端拼词与
//   风格库 10 款未动；分析不花钱、不提交生图的口径不变。
//   v5.10：封面分析改走聊天框（用户定调：工作台自动分析屡出
//   问题——超时、映射错乱、提示词过长；与视频精修解剖同路，
//   聊天框里由助手直接分析更准）。第二步的「分析剧本生成封面
//   方案」按钮改成「复制剧本代码」：点一下把封面分析用剧本
//   摘要（buildCoverChatDigest 拼：项目标题 / 剧本标题 / 已选
//   风格 / 梗概 / 人物代号+称呼+身份 / 主梗与关键事件 / 关键
//   场景 / 核心道具 + 一句分析请求说明）复制到剪贴板并亮「已
//   复制」；摘要不含分镜逐拍与全部台词、不写人物外貌长相
//   （长相以参考图为准，v5.09 规则不变）。用户把摘要粘到聊
//   天框，助手分析出封面提示词，用户粘回第三步提示词框点生
//   成。页面不再有任何触发工作台自动分析的按钮（原 runAnalyse
//   入口与「强制重新分析」一并下线）；服务端分析动作与任务制
//   管线保留不动（历史缓存恢复、未完成任务续跑、方案编辑与
//   重拼仍可用）。第三步删掉「方案三样已定齐……」那行分析方
//   案状态文案（备查稿切换按钮保留）。参考图选择、同意勾选、
//   人物卡、提示词框、生成与记录一字未动。
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type ApiResponse } from "./api";
import { GenProgress } from "./genprogress";
import {
  PreviewImg,
  PREVIEW_MAX_EDGE,
  regenerateOversizedPreview,
} from "./previewimg";
import { ConfirmDialog } from "./confirm";
import {
loadImageApiSettings,
resolveImageApiConfig,
IMAGE_API_SETTINGS_EVENT,
type ImageApiSettings,
} from "./imageapi";
import { sha256Hex } from "./sha256";
import {
describeThrownError,
isGatewayTimeoutError,
retryReadQuery,
withReadTimeout,
} from "./gateway";
import {
buildStoredZip,
downloadOriginalImage,
downloadZipBlob,
fetchOriginalImageBytes,
formatByteSize,
parseScript,
projectCharacterAliases,
urlToSubmitReference,
type LensMappingContext,
} from "./scriptlib";
import {
uploadImageUrlInChunks,
type ChunkedImageRef,
} from "./chunkedupload";
import coverRefVs from "./assets/封面参照图-21张/cover-ref-vs.jpg";
import coverRefFace from "./assets/封面参照图-21张/cover-ref-face.jpg";
import coverRefCollage from "./assets/封面参照图-21张/cover-ref-collage.jpg";
import coverRefPanorama from "./assets/封面参照图-21张/cover-ref-panorama.jpg";
import coverRefSolo from "./assets/封面参照图-21张/cover-ref-solo.jpg";
import coverRefPoster from "./assets/封面参照图-21张/cover-ref-poster.jpg";
import coverRefPanels from "./assets/封面参照图-21张/cover-ref-panels.jpg";
import coverRefCamps from "./assets/封面参照图-21张/cover-ref-camps.jpg";
import coverRefSpectacle from "./assets/封面参照图-21张/cover-ref-spectacle.jpg";
import coverRefMarket from "./assets/封面参照图-21张/cover-ref-market.jpg";
// v5.57：风格参照图在选择排里只显示 46px 高的小图，另备一份
// ≤224px 的降质小图（十张合计约 129KB，原图约 1MB）；点开看大图
// 仍用原图全质（上方十个导入）。
import coverRefVsSm from "./assets/封面参照图-21张/cover-ref-vs-sm.jpg";
import coverRefFaceSm from "./assets/封面参照图-21张/cover-ref-face-sm.jpg";
import coverRefCollageSm from "./assets/封面参照图-21张/cover-ref-collage-sm.jpg";
import coverRefPanoramaSm from "./assets/封面参照图-21张/cover-ref-panorama-sm.jpg";
import coverRefSoloSm from "./assets/封面参照图-21张/cover-ref-solo-sm.jpg";
import coverRefPosterSm from "./assets/封面参照图-21张/cover-ref-poster-sm.jpg";
import coverRefPanelsSm from "./assets/封面参照图-21张/cover-ref-panels-sm.jpg";
import coverRefCampsSm from "./assets/封面参照图-21张/cover-ref-camps-sm.jpg";
import coverRefSpectacleSm from "./assets/封面参照图-21张/cover-ref-spectacle-sm.jpg";
import coverRefMarketSm from "./assets/封面参照图-21张/cover-ref-market-sm.jpg";
import {
COVER_STYLES,
buildCoverPrompts,
coverStyleById,
signatureCoverage,
stripCharacterConstraint,
ALL_COVER_RATIOS,
GEEKNOW_PROMPT_HARD_LIMIT,
promptHasCharacterConstraint,
ensureEvidenceReinforcement,
promptHasEvidenceReinforcement,
SUBMIT_PROMPT_BUDGET,
withRatioAdapter,
type CoverPlan,
} from "../../server/src/coverstyles";

type ProjectDetail = NonNullable<
  ApiResponse<typeof api, "getProject">["project"]
>;
type CoverRecord = ApiResponse<
  typeof api,
  "listCoverRecords"
>["records"][number];
type ProbeResult = ApiResponse<typeof api, "probeGeeknowAuth">;

// v5.08：分析任务 done 时服务端存下的完整结果，形状与同步分
// 析动作的返回一致，applyAnalysisResult 按这份类型落页面。
type CoverAnalysisResult = ApiResponse<typeof api, "analyzeScriptForCover">;

const RATIO_OPTIONS: { value: "16:9" | "3:4" | "4:3"; label: string; hint: string }[] = [
  { value: "16:9", label: "16:9", hint: "横版宽幅" },
  { value: "3:4", label: "3:4", hint: "竖版 · 参考图同比例" },
  { value: "4:3", label: "4:3", hint: "横版紧凑" },
];

// v4.23 风格参照图：每款风格一张代表性参照图——就是当初提炼这
// 套风格时学过的那批封面里的一张（用户 2026-10-30 给的 11 张认
// 可封面，coverstyles.ts 的风格分析里逐张点过名）：风格1 取
// 《以前的小孩 VS 现在的小孩》（VS 对撞 + 中央爆炸徽章）、风格2
// 取《送给朋友的祝福》（双人怼脸 + 红 X 梗贴纸）、风格3 取
// 《小时候开智前做过的事》（撕纸拼贴 + 格旁小字标注）。图片本
// 体随客户端打包（client/src/assets/），只作选风格时的参照展示，
// 不参与任何生图提交。
// v5.01 补风格 4–8 的参照图：各取 v5.00 提炼该风格时亲眼分析过
// 的 21 张点赞 1000+ 采集封面里的代表作一张（来源为监控页采集
// 的封面原图，随客户端打包，不热链、不外发）：风格4 取《离谱数
// 学答案合集2》（655783 赞，教室全景）、风格5 取《当你打车打到
// 校长的车》（5387 赞，单人半身 + 大标题）、风格6 取《我只要
// "熟"的！》（157837 赞，海报式贴纸轰炸）、风格7 取《当你爸是
// 你的校长》（2697 赞，多格拼贴）、风格8 取《现在的小孩VS以前
// 的小孩大合集》（2650 赞，多方阵营 VS）。
// v5.02 补风格 9–10 的参照图：各取用户新发的封面原图一张（就是
// 提炼该风格的那张本身，随客户端打包，不热链、不外发）：风格9
// 取《离谱数学题 / 冻住全校？》（雪地奇观、冰霜标题 + 木牌副标
// 题）、风格10 取《走读生在 / 给我次机会》（海鲜摊、涂鸦标题 +
// 撕纸条金句）。
const STYLE_REFERENCES: Record<
  string,
  { src: string; thumbSrc: string; title: string }
> = {
  explosive_vs: { src: coverRefVs, thumbSrc: coverRefVsSm, title: "以前的小孩 VS 现在的小孩" },
  face_meme: { src: coverRefFace, thumbSrc: coverRefFaceSm, title: "送给朋友的祝福" },
  collage_memory: { src: coverRefCollage, thumbSrc: coverRefCollageSm, title: "小时候开智前做过的事" },
  panorama_story: { src: coverRefPanorama, thumbSrc: coverRefPanoramaSm, title: "离谱数学答案合集2" },
  solo_half_title: { src: coverRefSolo, thumbSrc: coverRefSoloSm, title: "当你打车打到校长的车" },
  poster_sticker_bomb: { src: coverRefPoster, thumbSrc: coverRefPosterSm, title: "我只要\"熟\"的！" },
  multi_panel_story: { src: coverRefPanels, thumbSrc: coverRefPanelsSm, title: "当你爸是你的校长" },
  camps_vs: { src: coverRefCamps, thumbSrc: coverRefCampsSm, title: "现在的小孩VS以前的小孩大合集" },
  spectacle_effect_title: { src: coverRefSpectacle, thumbSrc: coverRefSpectacleSm, title: "离谱数学题 / 冻住全校？" },
  market_note_quote: { src: coverRefMarket, thumbSrc: coverRefMarketSm, title: "走读生在 / 给我次机会" },
};

const PRESET_MODELS = [
  "gpt-image-2",
  "gpt-image-2-pro",
  "gpt-image-2.5-flare",
  "gpt-image-2.5-sunburst",
];

const STATUS_LABEL: Record<string, string> = {
  submitted: "已提交",
  generating: "生成中",
  done: "已出图",
  failed: "失败",
  expired: "失败（任务号已失效）",
};

const POLL_INTERVAL_MS = 4000;
const MAX_POLLS = 150; // 约 10 分钟；到顶停下但保留任务号，可续查
const MAX_POLL_ERRORS = 5;

// v5.03 参考图张数上限：旧版客户端写死 4 位（默认勾选 / 逐个勾选 /
// 全选 / 按名单选 / 提交合并 / 记录重提 / 上传参考图全卡在 4），项
// 目里有 5 位人物时第 5 位选不上。查清层级：4 只是本页常数，不是
// 接口硬限——服务端提交动作与特权层契约的 referenceImages 上限都
// 是 16。本页所有参考图口径统一改用这个数：项目里有多少位有图人
// 物就能选多少位（16 以内），上传图与人物图合计也以它封顶，提交
// 永远不会撞服务端校验。
const MAX_COVER_REF_IMAGES = 16;

const EMPTY_PLAN: CoverPlan = {
  layoutType: "vs",
  mainTitle: "",
  sideA: "",
  sideB: "",
  subtitle: "",
  mainCharacters: [],
  characterPositions: [],
  titlePosition: "",
  titleStyle: "",
  characterPositionsEn: null,
  titlePositionEn: null,
  titleStyleEn: null,
};

export function CoverBench({
  project,
  hasScript,
}: {
  project: ProjectDetail;
  hasScript: boolean;
}) {
  const queryClient = useQueryClient();
  const canAnalyse = project.outline.trim().length > 0 || hasScript;

  const [styleId, setStyleId] = useState("explosive_vs");
  const style = coverStyleById(styleId);
  const [ratio, setRatio] = useState<"16:9" | "3:4" | "4:3">("3:4");
  const [model, setModel] = useState("gpt-image-2.5-flare");
  const [quality, setQuality] = useState<"max" | "high" | "standard">("high");
  const [showTraits, setShowTraits] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  // v3.83 提交设置：Key（密码框）与 API 地址。Key 只存组件内存——
  // 不写 localStorage、不进封面记录、不进任何报错文案；为空时走已
  // 连接的安全凭证。submitCfgRef 是给轮询闭包读的镜像（轮询启动后
  // 仍能拿到用户当前填的配置，刷新页面后 Key 自然失效、回落凭证）。
  const [customKey, setCustomKey] = useState("");
  const [apiBase, setApiBase] = useState("https://api.geeknow.top");
  const submitCfgRef = useRef({
    apiKey: "",
    apiBase: "https://api.geeknow.top",
  });
  // v5.70 生图接口总设置接入：实际生效配置按「封面页单次输入 >
  // 总设置 > 已连接凭证」逐项解析（imageapi.ts）。本页两个框仍是
  // 单次输入（只存内存、不写回总设置、刷新即失效）；总设置在顶部
  // 「生图」面板里维护、只存本机，本页只读它并随其变化刷新解析。
  const [globalApiSettings, setGlobalApiSettings] =
    useState<ImageApiSettings>(() => loadImageApiSettings());
  useEffect(() => {
    const on = () => setGlobalApiSettings(loadImageApiSettings());
    window.addEventListener(IMAGE_API_SETTINGS_EVENT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(IMAGE_API_SETTINGS_EVENT, on);
      window.removeEventListener("storage", on);
    };
  }, []);
  const coverResolved = resolveImageApiConfig(globalApiSettings, {
    apiKey: customKey,
    apiBase,
  });
  submitCfgRef.current = {
    apiKey: coverResolved.apiKey ?? "",
    apiBase: coverResolved.apiBase ?? "",
  };
  const [refNote, setRefNote] = useState<string | null>(null);
  // v3.98 参考图部分缺失的黄色提醒（提交前由 submitCover 对账后
  // 写入：方案里有人没带上图但仍有图可交时，亮黄提醒再提交，
  // 不静默、不拦下）。
  const [refWarning, setRefWarning] = useState<string | null>(null);
  // v5.04 中转压缩进行态：过大原图改走分片中转时逐张亮明进度
  // （正在中转第几张、第几片），不静默等用户干等。
  const [refProgress, setRefProgress] = useState<string | null>(null);
  // 参考图公开图床知情同意：v5.16 起按项目记忆（用户拍板改法）——
  // 勾选存进本机 localStorage（键带项目 id），打开封面页时该项目
  // 有记忆就默认沿用并明示状态，刷新不再归零；用户取消勾选或点
  // 「清除这个项目的同意记忆」即清掉。v4.22–v5.15 的「只在本次
  // 打开页面期间有效、刷新重勾」口径就此作废（作废的只是记忆方
  // 式：同意本身仍是用户亲手勾的，工作台绝不替用户默认同意）。
  // 提交时才据此决定是否取图上传换链接；未同意时不上传任何图
  // 片，submitCover 自动降级纯文字（去约束句），不拦单。
  const [refHostConsent, setRefHostConsent] = useState(false);
  const refHostConsentKey = `coverbench.refHostConsent.v1.${project.id}`;
  useEffect(() => {
    let saved = false;
    try {
      saved = window.localStorage.getItem(refHostConsentKey) === "1";
    } catch {
      saved = false;
    }
    setRefHostConsent(saved);
  }, [refHostConsentKey]);
  const applyRefHostConsent = (checked: boolean) => {
    setRefHostConsent(checked);
    try {
      if (checked) {
        window.localStorage.setItem(refHostConsentKey, "1");
      } else {
        window.localStorage.removeItem(refHostConsentKey);
      }
    } catch {
      // 存不进（隐私模式等）就只当本次打开期间有效，不报错。
    }
  };
  // v5.18：生成用哪一版提示词由用户在第三步明确单选（中文 /
  // English），选中的那一版就是提交给图片模型的那一版——取代
  // v5.16 以前「英文框非空就优先英文」的隐式规则。选择按项目记
  // 忆（与「视频模型：」下拉框同款项目级记忆：localStorage 键带
  // 项目 id，打开封面页 / 换项目时读回，刷新不失效）；从没选过
  // （null）时才按老规则默认：英文框非空默认英文、否则中文。
  // 一旦用户点过选择，有效语言从此只认选择、不再随英文框内容
  // 变化。记录重提不走这里（重提沿用该记录自己的提交版，口径
  // 不变）。
  const [promptLangChoice, setPromptLangChoice] = useState<
    "zh" | "en" | null
  >(null);
  const promptLangKey = `coverbench.promptLang.v1.${project.id}`;
  useEffect(() => {
    let saved: "zh" | "en" | null = null;
    try {
      const v = window.localStorage.getItem(promptLangKey);
      if (v === "zh" || v === "en") saved = v;
    } catch {
      saved = null;
    }
    setPromptLangChoice(saved);
  }, [promptLangKey]);
  const applyPromptLang = (lang: "zh" | "en") => {
    setPromptLangChoice(lang);
    try {
      window.localStorage.setItem(promptLangKey, lang);
    } catch {
      // 存不进（隐私模式等）就只当本次打开期间有效，不报错。
    }
  };
  // v5.16 ②：无图降级提交前的一次明确确认（状态存待续的提交动
  // 作与大白话说明；用户点确认才真正提交，点取消就不提交）。只
  // 拦在「实际一张参考图都带不上、而提交词带人物约束」这一刻，
  // 不强制必须带图——确认了照常纯文字提交（不拦单底线不变）。
  const [textOnlyConfirm, setTextOnlyConfirm] = useState<{
    detail: string;
    proceed: () => Promise<void>;
  } | null>(null);
  const confirmTextOnlyAndProceed = () => {
    const pending = textOnlyConfirm;
    setTextOnlyConfirm(null);
    if (!pending) return;
    setSubmitting(true);
    setSubmitError(null);
    void (async () => {
      try {
        await pending.proceed();
      } catch (e) {
        setSubmitError(
          isGatewayTimeoutError(e)
            ? "提交时网关超时：这次提交有没有被服务商收到还不确定，先不要连点；等十几秒后看下方记录，若刚才其实已提交成功，记录里会有它。"
            : `提交失败：${describeThrownError(e)}`,
        );
      } finally {
        setSubmitting(false);
      }
    })();
  };
  // v3.84 鉴权预检状态（设置区手动检测与提交前自动预检共用结果
  // 文案；预检结论只反映「实际将生效的凭证」在提交端点的鉴权）。
  const [probing, setProbing] = useState(false);
  const [probeMsg, setProbeMsg] = useState<string | null>(null);
  const [probeBad, setProbeBad] = useState(false);

  const [plan, setPlan] = useState<CoverPlan | null>(null);
  const [promptZh, setPromptZh] = useState("");
  const [promptEn, setPromptEn] = useState("");
  // v3.90 浓缩稿双份存档：shortZh/shortEn = 浓缩主稿（writePrompt），
  // detailZh/detailEn = 完整版备查（detailFallback）；两个提示词框
  // 显示哪一份由 promptView 决定，切换只是换框里的内容，不重新拼
  // 词、不提交任何东西。覆盖度与缺项来自服务端分析或本地同口径
  // 现算（signatureCoverage 与服务端同一份实现）。
  const [shortZh, setShortZh] = useState("");
  const [shortEn, setShortEn] = useState("");
  const [detailZh, setDetailZh] = useState("");
  const [detailEn, setDetailEn] = useState("");
  const [promptView, setPromptView] = useState<"short" | "full">("short");
  // v5.10：覆盖度仍随分析结果 / 缓存一起存（setCoverageInfo 的写
  // 入点不变），但第三步那行状态文案已删，页面不再读它。
  const [, setCoverageInfo] = useState<{
    score: number;
    missing: string[];
    usedCondensed: boolean;
    enCondensed: boolean;
  } | null>(null);
  // 用户亲手改过英文框后，重拼都不许拿机器稿覆盖它（用户
  // 已手填 promptEn 时跳过翻译沿用手填）；分析结果落地
  // （applyAnalysisResult）沿用同一口径。
  const enHandEditedRef = useRef(false);
  // 实际提交字数（v3.88 修正口径）：提交的不是编辑框里的主提示词
  // 本身，而是主词 + 当前比例的画幅适配句（withRatioAdapter 在提交
  // 时追加，英文适配句长 195~247 字符）。v3.85~v3.87 的计数只数
  // 主词、把适配句漏在外面：主词 3707 显示「在安全线内」，实际提
  // 交副本 3903~3955 被本地与服务端按 3900 拦下，单张与三比例全
  // 灭。现在计数与提交口径完全一致——数的是 withRatioAdapter 拼
  // 好的提交副本；单张看当前比例，三比例按钮看三份副本的最大值。
  // v5.18：有效提交语言 = 用户在第三步选的那一版（promptLang-
  // Choice，按项目记忆）；从没选过时才按老规则默认（英文框非
  // 空默认英文、否则中文）。提交文本只取选中版——选中版为空就
  // 是空，绝不回落另一版（生成入口会明确提示先填好这一版）。
  const submitLang: "en" | "zh" =
    promptLangChoice ?? (promptEn.trim() ? "en" : "zh");
  const submitPromptText =
    submitLang === "en" ? promptEn.trim() : promptZh.trim();
  // 选中版为空时的明确提示文案（生成入口共用）：点名是哪一版空
  // 的、先填好再生成，并写明不会自动改用另一版。两版都空且从没
  // 选过语言时回落通用「先粘贴提示词」文案。
  const selectedLangEmptyMessage = (): string => {
    if (promptLangChoice) {
      return `你选的是${submitLang === "en" ? "英文" : "中文"}版，但${submitLang === "en" ? "英文" : "中文"}提示词框是空的——先把这一版填好再生成；不会自动改用${submitLang === "en" ? "中文" : "英文"}版提交。`;
    }
    return "先把聊天框分析好的封面提示词粘贴到第三步的提示词框、或自己写一段，再点生成";
  };
  const effectiveSubmitLen = (r: "16:9" | "3:4" | "4:3") =>
    submitPromptText
      ? withRatioAdapter(submitPromptText, r, submitLang).length
      : 0;
  const submitPromptLen = effectiveSubmitLen(ratio);
  const submitPromptOver = submitPromptLen > SUBMIT_PROMPT_BUDGET;
  // v5.81：封面页不再做防版权拦截（用户定：封面页不用做防拦截）——
  // v5.80 在此算的「将提交那一版替换清单」已下线，提交按原文走。
  const batchPromptLen = Math.max(
    ...ALL_COVER_RATIOS.map((r) => effectiveSubmitLen(r)),
  );
  const batchPromptOver = batchPromptLen > SUBMIT_PROMPT_BUDGET;
  // v5.16 ③：提交前明示「实际将提交的那一版」——将提交的语言版
  // 本（v5.18 起 = 用户选的那一版；从没选过才按老规则默认）与该版是否已含风格 11 人
  // 物强化句，第三步常显一行，不再出现「中英文框不一致时静默以
  // 英文为准、且提交版缺强化句」的事后才发现。
  const submitVersionHasReinforce =
    styleId === "evidence_reveal" &&
    (submitLang === "en"
      ? promptHasEvidenceReinforcement(promptEn, "en")
      : promptHasEvidenceReinforcement(promptZh, "zh"));
  const [analyzing, setAnalyzing] = useState(false);
  const [analyseError, setAnalyseError] = useState<string | null>(null);
  const [analyseNote, setAnalyseNote] = useState<string | null>(null);

  // ------------------------------------------------------------------
  // v5.06 分析结果缓存：分析慢的一大半是「同样的内容反复重跑」——
  // 方案此前只存组件状态，再点一次分析、切个风格回来、重进页面
  // 都从零再跑两次推理。现在把一次完整分析的结果（方案 + 四份
  // 提示词稿 + 覆盖度 + 自动勾选的参考人物）按「内容指纹 + 风格」
  // 存 localStorage：指纹由大纲 / 剧本 JSON / 人物（名 + 备注 +
  // 资产图地址，v5.07 起认图）/ 项目名 / 剧本风格 / 已选模式拼成，任一变了指纹就
  // 变、缓存自动失效；指纹与风格都没变时，重进页面自动恢复，
  // 一次推理都不发。（v5.10 起页面不再触发新分析，缓存只用于
  // 恢复历史方案；新方案走第二步「复制剧本代码」到聊天框分析。）
  // 缓存只是本机加速，不进备份、不落库；读不到 / 写不进都静默
  // 回落，绝不因为缓存坏了把页面堵死。
  // ------------------------------------------------------------------
  type CoverAnalysisCache = {
    v: 1;
    fp: string;
    styleId: string;
    plan: CoverPlan;
    shortZh: string;
    shortEn: string;
    detailZh: string;
    detailEn: string;
    coverageInfo: {
      score: number;
      missing: string[];
      usedCondensed: boolean;
      enCondensed: boolean;
    } | null;
    refCharIds: number[];
    savedAt: number;
  };
  const coverCacheKey = `coverbench.analysisCache.v1.${project.id}`;
  const analysisFingerprint = (): string => {
    // v5.07：指纹认图——人物项带上资产图地址本身（换图 = 新 blob
    // 地址），人物图新增 / 更换后指纹即变、旧的纯文字分析缓存自
    // 动失效，下次分析重新看图出方案；图没变仍复用（v5.06 口径）。
    const chars = project.characters
      .map((c) => [c.id, c.name, c.note, c.imageUrl ?? ""].join("\u0001"))
      .join("\u0002");
    const raw = [
      project.name,
      project.outline,
      project.scriptJson ?? "",
      project.stylePreset,
      project.styleCustom,
      String(project.selectedModeId ?? 0),
      chars,
    ].join("\u0003");
    let h = 0x811c9dc5;
    for (let i = 0; i < raw.length; i++) {
      h ^= raw.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return `${raw.length}:${(h >>> 0).toString(36)}`;
  };
  const readCoverCache = (): CoverAnalysisCache | null => {
    try {
      const text = window.localStorage.getItem(coverCacheKey);
      if (!text) return null;
      const parsed = JSON.parse(text) as CoverAnalysisCache;
      if (!parsed || parsed.v !== 1 || !parsed.plan) return null;
      // v5.09：缓存里的方案必须是新三样形状（站位数组 + 标题位
      // 置 / 风格字符串）。更早的旧缓存（带钩子 / 气泡 / 道具 /
      // 签名版等旧字段）形状对不上就当没有缓存，逼用户重新分析
      // 出新方案，绝不把旧方案恢复回来拼旧口径提示词。
      if (
        !Array.isArray(parsed.plan.characterPositions) ||
        typeof parsed.plan.titlePosition !== "string" ||
        typeof parsed.plan.titleStyle !== "string" ||
        !Array.isArray(parsed.plan.mainCharacters)
      ) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  };
  const writeCoverCache = (entry: CoverAnalysisCache) => {
    try {
      window.localStorage.setItem(coverCacheKey, JSON.stringify(entry));
    } catch {
      // 存不进（配额 / 隐私模式）就不存，下次照常分析，不报错。
    }
  };
  // ------------------------------------------------------------------
  // v5.08 分析任务续跑凭据：分析改任务制后（startCoverAnalysis-
  // Job 在服务端建行、本页步进驱动），本机只记 jobId + 当时的
  // 内容指纹 + 风格——刷新 / 重进页面时凭它接着同一个任务取结
  // 果，不新建、不重复推理。任务的真实状态与结果都在服务端
  // （cover_analysis_jobs），本机这份只是路标；读不到 / 写不进
  // 都静默回落（下次点分析会新建任务），绝不堵死分析。
  // ------------------------------------------------------------------
  type CoverJobRef = {
    jobId: number;
    fp: string;
    styleId: string;
    startedAt: number;
  };
  const coverJobKey = `coverbench.analysisJob.v1.${project.id}`;
  const readCoverJob = (): CoverJobRef | null => {
    try {
      const text = window.localStorage.getItem(coverJobKey);
      if (!text) return null;
      const parsed = JSON.parse(text) as CoverJobRef;
      if (!parsed || typeof parsed.jobId !== "number") return null;
      return parsed;
    } catch {
      return null;
    }
  };
  const writeCoverJob = (job: CoverJobRef | null) => {
    try {
      if (job) {
        window.localStorage.setItem(coverJobKey, JSON.stringify(job));
      } else {
        window.localStorage.removeItem(coverJobKey);
      }
    } catch {
      // 存不进就不存：任务本身还在服务端，只是刷新后接不回来。
    }
  };
  // 当前页面内容对应的指纹（渲染期现算：FNV 扫一遍剧本 JSON，
  // 一次渲染 <1ms 级）。缓存是否仍有效、要不要亮「强制重新分
  // 析」，都拿它与已应用缓存的指纹比。
  const fpNow = analysisFingerprint();
  // v5.10：「强制重新分析」按钮已随分析改走聊天框下线，
  // cacheStillValid 不再需要；cacheAppliedFp 只写不读（恢复 /
  // 落地时标记已应用的指纹），故只留 setter。
  const [, setCacheAppliedFp] = useState<string | null>(null);
  // 分析驱动的代次：新一轮分析 / 强制重跑 / 挂载续跑都会 +1，
  // 旧一轮的任务驱动循环对不上就停手，绝不拿上一轮的结果盖
  // 掉新方案（v5.06 时是英文接力代次，v5.08 沿用为任务驱动
  // 代次）。
  const analyseRunRef = useRef(0);
  // 挂载 / 换项目时自动恢复一次缓存（指纹对得上才恢复）。
  const cacheRestoredForRef = useRef<number | null>(null);

  const charsWithImage = project.characters.filter((c) => c.imageUrl);
  const [refCharIds, setRefCharIds] = useState<number[]>(() =>
    charsWithImage.slice(0, MAX_COVER_REF_IMAGES).map((c) => c.id),
  );
  // 项目人物变化时（换项目组件会重挂，这里只兜底同步新增人物不自动
  // 勾选）：保持用户已勾选 ∩ 现有人物。
  useEffect(() => {
    setRefCharIds((prev) =>
      prev.filter((id) => charsWithImage.some((c) => c.id === id)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  // v5.06：把一份缓存的分析结果整套落回页面（与 runAnalyse 第一步
  // 落地同一套状态）。英文框是用户亲手改过的就不覆盖（同分析口
  // 径）；参考人物只保留现在还有图的人。
  const applyCachedAnalysis = (entry: CoverAnalysisCache) => {
    analyseRunRef.current += 1;
    setPlan(entry.plan);
    setShortZh(entry.shortZh);
    setShortEn(entry.shortEn);
    setDetailZh(entry.detailZh);
    setDetailEn(entry.detailEn);
    setPromptView("short");
    setCoverageInfo(entry.coverageInfo);
    setPromptZh(entry.shortZh);
    const keepHandEn = enHandEditedRef.current && !!promptEn.trim();
    if (!keepHandEn) setPromptEn(entry.shortEn);
    const ids = entry.refCharIds.filter((id) =>
      charsWithImage.some((c) => c.id === id),
    );
    if (ids.length > 0) setRefCharIds(ids);
    setCacheAppliedFp(entry.fp);
  };

  // v5.06：挂载 / 换项目时，若本地缓存的指纹与当前内容对得上，
  // 直接恢复上次的方案与提示词（连同当时选的风格），不再要求用
  // 户重新点分析。每个项目只自动恢复一次；恢复后用户改了剧本，
  // 指纹变化会让缓存自动失效（点分析时现算现比）。
  useEffect(() => {
    if (cacheRestoredForRef.current === project.id) return;
    cacheRestoredForRef.current = project.id;
    const entry = readCoverCache();
    if (entry && entry.fp === analysisFingerprint()) {
      setStyleId(entry.styleId);
      applyCachedAnalysis(entry);
      setAnalyseNote(
        "已恢复上次的分析结果（剧本、人物、风格都没变）：可以直接选参考图、点生成封面；想要新方案，点第二步的「复制剧本代码」发到聊天框，让助手按当前剧本重新分析。",
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  // v5.08：挂载 / 换项目时，若本地记着一个未完成的分析任务且
  // 内容指纹没变，自动接着它取结果——任务状态与结果在服务端，
  // 刷新 / 重进都不丢。指纹变了（剧本 / 人物在任务跑的时候改
  // 过）就作废这条路标；缓存已能直接恢复同内容同风格的结果
  // 时，任务同样作废、不重复驱动。
  const jobResumedForRef = useRef<number | null>(null);
  useEffect(() => {
    if (jobResumedForRef.current === project.id) return;
    jobResumedForRef.current = project.id;
    const stored = readCoverJob();
    if (!stored) return;
    if (stored.fp !== analysisFingerprint()) {
      writeCoverJob(null);
      return;
    }
    const cached = readCoverCache();
    if (
      cached &&
      cached.fp === stored.fp &&
      cached.styleId === stored.styleId
    ) {
      writeCoverJob(null);
      return;
    }
    void (async () => {
      let st: ApiResponse<typeof api, "pollCoverAnalysisJob"> | null = null;
      try {
        st = await api.pollCoverAnalysisJob({ jobId: stored.jobId });
      } catch {
        st = null;
      }
      if (!st) return;
      if (st.status === "failed") {
        writeCoverJob(null);
        return;
      }
      setStyleId(stored.styleId);
      const runToken = ++analyseRunRef.current;
      setAnalyzing(true);
      setAnalyseNote(
        "发现一个没跑完的封面分析任务，正在接着取结果（任务在服务端，刷新不会丢）……",
      );
      const characterImages = await deriveCharacterImages();
      if (st.status === "done" && st.result) {
        writeCoverJob(null);
        applyAnalysisResult(st.result, characterImages.length, stored.styleId);
        return;
      }
      await driveCoverJob(
        stored.jobId,
        characterImages,
        runToken,
        stored.styleId,
      );
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  // ------------------------------------------------------------------
  // v5.04 名字翻译层：人物卡 name 存的是代号（A/B/C…），封面方案
  // mainCharacters 存的是真名 / 角色称呼（小帅 / 窦老师 / 校长 /
  // 同桌女同学），两套名字此前在五处用字符串精确相等硬比、全对
  // 不上（卡片全员误报「不在封面名单里」、「按封面人物选」点了
  // 没反应、分析后自动勾选失效、记录重提按名单配图配出 0 张、
  // 提交前警告误报缺人）。这里立全页唯一解析口径，三层依次试：
  // ①卡名精确相等（方案直接写代号时）；②别名表命中（scriptlib
  // projectCharacterAliases，与分镜页角色映射同一份：小帅=A、
  // 窦老师=B、校长爸爸=C、长发女孩=D、眼镜男孩=E，别名上下文按
  // App.buildMappingContext 同口径用项目人物卡组装）；③方案名
  // 是卡片备注或人物生图提示词的子串兜底（如「校长」在 C 的备
  // 注「学校校长」里、「同桌女同学」在 D 的备注里）——子串先在
  // 身份区里找（备注的「身份：」标签段、无标签时第一分段；生图
  // 提示词的本体段也在第一分段），避免 B 备注语气段里的「见校
  // 长后」这类提及别人的命中抢走本人；区内与全文都只试「命中
  // 处后面不紧跟『的』」的一遍，避免 A 备注里的「校长的儿子」
  // 把别人的职务抢走（与 scriptlib 职务回落的跳过口径一致）。
  // 三层全落空时还有修饰前缀兜底：方案名带台词昵称式前缀
  // （「痞校长」）时逐字剥前缀、以核心称呼重试三层免得名单里
  // 的人被误报不在名单。v5.08 起本解析之外再叠一层特征锚定
  // （见下方 resolvePlanCharForPlan）：旧第三遍「任意子串」已
  // 删除，删除原因写在 resolveExact 里。
  // ------------------------------------------------------------------
  type CoverCharCard = ProjectDetail["characters"][number];
  const coverScript = parseScript(project.scriptJson ?? null);
  const aliasCtx: LensMappingContext = {
    characters: project.characters.map((c) => ({
      name: c.name,
      role: c.role,
      note: c.note,
    })),
    scenes: project.sceneAssets.map((s) => ({
      name: s.name,
      description: s.description,
      asset: s.imageUrl ? "场景资产图（已生成）" : "场景资产图",
      promptZh: s.promptZh,
    })),
    props: (coverScript?.propAssets ?? []).map((p) => ({
      name: p.name,
      description: p.description,
      promptZh: p.promptZh,
    })),
    textSceneDescription: undefined,
  };
  const aliasPairs = coverScript
    ? projectCharacterAliases(coverScript, aliasCtx)
    : [];
  const aliasByCode = new Map(aliasPairs.map((p) => [p.code, p.alias]));
  const resolvePlanCharacter = (
    planName: string,
    pool: CoverCharCard[],
  ): CoverCharCard | undefined => {
    // 三层本体（对给定的一个名字）：代号精确 → 别名表 → 子串兜底。
    const resolveExact = (name: string): CoverCharCard | undefined => {
    const byCode = pool.find((c) => (c.name ?? "").trim() === name);
    if (byCode) return byCode;
    const pair = aliasPairs.find((p) => p.alias && p.alias.trim() === name);
    if (pair) {
      const byAlias = pool.find((c) => (c.name ?? "").trim() === pair.code);
      if (byAlias) return byAlias;
    }
    const containsIn = (hay: string, skipPossessive: boolean) => {
      let idx = hay.indexOf(name);
      while (idx >= 0) {
        if (!skipPossessive || hay[idx + name.length] !== "的") return true;
        idx = hay.indexOf(name, idx + 1);
      }
      return false;
    };
    // 身份区：备注的「身份：」标签段，没有标签段时取第一分段
    // （解剖落卡的备注恒是「身份；造型；语气」序、生图提示词的
    // 本体段也在第一分段里）。
    const identityZone = (text: string): string => {
      const t = text ?? "";
      const labelled = t.match(/身份[:：]\s*([^；;。\n]+)/);
      if (labelled) return labelled[1] ?? "";
      return t.split(/[；;。\n]/)[0] ?? "";
    };
    const zoneOf = (c: CoverCharCard) =>
      `${identityZone(c.note ?? "")}\n${identityZone(c.imagePromptZh ?? "")}`;
    const fullOf = (c: CoverCharCard) => `${c.note ?? ""}\n${c.imagePromptZh ?? ""}`;
    // v5.08：删掉旧的第三遍「任意子串」兜底。项目 39 实证（封面
    // 记录 28–30 的提交提示词）：方案名「小帅」在 A 的卡片文字
    // 里压根没出现、在 B / C / D 里只以所有格（「小帅的妈妈」
    // 「小帅的同班同学」）出现——前两遍带所有格跳过口径时全落
    // 空，旧第三遍却把第一个含该子串的卡 B 认作「小帅」，导致
    // 提交提示词里 B（小帅）重复三行、D 女孩整行丢失。任意子
    // 串兜底对所有格提及必然误伤，正式删除；「小帅」这类名单
    // 名改由下面的 v5.08 特征锚定（签名识别特征）定卡，别名表
    // 与前两遍子串口径不变。
    return (
      pool.find((c) => containsIn(zoneOf(c), true)) ??
      pool.find((c) => containsIn(fullOf(c), true))
    );
    };
    const name = (planName ?? "").trim();
    if (!name) return undefined;
    const direct = resolveExact(name);
    if (direct) return direct;
    // 修饰前缀兜底：方案名带台词昵称式前缀（「痞校长」这类——台
    // 词里喊出来的称呼被分析写进名单）时，全名在任何卡片文本里
    // 都不存在、三层全落空，人却明明在名单里、卡片会误报「不在
    // 名单」。逐字剥掉前缀、用剩下的核心称呼（≥2 字）重试三层
    // （「痞校长」→「校长」→ 身份区子串对上 C）。
    for (let len = name.length - 1; len >= 2; len--) {
      const hit = resolveExact(name.slice(name.length - len));
      if (hit) return hit;
    }
    return undefined;
  };
  // ------------------------------------------------------------------
  // v5.09 消元兜底（取代 v5.08 的特征锚定）：v5.08 靠方案签名里
  // 的「识别特征」（服装 / 标志物）把方案名锚回人物卡；v5.09 起
  // 分析只出站位、标题位置、标题风格，签名与特征字段整体下线，
  // 锚定没有输入可用。实测（项目 39 离线断言）：名字三层解析对
  // 「胖男孩 / 女孩 / 校长 / 小帅的妈妈」都能定卡，唯独主角「小
  // 帅」对不上 A——A 的卡片文字里根本没写这个名字，别名推导给
  // A 的是「短发男孩」，他在别人的卡里只以所有格（「小帅的妈
  // 妈」「小帅的同班同学」）出现、而所有格提及按 v5.08 结论必
  // 须跳过。补法是确定性消元：先把方案名单逐名走三层解析，唯
  // 一对上卡的先占位；最后只剩一位没对上的名字、且池里也只剩
  // 一张没被占的卡时，才把两者配对。多于一位没对上、或剩卡不
  // 止一张时不猜（宁可留空让用户手选），绝不硬配错人。
  // ------------------------------------------------------------------
  /** 方案名 → 人物卡的完整解析口径：名字三层解析优先，最后走消元兜底。 */
  const resolvePlanCharForPlan = (
    planLike: CoverPlan | null,
    name: string,
    pool: CoverCharCard[],
  ): CoverCharCard | undefined => {
    const direct = resolvePlanCharacter(name, pool);
    if (direct) return direct;
    if (!planLike) return undefined;
    const target = (name ?? "").trim();
    const names = planLike.mainCharacters
      .map((n) => n.trim())
      .filter(Boolean);
    if (!target || !names.includes(target)) return undefined;
    const claimed = new Set<number>();
    const unresolved: string[] = [];
    for (const n of names) {
      const hit = resolvePlanCharacter(n, pool);
      if (hit) {
        claimed.add(hit.id);
      } else {
        unresolved.push(n);
      }
    }
    if (unresolved.length !== 1 || unresolved[0] !== target) {
      return undefined;
    }
    const free = pool.filter((c) => !claimed.has(c.id));
    return free.length === 1 ? free[0] : undefined;
  };
  /** 某张卡在方案里的原名（方案顺序里第一个解析到它的名字）；不在方案里返回空串。 */
  const planNameForCard = (p: CoverPlan | null, cardId: number): string => {
    if (!p) return "";
    for (const n of p.mainCharacters) {
      const hit = resolvePlanCharForPlan(p, n, project.characters);
      if (hit && hit.id === cardId) return n;
    }
    return "";
  };
  /** 参考人物的显示名：在方案里用方案原名，不在方案里用别名，都没有用代号。 */
  const refDisplayName = (c: CoverCharCard, p: CoverPlan | null): string =>
    planNameForCard(p, c.id) || aliasByCode.get(c.name) || c.name || "未命名人物";
  /** 当前方案解析到的人物卡 id 集合（卡片「在名单里」判定的唯一口径）。 */
  const planCardIds = new Set<number>();
  if (plan) {
    for (const n of plan.mainCharacters) {
      const hit = resolvePlanCharForPlan(plan, n, project.characters);
      if (hit) planCardIds.add(hit.id);
    }
  }
  /** 已选参考里不在原方案名单的人物（生效名单的增补部分，勾选顺序）。 */
  const extraRefNames = refCharIds
    .map((id) => charsWithImage.find((c) => c.id === id))
    .filter((c): c is CoverCharCard => !!c)
    .filter((c) => !planCardIds.has(c.id))
    .map((c) => aliasByCode.get(c.name) || c.name);
  /** 生效封面人物名单：方案原名在前（方案顺序）+ 另选参考显示名在后（勾选顺序）。 */
  const effectivePlanNames = [
    ...(plan?.mainCharacters ?? []),
    ...extraRefNames,
  ];

  // ------------------------------------------------------------------
  // v5.05 封面提示词加代号、位置与参考图绑定（在 v5.04 人物行同步
  // 之上）：旧拼词的人物行只有方案真名（小帅 / 窦老师 / 校长），
  // 没有人物卡的代号（A / B / C），也没有逐人位置——分析的
  // characterPoses 里明明写了「左侧小帅……他身后校长……右侧窦
  // 老师……」，拼词时丢掉了；更没有「参考图 #N = 谁」的绑定，
  // 模型不知道哪张参考图对应哪个位置的人。本版把 v5.04 的
  // syncCoverPromptNames 升级为 syncCoverPromptChars：分析返回 /
  // 第二步英文稿 / 按方案重拼三处在提示词落页面前先过它，提交
  // 时再按实际取图顺序过它——同一套逻辑，展示与提交同一份。
  // 每位人物在人物行里写成「A（小帅），左侧」（代号 + 称呼 +
  // 位置），人物行后紧跟一行参考图绑定（只列真带上图的人物，
  // 编号 = 卡片上的参考顺序）。位置只从已有数据来、不编造，
  // 优先级：①当前文本人物行里已写好的位置（重同步时保住，不
  // 让重拼把位置冲掉）；②方案 characterPoses 里该人物所在分句
  // 的方位词（左侧 / 右侧 / 中央 / 前景 / 上格 / 下格左 / 下格
  // 右 / 身后——身后带锚点人，如「小帅身后」）；③版式兜底
  // （VS 对抗按 sideA 在左 / sideB 在右、多格拼贴按格序、单
  // 主角中央前景、其余中央），绝不留任何一位没有位置。人物
  // 的外貌 / 动作 / 特征分段原文一字不动，只换段首的名字头；
  // 没取到任何参考图时只摘绑定行（人物行不动），再走既有自
  // 动降级摘约束句。
  // ------------------------------------------------------------------
  type CoverCharPos = { zh: string; en: string };
  // v5.09：posFromPoses 与方位词表已删除——位置不再从长句里
  // 解析，分析直接给每人一条站位（plan.characterPositions），
  // 同步时按名取用（见 syncCoverPromptChars 内 planPosZh/En）。
  /** 版式兜底位置（poses 里取不到时用，只按已有方案字段与所
   * 选风格定，不编造具体画面）。 */
  const posFallback = (
    p: CoverPlan | null,
    forStyleId: string,
    name: string,
    alias: string,
    index: number,
    count: number,
  ): CoverCharPos => {
    const CENTER: CoverCharPos = { zh: "中央", en: "center" };
    if (!p) return CENTER;
    if (
      forStyleId === "multi_panel_story" ||
      forStyleId === "collage_memory"
    ) {
      const seq: CoverCharPos[] = [
        { zh: "上格", en: "top panel" },
        { zh: "下格左", en: "bottom-left panel" },
        { zh: "下格右", en: "bottom-right panel" },
        { zh: "下格", en: "bottom panel" },
      ];
      return seq[Math.min(index, seq.length - 1)] ?? CENTER;
    }
    if (p.layoutType === "vs" || forStyleId === "camps_vs") {
      const hitSide = (side: string) =>
        !!side &&
        (side.includes(name) ||
          (!!alias && side.includes(alias)) ||
          (side.length >= 2 && !!name && name.includes(side)));
      if (hitSide(p.sideA)) return { zh: "左侧", en: "left side" };
      if (hitSide(p.sideB)) return { zh: "右侧", en: "right side" };
      if (count <= 2) {
        return index === 0
          ? { zh: "左侧", en: "left side" }
          : { zh: "右侧", en: "right side" };
      }
      if (index === 0) return { zh: "左侧", en: "left side" };
      if (index === count - 1) {
        return { zh: "右侧", en: "right side" };
      }
      return CENTER;
    }
    if (forStyleId === "solo_half_title" || forStyleId === "face_meme") {
      return { zh: "中央前景", en: "center foreground" };
    }
    if (forStyleId === "spectacle_effect_title") {
      return { zh: "前景", en: "foreground" };
    }
    return CENTER;
  };

  /** 从当前文本的人物行里收回已写好的位置（重同步 / 重拼后提
   * 交时保住位置，不被浓缩后的 characterPoses 冲掉）：按显示
   * 名与解析到的卡 id 各存一份，只收本语言的那一半。 */
  const harvestPositions = (
    text: string,
    lang: "zh" | "en",
  ): Map<string, CoverCharPos> => {
    const out = new Map<string, CoverCharPos>();
    const put = (name: string, pos: Partial<CoverCharPos>) => {
      if (!name) return;
      const prev = out.get(name) ?? { zh: "", en: "" };
      out.set(name, {
        zh: pos.zh || prev.zh,
        en: pos.en || prev.en,
      });
      const card = resolvePlanCharacter(name, project.characters);
      if (card) {
        const key = `#${card.id}`;
        const prevC = out.get(key) ?? { zh: "", en: "" };
        out.set(key, {
          zh: pos.zh || prevC.zh,
          en: pos.en || prevC.en,
        });
      }
    };
    for (const line of text.split("\n")) {
      if (lang === "zh") {
        const full = line.match(/^上封面人物：(.+?)（外貌与服装以随附/);
        const short = line.match(
          /^人物（外貌服装以随附[^）]*）：(.+?)。?$/,
        );
        const listText = full ? (full[1] ?? "") : short ? (short[1] ?? "") : "";
        if (!listText) continue;
        for (const seg of listText.split(/[；;]/)) {
          const head = (seg.split("：")[0] ?? seg).trim();
          const m = head.match(/^([A-Za-z]{1,2})（(.+?)）[，,](.+)$/);
          if (m) put((m[2] ?? "").trim(), { zh: (m[3] ?? "").trim() });
        }
      } else {
        const full = line.match(
          /^Cover characters: (.+?) \(faces and outfits/,
        );
        const short = line.match(
          /^Characters \(match the attached[^)]*\): (.+?)\.?$/,
        );
        const listText = full ? (full[1] ?? "") : short ? (short[1] ?? "") : "";
        if (!listText) continue;
        for (const seg of listText.split(/;\s*/)) {
          const head = (seg.split(":")[0] ?? seg).trim();
          const m = head.match(/^([A-Za-z]{1,2}) \((.+?)\), (.+)$/);
          if (m) put((m[2] ?? "").trim(), { en: (m[3] ?? "").trim() });
        }
      }
    }
    return out;
  };

  // ------------------------------------------------------------------
  // v5.05 人物行同步（取代 v5.04 的 syncCoverPromptNames）：只改
  // 提示词的人物行与紧跟其后的参考图绑定行，不重拼整份提示词、
  // 不动用户手改的其他内容。人物条目按实际提交顺序——先列已
  // 取到参考图的人物（条目 = 代号（称呼），位置；绑定编号按此
  // 序），再补未带图的方案成员名（方案顺序、无绑定编号）。完
  // 整版行式换「上封面人物：…」/「Cover characters: …」里的条
  // 目表；浓缩版行式按人物分段重排——分段正文（情绪 / 动作 /
  // 特征）一字不动、只把段首的名字头换成三件套，名单外已选人
  // 物以三件套补一段。行被用户手删了就不插入。没取到任何参考
  // 图时只摘绑定行、人物行不动（约束句走既有自动降级）。
  // ------------------------------------------------------------------
  const syncCoverPromptChars = (
    text: string,
    lang: "zh" | "en",
    usePlan: CoverPlan | null,
    fetchedIds: number[],
    forStyleId: string,
  ): string => {
    if (!text) return text;
    const isBindingLine = (line: string) =>
      lang === "zh"
        ? /^参考图 #\d+ = /.test(line.trim())
        : /^Reference image #\d+ = /.test(line.trim());
    if (fetchedIds.length === 0) {
      return text
        .split("\n")
        .filter((line) => !isBindingLine(line))
        .join("\n");
    }
    type CharEntry = {
      display: string;
      code: string;
      cardId: number | null;
      refNo: number;
      pos: CoverCharPos;
    };
    // v5.08：参考图编号（#N）按取图顺序排——同一张卡重复进来会
    // 占两个编号、人物行与绑定行跟着重复（记录 28–30 实证：
    // 「小帅」「小帅的妈妈」都误解析到 B，B 被当两个人提交）。
    // 进来先按卡 id 去重，编号才一一对应。
    const uniqueFetchedIds = [...new Set(fetchedIds)];
    const fetchedSet = new Set(uniqueFetchedIds);
    const planNames = usePlan?.mainCharacters ?? [];
    const raw: {
      display: string;
      code: string;
      cardId: number | null;
      refNo: number;
    }[] = [];
    uniqueFetchedIds.forEach((id, i) => {
      const c = project.characters.find((x) => x.id === id);
      if (c) {
        raw.push({
          display: refDisplayName(c, usePlan),
          code: (c.name ?? "").trim(),
          cardId: id,
          refNo: i + 1,
        });
      }
    });
    for (const pn of planNames) {
      const card = resolvePlanCharForPlan(usePlan, pn, project.characters);
      if (card && fetchedSet.has(card.id)) continue;
      // v5.08：同一张卡被两个方案名解析到时只留一条（人物行不
      // 许同卡出现两次）。
      if (card && raw.some((e) => e.cardId === card.id)) continue;
      if (raw.some((e) => e.display === pn)) continue;
      raw.push({
        display: pn,
        code: card ? (card.name ?? "").trim() : "",
        cardId: card ? card.id : null,
        refNo: 0,
      });
    }
    if (raw.length === 0) return text;
    const harvested = harvestPositions(text, lang);
    const entries: CharEntry[] = raw.map((r, i) => {
      const alias =
        (r.cardId != null
          ? aliasByCode.get(
              project.characters.find((c) => c.id === r.cardId)?.name ??
                "",
            )
          : undefined) ?? "";
      const h =
        (r.cardId != null ? harvested.get(`#${r.cardId}`) : undefined) ??
        harvested.get(r.display);
      // v5.09：位置从方案站位（characterPositions）按名取——分
      // 析只出站位、每人一条位置短句，不再从长句里解析方位词。
      // 英文优先英文站位（characterPositionsEn），缺译回退中文
      // 位置；显示名对不上时再按别名找一次。
      const planPosZh =
        usePlan?.characterPositions.find((cp) => cp.name === r.display)
          ?.position ??
        (alias
          ? usePlan?.characterPositions.find((cp) => cp.name === alias)
              ?.position
          : undefined);
      const planPosEn =
        usePlan?.characterPositionsEn?.find((cp) => cp.name === r.display)
          ?.position ??
        (alias
          ? usePlan?.characterPositionsEn?.find((cp) => cp.name === alias)
              ?.position
          : undefined) ??
        planPosZh;
      const fromPlan =
        planPosZh || planPosEn
          ? { zh: planPosZh ?? "", en: planPosEn ?? planPosZh ?? "" }
          : null;
      const fb = posFallback(
        usePlan,
        forStyleId,
        r.display,
        alias,
        i,
        raw.length,
      );
      return {
        ...r,
        pos: {
          zh: h?.zh || fromPlan?.zh || fb.zh,
          en: h?.en || fromPlan?.en || fb.en,
        },
      };
    });
    const labelZh = (e: CharEntry) =>
      e.code && e.display && e.display !== e.code
        ? `${e.code}（${e.display}）`
        : e.display || e.code || "未命名人物";
    const labelEn = (e: CharEntry) =>
      e.code && e.display && e.display !== e.code
        ? `${e.code} (${e.display})`
        : e.display || e.code || "unnamed character";
    const entryZh = (e: CharEntry) => `${labelZh(e)}，${e.pos.zh}`;
    const entryEn = (e: CharEntry) => `${labelEn(e)}, ${e.pos.en}`;
    const bound = entries.filter((e) => e.refNo > 0);
    const bindingText =
      bound.length === 0
        ? ""
        : lang === "zh"
          ? `${bound.map((e) => `参考图 #${e.refNo} = ${entryZh(e)}`).join("；")}。`
          : `${bound.map((e) => `Reference image #${e.refNo} = ${entryEn(e)}`).join("; ")}.`;
    // 浓缩版分段重排：分段按其段首人名解析到的人物对位条目，
    // 命中分段只换段首名字头、正文原样；缺分段的人物以三件套
    // 补一段；未对上任何条目的分段按原序留在最后、原文不动。
    type Seg = { name: string; body: string | null; rawName: string };
    const reorderSegments = (segments: Seg[]): string[] => {
      const used = segments.map(() => false);
      const segEntry = segments.map((s) => {
        // v5.08：分段对位也走特征锚定解析——分段名是方案原名
        // （如「小帅」），名字三层解析对不上 A 时分段会错位甚至
        // 把别人的段体安到他头上。
        const card = resolvePlanCharForPlan(usePlan, s.name, project.characters);
        let idx = card
          ? entries.findIndex((e) => e.cardId === card.id)
          : -1;
        if (idx < 0) idx = entries.findIndex((e) => e.display === s.name);
        return idx;
      });
      const out: string[] = [];
      entries.forEach((e, ei) => {
        const si = segEntry.findIndex((x, i) => x === ei && !used[i]);
        if (si >= 0) {
          used[si] = true;
          const seg = segments[si];
          const body = seg?.body ?? null;
          out.push(
            body
              ? lang === "zh"
                ? `${entryZh(e)}：${body}`
                : `${entryEn(e)}: ${body}`
              : lang === "zh"
                ? entryZh(e)
                : entryEn(e),
          );
        } else {
          out.push(lang === "zh" ? entryZh(e) : entryEn(e));
        }
      });
      segments.forEach((s, i) => {
        if (used[i]) return;
        out.push(
          s.body
            ? lang === "zh"
              ? `${s.rawName}：${s.body}`
              : `${s.rawName}: ${s.body}`
            : s.rawName,
        );
      });
      return out;
    };
    const nameFromZhHeader = (header: string): string => {
      const m = header.match(/^([A-Za-z]{1,2})（(.+?)）[，,]/);
      return m ? (m[2] ?? header) : header;
    };
    const isCharLine = (line: string): boolean =>
      lang === "zh"
        ? (line.startsWith("上封面人物：") &&
            line.includes("（外貌与服装以随附的人物资产图为准")) ||
          /^人物（外貌服装以随附人物资产图为准[^）]*）：/.test(line)
        : (line.startsWith("Cover characters: ") &&
            line.includes("(faces and outfits must match")) ||
          /^Characters \(match the attached asset images exactly[^)]*\): /.test(
            line,
          );
    const rewriteLine = (line: string): string => {
      if (lang === "zh") {
        if (
          line.startsWith("上封面人物：") &&
          line.includes("（外貌与服装以随附的人物资产图为准")
        ) {
          const idx = line.indexOf("（外貌与服装以随附的人物资产图为准");
          return `上封面人物：${entries.map(entryZh).join("；")}${line.slice(idx)}`;
        }
        const cm = line.match(
          /^(人物（外貌服装以随附人物资产图为准[^）]*）：)([\s\S]*)$/,
        );
        if (cm) {
          let body = cm[2] ?? "";
          const tail = body.endsWith("。") ? "。" : "";
          if (tail) body = body.slice(0, -1);
          const segments: Seg[] = body
            .split("；")
            .map((s) => s.trim())
            .filter(Boolean)
            .map((s) => {
              const ci = s.indexOf("：");
              if (ci < 0) {
                return { name: nameFromZhHeader(s), body: null, rawName: s };
              }
              const header = s.slice(0, ci).trim();
              return {
                name: nameFromZhHeader(header),
                body: s.slice(ci + 1),
                rawName: header,
              };
            });
          if (segments.length > 0) {
            return `${cm[1] ?? ""}${reorderSegments(segments).join("；")}${tail}`;
          }
        }
        return line;
      }
      if (
        line.startsWith("Cover characters: ") &&
        line.includes("(faces and outfits must match")
      ) {
        const idx = line.indexOf("(faces and outfits must match");
        return `Cover characters: ${entries.map(entryEn).join("; ")} ${line.slice(idx)}`;
      }
      const cm = line.match(
        /^(Characters \(match the attached asset images exactly[^)]*\): )([\s\S]*)$/,
      );
      if (cm) {
        let body = cm[2] ?? "";
        const tail = body.endsWith(".") ? "." : "";
        if (tail) body = body.slice(0, -1);
        // 英文浓缩分段的人名边界：分段之间与段内小项都用「; 」
        // 连接，只能靠段首形态作切分锚点——已同步的三件套段首
        // （A (名), 位置: ）或已知人名 +「: 」。
        const known = new Set<string>();
        for (const e of entries) known.add(e.display);
        for (const pn of planNames) known.add(pn);
        for (const c of project.characters) {
          known.add(c.name);
          const a = aliasByCode.get(c.name);
          if (a) known.add(a);
        }
        const alts = [...known]
          .filter(Boolean)
          .sort((a, b) => b.length - a.length)
          .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
        const splitRe = new RegExp(
          `;\\s*(?=(?:[A-Za-z]{1,2} \\([^)]*\\), [^;:]+:\\s)${alts.length > 0 ? `|(?:${alts.join("|")}):\\s` : ""})`,
          "g",
        );
        const segments: Seg[] = body
          .split(splitRe)
          .map((s) => s.trim())
          .filter(Boolean)
          .map((s) => {
            const em = s.match(
              /^([A-Za-z]{1,2}) \((.+?)\), ([^:]+):\s?([\s\S]*)$/,
            );
            if (em) {
              return {
                name: (em[2] ?? "").trim(),
                body: em[4] ?? "",
                rawName: `${em[1] ?? ""} (${em[2] ?? ""}), ${em[3] ?? ""}`,
              };
            }
            const bm = s.match(/^([^:]+):\s([\s\S]*)$/);
            if (bm) {
              return {
                name: (bm[1] ?? "").trim(),
                body: bm[2] ?? "",
                rawName: (bm[1] ?? "").trim(),
              };
            }
            return { name: s, body: null, rawName: s };
          });
        if (segments.length > 0) {
          return `${cm[1] ?? ""}${reorderSegments(segments).join("; ")}${tail}`;
        }
      }
      return line;
    };
    const outLines: string[] = [];
    for (const line of text.split("\n")) {
      if (isBindingLine(line)) continue;
      outLines.push(rewriteLine(line));
      if (bindingText && isCharLine(line)) outLines.push(bindingText);
    }
    return outLines.join("\n");
  };

  // v4.28 提示词下方「上传参考图片」：用户为这张封面直接上传的参
  // 考图（任意图片，不限于人物资产图——也可以是想模仿的封面、场
  // 景或道具图）。只存组件内存（data URL + 文件名），不落库、不
  // 进备份，刷新即清空。提交时与人物参考图走同一条通道：勾了图
  // 床同意才取图、降采样后由特权层上传换链接；上传图优先提交，
  // 与人物参考图合计最多 MAX_COVER_REF_IMAGES 张（与服务端参考图
  // 上限同口径）。
  const [uploadedRefs, setUploadedRefs] = useState<
    { id: number; name: string; dataUrl: string }[]
  >([]);
  const uploadedRefSeq = useRef(0);
  const [uploadRefMsg, setUploadRefMsg] = useState<string | null>(null);
  const uploadRefInputRef = useRef<HTMLInputElement | null>(null);

  const handleUploadRefFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const room = MAX_COVER_REF_IMAGES - uploadedRefs.length;
    if (room <= 0) {
      setUploadRefMsg(`上传参考图已满 ${MAX_COVER_REF_IMAGES} 张：先删掉一张再传。`);
      return;
    }
    const all = Array.from(files);
    const picked = all.slice(0, room);
    const notes: string[] = [];
    if (all.length > picked.length) {
      notes.push(`一次最多留 ${MAX_COVER_REF_IMAGES} 张，多选的 ${all.length - picked.length} 张没收。`);
    }
    let badType = 0;
    for (const f of picked) {
      if (!f.type.startsWith("image/")) {
        badType++;
        continue;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result ?? "");
        if (!dataUrl.startsWith("data:image/")) return;
        uploadedRefSeq.current += 1;
        const entry = {
          id: uploadedRefSeq.current,
          name: f.name || "上传参考图",
          dataUrl,
        };
        setUploadedRefs((prev) =>
          prev.length >= MAX_COVER_REF_IMAGES ? prev : [...prev, entry],
        );
      };
      reader.readAsDataURL(f);
    }
    if (badType > 0) notes.push(`有 ${badType} 个文件不是图片，已跳过。`);
    setUploadRefMsg(notes.length ? notes.join(" ") : null);
  };

  const modelsQuery = useQuery({
    queryKey: ["geeknowImageModels"],
    // 模型列表经服务端问 Geeknow（外部服务），超时放宽到 60 秒。
    queryFn: () => withReadTimeout(() => api.geeknowImageModels({}), 60_000),
    retry: retryReadQuery,
    staleTime: 60_000,
  });
  const modelOptions = Array.from(
    new Set([
      ...(modelsQuery.data?.models ?? []),
      ...PRESET_MODELS,
      model,
    ]),
  ).filter(Boolean);

  const recordsQuery = useQuery({
    queryKey: ["coverRecords", project.id],
    queryFn: () => withReadTimeout(() => api.listCoverRecords({ projectId: project.id })),
    retry: retryReadQuery,
  });
  const records = recordsQuery.data?.records ?? [];
  const invalidateRecords = () =>
    queryClient.invalidateQueries({ queryKey: ["coverRecords", project.id] });

  // ------------------------------------------------------------------
  // v3.84 只读鉴权预检：用当前实际将生效的配置探一次——填了 Key
  // 测这个 Key、没填测已连接凭证，地址用当前填的地址。探针是不
  // 存在的模型名，永不创建任务、永不计费。返回 null / ok=false
  // 表示预检本身没查成（结论不成立，不得据此拦提交）。
  // ------------------------------------------------------------------
  const runProbe = async (): Promise<ProbeResult | null> => {
    const cfg = submitCfgRef.current;
    try {
      return await api.probeGeeknowAuth({
        apiKey: cfg.apiKey.trim() ? cfg.apiKey.trim() : undefined,
        apiBase: cfg.apiBase.trim() ? cfg.apiBase.trim() : undefined,
      });
    } catch {
      return null;
    }
  };
  const probeFailText = (p: ProbeResult): string =>
    p.usedCustomKey
      ? `你填的 Key 被 Geeknow 拒绝了（${p.error ?? "鉴权失败"}）：已连接的 Geeknow 凭证是好的，卡住的是这个自填 Key（封面页单次输入、或生图接口总设置里的那份）——多半是填错了、已过期，或不是这个 API 地址的 Key。把填 Key 的地方清空改用已连接凭证、或换一个正确的 Key 再生成。这次没有提交生图；被拒的请求没到计费环节，Geeknow 控制台的使用日志里也不会有这一条。`
      : `已连接的 Geeknow 凭证被 Geeknow 拒绝了（${p.error ?? "鉴权失败"}）：请重新连接 Geeknow 后再生成。这次没有提交生图；被拒的请求不会出现在 Geeknow 控制台的使用日志里。`;
  const runManualProbe = async () => {
    if (probing) return;
    setProbing(true);
    setProbeMsg(null);
    try {
      const p = await runProbe();
      if (!p || !p.ok) {
        setProbeBad(true);
        setProbeMsg(
          `预检没查成（${p?.error ?? "网络或服务异常"}）：这说明不了 Key 有没有问题，可以再点一次检测；点「生成封面」时还会再预检一次。`,
        );
        return;
      }
      if (p.authOk) {
        setProbeBad(false);
        setProbeMsg(
          p.usedCustomKey
            ? "预检通过：你填的 Key 能通过 Geeknow 鉴权，可以用它生成。"
            : "预检通过：已连接的 Geeknow 凭证在生图提交口可用（模型列表是另一条只读路，这次探的是提交那条路的鉴权）。",
        );
      } else {
        setProbeBad(true);
        setProbeMsg(probeFailText(p));
      }
    } finally {
      setProbing(false);
    }
  };

  const [submitting, setSubmitting] = useState(false);
  // v5.06 简化：方案细节与中英文提示词默认收起（要改点开即可，
  // 功能都在）；一键三比例去掉二次确认改一次点击（按钮文案本
  // 身写明 3 次计费），batchConfirm 两步确认随之删除。
  const [planDetailsOpen, setPlanDetailsOpen] = useState(false);
  const [promptsOpen, setPromptsOpen] = useState(false);
  // ------------------------------------------------------------------
  // v5.14 聊天分析提示词草稿：助手在聊天框里分析出的中英文封面
  // 提示词经 saveCoverPromptDraft 按（项目 + 风格）存进服务端，
  // 本页打开 / 切风格时读回（getCoverPromptDraft）自动填入第三
  // 步的中英文提示词框：中文进中文框、英文进英文框，四份存档
  // 稿同步成同一份（主稿 / 备查稿切换不会把草稿换走），并自动
  // 展开提示词、亮明来源是聊天分析。用户在当前风格下亲手改过
  // 框后不再覆盖（改完以框内为准）；草稿只是预填，绝不自动提
  // 交、绝不自动生图——生成永远由用户亲手点。
  // ------------------------------------------------------------------
  const [draftSourceNote, setDraftSourceNote] = useState<string | null>(null);
  // 用户在哪个风格下亲手改过提示词框（两框 onChange 时记）：
  // 该风格下草稿不再覆盖框内文字。缓存恢复 / 分析落地不经
  // onChange、不算亲手改，所以打开页面时草稿照常填入（盖过缓
  // 存恢复的旧稿——聊天分析是用户最新的口径）。
  const promptTouchedStyleRef = useRef<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let res: ApiResponse<typeof api, "getCoverPromptDraft"> | null = null;
      try {
        res = await api.getCoverPromptDraft({
          projectId: project.id,
          styleId,
        });
      } catch {
        res = null;
      }
      if (cancelled || !res) return;
      if (!res.found || (!res.promptZh.trim() && !res.promptEn.trim())) {
        // 当前风格没有草稿：来源标注跟着清掉，不挂旧风格的。
        setDraftSourceNote(null);
        return;
      }
      if (promptTouchedStyleRef.current === styleId) return;
      setPromptZh(res.promptZh);
      setPromptEn(res.promptEn);
      setShortZh(res.promptZh);
      setShortEn(res.promptEn);
      setDetailZh(res.promptZh);
      setDetailEn(res.promptEn);
      setPromptView("short");
      // 草稿英文是用户（经聊天）给定的成稿，后续机器重拼不许
      // 覆盖它——与亲手改英文框同一口径。
      if (res.promptEn.trim()) enHandEditedRef.current = true;
      setPromptsOpen(true);
      const when = res.updatedAtMs
        ? new Date(res.updatedAtMs).toLocaleString("zh-CN", {
            hour12: false,
          })
        : "";
      setDraftSourceNote(
        `已自动填入聊天分析的提示词（来源：聊天框分析${when ? `，${when} 存入` : ""}）：中文在中文框、英文在英文框，可直接改，改完以框里为准；生成仍需你亲手点下面的生成按钮。`,
      );
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, styleId]);
  const [batchResults, setBatchResults] = useState<{ ratio: string; ok: boolean; msg: string }[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // submitCover 内部报错的同步镜像：页面级报错文案的统一出口
  // （reportSubmitError 同时写状态与这条镜像）。v5.06 起一键三
  // 比例的逐比例失败原因改读 submitCover 的返回值 {ok, error}
  // 各记各的，不再靠这条镜像（并行时镜像会被并发覆盖）。
  const submitErrorRef = useRef<string | null>(null);
  const reportSubmitError = (msg: string) => {
    submitErrorRef.current = msg;
    setSubmitError(msg);
  };
  const [recordMsg, setRecordMsg] = useState<Record<number, string>>({});
  const [pollCounts, setPollCounts] = useState<Record<number, number>>({});
  const [confirmResubmitId, setConfirmResubmitId] = useState<number | null>(
    null,
  );
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  // v3.91 一键导出三比例：三比例最新已出图记录的无损原图并行取回、
  // 打成一个 ZIP 只下载一次，缺哪个比例在 exportAllMsg 里点名。
  const [exportingAll, setExportingAll] = useState(false);
  const [exportAllMsg, setExportAllMsg] = useState<string | null>(null);
  // v3.89 记录区布局缩小：出图在记录里只显示小图（点开才看大图），
  // lightboxRec 是当前放大查看的那条记录（null = 没打开）。
  const [lightboxRec, setLightboxRec] = useState<CoverRecord | null>(null);
  // v5.57：大图弹层先加载原图全质；个别老记录的暂存原图已被清理、
  // 原图地址打不开时，回落到这条记录的预览图显示（不留破图），
  // 并在图下写明原因。记录 id 记在这里，换一条记录自动恢复先试原图。
  const [lightboxOrigFailedId, setLightboxOrigFailedId] = useState<
    number | null
  >(null);
  // v4.23 风格参照图大图预览：当前放大查看的风格 id（null = 没打开）。
  const [refLightboxStyleId, setRefLightboxStyleId] = useState<string | null>(null);
  const setRecMsg = (id: number, msg: string) =>
    setRecordMsg((prev) => ({ ...prev, [id]: msg }));

  // ------------------------------------------------------------------
  // 轮询：与生图窗同一口径——每条记录只查自己的任务号，出图 / 失败 /
  // 失效回写自己；打开页面只续查未完成任务，绝不自动提交新任务。
  // ------------------------------------------------------------------
  const pollingRef = useRef(new Map<number, number>());
  const pollGenRef = useRef(0);
  const sleep = (ms: number) =>
    new Promise<void>((resolve) => window.setTimeout(resolve, ms));

  const pollRecord = async (rec: CoverRecord) => {
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
          const cfg = submitCfgRef.current;
          res = await api.pollGeeknowImageTask({
            taskId: tid,
            downloadTimeoutSec: 60,
            apiKey: cfg.apiKey.trim() ? cfg.apiKey.trim() : undefined,
            apiBase: cfg.apiBase.trim() ? cfg.apiBase.trim() : undefined,
          });
        } catch {
          res = null;
        }
        if (!alive()) return;
        if (res && res.status === "done" && res.stagedKey) {
          await api.updateCoverRecord({
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
            await api.updateCoverRecord({ id: rec.id, status: "generating" });
            await invalidateRecords();
          }
        } else if (res && res.status === "notfound") {
          await api.updateCoverRecord({
            id: rec.id,
            status: "expired",
            error: `任务号已失效：${res.error ?? "这个任务查不到了"}。要重新出图只能点这条记录的「重新生成」，那会是一个新任务、重新计费。`,
          });
          await invalidateRecords();
          return;
        } else if (res && res.status === "auth") {
          await api.updateCoverRecord({
            id: rec.id,
            status: "failed",
            error: submitCfgRef.current.apiKey.trim()
              ? `续查被 Geeknow 拒绝：${res.error ?? "鉴权失败"}。续查用的是你在设置里填的 Key——它可能不正确或已失效；清空 Key 输入框（改用已连接凭证）或换一个正确的 Key 后，点这条记录的「续查」接着查同一个任务，不会重新提交。`
              : `Geeknow 未连接：${res.error ?? "鉴权失败"}。这是 Key / 连接问题，不是超时；重新连接 Geeknow 后点这条记录的「续查」接着查同一个任务。`,
          });
          await invalidateRecords();
          return;
        } else if (res && res.status === "failed") {
          await api.updateCoverRecord({
            id: rec.id,
            status: "failed",
            error: res.error ?? "服务商判定这张封面生成失败",
          });
          await invalidateRecords();
          return;
        } else {
          errors += 1;
          if (errors >= MAX_POLL_ERRORS) {
            setRecMsg(
              rec.id,
              "查询任务状态连续失败（可能是网关超时），本轮先停下；任务号还在记录里，点「续查」接着查同一个任务，不会重新提交、不会重复计费。",
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

  // ------------------------------------------------------------------
  // 分析剧本（只推理改文字，不提交生图）
  // ------------------------------------------------------------------
  // v5.08：导出本次分析要带的人物资产图（有图人物一人一张、
  // 最多 5 张，本机降采样副本，与提交参考图同一套
  // urlToSubmitReference，只发 JPEG/PNG，库里原图不动）。某张
  // 取不到 / 压不动就跳过那个人，服务端按文字描述兜底。
  const deriveCharacterImages = async (): Promise<
    { characterId: number; dataBase64: string; mimeType: string }[]
  > => {
    const characterImages: {
      characterId: number;
      dataBase64: string;
      mimeType: string;
    }[] = [];
    for (const c of charsWithImage.slice(0, 5)) {
      try {
        const ref = c.imageUrl
          ? await urlToSubmitReference(c.imageUrl)
          : null;
        if (
          ref &&
          (ref.mimeType === "image/jpeg" || ref.mimeType === "image/png")
        ) {
          characterImages.push({
            characterId: c.id,
            dataBase64: ref.dataBase64,
            mimeType: ref.mimeType,
          });
        }
      } catch {
        // 单张图取不到不拦分析：该人物按文字描述走。
      }
    }
    return characterImages;
  };

  // v5.08：把一份完整的分析结果（任务 done 时服务端存下的那份，
  // 形状与 analyzeScriptForCover 的返回一致）整套落回页面：方
  // 案、四份提示词稿（落页面前过 syncCoverPromptChars 同步人
  // 物行代号 + 位置 + 参考图绑定，人物解析走名字三层 + 消元兜底）、
  // 覆盖度、自动勾选的参考人物、本地缓存——与 v5.06 第一步落
  // 地同一套状态，只是结果改从任务里取。英文浓缩稿在任务内已
  // 经补齐（enPending 恒为 false），不再有页面侧后台接力。
  const applyAnalysisResult = (
    res: CoverAnalysisResult,
    imageCount: number,
    styleIdUsed: string,
  ) => {
    if (!res.plan) {
      setAnalyseError(res.error ?? "分析失败，请重试");
      setAnalyzing(false);
      return;
    }
    const mergedPlan: CoverPlan = { ...EMPTY_PLAN, ...res.plan };
    setPlan(mergedPlan);
    // v3.90：主稿（浓缩或回退完整版）与完整版备查分开存，默认看
    // 主稿；英文框若是用户亲手填的，保留手填、不拿机器稿覆盖。
    const keepHandEn = enHandEditedRef.current && !!promptEn.trim();
    // v5.05 / v5.08：先算出本次分析自动勾选的参考人物（方案名
    // 单顺序、按卡去重），四份提示词落页面前先过
    // syncCoverPromptChars 按这份选择同步人物行与绑定行——页
    // 面上展示的就是提交时将生成的那一份。
    const matchedRefIds: number[] = [];
    for (const name of res.plan.mainCharacters ?? []) {
      const card = resolvePlanCharForPlan(mergedPlan, name, charsWithImage);
      if (card && !matchedRefIds.includes(card.id)) {
        matchedRefIds.push(card.id);
      }
      if (matchedRefIds.length >= MAX_COVER_REF_IMAGES) break;
    }
    const enrZh = syncCoverPromptChars(
      res.promptZh ?? "",
      "zh",
      mergedPlan,
      matchedRefIds,
      styleIdUsed,
    );
    const enrEn = syncCoverPromptChars(
      res.promptEn ?? "",
      "en",
      mergedPlan,
      matchedRefIds,
      styleIdUsed,
    );
    const enrDetailZh = syncCoverPromptChars(
      res.detailPromptZh ?? "",
      "zh",
      mergedPlan,
      matchedRefIds,
      styleIdUsed,
    );
    const enrDetailEn = syncCoverPromptChars(
      res.detailPromptEn ?? "",
      "en",
      mergedPlan,
      matchedRefIds,
      styleIdUsed,
    );
    setShortZh(enrZh);
    setShortEn(enrEn);
    setDetailZh(enrDetailZh);
    setDetailEn(enrDetailEn);
    setPromptView("short");
    setCoverageInfo({
      score: res.coverage,
      missing: res.coverageMissing,
      usedCondensed: res.usedCondensed,
      enCondensed: res.enCondensed,
    });
    setPromptZh(enrZh);
    if (!keepHandEn) setPromptEn(enrEn);
    if (matchedRefIds.length > 0) setRefCharIds(matchedRefIds);
    let step1Note =
      res.coverageMissing.length > 0
        ? `方案已生成（只出三样：人物站位、标题位置、标题风格；人物的长相穿搭以参考图为准、提示词里不写）。还有没定齐的：${res.coverageMissing.join("、")}——可以在方案细节里补上后点「按当前方案重新拼提示词」，或直接改下面的提示词。标题与人物都来自本项目的剧本与人物表。分析没有提交任何生图。${keepHandEn ? "英文提示词是你手填的，已保留未覆盖。" : ""}`
        : `方案已生成（只出三样：人物站位、标题位置、标题风格；人物的长相穿搭以参考图为准、提示词里不写）。改方案后点「按当前方案重新拼提示词」，或直接改下面的提示词。分析没有提交任何生图。${keepHandEn ? "英文提示词是你手填的，已保留未覆盖。" : ""}`;
    // v5.07：带了资产图就在说明里亮明张数，真机一眼能核对这
    // 次分析到底看没看图（没带图时不加这句，口径同从前）。
    if (imageCount > 0) {
      step1Note += ` 本次分析带上了 ${imageCount} 位人物的资产图，按图排版、严格参照人物资产图。`;
    }
    writeCoverCache({
      v: 1,
      fp: fpNow,
      styleId: styleIdUsed,
      plan: mergedPlan,
      shortZh: enrZh,
      shortEn: enrEn,
      detailZh: enrDetailZh,
      detailEn: enrDetailEn,
      coverageInfo: {
        score: res.coverage,
        missing: res.coverageMissing,
        usedCondensed: res.usedCondensed,
        enCondensed: res.enCondensed,
      },
      refCharIds: matchedRefIds,
      savedAt: Date.now(),
    });
    setCacheAppliedFp(fpNow);
    setAnalyzing(false);
    setAnalyseNote(step1Note);
  };

  // v5.08：驱动一个分析任务到终点——循环调 runCoverAnalysis-
  // JobStep（服务端认领窗口挡重复推理，本页只管推与取）；单
  // 次步进的响应被网关掐断不算失败（结果先落库、下一轮取回
  // 来）。最多驱动约 6 分钟，超时把任务留在服务端，本页停下
  // 并写清「下次进来接着取」，不丢任务、不重复跑。
  const driveCoverJob = async (
    jobId: number,
    characterImages: {
      characterId: number;
      dataBase64: string;
      mimeType: string;
    }[],
    runToken: number,
    styleIdUsed: string,
  ): Promise<void> => {
    const sleep = (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms));
    const DRIVE_CAP_MS = 6 * 60 * 1000;
    const startedAt = Date.now();
    let stage: "main" | "en" = "main";
    for (;;) {
      if (analyseRunRef.current !== runToken) return;
      let out: ApiResponse<typeof api, "runCoverAnalysisJobStep"> | null =
        null;
      try {
        // 步进调用不套 callWithGatewayRetry：本循环本身就是重试
        // ——响应被掐断就下一轮接着步进，服务端认领窗口挡着不
        // 会重复推理。
        out = await api.runCoverAnalysisJobStep({
          jobId,
          characterImages:
            stage === "main" && characterImages.length > 0
              ? characterImages
              : undefined,
        });
      } catch {
        out = null;
      }
      if (analyseRunRef.current !== runToken) return;
      if (out) {
        stage = out.stage;
        if (out.status === "done" && out.result) {
          writeCoverJob(null);
          applyAnalysisResult(out.result, characterImages.length, styleIdUsed);
          return;
        }
        if (out.status === "failed") {
          writeCoverJob(null);
          setAnalyseError(out.error ?? "分析失败，请重试");
          setAnalyzing(false);
          return;
        }
      }
      if (Date.now() - startedAt > DRIVE_CAP_MS) {
        setAnalyseError(
          "分析任务跑得比平时久，页面先停在这里——任务还在服务端，下次进这个页面会接着同一个任务取结果，不会从头重跑。分析不花钱、不提交生图。",
        );
        setAnalyzing(false);
        return;
      }
      await sleep(2500);
    }
  };

  // ------------------------------------------------------------------
  // v5.10 复制剧本代码：封面分析改走聊天框——点「复制剧本代码」
  // 把当前项目的封面分析用剧本摘要复制到剪贴板，用户粘到聊天
  // 框发给助手，助手直接分析出封面提示词，用户再粘回第三步的
  // 提示词框点生成。摘要是结构化纯文本，只含封面分析需要的内
  // 容：项目标题 / 剧本标题 / 已选风格 / 梗概 / 人物（代号、
  // 称呼、身份）/ 主梗与关键事件 / 关键场景 / 核心道具，外加
  // 一句写明分析口径的请求说明（只定站位、标题位置、标题风格
  // 三样，长相穿搭以参考图为准）。不含分镜逐拍与全部台词（避
  // 免粘贴过长），不写人物外貌长相——身份只取备注的「身份：」
  // 标签段 / 卡片扮演字段 / 剧本人物表身份，取不到就不写，绝
  // 不拿造型文字冒充身份。
  // v5.11 形象口径修正（用户实报：v5.10 的说法不实）：解剖写进
  // characterRows.identity 的身份原文并不干净——项目 39 的 E 行
  // 混着「黄色袋鼠玩偶形象」（整体造型）、D 行混着「左臂红袖
  // 章」（穿戴物），且项目 39 人物卡备注没有「身份：」标签段、
  // role 为空，v5.10 的三路取身份实际全程回落这份未清洗的原文
  // 并原样进了摘要。本版：①身份统一过 cleanCoverIdentity 清洗
  // （先摘括号补充段，再按分句剔除含造型 / 穿戴 / 年龄外貌词的
  // 分句），摘要与卡面展示共用同一份清洗结果；②人物行加参考
  // 图绑定（按当前已选参考图顺序编号），并在摘要开头明示本摘
  // 要不附图、聊天里看不到资产图、分析只定站位与标题，人物面
  // 部特征与整体造型严格以生成时随附的资产图为准、绝不更改，
  // 穿搭默认以资产图为准、场景需要时可调整；③梗概与道具描述
  // 同样摘掉括号里的形象补充段（如「校长（袋鼠玩偶）」），免
  // 得形象词从剧情文本里漏进摘要。
  // ------------------------------------------------------------------
  const [copyDigestState, setCopyDigestState] = useState<
    "idle" | "done" | "failed"
  >("idle");
  const copyDigestTimerRef = useRef<number | null>(null);

  // 形象词表：分句里出现任一词，该分句即视为造型 / 穿戴 / 外貌
  // 描述、整句剔除（身份分句如「小学生」「学校校长」「卫生委
  // 员」不含这些词，不受影响）。
  const COVER_APPEARANCE_WORDS = [
    "袋鼠", "玩偶", "形象", "造型", "毛绒", "长耳", "长鼻", "鼻头",
    "发型", "头发", "短发", "长发", "齐肩", "刘海", "中分", "发夹",
    "发箍", "耳钉", "耳环", "眼镜", "圆脸", "脸型",
    "背心", "T恤", "衬衫", "外套", "校服", "制服", "上衣", "短裤",
    "长裤", "裤子", "裙", "袜", "皮鞋", "运动鞋", "拖鞋", "头盔",
    "袖章", "红领巾", "领巾", "领带", "围巾", "帽子", "服装", "穿搭",
    "黄色", "红色", "黑色", "白色", "粉色", "蓝色", "金色", "绿色",
    "紫色", "藏青", "深蓝", "偏胖", "肥胖",
  ];
  // 摘掉一对括号内的补充段（中文 / 英文括号）：身份里的
  // 「卫生委员（左臂红袖章…）」、梗概里的「校长（袋鼠玩偶）」
  // 这类形象补充整段摘除，正文不受影响。
  const stripParenSegments = (s: string): string =>
    s.replace(/[（(][^（）()]*[）)]/g, "").replace(/\s{2,}/g, " ").trim();
  const cleanCoverIdentity = (raw: string): string => {
    const noParen = stripParenSegments(raw);
    const clauses = noParen
      .split(/[，,；;。\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const kept = clauses.filter(
      (cl) =>
        !COVER_APPEARANCE_WORDS.some((w) => cl.includes(w)) &&
        !/\d+\s*(?:[-~—至]\s*\d+\s*)?岁/.test(cl),
    );
    return kept.join("，");
  };
  // 人物身份的唯一取法（摘要与卡面展示共用）：三路取原文后统
  // 一清洗——备注「身份：」标签段 → 卡片 role → 剧本人物表
  // identity；清洗后为空就返回空串，绝不回落未清洗原文。
  const coverIdentityOf = (c: CoverCharCard): string => {
    const labelled = (c.note ?? "").match(
      /身份[:：]\s*([^；;。\n]+)/,
    )?.[1]?.trim();
    const rowIdentity =
      coverScript?.characterRows
        .find((r) => r.name.trim() === c.name.trim())
        ?.identity.trim() ?? "";
    return cleanCoverIdentity(labelled || c.role.trim() || rowIdentity);
  };

  const buildCoverChatDigest = (): string => {
    const clip = (s: string, n: number) =>
      s.length > n ? `${s.slice(0, n)}…` : s;
    const lines: string[] = [];
    lines.push("【封面分析请求】");
    lines.push(
      "请按下面这份剧本摘要帮我分析封面，只定三样：人物站位、标题位置、标题风格（标题文字从主梗里提炼）。分析完请直接给出可以粘贴使用的封面提示词（中文 + 英文各一份）。",
    );
    lines.push(
      "【人物形象口径】本摘要不附图片，聊天里看不到我的人物资产图，这里也不写任何人物的长相、造型与穿搭文字（人物行只给清洗后的纯身份与参考图编号）。封面人物一律以我的人物资产图为准：面部特征与整体造型严格参照资产图、绝不更改；穿搭默认以资产图为准，场景需要时可以调整。写提示词时请只按人物行的「代号（称呼）= 参考图 #N」绑定人物，不要按剧本文字描述画人物形象。",
    );
    lines.push(`项目：${project.name}`);
    if (coverScript?.title.trim()) {
      lines.push(`剧本标题：${coverScript.title.trim()}`);
    }
    lines.push(`已选封面风格：${style.label}`);
    const synopsis = (coverScript?.synopsis ?? "").trim();
    const outline = project.outline.trim();
    if (synopsis || outline) {
      lines.push(`梗概：${clip(stripParenSegments(synopsis || outline), 600)}`);
    }
    // v5.54：人物行只列当前已选为参考图的人物（refCharIds），编号按选
    // 择顺序；未选的人物（无论有没有资产图）整行不出现。一个参考图都
    // 没选时，不出人物表——改写一行提示，说明需先勾选参考图人物。
    const selectedChars = refCharIds
      .map((refId) => project.characters.find((x) => x.id === refId))
      .filter((c): c is NonNullable<typeof c> => c != null);
    if (selectedChars.length > 0) {
      lines.push(
        "人物（只列已选为参考图的人物：代号、称呼、清洗后的纯身份与参考图绑定；不写长相造型穿搭，形象以资产图为准）：",
      );
      for (const [i, c] of selectedChars.entries()) {
        const alias = aliasByCode.get(c.name) ?? "";
        const head = alias ? `${c.name}（${alias}）` : c.name;
        const identity = coverIdentityOf(c);
        lines.push(
          `- ${head} = 参考图 #${i + 1}${identity ? `｜身份：${clip(identity, 80)}` : ""}`,
        );
      }
    } else if (project.characters.length > 0) {
      lines.push(
        "人物：本次未选任何参考图，人物行未列出（如需按人物分析站位，请先在封面页勾选人物参考图后再复制）。",
      );
    }
    const eventGroups = (
      coverScript && coverScript.groups.length > 0
        ? coverScript.groups
        : (coverScript?.storyboardGroups ?? [])
    ).filter((g) => g.title.trim());
    if (eventGroups.length > 0) {
      lines.push("主梗 / 关键事件（按剧本分段）：");
      for (const g of eventGroups.slice(0, 12)) {
        lines.push(
          `- ${g.title.trim()}${g.sceneName.trim() ? `（场景：${g.sceneName.trim()}）` : ""}`,
        );
      }
    }
    const sceneNames: string[] = [];
    const pushScene = (s: string) => {
      const t = s.trim();
      if (t && !sceneNames.includes(t)) sceneNames.push(t);
    };
    for (const s of project.sceneAssets) pushScene(s.name);
    for (const g of coverScript?.groups ?? []) {
      for (const part of g.sceneName.split("/")) pushScene(part);
    }
    for (const g of coverScript?.storyboardGroups ?? []) {
      for (const part of g.sceneName.split("/")) pushScene(part);
    }
    if (sceneNames.length > 0) {
      lines.push(`关键场景：${sceneNames.join("、")}`);
    }
    const props = coverScript?.propAssets ?? [];
    if (props.length > 0) {
      lines.push(
        `核心道具：${props
          .map((p) =>
            p.description.trim()
              ? `${p.name.trim()}（${clip(stripParenSegments(p.description.trim()), 40)}）`
              : p.name.trim(),
          )
          .join("、")}`,
      );
    }
    return lines.join("\n");
  };

  const copyCoverDigest = async () => {
    const text = buildCoverChatDigest();
    // 与监控页详情窗同一套复制口径：clipboard API 优先，不可用
    // 时退回临时文本框 + execCommand。
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      ok = false;
    }
    if (!ok) {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {
        ok = false;
      }
    }
    setCopyDigestState(ok ? "done" : "failed");
    if (copyDigestTimerRef.current != null) {
      window.clearTimeout(copyDigestTimerRef.current);
    }
    copyDigestTimerRef.current = window.setTimeout(
      () => setCopyDigestState("idle"),
      4000,
    );
  };

  const rebuildPrompts = () => {
    if (!plan) return;
    // v5.09 重拼口径：buildCoverPrompts 只拼三样（人物站位、标
    // 题位置、标题风格）+ 风格规则，中英各一份、主稿与备查同
    // 文；不再有签名版、浓缩短稿与完整版回退之分。
    const built = buildCoverPrompts(plan, style, ratio);
    // v5.06：页面最终落定的方案（= 当前 plan），重拼结束时随
    // 四份稿一起写回分析缓存用。
    const finalPlan = plan;
    // v5.05：重拼产出落页面前按当前参考选择同步人物行（代号 +
    // 位置）与参考图绑定行；位置取方案的 characterPositions
    // （站位），同步用的就是当前 plan。
    const enrZh = syncCoverPromptChars(
      built.writePrompt,
      "zh",
      plan,
      refCharIds,
      styleId,
    );
    const enrEn = syncCoverPromptChars(
      built.promptEn,
      "en",
      plan,
      refCharIds,
      styleId,
    );
    const enrDetailZh = syncCoverPromptChars(
      built.detailFallback,
      "zh",
      plan,
      refCharIds,
      styleId,
    );
    const enrDetailEn = syncCoverPromptChars(
      built.promptEnFallback,
      "en",
      plan,
      refCharIds,
      styleId,
    );
    setShortZh(enrZh);
    setShortEn(enrEn);
    setDetailZh(enrDetailZh);
    setDetailEn(enrDetailEn);
    setPromptView("short");
    setCoverageInfo({
      score: built.coverage,
      missing: built.coverageMissing,
      usedCondensed: built.usedCondensed,
      enCondensed: built.enCondensed,
    });
    setPromptZh(enrZh);
    const keepHandEn = enHandEditedRef.current && !!promptEn.trim();
    if (!keepHandEn) {
      setPromptEn(enrEn);
    }
    // v5.06：重拼是「应用方案修改」的正式出口——把重拼后的方案
    // 与四份稿一并写回分析缓存（指纹不变、内容以页面当前这份为
    // 准），免得用户改完方案离开页面、回来被缓存恢复成改之前的
    // 旧方案。方案以页面最终落定的为准（走浓缩时是浓缩后的）。
    writeCoverCache({
      v: 1,
      fp: fpNow,
      styleId,
      plan: finalPlan,
      shortZh: enrZh,
      shortEn: enrEn,
      detailZh: enrDetailZh,
      detailEn: enrDetailEn,
      coverageInfo: {
        score: built.coverage,
        missing: built.coverageMissing,
        usedCondensed: built.usedCondensed,
        enCondensed: built.enCondensed,
      },
      refCharIds,
      savedAt: Date.now(),
    });
    setCacheAppliedFp(fpNow);
    setAnalyseNote(
      built.coverageMissing.length > 0
        ? `已按当前方案重拼（只拼人物站位、标题位置与标题风格；长相穿搭以参考图为准）。还没定齐的：${built.coverageMissing.join("、")}——补上后再重拼即可。${keepHandEn ? "英文提示词是你手填的，已保留未覆盖。" : ""}`
        : `已按当前方案重拼（只拼人物站位、标题位置与标题风格；长相穿搭以参考图为准）。${keepHandEn ? "英文提示词是你手填的，已保留未覆盖。" : ""}`,
    );
  };

  // v3.90 浓缩版 / 完整版切换：只是把另一份现成稿放进提示词框，
  // 生成用的就是框里当前显示的这一份；英文框是用户手填时不切换它。
  const applyPromptView = (view: "short" | "full") => {
    setPromptView(view);
    setPromptZh(view === "short" ? shortZh : detailZh);
    if (!(enHandEditedRef.current && promptEn.trim())) {
      setPromptEn(view === "short" ? shortEn : detailEn);
    }
  };

  // ------------------------------------------------------------------
  // v5.06 取图（从 submitCover 抽出）：把这次提交要带的参考图全
  // 取好装成一包 PreparedCoverRefs——单张 / 记录重提由 submitCover
  // 现取现用；一键三比例只取一次、三份提交共用同一包，不再逐个
  // 比例把同一批图（尤其大图的中转分片）重取三遍。
  //
  // 取图口径与 v4.22 / v5.04 一字未变：只在提交这一刻取（最多
  // MAX_COVER_REF_IMAGES 张），取的是降采样副本（本机单张压到
  // 最长边 1024px 的 JPEG，库里原图一字不动）；本机压不动又超
  // 直塞上限的过大原图改走中转（原图字节分片送服务端拼回、特
  // 权层 PIL 压缩后托管），尺寸不再成为丢图理由；只有真读不到
  // / 传不上去才点名记真实原因，绝不静默丢图。取图前先过同意
  // 门——refHostConsent 未勾时整包为空（gatePassed=false），后
  // 面一致性对账负责降级与提示。取图只是本机降采样与分片暂存，
  // 不提交、不计费（真正的上传换链接发生在特权层提交那一刻）。
  // ------------------------------------------------------------------
  // 提交给服务端的参考图两种形态：已在本机压好的内联副本，或
  // 中转分片引用（原图字节已分片暂存服务端，提交动作里拼回、
  // 由特权层 PIL 压缩后托管）。数组顺序即提交顺序。
  type SubmitRefArg =
    | { dataBase64: string; mimeType: string }
    | { chunked: ChunkedImageRef };
  type PreparedCoverRefs = {
    referenceImages: SubmitRefArg[];
    // 实际取到图的人物卡 id（提交顺序）——提示词人物行同步与
    // 提交前缺人对账都按它算，不拿卡名与方案真名硬比（v5.04）。
    fetchedRefIds: number[];
    // 没带上的图只记真实原因（读不到字节 / 分片没传上去）。
    failedRefs: { name: string; reason: string }[];
    uploadedFailedRefs: { name: string; reason: string }[];
    crowdedOutNames: string[];
    gatePassed: boolean;
  };
  const fetchCoverRefs = async (
    effectiveRefIds: number[],
    withRefs: boolean,
  ): Promise<PreparedCoverRefs> => {
    const prepared: PreparedCoverRefs = {
      referenceImages: [],
      fetchedRefIds: [],
      failedRefs: [],
      uploadedFailedRefs: [],
      crowdedOutNames: [],
      gatePassed: false,
    };
    const { referenceImages, fetchedRefIds, failedRefs, uploadedFailedRefs, crowdedOutNames } = prepared;
    setRefProgress(null);
    if (withRefs && refHostConsent) {
      prepared.gatePassed = true;
      // v5.04 中转压缩：画布压不动且原图超客户端直塞上限时，不
      // 再丢图——原图字节经分片送服务端（与人物资产图上传同一
      // 套分片口径），提交动作拼回后由特权层 PIL 逐档压缩再托
      // 管。进行中逐张亮进度（第几张、第几片），不静默。
      let relayCount = 0;
      const relayReference = async (
        url: string,
        label: string,
      ): Promise<ChunkedImageRef> => {
        relayCount += 1;
        const nth = relayCount;
        setRefProgress(
          `正在中转压缩第 ${nth} 张参考图（${label}）：原图较大，正在分片送服务端压缩……`,
        );
        return uploadImageUrlInChunks(url, label, (done, total) => {
          setRefProgress(
            `正在中转压缩第 ${nth} 张参考图（${label}）：分片已送 ${done} / ${total} 片，送齐后由服务端压缩…`,
          );
        });
      };
      // v4.28：先取提示词下方用户直传的参考图（为这张封面专门传
      // 的，优先占位），再按生效集合的顺序取人物参考图（页面勾
      // 选顺序 / 重新生成时方案名单顺序），合计最多
      // MAX_COVER_REF_IMAGES 张，顺序即提交顺序。
      for (const u of uploadedRefs) {
        if (referenceImages.length >= MAX_COVER_REF_IMAGES) break;
        const b = await urlToSubmitReference(u.dataUrl);
        if (b) {
          referenceImages.push(b);
          continue;
        }
        try {
          const ref = await relayReference(u.dataUrl, u.name);
          referenceImages.push({ chunked: ref });
        } catch (e) {
          uploadedFailedRefs.push({
            name: u.name,
            reason: e instanceof Error ? e.message : String(e),
          });
        }
      }
      for (const id of effectiveRefIds) {
        const c = charsWithImage.find((x) => x.id === id);
        if (!c || !c.imageUrl) continue;
        if (referenceImages.length >= MAX_COVER_REF_IMAGES) {
          crowdedOutNames.push(c.name || "未命名人物");
          continue;
        }
        const b = await urlToSubmitReference(c.imageUrl);
        if (b) {
          referenceImages.push(b);
          fetchedRefIds.push(c.id);
          continue;
        }
        try {
          const ref = await relayReference(
            c.imageUrl,
            c.name || "未命名人物",
          );
          referenceImages.push({ chunked: ref });
          fetchedRefIds.push(c.id);
        } catch (e) {
          failedRefs.push({
            name: c.name || "未命名人物",
            reason: e instanceof Error ? e.message : String(e),
          });
        }
      }
      setRefProgress(null);
    }
    return prepared;
  };
  // 取图说明（哪几位 / 哪几张没带上、真实原因）：单张由
  // submitCover 在自己现取后发布；一键三比例由批量入口在取完
  // 一次后统一发布一次，不逐比例重复。
  const publishRefNotes = (prepared: PreparedCoverRefs) => {
    const reasonList = (list: { name: string; reason: string }[]) =>
      list.map((f) => `${f.name}：${f.reason}`).join("；");
    const refNotes: string[] = [];
    if (prepared.failedRefs.length) {
      refNotes.push(
        `参考图里有 ${prepared.failedRefs.length} 位没带上（${reasonList(prepared.failedRefs)}）——是这些真实原因没送达，不是图太大（过大的图已自动中转压缩带上）。封面里这几位与资产图的一致性会弱一些。`,
      );
    }
    if (prepared.uploadedFailedRefs.length) {
      refNotes.push(
        `上传参考图里有 ${prepared.uploadedFailedRefs.length} 张没带上（${reasonList(prepared.uploadedFailedRefs)}），先跳过这几张。`,
      );
    }
    if (prepared.crowdedOutNames.length) {
      refNotes.push(
        `参考图合计最多 ${MAX_COVER_REF_IMAGES} 张，上传图优先占位后，这几位人物参考图这次没带上（${prepared.crowdedOutNames.join("、")}）：封面里这几位只能按文字画；想带上就删掉一张上传图、或取消一位人物参考图再生成。`,
      );
    }
    setRefNote(refNotes.length ? refNotes.join(" ") : null);
  };

  // v5.16 ②③ 提交前判定：这份提示词「需不需要参考图随行」——带
  // 人物约束句的需要；风格 11（evidence_reveal）提交时必被注入人
  // 物强化句（见 submitCover），所以风格 11 只要有词就算需要。
  // 生成入口先取图：实际带图为 0 且需要图时，先弹一次明确确认，
  // 不再静默降级（降级本身保留：确认后照常纯文字提交）。
  const promptNeedsRefs = (zh: string, en: string): boolean => {
    // v5.18：判定口径跟提交口径一致——只看将提交的那一版（用户
    // 选的语言版），不再两版任一有约束就算数。
    const eff = submitLang === "en" ? en.trim() : zh.trim();
    if (!eff) return false;
    if (promptHasCharacterConstraint(eff)) return true;
    return styleId === "evidence_reveal";
  };
  // 无图确认弹窗里的大白话说明：为什么这次带不上图 + 将提交哪一版。
  const textOnlyDetail = (prepared: PreparedCoverRefs): string => {
    const intendedSel = refCharIds.filter((id) =>
      charsWithImage.some((c) => c.id === id),
    ).length;
    const langLabel = submitLang === "en" ? "英文" : "中文";
    const why =
      !refHostConsent && (intendedSel > 0 || uploadedRefs.length > 0)
        ? `你选了 ${intendedSel} 位人物参考图${uploadedRefs.length > 0 ? `、还上传了 ${uploadedRefs.length} 张参考图` : ""}，但还没勾选参考图区的图床同意，所以这次一张图都带不上`
        : prepared.failedRefs.length > 0 || prepared.uploadedFailedRefs.length > 0
          ? "你选好的参考图这次一张都没能取到（读取或中转失败，具体原因见上方参考图说明）"
          : intendedSel === 0 && uploadedRefs.length === 0
            ? "这次没有勾选任何人物参考图、也没有上传参考图"
            : "这次没有带上参考图";
    return `${why}。将提交的是${langLabel}版提示词。`;
  };

  // ------------------------------------------------------------------
  // 提交（只由用户亲手点「生成封面」/ 二次确认的重新生成触发）
  // ------------------------------------------------------------------
  const submitCover = async (input: {
    usePromptZh: string;
    usePromptEn: string;
    usePlan: CoverPlan | null;
    useRatio: "16:9" | "3:4" | "4:3";
    useStyleId: string;
    useStyleName: string;
    withRefs: boolean;
    // v5.18：第三步生成入口显式传用户选的提交语言——传了就只提
    // 交那一版（另一版不参与挑选）；不传（记录重提）时沿用旧口
    // 径（英文版非空优先英文），因为重提要复现的是该记录自己
    // 当时提交的那一版。
    useLang?: "zh" | "en";
    // v3.89：「重新生成」专用——记录里没存参考图字节，但存了方案
    // （analysisJson 的 mainCharacters），重提时按方案名单重新匹配
    // 出参考人物 id 集合传进来，覆盖页面当前勾选；不传时用页面勾选。
    refCharIdsOverride?: number[];
    // v5.06：一键三比例专用——参考图已由批量入口用 fetchCoverRefs
    // 取好一次、三份共用，传进来就不再逐比例重取；skipProbe 时
    // 跳过提交前预检（批量入口已统一探过一次）。
    preparedRefs?: PreparedCoverRefs;
    skipProbe?: boolean;
  }): Promise<{ ok: boolean; error: string | null }> => {
    const effectiveRefIds = input.refCharIdsOverride ?? refCharIds;
    // v5.06：失败原因随返回值带出（reportSubmitError 已同步写进
    // 页面报错区）；并行三比例时逐比例各读各的返回值，不再共用
    // 一条会被后一个比例覆盖的报错镜像。
    const fail = (): { ok: false; error: string | null } => ({
      ok: false,
      error: submitErrorRef.current,
    });
    // v5.18：按选中语言取提交词——传了 useLang 就只取那一版，
    // 那一版为空就是空、明确报错点名，绝不静默改投另一版。
    const prompt =
      input.useLang === "en"
        ? input.usePromptEn.trim()
        : input.useLang === "zh"
          ? input.usePromptZh.trim()
          : input.usePromptEn.trim() || input.usePromptZh.trim();
    if (!prompt) {
      reportSubmitError(
        input.useLang
          ? `你选的是${input.useLang === "en" ? "英文" : "中文"}版，但${input.useLang === "en" ? "英文" : "中文"}提示词框是空的——先把这一版填好再生成；不会自动改用${input.useLang === "en" ? "中文" : "英文"}版提交。`
          : "先把聊天框分析好的封面提示词粘贴到第三步的提示词框、或自己写一段，再点生成",
      );
      return fail();
    }
    // v3.85 字数拦截（与服务端提交前检查同一口径，覆盖手改提示词
    // 与旧记录重提）：超安全线就在本地拦下，不发注定被拒的请求。
    if (prompt.length > SUBMIT_PROMPT_BUDGET) {
      reportSubmitError(
        `提示词太长，这次没有提交：实际提交的提示词共 ${prompt.length} 字符，Geeknow 的上限是 ${GEEKNOW_PROMPT_HARD_LIMIT} 字符（本台安全线 ${SUBMIT_PROMPT_BUDGET}）。请删减提示词再生成——优先删方案细节里的长句（人物表情与动作、核心道具、背景场景），主标题、钩子句和风格规则尽量别动。这次没有发出请求、不会计费。`,
      );
      return fail();
    }
    if (!model.trim()) {
      reportSubmitError("先选一个模型再生成");
      return fail();
    }
    // v4.22：带参考图的提交不再拦截。取图受参考图区的公开图床同
    // 意门控制（fetchCoverRefs 里过门：勾了同意才取图，提交时由
    // 特权层上传图床换链接）；没勾同意就不取图、不上传，走到一
    // 致性对账时自动降级纯文字（去掉约束句），照常提交、不报错
    // 拦单。取图在鉴权预检之前——先把「实际能带上几张图」数清
    // 楚，才做得了一致性检查（v3.98 口径）。
    const prepared =
      input.preparedRefs ??
      (await fetchCoverRefs(effectiveRefIds, input.withRefs));
    const referenceImages = prepared.referenceImages;
    const fetchedRefIds = prepared.fetchedRefIds;
    const failedRefs = prepared.failedRefs;
    const uploadedFailedRefs = prepared.uploadedFailedRefs;
    if (!input.preparedRefs && prepared.gatePassed) {
      publishRefNotes(prepared);
    }
    // ----------------------------------------------------------------
    // v4.22 一致性对账 + 自动降级（统一入口，单张 / 三比例 / 记录
    // 重提都过这里，取代 v3.98 的整单拦截）：实际将提交的提示词
    // 带人物约束句、却一张参考图都没带上时，零图带约束硬提注定
    // 被上游以 400 upstream_text_reply 拒（模型只回「请上传参考
    // 图」）——但用户明确要求不许再整单拦下，所以改为自动降级：
    // 提交副本（以及这条记录存下的提示词）用 stripCharacter-
    // Constraint 把约束句自动去掉、按纯文字照常提交，并在生成
    // 区亮一条黄色提醒写清为什么降级、页面上的提示词原文没动。
    // 降级原因分清：没勾图床同意 / 没选到图 / 勾了但一张都没取
    // 到。实际带上图（≥1 张）时约束原样保留、不降级。
    // ----------------------------------------------------------------
    setRefWarning(null);
    // v5.04：提交副本先同步人物行——名字表按实际取图的提交顺序
    // 重排（已带图人物在前、未带图的方案成员按方案顺序补后），
    // 只改人物那一行、其余文字不动；下面存记录用的就是同步后
    // 的这份，与实际提交一致。没取到图时同步原样返回，降级逻
    // 辑照旧摘约束句。
    // v5.05：同步升级为 syncCoverPromptChars——人物条目带代号
    // 与逐人位置、人物行后跟一行参考图绑定（编号 = 实际取图
    // 顺序）；没取到图时只摘绑定行。下面降级摘约束句改在同步
    // 后的文本上做，保证摘完的提交副本里不残留绑定行。
    let finalPromptZh = syncCoverPromptChars(
      input.usePromptZh,
      "zh",
      input.usePlan,
      fetchedRefIds,
      input.useStyleId,
    );
    let finalPromptEn = syncCoverPromptChars(
      input.usePromptEn,
      "en",
      input.usePlan,
      fetchedRefIds,
      input.useStyleId,
    );
    // v5.16 ③：风格 11（evidence_reveal）人物强化句提交时兜底注入
    // ——手粘提示词丢了这句也能补上（规则里已有同一句，见
    // coverstyles）；已有就不重复加（草稿里带了同一句时只出现一
    // 次）。只注入非空的那一版：空版补了会让「英文优先」的提交
    // 口径把单独一行英文强化句当成整份提示词。只动风格 11，风格
    // 1–10 的提交文本一字不变。
    if (input.useStyleId === "evidence_reveal") {
      finalPromptZh = ensureEvidenceReinforcement(finalPromptZh, "zh");
      finalPromptEn = ensureEvidenceReinforcement(finalPromptEn, "en");
    }
    // v5.18：最终提交词按选中语言取——useLang 传了就只取那一版
    // （降级摘除后同样按此口径重取）；不传（记录重提）沿用旧口
    // 径英文非空优先。
    const pickFinalPrompt = (): string =>
      input.useLang === "en"
        ? finalPromptEn.trim()
        : input.useLang === "zh"
          ? finalPromptZh.trim()
          : finalPromptEn.trim() || finalPromptZh.trim();
    let finalPrompt = pickFinalPrompt();
    // v5.16 ①：零图降级时写进记录的降级原因（短句版，长版原因仍
    // 在下方黄色提醒里）；没降级时为 null。
    let degradeLabel: string | null = null;
    // v5.16 ③：约束判定改在注入后的提交副本上做——风格 11 注入的
    // 强化句本身就是硬约束，零图时同样要走降级摘除，不许带着
    // 「必须使用随附图」去零图硬提。
    const hasConstraint =
      promptHasCharacterConstraint(finalPrompt) ||
      (input.useStyleId === "evidence_reveal" &&
        (promptHasEvidenceReinforcement(finalPromptZh, "zh") ||
          promptHasEvidenceReinforcement(finalPromptEn, "en")));
    if (hasConstraint && referenceImages.length === 0) {
      const intendedCount = effectiveRefIds.filter((id) =>
        charsWithImage.some((c) => c.id === id),
      ).length;
      const intendedUploadCount = input.withRefs ? uploadedRefs.length : 0;
      const planNames = input.usePlan?.mainCharacters ?? [];
      finalPromptZh = stripCharacterConstraint(finalPromptZh);
      finalPromptEn = stripCharacterConstraint(finalPromptEn);
      if (input.useStyleId === "evidence_reveal") {
        // 强化句整行摘除（stripCharacterConstraint 的 ZH 口径摘不
        // 净这一句的后半段，整行删干净，不留「以资产图为准」残句
        // 去零图硬提）。
        const dropReinforceLine = (t: string) =>
          t
            .split("\n")
            .filter(
              (line) =>
                !line.includes("必须使用随附") &&
                !/must use the (?:\d+ )?attached character asset images/i.test(line),
            )
            .join("\n");
        finalPromptZh = dropReinforceLine(finalPromptZh);
        finalPromptEn = dropReinforceLine(finalPromptEn);
      }
      finalPrompt = pickFinalPrompt();
      degradeLabel =
        !refHostConsent && (intendedCount > 0 || intendedUploadCount > 0)
          ? "无图降级：未勾选图床同意"
          : intendedCount > 0
            ? `无图降级：已选的 ${intendedCount} 位人物参考图一张都没取到`
            : intendedUploadCount > 0
              ? "无图降级：上传参考图一张都没取到"
              : planNames.length > 0
                ? "无图降级：封面人物没有可带上的参考图"
                : charsWithImage.length === 0
                  ? "无图降级：本项目没有带资产图的人物、也没有上传参考图"
                  : "无图降级：没有勾选任何人物参考图、也没有上传参考图";
      const reason = !refHostConsent && (intendedCount > 0 || intendedUploadCount > 0)
        ? `你选了 ${intendedCount} 位人物参考图${intendedUploadCount > 0 ? `、还上传了 ${intendedUploadCount} 张参考图` : ""}，但还没勾选参考图区的公开图床同意——这次没有上传任何图片`
        : intendedCount > 0
          ? `勾选的 ${intendedCount} 位人物参考图这次一张都没取到${failedRefs.length ? `（没取到的是：${failedRefs.map((f) => `${f.name}：${f.reason}`).join("；")}）` : "（图片地址不可用）"}`
          : intendedUploadCount > 0
            ? `上传的 ${intendedUploadCount} 张参考图这次一张都没取到${uploadedFailedRefs.length ? `（${uploadedFailedRefs.map((f) => `${f.name}：${f.reason}`).join("；")}）` : "（图片读取失败）"}`
            : planNames.length > 0
            ? `封面人物名单（${planNames.join("、")}）这次没有可带上的参考图（没勾选、或人物还没有资产图）`
            : charsWithImage.length === 0
              ? "本项目目前没有任何带资产图的人物、也没有上传参考图，这次带不上参考图"
              : "这次没有勾选任何人物参考图、也没有上传参考图";
      setRefWarning(
        `提醒（已自动降级、本次照常按纯文字提交）：${reason}，已自动去掉提交词里的「外貌与服装以随附的人物资产图为准」约束（页面上的提示词原文没动）——不带图硬提这句约束，上游只会回「请上传参考图」按失败处理。封面人物这次只能按文字画；想与资产图一致，勾上参考图区的同意、选好参考图后再生成。`,
      );
    }
    // v5.81：封面页不再做防版权拦截——v5.80 在此对最终提交副本
    // （中英两版）过替换表 + 原创声明的逻辑已下线，finalPromptZh /
    // finalPromptEn / finalPrompt 按原文提交、原文存进记录。
    // 部分缺失：还有图能交，但方案里有人没带上（没勾选 / 本人没
    // 有资产图 / 送达失败）——不拦，但在提交前亮黄色提醒点名缺
    // 谁，不再静默提交让用户事后才发现封面里的人对不上。
    if (referenceImages.length > 0) {
      const planNames = input.usePlan?.mainCharacters ?? [];
      // v5.04：按解析后的卡 id 对账（方案名先经三层解析落到卡，
      // 再看这张卡的图有没有实际取到），不再拿方案真名与卡代号
      // 逐字比——旧比法对代号卡全员误报「没带上参考图」。
      const missingPlan = planNames.filter((n) => {
        // v5.09：对账走消元兜底解析（与人物行同一口径），名字
        // 子串对不上的主角（如项目 39 的「小帅」）不再误报缺图。
        const card = resolvePlanCharForPlan(input.usePlan ?? null, n, project.characters);
        return !card || !fetchedRefIds.includes(card.id);
      });
      const warnParts: string[] = [];
      if (missingPlan.length > 0) {
        warnParts.push(
          `封面人物名单里有 ${missingPlan.length} 位这次没带上参考图（${missingPlan.join("、")}）：没勾选、或本人还没有资产图——封面里这几位只能按文字画，与资产图的一致性会弱`,
        );
      }
      if (failedRefs.length > 0) {
        warnParts.push(
          `另有 ${failedRefs.length} 位已勾选但参考图没能送达（${failedRefs.map((f) => `${f.name}：${f.reason}`).join("；")}），同样按文字画`,
        );
      }
      if (warnParts.length > 0) {
        setRefWarning(
          `提醒（仍会照常提交）：${warnParts.join("；")}。其余 ${referenceImages.length} 位的参考图会正常带上。要全员对版，先补图或改勾选再生成。`,
        );
      }
    }
    // v3.84 提交前只读预检：先用实际将生效的凭证探一次鉴权（不
    // 存在的模型名，不建任务、不计费）。明确被拒（401/403）就
    // 拦下这次提交并分清是哪种凭证被拒，不再把「自填 Key 不对」
    // 笼统报成「Geeknow 未连接」；预检没查成（网络 / 通道问题）
    // 不拦，照常提交、由提交本身报错。v5.06：一键三比例由批量
    // 入口统一探一次，逐比例提交时 skipProbe 跳过、不探三遍。
    if (!input.skipProbe) {
      const p = await runProbe();
      if (p && p.ok && !p.authOk) {
        reportSubmitError(probeFailText(p));
        return fail();
      }
    }
    const cfg = submitCfgRef.current;
    const res = await api.submitGeeknowImageTask({
      model: model.trim(),
      prompt: finalPrompt,
      quality,
      ratio: input.useRatio,
      requestTimeoutSec: 60,
      downloadTimeoutSec: 60,
      retryCount: 5,
      referenceImages,
      apiKey: cfg.apiKey.trim() ? cfg.apiKey.trim() : undefined,
      apiBase: cfg.apiBase.trim() ? cfg.apiBase.trim() : undefined,
    });
    if (!res.ok) {
      const errText = res.error ?? "提交失败，请重试";
      const usedKey = !!cfg.apiKey.trim();
      reportSubmitError(
        /401|403|鉴权|api key/i.test(errText)
          ? usedKey
            ? `你填的 Key 被 Geeknow 拒绝了：${errText}。已连接的 Geeknow 凭证是好的，卡住的是这个自填 Key：清空 Key 输入框改用已连接凭证、或换一个正确的 Key 再生成；这次请求没到计费环节，Geeknow 控制台的使用日志里不会有它。`
            : `Geeknow 凭证被拒绝：${errText}。这是已连接凭证的问题，不是超时；请重新连接 Geeknow 后再生成。`
          : errText,
      );
      return fail();
    }
    // v5.23 ③ 取图过程证据：这次提交取图这一步的完整账随记录落
    // 库——同意状态、已选人物位数 / 上传图张数、实际取到数、逐个
    // 失败原因与整步失败点。下次再出现 0 图，直接从记录读出卡在
    // 哪一步，不再像记录 id 43 那样三者都没落库、无从判定。
    const evSelectedCount = effectiveRefIds.filter((id) =>
      charsWithImage.some((c) => c.id === id),
    ).length;
    const evUploadedSelected = input.withRefs ? uploadedRefs.length : 0;
    const evFailures = [...failedRefs, ...uploadedFailedRefs];
    const refFetch = {
      consent: refHostConsent,
      gatePassed: prepared.gatePassed,
      selectedCount: evSelectedCount,
      uploadedSelected: evUploadedSelected,
      fetchedCount: fetchedRefIds.length,
      uploadedFetched: Math.max(
        0,
        referenceImages.length - fetchedRefIds.length,
      ),
      crowdedOut: prepared.crowdedOutNames,
      failures: evFailures,
      failStep:
        evSelectedCount + evUploadedSelected > 0 && !prepared.gatePassed
          ? "未勾选图床同意，取图未开始"
          : prepared.gatePassed &&
              referenceImages.length === 0 &&
              evFailures.length > 0
            ? "已选参考图全部取图失败（读取或中转失败，见逐条原因）"
            : prepared.gatePassed &&
                referenceImages.length === 0 &&
                evSelectedCount === 0 &&
                evUploadedSelected === 0
              ? "没有勾选任何人物参考图、也没有上传参考图，无图可取"
              : null,
    };
    const p = input.usePlan;
    const title = p
      ? p.layoutType === "vs"
        ? `${p.sideA} VS ${p.sideB}`
        : p.mainTitle
      : "手动提示词封面";
    // v5.16 ①：托管链接只算 SHA-256 哈希进记录（链接本身是公开图
    // 床临时地址，不落库）；算不出哈希不拦记录——记录照建，哈希
    // 留空。哈希与提交顺序一一对应，日后凭它自证「带了哪几张图」。
    let refHostHashes: string[] = [];
    if (res.refImageUrls && res.refImageUrls.length > 0) {
      const enc = new TextEncoder();
      refHostHashes = await Promise.all(
        res.refImageUrls.map((u) => sha256Hex(enc.encode(u))),
      );
    }
    try {
      const created = await api.createCoverRecord({
        projectId: project.id,
        projectName: project.name,
        title,
        styleId: input.useStyleId,
        styleName: input.useStyleName,
        ratio: input.useRatio,
        layoutType: p?.layoutType ?? "slogan",
        promptZh: finalPromptZh,
        promptEn: finalPromptEn,
        analysisJson: p ? JSON.stringify(p) : "",
        model: model.trim(),
        quality,
        taskId: res.taskId,
        line: "geeknow.top",
        status: res.stagedKey ? "done" : "submitted",
        // v5.16 ① 附图自证：实际附图数 / 附图人物卡 id（提交顺
        // 序）/ 托管链接哈希 / 零图降级原因。
        refCount: referenceImages.length,
        refCharIds: fetchedRefIds,
        refHostHashes,
        degradeReason: degradeLabel,
        // v5.23 ③ 取图过程证据（同意 / 已选 / 取到 / 失败原因）。
        refFetch,
        stagedKey: res.stagedKey,
        mimeType: res.mimeType,
        error: null,
      });
      await invalidateRecords();
      if (created.record.taskId && !created.record.stagedKey) {
        void pollRecordRef.current(created.record);
      }
    } catch {
      reportSubmitError(
        `任务其实已经提交成功（任务号 ${res.taskId ?? "无"}），但封面记录没建上；先别重复提交，等十几秒后重开本页看记录列表。`,
      );
      return fail();
    }
    return { ok: true, error: null };
  };

  const runGenerate = async () => {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      // v5.18：选中版为空先明确提示、先填好再生成——在取图之前
      // 就拦下说明，绝不静默改投另一版、也不发出任何请求。
      if (!submitPromptText) {
        setSubmitError(selectedLangEmptyMessage());
        return;
      }
      // v5.16 ②：先取图再决定——实际一张参考图都带不上、而提示词
      // 带人物约束时，不再静默降级：先弹一次明确确认（用户确认后
      // 才按纯文字提交；仍不拦单、不强制带图）。取图口径与此前
      // submitCover 内部现取一字不变（同一 fetchCoverRefs、同参
      // 数），只是提前到确认之前，取好的图包传给 submitCover 共用。
      const prepared = await fetchCoverRefs(refCharIds, true);
      if (prepared.gatePassed) publishRefNotes(prepared);
      const doSubmit = () =>
        submitCover({
          usePromptZh: promptZh.trim() ? withRatioAdapter(promptZh, ratio, "zh") : promptZh,
          usePromptEn: promptEn.trim() ? withRatioAdapter(promptEn, ratio, "en") : promptEn,
          useLang: submitLang,
          usePlan: plan,
          useRatio: ratio,
          useStyleId: styleId,
          useStyleName: style.label,
          withRefs: true,
          preparedRefs: prepared,
        });
      if (
        prepared.referenceImages.length === 0 &&
        promptNeedsRefs(promptZh, promptEn)
      ) {
        setTextOnlyConfirm({
          detail: textOnlyDetail(prepared),
          proceed: async () => {
            await doSubmit();
          },
        });
        return;
      }
      await doSubmit();
    } catch (e) {
      setSubmitError(
        isGatewayTimeoutError(e)
          ? "提交时网关超时：这次提交有没有被服务商收到还不确定，先不要连点；等十几秒后看下方记录，若刚才其实已提交成功，记录里会有它。"
          : `提交失败：${describeThrownError(e)}`,
      );
    } finally {
      setSubmitting(false);
    }
  };

  // 一键生成三比例（v5.06 提速 + 简化）：同一份通用主提示词、
  // 同一组参考图、同一风格/模型，一次点击并行提交 3 个独立任
  // 务（16:9 / 3:4 / 4:3），每个画幅只在提交副本上追加自己的
  // 适配句，并各落一条对应比例的封面记录、各自轮询。旧版是串
  // 行循环：每个比例都把参考图重新取一遍（大图还要再走一遍中
  // 转分片）、鉴权预检也逐个探，一个等一个——现在参考图只取
  // 一次（fetchCoverRefs）、预检只探一次，三个提交 Promise.all
  // 并行发出；中途某个比例失败不拦其余两个，结果逐比例列清
  // （失败原因读 submitCover 的返回值，各记各的）。二次确认
  // 已按用户要求去掉：按钮文案本身写明「3 个任务 · 3 次计
  // 费」，一次点击即提交——仍只由用户亲手点击触发，绝不自动。
  const runGenerateAllRatios = async () => {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    setBatchResults([]);
    const failAll = (msg: string) => {
      reportSubmitError(msg);
      setBatchResults(
        ALL_COVER_RATIOS.map((r) => ({
          ratio: r,
          ok: false,
          msg: `提交失败：${msg}`,
        })),
      );
    };
    try {
      // 三个比例共用的前置校验只做一次（与单张同口径）：没提示
      // 词 / 超字数线 / 没选模型时整批不发，不逐比例各报一遍。
      // v5.18：没提示词按选中版判定——选中版为空就整批不发并明
      // 确提示先填好这一版，绝不静默改投另一版。
      if (!submitPromptText) {
        failAll(selectedLangEmptyMessage());
        return;
      }
      if (batchPromptOver) {
        failAll(
          `提示词太长，这次没有提交：三份提交副本里最长的一份共 ${batchPromptLen} 字符，Geeknow 的上限是 ${GEEKNOW_PROMPT_HARD_LIMIT} 字符（本台安全线 ${SUBMIT_PROMPT_BUDGET}）。请删减提示词再生成。这次没有发出请求、不会计费。`,
        );
        return;
      }
      if (!model.trim()) {
        failAll("先选一个模型再生成");
        return;
      }
      // 参考图只取一次、三份共用；取图说明统一发布一次。
      const prepared = await fetchCoverRefs(refCharIds, true);
      if (prepared.gatePassed) publishRefNotes(prepared);
      // v5.16 ②：与单张同一道确认门——实际一张图都带不上、而提
      // 示词带人物约束时，先弹一次明确确认，确认后才整批按纯文
      // 字提交（三个比例共用这一次确认，不逐个弹）。
      if (
        prepared.referenceImages.length === 0 &&
        promptNeedsRefs(promptZh, promptEn)
      ) {
        setTextOnlyConfirm({
          detail: `${textOnlyDetail(prepared)}（三个比例都一样，都按纯文字提交）`,
          proceed: async () => {
            await continueBatchAfterRefs(prepared, failAll);
          },
        });
        return;
      }
      await continueBatchAfterRefs(prepared, failAll);
    } catch (e) {
      setSubmitError(isGatewayTimeoutError(e) ? "一键三比例提交时网关超时：已提交成功的比例会在下方记录里出现，先不要重复点一键生成，避免重复计费。" : `一键三比例失败：${describeThrownError(e)}`);
    } finally {
      setSubmitting(false);
    }
  };

  // v5.16 ② 从 runGenerateAllRatios 拆出：取图之后的部分（预检一
  // 次 + 三比例并行提交）——无图确认弹窗点「确认」后从这里续跑，
  // 与直接提交走同一份代码，不复制两套。
  const continueBatchAfterRefs = async (
    prepared: PreparedCoverRefs,
    failAll: (msg: string) => void,
  ): Promise<void> => {
    try {
      // 鉴权预检只探一次：明确被拒就整批拦下（三个比例同一个答
      // 案，没必要各探一遍）；预检没查成不拦，照常并行提交。
      const probe = await runProbe();
      if (probe && probe.ok && !probe.authOk) {
        failAll(probeFailText(probe));
        return;
      }
      // 三个比例并行提交：互不等待、互不拖累。
      const settled = await Promise.all(
        ALL_COVER_RATIOS.map(async (r) => {
          try {
            const res = await submitCover({
              usePromptZh: promptZh.trim() ? withRatioAdapter(promptZh, r, "zh") : promptZh,
              usePromptEn: promptEn.trim() ? withRatioAdapter(promptEn, r, "en") : promptEn,
              useLang: submitLang,
              usePlan: plan,
              useRatio: r,
              useStyleId: styleId,
              useStyleName: style.label,
              withRefs: true,
              preparedRefs: prepared,
              skipProbe: true,
            });
            return {
              ratio: r,
              ok: res.ok,
              msg: res.ok
                ? "已提交，进度看下方记录"
                : `提交失败：${res.error ?? "原因见上方报错"}`,
            };
          } catch (e) {
            return {
              ratio: r,
              ok: false,
              msg: `提交失败：${isGatewayTimeoutError(e) ? "网关超时，有没有被服务商收到还不确定，先看下方记录、不要重复点" : describeThrownError(e)}`,
            };
          }
        }),
      );
      setBatchResults(settled);
    } catch (e) {
      setSubmitError(isGatewayTimeoutError(e) ? "一键三比例提交时网关超时：已提交成功的比例会在下方记录里出现，先不要重复点一键生成，避免重复计费。" : `一键三比例失败：${describeThrownError(e)}`);
    } finally {
      setSubmitting(false);
    }
  };

  // 失败 / 失效记录的重新生成：二次确认后才走，一个新任务、重新
  // 计费；沿用该记录自己的提示词、比例与风格。
  // v3.89 修复：旧版这里写死不带参考图，可记录的提示词里有硬约束
  // 「人物外貌与服装以随附的人物资产图为准」——没图时上游模型不
  // 出图、只回一段文字「请上传…角色参考图」，被 Geeknow 包成
  // HTTP 400 upstream_text_reply 判失败（真机实录）。现在按记录
  // 存下的方案（analysisJson）里的封面人物名单、照分析时的同一
  // 口径重新匹配当前项目里有资产图的人物（名单顺序、最多
  // MAX_COVER_REF_IMAGES 位）
  // 一起带上；记录没有方案（手动提示词）时用页面当前勾选。
  // v5.04：名单→人物的匹配改走 resolvePlanCharacter 三层解析
  // （旧版按卡名逐字比对，代号卡对真名名单一位都配不上、重提
  // 会带 0 张参考图）。v5.08：再升级为 resolvePlanCharForPlan
  // （名字三层 + 消元兜底）并按卡去重，理由见下方实现处。
  // v4.22：方案名单一位都匹配不到图、或用户没勾图床同意时不再
  // 拦下——交给 submitCover 自动降级（去掉约束句、纯文字提交）。
  const resubmitRecord = async (rec: CoverRecord) => {
    if (submitting) return;
    setConfirmResubmitId(null);
    setSubmitting(true);
    setSubmitError(null);
    try {
      let recPlan: CoverPlan | null = null;
      if (rec.analysisJson) {
        try {
          recPlan = { ...EMPTY_PLAN, ...(JSON.parse(rec.analysisJson) as CoverPlan) };
        } catch {
          recPlan = null;
        }
      }
      const planNames = recPlan?.mainCharacters ?? [];
      // v5.09：重提匹配走名字三层 + 消元兜底解析并按卡去重——旧口径下项目
      // 39 这类记录会把「小帅」「小帅的妈妈」都配到 B、同一张
      // 图提交两次、D 女孩配不到图。
      const matchedRefIds: number[] = [];
      if (planNames.length > 0) {
        for (const name of planNames) {
          const card = resolvePlanCharForPlan(recPlan, name, charsWithImage);
          if (card && !matchedRefIds.includes(card.id)) {
            matchedRefIds.push(card.id);
          }
          if (matchedRefIds.length >= MAX_COVER_REF_IMAGES) break;
        }
      }
      // 有方案名单时只认名单匹配，绝不拿页面随手勾的名单外人物
      // 顶替——顶替了，封面人物就不是这条记录的人物了。名单一位
      // 都没对上（图被删 / 改名）时 useRefIds 为空，submitCover
      // 会自动降级纯文字提交、不再拦下（v4.22）。没有方案名单
      // （手动提示词记录）才用页面当前勾选。
      const useRefIds =
        planNames.length > 0
          ? matchedRefIds
          : refCharIds
              .filter((id) => charsWithImage.some((c) => c.id === id))
              .slice(0, MAX_COVER_REF_IMAGES);
      const { ok } = await submitCover({
        usePromptZh: rec.promptZh,
        usePromptEn: rec.promptEn,
        usePlan: recPlan,
        useRatio: (["16:9", "3:4", "4:3"].includes(rec.ratio)
          ? rec.ratio
          : "3:4") as "16:9" | "3:4" | "4:3",
        useStyleId: rec.styleId,
        useStyleName: rec.styleName,
        withRefs: useRefIds.length > 0,
        refCharIdsOverride: useRefIds,
      });
      if (ok) {
        // 实际带上图 = 有可匹配的参考图且已勾图床同意；有名单图
        // 但没勾同意时 submitCover 已自动降级，提示按降级说。
        const broughtRefs = useRefIds.length > 0 && refHostConsent;
        setRecMsg(
          rec.id,
          broughtRefs
            ? planNames.length > 0
              ? `已按这条记录的设置重新提交了一个新任务，并带上 ${useRefIds.length} 位人物的参考图（按记录方案的封面人物名单重新匹配，副本按你的同意临时上传公开图床换链接）：新任务在记录列表最上面，独立计费、独立轮询；这条旧记录保留作历史。`
              : `已按这条记录的设置重新提交了一个新任务，并带上页面当前勾选的 ${useRefIds.length} 位人物的参考图（这条记录没有存封面方案，副本按你的同意临时上传公开图床换链接）：新任务在记录列表最上面，独立计费、独立轮询；这条旧记录保留作历史。`
            : useRefIds.length > 0
              ? "已按这条记录的设置重新提交了一个新任务：你还没勾选参考图区的公开图床同意，这次没带参考图，已自动去掉提示词里的人物约束、按纯文字提交（降级原因见第三步上方的黄色提醒）：新任务在记录列表最上面，独立计费、独立轮询；这条旧记录保留作历史。"
              : "已按这条记录的设置重新提交了一个新任务（这条记录没有可带的人物参考图，按纯提示词提交）：新任务在记录列表最上面，独立计费、独立轮询；这条旧记录保留作历史。",
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

  const downloadRecord = async (rec: CoverRecord) => {
    if (!rec.imageUrl || downloadingId === rec.id) return;
    setDownloadingId(rec.id);
    try {
      const r = await downloadOriginalImage(
        rec.imageUrl,
        `${project.name}封面_${rec.title || "未命名"}`,
      );
      setRecMsg(
        rec.id,
        `已无损下载原图：${r.filename}（${formatByteSize(r.sizeBytes)}，原图字节原样保存，未压缩、未转格式）`,
      );
    } catch (e) {
      setRecMsg(
        rec.id,
        `下载失败：${e instanceof Error ? e.message : "请重试"}（原图还在记录里，没有改动）`,
      );
    } finally {
      setDownloadingId(null);
    }
  };

  // 一键导出三个比例（v3.91 改打包下载）：每个比例取记录列表里
  // 最新一条「已出图」的（列表按新到旧排，find 命中的第一条即
  // 最新），三张原图并行取回后打成一个 ZIP、只触发一次下载。
  // 为什么不再逐个下：浏览器会把程序逐个触发的第 2、第 3 次下载
  // 当作「自动下载」拦下且不吭声，旧版就会出现页面报已导出、实际
  // 只落 1 张甚至 0 张（用户实报「无法下载图片」）。打包成一个
  // 文件只下一次，从根上绕开拦截；ZIP 是 stored 直存，解开后每
  // 张仍是原图字节原样（不压缩、不转格式），包内文件名带比例
  // 后缀（16x9 / 3x4 / 4x3）不会互相覆盖。缺的比例跳过并点名；
  // 取回失败的比例写清真实原因（不再吞掉），其余照常打包。
  const exportAllRatios = async () => {
    if (exportingAll) return;
    setExportingAll(true);
    setExportAllMsg(null);
    try {
      const missing: string[] = [];
      const targets: { ratio: string; rec: CoverRecord }[] = [];
      for (const r of ALL_COVER_RATIOS) {
        const rec = records.find(
          (x) => x.ratio === r && x.status === "done" && x.imageUrl,
        );
        if (!rec) missing.push(r);
        else targets.push({ ratio: r, rec });
      }
      if (targets.length === 0) {
        setExportAllMsg(
          "三个比例目前都还没有已出图的封面，先生成任意比例出图后再来导出。",
        );
        return;
      }
      // 三张并行取回（不再串行逐个等），取回失败的那张不拖累其余。
      const settled = await Promise.all(
        targets.map(async (t) => {
          try {
            const got = await fetchOriginalImageBytes(
              t.rec.imageUrl!,
              `${project.name}封面_${t.rec.title || "未命名"}_${t.ratio.replace(":", "x")}`,
            );
            return { ok: true as const, ratio: t.ratio, got };
          } catch (e) {
            return {
              ok: false as const,
              ratio: t.ratio,
              reason: e instanceof Error ? e.message : String(e),
            };
          }
        }),
      );
      const okList = settled.filter(
        (s): s is Extract<(typeof settled)[number], { ok: true }> => s.ok,
      );
      const failed = settled.filter(
        (s): s is Extract<(typeof settled)[number], { ok: false }> => !s.ok,
      );
      const parts: string[] = [];
      if (okList.length > 0) {
        const zip = buildStoredZip(
          await Promise.all(
            okList.map(async (s) => ({
              filename: s.got.filename,
              bytes: new Uint8Array(await s.got.blob.arrayBuffer()),
            })),
          ),
        );
        const zipName = downloadZipBlob(
          zip,
          `${project.id}-${project.name}封面_三比例无损原图`,
        );
        const totalBytes = okList.reduce((sum, s) => sum + s.got.sizeBytes, 0);
        parts.push(
          `已把 ${okList.length} 个比例的无损原图打包成一个文件下载：${zipName}（内含 ${okList
            .map((s) => `${s.ratio} → ${s.got.filename}`)
            .join("；")}，共 ${formatByteSize(totalBytes)}；ZIP 是直存打包，解开后每张都是原图字节原样、未压缩未转格式）。若这次下载仍被浏览器拦下，请在浏览器里允许本站点下载文件后重试。`,
        );
      }
      if (missing.length > 0) {
        parts.push(
          `缺 ${missing.join("、")}：这${missing.length > 1 ? "些" : "个"}比例还没有已出图的记录，已跳过——先生成出图后再导出。`,
        );
      }
      if (failed.length > 0) {
        parts.push(
          `没打进包的：${failed
            .map((f) => `${f.ratio}（${f.reason}）`)
            .join("；")}——可到对应记录上单独点「无损下载原图」重试。`,
        );
      }
      setExportAllMsg(parts.join(" "));
    } finally {
      setExportingAll(false);
    }
  };

  const deleteRecord = async (rec: CoverRecord) => {
    pollingRef.current.delete(rec.id);
    try {
      await api.deleteCoverRecord({ id: rec.id });
      await invalidateRecords();
    } catch {
      setRecMsg(rec.id, "记录没删掉，请重试");
    }
  };

  // v5.16 ①：记录行「本次带图 N 张：A、B…」里的人物标签——按记录
  // 存下的人物卡 id 回查当前项目人物卡（代号 + 称呼）；卡已删 /
  // 查不到时退回 #id，不猜。
  const refCharLabels = (rec: CoverRecord): string[] =>
    (rec.refCharIds ?? []).map((id) => {
      const c = project.characters.find((x) => x.id === id);
      if (!c) return `#${id}`;
      const alias = aliasByCode.get(c.name) ?? "";
      return alias ? `${c.name}（${alias}）` : c.name;
    });

  const labelCls = "mb-1 block text-xs font-bold text-[var(--dim)]";
  // v3.90 签名覆盖度在方案编辑区实时现算（与服务端同一份实现）：
  // 用户改方案字段后，签名跟不跟得上立刻可见，不等重拼才发现回退。
  const liveCoverage = plan ? signatureCoverage(plan) : null;
  const planField = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    opts: { multiline?: boolean; placeholder?: string; ariaLabel: string },
  ) => (
    <div>
      <span className={labelCls}>{label}</span>
      {opts.multiline ? (
        <textarea
          className="field"
          rows={2}
          value={value}
          aria-label={opts.ariaLabel}
          placeholder={opts.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          className="field"
          value={value}
          aria-label={opts.ariaLabel}
          placeholder={opts.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );

  return (
    <div className="cover-bench mt-3 flex flex-col gap-2.5 lg:h-[calc(100dvh-292px)] lg:min-h-[500px]">
      {/* v5.12 单屏固定页：页眉压成一行；桌面端三栏同屏排布、整页
          不滚动，各栏内部紧凑、超长时只在栏内滚动；小屏纵向堆叠、
          每栏限高栏内滚动，页面整体不拉长。 */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-0.5">
        <p className="font-display text-lg font-bold leading-6">封面生成</p>
        <p className="text-xs leading-5 text-[var(--dim)]">
          当前项目「{project.name}」· 只有点生成按钮才会提交生图并计费（Geeknow）。
        </p>
      </div>
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[330px_minmax(0,1fr)_minmax(0,1.08fr)]">

      {/* ---- 第一步：风格 + 比例 + 模型（左栏） ---- */}
      <section
        className="cover-panel card space-y-3 overflow-y-auto max-lg:max-h-[74dvh]"
        aria-label="第一步 · 封面风格与画幅（风格与设置）"
      >
        <p className="text-sm font-bold">第一步 · 封面风格与画幅</p>
        <div className="grid gap-3">
          <div>
            <label className={labelCls} htmlFor="cover-style-select">
              封面风格
            </label>
            <select
              id="cover-style-select"
              className="field field-sm"
              value={styleId}
              onChange={(e) => {
                const nextId = e.target.value;
                setStyleId(nextId);
                // v3.93 锁定版式的风格（风格2/3）：已有方案直接跟
                // 着切到该风格的固定版式，不留串味的 VS 版式。
                const nextStyle = coverStyleById(nextId);
                if (plan && nextStyle.forceLayout) {
                  setPlan({ ...plan, layoutType: nextStyle.forceLayout });
                }
              }}
              aria-label="选择封面风格"
            >
              {COVER_STYLES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs leading-5 text-[var(--dim)]">
              {style.shortDesc}。
            </p>
            {/* v4.23 风格参照图：三款风格各一张小缩略图紧挨风格选择
                排布，点任意一张在页内弹层看大图（不开新标签页）；
                当前选中的风格缩略图带电光蓝描边。缩略图只做参照
                展示，不改变下拉的选择逻辑。 */}
            <div
              className="mt-2 grid grid-cols-5 gap-1.5"
              role="group"
              aria-label="封面风格参照图（点击看大图）"
            >
              {COVER_STYLES.map((s) => {
                const ref = STYLE_REFERENCES[s.id];
                if (!ref) return null;
                const selected = s.id === styleId;
                return (
                  <button
                    key={s.id}
                    type="button"
                    className="flex flex-col items-center gap-0.5"
                    aria-label={`预览${s.label}参照图《${ref.title}》大图`}
                    title={`${s.label}参照图：《${ref.title}》`}
                    onClick={() => setRefLightboxStyleId(s.id)}
                  >
                    <img
                      src={ref.thumbSrc}
                      alt={`${s.label}参照图《${ref.title}》缩略图`}
                      className="h-[46px] w-full rounded-md object-cover"
                      style={{
                        border: selected
                          ? "2px solid var(--accent)"
                          : "1px solid var(--border)",
                      }}
                      loading="lazy"
                    />
                    <span
                      className="text-center text-[9px] leading-3"
                      style={{ color: selected ? "var(--text)" : "var(--dim)" }}
                    >
                      {s.shortNameZh}参照
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <span className={labelCls}>封面比例</span>
            <div className="seg seg-sm" role="group" aria-label="封面比例选择">
              {RATIO_OPTIONS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  aria-pressed={ratio === r.value}
                  aria-label={`封面比例 ${r.label}（${r.hint}）`}
                  onClick={() => setRatio(r.value)}
                >
                  {r.label} · {r.hint}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className={labelCls} htmlFor="cover-model-select">
              生图模型
            </label>
            <select
              id="cover-model-select"
              className="field field-sm"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              aria-label="选择封面生图模型"
            >
              {modelOptions.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            {modelsQuery.data && !modelsQuery.data.connected && (
              <p className="mt-1 text-xs leading-5" style={{ color: "var(--bad)" }}>
                Geeknow 未连接：{modelsQuery.data.error ?? "请先重新连接 Geeknow 再生成"}
              </p>
            )}
            {modelsQuery.data?.connected && customKey.trim() && (
              <p className="mt-1 text-xs leading-5 text-[var(--dim)]">
                模型列表能拉到，说明已连接凭证是好的；但你在下面填了自己的 Key，本次提交会改用它——它能不能用，点下方「检测当前填写」测一次就知道，点「生成封面」时也会先自动预检。
              </p>
            )}
          </div>
          <div>
            <label className={labelCls} htmlFor="cover-quality-select">
              清晰度
            </label>
            <select
              id="cover-quality-select"
              className="field field-sm"
              value={quality}
              onChange={(e) =>
                setQuality(e.target.value as "max" | "high" | "standard")
              }
              aria-label="选择封面清晰度"
            >
              <option value="standard">标准</option>
              <option value="high">高清</option>
              <option value="max">最高（4K 档）</option>
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="cover-api-key">
              Key（可不填）
            </label>
            <input
              id="cover-api-key"
              type="password"
              className="field field-sm"
              value={customKey}
              autoComplete="off"
              placeholder="留空 = 用已连接的 Geeknow 凭证"
              aria-label="自定义 Key（密码框，可不填；填了当次提交优先使用，永不明文显示）"
              onChange={(e) => {
                setCustomKey(e.target.value);
                setProbeMsg(null);
              }}
            />
            <p className="mt-1 text-xs leading-5 text-[var(--dim)]">
              只留在本次页面内存里，不保存；填了本次优先用它，不填先用总设置、再走已连接凭证。
            </p>
          </div>
          <div>
            <label className={labelCls} htmlFor="cover-api-base">
              API 地址
            </label>
            <input
              id="cover-api-base"
              type="text"
              className="field field-sm"
              value={apiBase}
              autoComplete="off"
              placeholder="https://api.geeknow.top"
              aria-label="API 地址（默认为当前已连接地址，可改为其他线路地址）"
              onChange={(e) => {
                setApiBase(e.target.value);
                setProbeMsg(null);
              }}
            />
            <p className="mt-1 text-xs leading-5 text-[var(--dim)]">
              默认当前已连接地址；换其他域名必须同时填该线路的 Key；这个框保持默认地址时，总设置里填的地址先生效。
            </p>
          </div>
        </div>

        {/* v5.70 当前生效来源：单次输入 > 总设置 > 已连接凭证，一眼
            看清这次封面生成走哪份设置（不露 Key）。总设置本身只在
            顶部「生图」面板里维护，这里不另设一份。 */}
        <p className="text-xs leading-5" role="status">
          <span className="font-bold" style={{ color: "var(--olive)" }}>
            {coverResolved.sourceLabel}
          </span>
          <span className="text-[var(--dim)]">
            。上面两个框是封面页单次输入：填了只对本次提交优先、刷新就没了，也不会改总设置；不填时用「生图接口总设置」（在顶部「生图」面板里，填一次生图面板和封面生成都用），总设置也没填才走已连接凭证。
          </span>
        </p>

        {/* v3.84 只读鉴权预检：手动检测当前实际会生效的配置 */}
        <div className="flex flex-wrap items-start gap-2">
          <button
            type="button"
            className="btn btn-sm"
            disabled={probing}
            aria-label="检测当前 Key 与 API 地址能否通过 Geeknow 鉴权（只读预检，不提交生图、不计费）"
            onClick={() => void runManualProbe()}
          >
            {probing ? "检测中…" : "检测当前填写（只读预检）"}
          </button>
          <span className="flex-1 text-xs leading-5 text-[var(--dim)]" style={{ minWidth: 220 }}>
            用当前生效配置探一次鉴权（不存在的模型名，不建任务、不计费）；生成时也会先自动预检。
          </span>
        </div>
        {probeMsg && (
          <p
            className="text-sm leading-6"
            style={{ color: probeBad ? "var(--bad)" : "var(--olive)" }}
            role="status"
          >
            {probeMsg}
          </p>
        )}

        {/* 风格规则：所选风格的分析与主特点，逐条可看 */}
        <div
          className="rounded-[var(--radius)] border p-3"
          style={{ borderColor: "var(--border)", background: "var(--surface-alt)" }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-bold">{style.label} · 风格规则</p>
            <button
              type="button"
              className="btn btn-sm"
              aria-expanded={showTraits}
              aria-label={showTraits ? "收起风格主特点" : "展开风格主特点（参考图分析）"}
              onClick={() => setShowTraits((v) => !v)}
            >
              {showTraits ? "收起主特点" : "看主特点（参考图分析）"}
            </button>
          </div>
          <p className={showSummary ? "mt-1 text-[13px] leading-5" : "mt-1 line-clamp-3 text-[13px] leading-5"}>{style.analysisSummary}</p>
          <button
            type="button"
            className="btn btn-sm mt-1"
            aria-expanded={showSummary}
            aria-label={showSummary ? "收起风格规则摘要" : "展开风格规则摘要全文"}
            onClick={() => setShowSummary((v) => !v)}
          >
            {showSummary ? "收起摘要" : "展开摘要全文"}
          </button>
          {showTraits && (
            <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm leading-6">
              {style.traits.map((t) => (
                <li key={t.title}>
                  <strong>{t.title}</strong>——{t.body}
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>

      {/* ---- 第二步：复制剧本代码（v5.10 起封面分析走聊天框，中栏） ---- */}
      <section
        className="cover-panel card space-y-3 overflow-y-auto max-lg:max-h-[74dvh]"
        aria-label="第二步 · 复制剧本代码与人物参考图（复制与参考）"
      >
        <p className="text-sm font-bold">第二步 · 复制剧本代码，去聊天框分析封面</p>
        {!canAnalyse && (
          <p className="text-sm leading-6" style={{ color: "var(--bad)" }} role="note">
            这个项目还没有大纲也没有剧本，没法拼剧本摘要：先到「人物与大纲」写大纲、或到「剧本审查」生成剧本，再回来复制。
          </p>
        )}
        {analyzing && (
          <GenProgress
            stage="正在取回上次没跑完的封面分析结果"
            completed={0}
            total={0}
            indeterminate
            ariaLabel="封面分析进度"
          />
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void copyCoverDigest()}
            disabled={!canAnalyse}
            aria-label="复制封面分析用剧本摘要（剧本代码）到剪贴板"
          >
            复制剧本代码
          </button>
          {copyDigestState === "done" && (
            <span
              className="text-sm leading-6 font-bold"
              style={{ color: "var(--olive)" }}
              role="status"
            >
              已复制 ✓ 去聊天框粘贴发给助手，助手分析出封面提示词后，粘回第三步的提示词框点生成。
            </span>
          )}
          {copyDigestState === "failed" && (
            <span
              className="text-sm leading-6"
              style={{ color: "var(--bad)" }}
              role="alert"
            >
              复制没成功：请再点一次；还是不行，检查一下浏览器有没有拦剪贴板。
            </span>
          )}
          <span className="text-xs leading-5 text-[var(--dim)]">
            摘要只定站位与标题；人物面部与造型以资产图为准、绝不更改。
          </span>
        </div>
        <details className="help-fold">
          <summary>摘要里有什么 · 形象口径</summary>
          <div className="help-fold-body">
            复制的是封面分析用剧本摘要：项目与剧本标题、已选风格、梗概、人物（代号、称呼、身份、参考图编号）、主梗与关键事件、关键场景、核心道具——不含分镜逐拍和全部台词。人物身份已清洗：只留纯身份，混在身份里的造型与穿戴词（如玩偶形象、红袖章）会被剔掉；摘要不附图、聊天里看不到资产图，只定站位与标题——封面人物的面部特征与整体造型以你的人物资产图为准、绝不更改，穿搭默认按资产图、场景需要时可调整。
          </div>
        </details>
        {analyseError && (
          <p className="text-sm leading-6" style={{ color: "var(--bad)" }} role="alert">
            {analyseError}
          </p>
        )}
        {analyseNote && (
          <p className="text-sm leading-6" style={{ color: "var(--olive)" }} role="status">
            {analyseNote}
          </p>
        )}

        {plan && (
          <div className="space-y-3">
            {/* v5.06 简化：默认只留一行方案摘要 + 展开入口，逐项编
                辑（版式 / 标题 / 人物站位 / 标题位置 / 标题风格）收进
                展开区——走默认路径的人不用再翻一长串输入框；要改
                点开即可，字段一个没删。 */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm leading-6" role="status">
                封面标题：<strong>{plan.mainTitle || "（未定）"}</strong>
                {plan.mainCharacters.length > 0
                  ? ` · 上封面人物：${plan.mainCharacters.join("、")}`
                  : ""}
              </span>
              <button
                type="button"
                className="btn btn-sm"
                aria-expanded={planDetailsOpen}
                aria-label={planDetailsOpen ? "收起封面方案细节" : "展开封面方案细节（改版式、标题、人物站位、标题位置、标题风格）"}
                onClick={() => setPlanDetailsOpen((v) => !v)}
              >
                {planDetailsOpen ? "收起方案细节" : "展开方案细节（可改）"}
              </button>
            </div>
            {planDetailsOpen && (
            <>
            {style.forceLayout ? (
              <p className="text-sm leading-6 text-[var(--dim)]">
                版式：单句钩子标题（本风格固定版式，不用 VS 对抗）
              </p>
            ) : (
            <div>
              <span className={labelCls}>版式</span>
              <div className="seg" role="group" aria-label="封面版式选择">
                <button
                  type="button"
                  aria-pressed={plan.layoutType === "vs"}
                  aria-label="版式：VS 对抗（左右两阵营对撞）"
                  onClick={() =>
                    setPlan({
                      ...plan,
                      layoutType: "vs",
                      mainTitle:
                        plan.sideA && plan.sideB
                          ? `${plan.sideA} VS ${plan.sideB}`
                          : plan.mainTitle,
                    })
                  }
                >
                  VS 对抗
                </button>
                <button
                  type="button"
                  aria-pressed={plan.layoutType === "slogan"}
                  aria-label="版式：单句钩子标题"
                  onClick={() => setPlan({ ...plan, layoutType: "slogan" })}
                >
                  单句钩子标题
                </button>
              </div>
            </div>
            )}
            {plan.layoutType === "vs" ? (
              <div className="grid gap-3 md:grid-cols-2">
                {planField("左阵营（标题左半 · 黄色）", plan.sideA, (v) =>
                  setPlan({
                    ...plan,
                    sideA: v,
                    mainTitle: `${v} VS ${plan.sideB}`,
                  }),
                { ariaLabel: "封面左阵营短名" })}
                {planField("右阵营（标题右半 · 冰蓝色）", plan.sideB, (v) =>
                  setPlan({
                    ...plan,
                    sideB: v,
                    mainTitle: `${plan.sideA} VS ${v}`,
                  }),
                { ariaLabel: "封面右阵营短名" })}
              </div>
            ) : (
              planField("主标题（单句钩子）", plan.mainTitle, (v) =>
                setPlan({ ...plan, mainTitle: v }),
              { ariaLabel: "封面主标题" })
            )}
            <div className="grid gap-3 md:grid-cols-2">
              {planField(
                "副标题（仅两层标题的风格用：木牌 / 纸条上的那句，属标题本身；其他风格留空）",
                plan.subtitle,
                (v) => setPlan({ ...plan, subtitle: v }),
                { ariaLabel: "封面副标题" },
              )}
              {planField(
                "上封面人物（逗号分隔，只能是人物表里的人）",
                plan.mainCharacters.join("、"),
                (v) =>
                  setPlan({
                    ...plan,
                    mainCharacters: v
                      .split(/[、,，]/)
                      .map((s) => s.trim())
                      .filter(Boolean),
                  }),
                { ariaLabel: "上封面人物名单" },
              )}
            </div>
            {planField(
              "人物站位（一行一位，写成「名字，位置」；只写站哪里，不写长相穿搭——长相穿搭以参考图为准）",
              plan.characterPositions
                .map((cp) => `${cp.name}，${cp.position}`)
                .join("\n"),
              (v) =>
                setPlan({
                  ...plan,
                  characterPositions: v
                    .split("\n")
                    .map((x) => x.trim())
                    .filter(Boolean)
                    .map((line) => {
                      const m = line.match(/^(.+?)[，,、：:]\s*(.+)$/);
                      return m
                        ? {
                            name: (m[1] ?? "").trim(),
                            position: (m[2] ?? "").trim(),
                          }
                        : { name: line, position: "" };
                    })
                    .filter((cp) => cp.name),
                }),
              { multiline: true, ariaLabel: "封面人物站位" },
            )}
            <div className="grid gap-3 md:grid-cols-2">
              {planField("标题位置（标题放在画面哪里）", plan.titlePosition, (v) =>
                setPlan({ ...plan, titlePosition: v }),
              { ariaLabel: "封面标题位置" })}
              {planField("标题风格（字体、颜色、大小、描边、特效）", plan.titleStyle, (v) =>
                setPlan({ ...plan, titleStyle: v }),
              { ariaLabel: "封面标题风格" })}
            </div>
            {/* v5.09 三样完整度：站位 / 标题位置 / 标题风格齐不齐，改方案时实时现算（与服务端同一份实现） */}
            <div
              className="rounded-[var(--radius)] border p-3 text-sm leading-6"
              style={{ borderColor: "var(--border)", background: "var(--surface-alt)" }}
            >
              <p className="font-bold">
                分析三样完整度{" "}
                {liveCoverage ? `${Math.round(liveCoverage.score * 100)}%` : "—"}
                （人物站位、标题位置、标题风格；长相穿搭以参考图为准，方案里不写）
              </p>
              {liveCoverage && liveCoverage.missing.length > 0 ? (
                <p className="mt-1" style={{ color: "var(--bad)" }} role="note">
                  还没定齐：{liveCoverage.missing.join("、")}——在上面补上后点「按当前方案重新拼提示词」。
                </p>
              ) : (
                <p className="mt-1 text-[var(--dim)]">三样都定齐了。</p>
              )}
            </div>
            <button
              type="button"
              className="btn"
              onClick={rebuildPrompts}
              aria-label="按当前方案、所选风格与比例重新拼封面提示词"
            >
              按当前方案重新拼提示词
            </button>
            </>
            )}
          </div>
        )}

        {/* 人物参考图 */}
        <div>
          <span className={labelCls}>人物参考图 · 与封面人物名单一一对应（有图人物都可选，按顺序提交）</span>
          {charsWithImage.length === 0 ? (
            <p className="text-sm leading-6 text-[var(--dim)]">
              本项目还没有带资产图的人物：人物参考图这边带不上图，提交时会自动去掉提示词里的「以随附的人物资产图为准」约束、按纯文字生成（封面人物只能按文字画）。想让封面人物与资产图是同一个人，先到「人物与大纲」给人物补上资产图再回来选参考图；也可以直接在第三步提示词下方的「上传参考图片」上传图片带上图。
            </p>
          ) : (
            <>
            <label
              className="mb-2 flex cursor-pointer items-start gap-2 rounded-[var(--radius)] border p-2 text-xs leading-5"
              style={{ borderColor: "var(--border)", background: "var(--surface-alt)" }}
            >
              <input
                type="checkbox"
                className="mt-1.5 h-4 w-4 shrink-0"
                checked={refHostConsent}
                onChange={(e) => applyRefHostConsent(e.target.checked)}
                aria-label="同意把所选参考图的副本临时上传到公开图床uguu.se换取链接（带参考图生成必须勾选，会按项目记住，刷新后仍有效）"
              />
              <span>
                <span className="font-bold">同意上传参考图副本换链接（带参考图生成先勾这里）：</span>
                Geeknow 只收 https 图片链接、本站图片它读不到。勾选后，点生成时所选参考图的降采样副本（最长边 1024px，库里原图不动）会被临时上传到公开图床 uguu.se 换成链接、再交给 Geeknow——<span className="font-bold">任何拿到这个链接的人都能打开这张图</span>；文件是临时托管，短期后由图床自动删除。勾选会按这个项目记住：以后打开这个项目的封面页默认就是已同意，刷新不用重勾；你可以随时取消勾选，取消即清掉记忆。不勾选也不会拦下生成：点生成时会先弹一次确认，确认后自动去掉提示词里的「以随附的人物资产图为准」约束、按纯文字生成。
              </span>
            </label>
            <p className="mb-2 text-xs leading-5" role="status" style={{ color: refHostConsent ? "var(--olive)" : "var(--dim)" }}>
              当前图床同意状态：{refHostConsent ? "已同意（已按项目记住，刷新后仍有效）" : "未同意——不勾的话，点生成时会先确认、确认后按纯文字生成"}。
              {refHostConsent && (
                <button
                  type="button"
                  className="btn btn-sm ml-2"
                  aria-label="清除这个项目的图床同意记忆（同时取消勾选）"
                  onClick={() => applyRefHostConsent(false)}
                >
                  清除这个项目的同意记忆
                </button>
              )}
            </p>
            {refCharIds.length > 0 && !refHostConsent && (
              <p className="mb-2 text-xs leading-5 text-[var(--dim)]" role="note">
                已选 {refCharIds.length} 位参考图，但还没勾上面的同意：现在点「生成封面」会先弹一次确认，确认后按纯文字降级（不上传任何图片、自动去掉约束句）；要带参考图，先勾同意。
              </p>
            )}
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold" role="status">已选参考图 {refCharIds.length} 位</span>
              <button type="button" className="btn btn-sm" aria-label="按封面人物名单选用参考图（与上方上封面人物一一对应）" onClick={() => {
                const names = plan?.mainCharacters ?? [];
                // v5.09：与分析自动勾选同一口径（名字三层 + 消元兜底，按卡去重）。
                const matched: number[] = [];
                for (const n of names) {
                  const card = resolvePlanCharForPlan(plan, n, charsWithImage);
                  if (card && !matched.includes(card.id)) matched.push(card.id);
                  if (matched.length >= MAX_COVER_REF_IMAGES) break;
                }
                if (matched.length) setRefCharIds(matched);
              }}>按封面人物选（推荐）</button>
              <button type="button" className="btn btn-sm" aria-label="全选有资产图的人物作为参考图" onClick={() => setRefCharIds(charsWithImage.slice(0, MAX_COVER_REF_IMAGES).map((c) => c.id))}>全选有图</button>
              <button type="button" className="btn btn-sm" aria-label="清空全部人物参考图（改用纯提示词生成）" onClick={() => setRefCharIds([])}>清空</button>
              <span className="text-xs leading-5 text-[var(--dim)]">顺序即提交顺序。</span>
            </div>
            {plan && plan.mainCharacters.length > 0 && (
              <p className="mb-2 text-xs leading-5 text-[var(--dim)]" role="note">
                封面人物名单：{effectivePlanNames.join("、")}。
                {extraRefNames.length > 0 && (
                  <span>（其中{extraRefNames.join("、")}不在原方案名单里，是你另选的参考人物，已一并算作封面人物。）</span>
                )}
              </p>
            )}
            <p className="mb-2 text-xs leading-5 text-[var(--dim)]" role="note">
              人物卡下方只显示清洗后的身份一行，仅页面展示用；卡片备注全文（含造型穿搭）不在这里展示、也不会进复制的剧本摘要——摘要里的人物行用的就是下面这份清洗后的身份。
            </p>
            <div className="grid gap-1.5">
              {charsWithImage.map((c) => {
                const checked = refCharIds.includes(c.id);
                const order = checked ? refCharIds.indexOf(c.id) + 1 : 0;
                // v5.04：在名单判定走三层解析后的卡 id 集合；已选
                // 参考本身也算封面人物（生效名单 = 方案 ∪ 已选）。
                const inPlan = planCardIds.has(c.id);
                const hasPlan = !!plan && plan.mainCharacters.length > 0;
                const alias = aliasByCode.get(c.name) ?? "";
                const cardTitle = alias ? `${c.name}（${alias}）` : c.name;
                // v5.11：卡面只显示与摘要同一份清洗后的身份一行，
                // 不再展示备注全文（备注含整套造型穿搭，看着像会
                // 被复制出去，实际 v5.10 也确实从身份原文漏过）。
                const identityLine = coverIdentityOf(c);
                return (
                  <div key={c.id} className="flex items-start gap-2.5 rounded-[var(--radius)] border p-1.5" style={{ borderColor: checked ? "var(--olive)" : "var(--border)", background: checked ? "var(--ok-soft)" : "var(--surface)" }}>
                    {c.imageUrl ? (
                      <PreviewImg
                        src={c.imageUrl}
                        previewSrc={c.imagePreviewUrl}
                        previewRef={{ kind: "character", characterId: c.id }}
                        onBackfilled={() =>
                          void queryClient.invalidateQueries({
                            queryKey: ["project", project.id],
                          })
                        }
                        alt={`人物资产图缩略图：${cardTitle}`}
                        className="h-12 w-9 shrink-0 rounded object-cover"
                      />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold">{cardTitle}{order ? <span className="ml-2 text-xs" style={{ color: "var(--olive)" }}>参考顺序 #{order}</span> : null}</p>
                      <p className="mt-0.5 flex flex-wrap gap-1 text-xs">
                        {hasPlan ? (inPlan ? <span className="font-bold" style={{ color: "var(--olive)" }}>● 封面人物（在名单里）</span> : checked ? <span className="font-bold" style={{ color: "var(--olive)" }}>● 封面人物（已选参考）</span> : <span className="text-[var(--dim)]">○ 不在封面名单里</span>) : <span className="text-[var(--dim)]">尚未分析封面名单</span>}
                        {!checked && inPlan ? <span style={{ color: "var(--bad)" }}>在名单里、但没选参考图：将按文字画，一致性弱</span> : null}
                      </p>
                      {identityLine ? <p className="mt-0.5 truncate text-xs text-[var(--dim)]" title={identityLine}>身份：{identityLine}</p> : null}
                      <button type="button" className="btn btn-sm mt-1" aria-pressed={checked} aria-label={`${checked ? "取消" : "选为"}人物参考图：${cardTitle}${inPlan ? "（封面人物）" : ""}`} onClick={() => setRefCharIds((prev) => prev.includes(c.id) ? prev.filter((id) => id !== c.id) : prev.length >= MAX_COVER_REF_IMAGES ? prev : [...prev, c.id])}>{checked ? "取消参考" : "选为参考图"}</button>
                    </div>
                  </div>
                );
              })}
            </div>
            {refCharIds.length >= MAX_COVER_REF_IMAGES && <p className="mt-1 text-xs text-[var(--dim)]">已达上限 {MAX_COVER_REF_IMAGES} 位（提交通道上限）：要换人先取消一位。</p>}
            </>
          )}
        </div>
      </section>

      {/* ---- 第三步：提示词 + 生成 + 封面记录（右栏） ---- */}
      <section
        className="cover-panel card space-y-3 overflow-y-auto max-lg:max-h-[74dvh]"
        aria-label="第三步 · 提示词与生成（提示词与生成、封面记录）"
      >
        <p className="text-sm font-bold">第三步 · 提示词与生成</p>
        {/* v5.81：封面页不做防版权拦截（用户定），v5.80 放在这里的
            开关已下线；防拦截只在分镜页管分镜提示词。 */}
        {/* v5.14：聊天分析草稿自动填入时亮明来源（草稿存在才出
            现；当前风格没草稿时不显示）。 */}
        {draftSourceNote && (
          <p
            className="text-xs leading-5"
            style={{ color: "var(--olive)" }}
            role="status"
          >
            {draftSourceNote}
          </p>
        )}
        {/* v5.10：原「方案三样已定齐……」分析方案状态行已删（封
            面分析改走聊天框、不再有工作台分析方案）；主稿 / 备查
            稿切换按钮保留，切换只换框里的现成稿，不重拼。 */}
        {(shortZh || detailZh) && (
          <div className="flex flex-wrap items-center gap-2">
            {promptView === "short" ? (
              <button
                type="button"
                className="btn btn-sm"
                aria-label="查看封面提示词备查稿（与主稿同文）"
                onClick={() => applyPromptView("full")}
              >
                查看备查稿
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-sm"
                aria-label="切回封面主提示词"
                onClick={() => applyPromptView("short")}
              >
                切回主稿
              </button>
            )}
          </div>
        )}
        {/* v5.18：生成语言单选——选中文就提交中文版、选 English
            就提交英文版，选中版即提交版；选择按项目记住（刷新
            不失效），从没选过时按老规矩默认。放在提示词展开入
            口正上方、收起态也常显，生成按钮就在下面不远。 */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold">生成用哪一版提示词</span>
          <div className="seg seg-sm" role="group" aria-label="封面生成提示词语言选择（选中的那一版就是提交给图片模型的那一版）">
            <button
              type="button"
              aria-pressed={submitLang === "zh"}
              aria-label="用中文提示词生成封面（选中后提交中文版）"
              onClick={() => applyPromptLang("zh")}
            >
              中文
            </button>
            <button
              type="button"
              aria-pressed={submitLang === "en"}
              aria-label="用英文提示词生成封面（Use English prompt）"
              onClick={() => applyPromptLang("en")}
            >
              English
            </button>
          </div>
          <span className="text-xs leading-5 text-[var(--dim)]">
            {promptLangChoice
              ? "已按这个项目记住你的选择：选哪版就提交哪版，另一版不会提交。"
              : "还没选过：先按老规矩默认（英文框有内容用英文版、否则中文版）；点一次选定后按项目记住。"}
          </span>
        </div>
        {/* v5.06 简化：中英文提示词默认收起——默认路径只留展开入
            口与字数结论，生成按钮就在下面；要核对代号 / 位置 /
            参考图绑定或亲手改词，点开即可，两框一字未删。超字数
            线的提醒留在收起态外，免得按钮置灰了找不到原因。 */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn btn-sm"
            aria-expanded={promptsOpen}
            aria-label={promptsOpen ? "收起封面提示词（中英文）" : "展开查看或编辑封面提示词（中英文）"}
            onClick={() => setPromptsOpen((v) => !v)}
          >
            {promptsOpen ? "收起提示词" : "查看 / 编辑提示词（中英文）"}
          </button>
          <span className="text-xs leading-5 text-[var(--dim)]">
            {submitPromptText
              ? `实际提交的提示词（${submitLang === "en" ? "英文" : "中文"}，含画幅适配句）共 ${submitPromptLen} 字符。`
              : "把聊天框里分析好的提示词粘贴进来；也可以展开自己写。"}
          </span>
        </div>
        {submitPromptText && (
          <p className="text-xs leading-5 text-[var(--dim)]" role="note">
            实际将提交：<span className="font-bold text-[var(--text)]">{submitLang === "en" ? "英文版" : "中文版"}提示词</span>
            {promptLangChoice
              ? `（按你选的语言提交${submitLang === "en" ? "英文" : "中文"}版，${submitLang === "en" ? "中文" : "英文"}框不会提交）`
              : submitLang === "en"
                ? "（还没手动选语言：英文框有内容，按老规矩默认提交英文版，中文框不会提交）"
                : "（还没手动选语言：英文框是空的，按老规矩默认提交中文版）"}
            {styleId === "evidence_reveal" && (
              <>
                ；风格 11 人物强化句（必须用随附图、人物缺一不可、绝不凭空画人）：
                {submitVersionHasReinforce
                  ? "这一版已包含，不会重复加"
                  : "这一版还没有——提交时会自动补上（只补一次）"}
              </>
            )}
            。
          </p>
        )}
        {/* v5.81：封面页不做防版权拦截，v5.80 的「提交时生效替换
            清单」一行已下线。 */}
        {/* v5.18：选中版为空、另一版有内容时常显点名——不点生成
            也先看得见，不会以为会提交另一版。 */}
        {!submitPromptText && (promptZh.trim() || promptEn.trim()) && (
          <p className="text-xs leading-5" style={{ color: "var(--bad)" }} role="note">
            当前选的是{submitLang === "en" ? "英文" : "中文"}版，但{submitLang === "en" ? "英文" : "中文"}提示词框是空的：先填好这一版再生成，不会自动改用{submitLang === "en" ? "中文" : "英文"}版。
          </p>
        )}
        {submitPromptOver && (
          <p className="text-sm leading-6" style={{ color: "var(--bad)" }} role="alert">
            提示词（含当前比例画幅适配句）共 {submitPromptLen} 字符，已超过 {SUBMIT_PROMPT_BUDGET} 字符的安全线：展开提示词删减、或在第二步展开方案细节后点「按当前方案重新拼提示词」，再生成。
          </p>
        )}
        {promptsOpen && (
        <>
        <div>
          <label className={labelCls} htmlFor="cover-prompt-zh">
            提示词（中文 · 通用主提示词，三比例共用）
          </label>
          <textarea
            id="cover-prompt-zh"
            className="field"
            rows={5}
            value={promptZh}
            aria-label="封面中文提示词"
            placeholder="把第二步复制的剧本代码在聊天框里分析好的封面提示词粘贴到这里（通用主提示词，不写死任何单一画幅）；也可以自己写。提交时按所选画幅自动追加适配句。"
            onChange={(e) => {
              promptTouchedStyleRef.current = styleId;
              setPromptZh(e.target.value);
            }}
          />
          <p className="mt-1 text-xs leading-5 text-[var(--dim)]">
            中文主提示词共 <span className="tc font-bold">{promptZh.length}</span> 字符
            （只写人物站位、标题与风格规则；长相穿搭以参考图为准）。
          </p>
        </div>
        <div>
          <label className={labelCls} htmlFor="cover-prompt-en">
            提示词（英文 · 通用主提示词，语言选 English 才提交这一版）
          </label>
          <textarea
            id="cover-prompt-en"
            className="field"
            rows={5}
            value={promptEn}
            aria-label="封面英文提示词"
            placeholder="English prompt (optional)"
            onChange={(e) => {
              enHandEditedRef.current = true;
              promptTouchedStyleRef.current = styleId;
              setPromptEn(e.target.value);
            }}
          />
          <p
            className="mt-1 text-xs leading-5"
            style={{ color: submitPromptOver ? "var(--bad)" : "var(--dim)" }}
            role={submitPromptOver ? "alert" : undefined}
          >
            {submitPromptLen > 0 ? (
              <>
                英文主提示词共{" "}
                <span className="tc font-bold">{promptEn.length}</span> 字符
                ；实际提交的提示词（{submitLang === "en" ? "英文" : "中文"}，含
                {ratio} 画幅适配句）共{" "}
                <span className="tc font-bold">{submitPromptLen}</span> 字符 ·
                Geeknow 上限 {GEEKNOW_PROMPT_HARD_LIMIT} 字符
                {submitPromptOver
                  ? `，已超过 ${SUBMIT_PROMPT_BUDGET} 字符的安全线：先删减再生成（优先删标题风格、人物站位里的长句，标题文字与风格规则别动），或点上方「按当前方案重新拼提示词」由系统按预算重拼；否则提交会被服务商以「提示词过长」拒绝。`
                  : "，在安全线内。"}
              </>
            ) : (
              <>提示词字数会显示在这里（Geeknow 上限 {GEEKNOW_PROMPT_HARD_LIMIT} 字符）。</>
            )}
          </p>
        </div>
        </>
        )}
        {/* v4.28 上传参考图片：就在提示词正下方。用户为这张封面直
            接上传的参考图（不限于人物资产图），与第二步的人物参
            考图一起提交：上传图优先、合计最多 MAX_COVER_REF_IMAGES
            张（v5.03 前写死 4 张）；同样要先勾
            图床同意（勾选在第二步参考图区；项目没有带图人物时
            第二步不渲染勾选，这里补同一份勾选）。只存本页内存，
            刷新即清空、不进项目与备份。 */}
        <div>
          <span className={labelCls}>上传参考图片（可选 · 和人物参考图一起提交，上传图优先，合计最多 {MAX_COVER_REF_IMAGES} 张）</span>
          <input
            ref={uploadRefInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            aria-label="选择要上传的参考图片（可多选图片文件）"
            onChange={(e) => {
              handleUploadRefFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn"
              aria-label="上传参考图片（从本机选图，可多选）"
              onClick={() => uploadRefInputRef.current?.click()}
              disabled={uploadedRefs.length >= MAX_COVER_REF_IMAGES}
            >
              ＋ 上传参考图片
            </button>
            <span className="text-sm font-bold" role="status">已上传 {uploadedRefs.length} 张</span>
            <span className="text-xs leading-5 text-[var(--dim)]">生成时上传图排在人物参考图前面提交；只在本页临时保留，刷新就清空、不存进项目。</span>
          </div>
          {uploadedRefs.length > 0 && (
            <div className="mt-2 grid gap-1.5">
              {uploadedRefs.map((u, i) => (
                <div key={u.id} className="flex items-start gap-3 rounded-[var(--radius)] border p-2" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                  <img src={u.dataUrl} alt={`上传参考图缩略图：${u.name}`} className="h-16 w-12 shrink-0 rounded object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{u.name}</p>
                    <p className="mt-0.5 text-xs text-[var(--dim)]">提交顺序 #{i + 1}（在人物参考图之前）</p>
                    <button
                      type="button"
                      className="btn btn-sm mt-1"
                      aria-label={`删除上传参考图：${u.name}`}
                      onClick={() => setUploadedRefs((prev) => prev.filter((x) => x.id !== u.id))}
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {uploadRefMsg && (
            <p className="mt-1 text-xs leading-5" style={{ color: "var(--bad)" }} role="note">
              {uploadRefMsg}
            </p>
          )}
          {uploadedRefs.length > 0 && !refHostConsent && charsWithImage.length === 0 && (
            <label
              className="mt-2 flex cursor-pointer items-start gap-2 rounded-[var(--radius)] border p-2.5 text-sm leading-6"
              style={{ borderColor: "var(--border)", background: "var(--surface-alt)" }}
            >
              <input
                type="checkbox"
                className="mt-1.5 h-4 w-4 shrink-0"
                checked={refHostConsent}
                onChange={(e) => applyRefHostConsent(e.target.checked)}
                aria-label="同意把上传参考图的副本临时上传到公开图床uguu.se换取链接（带参考图生成必须勾选，会按项目记住，刷新后仍有效）"
              />
              <span>
                <span className="font-bold">同意上传参考图副本换链接（带参考图生成先勾这里）：</span>
                Geeknow 只收 https 图片链接、本站图片它读不到。勾选后，点生成时这些上传图的降采样副本（最长边 1024px）会被临时上传到公开图床 uguu.se 换成链接、再交给 Geeknow——<span className="font-bold">任何拿到这个链接的人都能打开这张图</span>；文件是临时托管，短期后由图床自动删除。勾选会按这个项目记住，刷新不用重勾，随时可以取消（取消即清掉记忆）。不勾选也不会拦下生成：点生成时会先弹一次确认，确认后这次不带这些图、按纯文字生成。
              </span>
            </label>
          )}
          {uploadedRefs.length > 0 && !refHostConsent && charsWithImage.length > 0 && (
            <p className="mt-1 text-xs leading-5 text-[var(--dim)]" role="note">
              还没勾图床同意：现在点「生成封面」不会带上这些上传图（会先弹一次确认，确认后按纯文字降级）；要带图，先勾第二步「人物参考图」区的同意。
            </p>
          )}
          {uploadedRefs.length > 0 && refHostConsent && (
            <p className="mt-1 text-xs leading-5 text-[var(--dim)]" role="note">
              已勾图床同意：点生成时，这些图的降采样副本会和人物参考图一样，临时上传公开图床换链接再提交。
            </p>
          )}
        </div>
        {submitError && (
          <p className="text-sm leading-6" style={{ color: "var(--bad)" }} role="alert">
            {submitError}
          </p>
        )}
        {refProgress && (
          <p className="text-sm leading-6" style={{ color: "var(--dim)" }} role="status">
            {refProgress}
          </p>
        )}
        {refNote && (
          <p className="text-sm leading-6" style={{ color: "var(--bad)" }} role="note">
            {refNote}
          </p>
        )}
        {refWarning && (
          <p
            className="rounded-[var(--radius)] px-3 py-2 text-sm leading-6"
            style={{ background: "#2e2410", color: "#f2c94c", border: "1px solid #6b5518" }}
            role="note"
          >
            ⚠ {refWarning}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn btn-primary btn-lg"
            onClick={() => void runGenerate()}
            disabled={submitting || submitPromptOver}
            aria-label={`生成封面（${ratio}，${style.label}）：提交${submitLang === "en" ? "英文" : "中文"}版提示词的 Geeknow 生图任务，会计费`}
          >
            {submitting ? "提交中…" : `生成封面（${ratio}）`}
          </button>
          <span className="text-xs leading-5 text-[var(--dim)]">
            只生成当前比例（{ratio}）1 个任务。
          </span>
        </div>
        <div className="rounded-[var(--radius)] border p-3 space-y-2" style={{ borderColor: "var(--border)", background: "var(--surface-alt)" }}>
          <p className="text-sm font-bold">一键生成三比例（16:9 + 3:4 + 4:3）</p>
          <p className="text-xs leading-5 text-[var(--dim)]">同一提示词与参考图：参考图只取一次，三个比例同时提交、各落一条记录。</p>
          {batchPromptOver && (
            <p className="text-xs leading-5" style={{ color: "var(--bad)" }} role="alert">
              三份提交副本里最长的一份共 {batchPromptLen} 字符（含该比例的画幅适配句），已超过 {SUBMIT_PROMPT_BUDGET} 字符的安全线：先删减提示词、或点上方「按当前方案重新拼提示词」由系统按预算重拼，再生成三比例。
            </p>
          )}
          <button type="button" className="btn btn-primary" disabled={submitting || batchPromptOver} aria-label={`一键生成三个比例的封面（16比9、3比4、4比3）：提交${submitLang === "en" ? "英文" : "中文"}版提示词，一次点击并行提交3个新任务，共3次计费`} onClick={() => void runGenerateAllRatios()}>{submitting ? "提交中…" : "一键生成三比例（3 个任务 · 3 次计费）"}</button>
          {batchResults.length > 0 && (
            <ul className="space-y-1 text-sm" aria-label="一键三比例提交结果">
              {batchResults.map((r) => (<li key={r.ratio}><strong>{r.ratio}</strong>：<span style={{ color: r.ok ? "var(--olive)" : "var(--bad)" }}>{r.msg}</span></li>))}
            </ul>
          )}
        </div>
        {/* ---- 封面记录（并入右栏下半区，与第三步同栏） ---- */}
        <div className="space-y-3 border-t pt-3" style={{ borderColor: "var(--border)" }}>
        <p className="text-sm font-bold">本项目的封面记录</p>
        {/* v3.91 一键导出三比例：三比例原图打包成一个 ZIP 只下载一次
            （逐个连下会被浏览器当自动下载拦下，见 exportAllRatios） */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn"
            disabled={exportingAll || recordsQuery.isPending}
            aria-label="一键导出三个比例的封面原图（16比9、3比4、4比3各取最新一条已出图记录，三张无损原图打包成一个ZIP下载一次）"
            onClick={() => void exportAllRatios()}
          >
            {exportingAll ? "导出中…" : "一键导出三个比例"}
          </button>
          <span className="text-xs leading-5 text-[var(--dim)]">
            三比例各取最新已出图记录，无损原图打包 ZIP 一次下载。
          </span>
        </div>
        {exportAllMsg && (
          <p className="text-sm leading-6" role="status">
            {exportAllMsg}
          </p>
        )}
        {recordsQuery.isPending ? (
          <p className="text-sm text-[var(--dim)]">加载中…</p>
        ) : records.length === 0 ? (
          <p className="text-sm leading-6 text-[var(--dim)]">
            还没有生成过封面。先在第二步复制剧本代码去聊天框分析、把提示词粘贴回第三步，再点「生成封面」；出图后会出现在这里，可预览、无损下载。
          </p>
        ) : (
          <div className="grid gap-2">
            {records.map((rec) => (
              <article
                key={rec.id}
                className="rounded-[var(--radius)] border p-3"
                style={{ borderColor: "var(--border)" }}
                aria-label={`封面记录：${rec.title || "未命名"}，状态 ${STATUS_LABEL[rec.status] ?? rec.status}`}
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <strong>{rec.title || "未命名封面"}</strong>
                  <span className="text-[var(--dim)]">
                    {rec.ratio} · {rec.styleName} · {rec.model}
                  </span>
                  <span
                    className="font-bold"
                    style={{
                      color:
                        rec.status === "done"
                          ? "var(--olive)"
                          : rec.status === "failed" || rec.status === "expired"
                            ? "var(--bad)"
                            : "var(--text)",
                    }}
                  >
                    {STATUS_LABEL[rec.status] ?? rec.status}
                    {(rec.status === "submitted" || rec.status === "generating") &&
                    pollCounts[rec.id]
                      ? ` · 已查询 ${pollCounts[rec.id]} 次`
                      : ""}
                  </span>
                  <span className="text-xs text-[var(--dim)]">
                    {new Date(rec.createdAt).toLocaleString()}
                  </span>
                </div>
                {rec.imageUrl && (
                  <button
                    type="button"
                    className="mt-2 block cursor-zoom-in"
                    aria-label={`放大查看这张封面图（${rec.title || "未命名"}，比例 ${rec.ratio}）`}
                    onClick={() => setLightboxRec(rec)}
                  >
                    <img
                      src={rec.previewUrl ?? rec.imageUrl}
                      alt={`封面图：${rec.title || project.name}，比例 ${rec.ratio}`}
                      className="max-h-28 w-auto max-w-full rounded-[var(--radius)] border"
                      style={{ borderColor: "var(--border)" }}
                      loading="lazy"
                      decoding="async"
                      onLoad={(e) => {
                        // v5.57：记录小图在按钮里、不能嵌 PreviewImg，
                        // 旧 720 预览的降规格重生成在这里同口径触发
                        // （暂存图引用走 staged 通道，每会话至多一次）。
                        const img = e.currentTarget;
                        if (
                          rec.stagedKey &&
                          rec.imageUrl &&
                          Math.max(img.naturalWidth, img.naturalHeight) >
                            PREVIEW_MAX_EDGE
                        ) {
                          regenerateOversizedPreview(
                            { kind: "staged", stagedKey: rec.stagedKey },
                            rec.imageUrl,
                            () => void invalidateRecords(),
                          );
                        }
                      }}
                    />
                  </button>
                )}
                {rec.error && (
                  <p className="mt-2 text-sm leading-6" style={{ color: "var(--bad)" }}>
                    {rec.error}
                  </p>
                )}
                {/* v5.16 ① 附图自证行：v5.16 起的记录直接写明这次
                    实际带了几张图、带的哪几位、托管链接哈希与降级
                    原因；历史记录没有这些字段（refCount 为 null）
                    就整行不显示，不回填、不猜。 */}
                {rec.refCount !== null && rec.refCount !== undefined && (
                  <p className="mt-1 text-xs leading-5 text-[var(--dim)]" role="note">
                    {rec.refCount > 0
                      ? `本次带图 ${rec.refCount} 张${
                          refCharLabels(rec).length
                            ? `：${refCharLabels(rec).join("、")}`
                            : ""
                        }${
                          rec.refCount > (rec.refCharIds?.length ?? 0)
                            ? `（含上传参考图 ${rec.refCount - (rec.refCharIds?.length ?? 0)} 张）`
                            : ""
                        }`
                      : "本次带图 0 张（纯文字提交）"}
                    {rec.refHostHashes && rec.refHostHashes.length > 0 && (
                      <span title={`托管链接 SHA-256：\n${rec.refHostHashes.join("\n")}`}>
                        {" "}· 托管链接哈希 {rec.refHostHashes.map((h) => h.slice(0, 8)).join("、")}
                      </span>
                    )}
                  </p>
                )}
                {rec.degradeReason && (
                  <p className="mt-1 text-xs leading-5" style={{ color: "#f2c94c" }} role="note">
                    {rec.degradeReason}
                  </p>
                )}
                {/* v5.23 ③ 取图过程证据行：v5.23 起的记录写明取图
                    这一步的账——同意状态、已选几位、实际取到几张、
                    卡在哪一步；历史记录没有（refFetch 为 null）整
                    行不显示，不回填、不猜（记录 id 43 原样保留）。 */}
                {rec.refFetch && (
                  <p className="mt-1 text-xs leading-5 text-[var(--dim)]" role="note">
                    {`取图过程：图床同意${rec.refFetch.consent ? "已勾选" : "未勾选"} · 已选人物 ${rec.refFetch.selectedCount} 位${
                      rec.refFetch.uploadedSelected > 0
                        ? `、上传图 ${rec.refFetch.uploadedSelected} 张`
                        : ""
                    } · 实际取到 ${rec.refFetch.fetchedCount + rec.refFetch.uploadedFetched} 张`}
                    {rec.refFetch.failStep && (
                      <span style={{ color: "#f2c94c" }}>
                        {" "}· {rec.refFetch.failStep}
                      </span>
                    )}
                    {rec.refFetch.failures.length > 0 && (
                      <span>
                        {" "}· 没取到的：{rec.refFetch.failures.map((f) => `${f.name}（${f.reason}）`).join("；")}
                      </span>
                    )}
                    {rec.refFetch.crowdedOut.length > 0 && (
                      <span>
                        {" "}· 被张数上限挤掉：{rec.refFetch.crowdedOut.join("、")}
                      </span>
                    )}
                  </p>
                )}
                {recordMsg[rec.id] && (
                  <p className="mt-2 text-sm leading-6" role="status">
                    {recordMsg[rec.id]}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  {(rec.status === "submitted" || rec.status === "generating") &&
                    rec.taskId && (
                      <button
                        type="button"
                        className="btn btn-sm"
                        aria-label={`续查封面任务（记录 ${rec.id}，只查同一任务号，不重新提交）`}
                        onClick={() => void pollRecordRef.current(rec)}
                      >
                        续查
                      </button>
                    )}
                  {rec.status === "done" && rec.imageUrl && (
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={downloadingId === rec.id}
                      aria-label={`无损下载这张封面原图（${rec.title || "未命名"}）`}
                      onClick={() => void downloadRecord(rec)}
                    >
                      {downloadingId === rec.id ? "下载中…" : "无损下载原图"}
                    </button>
                  )}
                  {(rec.status === "failed" || rec.status === "expired") &&
                    (confirmResubmitId === rec.id ? (
                      <button
                        type="button"
                        className="btn btn-sm"
                        style={{
                          borderColor: "var(--terra)",
                          color: "var(--terra)",
                          fontWeight: 700,
                        }}
                        disabled={submitting}
                        aria-label="确认重新生成封面：这是新任务，会重新计费"
                        onClick={() => void resubmitRecord(rec)}
                      >
                        确认，这是新任务（重新计费）
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-sm"
                        aria-label={`重新生成这张封面（记录 ${rec.id}）：会提交新任务并重新计费，需再次确认`}
                        onClick={() => setConfirmResubmitId(rec.id)}
                      >
                        重新生成
                      </button>
                    ))}
                  <button
                    type="button"
                    className="btn btn-sm btn-danger-ghost"
                    aria-label={`删除这条封面记录（${rec.title || "未命名"}，只删记录条目）`}
                    onClick={() => void deleteRecord(rec)}
                  >
                    删除记录
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
        </div>
      </section>
      </div>

      {/* v5.16 ② 无图降级提交前确认：实际一张参考图都带不上、而
          提交词带人物约束时弹这一次——大白话写清「按纯文字提交、
          人物不会像资产图」，用户亲手点确认才提交（仍不拦单、
          不强制带图）；点「先不提交」就停在原地，什么都不发。 */}
      {textOnlyConfirm && (
        <ConfirmDialog
          title="这次没带上参考图，确认按纯文字提交？"
          body={
            <>
              <p>{textOnlyConfirm.detail}</p>
              <p className="mt-2">
                本次将按纯文字提交、不会上传任何图片：封面人物不会像人物资产图，只能按文字画。确认后照常提交、照常计费；想带图就点「先不提交」，先勾上图床同意、选好参考图再生成。
              </p>
            </>
          }
          confirmLabel="确认按纯文字提交"
          cancelLabel="先不提交"
          onConfirm={confirmTextOnlyAndProceed}
          onCancel={() => setTextOnlyConfirm(null)}
        />
      )}

      {/* v3.89 封面大图预览：记录里只放小图，点小图在这里看大图。
          v5.57 起大图固定加载原图全质（此前误用预览图，看大图也是
          糊的）；原图已被清理、打不开的老记录回落预览图并写明原因，
          不留破图。不改图、不重存。 */}
      {lightboxRec?.imageUrl && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          style={{ background: "rgba(3, 5, 9, 0.72)" }}
          role="dialog"
          aria-modal="true"
          aria-label={`封面大图预览：${lightboxRec.title || "未命名"}`}
          onClick={() => setLightboxRec(null)}
        >
          <figure className="flex max-h-full flex-col items-center gap-2">
            <img
              src={
                lightboxOrigFailedId === lightboxRec.id &&
                lightboxRec.previewUrl
                  ? lightboxRec.previewUrl
                  : lightboxRec.imageUrl
              }
              alt={`封面图大图：${lightboxRec.title || project.name}，比例 ${lightboxRec.ratio}`}
              className="max-h-[86vh] w-auto max-w-full rounded-[var(--radius)]"
              onError={() => setLightboxOrigFailedId(lightboxRec.id)}
            />
            {lightboxOrigFailedId === lightboxRec.id &&
              lightboxRec.previewUrl && (
                <figcaption className="text-center text-sm leading-6 text-white">
                  这条记录的原图已被清理、打不开了，现在显示的是预览图。
                </figcaption>
              )}
          </figure>
          <button
            type="button"
            className="btn btn-sm absolute right-4 top-4"
            aria-label="关闭封面大图预览"
            onClick={() => setLightboxRec(null)}
          >
            关闭
          </button>
        </div>
      )}

      {/* v4.23 风格参照图大图预览：与上方封面大图预览同款页内弹层
          （点任意处 / 关闭收起，不开新标签页）。 */}
      {refLightboxStyleId &&
        (() => {
          const refStyle = coverStyleById(refLightboxStyleId);
          const ref = STYLE_REFERENCES[refLightboxStyleId];
          if (!ref) return null;
          return (
            <div
              className="fixed inset-0 z-[70] flex items-center justify-center p-4"
              style={{ background: "rgba(3, 5, 9, 0.72)" }}
              role="dialog"
              aria-modal="true"
              aria-label={`${refStyle.label}参照图预览：《${ref.title}》`}
              onClick={() => setRefLightboxStyleId(null)}
            >
              <figure className="flex max-h-full flex-col items-center gap-2">
                <img
                  src={ref.src}
                  alt={`${refStyle.label}参照图：《${ref.title}》`}
                  className="max-h-[82vh] w-auto max-w-full rounded-[var(--radius)]"
                />
                <figcaption className="text-center text-sm leading-6 text-white">
                  {refStyle.label} · 参照图《{ref.title}》
                </figcaption>
              </figure>
              <button
                type="button"
                className="btn btn-sm absolute right-4 top-4"
                aria-label="关闭参照图预览"
                onClick={() => setRefLightboxStyleId(null)}
              >
                关闭
              </button>
            </div>
          );
        })()}
    </div>
  );
}
