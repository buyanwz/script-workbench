// 监控账号页（v4.30 全面重做，v4.31 补两处，v4.32 紧凑化，v4.33 扩展上报 intake，v4.34 钩子注册修复，v4.37 粘贴解析升级 18 项，v4.41 中转改走服务端代理，v4.42 横向对比视图，v4.44 卡片封面统一 3:4 + Excel 导入，v4.45 布局压缩，v4.46 卡片大小自定义，v4.47 版式多维调节，v4.48 修一键清除后刷新复活——中转游标落 localStorage 持久化、清除拦停轮询等在途收尾再删并记清除下限拦截旧 reports 回流，v4.49 深挖复活第二层根因——KV 旧 reports 时间戳格式混杂（数字毫秒/ISO/非法串）下字符串与字典序比较失效、非法串穿过清除下限反复重建：服务端代理层把 reportedAt 归一化成数字毫秒做数值过滤、客户端游标与清除下限全改数字毫秒纯数值比较、非法时间戳按最旧拦截，全链路加 [relay]/[bridge]/[load]/[clear] 诊断日志，v4.50 五层排查定案复活主通道为本地桥接补推——处理函数设通道无关清除下限（本机 localStorage + 服务端 clearedAtMs 双源取大）、去重改共享结果 Promise 保证回执不断链、轮询每轮现读共享游标/下限对齐多开，v4.51 版式推倒重做——删多维滑杆那套（monitor-card-layout-v2 键作废），版式面板改为三款卡片设计（极简信息流默认 / 大图视觉 / 紧凑数据）点选切换 + 等比缩小四档 1x/0.8x/0.6x/0.5x（宽高、字号、按钮文字与图标同步缩放、封面恒 3:4），合存 localStorage 键 monitor-card-display-v1，v4.52 intake 映射诊断日志——mapIntakeRow 映射前打 `[intake] raw keys:` 与 18 字段逐个命中/未命中（只打 key 名不打值），服务端 fetchRelayIntake 收到 reports 时同步打 raw keys 对照定位中转是否吞字段，映射逻辑一字未动，v4.53 补全 intake 映射表——按扩展实际 20 个 key 补齐：timestamp→发布时间、author.url→达人链接、author.user_define_id→快手号、author.fan_count→粉丝数、author.like_count→获赞、author.user_text→达人简介、tags 数组→话题串附到描述末尾（点号 key 字面/嵌套两种都试，collect_count 无对应字段忽略，[intake] 诊断日志保留并同步新候选），v4.61 卡片加「🔄 刷新链接」——工作台经新增反向桥接（monitorintake.requestMonitorVideoRefresh，消息 {__smzs_bridge:'wb', type:'REFRESH_VIDEO', videoId, url}，CustomEvent 'smzs-refresh' + postMessage 双发）通知同浏览器扩展重新采集，扩展经既有 intake 通道发回后服务端按 videoID 只更新链接字段；本页按 pending 对比链接变化判成功（toast「链接已刷新」）、10 秒无变化判没连上扩展（toast + 卡上红字），v4.62 只加发送端诊断日志（该事件发送逻辑 v4.63 已作废下线），v4.63「刷新链接」改标签页方案——按钮改 window.open('https://www.kuaishou.com/short-video/'+videoId+'#smzs-refresh','_blank') 不再发 smzs-refresh 事件、按钮进「正在刷新…」等 intake 回来再清，扩展在新标签页抓到新链接经既有 intake 回传（payload 带 _refreshVideoId、rows 只有 id + video_play_url），处理函数命中标记按 videoId 调 refreshMonitorVideoLinks 只更新链接字段、toast「链接已刷新」、不建新卡，smzs-refresh / smzs-refresh-result 发送与监听整段下线，超时保持 10 秒（标签页 20 秒无结果自动关）；旧的
// v4.45：布局压缩——卡片整体缩到约五分之三（CompactVideoCard 宽
// 228/240→137/144px、VideoCard 封面 104/118→62/71px，3:4 比例不变），
// 卡内与各视图的间距/行距全面收紧（详情窗达人名→粉丝行→简介的上边距与
// 行高同步收紧）；五视图 / Excel 导入 / 详情窗等功能与交互一字未动。
// v4.44：①五种视图的视频卡片封面统一 3:4 竖版裁切——CompactVideoCard
// （最新采集 / 最新对比 / 按日期分组 / 按作者分组横排共用）封面由
// 横版 h-[128px] 改 aspect-[3/4] + object-cover（原图什么比例都按
// 3:4 框裁切填充、不拉伸变形）；VideoCard（按达人分组）与详情窗小
// 封面本来就是 3:4，本版不动，至此全部视图口径一致。②Excel 表格
// 导入：标题行加「导入 Excel」（.xlsx）与「下载模板」——模板是只
// 有 18 项规范表头一行的空 .xlsx；导入在浏览器本地解析（monitorxlsx.ts
// 自研 ZIP/XML 读取，无新依赖），第一行按列名对 18 项（PASTE_FIELD_MAP，
// 简称也认）、列序不限、缺列留空；逐行串行走 fetchMonitorVideo 同一
// 管线（归户 / 按视频ID去重 duplicated 计跳过），完成后 toast 报
// 新建 / 跳过重复 / 失败数与首个失败原因。
// 「名单管理」布局与功能整体删除，改成用户定的新流程——
// v4.34：钩子注册改两层制（见 monitorintake.ts）——main.tsx 渲染前
// 先在 app 所在 frame 的 window 上装桩（typeof 恒为 function、带
// console.log 注册标记、先到的调用排队），本页挂载只把处理函数挂
// 到槽位并冲刷队列，卸载只摘处理函数、不再删钩子本体；页首多一
// 行钩子状态（已注册/未注册）供真机肉眼核对。
// v4.33：挂载时注册 window.__monitorIntake(payload) 供社媒助手扩展
// 经 chrome.storage + content script 桥接调用（Route A，协议
// smzs-monitor-intake/1）；字段映射 best-effort（字面 key 优先再试
// 嵌套路径），建卡复用 fetchMonitorVideo 同一套管线（按视频ID去重、
// 按达人归户、组内发布时间倒序），完成后 toast 报新建/跳过数。
// v4.32 紧凑化（纯布局）：粘贴框由 rows=9 改固定高 48px（约原来的
// 五分之一）、resize:none、超长内容框内滚动；12 项表单改紧凑小输入
// 框（field-sm）、标签与行距收紧、桌面改 4 列排布，整张填写卡在首屏
// 内尽量装下（粘贴框 + 解析按钮 + 12 项表单 + 获取按钮）。
//
//   ① 填写区已精简为一个通栏单行输入框（深蓝灰底、高度固定
//      不可拉伸）：用户把从快手摘下来的整段「字段名：值」文本
//      粘进去即自动解析并建卡——解析（parsePastedInfo）+
//      fetchMonitorVideo 管线，字段映射、服务端按达人链接归户、
//      同视频去重、组内发布时间倒序都不变。v4.37 起按扩展实际
//      采集格式认全 18 项（原 12 项 + 快手号 / 粉丝数 / 获赞 /
//      达人简介 / 评论量 / 采集时间）：缺项留空不拦截；没有新
//      「字段名：」的行是上一字段的续行、拼接保留换行（描述的
//      #话题行、达人简介多行）；数字的千分位逗号解析时去掉。
//      新增 6 项随卡存 monitor_videos（采集时的达人快照）。
//      成功 toast「已建卡 1 张」并清空输入框；0 项认出时 toast
//      提示格式不对、框内文本保留不清空；服务端拒收（如缺达人
//      链接）同样 toast 报错并保留文本。
//   ③ 下方按达人分组、组内按发布时间倒序累积展示卡片：封面图、
//      达人昵称、视频描述、播放量 / 点赞量、发布时间、视频时长
//      一目了然；点封面跳快手原视频；点「播放视频」在当前页弹出
//      悬浮播放窗直接播（v4.31，不开新页面），点空白处或关闭按钮
//      即关；点「详情」弹出同款悬浮窗（v4.38 重新排版，不再原文
//      直铺）：顶部小封面 + 标题（描述首行）+ #话题徽标，核心数据
//      一行徽标（时长/播放/点赞/评论/发布时间），视频信息与达人
//      信息分区，封面/文件长链接收进默认收起的「更多链接」折叠区
//      （单行截断 + 逐项复制），底部小字采集时间；缺失字段直接隐
//      藏不占行；右上角「复制」复制的仍是标准 18 项粘贴格式原文
//      （buildDetailText 不变，可拿去再粘贴）；每张卡片
//      可单独删除，达人也可整组删除。卡片按钮为「播放视频｜详情｜
//      删除」（已删除原「看原视频」按钮，「播放视频文件」改名
//      「播放视频」）。
//
// 输入框常驻页面上方，方便一条接一条地贴。
//
// v5.55：3 天留存自动清理（用户 2026-11-09 定，门槛选 B、触发选
// 自动）——标题行加「立即清理」（先 preview 出清单、确认框核对
// 后 run 真删，服务端重判）；页面上方加「3 天留存清理」记录区
// （上次 / 下次清理时间、删除日志、最近一轮无数据未判定）；自
// 动触发在服务端 getMonitorCleanupStatus（打开本页距上次清理
// ≥24 小时即跑一轮），跑完有删除 / 未判定时经 intakeToast 提示
// 并刷新列表。规则全文见服务端 actions.ts 的 v5.55 注释。

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type ApiResponse } from "./api";
import { ConfirmDialog } from "./confirm";
import { describeThrownError, retryReadQuery, withReadTimeout } from "./gateway";
import {
attachMonitorIntakeHandler,
dispatchMonitorIntake,
type MonitorIntakeResult,
} from "./monitorintake";
import {
downloadMonitorTemplateXlsx,
excelSerialToText,
looksLikeExcelSerial,
parseMonitorXlsx,
} from "./monitorxlsx";
import { CloudBadge, useCloudVideoSource } from "./cloudvideo";
import { loadRelaySettings, relayActionArgs } from "./relaysettings";
import sampleCover from "./assets/封面参照图-21张/monitor-huanxiong-cover.jpg";
import type { AnalysisPrefill } from "./analysisbench";

type FeedAccount = ApiResponse<typeof api, "listMonitorFeed">["accounts"][number];
type FeedVideo = FeedAccount["videos"][number];

// 用户 2026-11-03 提供的参考视频（快手「幻熊」）的封面已下载存进
// 本站资源（assets/monitor-huanxiong-cover.jpg）：这条视频的卡片
// 优先用本站这份封面，不依赖快手带签名会过期的图床链接。
const SAMPLE_VIDEO_ID = "3xnukh46rac9yww";

// 粘贴解析后的 18 项字段（与 fetchMonitorVideo 入参一一对应）：
// 原 12 项 + v4.37 按扩展实际采集格式新增的 6 项（快手号 / 粉丝数 /
// 获赞 / 达人简介 / 评论量 / 采集时间）。
type FormState = {
  videoId: string;
  videoUrl: string;
  durationText: string;
  description: string;
  likeCount: string;
  playCount: string;
  publishedAt: string;
  creatorId: string;
  creatorUrl: string;
  creatorName: string;
  coverUrl: string;
  videoFileUrl: string;
  kuaishouId: string;
  fansCount: string;
  totalLikeCount: string;
  creatorBio: string;
  commentCount: string;
  collectedAt: string;
};

// 「字段名：」前缀 → 表单字段。中文冒号与英文冒号都认；另给几个
// 常见简称兜底（封面链接 / 视频文件 / 达人主页），认不出不硬猜。
const PASTE_FIELD_MAP: Record<string, keyof FormState> = {
  视频ID: "videoId",
  视频链接: "videoUrl",
  视频时长: "durationText",
  视频描述: "description",
  点赞量: "likeCount",
  点赞: "likeCount",
  播放量: "playCount",
  播放: "playCount",
  发布时间: "publishedAt",
  达人ID: "creatorId",
  达人链接: "creatorUrl",
  达人主页: "creatorUrl",
  达人昵称: "creatorName",
  视频封面链接: "coverUrl",
  封面链接: "coverUrl",
  视频文件链接: "videoFileUrl",
  视频文件: "videoFileUrl",
  快手号: "kuaishouId",
  粉丝数: "fansCount",
  粉丝量: "fansCount",
  获赞: "totalLikeCount",
  获赞量: "totalLikeCount",
  总获赞: "totalLikeCount",
  达人简介: "creatorBio",
  简介: "creatorBio",
  评论量: "commentCount",
  评论数: "commentCount",
  采集时间: "collectedAt",
};

// 18 项的规范顺序（与扩展采集输出、详情窗原文渲染同一顺序）。
const PASTE_FIELD_LABELS: { key: keyof FormState; label: string }[] = [
  { key: "videoId", label: "视频ID" },
  { key: "videoUrl", label: "视频链接" },
  { key: "durationText", label: "视频时长" },
  { key: "description", label: "视频描述" },
  { key: "likeCount", label: "点赞量" },
  { key: "playCount", label: "播放量" },
  { key: "publishedAt", label: "发布时间" },
  { key: "creatorId", label: "达人ID" },
  { key: "creatorUrl", label: "达人链接" },
  { key: "creatorName", label: "达人昵称" },
  { key: "coverUrl", label: "视频封面链接" },
  { key: "videoFileUrl", label: "视频文件链接" },
  { key: "kuaishouId", label: "快手号" },
  { key: "fansCount", label: "粉丝数" },
  { key: "totalLikeCount", label: "获赞" },
  { key: "creatorBio", label: "达人简介" },
  { key: "commentCount", label: "评论量" },
  { key: "collectedAt", label: "采集时间" },
];

// 解析整段粘贴文本（v4.37 按扩展实际采集格式升级到 18 项）：
// 逐行处理——行首是认得出的「字段名：」就开一个新字段（只拆第一
// 个冒号，值里自带的冒号保留）；带「字段名：」样子但不在 18 项里
// 的行（如扩展附带的「音频文件链接」「锚点信息」）整行跳过并关
// 掉当前字段，免得它的续行误拼进来；其余没有字段名的行视为上
// 一个字段的续行，拼到该字段值后面并保留换行（视频描述第二行
// 的 #话题、达人简介的多行都靠这个）；第一个字段出现之前的行
// 丢弃。字段顺序可乱、重复字段以后出现的为准、缺少的字段不进
// patch（调用方以空表单为底，缺项自然留空、不报错不拦截）。
function parsePastedInfo(text: string): {
  patch: Partial<FormState>;
  recognized: string[];
  missing: string[];
} {
  const patch: Partial<FormState> = {};
  const seen = new Set<keyof FormState>();
  let currentKey: keyof FormState | null = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    const m = line.match(/^([^：:]{1,12})[：:]\s*(.*)$/);
    const key = m ? PASTE_FIELD_MAP[(m[1] ?? "").trim()] : undefined;
    if (key) {
      patch[key] = (m?.[2] ?? "").trim();
      seen.add(key);
      currentKey = key;
      continue;
    }
    if (m) {
      // 未知字段行：跳过，并结束当前字段的续行收集。
      currentKey = null;
      continue;
    }
    // 续行：拼到当前字段后面（保留换行）。空行在多行值里也保留
    // 一行空行，让简介的段落感不丢；还没有任何字段时直接跳过。
    if (currentKey !== null) {
      patch[currentKey] = `${patch[currentKey] ?? ""}\n${line}`;
    }
  }
  // 续行拼接可能在值首尾留下空行，统一收一下边（内部换行不动）。
  for (const k of Object.keys(patch) as (keyof FormState)[]) {
    patch[k] = (patch[k] ?? "").trim();
  }
  const recognized = PASTE_FIELD_LABELS.filter((f) => seen.has(f.key)).map((f) => f.label);
  const missing = PASTE_FIELD_LABELS.filter((f) => !seen.has(f.key)).map((f) => f.label);
  return { patch, recognized, missing };
}

const EMPTY_FORM: FormState = {
  videoId: "",
  videoUrl: "",
  durationText: "",
  description: "",
  likeCount: "",
  playCount: "",
  publishedAt: "",
  creatorId: "",
  creatorUrl: "",
  creatorName: "",
  coverUrl: "",
  videoFileUrl: "",
  kuaishouId: "",
  fansCount: "",
  totalLikeCount: "",
  creatorBio: "",
  commentCount: "",
  collectedAt: "",
};

function normalizeUrl(raw: string): string {
  const v = raw.trim();
  if (!v) return v;
  if (/^https?:\/\//i.test(v)) return v;
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(v)) return `https://${v}`;
  return v;
}

function parseCount(raw: string): number {
  const n = Number(raw.replace(/[,\s，]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function formatCount(n: number): string {
  return n.toLocaleString("zh-CN");
}

// 万为单位的简写（v4.51 卡片数据行口径）：23000 →「2.3万」。
function formatWanCount(n: number): string {
  if (n >= 10000) {
    const v = n / 10000;
    const text =
      v >= 100 ? String(Math.round(v)) : v.toFixed(1).replace(/\.0$/, "");
    return `${text}万`;
  }
  return formatCount(n);
}

// 相对时间（v4.51 卡片数据行口径）：「2小时前」样式；超过 30
// 天回落到日期。发布时间固定按 Asia/Shanghai 解释，差值用绝对
// 时间戳算，不随时区漂移。
function formatRelativeTime(iso: string | null): string {
  if (!iso) return "时间未填";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "时间未填";
  const diffMs = Date.now() - d.getTime();
  if (diffMs < 0) return formatPublished(iso).slice(0, 10);
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}天前`;
  return formatPublished(iso).slice(0, 10);
}

// ---------------------------------------------------------------------------
// 跨浏览器中转（relay）：扩展在另一个浏览器里采集时，本地桥接
// （CustomEvent / postMessage）够不着，改走 Cloudflare Worker 中
// 转——扩展 POST /report 存进 Worker，监控页每 10 秒拉一次。
// v4.41 起改走服务端代理：前端在 artifact iframe 里直连 Worker
// 会被 CSP 的 connect-src 拦掉（Failed to fetch，浏览器本身网
// 络没问题），故轮询不再直连 Worker——改调同源服务端动作
// fetchRelayIntake（即同源 /api/relay/intake?since= 的动作口
// 径），由服务端用内置的中转地址与密钥去拉 Worker，再把
// {ok, reports} 原样转回。中转地址与密钥只在服务端配置里，
// 前端代码与日志里都没有；页面上不再有地址/密钥输入行。代理
// 失败（中转不可达 / 密钥错）的原因由服务端透回，状态行如实
// 显示。拉到的 reports 逐条经 dispatchMonitorIntake(report,
// 'relay') 送入，与本地桥接共用同一处理入口与 reportedAt 去
// 重，建卡管线完全不变；本地桥接一字未动。
// ---------------------------------------------------------------------------

type RelayStatus =
  | { kind: "connected" }
  | { kind: "connecting" }
  | { kind: "failed"; reason: string }
  | { kind: "paused"; reason: string };

// 中转轮询游标（since）持久化（v4.48 落 localStorage；v4.49 改
// 纯数字毫秒）：v4.48 真机复现仍复活，深挖根因是时间戳格式混杂
// 下的比较失效——中转 KV 的旧 reports 里 reportedAt 三种格式并
// 存：数字型毫秒 1793740529760、ISO 串 2026-11-03T21:48:25.574Z、
// 非法串 2026-11-03T99:99:99.000Z。v4.48 的 compareRelayTime 在
// Date.parse 失败时退回字典序：数字串 Date.parse 恒 NaN、非法
// 串也 NaN，于是 "2026-11-03T99:99:99.000Z" 字典序大于任何真实
// 清除时刻、ISO 串又永远大于数字型游标——非法 report 穿过清除
// 下限被反复派发重建，游标还会被它顶成非法串落盘。本版起游标
// 全程只用数字毫秒（number）：服务端代理层已把每条 report 的
// reportedAt 归一化成 reportedAtMs 并做数值过滤（见服务端
// parseRelayReportedAtMs），客户端只做数值比较，再无字典序回
// 退；解析不了的时间戳永不推进游标、永不派发建卡。
// localStorage 键不变（monitor-relay-since-v1）：v4.49 起只存
// 数字毫秒串；读回时兼容旧值——纯数字 / ISO 串解析成毫秒，旧
// 值无法解析（如已被顶成非法串）视为游标已推到当前时间（旧
// reports 不再回流），并把归一化结果写回落盘。
const RELAY_SINCE_STORAGE_KEY = "monitor-relay-since-v1";

// 与服务端 parseRelayReportedAtMs 同口径的客户端归一化：数字 /
// 纯数字串取数值，其余 Date.parse，失败回 null。
function parseRelayReportedAtMs(v: unknown): number | null {
  if (typeof v === "number") {
    return Number.isFinite(v) ? v : null;
  }
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return null;
    if (/^\d+$/.test(s)) {
      const n = Number(s);
      return Number.isFinite(n) ? n : null;
    }
    const p = Date.parse(s);
    return Number.isFinite(p) ? p : null;
  }
  return null;
}

let relaySinceLoadLogged = false;

function loadRelaySince(): number {
  let raw = "";
  try {
    raw = window.localStorage.getItem(RELAY_SINCE_STORAGE_KEY) ?? "";
  } catch {
    // localStorage 不可用时退回 0 游标（行为同首次同步，不炸页）
    raw = "";
  }
  let ms = 0;
  if (raw) {
    const parsed = parseRelayReportedAtMs(raw);
    // 旧值无法解析（典型：被非法时间戳顶坏的游标）：按已推到
    // 当前时间处理，旧 reports 不再回流；新上报时间戳更大，
    // 照常能进来。
    ms = parsed !== null ? parsed : Date.now();
    if (String(ms) !== raw) {
      // 归一化结果与旧值不同（ISO 串 / 坏值）：写回落盘，下次
      // 读回就是纯数字毫秒。
      try {
        window.localStorage.setItem(RELAY_SINCE_STORAGE_KEY, String(ms));
      } catch {
        // 写不进也已在内存生效
      }
    }
  }
  if (!relaySinceLoadLogged) {
    relaySinceLoadLogged = true;
    console.log(
      `[load] 从 localStorage 恢复中转游标：原始值=${raw || "(空)"}，归一化 since=${ms}`,
    );
  }
  return ms;
}

function saveRelaySince(ms: number): void {
  try {
    window.localStorage.setItem(RELAY_SINCE_STORAGE_KEY, String(ms));
    const back = window.localStorage.getItem(RELAY_SINCE_STORAGE_KEY);
    console.log(
      `[relay] 游标落盘 since=${ms}（读回=${back ?? "(空)"}${back === String(ms) ? "，一致" : "，不一致！"}）`,
    );
  } catch {
    console.warn(`[relay] 游标落盘失败（localStorage 不可用）since=${ms}`);
  }
}

// ---------------------------------------------------------------------------
// 通道无关的 intake 清除下限（v4.50）：五层排查的最终结论——复活
// 的主通道不是中转，而是本地桥接：扩展 content script 在每次页
// 面加载时补推 chrome.storage 里未消费的上报，这条路不经中转轮
// 询、与游标和轮询下限毫无关系，v4.48/v4.49 的全部拦截都架在轮
// 询派发点上，桥接直达 intake 处理函数、暢通无阻。故本版在「处
// 理函数」这个所有自动通道（桥接 CustomEvent / postMessage / 钩
// 子直调 / 中转轮询）的唯一汇合点设下限：reportedAt 不晚于最近
// 一次一键清除时刻的上报一律不建卡、回 {ok:true} 让扩展标记已
// 消费停止补推。下限双源取大：本机 localStorage（清除时写、同浏
// 览器其它标签页即时可见）+ 服务端下限（clearMonitorVideos 落库
// 的 clearedAtMs，随 listMonitorFeed 回来并入本机——在另一浏览器
// 点的清除在本机同样生效）。手动粘贴 / Excel 导入不经处理函数，
// 清除后想手动把某条加回来不受影响。
// ---------------------------------------------------------------------------
const INTAKE_FLOOR_STORAGE_KEY = "monitor-intake-floor-v1";

function loadIntakeFloor(): number {
  try {
    const raw = window.localStorage.getItem(INTAKE_FLOOR_STORAGE_KEY) ?? "";
    const ms = parseRelayReportedAtMs(raw);
    return ms !== null && ms > 0 ? ms : 0;
  } catch {
    // localStorage 不可用时退回 0（无下限，不炸页）
    return 0;
  }
}

function saveIntakeFloor(ms: number): void {
  if (!Number.isFinite(ms) || ms <= 0) return;
  try {
    const cur = loadIntakeFloor();
    if (ms <= cur) return;
    window.localStorage.setItem(INTAKE_FLOOR_STORAGE_KEY, String(ms));
    console.log(`[clear] intake 清除下限已落盘 floor=${ms}`);
  } catch {
    console.warn(`[clear] intake 清除下限落盘失败（localStorage 不可用）floor=${ms}`);
  }
}

// ---------------------------------------------------------------------------
// v4.33 扩展上报 intake（Route A）：社媒助手扩展采集后点「数据上报」
// 把原生行写进 chrome.storage，桥接脚本经 postMessage 调本钩子。
// 契约见 ~/workspace/ext-build/monitor-intake-spec.md：protocol 不是
// 'smzs-monitor-intake/1' 返回 {ok:false} 不处理；是则逐行做字段
// 映射（best-effort，取不到留空）后走 fetchMonitorVideo 建卡，返回
// {ok:true, created, skipped}（created=新建卡数，skipped=重复/失败数）。
// ---------------------------------------------------------------------------

type IntakeRow = Record<string, unknown>;
type IntakePayload = {
  protocol?: unknown;
  platform?: unknown;
  reportedAt?: unknown;
  rows?: unknown;
  // v4.63：刷新回程标记——扩展在新标签页抓到新链接后经 intake
  // 回传时带上（值为被刷新的 videoId）；命中走刷新分支，不建卡。
  _refreshVideoId?: unknown;
};
// 钩子本体与 Window 类型在 monitorintake.ts（v4.34 注册中心）：
// window.__monitorIntake 是渲染前装好的桩，返回值形状即
// MonitorIntakeResult；本页只负责提供下面的处理函数。

// 每个候选 key 先试字面 key（row["photo.id"]），再试按点号拆分的
// 嵌套路径（row.photo.id）；候选按给定顺序逐个试，命中非空即返回。
function pickIntakeField(row: IntakeRow, candidates: string[]): unknown {
  for (const cand of candidates) {
    if (Object.prototype.hasOwnProperty.call(row, cand)) {
      const v = row[cand];
      if (v !== undefined && v !== null && v !== "") return v;
    }
    if (cand.includes(".")) {
      let cur: unknown = row;
      let hit = true;
      for (const part of cand.split(".")) {
        if (
          cur &&
          typeof cur === "object" &&
          part in (cur as Record<string, unknown>)
        ) {
          cur = (cur as Record<string, unknown>)[part];
        } else {
          hit = false;
          break;
        }
      }
      if (hit && cur !== undefined && cur !== null && cur !== "") return cur;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// v4.52 intake 映射诊断日志（只打日志，绝不参与映射）：用户反馈扩展
// 上报 20 个字段、工作台详情卡却缺达人级字段（快手号 / 粉丝数 /
// 获赞 / 达人简介），疑似中转在半路吞字段。本诊断在 mapIntakeRow
// 映射每一行之前打两类日志到控制台：
//   ① `[intake] raw keys: <key1,key2,...>` —— 原生行对象的全部顶层
//      key 名，证明字段到底有没有送到工作台这一端；
//   ② 18 个字段（另加「视频话题」诊断行）逐个打
//      `[intake] 字段<字段名>: 命中key=<key>` 或
//      `[intake] 字段<字段名>: 未命中` —— 证明映射候选有没有对上。
// 只打 key 名与命中关系，绝不打任何字段值（值可能含敏感信息）。
// 命中判定 logIntakeFieldHit 与 pickIntakeField 同口径（每候选先
// 字面 key、再点号嵌套路径，非空才算命中），但它是独立的只读探
// 针：映射仍走原来的 pickIntakeField，逻辑一字未动，探针判错也
// 不影响建卡结果。
// ---------------------------------------------------------------------------

const INTAKE_DIAG_FIELDS: { name: string; candidates: string[] }[] = [
  { name: "视频ID", candidates: ["aweme_id", "photo.id", "id", "video_id", "videoId"] },
  { name: "视频链接", candidates: ["url", "photo_url", "video_url", "videoUrl", "share_url"] },
  { name: "视频时长", candidates: ["duration", "duration_text", "durationText"] },
  { name: "视频描述", candidates: ["aweme.desc", "desc", "photo.caption", "caption", "description"] },
  { name: "点赞量", candidates: ["aweme.digg_count", "digg_count", "liked_count", "like_count", "likeCount"] },
  { name: "播放量", candidates: ["play_count", "view_count", "photo.view_count", "playCount", "viewCount"] },
  {
    name: "发布时间",
    candidates: ["aweme.create_time", "create_time", "timestamp", "publishedAt", "published_at", "createTime", "publish_time"],
  },
  // 达人ID 的映射结果是 creatorIdRaw || secUid，候选按这个顺序合并。
  {
    name: "达人ID",
    candidates: ["user_id", "author.id", "author_id", "creator_id", "creatorId", "uid", "sec_uid", "author.sec_uid", "secUid", "author.secUid"],
  },
  { name: "达人链接", candidates: ["author.url", "authorUrl", "author_url", "creatorUrl", "creator_url", "profile_url", "user_url"] },
  { name: "达人昵称", candidates: ["author.nickname", "nickname", "user_name", "author.name", "creatorName", "creator_name"] },
  { name: "视频封面链接", candidates: ["video_cover", "cover_url", "coverUrl", "cover"] },
  { name: "视频文件链接", candidates: ["video_play_url", "video_file_url", "videoFileUrl", "play_url", "playUrl"] },
  { name: "视频话题", candidates: ["tags"] },
  { name: "快手号", candidates: ["author.user_define_id", "kuaishou_id", "kuaishouId", "kwai_id", "author.kuaishou_id"] },
  { name: "粉丝数", candidates: ["author.fan_count", "fans_count", "follower_count", "fansCount", "followers", "author.fans_count"] },
  { name: "获赞", candidates: ["author.like_count", "total_like_count", "liked_total", "total_likes", "totalLikeCount", "author.liked_count"] },
  { name: "达人简介", candidates: ["author.user_text", "author.bio", "bio", "creator_bio", "creatorBio", "signature", "author.signature"] },
  { name: "评论量", candidates: ["comment_count", "commentCount", "comments", "aweme.comment_count"] },
  { name: "采集时间", candidates: ["collected_at", "collectedAt", "collect_time", "collectTime", "report_time"] },
];

function logIntakeFieldHit(row: IntakeRow, candidates: string[]): string | null {
  for (const cand of candidates) {
    if (Object.prototype.hasOwnProperty.call(row, cand)) {
      const v = row[cand];
      if (v !== undefined && v !== null && v !== "") return cand;
    }
    if (cand.includes(".")) {
      let cur: unknown = row;
      let hit = true;
      for (const part of cand.split(".")) {
        if (
          cur &&
          typeof cur === "object" &&
          part in (cur as Record<string, unknown>)
        ) {
          cur = (cur as Record<string, unknown>)[part];
        } else {
          hit = false;
          break;
        }
      }
      if (hit && cur !== undefined && cur !== null && cur !== "") return cand;
    }
  }
  return null;
}

function logIntakeRowDiagnostics(row: IntakeRow): void {
  console.log(`[intake] raw keys: ${Object.keys(row).join(",")}`);
  for (const field of INTAKE_DIAG_FIELDS) {
    const hit = logIntakeFieldHit(row, field.candidates);
    console.log(
      hit
        ? `[intake] 字段${field.name}: 命中key=${hit}`
        : `[intake] 字段${field.name}: 未命中`,
    );
  }
}

function intakeString(v: unknown): string {
  if (v === undefined || v === null) return "";
  return String(v).trim();
}

// v4.53：扩展的 tags（视频话题）是数组 —— 逐项 trim、去掉自带的
// # 前缀、空项丢弃，最后拼成 "#话题一 #话题二" 的空格串，附到描
// 述末尾（与粘贴 / Excel 口径一致：话题就活在描述里，卡片与详情
// 窗的 splitDescription 会把它们拆成话题徽标）。tags 本身是字符串
// 时原样用；不是数组也不是字符串时按空处理。
function intakeTagsText(v: unknown): string {
  if (Array.isArray(v)) {
    return v
      .map((t) => String(t ?? "").trim().replace(/^#+/, "").trim())
      .filter((t) => t !== "")
      .map((t) => `#${t}`)
      .join(" ");
  }
  if (typeof v === "string") return v.trim();
  return "";
}

function intakeCount(v: unknown): number {
  if (typeof v === "number")
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
  const n = Number(String(v ?? "").replace(/[,\s，]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function intakeDuration(v: unknown): string {
  if (v === undefined || v === null || v === "") return "";
  const toText = (totalSec: number) => {
    const total = Math.max(0, Math.floor(totalSec));
    return `${Math.floor(total / 60)}分${total % 60}秒`;
  };
  if (typeof v === "number" && Number.isFinite(v)) return toText(v);
  const s = String(v).trim();
  if (/^\d+(\.\d+)?$/.test(s)) return toText(Number(s));
  return s;
}

function formatShanghaiDateTime(d: Date): string {
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

function intakePublished(v: unknown): string {
  if (v === undefined || v === null || v === "") return "";
  if (typeof v === "number" && Number.isFinite(v)) {
    const d = new Date(v < 1e12 ? v * 1000 : v);
    return Number.isNaN(d.getTime()) ? "" : formatShanghaiDateTime(d);
  }
  const s = String(v).trim();
  if (/^\d+$/.test(s)) {
    const num = Number(s);
    const d = new Date(num < 1e12 ? num * 1000 : num);
    return Number.isNaN(d.getTime()) ? "" : formatShanghaiDateTime(d);
  }
  const naive = s.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})/,
  );
  if (naive) {
    const pad = (x: string) => x.padStart(2, "0");
    return `${naive[1]}-${pad(naive[2] ?? "")}-${pad(naive[3] ?? "")} ${pad(naive[4] ?? "")}:${naive[5]}`;
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return formatShanghaiDateTime(d);
  return s;
}

function normalizeIntakePlatform(
  raw: unknown,
): "douyin" | "kuaishou" | "xiaohongshu" | "" {
  const s = String(raw ?? "").toLowerCase();
  if (s.includes("douyin") || s.includes("抖音")) return "douyin";
  if (s.includes("kuaishou") || s.includes("快手")) return "kuaishou";
  if (s.includes("xiaohongshu") || s.includes("xhs") || s.includes("小红书"))
    return "xiaohongshu";
  return "";
}

function buildIntakeVideoUrl(
  platform: ReturnType<typeof normalizeIntakePlatform>,
  videoId: string,
): string {
  if (!videoId) return "";
  if (platform === "douyin") return `https://www.douyin.com/video/${videoId}`;
  if (platform === "kuaishou")
    return `https://www.kuaishou.com/short-video/${videoId}`;
  return "";
}

function buildIntakeCreatorUrl(
  platform: ReturnType<typeof normalizeIntakePlatform>,
  creatorId: string,
  secUid: string,
): string {
  if (platform === "douyin") {
    const id = secUid || creatorId;
    return id ? `https://www.douyin.com/user/${id}` : "";
  }
  if (platform === "kuaishou")
    return creatorId ? `https://www.kuaishou.com/profile/${creatorId}` : "";
  if (platform === "xiaohongshu")
    return creatorId
      ? `https://www.xiaohongshu.com/user/profile/${creatorId}`
      : "";
  return "";
}

// 一行扩展原生数据 → fetchMonitorVideo 的 18 项入参（与手动粘贴
// 完全同一套字段）。候选顺序按 intake 规范；规范外的 likeCount /
// publishedAt / authorUrl 等扩展实际字段名也一并兜底（沙箱验证的
// 真实上报行就用这几个名）。
function mapIntakeRow(row: IntakeRow, platformRaw: unknown) {
  // v4.52 诊断日志（只打 key 名与命中关系，不打值、不参与映射）。
  logIntakeRowDiagnostics(row);
  const platform = normalizeIntakePlatform(platformRaw);
  const videoId = intakeString(
    pickIntakeField(row, ["aweme_id", "photo.id", "id", "video_id", "videoId"]),
  );
  let videoUrl = intakeString(
    pickIntakeField(row, ["url", "photo_url", "video_url", "videoUrl", "share_url"]),
  );
  if (!videoUrl) videoUrl = buildIntakeVideoUrl(platform, videoId);
  const creatorIdRaw = intakeString(
    pickIntakeField(row, [
      "user_id",
      "author.id",
      "author_id",
      "creator_id",
      "creatorId",
      "uid",
    ]),
  );
  const secUid = intakeString(
    pickIntakeField(row, ["sec_uid", "author.sec_uid", "secUid", "author.secUid"]),
  );
  let creatorUrl = intakeString(
    pickIntakeField(row, [
      "author.url",
      "authorUrl",
      "author_url",
      "creatorUrl",
      "creator_url",
      "profile_url",
      "user_url",
    ]),
  );
  if (!creatorUrl)
    creatorUrl = buildIntakeCreatorUrl(platform, creatorIdRaw, secUid);
  // v4.53：视频描述 = caption 正文 + tags 话题行（话题附在描述末尾，
  // 与粘贴 / Excel 里「描述第二行是 #话题」的口径一致）。
  const captionText = intakeString(
    pickIntakeField(row, [
      "aweme.desc",
      "desc",
      "photo.caption",
      "caption",
      "description",
    ]),
  );
  const tagsText = intakeTagsText(pickIntakeField(row, ["tags"]));
  const descriptionText =
    captionText && tagsText
      ? `${captionText}\n${tagsText}`
      : captionText || tagsText;
  return {
    videoId,
    videoUrl: normalizeUrl(videoUrl),
    durationText: intakeDuration(
      pickIntakeField(row, ["duration", "duration_text", "durationText"]),
    ),
    description: descriptionText,
    likeCount: intakeCount(
      pickIntakeField(row, [
        "aweme.digg_count",
        "digg_count",
        "liked_count",
        "like_count",
        "likeCount",
      ]),
    ),
    playCount: intakeCount(
      pickIntakeField(row, [
        "play_count",
        "view_count",
        "photo.view_count",
        "playCount",
        "viewCount",
      ]),
    ),
    publishedAt: intakePublished(
      pickIntakeField(row, [
        "aweme.create_time",
        "create_time",
        "timestamp",
        "publishedAt",
        "published_at",
        "createTime",
        "publish_time",
      ]),
    ),
    creatorId: creatorIdRaw || secUid,
    creatorUrl: normalizeUrl(creatorUrl),
    creatorName: intakeString(
      pickIntakeField(row, [
        "author.nickname",
        "nickname",
        "user_name",
        "author.name",
        "creatorName",
        "creator_name",
      ]),
    ),
    coverUrl: intakeString(
      pickIntakeField(row, ["video_cover", "cover_url", "coverUrl", "cover"]),
    ),
    videoFileUrl: intakeString(
      pickIntakeField(row, [
        "video_play_url",
        "video_file_url",
        "videoFileUrl",
        "play_url",
        "playUrl",
      ]),
    ),
    // v4.37 新增 6 项（best-effort，取不到留空）；v4.53 补扩展实际
    // 用的快手 key：author.user_define_id（快手号）/ author.fan_count
    // （粉丝数）/ author.like_count（获赞）/ author.user_text（达人
    // 简介）——点号 key 既可能是字面 key 也可能是 author 嵌套对象，
    // pickIntakeField 两种都试。
    kuaishouId: intakeString(
      pickIntakeField(row, [
        "author.user_define_id",
        "kuaishou_id",
        "kuaishouId",
        "kwai_id",
        "author.kuaishou_id",
      ]),
    ),
    fansCount: intakeCount(
      pickIntakeField(row, [
        "author.fan_count",
        "fans_count",
        "follower_count",
        "fansCount",
        "followers",
        "author.fans_count",
      ]),
    ),
    totalLikeCount: intakeCount(
      pickIntakeField(row, [
        "author.like_count",
        "total_like_count",
        "liked_total",
        "total_likes",
        "totalLikeCount",
        "author.liked_count",
      ]),
    ),
    creatorBio: intakeString(
      pickIntakeField(row, [
        "author.user_text",
        "author.bio",
        "bio",
        "creator_bio",
        "creatorBio",
        "signature",
        "author.signature",
      ]),
    ),
    commentCount: intakeCount(
      pickIntakeField(row, [
        "comment_count",
        "commentCount",
        "comments",
        "aweme.comment_count",
      ]),
    ),
    collectedAt: intakePublished(
      pickIntakeField(row, [
        "collected_at",
        "collectedAt",
        "collect_time",
        "collectTime",
        "report_time",
      ]),
    ),
  };
}

function formatPublished(iso: string | null): string {
  if (!iso) return "时间未填";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "时间未填";
  // 快手的发布时间是北京时间：固定按 Asia/Shanghai 显示，用户填的
  // 「2026-11-03 17:59」在卡上就还是 17:59，不随查看设备时区漂移。
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

// 把描述里的 #话题 拆出来单独成行，标题本体更醒目。
function splitDescription(desc: string): { title: string; tags: string[] } {
  const tags: string[] = [];
  const title = desc
    .replace(/#[^\s#]+/g, (m) => {
      tags.push(m);
      return " ";
    })
    .replace(/\s+/g, " ")
    .trim();
  return { title: title || desc, tags };
}

// ---------------------------------------------------------------------------
// v4.60 悬浮播放降级：快手视频文件链接（video_play_url）是带签名的
// 临时直链，会过期，过期后 403，<video> 只会一直转圈。播放器加载
// 出错（error 事件）或 10 秒内没出画面（loadeddata 前）时，把「播
// 不了」说清楚，并给一个大的「去快手看原视频」按钮跳原片；能正常
// 播时不显示任何状态标注。这是快手侧的时效限制，长期只能重新采集
// 刷新链接。监控页与分析模仿页的悬浮窗共用这一套（分析页从本文件
// 导入）。
// ---------------------------------------------------------------------------
export function useVideoPlayFailed(src: string): {
  failed: boolean;
  markLoaded: () => void;
  markFailed: () => void;
} {
  const [failed, setFailed] = useState(false);
  const loadedRef = useRef(false);
  useEffect(() => {
    loadedRef.current = false;
    setFailed(false);
    if (!src) return;
    const t = setTimeout(() => {
      if (!loadedRef.current) setFailed(true);
    }, 10000);
    return () => clearTimeout(t);
  }, [src]);
  return {
    failed,
    markLoaded: () => {
      loadedRef.current = true;
    },
    markFailed: () => setFailed(true),
  };
}

export function VideoPlayFailedNotice({
  videoUrl,
  title,
}: {
  videoUrl: string;
  title: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 bg-black px-4 py-8 text-center">
      <p className="text-sm leading-relaxed text-white/90">
        视频直链已过期（快手链接有时效），请点下方按钮去快手看原片
      </p>
      {videoUrl ? (
        <a
          href={videoUrl}
          target="_blank"
          rel="noreferrer"
          className="btn btn-lg btn-primary font-bold"
          aria-label={`去快手看原视频：${title}`}
        >
          去快手看原视频
        </a>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// v4.64 云端存储进度条：监控页顶部一条，调 getCloudStorage（对应
// brief 的 GET /api/cloud-storage），显示「已用 XGB / 8GB（N%）」+
// 视频条数，每 60 秒自动刷新一次。深色样式：超 80% 变黄、超 95%
// 变红；XGB 保留 1 位小数。数据没回来 / 云端不可用时整条不渲染，
// 不占版面也不报错（60 秒后还会再拉）。
// v4.68 文案口径：条数改「云端共 N 条视频」——N 严格等于接口回的
// video_count（云端文件总数 = state.json downloaded 条数），与
// 「云端已存」tab 括号里的 M（有卡片的云端视频数、交集）区分开。
// ---------------------------------------------------------------------------
function CloudStorageBar() {
  const storageQuery = useQuery({
    queryKey: ["cloud-storage"],
    queryFn: () => withReadTimeout(() => api.getCloudStorage({})),
    retry: retryReadQuery,
    refetchInterval: 60_000,
  });
  const data = storageQuery.data;
  if (!data) return null;
  const quota = data.quota_bytes;
  const used = data.used_bytes;
  const pct = quota > 0 ? (used / quota) * 100 : 0;
  const usedGb = (used / 1073741824).toFixed(1);
  const quotaGb = String(Math.round(quota / 1073741824));
  const pctText = pct >= 10 ? String(Math.round(pct)) : pct.toFixed(1);
  const barColor = pct > 95 ? "#f87171" : pct > 80 ? "#facc15" : "#34d399";
  return (
    <div
      className="mt-2 rounded-lg border border-[var(--border)] bg-[#0b1220] px-3 py-2 text-slate-200"
      role="status"
      aria-label="云端视频存储用量"
    >
      <div className="flex flex-wrap items-center gap-x-2 text-[13px] leading-5">
        <span className="font-semibold">云端存储</span>
        <span>
          已用 {usedGb}GB / {quotaGb}GB（{pctText}%）
        </span>
        <span className="text-slate-400">· 云端共 {data.video_count} 条视频</span>
      </div>
      <div
        className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/10"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        aria-label="云端存储已用比例"
      >
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.min(100, pct)}%`, background: barColor }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// v4.67 云端后台队列状态：渲染在存储进度条正下方的一条常驻小状态。
// 数据来自服务端 getCloudQueueStatus（queue.json 最新批次），每
// 4 秒轮询一次——后台下载进程在服务端独立跑，这条状态刷新页面
// 也不会丢（队列持久化在文件里）。运行中显示「后台存入中 x/y」
//（x = 已完成条数 success+failed、y = 本批总数），点它展开看每
// 条的状态（排队中 / 存入中 / 成功 / 失败 + 失败原因）。全部跑
// 完后小状态变成完成汇总，并经 onToast 弹一次「后台存入完成：
// 成功 N 条，失败 M 条」（localStorage 记已弹过的 batch_id，刷
// 新不重复弹；完成时页面没开着，下次打开补弹一次）。有新存成
// 功时顺带刷云端清单与存储进度条，让卡片「已存」标识跟上。
// v4.69 失败清单可见：整批跑完除 toast 汇总外，自动弹一次结果
// 清单悬浮窗 CloudQueueResultModal；完成态的状态条点开也是这个
// 窗（运行中仍是原地展开每条状态）。窗里成功列表绿色勾可折
// 叠，失败列表红色叉 + 标题 + 失败原因，每条失败带「重试」、
// 底部有「重试全部失败」——都走 retryCloudQueueFailed 只重置
// 失败条目，已成功的绝不重下。
// v5.69 弹窗触发口径收紧（用户 2026-11-10 01:08 亲口定）：旧版
// 靠 localStorage 记「已弹过的 batch_id+finished_at」、页面打开
// 时读到已完成批次没记过就补弹——实际环境里这份 localStorage
// 记录跨打开留不住，结果每次打开监控页都弹。改成纯本页会话内
// 触发：只有本页亲眼看着这批从「运行中」走到「完成」（用户刚
// 点了存云端 / 重试、本轮刚跑完）才自动弹一次；页面打开时批次
// 就已经完成的，永不自动弹，只能点状态条「看清单」手动打开。
// 触发状态只活在本组件的 ref 里，关窗即了，刷新 / 切走再切回
// 都不会再触发。
// ---------------------------------------------------------------------------
const CLOUD_QUEUE_TOASTED_KEY = "cloud-queue-toasted-batch-v1";

type CloudQueueItemView = {
  id: string;
  videoId: string;
  title: string;
  creatorName: string;
  status: string;
  error: string | null;
  attempts: number;
  size_bytes: number;
};

// v4.69 存云端结果清单悬浮窗（深色，与队列状态条同一套 #0b1220
// 深色面）：上半失败区（红叉 + 标题 + 达人 + 失败原因 + 单条重
// 试），下半成功区（绿勾 + 标题，整区可折叠，有失败时默认收
// 起），底部「重试全部失败」（无失败时不渲染）+「关闭」。重试
// 触发后由父组件关窗并把状态条切回「后台存入中」。
function CloudQueueResultModal({
  items,
  success,
  failed,
  retryingIds,
  retryingAll,
  onRetryItem,
  onRetryAll,
  onClose,
}: {
  items: CloudQueueItemView[];
  success: number;
  failed: number;
  retryingIds: Set<string>;
  retryingAll: boolean;
  onRetryItem: (id: string) => void;
  onRetryAll: () => void;
  onClose: () => void;
}) {
  const [successOpen, setSuccessOpen] = useState(failed === 0);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const failedItems = items.filter((it) => it.status === "failed");
  const successItems = items.filter((it) => it.status === "success");
  const anyRetrying = retryingAll || retryingIds.size > 0;
  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="存云端结果清单：成功与失败列表，失败可重试"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-white/15 bg-[#0b1220] text-slate-200 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-2.5 p-3 pb-2">
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold">存云端结果</p>
            <p className="mt-0.5 text-xs text-slate-400">
              成功 {success} 条，失败 {failed} 条
              {failed > 0 && "——失败的在下面写清了原因，可以直接重试"}
            </p>
          </div>
          <button
            type="button"
            className="shrink-0 rounded border border-white/20 px-2 py-1 text-xs font-bold text-slate-200"
            onClick={onClose}
            aria-label="关闭存云端结果清单"
          >
            关闭 ✕
          </button>
        </div>
        <div
          className="border-t border-white/10 px-3 py-2"
          style={{ overflowY: "auto" }}
          aria-label="存云端成功与失败清单（可滚动）"
        >
          {failedItems.length > 0 && (
            <div className="mb-3">
              <p className="mb-1.5 text-[13px] font-bold" style={{ color: "#fca5a5" }}>
                失败（{failedItems.length}）
              </p>
              <div className="space-y-1.5">
                {failedItems.map((it) => {
                  const retrying = retryingAll || retryingIds.has(it.id);
                  return (
                    <div
                      key={it.id}
                      className="flex items-start gap-2 rounded bg-white/5 px-2 py-1.5"
                    >
                      <span
                        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                        style={{ background: "#b91c1c" }}
                        aria-hidden="true"
                      >
                        ✕
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold leading-5">
                          {it.title || it.videoId || "未命名视频"}
                        </span>
                        <span className="block text-xs leading-4 text-slate-400">
                          {it.creatorName || "达人未填"}
                          {it.attempts > 1 && <> · 已试过 {it.attempts} 次</>}
                        </span>
                        {it.error && (
                          <span
                            className="mt-0.5 block text-xs leading-4"
                            style={{ color: "#fca5a5" }}
                          >
                            {it.error}
                          </span>
                        )}
                      </span>
                      <button
                        type="button"
                        className="shrink-0 rounded bg-[#1d4ed8] px-2 py-1 text-[11px] font-bold leading-4 text-white disabled:opacity-50"
                        disabled={anyRetrying}
                        onClick={() => onRetryItem(it.id)}
                        aria-label={`重试存入云端：${it.title || it.videoId || "未命名视频"}`}
                      >
                        {retrying ? "重试中…" : "重试"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {successItems.length > 0 && (
            <div>
              <button
                type="button"
                className="mb-1.5 flex items-center gap-1 text-[13px] font-bold text-emerald-300"
                aria-expanded={successOpen}
                aria-label={`成功列表（${successItems.length} 条），点击${successOpen ? "折叠" : "展开"}`}
                onClick={() => setSuccessOpen((v) => !v)}
              >
                成功（{successItems.length}）{successOpen ? "▾" : "▸"}
              </button>
              {successOpen && (
                <div className="space-y-1.5">
                  {successItems.map((it) => (
                    <div
                      key={it.id}
                      className="flex items-start gap-2 rounded bg-white/5 px-2 py-1.5"
                    >
                      <span
                        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                        style={{ background: "rgba(5,150,105,0.92)" }}
                        aria-hidden="true"
                      >
                        ✓
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold leading-5">
                          {it.title || it.videoId || "未命名视频"}
                        </span>
                        <span className="block text-xs leading-4 text-slate-400">
                          {it.creatorName || "达人未填"}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {failedItems.length === 0 && successItems.length === 0 && (
            <p className="py-4 text-sm text-slate-400">这批没有可显示的条目。</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-white/10 p-3">
          <span className="ml-auto flex gap-2">
            {failedItems.length > 0 && (
              <button
                type="button"
                className="rounded bg-[#1d4ed8] px-3 py-1.5 text-[13px] font-bold text-white disabled:opacity-50"
                disabled={anyRetrying}
                onClick={onRetryAll}
                aria-label={`重试全部失败的存云端条目（共 ${failedItems.length} 条）`}
              >
                {retryingAll ? "重试中…" : `重试全部失败（${failedItems.length}）`}
              </button>
            )}
            <button
              type="button"
              className="rounded border border-white/20 px-3 py-1.5 text-[13px] font-bold text-slate-200"
              onClick={onClose}
              aria-label="关闭存云端结果清单"
            >
              关闭
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}

function CloudQueueStatus({
  onToast,
}: {
  onToast: (msg: string) => void;
}) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  // v4.69 结果清单窗：整批完成时自动弹一次，平时由完成态状态条
  // 点开；retryingIds / retryingAll 记正在提交重试的条目（防重复
  // 点），重试提交成功即关窗（队列回到运行中，状态条接管显示）。
  const [resultOpen, setResultOpen] = useState(false);
  const [retryingIds, setRetryingIds] = useState<Set<string>>(() => new Set());
  const [retryingAll, setRetryingAll] = useState(false);
  const queueQuery = useQuery({
    queryKey: ["cloud-queue"],
    queryFn: () => api.getCloudQueueStatus({}),
    refetchInterval: 4000,
  });
  const data = queueQuery.data;
  const success = data?.success ?? 0;
  const failed = data?.failed ?? 0;
  const batchId = data?.batch_id ?? null;
  const finishedAt = data?.finished_at ?? null;
  const total = data?.total ?? 0;
  const lastSuccessRef = useRef(0);
  useEffect(() => {
    if (success === lastSuccessRef.current) return;
    lastSuccessRef.current = success;
    if (success > 0) {
      queryClient.invalidateQueries({ queryKey: ["cloud-saved"] });
      queryClient.invalidateQueries({ queryKey: ["cloud-storage"] });
    }
  }, [success, queryClient]);
  const toastedBatchRef = useRef<string | null>(null);
  useEffect(() => {
    if (!data || data.running || !batchId || !finishedAt || total === 0) return;
    if (toastedBatchRef.current === batchId) return;
    let toasted = "";
    try {
      toasted = window.localStorage.getItem(CLOUD_QUEUE_TOASTED_KEY) ?? "";
    } catch {
      // localStorage 不可用时靠上面的 ref 兜底，本页内只弹一次。
    }
    if (toasted === batchId) {
      toastedBatchRef.current = batchId;
      return;
    }
    toastedBatchRef.current = batchId;
    try {
      window.localStorage.setItem(CLOUD_QUEUE_TOASTED_KEY, batchId);
    } catch {
      // 写不进不拦弹 toast。
    }
    onToast(`后台存入完成：成功 ${success} 条，失败 ${failed} 条`);
    // onToast 是父组件的 setState，稳定引用。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, batchId, finishedAt, total, success, failed]);
  // v5.69：结果清单窗只在本页会话内、本轮刚跑完时自动弹一次。
  // 触发条件（缺一不可）：①本页曾亲眼看到这批处于运行中（用户
  // 刚点了「存云端」入队、或刚点了重试，队列在本页眼皮底下跑
  // 起来过），或这批是在本页打开之后才出现的新批次（入队太快、
  // 轮询没赶上运行中那一拍时兜底）；②现在整批已完成。页面打开
  // 时就已经完成的旧批次（挂载时见到的第一批、且从没在本页跑
  // 过）永不自动弹——关窗、刷新、切走再切回都不会再弹，旧结果
  // 只留顶部状态条点「看清单」手动查看。已弹过的
  // batch_id+finished_at 记在本页 ref 里，本轮只弹一次；重试后
  // 再完成（finished_at 变了）会再弹新一轮的清单。
  const autoPopRef = useRef<{
    baselineBatch: string | null | undefined;
    armedBatch: string | null;
    poppedKey: string | null;
  }>({ baselineBatch: undefined, armedBatch: null, poppedKey: null });
  useEffect(() => {
    if (!data) return;
    const st = autoPopRef.current;
    if (st.baselineBatch === undefined) {
      // 挂载后见到的第一批 = 打开页面前就存在的批次，只作基线，
      // 它本身永不触发自动弹（除非它在本页里又跑起来，见下）。
      st.baselineBatch = batchId;
    }
    if (data.running) {
      // 本页亲眼看到这批在跑 → 武装：它跑完时弹一次。
      if (batchId) st.armedBatch = batchId;
      return;
    }
    if (!batchId || !finishedAt || total === 0) return;
    if (batchId !== st.baselineBatch) {
      // 本页打开之后才出现的新批次（用户刚入的队）→ 武装。
      st.armedBatch = batchId;
    }
    if (st.armedBatch !== batchId) return;
    const key = `${batchId}|${finishedAt}`;
    if (st.poppedKey === key) return;
    st.poppedKey = key;
    st.armedBatch = null;
    setResultOpen(true);
  }, [data, batchId, finishedAt, total]);
  // v4.69 重试：只把指定失败条目（单条传 [id]、「重试全部失败」
  // 传全部 failed 的 id）经 retryCloudQueueFailed 重置回队列，
  // 已成功的服务端一字不动。提交成功关窗 + toast，状态条随轮询
  // 回到「后台存入中 x/y」；重试跑完会再走一遍完成 toast + 清单。
  const doRetry = async (ids: string[], isAll: boolean) => {
    if (ids.length === 0) return;
    if (isAll) setRetryingAll(true);
    else setRetryingIds(new Set(ids));
    try {
      const res = await api.retryCloudQueueFailed({ itemIds: ids });
      if (res.ok && res.retried > 0) {
        onToast(`失败的 ${res.retried} 条已重新加入后台队列，正在重试`);
        setResultOpen(false);
        queryClient.invalidateQueries({ queryKey: ["cloud-queue"] });
      } else {
        onToast(`重试没成：${res.error ?? "请稍后再试"}`);
      }
    } catch (e) {
      onToast(`重试没成：${describeThrownError(e)}`);
    } finally {
      setRetryingAll(false);
      setRetryingIds(new Set());
    }
  };
  if (!data || data.total === 0) return null;
  const chipStyle = (status: string): { background: string; label: string } => {
    if (status === "success")
      return { background: "rgba(5,150,105,0.92)", label: "成功" };
    if (status === "failed") return { background: "#b91c1c", label: "失败" };
    if (status === "downloading")
      return { background: "#1d4ed8", label: "存入中" };
    return { background: "#475569", label: "排队中" };
  };
  return (
    <>
    <div
      className="mt-2 rounded-lg border border-[var(--border)] bg-[#0b1220] px-3 py-2 text-slate-200"
      role="status"
      aria-label="云端后台存入队列状态"
    >
      <button
        type="button"
        className="flex flex-wrap items-center gap-x-2 text-[13px] leading-5"
        aria-expanded={data.running ? expanded : resultOpen}
        aria-label={
          data.running
            ? `后台存入中 ${data.done}/${data.total}，点击${expanded ? "收起" : "展开"}查看每条状态`
            : `后台存入完成：成功 ${success} 条，失败 ${failed} 条，点击查看成功和失败清单`
        }
        onClick={() => {
          // v4.69：运行中点开仍是原地展开每条状态；完成后点开
          // 结果清单悬浮窗（成功/失败分开列、失败可重试）。
          if (data.running) setExpanded((v) => !v);
          else setResultOpen(true);
        }}
      >
        {data.running ? (
          <>
            <span
              className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-400"
              aria-hidden="true"
            />
            <span className="font-semibold">
              后台存入中 {data.done}/{data.total}
            </span>
          </>
        ) : (
          <span className="font-semibold">
            后台存入完成：成功 {success} 条，失败 {failed} 条
          </span>
        )}
        <span className="text-slate-400">
          {data.running ? (expanded ? "收起 ▾" : "每条状态 ▸") : "看清单 ▸"}
        </span>
      </button>
      {expanded && data.running && (
        <div
          className="mt-2 space-y-1.5"
          style={{ maxHeight: "40vh", overflowY: "auto" }}
          aria-label="后台存入队列每条状态（可滚动）"
        >
          {data.items.map((it) => {
            const chip = chipStyle(it.status);
            return (
              <div
                key={it.id}
                className="flex items-start gap-2 rounded bg-white/5 px-2 py-1.5"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold leading-5">
                    {it.title || it.videoId || "未命名视频"}
                  </span>
                  <span className="block text-xs leading-4 text-slate-400">
                    {it.creatorName || "达人未填"}
                    {it.attempts > 1 && <> · 已重试 {it.attempts - 1} 次</>}
                  </span>
                  {it.status === "failed" && it.error && (
                    <span
                      className="mt-0.5 block text-xs leading-4"
                      style={{ color: "#fca5a5" }}
                    >
                      {it.error}
                    </span>
                  )}
                </span>
                <span
                  className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold leading-4 text-white"
                  style={{ background: chip.background }}
                >
                  {chip.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
    {resultOpen && !data.running && (
      <CloudQueueResultModal
        items={data.items}
        success={success}
        failed={failed}
        retryingIds={retryingIds}
        retryingAll={retryingAll}
        onRetryItem={(id) => void doRetry([id], false)}
        onRetryAll={() =>
          void doRetry(
            data.items.filter((it) => it.status === "failed").map((it) => it.id),
            true,
          )
        }
        onClose={() => setResultOpen(false)}
      />
    )}
    </>
  );
}

// ---------------------------------------------------------------------------
// v4.88 待解剖队列条：监控页顶部（云端后台队列状态条正下方）常驻。
// 数据来自服务端 getDissectQueue（monitor_meta 持久化，刷新不丢）：
// 标题行「待解剖（N）」N = 还没解剖的条数；展开逐条看标题 / 达人 /
// 加入时间 / 状态——已解剖的（聊天解剖做完、分析记录里已有带结果
// 的同 videoId 记录，服务端实时判定）显示绿色「已解剖 ✓」并给出
// 去处（有已套用项目 → 打开项目；否则 → 查看分析记录）；待解剖
// 的可「重新复制指令」（按 videoId 在当前 feed 里找卡片重组指令，
// 卡片已被删的提示已删）；每条都能「移除」（只删队列条目）。
// 空队列也常驻显示「待解剖（0）」，入口一直找得到。
// ---------------------------------------------------------------------------
function DissectQueueBar({
  onToast,
  onCopyFallback,
  findVideo,
  onOpenProject,
  onOpenAnalysisRecord,
}: {
  onToast: (msg: string) => void;
  onCopyFallback: (text: string) => void;
  findVideo: (
    videoId: string,
  ) => { video: FeedVideo; creatorName: string } | null;
  onOpenProject?: (projectId: number) => void;
  onOpenAnalysisRecord?: (videoId: string) => void;
}) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const queueQuery = useQuery({
    queryKey: ["dissect-queue"],
    queryFn: () => withReadTimeout(() => api.getDissectQueue({})),
    retry: retryReadQuery,
  });
  const items = queueQuery.data?.items ?? [];
  const pendingCount = items.filter((it) => !it.dissected).length;
  const doneCount = items.length - pendingCount;

  // 队列还没加载完先不渲染（避免闪一帧空队列）；加载完后即使
  // 是空队列也常驻显示「待解剖（0）」，让入口一直找得到。
  if (!queueQuery.data) return null;

  const handleRecopy = async (videoId: string) => {
    const found = findVideo(videoId);
    if (!found) {
      onToast("这条视频的卡片已经不在监控页了，没法重组解剖指令。");
      return;
    }
    const text = buildDissectInstruction(found.video, found.creatorName);
    const ok = await copyTextToClipboard(text);
    if (ok) onToast("已复制解剖指令，去聊天框粘贴发送");
    else onCopyFallback(text);
  };

  const handleRemove = async (videoId: string) => {
    setRemovingId(videoId);
    try {
      await api.removeDissectQueueItem({ videoId });
      queryClient.invalidateQueries({ queryKey: ["dissect-queue"] });
      onToast("已从待解剖队列移除");
    } catch (e) {
      onToast(`移除没成：${describeThrownError(e)}`);
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div
      className="mt-2 rounded-lg border border-[var(--border)] bg-[#0b1220] px-3 py-2 text-slate-200"
      role="status"
      aria-label="待解剖队列"
    >
      <button
        type="button"
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-left"
        aria-expanded={expanded}
        aria-label={
          expanded
            ? "收起待解剖队列列表"
            : `展开待解剖队列列表（待解剖 ${pendingCount} 条，已解剖 ${doneCount} 条）`
        }
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="text-sm font-bold">
          待解剖（{pendingCount}）
        </span>
        {doneCount > 0 && (
          <span className="text-xs" style={{ color: "#34d399" }}>
            已解剖 {doneCount} 条
          </span>
        )}
        <span className="text-xs text-slate-400">
          点卡片上的「发送到聊天解剖」会把视频排进这里，去聊天框粘贴指令就能开工
        </span>
        <span className="ml-auto text-xs text-slate-400">
          {expanded ? "收起 ▾" : "展开 ▸"}
        </span>
      </button>
      {expanded && items.length === 0 && (
        <p className="mt-2 text-[13px] leading-5 text-slate-400">
          队列是空的——在下面的视频卡片上点「发送到聊天解剖」，视频就会排进来。
        </p>
      )}
      {expanded && items.length > 0 && (
        <ul
          className="mt-2 space-y-1.5 overflow-y-auto"
          style={{ maxHeight: "40vh" }}
          aria-label="待解剖队列列表"
        >
          {items.map((it) => (
            <li
              key={it.videoId}
              className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md bg-white/5 px-2 py-1.5"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold leading-5">
                  {it.title || it.videoId}
                </span>
                <span className="block text-xs leading-4 text-slate-400">
                  {it.creatorName || "达人未填"}
                  {it.addedAt
                    ? ` · 加入 ${formatDetailTime(it.addedAt)}`
                    : ""}
                </span>
              </span>
              {it.dissected ? (
                <>
                  <span
                    className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold leading-4 text-white"
                    style={{ background: "rgba(5,150,105,0.92)" }}
                  >
                    已解剖 ✓
                  </span>
                  {it.appliedProjectId !== null && onOpenProject && (
                    <button
                      type="button"
                      className="btn btn-sm shrink-0"
                      aria-label={`打开已套用的项目：${it.title || it.videoId}`}
                      onClick={() => {
                        if (it.appliedProjectId !== null) {
                          onOpenProject(it.appliedProjectId);
                        }
                      }}
                    >
                      打开项目
                    </button>
                  )}
                  {onOpenAnalysisRecord && (
                    <button
                      type="button"
                      className="btn btn-sm shrink-0"
                      aria-label={`查看分析记录：${it.title || it.videoId}`}
                      onClick={() => onOpenAnalysisRecord(it.videoId)}
                    >
                      查看记录
                    </button>
                  )}
                </>
              ) : (
                <>
                  <span
                    className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold leading-4 text-white"
                    style={{ background: "#475569" }}
                  >
                    待解剖
                  </span>
                  <button
                    type="button"
                    className="btn btn-sm shrink-0"
                    aria-label={`重新复制解剖指令：${it.title || it.videoId}`}
                    onClick={() => void handleRecopy(it.videoId)}
                  >
                    复制指令
                  </button>
                </>
              )}
              <button
                type="button"
                className="btn btn-danger-ghost btn-sm shrink-0"
                disabled={removingId === it.videoId}
                aria-label={`从待解剖队列移除：${it.title || it.videoId}`}
                onClick={() => void handleRemove(it.videoId)}
              >
                {removingId === it.videoId ? "移除中…" : "移除"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// v4.65 云端清单 at 字段解析：state.json 里的 at 可能是 ISO 串
// 或数字毫秒——都换算成毫秒数排序，解析不了按 0（排最后）。
function parseCloudSavedAt(at: string): number {
  if (!at) return 0;
  const n = Number(at);
  if (Number.isFinite(n) && n > 0) return n;
  const t = Date.parse(at);
  return Number.isNaN(t) ? 0 : t;
}

function VideoPlayerModal({
  video,
  creatorName,
  onClose,
  cloudOnly = false,
}: {
  video: FeedVideo;
  creatorName: string;
  onClose: () => void;
  // v4.65：「云端已存」视图专用——只播云端地址（getCloudVideo
  // ≙ /api/cloud-video/:videoId），不回退快手直链；云端没读到
  // 就明示，不静默换源。
  cloudOnly?: boolean;
}) {
  const { title } = splitDescription(video.description);
  // v4.64 云端优先：先查云端有没有这条视频的文件，有就播云端
  //（同源、不过期），没有再回退快手直链走 v4.60 过期降级。
  const cloud = useCloudVideoSource(
    video.videoId,
    cloudOnly ? "" : video.videoFileUrl,
  );
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
            <p className="truncate text-[15px] font-bold">{title || "视频播放"}</p>
            <p className="mt-0.5 text-xs text-[var(--dim)]">
              {creatorName || "达人未填"}
              {video.durationText && <> · 时长 {video.durationText}</>}
              {" · "}发布于 {formatPublished(video.publishedAt)}
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
        ) : cloudOnly && !cloud.isCloud ? (
          <div className="flex items-center justify-center bg-black px-4 py-10 text-center text-sm leading-6 text-white/80">
            云端文件没读到——可能正在写入或已被删除，请关掉这个窗口稍后再打开试试。
          </div>
        ) : play.failed ? (
          <VideoPlayFailedNotice videoUrl={video.videoUrl} title={title} />
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
        )}
        <div className="flex flex-wrap items-center gap-2 p-3.5 pt-2.5">
          <span className="text-[13px] text-[var(--dim)]">
            播放 {formatCount(video.playCount)} · 点赞 {formatCount(video.likeCount)}
          </span>
          {video.videoUrl && (
            <a
              href={video.videoUrl}
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

// 详情窗里的时间按粘贴原文的「YYYY-MM-DD HH:mm」样子渲染（北京
// 时间）；没有就留空（formatPublished 的「时间未填」是卡面文案，
// 原文块里不用）。
function formatDetailTime(iso: string | null): string {
  if (!iso) return "";
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

// v5.55 清理记录用的时间格式：毫秒数 → 北京时间「YYYY-MM-DD HH:mm」。
function formatCleanupTimeMs(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return "—";
  return formatDetailTime(new Date(ms).toISOString());
}

type CleanupCandidate = ApiResponse<
  typeof api,
  "previewMonitorCleanup"
>["candidates"][number];

// 把一张卡拼回粘贴原文的样子：18 项、每行一项「字段名：值」，
// 顺序与扩展采集输出一致；多行值（描述 / 简介）原样带换行，
// 缺失项值留空。数字按原文习惯带千分位逗号，0 视作没填留空。
function buildDetailText(
  video: FeedVideo,
  creatorName: string,
  creatorId: string,
  creatorUrl: string,
): string {
  const count = (n: number) => (n > 0 ? formatCount(n) : "");
  const lines: [string, string][] = [
    ["视频ID", video.videoId],
    ["视频链接", video.videoUrl],
    ["视频时长", video.durationText],
    ["视频描述", video.description],
    ["点赞量", count(video.likeCount)],
    ["播放量", count(video.playCount)],
    ["发布时间", formatDetailTime(video.publishedAt)],
    ["达人ID", creatorId],
    ["达人链接", creatorUrl],
    ["达人昵称", creatorName],
    ["视频封面链接", video.coverUrl],
    ["视频文件链接", video.videoFileUrl],
    ["快手号", video.kuaishouId],
    ["粉丝数", count(video.fansCount)],
    ["获赞", count(video.totalLikeCount)],
    ["达人简介", video.creatorBio],
    ["评论量", count(video.commentCount)],
    ["采集时间", formatDetailTime(video.collectedAt)],
  ];
  return lines.map(([label, value]) => `${label}：${value}`).join("\n");
}

// 复制一段文本：优先 clipboard API，不可用时退回临时文本框 +
// execCommand。详情窗的整段复制与逐项复制共用这一份。
async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // 剪贴板 API 不可用时退回老办法。
  }
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

// ---------------------------------------------------------------------------
// v4.88 发送到聊天解剖：卡片按钮点下去，先查云端清单——有云端文件
// 才组装这段结构化解剖指令复制到剪贴板，用户去聊天框粘贴发送，
// 聊天里的助手按指令里的规则精修解剖，做完存分析记录 + 一键套用
// 成新项目。工作台不传文件字节、不生成分享链接：助手与工作台在
// 同一台机器上，按云端路径直接读 ~/workspace/video-cloud/videos/
// {videoId}.mp4。规则提示词全文写死在这里，一字不改口径。
// v5.58：规则全文升级到项目 41 聊天精修标准（用户 2026-11-09 18:35
// 亲口定）：tiny ASR 定时间轴与台词条数（ASR 文字只是草稿）＋ 1fps
// 逐帧读烧录字幕核对（字幕为准）＋易错处 3fps 复核；说话人按口型／
// 画面构图／语义闭环对位，对不上标存疑（lowConfidence）；人物上限
// 由旧「2~4 主角」改为最多 10 位；分镜 groups 的 sceneName 必须与
// 资产 scenes 的 name 逐字相同；actionSeconds 必须用整数；输出另加
// 两份 MiniMax H3 六段式中文提示词（按剧情版、每镜 10–15 秒版，
// v5.90 起第 2 版改按转折点切割的 10–15 秒版，原 20–30 秒版下线）；
// 套用用裸标题。旧规则全文下线，本常量是唯一出口，队列「复制指令」
// 与指令全文窗都经 buildDissectInstruction 复用同一份。
// ---------------------------------------------------------------------------
const DISSECT_CHAT_RULES =
  "请按聊天精修方法做 1:1 复刻解剖，规则如下（项目 41 同款标准，一条不许少）：\n" +
  "1. 核台词：先用 tiny ASR 定时间轴与台词条数，ASR 文字只是草稿；再以 1fps 逐帧读烧录字幕核对台词，字幕与 ASR 对不上时以字幕为准；易错处（快语速、重叠说话、谐音梗、生僻字）用 3fps 复核。\n" +
  "2. 对说话人：说话人按口型、画面构图、语义闭环对位；对不上的句标存疑（lowConfidence），绝不编造台词、不靠看图猜台词；最后数一遍台词总数，跟时间轴对上。\n" +
  "3. 台词口径：台词仅配音、不烧录字幕；台词一字不差。\n" +
  "4. 人物锁定：人物严格锁定，A/B/C/D 与外貌一一对应，严禁互换串演。\n" +
  "5. 人物筛选：人物只取最多 10 位主角，按台词量＋出镜时长排序，龙套过滤。\n" +
  "6. 场景与道具：场景逐个写详细提示词；分镜 groups 的 sceneName 必须与资产 scenes 的 name 逐字相同；道具有特殊才加，无则不加。\n" +
  "7. 时长口径：actionSeconds 必须用整数。\n" +
  "8. 输出：剧本格式01分镜表＋资产清单＋转写原文＋两份 MiniMax H3 六段式中文提示词（按剧情版、每镜 10–15 秒版：按剧情切割、攒够 10 秒后在转折点换镜、每镜 10–15 秒；同一个动作没做完不切新镜头——切镜等动作做完、一个动作的节拍整段放在同一镜里）。\n" +
  "9. 存档套用：做完按分析模仿页现有记录格式存入分析记录，并用裸标题一键套用成新项目。";

function buildDissectInstruction(
  video: FeedVideo,
  creatorName: string,
): string {
  const { title } = splitDescription(video.description);
  const displayTitle = title || video.videoId || "未命名视频";
  const creatorLine = video.kuaishouId
    ? `${creatorName || "达人未填"}（快手号：${video.kuaishouId}）`
    : creatorName || "达人未填";
  const lines = [
    "请帮我解剖这个视频（聊天精修解剖）：",
    "",
    `视频ID：${video.videoId}`,
    `标题：${displayTitle}`,
    `时长：${video.durationText || "未填"}`,
    `达人：${creatorLine}`,
    `发布时间：${formatDetailTime(video.publishedAt) || "未填"}`,
    `点赞：${formatCount(video.likeCount)} · 播放：${formatCount(video.playCount)}`,
    `描述/话题：${video.description || "（无）"}`,
    `云端文件：~/workspace/video-cloud/videos/${video.videoId}.mp4`,
    "",
    DISSECT_CHAT_RULES,
  ];
  return lines.join("\n");
}

// 已解剖标记：某 videoId 在分析记录里已有带解剖结果的记录时，
// 卡片与队列据此显示「已解剖 ✓」并链接过去（appliedProjectId
// 有值优先跳项目，否则打开那条分析记录）。
type DissectedLink = {
  analysisId: number;
  appliedProjectId: number | null;
};

// 逐项复制小按钮：复制成功后短暂显示「已复制」。
function FieldCopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <button
      type="button"
      className="btn btn-sm shrink-0"
      aria-label={`复制${label}`}
      onClick={() => {
        void copyTextToClipboard(value).then((ok) => {
          if (ok) setCopied(true);
        });
      }}
    >
      {copied ? "已复制 ✓" : "复制"}
    </button>
  );
}

// 信息行：左标签 + 单行截断的值 + 复制按钮（长链接不许全文铺屏）。
function DetailCopyRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-[72px] shrink-0 text-xs text-[var(--dim)]">{label}</span>
      <span
        className="min-w-0 flex-1 truncate text-[13px]"
        title={value}
      >
        {value}
      </span>
      <FieldCopyButton value={value} label={label} />
    </div>
  );
}

function VideoDetailModal({
  video,
  creatorName,
  creatorId,
  creatorUrl,
  onClose,
  onPrefillAnalysis,
}: {
  video: FeedVideo;
  creatorName: string;
  creatorId: string;
  creatorUrl: string;
  onClose: () => void;
  // v4.88：旧「卡片分析 → 预填到分析模仿页」入口搬家到这里——
  // 封面按钮已按用户定案改走「发送到聊天解剖」，想手动在分析
  // 模仿页建一条预填记录时从详情窗进，功能不减。
  onPrefillAnalysis?: () => void;
}) {
  // 标题取视频描述首行（去掉其中的 #话题，话题单独成徽标行）。
  const firstLine = (video.description ?? "").split(/\r?\n/)[0]?.trim() ?? "";
  const { title: descTitle, tags } = splitDescription(video.description);
  const title =
    firstLine.replace(/#[^\s#]+/g, "").replace(/\s+/g, " ").trim() ||
    descTitle ||
    video.videoId ||
    "未命名视频";
  const detailText = buildDetailText(video, creatorName, creatorId, creatorUrl);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [coverFailed, setCoverFailed] = useState(false);
  const coverSrc =
    video.videoId === SAMPLE_VIDEO_ID
      ? sampleCover
      : coverFailed
        ? ""
        : video.coverUrl;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);
  const copyDetail = async () => {
    setCopyFailed(false);
    const ok = await copyTextToClipboard(detailText);
    if (ok) setCopied(true);
    else setCopyFailed(true);
  };
  // 核心数据徽标：缺哪个藏哪个，全缺整行不渲染。
  const badges: { label: string; value: string }[] = [];
  if (video.durationText) badges.push({ label: "时长", value: video.durationText });
  if (video.playCount > 0) badges.push({ label: "播放", value: formatCount(video.playCount) });
  if (video.likeCount > 0) badges.push({ label: "点赞", value: formatCount(video.likeCount) });
  if (video.commentCount > 0) badges.push({ label: "评论", value: formatCount(video.commentCount) });
  const publishedText = formatDetailTime(video.publishedAt);
  if (publishedText) badges.push({ label: "发布", value: publishedText });
  const hasVideoInfo = Boolean(video.videoId || video.videoUrl);
  const fansLine: string[] = [];
  if (video.fansCount > 0) fansLine.push(`粉丝 ${formatCount(video.fansCount)}`);
  if (video.totalLikeCount > 0) fansLine.push(`获赞 ${formatCount(video.totalLikeCount)}`);
  const hasCreatorInfo = Boolean(
    creatorName || video.kuaishouId || fansLine.length > 0 || video.creatorBio,
  );
  const hasMoreLinks = Boolean(video.coverUrl || video.videoFileUrl);
  const collectedText = formatDetailTime(video.collectedAt);
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`视频详情：${title}`}
      onClick={onClose}
    >
      <div
        className="card flex max-h-[88vh] w-full max-w-2xl flex-col p-0"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部：小封面 + 标题 + 话题徽标；右上复制 / 关闭 */}
        <div className="flex items-start gap-2.5 p-2.5 pb-2">
          {coverSrc ? (
            <img
              src={coverSrc}
              alt={`视频封面：${title}`}
              className="aspect-[3/4] w-11 shrink-0 rounded-md object-cover"
              loading="lazy"
              onError={() => setCoverFailed(true)}
            />
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-bold">{title}</p>
            {tags.length > 0 && (
              <p className="mt-0.5 flex flex-wrap gap-1">
                {tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-full px-1.5 py-0.5 text-[11px]"
                    style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
                  >
                    {t}
                  </span>
                ))}
              </p>
            )}
          </div>
          {onPrefillAnalysis && (
            <button
              type="button"
              className="btn btn-sm shrink-0"
              onClick={onPrefillAnalysis}
              aria-label="把这条视频预填到分析模仿页新建一条分析"
            >
              预填到分析模仿页
            </button>
          )}
          <button
            type="button"
            className="btn btn-sm shrink-0"
            onClick={() => void copyDetail()}
            aria-label="复制这条视频的18项详情全文"
          >
            {copied ? "已复制 ✓" : "复制"}
          </button>
          <button
            type="button"
            className="btn btn-sm shrink-0"
            onClick={onClose}
            aria-label="关闭视频详情"
          >
            关闭 ✕
          </button>
        </div>
        {copyFailed && (
          <p className="px-3.5 pb-1 text-xs" style={{ color: "var(--bad)" }} role="alert">
            没复制成——请再点一次「复制」，或逐项用行尾的复制按钮。
          </p>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-2.5">
          {/* 核心数据一行徽标 */}
          {badges.length > 0 && (
            <div className="flex flex-wrap gap-1.5" aria-label="核心数据">
              {badges.map((b) => (
                <span
                  key={b.label}
                  className="rounded-full bg-[var(--surface-alt)] px-2 py-1 text-xs whitespace-nowrap"
                >
                  <span className="text-[var(--dim)]">{b.label} </span>
                  <strong>{b.value}</strong>
                </span>
              ))}
            </div>
          )}
          {/* 视频信息 */}
          {hasVideoInfo && (
            <section aria-label="视频信息" className="mt-2.5">
              <h3 className="mb-1 text-xs font-bold text-[var(--dim)]">视频信息</h3>
              <div className="flex flex-col gap-1">
                {video.videoId && <DetailCopyRow label="视频ID" value={video.videoId} />}
                {video.videoUrl && <DetailCopyRow label="视频链接" value={video.videoUrl} />}
              </div>
            </section>
          )}
          {/* 达人信息 */}
          {hasCreatorInfo && (
            <section aria-label="达人信息" className="mt-2.5">
              <h3 className="mb-1 text-xs font-bold text-[var(--dim)]">达人信息</h3>
              {creatorName && (
                <p className="text-sm">
                  <strong>{creatorName}</strong>
                  {video.kuaishouId && (
                    <span className="text-[var(--dim)]">（快手号 {video.kuaishouId}）</span>
                  )}
                </p>
              )}
              {!creatorName && video.kuaishouId && (
                <p className="text-sm text-[var(--dim)]">快手号 {video.kuaishouId}</p>
              )}
              {fansLine.length > 0 && (
                <p className="mt-0.5 text-[13px]">{fansLine.join(" · ")}</p>
              )}
              {video.creatorBio && (
                <p className="mt-0.5 text-[13px] leading-[1.3] whitespace-pre-wrap">
                  {video.creatorBio}
                </p>
              )}
            </section>
          )}
          {/* 更多链接：长链接默认收起，展开后单行截断 + 复制 */}
          {hasMoreLinks && (
            <section aria-label="更多链接" className="mt-2.5">
              <button
                type="button"
                className="btn btn-sm"
                aria-expanded={moreOpen}
                aria-label={moreOpen ? "收起更多链接" : "展开更多链接"}
                onClick={() => setMoreOpen((v) => !v)}
              >
                更多链接 {moreOpen ? "▾" : "▸"}
              </button>
              {moreOpen && (
                <div className="mt-1.5 flex flex-col gap-1">
                  {video.coverUrl && (
                    <DetailCopyRow label="封面链接" value={video.coverUrl} />
                  )}
                  {video.videoFileUrl && (
                    <>
                      <DetailCopyRow label="视频文件" value={video.videoFileUrl} />
                      <p className="pl-[80px] text-[11px] text-[var(--dim)]">
                        链接有时效，过期请重新采集
                      </p>
                    </>
                  )}
                </div>
              )}
            </section>
          )}
          {/* 底部小字：采集时间 */}
          {collectedText && (
            <p className="mt-2.5 text-[11px] text-[var(--dim)]">采集时间：{collectedText}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 卡片三款设计（v4.51 版式推倒重做）：极简信息流 minimal（默认）/
// 大图视觉 visual / 紧凑数据 data。横排卡（CompactVideoCard）与
// 按达人分组卡（VideoCard）共用同一个渲染核 MonitorCardCore，差异
// 只在按钮（分组卡多一个「删除」）。卡内所有字号、行高、间距、
// 按钮文字与图标（▶ / 👍 等）都经 sz() 按等比档位同步缩放——卡片
// 缩到 0.5 档时按钮文字与 emoji 也同步缩到一半，不保持原大小；
// 封面宽高比恒 3:4（data 款的封面条是 16:9 视觉提示，见该分支）。
// ---------------------------------------------------------------------------

function sz(base: number, s: number): number {
  return Math.max(1, Math.round(base * s * 10) / 10);
}

function MonitorCardButtons({
  video,
  title,
  onPlay,
  onDetail,
  onDelete,
  onRefresh,
  refreshing = false,
  refreshFailed = false,
  s,
  marginTop,
}: {
  video: FeedVideo;
  title: string;
  onPlay: (v: FeedVideo) => void;
  onDetail: (v: FeedVideo) => void;
  onDelete?: (v: FeedVideo) => void;
  // v4.66：卡片级「存云端」按钮已下线（v4.65 的卡片按钮作废）——
  // 存云端改走标题行右上角的批量入口（勾选悬浮窗），卡片按钮行
  // 恢复 播放 / 详情 / 删除，不再有任何云端按钮与云端状态入参。
  // v4.63：「🔄 刷新链接」——视频直链过期播不了时点它，在新
  // 标签页打开这条视频的快手页（#smzs-refresh），扩展在那个
  // 标签页抓到新链接后经既有 intake 通道回传，服务端只更新
  // 链接字段、不建新卡。版式预览示例卡不传，整行不渲染。
  // refreshing = 已打开标签页、10 秒内等 intake 回程（按钮显示
  // 「正在刷新…」）；refreshFailed = 上次刷新超时，红字留在卡上。
  onRefresh?: (v: FeedVideo) => void;
  refreshing?: boolean;
  refreshFailed?: boolean;
  s: number;
  marginTop: number;
}) {
  const btnStyle: CSSProperties = {
    fontSize: sz(11, s),
    lineHeight: 1.25,
    padding: `${sz(4, s)}px ${sz(8, s)}px`,
    minHeight: 0,
    height: "auto",
  };
  return (
    <>
      <div
        className="flex"
        style={{ marginTop, gap: sz(6, s) }}
        onClick={(e) => e.stopPropagation()}
      >
        {video.videoFileUrl && (
          <button
            type="button"
            className="btn btn-primary btn-sm min-w-0 flex-1 whitespace-nowrap"
            style={btnStyle}
            aria-label={`播放视频：${title}`}
            onClick={() => onPlay(video)}
          >
            播放
          </button>
        )}
        <button
          type="button"
          className="btn btn-sm min-w-0 flex-1 whitespace-nowrap"
          style={btnStyle}
          aria-label={`查看详情：${title}`}
          onClick={() => onDetail(video)}
        >
          详情
        </button>
        {onDelete && (
          <button
            type="button"
            className="btn btn-danger-ghost btn-sm min-w-0 flex-1 whitespace-nowrap"
            style={btnStyle}
            aria-label={`删除这张视频卡片：${title}`}
            onClick={() => onDelete(video)}
          >
            删除
          </button>
        )}
      </div>
      {onRefresh && (
        <div
          style={{ marginTop: sz(6, s) }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="btn btn-sm w-full whitespace-nowrap"
            style={btnStyle}
            disabled={refreshing}
            aria-label={`刷新链接：${title}（打开快手视频页重新获取这条视频的最新播放链接）`}
            onClick={() => onRefresh(video)}
          >
            {refreshing ? "🔄 正在刷新…" : "🔄 刷新链接"}
          </button>
          <p
            className="text-center"
            style={{
              marginTop: sz(3, s),
              fontSize: sz(10, s),
              lineHeight: 1.35,
              color: refreshFailed ? "var(--bad)" : "var(--dim)",
            }}
            role={refreshFailed ? "alert" : undefined}
          >
            {refreshing
              ? "正在刷新…已打开快手视频页，等新链接回来"
              : refreshFailed
                ? "刷新超时：检查扩展是否开启（新标签页要在同一个浏览器里打开）"
                : "链接过期播不了？点我重新拿"}
          </p>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// 话题标签区（v4.55，三款卡片设计共用）：默认固定只占 2 行、且高度
// 恒定为 2 行——话题只有 1 行、甚至一个都没有的卡片也占同样的高度，
// 保证同排卡片的话题区平齐、下面的发布时间与按钮对齐。话题多到要
// 排到第 3 行时，超出部分折叠，末尾显示「+N」徽标按钮（点开看全
// 部，展开后可点「收起」回到 2 行）。可见个数不是写死的：隐藏测量
// 层先量出每个徽标的真实宽度，再按容器宽度模拟 flex 换行算出 2 行
// 内（含「+N」本身占位）能放下几个——卡片档位 / 款式 / 宽度变化都
// 自动重算。点击折叠按钮要拦冒泡，免得紧凑卡整卡点开详情被误触。
// ---------------------------------------------------------------------------

function MonitorCardTags({
  tags,
  s,
  width,
}: {
  tags: string[];
  s: number;
  width: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [visibleCount, setVisibleCount] = useState(tags.length);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const measureRef = useRef<HTMLDivElement | null>(null);
  const tagsKey = tags.join("");
  useEffect(() => {
    setExpanded(false);
  }, [tagsKey]);
  const gap = sz(4, s);
  const chipH = sz(20, s);
  const twoRowH = chipH * 2 + gap;
  const hiddenCount = Math.max(0, tags.length - visibleCount);

  useLayoutEffect(() => {
    if (expanded) return;
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;
    const W = container.clientWidth;
    if (!W) return;
    const chipEls = Array.from(
      measure.querySelectorAll<HTMLElement>("[data-tag-chip]"),
    );
    const widths = chipEls.map((el) => el.offsetWidth);
    if (widths.length !== tags.length) return;
    // 按容器宽度模拟 flex 换行：数出前 2 行能放下几个徽标。
    let row = 1;
    let cur = 0;
    let fit = 0;
    for (const w of widths) {
      const need = cur === 0 ? w : cur + gap + w;
      if (need > W) {
        row += 1;
        if (row > 2) break;
        cur = w;
      } else {
        cur = need;
      }
      fit += 1;
    }
    if (fit >= tags.length) {
      setVisibleCount(tags.length);
      return;
    }
    // 有折叠时还要给「+N」徽标留位：放不下就再让出一个话题徽标。
    const toggleEl = measure.querySelector<HTMLElement>("[data-toggle-chip]");
    const toggleW = toggleEl ? toggleEl.offsetWidth : sz(34, s);
    let visible = fit;
    while (visible > 0) {
      let c = 0;
      for (let i = 0; i < visible; i += 1) {
        const w = widths[i] ?? 0;
        const need = c === 0 ? w : c + gap + w;
        if (need > W) c = w;
        else c = need;
      }
      const needToggle = c === 0 ? toggleW : c + gap + toggleW;
      if (needToggle <= W) break;
      visible -= 1;
    }
    setVisibleCount(visible);
  }, [tagsKey, tags.length, s, gap, expanded, width]);

  const chipStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    height: chipH,
    whiteSpace: "nowrap",
    background: "var(--accent-soft)",
    color: "var(--accent)",
    fontSize: sz(11, s),
    lineHeight: 1,
    padding: `0 ${sz(6, s)}px`,
    borderRadius: 999,
  };
  const toggleStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    height: chipH,
    whiteSpace: "nowrap",
    background: "transparent",
    color: "var(--dim)",
    border: "1px solid var(--border)",
    fontSize: sz(11, s),
    lineHeight: 1,
    padding: `0 ${sz(6, s)}px`,
    borderRadius: 999,
    cursor: "pointer",
  };

  if (tags.length === 0) {
    // 无话题也占满 2 行高度，同排卡片才平齐。
    return (
      <div aria-hidden="true" style={{ marginTop: sz(6, s), height: twoRowH }} />
    );
  }

  const visibleTags = expanded ? tags : tags.slice(0, visibleCount);
  return (
    <div style={{ marginTop: sz(6, s), position: "relative" }}>
      {/* 隐藏测量层：单行量出每个徽标与「+N」的真实宽度，不可见不占位 */}
      <div
        ref={measureRef}
        aria-hidden="true"
        style={{
          position: "absolute",
          visibility: "hidden",
          pointerEvents: "none",
          display: "flex",
          flexWrap: "nowrap",
          width: "max-content",
          height: 0,
          overflow: "hidden",
        }}
      >
        {tags.map((t, i) => (
          <span key={`${t}-${i}`} data-tag-chip style={chipStyle}>
            {t}
          </span>
        ))}
        <span data-toggle-chip style={toggleStyle}>
          {`+${tags.length}`}
        </span>
      </div>
      <div
        ref={containerRef}
        className="flex flex-wrap"
        style={{
          gap,
          height: expanded ? "auto" : twoRowH,
          minHeight: twoRowH,
          overflow: expanded ? "visible" : "hidden",
          alignContent: "flex-start",
        }}
      >
        {visibleTags.map((t, i) => (
          <span key={`${t}-${i}`} style={chipStyle}>
            {t}
          </span>
        ))}
        {!expanded && hiddenCount > 0 && (
          <button
            type="button"
            style={toggleStyle}
            aria-expanded={false}
            aria-label={`展开全部话题：共 ${tags.length} 个，还有 ${hiddenCount} 个已折叠`}
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(true);
            }}
          >
            {`+${hiddenCount}`}
          </button>
        )}
        {expanded && hiddenCount > 0 && (
          <button
            type="button"
            style={toggleStyle}
            aria-expanded={true}
            aria-label="收起话题标签，只显示两行"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(false);
            }}
          >
            收起
          </button>
        )}
      </div>
    </div>
  );
}

function MonitorCardCore({
  video,
  creatorName,
  width,
  cardStyle,
  cardScale,
  variant,
  onPlay,
  onDetail,
  onDelete,
  onAnalyze,
  onOpenDissected,
  dissected = null,
  onRefresh,
  refreshing = false,
  refreshFailed = false,
  cloudBadge = false,
  showCollected = false,
}: {
  video: FeedVideo;
  creatorName: string;
  width: number;
  cardStyle: MonitorCardStyle;
  cardScale: MonitorCardScale;
  variant: "compact" | "full";
  onPlay: (v: FeedVideo) => void;
  onDetail: (v: FeedVideo) => void;
  onDelete?: (v: FeedVideo) => void;
  // v4.55：封面右上角淡绿色按钮的回调。v4.88 起行为改为「发送
  // 到聊天解剖」（查云端 → 复制解剖指令 + 入待解剖队列），按钮
  // 文字同步改名；版式预览示例卡不传，按钮就不渲染。
  onAnalyze?: (v: FeedVideo) => void;
  // v4.88：这条视频已有解剖记录时的「已解剖 ✓」标记数据与点击
  // 出口（有已套用项目跳项目、否则打开分析记录）。没有记录时
  // dissected 为 null，标记不渲染。
  onOpenDissected?: (v: FeedVideo, link: DissectedLink) => void;
  dissected?: DissectedLink | null;
  // v4.61：「🔄 刷新链接」回调与本卡的刷新状态（见
  // MonitorCardButtons）。版式预览示例卡不传，刷新行不渲染。
  onRefresh?: (v: FeedVideo) => void;
  refreshing?: boolean;
  refreshFailed?: boolean;
  // v4.65：cloudBadge =「云端已存」视图专用，封面左下角打绿色
  // 「云端」小标。v4.66 起卡片不再带「存云端」按钮与云端状态
  // 入参（改顶部批量入口），这里只剩角标一个云端相关入参。
  cloudBadge?: boolean;
  showCollected?: boolean;
}) {
  const [coverFailed, setCoverFailed] = useState(false);
  const coverSrc =
    video.videoId === SAMPLE_VIDEO_ID
      ? sampleCover
      : coverFailed
        ? ""
        : video.coverUrl;
  const { title, tags } = splitDescription(video.description);
  const displayTitle = title || video.videoId || "未命名视频";
  const s = cardScale;
  const coverHeight = Math.round((width * 4) / 3);
  const relative = formatRelativeTime(video.publishedAt);
  const wan = formatWanCount(video.playCount);
  const likes = formatCount(video.likeCount);
  const clickable = variant === "compact";

  const coverImg = (radius: number, height: number) => (
    <div
      className="relative w-full overflow-hidden"
      style={{ height, borderRadius: radius }}
    >
      {coverSrc ? (
        <img
          src={coverSrc}
          alt={`视频封面：${displayTitle}`}
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => setCoverFailed(true)}
        />
      ) : (
        <span
          className="flex h-full w-full items-center justify-center bg-[var(--surface-alt)] text-[var(--dim)]"
          style={{ fontSize: sz(12, s) }}
        >
          无封面
        </span>
      )}
      {video.durationText && (
        <span
          className="absolute right-1 bottom-1 rounded bg-black/70 font-bold text-white"
          style={{
            fontSize: sz(10, s),
            padding: `${sz(2, s)}px ${sz(5, s)}px`,
          }}
        >
          {video.durationText}
        </span>
      )}
      {cloudBadge && (
        <span
          className="absolute font-bold text-white"
          style={{
            left: sz(6, s),
            bottom: sz(6, s),
            fontSize: sz(10, s),
            lineHeight: 1.25,
            padding: `${sz(2, s)}px ${sz(6, s)}px`,
            borderRadius: sz(4, s),
            background: "rgba(5, 150, 105, 0.92)",
            boxShadow: "0 1px 4px rgba(0,0,0,0.35)",
          }}
          aria-label="这条视频已存云端"
        >
          云端
        </span>
      )}
      {dissected && (
        <button
          type="button"
          aria-label={`这条视频已解剖，查看解剖结果：${displayTitle}`}
          onClick={(e) => {
            e.stopPropagation();
            onOpenDissected?.(video, dissected);
          }}
          className="absolute font-bold text-white"
          style={{
            left: sz(6, s),
            top: sz(6, s),
            fontSize: sz(10, s),
            lineHeight: 1.25,
            padding: `${sz(2, s)}px ${sz(6, s)}px`,
            borderRadius: 999,
            background: "rgba(5, 150, 105, 0.92)",
            boxShadow: "0 1px 4px rgba(0,0,0,0.35)",
          }}
        >
          已解剖 ✓
        </button>
      )}
      {onAnalyze && (
        <button
          type="button"
          aria-label={`发送到聊天解剖：${displayTitle}`}
          onClick={(e) => {
            e.stopPropagation();
            onAnalyze(video);
          }}
          className="absolute font-bold"
          style={{
            right: sz(6, s),
            top: sz(6, s),
            fontSize: sz(11, s),
            lineHeight: 1.25,
            padding: `${sz(3, s)}px ${sz(8, s)}px`,
            borderRadius: 999,
            background: "rgba(187, 247, 208, 0.95)",
            color: "#14532d",
            boxShadow: "0 1px 4px rgba(0,0,0,0.35)",
          }}
        >
          发送到聊天解剖
        </button>
      )}
    </div>
  );

  const collectedLine = showCollected ? (
    <p
      className="text-[var(--dim)]"
      style={{ marginTop: sz(4, s), fontSize: sz(10, s), lineHeight: 1.3 }}
    >
      {formatDetailTime(video.collectedAt)
        ? `采集 ${formatDetailTime(video.collectedAt)}`
        : `入库 ${formatDetailTime(video.createdAt) || "时间未填"}`}
    </p>
  ) : null;

  const articleProps = {
    className: "shrink-0 snap-start",
    style: { width } as CSSProperties,
    "aria-label": `视频：${displayTitle}，达人 ${creatorName}`,
    onClick: clickable ? () => onDetail(video) : undefined,
  };

  if (cardStyle === "visual") {
    // 设计二「大图视觉」：封面占整卡约 90%，圆角 12px；标题与
    // 数据压在封面底部渐隐叠加层里（白字 + 阴影）；下方只剩一
    // 行随档位缩放的操作按钮。卡间距 8–12px 由视图容器按款式给。
    return (
      <article
        {...articleProps}
        className={`${articleProps.className} bg-transparent${clickable ? " cursor-pointer" : ""}`}
        style={{ width, background: "transparent", border: "none", boxShadow: "none" }}
      >
        <div className="relative" style={{ borderRadius: sz(12, s) }}>
          {coverImg(sz(12, s), coverHeight)}
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0"
            style={{
              borderRadius: `0 0 ${sz(12, s)}px ${sz(12, s)}px`,
              padding: `${sz(22, s)}px ${sz(10, s)}px ${sz(9, s)}px`,
              background:
                "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.45) 55%, rgba(0,0,0,0) 100%)",
            }}
          >
            <p
              className="line-clamp-2 font-semibold text-white"
              style={{
                fontSize: sz(14, s),
                lineHeight: `${sz(19, s)}px`,
                textShadow: "0 1px 4px rgba(0,0,0,0.85)",
              }}
            >
              {displayTitle}
            </p>
            <p
              className="truncate"
              style={{
                marginTop: sz(3, s),
                fontSize: sz(11, s),
                color: "rgba(255,255,255,0.92)",
                textShadow: "0 1px 3px rgba(0,0,0,0.85)",
              }}
            >
              {creatorName || "达人未填"} · ▶{wan} · {relative}
            </p>
          </div>
        </div>
        <MonitorCardTags tags={tags} s={s} width={width} />
        {collectedLine}
        <MonitorCardButtons
          video={video}
          title={displayTitle}
          onPlay={onPlay}
          onDetail={onDetail}
          onDelete={onDelete}
          onRefresh={onRefresh}
          refreshing={refreshing}
          refreshFailed={refreshFailed}
          s={s}
          marginTop={sz(6, s)}
        />
      </article>
    );
  }

  if (cardStyle === "data") {
    // 设计三「紧凑数据」：顶部 16:9 窄封面条（3:4 封面裁成横条只
    // 作视觉提示）；达人昵称小字在标题前；标题一行截断；数据区
    // 三栏横向——label 11px 次级色在上、数字 16px/700 等宽在下，
    // label→数字 4px；卡内边距 12px（均按档位缩放）。
    const pad = sz(12, s);
    const stripHeight = Math.round((width - pad * 2) * (9 / 16));
    const dataCol = (label: string, value: string) => (
      <div className="min-w-0">
        <p style={{ fontSize: sz(11, s), color: "var(--dim)", lineHeight: 1.2 }}>{label}</p>
        <p
          className="truncate"
          style={{
            marginTop: sz(4, s),
            fontSize: sz(16, s),
            fontWeight: 700,
            lineHeight: 1.15,
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
          }}
        >
          {value}
        </p>
      </div>
    );
    return (
      <article
        {...articleProps}
        className={`${articleProps.className} card overflow-hidden${clickable ? " cursor-pointer" : ""}`}
        style={{ width, padding: pad }}
      >
        {coverImg(sz(8, s), stripHeight)}
        <p
          className="truncate text-[var(--dim)]"
          style={{ marginTop: sz(8, s), fontSize: sz(11, s), lineHeight: 1.25 }}
        >
          {creatorName || "达人未填"}
        </p>
        <p
          className="truncate font-semibold"
          style={{
            marginTop: sz(2, s),
            fontSize: sz(14, s),
            lineHeight: `${sz(18, s)}px`,
          }}
        >
          {displayTitle}
        </p>
        <div
          style={{
            marginTop: sz(8, s),
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: sz(8, s),
          }}
        >
          {dataCol("播放量", wan)}
          {dataCol("点赞", likes)}
          {dataCol("发布", relative)}
        </div>
        <MonitorCardTags tags={tags} s={s} width={width} />
        {collectedLine}
        <MonitorCardButtons
          video={video}
          title={displayTitle}
          onPlay={onPlay}
          onDetail={onDetail}
          onDelete={onDelete}
          onRefresh={onRefresh}
          refreshing={refreshing}
          refreshFailed={refreshFailed}
          s={s}
          marginTop={sz(10, s)}
        />
      </article>
    );
  }

  // 设计一「极简信息流」（默认）：3:4 封面全出血圆角 10px，左上
  // 角叠达人昵称 chip（半透明黑底白字 11px）；标题 14px/600 最多
  // 两行、锁 40px 高；数据行 12px 次级灰一行内放完，播放量数字
  // 13px 加粗做视觉锚点。图→标题 8px、标题→数据行 6px；卡片透
  // 明无边框，封面占整卡约 68%。全部尺寸按档位等比缩放。
  return (
    <article
      {...articleProps}
      className={`${articleProps.className}${clickable ? " cursor-pointer" : ""}`}
      style={{ width, background: "transparent", border: "none", boxShadow: "none" }}
    >
      <div className="relative">
        {coverImg(sz(10, s), coverHeight)}
        <span
          className="absolute truncate font-medium text-white"
          style={{
            left: sz(8, s),
            top: sz(8, s),
            maxWidth: "85%",
            fontSize: sz(11, s),
            lineHeight: 1.3,
            padding: `${sz(2, s)}px ${sz(7, s)}px`,
            borderRadius: 999,
            background: "rgba(0,0,0,0.55)",
          }}
        >
          {creatorName || "达人未填"}
        </span>
      </div>
      <p
        className="line-clamp-2 font-semibold"
        style={{
          marginTop: sz(8, s),
          fontSize: sz(14, s),
          lineHeight: `${sz(20, s)}px`,
          height: sz(40, s),
          overflow: "hidden",
        }}
      >
        {displayTitle}
      </p>
      <div
        className="flex items-center whitespace-nowrap text-[var(--dim)]"
        style={{
          marginTop: sz(6, s),
          fontSize: sz(12, s),
          lineHeight: 1.3,
          gap: sz(5, s),
          overflow: "hidden",
        }}
      >
        <span aria-label={`播放量 ${formatCount(video.playCount)}`}>
          ▶{" "}
          <strong style={{ fontSize: sz(13, s), color: "var(--text)" }}>
            {wan}
          </strong>
        </span>
        <span aria-hidden="true">·</span>
        <span aria-label={`点赞量 ${formatCount(video.likeCount)}`}>
          👍 {likes}
        </span>
        <span aria-hidden="true">·</span>
        <span>{relative}</span>
      </div>
      <MonitorCardTags tags={tags} s={s} width={width} />
      {variant === "full" && (
        <p
          className="text-[var(--dim)]"
          style={{ marginTop: sz(5, s), fontSize: sz(11, s), lineHeight: 1.3 }}
        >
          发布于 {formatPublished(video.publishedAt)}
          {video.videoId && <span> · ID {video.videoId}</span>}
        </p>
      )}
      {collectedLine}
      <MonitorCardButtons
        video={video}
        title={displayTitle}
        onPlay={onPlay}
        onDetail={onDetail}
        onDelete={onDelete}
        onRefresh={onRefresh}
        refreshing={refreshing}
        refreshFailed={refreshFailed}
        s={s}
        marginTop={sz(8, s)}
      />
    </article>
  );
}

function VideoCard({
  video,
  creatorName,
  onDelete,
  onPlay,
  onDetail,
  onAnalyze,
  onOpenDissected,
  dissected = null,
  onRefresh,
  refreshing = false,
  refreshFailed = false,
  cloudBadge = false,
  cardStyle = "minimal",
  cardScale = 1,
}: {
  video: FeedVideo;
  creatorName: string;
  onDelete: (v: FeedVideo) => void;
  onPlay: (v: FeedVideo) => void;
  onDetail: (v: FeedVideo) => void;
  onAnalyze?: (v: FeedVideo) => void;
  onOpenDissected?: (v: FeedVideo, link: DissectedLink) => void;
  dissected?: DissectedLink | null;
  onRefresh?: (v: FeedVideo) => void;
  refreshing?: boolean;
  refreshFailed?: boolean;
  // v4.66：卡片级「存云端」已下线，不再向渲染核透传云端入参。
  cloudBadge?: boolean;
  // v4.51 版式：三款卡片设计之一 + 等比缩小档位，与横排卡共用
  // 同一渲染核、同一基准宽，封面恒 3:4。
  cardStyle?: MonitorCardStyle;
  cardScale?: MonitorCardScale;
}) {
  const width = Math.round(COMPACT_CARD_BASE_W[cardStyle] * cardScale);
  return (
    <MonitorCardCore
      video={video}
      creatorName={creatorName}
      width={width}
      cardStyle={cardStyle}
      cardScale={cardScale}
      variant="full"
      onPlay={onPlay}
      onDetail={onDetail}
      onDelete={onDelete}
      onAnalyze={onAnalyze}
      onOpenDissected={onOpenDissected}
      dissected={dissected}
      onRefresh={onRefresh}
      refreshing={refreshing}
      refreshFailed={refreshFailed}
      cloudBadge={cloudBadge}
    />
  );
}

type MonitorViewMode = "collected" | "latest" | "date" | "creator" | "group" | "cloud";

type MonitorGroup = { id: number; name: string };

// 达人分组设置入口（v4.43）：下拉选已有分组 / 未分组，或选
// 「＋ 新建分组…」就地输入新分组名——建成后本达人自动归入。
// 分组存服务端（monitor_groups），这里只发动作、成功后刷新 feed。
function CreatorGroupControl({
  account,
  groups,
  invalidate,
}: {
  account: FeedAccount;
  groups: MonitorGroup[];
  invalidate: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const setGroupMut = useMutation({
    mutationFn: (groupId: number | null) =>
      api.setMonitorAccountGroup({ accountId: account.id, groupId }),
    onSuccess: (res) => {
      if (!res.ok) {
        setError(res.error ?? "分组没设置成，再试一次。");
        return;
      }
      setError(null);
      invalidate();
    },
    onError: (e) => setError(`分组没设置成：${describeThrownError(e)}`),
  });

  const createMut = useMutation({
    mutationFn: (name: string) => api.createMonitorGroup({ name }),
    onSuccess: async (res) => {
      if (!res.ok || res.id == null) {
        setError(res.error ?? "分组没建成，再试一次。");
        return;
      }
      try {
        await api.setMonitorAccountGroup({ accountId: account.id, groupId: res.id });
      } catch {
        // 分组已建成、归入失败：刷新后用户再选一次即可。
      }
      setCreating(false);
      setNewName("");
      setError(null);
      invalidate();
    },
    onError: (e) => setError(`分组没建成：${describeThrownError(e)}`),
  });

  const busy = setGroupMut.isPending || createMut.isPending;
  const creatorLabel = account.name || "这位达人";

  if (creating) {
    return (
      <span className="flex flex-wrap items-center gap-1.5">
        <input
          className="field w-[130px] px-2 py-1 text-[13px]"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="新分组名"
          aria-label={`给 ${creatorLabel} 新建分组：输入分组名`}
          maxLength={30}
        />
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={busy || !newName.trim()}
          aria-label="建好新分组并归入"
          onClick={() => createMut.mutate(newName.trim())}
        >
          {createMut.isPending ? "建中…" : "建好并归入"}
        </button>
        <button
          type="button"
          className="btn btn-sm"
          disabled={busy}
          aria-label="取消新建分组"
          onClick={() => {
            setCreating(false);
            setNewName("");
            setError(null);
          }}
        >
          取消
        </button>
        {error && (
          <span className="text-xs" style={{ color: "var(--bad)" }} role="alert">
            {error}
          </span>
        )}
      </span>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <label className="text-xs text-[var(--dim)]" htmlFor={`group-select-${account.id}`}>
        分组
      </label>
      <select
        id={`group-select-${account.id}`}
        className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[13px]"
        value={account.groupId == null ? "" : String(account.groupId)}
        disabled={busy}
        aria-label={`设置 ${creatorLabel} 的分组`}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "__new") {
            setCreating(true);
            return;
          }
          setGroupMut.mutate(v === "" ? null : Number(v));
        }}
      >
        <option value="">未分组</option>
        {groups.map((g) => (
          <option key={g.id} value={String(g.id)}>
            {g.name}
          </option>
        ))}
        <option value="__new">＋ 新建分组…</option>
      </select>
      {error && (
        <span className="text-xs" style={{ color: "var(--bad)" }} role="alert">
          {error}
        </span>
      )}
    </span>
  );
}

// 「按作者分组」视图的一个分组段（v4.43）：分组名 + 改名 /
// 删除分组（未分组段没有这两个按钮）+ 组内每位达人一行（带
// 分组设置入口）及其视频横排（服务端已按发布时间倒序）。
// 删分组只解绑达人到未分组，不删达人和视频。
function AuthorGroupSection({
  group,
  members,
  allGroups,
  invalidate,
  onPlay,
  onDetail,
  onAnalyze,
  onOpenDissected,
  dissectedByVideoId,
  onRefresh,
  refreshingIds,
  refreshFailedIds,
  cardStyle = "minimal",
  cardScale = 1,
}: {
  group: MonitorGroup | null;
  members: FeedAccount[];
  allGroups: MonitorGroup[];
  invalidate: () => void;
  onPlay: (account: FeedAccount, video: FeedVideo) => void;
  onDetail: (account: FeedAccount, video: FeedVideo) => void;
  onAnalyze?: (account: FeedAccount, video: FeedVideo) => void;
  onOpenDissected?: (video: FeedVideo, link: DissectedLink) => void;
  dissectedByVideoId?: Map<string, DissectedLink>;
  onRefresh?: (video: FeedVideo) => void;
  refreshingIds?: Set<number>;
  refreshFailedIds?: Set<number>;
  // v4.66：卡片级「存云端」已下线，本节不再透传云端入参。
  cardStyle?: MonitorCardStyle;
  cardScale?: MonitorCardScale;
}) {
  const [renaming, setRenaming] = useState(false);
  const [renameName, setRenameName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState(false);

  const renameMut = useMutation({
    mutationFn: (name: string) =>
      api.renameMonitorGroup({ id: group?.id ?? 0, name }),
    onSuccess: (res) => {
      if (!res.ok) {
        setError(res.error ?? "没改成，再试一次。");
        return;
      }
      setRenaming(false);
      setError(null);
      invalidate();
    },
    onError: (e) => setError(`没改成：${describeThrownError(e)}`),
  });
  const deleteMut = useMutation({
    mutationFn: () => api.deleteMonitorGroup({ id: group?.id ?? 0 }),
    onSuccess: () => {
      setPendingDelete(false);
      setError(null);
      invalidate();
    },
    onError: (e) => setError(`没删掉：${describeThrownError(e)}`),
  });

  const videoTotal = members.reduce((s, a) => s + a.videos.length, 0);
  const heading = group ? group.name : "未分组";

  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-display text-base font-bold">{heading}</h3>
        <span className="text-xs text-[var(--dim)]">
          {members.length} 位达人 · {videoTotal} 条视频
        </span>
        {group &&
          (renaming ? (
            <span className="flex flex-wrap items-center gap-1.5">
              <input
                className="field w-[140px] px-2 py-1 text-[13px]"
                value={renameName}
                onChange={(e) => setRenameName(e.target.value)}
                placeholder="新分组名"
                aria-label={`给分组「${group.name}」改名：输入新名`}
                maxLength={30}
              />
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={renameMut.isPending || !renameName.trim()}
                aria-label={`保存分组「${group.name}」的新名`}
                onClick={() => renameMut.mutate(renameName.trim())}
              >
                {renameMut.isPending ? "保存中…" : "保存"}
              </button>
              <button
                type="button"
                className="btn btn-sm"
                disabled={renameMut.isPending}
                aria-label="取消改名"
                onClick={() => {
                  setRenaming(false);
                  setError(null);
                }}
              >
                取消
              </button>
            </span>
          ) : (
            <span className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                className="btn btn-sm"
                aria-label={`给分组「${group.name}」改名`}
                onClick={() => {
                  setRenameName(group.name);
                  setError(null);
                  setRenaming(true);
                }}
              >
                改名
              </button>
              <button
                type="button"
                className="btn btn-danger-ghost btn-sm"
                aria-label={`删除分组「${group.name}」（组内达人回到未分组）`}
                onClick={() => {
                  setError(null);
                  setPendingDelete(true);
                }}
              >
                删除分组
              </button>
            </span>
          ))}
        {error && (
          <span className="text-xs" style={{ color: "var(--bad)" }} role="alert">
            {error}
          </span>
        )}
      </div>

      {members.length === 0 ? (
        <p className="mt-1.5 text-[13px] text-[var(--dim)]">
          {group
            ? "这个分组暂时没有带作品的达人——没采到作品的达人不显示；把达人归入这个分组、采到作品后就会出现在这里。"
            : "全部达人都已经分好组了。"}
        </p>
      ) : (
        members.map((a) => (
          <div key={a.id} className="mt-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white"
                style={{ background: "var(--accent)" }}
                aria-hidden="true"
              >
                {(a.name || "达").slice(0, 1)}
              </span>
              {a.url ? (
                <a
                  href={a.url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-display text-sm font-bold underline-offset-2 hover:underline"
                  aria-label={`打开达人主页：${a.name || a.url}`}
                >
                  {a.name || "未命名达人"}
                </a>
              ) : (
                <span className="font-display text-sm font-bold">{a.name || "未命名达人"}</span>
              )}
              <span
                className="rounded-full px-2 py-0.5 text-xs font-bold"
                style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
              >
                {a.platform}
              </span>
              <span className="text-xs text-[var(--dim)]">{a.videos.length} 条视频</span>
              <span className="ml-auto">
                <CreatorGroupControl account={a} groups={allGroups} invalidate={invalidate} />
              </span>
            </div>
            {a.videos.length === 0 ? (
              <p className="mt-1.5 text-[13px] text-[var(--dim)]">这位达人还没有视频卡片。</p>
            ) : (
              <div
                className="mt-1.5 flex overflow-x-auto pb-1.5 snap-x"
                style={{ gap: cardGapFor(cardStyle) }}
                aria-label={`${a.name || "达人"} 的视频（发布时间倒序）`}
              >
                {a.videos.map((v) => (
                  <CompactVideoCard
                    cardStyle={cardStyle} cardScale={cardScale}
                    key={v.id}
                    video={v}
                    creatorName={a.name}
                    onPlay={(vid) => onPlay(a, vid)}
                    onDetail={(vid) => onDetail(a, vid)}
                    onAnalyze={onAnalyze ? (vid) => onAnalyze(a, vid) : undefined}
                    onOpenDissected={onOpenDissected}
                    dissected={dissectedByVideoId?.get(v.videoId) ?? null}
                    onRefresh={onRefresh}
                    refreshing={refreshingIds?.has(v.id) ?? false}
                    refreshFailed={refreshFailedIds?.has(v.id) ?? false}
                  />
                ))}
              </div>
            )}
          </div>
        ))
      )}

      {group && pendingDelete && (
        <ConfirmDialog
          title={`删除分组「${group.name}」？`}
          body={
            <p>
              组里的 {members.length} 位达人会回到「未分组」，达人和视频卡片都不删。这个删除不能恢复——之后要再用这个分组，得重新建一个。
            </p>
          }
          confirmLabel={deleteMut.isPending ? "正在删除…" : "删除这个分组"}
          pending={deleteMut.isPending}
          onConfirm={() => deleteMut.mutate()}
          onCancel={() => {
            if (!deleteMut.isPending) setPendingDelete(false);
          }}
        />
      )}
    </div>
  );
}

// 新建分组行（「按作者分组」视图顶部）：只建空分组，达人之后
// 在各自的行上归入。
function NewMonitorGroupRow({ invalidate }: { invalidate: () => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const createMut = useMutation({
    mutationFn: (n: string) => api.createMonitorGroup({ name: n }),
    onSuccess: (res) => {
      if (!res.ok) {
        setError(res.error ?? "分组没建成，再试一次。");
        return;
      }
      setName("");
      setError(null);
      invalidate();
    },
    onError: (e) => setError(`分组没建成：${describeThrownError(e)}`),
  });
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <input
        className="field w-[180px] px-2 py-1.5 text-[13px]"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="新分组名，如：搞笑类"
        aria-label="新建作者分组：输入分组名"
        maxLength={30}
      />
      <button
        type="button"
        className="btn btn-sm"
        disabled={createMut.isPending || !name.trim()}
        aria-label="新建作者分组"
        onClick={() => createMut.mutate(name.trim())}
      >
        {createMut.isPending ? "建中…" : "新建分组"}
      </button>
      {error && (
        <span className="text-xs" style={{ color: "var(--bad)" }} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
const MONITOR_VIEW_STORAGE_KEY = "monitor-view-mode-v1";
const MONITOR_GUIDE_STORAGE_KEY = "monitor-guide-open-v1";

// 卡片版式（v4.51 推倒重做）：v4.47 的多维滑杆那套（整体缩放 /
// 卡片宽度 / 高度 / 文字行间距 / 左右内边距 / 上下内边距六根滑
// 杆）整体下线，localStorage 键 monitor-card-layout-v2 与旧缩放
// 键 monitor-card-scale-v1 一并作废——不再读取，加载时顺手删
// 除。新版式只有两个维度，都在「版式」面板里点选即生效：
//  ① 卡片设计三款：minimal 极简信息流（默认）/ visual 大图视
//     觉 / data 紧凑数据，风格差异见 MonitorCardCore 三个分支；
//  ② 等比缩小四档：1x / 0.8x / 0.6x / 0.5x——卡片宽、高、内部
//     字号与间距、按钮文字与图标全部按同一档位同步缩放（见
//     sz()），封面宽高比锁定 3:4 不变形。
// 两项设置合存 localStorage 键 monitor-card-display-v1，下次
// 打开保持。
export type MonitorCardStyle = "minimal" | "visual" | "data";
export type MonitorCardScale = 1 | 0.8 | 0.6 | 0.5;

const MONITOR_DISPLAY_KEY = "monitor-card-display-v1";
const MONITOR_CARD_SCALES: MonitorCardScale[] = [1, 0.8, 0.6, 0.5];
const MONITOR_CARD_STYLES: {
  key: MonitorCardStyle;
  label: string;
  desc: string;
}[] = [
  {
    key: "minimal",
    label: "极简信息流",
    desc: "3:4 封面 + 两行标题 + 一行数据，适合横向扫读对比",
  },
  {
    key: "visual",
    label: "大图视觉",
    desc: "封面占满整卡，标题压在底部渐隐层，适合看封面质量",
  },
  {
    key: "data",
    label: "紧凑数据",
    desc: "窄封面条 + 三栏大数字，适合纯比播放 / 点赞数据",
  },
];
// 横排卡与分组卡共用的基准宽（1x 档）：data 款是横向数据卡，
// 天生更宽；其余两款是竖版卡。
const COMPACT_CARD_BASE_W: Record<MonitorCardStyle, number> = {
  minimal: 176,
  visual: 196,
  data: 268,
};

function loadCardDisplay(): { style: MonitorCardStyle; scale: MonitorCardScale } {
  try {
    // 作废的旧版式键：删掉，免得旧设置残留干扰（v4.51）。
    window.localStorage.removeItem("monitor-card-layout-v2");
    window.localStorage.removeItem("monitor-card-scale-v1");
    const raw = window.localStorage.getItem(MONITOR_DISPLAY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as {
        style?: unknown;
        scale?: unknown;
      };
      const style: MonitorCardStyle =
        parsed.style === "visual" || parsed.style === "data"
          ? parsed.style
          : "minimal";
      const scale: MonitorCardScale = MONITOR_CARD_SCALES.includes(
        parsed.scale as MonitorCardScale,
      )
        ? (parsed.scale as MonitorCardScale)
        : 1;
      return { style, scale };
    }
  } catch {
    // localStorage 不可用 / JSON 坏了：用默认（极简信息流 1x）
  }
  return { style: "minimal", scale: 1 };
}

function saveCardDisplay(style: MonitorCardStyle, scale: MonitorCardScale): void {
  try {
    window.localStorage.setItem(
      MONITOR_DISPLAY_KEY,
      JSON.stringify({ style, scale }),
    );
  } catch {
    // 存不进也已在本页生效，只是下次打开不保持
  }
}

// 卡间距按款式给：极简信息流 16px、大图视觉 10px（8–12 区间）、
// 紧凑数据 12px。
function cardGapFor(style: MonitorCardStyle): number {
  if (style === "minimal") return 16;
  if (style === "visual") return 10;
  return 12;
}

function dateKeyShanghai(iso: string | null): string {
  if (!iso) return "时间未填";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "时间未填";
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function CompactVideoCard({
  video,
  creatorName,
  onPlay,
  onDetail,
  onAnalyze,
  onOpenDissected,
  dissected = null,
  onRefresh,
  refreshing = false,
  refreshFailed = false,
  cloudBadge = false,
  showCollected = false,
  cardStyle = "minimal",
  cardScale = 1,
}: {
  video: FeedVideo;
  creatorName: string;
  onPlay: (v: FeedVideo) => void;
  onDetail: (v: FeedVideo) => void;
  onAnalyze?: (v: FeedVideo) => void;
  onOpenDissected?: (v: FeedVideo, link: DissectedLink) => void;
  dissected?: DissectedLink | null;
  onRefresh?: (v: FeedVideo) => void;
  refreshing?: boolean;
  refreshFailed?: boolean;
  // v4.66：卡片级「存云端」已下线，不再向渲染核透传云端入参。
  cloudBadge?: boolean;
  // v4.51 版式：三款卡片设计之一 + 等比缩小档位，与按达人分组
  // 卡共用同一渲染核、同一基准宽，封面恒 3:4。
  cardStyle?: MonitorCardStyle;
  cardScale?: MonitorCardScale;
  // 「最新采集」视图专用：数据行下面再加一行采集时间，让用户
  // 一眼看出这条是什么时候采回来的（没填采集时间时回退入库
  // 时间并标注）。其他视图不传，保持原样。
  showCollected?: boolean;
}) {
  const width = Math.round(COMPACT_CARD_BASE_W[cardStyle] * cardScale);
  return (
    <MonitorCardCore
      video={video}
      creatorName={creatorName}
      width={width}
      cardStyle={cardStyle}
      cardScale={cardScale}
      variant="compact"
      onPlay={onPlay}
      onDetail={onDetail}
      onAnalyze={onAnalyze}
      onOpenDissected={onOpenDissected}
      dissected={dissected}
      onRefresh={onRefresh}
      refreshing={refreshing}
      refreshFailed={refreshFailed}
      cloudBadge={cloudBadge}
      showCollected={showCollected}
    />
  );
}

// ---------------------------------------------------------------------------
// v4.66 批量存云端悬浮窗（v4.67 改后台队列）：标题行右上角「存云
// 端」点开。列出当前视图的全部视频——每行缩略图 + 标题 + 时长 +
// 复选框；已存云端的行标绿色「已存」、复选框禁用不可重复选。顶
// 部「全选」复选框（只勾未存的），底部「确认存入（N）」+ 取消；
// v4.67 起点确认只是把勾选条目加入服务端后台队列，悬浮窗直接
// 关闭、下载在后台慢慢跑（窗内不再有存入中进度，进度看存储进
// 度条下方的常驻队列状态）。列表区 max-height + overflow-y
// auto，视频再多也只在窗内滚。样式与 VideoPlayerModal 同一套：
// fixed 遮罩 + .card 面板，跟随页面深色主题。
// ---------------------------------------------------------------------------

function CloudBatchSaveModal({
  items,
  savedIds,
  selected,
  allChecked,
  selectableCount,
  onToggleItem,
  onToggleAll,
  onConfirm,
  onClose,
}: {
  items: { account: FeedAccount; video: FeedVideo }[];
  savedIds: Set<string>;
  selected: Set<string>;
  allChecked: boolean;
  selectableCount: number;
  onToggleItem: (videoId: string, checked: boolean) => void;
  onToggleAll: (checked: boolean) => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const selectedCount = items.filter(
    ({ video }) =>
      video.videoId && selected.has(video.videoId) && !savedIds.has(video.videoId),
  ).length;
  return (
    <div
      className="fixed inset-0 z-[85] flex items-center justify-center bg-black/70 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="批量存云端：勾选要存入云端的视频"
      onClick={onClose}
    >
      <div
        className="card flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-2.5 p-3 pb-2">
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold">存云端</p>
            <p className="mt-0.5 text-xs text-[var(--dim)]">
              当前视图共 {items.length} 条，已存云端的标「已存」不能重复选，勾好后点「确认存入」——会加入后台队列慢慢存，窗口直接关掉，不影响你继续用，进度看页面上方存储进度条下面的「后台存入中」。
            </p>
          </div>
          <button
            type="button"
            className="btn btn-sm shrink-0"
            onClick={onClose}
            aria-label="关闭批量存云端窗"
          >
            关闭 ✕
          </button>
        </div>
        <label className="flex cursor-pointer items-center gap-2 border-t border-[var(--border)] px-3 py-2 text-sm font-bold">
          <input
            type="checkbox"
            className="h-4 w-4 shrink-0 accent-emerald-600"
            checked={allChecked}
            disabled={selectableCount === 0}
            onChange={(e) => onToggleAll(e.target.checked)}
            aria-label="全选当前视图所有未存云端的视频"
          />
          全选
          <span className="text-xs font-normal text-[var(--dim)]">
            （可存 {selectableCount} 条）
          </span>
        </label>
        <div
          className="border-t border-[var(--border)]"
          style={{ maxHeight: "52vh", overflowY: "auto" }}
          aria-label="当前视图视频列表（可滚动）"
        >
          {items.length === 0 ? (
            <p className="px-3 py-6 text-sm text-[var(--dim)]">
              当前视图没有视频。
            </p>
          ) : (
            items.map(({ account, video }) => {
              const { title } = splitDescription(video.description);
              const rowTitle = title || video.videoId || "未命名视频";
              const saved = Boolean(video.videoId) && savedIds.has(video.videoId);
              const checked = Boolean(video.videoId) && selected.has(video.videoId);
              return (
                <label
                  key={video.id}
                  className="flex items-center gap-2.5 border-b border-[var(--border)] px-3 py-2 last:border-b-0"
                  style={{ cursor: saved ? "default" : "pointer" }}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 shrink-0 accent-emerald-600"
                    checked={saved || checked}
                    disabled={saved || !video.videoId}
                    onChange={(e) => onToggleItem(video.videoId, e.target.checked)}
                    aria-label={`勾选存入云端：${rowTitle}`}
                  />
                  {video.coverUrl ? (
                    <img
                      src={video.coverUrl}
                      alt=""
                      className="h-[52px] w-[39px] shrink-0 rounded object-cover"
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.style.visibility = "hidden";
                      }}
                    />
                  ) : (
                    <span className="flex h-[52px] w-[39px] shrink-0 items-center justify-center rounded bg-black/30 text-[10px] text-[var(--dim)]">
                      无封面
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold leading-5">
                      {rowTitle}
                    </span>
                    <span className="mt-0.5 block text-xs text-[var(--dim)]">
                      {account.name || "达人未填"}
                      {video.durationText && <> · 时长 {video.durationText}</>}
                    </span>
                  </span>
                  {saved && (
                    <span
                      className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold leading-4 text-white"
                      style={{ background: "rgba(5,150,105,0.92)" }}
                      aria-label="这条视频已存云端"
                    >
                      已存
                    </span>
                  )}
                </label>
              );
            })
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] p-3">
          <p className="text-sm text-[var(--dim)]">已勾选 {selectedCount} 条</p>
          <span className="ml-auto flex gap-2">
            <button
              type="button"
              className="btn btn-sm"
              onClick={onClose}
              aria-label="取消批量存云端"
            >
              取消
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={onConfirm}
              disabled={selectedCount === 0}
              aria-label={`确认存入云端（已勾选 ${selectedCount} 条，加入后台队列）`}
            >
              {`确认存入（${selectedCount}）`}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}

export function MonitorBench({
  onAnalyzeVideo,
  onOpenProject,
  onOpenAnalysisRecord,
}: {
  // v4.55：把一条视频的第一节数据交给 App，由 App 切到「分析
  // 模仿」页并预填新分析表单。v4.88 起封面按钮改走「发送到聊
  // 天解剖」，本出口改由详情窗的「预填到分析模仿页」按钮触发。
  onAnalyzeVideo?: (prefill: AnalysisPrefill) => void;
  // v4.88：「已解剖 ✓」有已套用项目时的跳转出口（App 负责切
  // 剧本台并选中项目、跳分镜窗，与分析模仿页同一口径）。
  onOpenProject?: (projectId: number) => void;
  // v4.88：「已解剖 ✓」打开对应分析记录的出口（App 切到分析
  // 模仿页，AnalysisBench 按 videoId 打开那条记录）。
  onOpenAnalysisRecord?: (videoId: string) => void;
}) {
  const queryClient = useQueryClient();
  const feedQuery = useQuery({
    queryKey: ["monitor-feed"],
    queryFn: () => withReadTimeout(() => api.listMonitorFeed({})),
    retry: retryReadQuery,
  });
  const accounts = feedQuery.data?.accounts ?? [];
  const groups = feedQuery.data?.groups ?? [];
  const totalVideos = accounts.reduce((s, a) => s + a.videos.length, 0);
  // 数据来源诊断（v4.49）：视频卡片只存服务端数据库，客户端没
  // 有 localStorage / IndexedDB 副本（已全仓排查）——页面加载
  // 时把「从哪恢复了多少条」打到 console，排查「清除后刷新复
  // 活」时能直接区分卡片是服务端读回的还是被中转旧 report 重
  // 建的（重建会伴随同批 [relay] 被接受日志）。只在首次拿到数
  // 据时打一次。
  const feedLoadLoggedRef = useRef(false);
  useEffect(() => {
    if (!feedQuery.data || feedLoadLoggedRef.current) return;
    feedLoadLoggedRef.current = true;
    console.log(
      `[load] 从服务端数据库恢复 ${totalVideos} 条视频卡片（${accounts.length} 位达人）`,
    );
  }, [feedQuery.data, totalVideos, accounts.length]);

  // v4.55 预填（v4.88 搬家到详情窗）：把这条视频的第一节数据
  // （标题取描述首行，与卡面标题同口径；发布时间按详情窗的北
  // 京时间文本）组装成预填，交给 App 切到「分析模仿」页新开
  // 表单。手动建分析记录时仍走这条，功能不减。
  const handlePrefillAnalysis = (video: FeedVideo, creatorName: string) => {
    if (!onAnalyzeVideo) return;
    const { title } = splitDescription(video.description);
    onAnalyzeVideo({
      videoId: video.videoId,
      videoUrl: video.videoUrl,
      title: title || video.videoId || "",
      creatorName,
      durationText: video.durationText,
      likeCount: video.likeCount ? String(video.likeCount) : "",
      playCount: video.playCount ? String(video.playCount) : "",
      publishedText: formatDetailTime(video.publishedAt),
      // v4.56：AI解剖要的视频文件链接与描述全文一并带入。
      videoFileUrl: video.videoFileUrl,
      description: video.description,
    });
  };

  // ------------------------------------------------------------------
  // v4.88 已解剖标记：分析记录里同 videoId 且已有解剖结果
  // （dissectionJson 非空）的，卡片封面与待解剖队列显示「已解
  // 剖 ✓」。与 AnalysisBench 共用 ['video-analyses'] 查询键，聊
  // 天解剖存完记录后分析页一刷新，这边跟着变。查不到 / 查询失
  // 败就当没有，不报错、不阻塞。
  // ------------------------------------------------------------------
  const analysesQuery = useQuery({
    queryKey: ["video-analyses"],
    queryFn: () => withReadTimeout(() => api.listVideoAnalyses({})),
    retry: retryReadQuery,
  });
  const dissectedByVideoId = new Map<string, DissectedLink>();
  for (const r of analysesQuery.data?.analyses ?? []) {
    if (!r.videoId || dissectedByVideoId.has(r.videoId)) continue;
    if ((r.dissectionJson ?? "").trim() === "") continue;
    dissectedByVideoId.set(r.videoId, {
      analysisId: r.id,
      appliedProjectId: r.appliedProjectId ?? null,
    });
  }
  const handleOpenDissected = (video: FeedVideo, link: DissectedLink) => {
    if (link.appliedProjectId !== null && onOpenProject) {
      onOpenProject(link.appliedProjectId);
      return;
    }
    if (onOpenAnalysisRecord) onOpenAnalysisRecord(video.videoId);
  };

  // v4.88 发送到聊天解剖的两扇窗：没存云端时的提示窗（标题）
  // 与自动复制失败时的指令全文窗（指令原文）。
  const [dissectNoCloudTitle, setDissectNoCloudTitle] = useState<
    string | null
  >(null);
  const [dissectCopyFallback, setDissectCopyFallback] = useState<
    string | null
  >(null);

  // ------------------------------------------------------------------
  // v4.88 卡片「发送到聊天解剖」：
  //   1. 先现查云端清单（listCloudSavedVideos）——没有云端文件
  //      就只弹「先点存云端，再点分析」的提示窗，不复制残缺指
  //      令、不入队（聊天里的助手要直接读云端文件才能精修）。
  //   2. 有云端文件：组装结构化解剖指令（视频元数据 + 云端路
  //      径 + 聊天精修规则全文）复制到剪贴板，toast 明示去聊天
  //      框粘贴；复制失败弹全文窗让用户手动复制，不静默失败。
  //   3. 同时入「待解剖队列」（服务端持久化；重复点同视频服务
  //      端去重、只重新复制指令）。入队失败不拦复制，只在
  //      toast 里如实带一句。
  // ------------------------------------------------------------------
  const dissectBusyRef = useRef<Set<string>>(new Set());
  const handleAnalyze = async (video: FeedVideo, creatorName: string) => {
    const videoId = video.videoId;
    const { title } = splitDescription(video.description);
    const displayTitle = title || videoId || "未命名视频";
    if (!videoId) {
      setDissectNoCloudTitle(displayTitle);
      return;
    }
    if (dissectBusyRef.current.has(videoId)) return;
    dissectBusyRef.current.add(videoId);
    try {
      let savedIds: Set<string>;
      try {
        const res = await api.listCloudSavedVideos({});
        savedIds = new Set(res.saved.map((e) => e.videoId));
      } catch (e) {
        setIntakeToast(
          `云端清单没查成（${describeThrownError(e)}），先确认网络再点一次。`,
        );
        return;
      }
      if (!savedIds.has(videoId)) {
        setDissectNoCloudTitle(displayTitle);
        return;
      }
      const text = buildDissectInstruction(video, creatorName);
      let queueNote = "";
      try {
        const res = await api.addDissectQueueItem({
          videoId,
          title: displayTitle,
          creatorName,
        });
        queryClient.invalidateQueries({ queryKey: ["dissect-queue"] });
        queueNote = res.added ? "，已加入待解剖队列" : "";
      } catch {
        queueNote = "（待解剖队列没加成，不影响这次解剖）";
      }
      const ok = await copyTextToClipboard(text);
      if (ok) {
        setIntakeToast(`已复制解剖指令，去聊天框粘贴发送${queueNote}`);
      } else {
        setDissectCopyFallback(text);
        if (queueNote) setIntakeToast(`解剖指令已生成${queueNote}`);
      }
    } finally {
      dissectBusyRef.current.delete(videoId);
    }
  };

  // ------------------------------------------------------------------
  // v4.63 刷新链接（标签页方案，事件通道作废）：点卡片
  // 「🔄 刷新链接」→ 不再发 smzs-refresh 事件，改为在新标签页
  // 打开这条视频的快手页：
  //   window.open('https://www.kuaishou.com/short-video/' +
  //     videoId + '#smzs-refresh', '_blank')
  // 扩展在那个标签页抓到新链接后，经既有 intake 通道回传
  // （payload 带 _refreshVideoId 标记、rows 只有 id +
  // video_play_url），本页 intake 处理函数命中标记后按 videoId
  // 调 refreshMonitorVideoLinks 只更新链接字段（与 fetchMonitorVideo
  // duplicated 只更新链接同一口径）、toast「链接已刷新」、不建新卡。
  // 本页触发与判定：
  //   · 点后按钮进「正在刷新…」状态（pending），等 intake 回来再清；
  //   · pending 按卡片行 id 记 {videoId, 发起时的文件/封面链接}；
  //     intake 刷新分支清 pending + toast；feed 对比兜底（链接变了
  //     同样判成功）；
  //   · 超时保持 10 秒无回程 = 刷新失败 → toast + 卡上红字（标签页
  //     20 秒无结果会由扩展侧自动关）；
  //   · 同一卡刷新中再点直接忽略；没有 videoId 的卡打不开快手页，
  //     直接提示。
  // ------------------------------------------------------------------
  type PendingRefresh = {
    videoId: string;
    oldFileUrl: string;
    oldCoverUrl: string;
  };
  const [pendingRefresh, setPendingRefresh] = useState<
    Map<number, PendingRefresh>
  >(() => new Map());
  const [refreshFailedIds, setRefreshFailedIds] = useState<Set<number>>(
    () => new Set(),
  );
  const pendingRefreshRef = useRef<Map<number, PendingRefresh>>(new Map());
  const refreshTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  const clearPendingRefresh = (dbId: number) => {
    pendingRefreshRef.current.delete(dbId);
    setPendingRefresh(new Map(pendingRefreshRef.current));
    const t = refreshTimersRef.current.get(dbId);
    if (t) {
      clearTimeout(t);
      refreshTimersRef.current.delete(dbId);
    }
  };

  const handleRefreshVideo = (video: FeedVideo) => {
    console.log("[wb-refresh] button clicked", {
      dbId: video.id,
      videoId: video.videoId,
      url: video.videoUrl,
    });
    if (pendingRefreshRef.current.has(video.id)) return;
    if (!video.videoId) {
      setIntakeToast(
        "这张卡片没有视频ID，没法打开快手视频页刷新链接。",
      );
      return;
    }
    setRefreshFailedIds((prev) => {
      if (!prev.has(video.id)) return prev;
      const next = new Set(prev);
      next.delete(video.id);
      return next;
    });
    const entry: PendingRefresh = {
      videoId: video.videoId,
      oldFileUrl: video.videoFileUrl,
      oldCoverUrl: video.coverUrl,
    };
    pendingRefreshRef.current.set(video.id, entry);
    setPendingRefresh(new Map(pendingRefreshRef.current));
    const refreshUrl = `https://www.kuaishou.com/short-video/${video.videoId}#smzs-refresh`;
    console.log("[wb-refresh] opening tab", refreshUrl);
    try {
      const opened = window.open(refreshUrl, "_blank");
      if (!opened) {
        console.log(
          "[wb-refresh] window.open returned null (popup may be blocked)",
        );
      }
    } catch (err) {
      console.log("[wb-refresh] window.open failed", err);
    }
    const timer = setTimeout(() => {
      refreshTimersRef.current.delete(video.id);
      if (!pendingRefreshRef.current.has(video.id)) return;
      pendingRefreshRef.current.delete(video.id);
      setPendingRefresh(new Map(pendingRefreshRef.current));
      setRefreshFailedIds((prev) => new Set(prev).add(video.id));
      setIntakeToast(
        "刷新超时：新打开的快手标签页没把新链接送回来——检查扩展是否开启（标签页要在同一个浏览器里打开，20 秒没结果会自动关）。",
      );
    }, 10_000);
    refreshTimersRef.current.set(video.id, timer);
  };

  // 组件卸载时清掉全部刷新计时器，避免对已卸载组件 setState。
  useEffect(() => {
    const timers = refreshTimersRef.current;
    return () => {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, []);

  // 成功判定：feed 数据更新后，逐个 pending 对比链接——变了即
  // 刷新成功（toast「链接已刷新」）。feed 由 intake 建卡后的
  // invalidate 与中转轮询刷新驱动，本页不用另拉。
  useEffect(() => {
    if (!feedQuery.data) return;
    if (pendingRefreshRef.current.size === 0) return;
    const byDbId = new Map<number, FeedVideo>();
    for (const a of feedQuery.data.accounts) {
      for (const v of a.videos) byDbId.set(v.id, v);
    }
    for (const [dbId, pending] of [...pendingRefreshRef.current]) {
      const cur = byDbId.get(dbId);
      if (!cur) continue;
      if (
        cur.videoFileUrl !== pending.oldFileUrl ||
        cur.coverUrl !== pending.oldCoverUrl
      ) {
        clearPendingRefresh(dbId);
        setRefreshFailedIds((prev) => {
          if (!prev.has(dbId)) return prev;
          const next = new Set(prev);
          next.delete(dbId);
          return next;
        });
        setIntakeToast("链接已刷新");
      }
    }
    // clearPendingRefresh / setIntakeToast 均为稳定引用口径。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedQuery.data]);

  // v4.63：刷新回程只走 intake（payload 带 _refreshVideoId，见
  // 下方 intake 处理函数的刷新分支）——旧的 smzs-refresh-result
  // 直回监听已下线，这里不再注册任何刷新结果处理器。

  // ------------------------------------------------------------------
  // v4.65 云端已存视图 + v4.66 批量「存云端」+ v4.67 后台队列：
  //   · 已存状态以云端清单为准——listCloudSavedVideos 读
  //     video-cloud/state.json 的 downloaded；「云端已存」视图、
  //     批量勾选窗的「已存」标识都据此判定，关掉重开也保持
  //     （不靠本页内存）；
  //   · 批量入口：点开 CloudBatchSaveModal 悬浮窗，列出当前视图
  //     的全部视频（缩略图 + 标题 + 时长 + 复选框，已存的标
  //     「已存」不可选），顶部全选、底部「确认存入（N）」；
  //   · v4.67 起确认不再在本页逐个等下载：调 enqueueCloudVideos
  //     把勾选条目（videoId + 当前 video_play_url + 标题 + 达人
  //     名）写入服务端后台队列（video-cloud/queue.json）后悬浮
  //     窗直接关闭，toast「已加入后台队列（N 条），后台存入中
  //     不影响你继续用」；下载由服务端后台进程 3 并发处理，
  //     进度与每条结果看存储进度条下方的 CloudQueueStatus 常驻
  //     状态，全部完成另有汇总 toast。ID 不合法 / 没有文件链
  //     接的条目也照常入队，由后台逐条记失败原因（不冒泡拦住
  //     整批）。
  // ------------------------------------------------------------------
  const cloudSavedQuery = useQuery({
    queryKey: ["cloud-saved"],
    queryFn: () => withReadTimeout(() => api.listCloudSavedVideos({})),
    retry: retryReadQuery,
  });
  const cloudSavedEntries = cloudSavedQuery.data?.saved ?? [];
  const cloudSavedIds = new Set(cloudSavedEntries.map((e) => e.videoId));
  const cloudSavedAt = new Map(
    cloudSavedEntries.map((e) => [e.videoId, e.at] as const),
  );
  // v4.68 云端数字三口径对齐：
  //   · cloudTotalCount = 云端文件总数 N——与存储进度条同一个
  //     ['cloud-storage'] 查询（getCloudStorage 每次实时读
  //     state.json、无缓存，video_count = downloaded 条数）；
  //   · cloudCardCount = 交集 M——云端清单里有、且监控页还有卡
  //     片的视频数（「云端已存」视图实际显示的条数、tab 括号
  //     里的数）。两者不一致（N > M）说明有卡片被删了、云端文
  //     件还在，「云端已存」视图顶部会给一行小字说明。
  const cloudStorageQuery = useQuery({
    queryKey: ["cloud-storage"],
    queryFn: () => withReadTimeout(() => api.getCloudStorage({})),
    retry: retryReadQuery,
    refetchInterval: 60_000,
  });
  const cloudTotalCount = cloudStorageQuery.data?.video_count;
  let cloudCardCount = 0;
  for (const a of accounts) {
    for (const v of a.videos) {
      if (v.videoId && cloudSavedIds.has(v.videoId)) cloudCardCount += 1;
    }
  }
  // 批量存云端悬浮窗状态：open = 窗开着；selected = 勾选的
  // videoId 集合（开窗时清空，每次重新勾）。itemsRef 每渲染同
  // 步当前视图的视频清单，确认时按勾选从这里取（视图口径见下
  // 方 currentViewVideos 的计算处，与各视图渲染同一口径）。
  const [cloudBatchOpen, setCloudBatchOpen] = useState(false);
  const [cloudBatchSelected, setCloudBatchSelected] = useState<Set<string>>(
    () => new Set(),
  );
  const cloudBatchItemsRef = useRef<
    { account: FeedAccount; video: FeedVideo }[]
  >([]);

  const openCloudBatch = () => {
    setCloudBatchSelected(new Set());
    setCloudBatchOpen(true);
  };

  const toggleCloudBatchItem = (videoId: string, checked: boolean) => {
    setCloudBatchSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(videoId);
      else next.delete(videoId);
      return next;
    });
  };

  const toggleCloudBatchAll = (checked: boolean) => {
    if (!checked) {
      setCloudBatchSelected(new Set());
      return;
    }
    const next = new Set<string>();
    for (const { video } of cloudBatchItemsRef.current) {
      if (video.videoId && !cloudSavedIds.has(video.videoId)) {
        next.add(video.videoId);
      }
    }
    setCloudBatchSelected(next);
  };

  // v4.67 确认存入 = 入队即走：先按勾选组装条目（标题取描述首
  // 行，与卡面同口径），关窗清勾选，再调入队动作；入队成功
  // toast「已加入后台队列（N 条），后台存入中不影响你继续用」
  // 并刷队列状态（存储进度条下方立刻出现「后台存入中 x/y」）；
  // 入队本身失败（服务端没写进队列文件）才 toast 失败原因——
  // 这一步只是写文件、很快，下载的成败由后台逐条记在队列里。
  const confirmCloudBatch = async () => {
    const targets = cloudBatchItemsRef.current.filter(
      ({ video }) =>
        video.videoId &&
        cloudBatchSelected.has(video.videoId) &&
        !cloudSavedIds.has(video.videoId),
    );
    if (targets.length === 0) return;
    const items = targets.map(({ account, video }) => ({
      videoId: video.videoId,
      url: video.videoFileUrl ?? "",
      title: splitDescription(video.description).title || video.videoId,
      creatorName: account.name ?? "",
    }));
    setCloudBatchOpen(false);
    setCloudBatchSelected(new Set());
    try {
      const res = await api.enqueueCloudVideos({ items });
      if (res.ok) {
        setIntakeToast(
          `已加入后台队列（${res.queued} 条），后台存入中不影响你继续用`,
        );
        queryClient.invalidateQueries({ queryKey: ["cloud-queue"] });
      } else {
        setIntakeToast(
          `加入后台队列失败：${res.error ?? "请稍后再试"}`,
        );
      }
    } catch (e) {
      setIntakeToast(`加入后台队列失败：${describeThrownError(e)}`);
    }
  };

  // 服务端清除下限并入（v4.50）：listMonitorFeed 带回的
  // clearedAtMs 是全服务端共享的最近清除时刻——在其它标签页 /
  // 浏览器点的一键清除靠它在本页生效：比本机下限大就并入本机
  // （ref + localStorage 双写），此后桥接补推与中转派发的旧上报
  // 都会被处理函数下限拦住。每次拿到新 feed 数据都对一次（不只
  // 首次），本页开着时别处的清除也能跟上。
  useEffect(() => {
    const serverFloor = feedQuery.data?.clearedAtMs ?? 0;
    if (serverFloor > intakeFloorRef.current) {
      intakeFloorRef.current = serverFloor;
      saveIntakeFloor(serverFloor);
      console.log(
        `[load] 服务端清除下限 ${serverFloor} 已并入本机 intake 下限`,
      );
    }
  }, [feedQuery.data?.clearedAtMs]);
  const [viewMode, setViewMode] = useState<MonitorViewMode>(() => {
    try {
      const saved = window.localStorage.getItem(MONITOR_VIEW_STORAGE_KEY);
      if (saved === "collected" || saved === "latest" || saved === "date" || saved === "creator" || saved === "group" || saved === "cloud") return saved;
    } catch {
      // localStorage 不可用时用默认视图
    }
    return "latest";
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(MONITOR_VIEW_STORAGE_KEY, viewMode);
    } catch {
      // 忽略写入失败
    }
  }, [viewMode]);

  // 顶部使用说明折叠：默认收起只显示一行标题，展开/收起状态记 localStorage 下次保持。
  const [guideOpen, setGuideOpen] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(MONITOR_GUIDE_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(MONITOR_GUIDE_STORAGE_KEY, guideOpen ? "1" : "0");
    } catch {
      // 忽略写入失败
    }
  }, [guideOpen]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["monitor-feed"] });
    // v4.64：删卡会同步删云端文件，存储进度条跟着刷新（不必等 60 秒轮询）。
    queryClient.invalidateQueries({ queryKey: ["cloud-storage"] });
    // v4.65：云端清单同理（删卡同步删文件 + 清单条目）。
    queryClient.invalidateQueries({ queryKey: ["cloud-saved"] });
  };

  // 卡片版式（v4.51）：三款设计 + 等比缩小档位合存一个状态，
  // 版式面板里点选即生效并经 saveCardDisplay 落 localStorage
  // （monitor-card-display-v1），五种视图所有卡片同步切换。
  const [cardDisplay, setCardDisplay] = useState<{
    style: MonitorCardStyle;
    scale: MonitorCardScale;
  }>(() => loadCardDisplay());
  const cardStyle = cardDisplay.style;
  const cardScale = cardDisplay.scale;
  const cardGap = cardGapFor(cardStyle);
  const [layoutOpen, setLayoutOpen] = useState(false);
  const openLayoutPanel = () => setLayoutOpen((v) => !v);
  const updateCardDisplay = (next: {
    style: MonitorCardStyle;
    scale: MonitorCardScale;
  }) => {
    setCardDisplay(next);
    saveCardDisplay(next.style, next.scale);
  };

  // 单行粘贴输入框：粘贴即自动解析建卡。pasteBusy 防同一段粘贴
  // 重复触发；失败时框内文本保留，成功才清空。
  const [pasteInput, setPasteInput] = useState("");
  const [pasteBusy, setPasteBusy] = useState(false);
  const pasteBusyRef = useRef(false);
  // Excel 导入（v4.44）：excelBusy 防重复导入；隐藏 file input 由
  // 「导入 Excel」按钮触发，选完即解析建卡，input 值随手清掉以便
  // 同一个文件改完能再选一次。
  const [excelBusy, setExcelBusy] = useState(false);
  const excelBusyRef = useRef(false);
  const excelInputRef = useRef<HTMLInputElement | null>(null);
  // 悬浮播放（v4.31）：当前正在页内播放的视频，非空时渲染播放窗。
  // v4.65：cloudOnly = 从「云端已存」视图打开，只播云端不回退。
  const [playing, setPlaying] = useState<{
    video: FeedVideo;
    creatorName: string;
    cloudOnly?: boolean;
  } | null>(null);
  // 详情悬浮窗：当前查看详情的视频及所属达人信息，非空时渲染。
  const [detail, setDetail] = useState<{
    video: FeedVideo;
    creatorName: string;
    creatorId: string;
    creatorUrl: string;
  } | null>(null);
  // 扩展上报 toast（v4.33）：intake 建卡完成后显示，7 秒自动收起。
  const [intakeToast, setIntakeToast] = useState<string | null>(null);
  // 钩子状态（v4.34）：挂载后复查一次 window 上钩子在不在，页首
  // 状态行如实显示——真机排查时不用开控制台就能先看这一行。
  const [intakeReady, setIntakeReady] = useState(false);

  // 中转轮询（v4.41 服务端代理）：中转地址与密钥在服务端内置，
  // 前端没有任何配置项——监控页打开就经同源服务端动作
  // fetchRelayIntake 轮询（挂载立即拉一次 + 每 10 秒一次），
  // since 游标记在 lastReportedAtRef 并持久化到 localStorage
  // （v4.48，见 RELAY_SINCE_STORAGE_KEY 注释）。状态行保留：未连接前是
  // 「连接中…」，成功「已连接」，失败「连接失败（原因）」——
  // 原因由服务端代理透回（中转不可达 / HTTP 状态码 / 密钥错）。
  const [relayStatus, setRelayStatus] = useState<RelayStatus>({
    kind: "connecting",
  });
  // 「测试连接」诊断（v4.41 改服务端版）：testing 防重复点；
  // lines 是服务端两步诊断的逐行结果，渲染在状态行下方（空数
  // 组 = 还没测过，不渲染）。
  const [relayTesting, setRelayTesting] = useState(false);
  const [relayTestLines, setRelayTestLines] = useState<string[]>([]);
  const relayFailCountRef = useRef(0);
  const relayPausedRef = useRef(false);
  const relayPollingRef = useRef(false);
  // 一键清除进行中标记（v4.48）：置位期间轮询不启动新一轮，
  // 清除动作本身会先等正在进行的一轮轮询收尾再删服务端数据，
  // 堵住「轮询在途的旧 reports 在删除之后落卡」的竞态。
  const relayClearingRef = useRef(false);
  // 一键清除下限（v4.48；v4.49 改数字毫秒）：最近一次清除把游
  // 标推到的毫秒时间点。在途轮询批次按下限数值拦截旧 reports
  // （见 pollOnce）；初值取持久化游标——刷新前刚清除过的话，
  // 游标本身就是清除时间点。
  const relayClearFloorRef = useRef<number>(loadRelaySince());
  // 通道无关 intake 清除下限（v4.50，见 INTAKE_FLOOR_STORAGE_KEY
  // 注释）：初值读本机落盘值；处理函数每次调用时还会现读
  // localStorage 并与服务端下限取大（其它标签页刚写的即时生
  // 效），本 ref 只是同页内的快速通道。
  const intakeFloorRef = useRef<number>(loadIntakeFloor());
  // 游标初值从 localStorage 读回（v4.48；v4.49 归一化为数字毫
  // 秒）：刷新 / 重开页面都接着上次推进到的位置拉，不再从空游
  // 标把中转旧数据全量拉回。从没存过（第一次打开）才是 0，
  // 首拉全量同步一次后落盘。
  const lastReportedAtRef = useRef<number>(loadRelaySince());

  // 推进游标：只前进不后退（纯数值比较），推进即落盘（v4.49）。
  const advanceRelayCursor = (ms: number) => {
    if (!Number.isFinite(ms) || ms <= lastReportedAtRef.current) return;
    lastReportedAtRef.current = ms;
    saveRelaySince(ms);
  };

  // 「测试连接」（v4.41）：不再从浏览器直连中转（会被 iframe
  // CSP 拦），改调服务端动作 testRelayConnection——服务端依次
  // 测 /ping（免密钥）与 /intake（带内置密钥），每步结果逐行显
  // 示在状态行下方。
  const testRelayConnection = async () => {
    if (relayTesting) return;
    setRelayTesting(true);
    setRelayTestLines(["测试连接：正在经服务端代理测中转…"]);
    try {
      // v6.04：带左下角「设置·监控中转站」里自填的地址/密钥（当次
      // 现读现传，没填的项服务端回落内置值）。
      const res = await api.testRelayConnection({
        ...relayActionArgs(loadRelaySettings()),
      });
      setRelayTestLines(
        res.lines.length > 0 ? res.lines : ["测试连接：服务端没返回结果。"],
      );
    } catch (e) {
      console.error("[relay] proxy test failed:", e);
      setRelayTestLines([
        `测试连接：服务端代理调用失败（${describeThrownError(e)}）`,
      ]);
    } finally {
      setRelayTesting(false);
    }
  };

  const resumeRelayPolling = () => {
    if (!relayPausedRef.current) return;
    relayPausedRef.current = false;
    relayFailCountRef.current = 0;
    setRelayStatus({ kind: "connecting" });
  };

  // 轮询本体：只在监控页打开（本组件挂载）时跑，无需任何前端
  // 配置（服务端已内置）。每轮调同源服务端动作 fetchRelayIntake
  // （同源 /api/relay/intake?since= 口径）——浏览器只跟同源服务
  // 端说话，不直连中转、不受 iframe CSP 影响；中转地址与密钥只
  // 在服务端。失败只更新状态行、绝不弹 toast，原因用服务端透
  // 回的原文；连续失败 6 次后暂停，等用户点状态行恢复。成功一
  // 次即清零失败计数并置「已连接」。
  useEffect(() => {
    if (relayPausedRef.current) return;
    let cancelled = false;

    const pollOnce = async () => {
      if (
        relayPausedRef.current ||
        relayPollingRef.current ||
        relayClearingRef.current
      )
        return;
      relayPollingRef.current = true;
      // 多开对齐（v4.50）：本轮开始前现读一次共享状态——另一标
      // 签页刚做的一键清除会把游标与 intake 下限写进 localStorage
      // （同浏览器共享），把它们并入本页内存值，本页这一轮就不会
      // 再用陈旧游标把旧 reports 拉回派发（跨浏览器由服务端下限
      // 在代理层兜底，见 fetchRelayIntake 的 v4.50 注释）。
      const freshSince = loadRelaySince();
      if (freshSince > lastReportedAtRef.current) {
        lastReportedAtRef.current = freshSince;
      }
      if (freshSince > relayClearFloorRef.current) {
        relayClearFloorRef.current = freshSince;
      }
      const freshFloor = loadIntakeFloor();
      if (freshFloor > intakeFloorRef.current) {
        intakeFloorRef.current = freshFloor;
      }
      if (freshFloor > relayClearFloorRef.current) {
        relayClearFloorRef.current = freshFloor;
      }
      // 本轮下限（v4.48；v4.49 改数字毫秒）：发起请求时用的
      // since。派发拦截按下限判而不是按实时游标判——同一批
      // reports 不保证升序，按实时游标判会把批内较旧的一条误
      // 拦掉。比较全程数值比较（reportedAtMs 由服务端代理层
      // 归一化），字符串与字典序不再参与。
      const batchFloor = lastReportedAtRef.current;
      const sinceSent = batchFloor > 0 ? String(batchFloor) : "";
      try {
        // v6.04：每轮现读左下角「设置·监控中转站」的自填地址/密钥
        // 当次透传（改了设置下一轮即生效；没填回落服务端内置值）。
        const data = await api.fetchRelayIntake({
          since: sinceSent,
          ...relayActionArgs(loadRelaySettings()),
        });
        if (!data.ok) {
          throw new Error(data.error ?? "中转代理失败");
        }
        relayFailCountRef.current = 0;
        if (!cancelled) setRelayStatus({ kind: "connected" });
        const reports = data.reports as Record<string, unknown>[];
        const blockedList = data.blocked ?? [];
        console.log(
          `[relay] intake since=${sinceSent || "(空)"} 返回 ${reports.length + blockedList.length} 条`,
        );
        // 服务端数值过滤拦下的旧 report 逐条打拦截日志（原因
        // 由服务端给出）；它们不推进游标。
        for (const b of blockedList) {
          console.log(`[relay] report ${b.reportedAt} 被拦截(${b.reason})`);
        }
        for (const report of reports) {
          if (!report || typeof report !== "object") continue;
          const raRaw = report.reportedAt;
          const raStr =
            raRaw === undefined || raRaw === null || String(raRaw) === ""
              ? "(无)"
              : String(raRaw);
          // 归一化毫秒：优先用服务端附的 reportedAtMs，缺失时
          // 客户端按同口径现算；解析不了 = null。
          const ms =
            typeof report.reportedAtMs === "number"
              ? report.reportedAtMs
              : parseRelayReportedAtMs(raRaw);
          if (ms === null) {
            // 非法时间戳（如 2026-11-03T99:99:99.000Z）：按最
            // 旧处理直接拦截——v4.48 正是栽在它字典序大于真实
            // 时刻、穿过清除下限被反复派发重建上。
            console.log(
              `[relay] report ${raStr} 被拦截(reportedAt 无法解析，按最旧处理)`,
            );
            continue;
          }
          // 派发拦截（v4.49，纯数值）：reportedAtMs 不晚于本轮
          // 下限、或不晚于一键清除下限的 report 不派发建卡
          // （游标照常推进）。清除下限堵的是竞态：清除前以旧
          // since 发起的在途请求在删除之后才返回，它带的旧
          // reports 会被逐条拦下，不会把刚清掉的卡片建回来。
          if (ms <= batchFloor) {
            console.log(
              `[relay] report ${raStr} 被拦截(不晚于本轮下限 ${batchFloor})`,
            );
            advanceRelayCursor(ms);
            continue;
          }
          if (
            relayClearFloorRef.current > 0 &&
            ms <= relayClearFloorRef.current
          ) {
            console.log(
              `[relay] report ${raStr} 被拦截(不晚于一键清除下限 ${relayClearFloorRef.current})`,
            );
            advanceRelayCursor(ms);
            continue;
          }
          console.log(`[relay] report ${raStr} 被接受`);
          const p = dispatchMonitorIntake(report, "relay");
          if (p) {
            try {
              await p;
            } catch {
              // 单条处理失败不算轮询失败：去重与建卡结果已在处理
              // 入口里打日志，轮询本身是通的。
            }
          }
          advanceRelayCursor(ms);
        }
      } catch (e) {
        // 代理失败原因打到 console 便于定位（服务端透回的原因里
        // 不含密钥）；页面上只进状态行、不弹 toast。
        console.error("[relay] proxy failed:", e);
        if (cancelled) return;
        const reason =
          e instanceof Error && e.message
            ? e.message
            : "网络错误";
        relayFailCountRef.current += 1;
        if (relayFailCountRef.current >= 6) {
          relayPausedRef.current = true;
          setRelayStatus({ kind: "paused", reason });
        } else {
          setRelayStatus({ kind: "failed", reason });
        }
      } finally {
        relayPollingRef.current = false;
      }
    };

    void pollOnce();
    const timer = setInterval(() => {
      if (relayPausedRef.current) {
        clearInterval(timer);
        return;
      }
      void pollOnce();
    }, 10_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // 暂停的恢复由状态行点击把 relayPausedRef 清掉后，靠下面的
    // relayStatus 变化重新触发本效果——paused 状态退出即重跑。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relayStatus.kind === "paused"]);

  useEffect(() => {
    if (!intakeToast) return;
    const t = setTimeout(() => setIntakeToast(null), 7000);
    return () => clearTimeout(t);
  }, [intakeToast]);

  // intake 处理函数（v4.33 建卡逻辑不变；v4.34 注册方式改两层制）：
  // 钩子本体是 main.tsx 渲染前装在 window 上的桩（monitorintake.ts），
  // 本页挂载时只把下面这个处理函数挂到槽位——桩会把处理函数到位前
  // 排队的调用逐个转交过来；卸载时只摘处理函数，钩子本体不删。
  // 逐行串行走 fetchMonitorVideo——与手动点「获取」完全同一套管线
  // （服务端按达人链接归户、同账号同视频ID/链接去重回 duplicated、
  // listMonitorFeed 组内发布时间倒序），串行是为了同批多条同达人时
  // 归户与去重不竞态。单行失败计 skipped，不拖垮整批。
  useEffect(() => {
    const handler = (
      payload: unknown,
    ): MonitorIntakeResult | Promise<MonitorIntakeResult> => {
      const p = payload as IntakePayload | null;
      if (!p || p.protocol !== "smzs-monitor-intake/1") return { ok: false };
      if (!Array.isArray(p.rows)) return { ok: false };
      const rows = p.rows as IntakeRow[];
      const total = rows.length;
      // v4.63 刷新回程：payload 带 _refreshVideoId = 这不是新采集，
      // 是用户点「🔄 刷新链接」后扩展在新打开的快手标签页抓到的
      // 新链接。rows 只有 id + video_play_url（可能另带封面）。
      // 命中标记走本分支：按 videoId 调 refreshMonitorVideoLinks
      // 只更新链接字段（与 fetchMonitorVideo duplicated 只更新
      // 链接同一口径）、不建新卡、不走归户 / 墓碑 / 清除下限；
      // 成功后清掉对应 pending（按钮「正在刷新…」状态解除）并
      // toast「链接已刷新」。卡不存在 / 没带新链接计 skipped，
      // pending 留给 10 秒超时口径提示。
      const refreshIdRaw = p._refreshVideoId;
      const refreshVideoId =
        refreshIdRaw === undefined || refreshIdRaw === null
          ? ""
          : String(refreshIdRaw).trim();
      if (refreshVideoId) {
        return (async (): Promise<MonitorIntakeResult> => {
          let refreshedCount = 0;
          let skippedCount = 0;
          // 【第 8 档】写回成功后要转发给中转的那一行：刷新回程恒
          // 为单视频单行，多行时取第一条写回成功且带文件链接的。
          let forwardRow: {
            videoId: string;
            fileUrl: string;
            cover: string;
          } | null = null;
          for (const row of rows) {
            if (!row || typeof row !== "object") {
              skippedCount++;
              continue;
            }
            const rowId =
              intakeString(
                pickIntakeField(row, ["id", "video_id", "videoId"]),
              ) || refreshVideoId;
            const fileUrl = intakeString(
              pickIntakeField(row, [
                "video_play_url",
                "video_file_url",
                "videoFileUrl",
                "play_url",
                "playUrl",
              ]),
            );
            const cover = intakeString(
              pickIntakeField(row, [
                "video_cover",
                "cover_url",
                "coverUrl",
                "cover",
              ]),
            );
            if (!fileUrl && !cover) {
              skippedCount++;
              continue;
            }
            try {
              const res = await api.refreshMonitorVideoLinks({
                videoId: rowId,
                ...(fileUrl ? { videoFileUrl: fileUrl } : {}),
                ...(cover ? { coverUrl: cover } : {}),
              });
              if (!res.ok) {
                skippedCount++;
                continue;
              }
              refreshedCount++;
              if (!forwardRow && fileUrl) {
                forwardRow = { videoId: rowId, fileUrl, cover };
              }
              // 扩展已回执：哪怕新链接与现值相同（updated=false）
              // 也算刷新完成，清 pending 防误报超时。
              for (const [dbId, pending] of [
                ...pendingRefreshRef.current,
              ]) {
                if (pending.videoId === rowId) {
                  clearPendingRefresh(dbId);
                  setRefreshFailedIds((prev) => {
                    if (!prev.has(dbId)) return prev;
                    const next = new Set(prev);
                    next.delete(dbId);
                    return next;
                  });
                }
              }
            } catch {
              skippedCount++;
            }
          }
          console.log(
            `[wb-refresh] intake refresh _refreshVideoId=${refreshVideoId} refreshed=${refreshedCount} skipped=${skippedCount}`,
          );
          // 【第 8 档·路线 (a)】写回成功后顺手把新链接转发到中转
          // /report：cron 下载器只读中转 intake，不转发它永远拿不
          // 到新链接、只能在旧过期链接上反复 403。转发失败只打日
          // 志——写回与上面的 pending 清理已经完成，不许转发结果
          // 反过来影响刷新结果与给扩展的回执。
          const fwdRow = forwardRow;
          if (fwdRow) {
            try {
              const fwd = await api.forwardRefreshToRelay({
                videoId: fwdRow.videoId,
                videoFileUrl: fwdRow.fileUrl,
                coverUrl: fwdRow.cover,
                reportedAt:
                  p.reportedAt === undefined || p.reportedAt === null
                    ? ""
                    : String(p.reportedAt),
                platform:
                  p.platform === undefined || p.platform === null
                    ? ""
                    : String(p.platform),
                // v6.04：与拉取同一份中转站设置（左下角「设置」自填，
                // 没填回落服务端内置值）。
                ...relayActionArgs(loadRelaySettings()),
              });
              console.log(
                fwd.ok
                  ? `[wb-refresh] relay forward ok videoId=${fwdRow.videoId}`
                  : `[wb-refresh] relay forward failed videoId=${fwdRow.videoId}: ${fwd.error ?? "未知原因"}`,
              );
            } catch (e) {
              console.warn("[wb-refresh] relay forward error", e);
            }
          }
          if (refreshedCount > 0) {
            setIntakeToast("链接已刷新");
            queryClient.invalidateQueries({ queryKey: ["monitor-feed"] });
          }
          return { ok: true, created: 0, skipped: skippedCount };
        })();
      }
      // 通道无关清除下限拦截（v4.50）：本处理函数是桥接
      // （CustomEvent / postMessage / 钩子直调）与中转轮询的唯一
      // 汇合点。下限每次现读 localStorage 并与内存值取大（另一
      // 标签页刚点过清除即时生效；服务端下限经 feed 并入同一存
      // 储）。reportedAt 不晚于下限 = 清除之前上报的旧数据（典
      // 型是扩展 storage 里未消费、页面每次加载都被补推的那批）
      // ——不建卡，但回 {ok:true, created:0, skipped:total}：让桥
      // 接凭回执把 storage 标记已消费、从源头停止补推；也不弹
      // 「收到扩展上报」的 toast，免得用户误以为又有新采集。
      // reportedAt 解析不了且已有下限时同样按旧数据拦（扩展正
      // 规上报的 reportedAt 恒为 ISO 串、必然可解析）。
      const floorNow = Math.max(intakeFloorRef.current, loadIntakeFloor());
      if (floorNow > 0) {
        const reportedMs = parseRelayReportedAtMs(p.reportedAt);
        if (reportedMs === null || reportedMs <= floorNow) {
          console.log(
            `[intake] report ${p.reportedAt === undefined || p.reportedAt === null || String(p.reportedAt) === "" ? "(无)" : String(p.reportedAt)} 被拦截(不晚于一键清除下限 ${floorNow}，通道无关)`,
          );
          return { ok: true, created: 0, skipped: total };
        }
      }
      return (async (): Promise<MonitorIntakeResult> => {
        let created = 0;
        let skipped = 0;
        let refreshed = 0;
        for (const row of rows) {
          if (!row || typeof row !== "object") {
            skipped++;
            continue;
          }
          try {
            // v4.54：fromIntake 标记自动投递——服务端据此查删除
            // 墓碑（单删 / 删达人 / 一键清除留下的），命中的按
            // duplicated 跳过：删过的卡不会被补推 / 双发第二份
            // 重建。手动粘贴与 Excel 导入不带这个标记，命中墓
            // 碑会先解除再建卡。
            const res = await api.fetchMonitorVideo({
              ...mapIntakeRow(row, p.platform),
              fromIntake: true,
            });
            if (!res.ok) skipped++;
            // v4.61：duplicated 且 updated = 「刷新链接」的回程
            // （同一视频带新链接回来，服务端只更新了链接字段）
            // ——单独计数，不算跳过重复；卡片链接变化后本页的
            // pending 对比会再发「链接已刷新」toast 收尾。
            else if (res.duplicated && res.updated) refreshed++;
            else if (res.duplicated) skipped++;
            else created++;
          } catch {
            skipped++;
          }
        }
        setIntakeToast(
          refreshed > 0
            ? `收到扩展上报 ${total} 条，新建卡 ${created} 张，刷新链接 ${refreshed} 张，跳过 ${skipped} 张重复`
            : `收到扩展上报 ${total} 条，新建卡 ${created} 张，跳过 ${skipped} 张重复`,
        );
        queryClient.invalidateQueries({ queryKey: ["monitor-feed"] });
        return { ok: true, created, skipped };
      })();
    };
    const detach = attachMonitorIntakeHandler(handler);
    setIntakeReady(typeof window.__monitorIntake === "function");
    return detach;
    // queryClient 由 React Query 保证稳定，挂载/卸载各挂摘一次。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 粘贴即建卡：解析整段「字段名：值」文本（复用 parsePastedInfo）
  // → 直接走 fetchMonitorVideo 建卡管线（归户 / 去重 / 倒序不变）。
  // 0 项认出 → toast 提示格式不对、文本保留；服务端拒收 / 请求
  // 失败 → toast 报错、文本保留；建卡成功 → toast「已建卡 1 张」
  // 并清空输入框；重复视频 → toast 说明已跳过并清空（内容已入库
  // 过，留着只会重复触发）。
  const handlePastedText = async (text: string) => {
    if (pasteBusyRef.current) return;
    if (!text.trim()) return;
    const { patch, recognized } = parsePastedInfo(text);
    if (recognized.length === 0) {
      setIntakeToast(
        "格式不对：没认出任何一项——请按「字段名：值」一行一项粘贴，如「视频ID：3xnukh46rac9yww」。框里的内容已保留，改好再粘一次。",
      );
      return;
    }
    const f: FormState = { ...EMPTY_FORM, ...patch };
    pasteBusyRef.current = true;
    setPasteBusy(true);
    try {
      const res = await api.fetchMonitorVideo({
        videoId: f.videoId.trim(),
        videoUrl: normalizeUrl(f.videoUrl),
        durationText: f.durationText.trim(),
        description: f.description.trim(),
        likeCount: parseCount(f.likeCount),
        playCount: parseCount(f.playCount),
        publishedAt: f.publishedAt.trim(),
        creatorId: f.creatorId.trim(),
        creatorUrl: normalizeUrl(f.creatorUrl),
        creatorName: f.creatorName.trim(),
        coverUrl: f.coverUrl.trim(),
        videoFileUrl: f.videoFileUrl.trim(),
        // v4.37 新增 6 项：数字走 parseCount（千分位逗号自动去掉），
        // 简介保留内部换行只收首尾空白，缺项就是空/0、不拦截。
        kuaishouId: f.kuaishouId.trim(),
        fansCount: parseCount(f.fansCount),
        totalLikeCount: parseCount(f.totalLikeCount),
        creatorBio: f.creatorBio.trim(),
        commentCount: parseCount(f.commentCount),
        collectedAt: f.collectedAt.trim(),
        // 手动粘贴建卡：不带自动投递标记，命中删除墓碑先解除。
        fromIntake: false,
      });
      if (!res.ok) {
        setIntakeToast(
          `${res.error ?? "没建卡，请检查粘贴内容。"} 框里的内容已保留，改好再粘一次。`,
        );
        return;
      }
      setPasteInput("");
      setIntakeToast(
        res.duplicated
          ? "这条视频已经建过卡了，没有重复添加。"
          : "已建卡 1 张",
      );
      invalidate();
    } catch (e) {
      setIntakeToast(
        `没建卡：${describeThrownError(e)}。框里的内容已保留，再粘一次试试。`,
      );
    } finally {
      pasteBusyRef.current = false;
      setPasteBusy(false);
    }
  };

  // Excel 导入（v4.44）：本地解析 .xlsx（monitorxlsx）→ 按表头列名
  // 对 18 项（PASTE_FIELD_MAP，规范名与简称都认，列序不限、缺列
  // 留空）→ 逐行串行走 fetchMonitorVideo 同一管线（按达人链接归户、
  // 同账号同视频ID/链接去重），口径与粘贴建卡、扩展上报完全一致。
  // 单行失败计 failed 并记首个原因，不拖垮整表；完成 toast 汇总
  // 新建 / 跳过重复 / 失败数。发布时间 / 采集时间若被表格存成了
  // 日期序列号（解析层没带样式没转回来的），在这里按字段兜底转。
  const handleExcelFile = async (file: File) => {
    if (excelBusyRef.current) return;
    if (!/\.xlsx$/i.test(file.name)) {
      setIntakeToast("只支持 .xlsx 表格文件——.xls 老格式请先在表格软件里另存为 .xlsx 再导入。");
      return;
    }
    excelBusyRef.current = true;
    setExcelBusy(true);
    try {
      const { headers, rows } = await parseMonitorXlsx(file);
      const recognizedHeaders = headers.filter(
        (h) => PASTE_FIELD_MAP[h.replace(/\s+/g, "")] !== undefined,
      );
      if (recognizedHeaders.length === 0) {
        setIntakeToast(
          "这个表格的表头一行都没认出来——第一行要写 18 项里的列名（如 视频ID、视频链接、达人链接），可以先点「下载模板」拿空表头照着填。",
        );
        return;
      }
      if (rows.length === 0) {
        setIntakeToast("表格里只有表头、没有数据行——一行填一条视频再导入。");
        return;
      }
      let created = 0;
      let duplicated = 0;
      let failed = 0;
      let firstError = "";
      for (const row of rows) {
        const f: FormState = { ...EMPTY_FORM };
        for (const [header, value] of Object.entries(row)) {
          const key = PASTE_FIELD_MAP[header.replace(/\s+/g, "")];
          if (key && value !== "") f[key] = value;
        }
        if (looksLikeExcelSerial(f.publishedAt)) {
          f.publishedAt = excelSerialToText(Number(f.publishedAt));
        }
        if (looksLikeExcelSerial(f.collectedAt)) {
          f.collectedAt = excelSerialToText(Number(f.collectedAt));
        }
        try {
          const res = await api.fetchMonitorVideo({
            videoId: f.videoId.trim(),
            videoUrl: normalizeUrl(f.videoUrl),
            durationText: f.durationText.trim(),
            description: f.description.trim(),
            likeCount: parseCount(f.likeCount),
            playCount: parseCount(f.playCount),
            publishedAt: f.publishedAt.trim(),
            creatorId: f.creatorId.trim(),
            creatorUrl: normalizeUrl(f.creatorUrl),
            creatorName: f.creatorName.trim(),
            coverUrl: f.coverUrl.trim(),
            videoFileUrl: f.videoFileUrl.trim(),
            kuaishouId: f.kuaishouId.trim(),
            fansCount: parseCount(f.fansCount),
            totalLikeCount: parseCount(f.totalLikeCount),
            creatorBio: f.creatorBio.trim(),
            commentCount: parseCount(f.commentCount),
            collectedAt: f.collectedAt.trim(),
            // Excel 导入同属手动入口：命中删除墓碑先解除再建卡。
            fromIntake: false,
          });
          if (!res.ok) {
            failed++;
            if (!firstError) firstError = res.error ?? "有一行没建卡";
          } else if (res.duplicated) duplicated++;
          else created++;
        } catch (e) {
          failed++;
          if (!firstError) firstError = describeThrownError(e);
        }
      }
      invalidate();
      setIntakeToast(
        `Excel 导入完成：共 ${rows.length} 行，新建卡 ${created} 张，跳过重复 ${duplicated} 张，失败 ${failed} 行。` +
          (failed > 0 && firstError ? `第一个失败原因：${firstError}` : ""),
      );
    } catch (e) {
      setIntakeToast(`Excel 没导入成：${describeThrownError(e)}`);
    } finally {
      excelBusyRef.current = false;
      setExcelBusy(false);
    }
  };

  // 删除卡片 / 删除达人整组
  const [pendingVideo, setPendingVideo] = useState<FeedVideo | null>(null);
  const [pendingAccount, setPendingAccount] = useState<FeedAccount | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const deleteVideoMut = useMutation({
    mutationFn: (id: number) => api.deleteMonitorVideo({ id }),
    onSuccess: () => {
      setPendingVideo(null);
      setDeleteError(null);
      invalidate();
    },
    onError: (e) => setDeleteError(`没删掉：${describeThrownError(e)}`),
  });
  const deleteAccountMut = useMutation({
    mutationFn: (id: number) => api.deleteMonitorAccount({ id }),
    onSuccess: () => {
      setPendingAccount(null);
      setDeleteError(null);
      invalidate();
    },
    onError: (e) => setDeleteError(`没删掉：${describeThrownError(e)}`),
  });

  // 一键清除（v4.43；v4.48 落游标持久化；v4.49 改纯数字毫秒比
  // 较）：只删全部视频卡片，达人与作者分组设置保留。服务端
  // clearMonitorVideos 本来就真删 monitor_videos 全部行——复
  // 活不在删除侧，在中转回流侧：v4.48 前游标只存内存、刷新归
  // 零全量拉回；v4.48 落盘后仍被混杂格式时间戳的字典序比较绕
  // 过（非法串 2026-11-03T99:99:99.000Z 大于任何真实清除时
  // 刻）。本版三重堵回流且全程数值比较：①动手前置 relayClear-
  // ingRef 拦止新一轮轮询、并等正在进行的一轮收尾（最多等
  // 20 秒）再删，在途批次不会在删除后落卡；②删成功后把游标
  // 推到当前毫秒并落 localStorage（advanceRelayCursor），刷
  // 新后首拉 since 接着清除时间点，服务端再按数值过滤一遍；
  // ③同时记清除下限 relayClearFloorRef（数字毫秒），本页内
  // 残余的旧批次派发时逐条数值拦截。
  // v4.50 补第四重（五层排查最终结论）：前三重全架在中转轮询上，
  // 但复活主通道是本地桥接补推（不经轮询）——本版在 intake 处理
  // 函数设通道无关下限：清除时把下限双写（本机 localStorage +
  // 服务端 clearedAtMs 已由 clearMonitorVideos 落库），处理函数
  // 对 reportedAt 不晚于下限的旧上报不建卡且回 ok 让扩展标记已
  // 消费。旧版注释里「本地桥接的重复上报仍走原有正常建卡，那是
  // 新采集」正是没修住的错误假设——补推的旧上报与新采集在处理
  // 函数处长得一样，只能靠 reportedAt 与下限区分。
  const [pendingClear, setPendingClear] = useState(false);
  const clearVideosMut = useMutation({
    mutationFn: async () => {
      relayClearingRef.current = true;
      try {
        for (let i = 0; i < 100 && relayPollingRef.current; i++) {
          await new Promise((r) => setTimeout(r, 200));
        }
        const res = await api.clearMonitorVideos({});
        // 删除一落定立刻推进游标 + 记清除下限（都在放行轮询之
        // 前）：放行后的第一轮就以新 since 拉，残余旧批次派发
        // 时也被下限拦下，没有给回流留窗口。v4.49：下限与游标
        // 都是数字毫秒（Date.now()），与归一化后的 reportedAtMs
        // 纯数值比较——旧版用 ISO 串记下限，非法时间戳串字典序
        // 大于它而穿过拦截，正是 v4.48 没修住的那条缝。
        const nowMs = Date.now();
        relayClearFloorRef.current = nowMs;
        advanceRelayCursor(nowMs);
        // 通道无关 intake 下限同步落盘（v4.50）：桥接补推与其它
        // 标签页的处理函数都读这个值；优先用服务端回的清除时刻
        // （clearedAtMs，删除与记下限在服务端同一动作里完成），
        // 它与本机 nowMs 只差网络往返，取大者更稳。
        const floorMs = Math.max(nowMs, res.clearedAtMs || 0);
        intakeFloorRef.current = floorMs;
        saveIntakeFloor(floorMs);
        // 落盘核验：读回 localStorage 与目标值对齐才算已落盘，
        // 对不上如实打异常（刷新后游标不可信、需再排查）。
        let readBack = "";
        try {
          readBack =
            window.localStorage.getItem(RELAY_SINCE_STORAGE_KEY) ?? "";
        } catch {
          readBack = "";
        }
        console.log(
          `[clear] 删除 ${res.deleted} 条，游标推到 ${nowMs}，${readBack === String(nowMs) ? "已落盘" : `落盘异常（读回=${readBack || "(空)"}）`}`,
        );
        return res;
      } finally {
        relayClearingRef.current = false;
      }
    },
    onSuccess: (res) => {
      setPendingClear(false);
      setDeleteError(null);
      setIntakeToast(`已一键清除全部 ${res.deleted} 条视频卡片，达人与分组设置都保留着。`);
      invalidate();
    },
    onError: (e) => setDeleteError(`没清掉：${describeThrownError(e)}`),
  });

  // ------------------------------------------------------------------
  // v5.55 监控 3 天留存清理（用户 2026-11-09 定：①删除门槛选 B、
  // ②触发选自动）：发布超 3 天（publishedAt 为空按入库时间）且点
  // 赞 <1000、播放 <50000 的卡片自动删（任一达标留；点赞播放均为
  // 0 的不删、进「无数据未判定」），删卡同步删云端。自动触发在服
  // 务端：本页挂载调 getMonitorCleanupStatus，服务端距上次清理
  // ≥24 小时就在那次调用里跑一轮（首次执行 = 本版上线后第一次打
  // 开监控页）。手动入口「立即清理」：先 preview 出清单、确认框核
  // 对、再 run 真删（服务端重判，不信前端清单）。
  // ------------------------------------------------------------------
  const cleanupStatusQuery = useQuery({
    queryKey: ["monitor-cleanup-status"],
    queryFn: () => withReadTimeout(() => api.getMonitorCleanupStatus({})),
    retry: retryReadQuery,
  });
  const cleanupStatus = cleanupStatusQuery.data;
  const cleanupAutoToastRef = useRef(false);
  useEffect(() => {
    const d = cleanupStatusQuery.data;
    if (!d || cleanupAutoToastRef.current) return;
    cleanupAutoToastRef.current = true;
    if (!d.autoRan) return;
    invalidate();
    if (d.autoDeletedCount > 0 || d.autoUnjudgedCount > 0) {
      setIntakeToast(
        `3 天留存自动清理：已删 ${d.autoDeletedCount} 条过期卡片（云端文件同步删除）${d.autoUnjudgedCount > 0 ? `；另有 ${d.autoUnjudgedCount} 条点赞播放都没采到数据、没删，见下方「清理记录」` : ""}。`,
      );
    }
    // invalidate 只依赖 queryClient，闭包引用稳定。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleanupStatusQuery.data]);

  const [cleanupPreview, setCleanupPreview] =
    useState<ApiResponse<typeof api, "previewMonitorCleanup"> | null>(null);
  const [cleanupPreviewBusy, setCleanupPreviewBusy] = useState(false);
  const [cleanupError, setCleanupError] = useState<string | null>(null);
  const [cleanupLogOpen, setCleanupLogOpen] = useState(false);
  const openCleanupPreview = async () => {
    setCleanupError(null);
    setCleanupPreviewBusy(true);
    try {
      const res = await api.previewMonitorCleanup({});
      setCleanupPreview(res);
    } catch (e) {
      setCleanupError(`清理清单没拉出来：${describeThrownError(e)}`);
    } finally {
      setCleanupPreviewBusy(false);
    }
  };
  const runCleanupMut = useMutation({
    mutationFn: () => api.runMonitorCleanup({}),
    onSuccess: (res) => {
      setCleanupPreview(null);
      setCleanupError(null);
      setIntakeToast(
        `已按 3 天留存规则删掉 ${res.deleted.length} 条卡片（云端文件同步删除）${res.unjudged.length > 0 ? `；${res.unjudged.length} 条没采到点赞播放数据、没删，见「清理记录」` : ""}。删除记录已存档，可在下方「清理记录」里查。`,
      );
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["monitor-cleanup-status"] });
    },
    onError: (e) => setCleanupError(`没删成：${describeThrownError(e)}`),
  });

  // v4.66 批量存云端：悬浮窗列出的「当前视图所有视频」——与下方
  // 各视图渲染同一口径、同一顺序算出来（成员集合一致是关键）：
  // 最新采集 = 全部按采集时间倒序；最新对比 = 每达人最新一条；
  // 按日期分组 = 日期倒序、组内点赞降序拉平；按达人分组 = 有视
  // 频的达人依次拉平（feed 内已按发布时间倒序）；按作者分组 =
  // 命名组依次 + 未分组收尾（只含有视频的达人，与视图一致）；
  // 云端已存 = 清单里有的按存入时间倒序。每渲染同步进 ref，
  // 批量确认与全选都从 ref 取（与窗里看到的一致）。
  const currentViewVideos = ((): { account: FeedAccount; video: FeedVideo }[] => {
    const flat: { account: FeedAccount; video: FeedVideo }[] = [];
    for (const a of accounts) for (const v of a.videos) flat.push({ account: a, video: v });
    if (viewMode === "collected") {
      const collectedTime = (v: FeedVideo) => {
        const c = v.collectedAt ? new Date(v.collectedAt).getTime() : NaN;
        if (!Number.isNaN(c)) return c;
        const t = new Date(v.createdAt).getTime();
        return Number.isNaN(t) ? 0 : t;
      };
      return [...flat].sort((x, y) => collectedTime(y.video) - collectedTime(x.video));
    }
    if (viewMode === "latest") {
      return accounts
        .map((a) => {
          const sorted = [...a.videos].sort((x, y) => {
            const tx = x.publishedAt ? new Date(x.publishedAt).getTime() : 0;
            const ty = y.publishedAt ? new Date(y.publishedAt).getTime() : 0;
            return ty - tx;
          });
          return sorted[0] ? { account: a, video: sorted[0] } : null;
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
        .sort((a, b) => {
          const ta = a.video.publishedAt ? new Date(a.video.publishedAt).getTime() : 0;
          const tb = b.video.publishedAt ? new Date(b.video.publishedAt).getTime() : 0;
          return tb - ta;
        });
    }
    if (viewMode === "date") {
      const byDate = new Map<string, { account: FeedAccount; video: FeedVideo }[]>();
      for (const item of flat) {
        const key = dateKeyShanghai(item.video.publishedAt);
        const arr = byDate.get(key) ?? [];
        arr.push(item);
        byDate.set(key, arr);
      }
      const keys = [...byDate.keys()].sort((a, b) => {
        if (a === "时间未填") return 1;
        if (b === "时间未填") return -1;
        return b.localeCompare(a);
      });
      const out: { account: FeedAccount; video: FeedVideo }[] = [];
      for (const key of keys) {
        const items = [...(byDate.get(key) ?? [])].sort(
          (x, y) => (y.video.likeCount ?? 0) - (x.video.likeCount ?? 0),
        );
        out.push(...items);
      }
      return out;
    }
    if (viewMode === "group") {
      const knownIds = new Set(groups.map((g) => g.id));
      const out: { account: FeedAccount; video: FeedVideo }[] = [];
      for (const g of groups) {
        for (const a of accounts) {
          if (a.groupId === g.id) for (const v of a.videos) out.push({ account: a, video: v });
        }
      }
      for (const a of accounts) {
        if (a.groupId == null || !knownIds.has(a.groupId)) {
          for (const v of a.videos) out.push({ account: a, video: v });
        }
      }
      return out;
    }
    if (viewMode === "cloud") {
      const items: { account: FeedAccount; video: FeedVideo; atMs: number }[] = [];
      for (const item of flat) {
        const at = cloudSavedAt.get(item.video.videoId);
        if (at !== undefined) items.push({ ...item, atMs: parseCloudSavedAt(at) });
      }
      items.sort((x, y) => y.atMs - x.atMs);
      return items.map(({ account, video }) => ({ account, video }));
    }
    // creator（按达人分组）：有视频的达人依次拉平。
    const out: { account: FeedAccount; video: FeedVideo }[] = [];
    for (const a of accounts) {
      if (a.videos.length === 0) continue;
      for (const v of a.videos) out.push({ account: a, video: v });
    }
    return out;
  })();
  cloudBatchItemsRef.current = currentViewVideos;
  const cloudBatchSelectableCount = currentViewVideos.filter(
    ({ video }) => video.videoId && !cloudSavedIds.has(video.videoId),
  ).length;
  const cloudBatchAllChecked =
    cloudBatchSelectableCount > 0 &&
    currentViewVideos.every(
      ({ video }) =>
        !video.videoId ||
        cloudSavedIds.has(video.videoId) ||
        cloudBatchSelected.has(video.videoId),
    );

  return (
    <section aria-label="监控账号">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="font-display text-xl font-bold">监控账号</h2>
        {feedQuery.data && (
          <p className="text-sm text-[var(--dim)]">
            {accounts.length} 位达人 · {totalVideos} 条视频卡片
          </p>
        )}
        <span className="ml-auto flex flex-wrap items-center gap-2 self-center">
          <button
            type="button"
            className="btn btn-sm"
            aria-label="下载 Excel 导入模板（只有18项表头的空表格）"
            onClick={() =>
              downloadMonitorTemplateXlsx(PASTE_FIELD_LABELS.map((f) => f.label))
            }
          >
            下载模板
          </button>
          <button
            type="button"
            className="btn btn-sm"
            disabled={excelBusy}
            aria-label="导入 Excel 表格（.xlsx，按18项列名批量建卡）"
            onClick={() => excelInputRef.current?.click()}
          >
            {excelBusy ? "导入中…" : "导入 Excel"}
          </button>
          <input
            ref={excelInputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            aria-label="选择要导入的 Excel 表格文件"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void handleExcelFile(file);
            }}
          />
          <button
            type="button"
            className="btn btn-sm"
            disabled={feedQuery.isFetching}
            aria-label="刷新视频列表（重新从服务端拉取最新数据）"
            onClick={() => {
              void feedQuery.refetch();
            }}
          >
            {feedQuery.isFetching ? "刷新中…" : "刷新"}
          </button>
          <button
            type="button"
            className="btn btn-sm"
            disabled={totalVideos === 0}
            aria-label="批量存云端（打开勾选窗，列出当前视图的视频勾选后批量存入云端）"
            onClick={openCloudBatch}
          >
            存云端
          </button>
          <button
            type="button"
            className="btn btn-sm"
            disabled={totalVideos === 0 || cleanupPreviewBusy}
            aria-label="立即清理（先列出将删清单，确认后删发布超3天且点赞播放都不达标的卡片）"
            onClick={() => {
              void openCleanupPreview();
            }}
          >
            {cleanupPreviewBusy ? "正在算清单…" : "立即清理"}
          </button>
          <button
            type="button"
            className="btn btn-sm"
            disabled={totalVideos === 0}
            aria-label="一键清除全部视频卡片（达人与分组设置保留）"
            onClick={() => {
              setDeleteError(null);
              setPendingClear(true);
            }}
          >
            一键清除
          </button>
        </span>
      </div>
      <CloudStorageBar />
      <CloudQueueStatus onToast={setIntakeToast} />
      {/* v5.55 3 天留存清理记录：上次 / 下次清理时间 + 删除日志 +
          最近一轮「无数据未判定」。规则：发布超 3 天（没发布时
          间按入库时间）且点赞 <1000、播放 <50000 才删，任一达
          标就留；点赞播放都是 0（没采到数据）的不删、列在未判
          定里等用户定。自动清理在打开本页时由服务端判断（距上
          次满 24 小时才跑），手动点右上角「立即清理」先出清单、
          确认后再删。删除不可恢复，日志只作备查。 */}
      <div
        className="mt-2 rounded-[10px] border px-3 py-2"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        aria-label="3天留存清理记录"
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-[13px] font-semibold">3 天留存清理</span>
          <span className="text-[12px] leading-5 text-[var(--dim)]">
            上次清理：
            {cleanupStatus
              ? formatCleanupTimeMs(cleanupStatus.lastRunAtMs)
              : "读取中…"}
            {" · "}下次约：
            {cleanupStatus
              ? formatCleanupTimeMs(cleanupStatus.nextRunAtMs)
              : "—"}
            {" · "}已删记录 {cleanupStatus?.logs.length ?? 0} 条
            {cleanupStatus && cleanupStatus.lastUnjudged.length > 0
              ? ` · 无数据未判定 ${cleanupStatus.lastUnjudged.length} 条`
              : ""}
          </span>
          <button
            type="button"
            className="btn btn-sm ml-auto"
            aria-expanded={cleanupLogOpen}
            aria-label={cleanupLogOpen ? "收起清理记录" : "展开清理记录（删除日志与无数据未判定清单）"}
            onClick={() => setCleanupLogOpen((v) => !v)}
          >
            {cleanupLogOpen ? "收起记录" : "查看记录"}
          </button>
        </div>
        <p className="mt-0.5 text-[12px] leading-5 text-[var(--dim)]">
          规则：发布超过 3 天、点赞不到 1000 且播放不到 5 万的卡片会被删掉（云端文件一起删）；点赞或播放任一达标就留；点赞和播放都没采到数据的先不删、列在「无数据未判定」里。每天自动检查一次（打开本页时），也可以点右上角「立即清理」先看清单再删。删除不可恢复，下面这份日志只作备查。
        </p>
        {cleanupError && (
          <p className="mt-1 text-[13px] leading-5" style={{ color: "var(--bad)" }} role="alert">
            {cleanupError}
          </p>
        )}
        {cleanupLogOpen && cleanupStatus && (
          <div className="mt-2 grid gap-3 lg:grid-cols-2">
            <div>
              <p className="text-[13px] font-semibold">删除记录（最近 {cleanupStatus.logs.length} 条）</p>
              {cleanupStatus.logs.length === 0 ? (
                <p className="mt-1 text-[12px] leading-5 text-[var(--dim)]">还没有删过任何卡片。</p>
              ) : (
                <ul className="mt-1 max-h-64 space-y-1 overflow-y-auto pr-1">
                  {cleanupStatus.logs.map((l) => (
                    <li key={l.id} className="text-[12px] leading-5">
                      <span className="font-medium">{l.title}</span>
                      <span className="text-[var(--dim)]">
                        {" "}· {l.creatorName || "—"} · 视频ID {l.videoId || "—"} · 点赞 {l.likeCount} · 播放 {l.playCount} · 发布 {formatCleanupTimeMs(l.publishedAtMs)} · 删除于 {formatCleanupTimeMs(l.deletedAtMs)}（{l.trigger === "auto" ? "自动清理" : "手动清理"}）
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="text-[13px] font-semibold">无数据未判定（最近一轮，点赞播放都没采到，先不删）</p>
              {cleanupStatus.lastUnjudged.length === 0 ? (
                <p className="mt-1 text-[12px] leading-5 text-[var(--dim)]">最近一轮没有这类卡片。</p>
              ) : (
                <ul className="mt-1 max-h-64 space-y-1 overflow-y-auto pr-1">
                  {cleanupStatus.lastUnjudged.map((u) => (
                    <li key={u.id} className="text-[12px] leading-5">
                      <span className="font-medium">{u.title}</span>
                      <span className="text-[var(--dim)]">
                        {" "}· {u.creatorName || "—"} · 视频ID {u.videoId || "—"} · 已发布约 {u.ageDays} 天 · 发布 {formatCleanupTimeMs(u.publishedAtMs)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
      <DissectQueueBar
        onToast={setIntakeToast}
        onCopyFallback={setDissectCopyFallback}
        findVideo={(videoId) => {
          for (const a of accounts) {
            const v = a.videos.find((x) => x.videoId === videoId);
            if (v) return { video: v, creatorName: a.name };
          }
          return null;
        }}
        onOpenProject={onOpenProject}
        onOpenAnalysisRecord={onOpenAnalysisRecord}
      />
      <div className="mt-1">
        <button
          type="button"
          className="text-[13px] leading-5 font-medium text-[var(--dim)]"
          aria-expanded={guideOpen}
          aria-label={guideOpen ? "使用说明：收起" : "使用说明：展开"}
          onClick={() => setGuideOpen((v) => !v)}
        >
          使用说明 {guideOpen ? "▾" : "▸"}
        </button>
        {guideOpen && (
          <p className="mt-1 text-[13px] leading-5 text-[var(--dim)]">
            把整段信息粘到下面的框里就会自动解析建卡：一共 18 项（视频ID / 链接 / 时长 / 描述 / 点赞 / 播放 / 发布时间 / 达人ID / 达人链接 / 达人昵称 / 封面链接 / 视频文件链接 / 快手号 / 粉丝数 / 获赞 / 达人简介 / 评论量 / 采集时间），缺哪项留空就行，描述和简介可以占多行。下面可切换五种视图：「最新采集」按采集时间倒序、最新入库的排最前、「最新对比」每个达人只取最新一条横向排开、「按日期分组」按发布日期分组横向排列、「按达人分组」按达人分组发布时间倒序、「按作者分组」按你自定义的分组归类达人（在达人行上选分组或新建，没选的归「未分组」，分组存在服务端、换浏览器不丢）；没采到作品的达人在「最新对比」「按达人分组」「按作者分组」里先不显示，采到后自动出现；视图选择会记住。右上角「一键清除」删全部视频卡片，达人与分组设置保留。另有「3 天留存清理」：发布超过 3 天（没发布时间按入库时间算）、点赞不到 1000 且播放不到 5 万的卡片会被自动清掉（点赞或播放任一达标就留；点赞播放都没采到数据的先不删、列在清理记录的「无数据未判定」里），删卡时云端文件一起删；打开本页时服务端每天自动检查一次，也可以点右上角「立即清理」先看清单、确认后再删；删了哪些在页面上方「3 天留存清理」的记录里能查（删除不可恢复，日志只作备查）。「播放视频」在本页悬浮窗里播，点「详情」看封面、核心数据、视频与达人信息，长链接收在「更多链接」里，「复制」复制的仍是 18 项粘贴格式原文。社媒助手扩展采集后点「数据上报」，也会自动经本页建卡（重复的会跳过，完成后有提示）。也可以用 Excel 批量导入：点右上角「导入 Excel」选 .xlsx 文件，第一行按 18 项列名对齐即可（列顺序不限、缺哪列留空、按视频ID去重，重复的不重复建卡）；没有现成表格就先点「下载模板」拿只有表头的空表照着填。卡片版式点视图行右侧「版式」切换：三款设计（极简信息流 / 大图视觉 / 紧凑数据）加四档等比缩小（1x / 0.8x / 0.6x / 0.5x），点选即生效并记住；极简信息流与大图视觉两款的封面按 3:4 竖版裁切显示，紧凑数据款顶部是 16:9 窄封面条。每张卡片下方还有「🔄 刷新链接」：视频直链过期播不了时点它，会在新标签页打开这条视频的快手页，扩展在那个标签页抓到新链接后送回来、只换链接不建新卡；点了 10 秒还没回来就是刷新超时，检查扩展是否开启（标签页要在同一个浏览器里打开）。
          </p>
        )}
      </div>
      <p className="mt-1 text-[13px] leading-5" role="status" aria-label="扩展上报钩子状态">
        扩展上报钩子：
        {intakeReady ? (
          <span style={{ color: "var(--ok)" }}>已注册（window.__monitorIntake），扩展点「数据上报」即可送达本页</span>
        ) : (
          <span style={{ color: "var(--bad)" }}>未注册——刷新页面后再看这一行；仍未注册请把这一行截图发回排查</span>
        )}
      </p>

      {/* 中转状态（v4.41 服务端代理）：钩子状态行正下方只保留状
          态行 + 测试连接——中转地址与密钥已移到服务端内置配置，
          前端不再有地址/密钥输入行。跨浏览器时扩展在另一个浏览
          器上报到中转，本页每 10 秒经服务端代理拉一次；与上面
          的本地桥接共存，互不影响。 */}
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
        {relayStatus.kind === "paused" ? (
          <p className="text-[13px] leading-5" role="status" aria-label="中转状态">
            中转：
            <button
              type="button"
              className="cursor-pointer underline underline-offset-2"
              style={{ color: "var(--bad)" }}
              onClick={resumeRelayPolling}
              aria-label="中转已暂停，点击恢复轮询"
            >
              连接失败（{relayStatus.reason}）——连续失败 6 次已暂停轮询，点此恢复
            </button>
          </p>
        ) : (
          <p className="text-[13px] leading-5" role="status" aria-label="中转状态">
            中转（服务端代理）：
            {relayStatus.kind === "connecting" && (
              <span className="text-[var(--dim)]">连接中…</span>
            )}
            {relayStatus.kind === "connected" && (
              <span style={{ color: "var(--ok)" }}>已连接</span>
            )}
            {relayStatus.kind === "failed" && (
              <span style={{ color: "var(--bad)" }}>
                连接失败（{relayStatus.reason}）
              </span>
            )}
          </p>
        )}
        <button
          type="button"
          className="btn btn-sm shrink-0"
          onClick={() => void testRelayConnection()}
          disabled={relayTesting}
          aria-label="测试中转连接"
        >
          {relayTesting ? "测试中…" : "测试连接"}
        </button>
      </div>
      {relayTestLines.length > 0 && (
        <div
          className="mt-1 text-[13px] leading-5 text-[var(--dim)]"
          role="status"
          aria-label="中转连接测试结果"
        >
          {relayTestLines.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
      )}

      {/* 填写区（精简版）：通栏单行输入框，粘贴整段「字段名：值」
          即自动解析建卡。textarea 只为能完整接住多行粘贴文本：
          视觉高度固定一行（42px）、resize:none 不可拉伸；底色用
          深蓝灰 tint（#1f2c44 / 边框 #3a4f7a），与整体深色面板
          一眼可分。 */}
      <div className="mt-3" aria-label="填写视频信息">
        <textarea
          className="field w-full monitor-paste-field"
          rows={1}
          style={{
            height: 42,
            resize: "none",
            overflowY: "auto",
            background: "#1f2c44",
            borderColor: "#3a4f7a",
          }}
          value={pasteInput}
          disabled={pasteBusy}
          onChange={(e) => setPasteInput(e.target.value)}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text");
            if (!text) return;
            e.preventDefault();
            setPasteInput(text);
            void handlePastedText(text);
          }}
          placeholder="粘贴整段信息自动建卡（18 项），如：视频ID：3xnukh46rac9yww｜视频链接：https://www.kuaishou.com/short-video/…｜视频时长：2分13秒｜视频描述：…｜点赞量：671｜播放量：23,000｜发布时间：2026-11-03 17:59｜达人ID：…｜达人链接：https://www.kuaishou.com/profile/…｜达人昵称：…｜视频封面链接：https://…｜视频文件链接：https://…｜快手号：…｜粉丝数：…｜获赞：…｜达人简介：…｜评论量：…｜采集时间：…"
          aria-label="粘贴视频信息（粘贴后自动建卡）"
        />
        {pasteBusy && (
          <p className="mt-1 text-[13px] text-[var(--dim)]" role="status">
            正在解析并建卡…
          </p>
        )}
      </div>

      {/* 视图切换：最新采集 / 最新对比 / 按日期分组 / 按达人分组 / 按作者分组（选择存 localStorage） */}
      <div className="mt-5 flex flex-wrap items-center gap-2" role="tablist" aria-label="监控视图切换">
        <span className="text-sm font-bold">视图</span>
        {(
          [
            { key: "collected", label: "最新采集" },
            { key: "latest", label: "最新对比" },
            { key: "date", label: "按日期分组" },
            { key: "creator", label: "按达人分组" },
            { key: "group", label: "按作者分组" },
            { key: "cloud", label: "云端已存" },
          ] as { key: MonitorViewMode; label: string }[]
        ).map((opt) => (
          <button
            key={opt.key}
            type="button"
            role="tab"
            aria-selected={viewMode === opt.key}
            aria-label={`切换到${opt.label}视图`}
            className={viewMode === opt.key ? "btn btn-primary btn-sm" : "btn btn-sm"}
            onClick={() => setViewMode(opt.key)}
          >
            {opt.label}
            {opt.key === "cloud" && cloudSavedQuery.data ? (
              <span className="text-xs opacity-80">（{cloudCardCount}）</span>
            ) : null}
          </button>
        ))}
        <span className="ml-auto">
          <button
            type="button"
            className="btn btn-sm"
            aria-label="打开版式调节：切换三款卡片设计与等比缩小档位"
            aria-expanded={layoutOpen}
            onClick={openLayoutPanel}
          >
            版式
          </button>
        </span>
        <span className="text-xs text-[var(--dim)]">
          {viewMode === "collected" && "按采集时间倒序，最新入库的排最前面"}
          {viewMode === "latest" && "每个达人只取最新一条，横向一排对比"}
          {viewMode === "date" && "按发布日期分组，同一天的横向排列"}
          {viewMode === "creator" && "按达人分组，组内按发布时间倒序"}
          {viewMode === "group" && "按自定义分组归类达人，没归类的在「未分组」"}
          {viewMode === "cloud" && "只看已存云端的视频，按存入时间倒序，播放直接走云端"}
        </span>
      </div>

      {/* 版式面板（v4.51 推倒重做）：旧多维滑杆全部下线，只剩
          两组点选——三款卡片设计 + 等比缩小四档（1x / 0.8x /
          0.6x / 0.5x）。点选即生效（五种视图所有卡片同步切换，
          卡内字号、按钮文字与图标随档位等比缩放，封面恒 3:4），
          并立刻存 localStorage（monitor-card-display-v1），下
          次打开保持；右侧示例卡实时预览当前组合。 */}
      {layoutOpen && (() => {
        const sampleVideo: FeedVideo = {
          id: -1,
          accountId: 0,
          videoId: SAMPLE_VIDEO_ID,
          videoUrl: "",
          description: "当你是亿万富翁！ #AI灵境计划 #搞笑 #抽象 #真实",
          coverUrl: "",
          videoFileUrl: "sample",
          durationText: "2分13秒",
          likeCount: 671,
          playCount: 23000,
          publishedAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
          kuaishouId: "",
          fansCount: 0,
          totalLikeCount: 0,
          creatorBio: "",
          commentCount: 0,
          collectedAt: null,
          createdAt: new Date().toISOString(),
        };
        const activeStyleDef = MONITOR_CARD_STYLES.find((x) => x.key === cardStyle);
        const previewWidth = Math.round(COMPACT_CARD_BASE_W[cardStyle] * cardScale);
        return (
        <div className="card mt-3 p-3" aria-label="版式调节面板">
          <div className="flex flex-wrap items-start gap-5">
            <div className="min-w-[260px] flex-1">
              <p className="text-sm font-bold">版式：卡片设计 + 等比缩小</p>
              <p className="mt-1 text-xs leading-5 text-[var(--dim)]">
                点选即生效并自动保存，五种视图的所有卡片同步切换。等比缩小时卡片宽高、字号、按钮上的文字和图标都按同一档位一起缩放，封面宽高比始终锁定 3:4 不变形。
              </p>
              <p className="mt-3 text-[13px] font-bold">卡片设计</p>
              <div className="mt-1.5 flex flex-col gap-1.5" role="group" aria-label="卡片设计切换">
                {MONITOR_CARD_STYLES.map((opt, idx) => (
                  <button
                    key={opt.key}
                    type="button"
                    className={cardStyle === opt.key ? "btn btn-primary justify-start text-left" : "btn justify-start text-left"}
                    aria-pressed={cardStyle === opt.key}
                    aria-label={`切换到设计${["一", "二", "三"][idx]}：${opt.label}卡片设计`}
                    onClick={() => updateCardDisplay({ style: opt.key, scale: cardScale })}
                  >
                    <span className="font-bold">设计{["一", "二", "三"][idx]}「{opt.label}」</span>
                    <span className="ml-2 text-xs opacity-80">{opt.desc}</span>
                  </button>
                ))}
              </div>
              <p className="mt-3 text-[13px] font-bold">等比缩小</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-label="等比缩小档位切换">
                {MONITOR_CARD_SCALES.map((sc) => (
                  <button
                    key={sc}
                    type="button"
                    className={cardScale === sc ? "btn btn-primary btn-sm" : "btn btn-sm"}
                    aria-pressed={cardScale === sc}
                    aria-label={`等比缩小到 ${sc}x（卡片与按钮文字图标同步缩放）`}
                    onClick={() => updateCardDisplay({ style: cardStyle, scale: sc })}
                  >
                    {sc}x
                  </button>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-sm"
                  aria-label="恢复默认版式（极简信息流设计、1x 等比）"
                  onClick={() => updateCardDisplay({ style: "minimal", scale: 1 })}
                >
                  恢复默认
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  aria-label="收起版式调节面板"
                  onClick={() => setLayoutOpen(false)}
                >
                  收起
                </button>
              </div>
            </div>
            <div aria-label="示例卡片预览（随版式点选实时变化）">
              <p className="mb-1.5 text-xs text-[var(--dim)]">示例卡片预览（实时）</p>
              <div aria-hidden="true">
                <CompactVideoCard
                  video={sampleVideo}
                  creatorName="幻熊"
                  cardStyle={cardStyle}
                  cardScale={cardScale}
                  onPlay={() => {}}
                  onDetail={() => {}}
                />
              </div>
              <p className="mt-1.5 max-w-[240px] text-[11px] leading-4 text-[var(--dim)]">
                当前：{activeStyleDef?.label ?? "极简信息流"} · {cardScale}x · 卡片宽 {previewWidth}px · 封面 3:4
              </p>
            </div>
          </div>
        </div>
        );
      })()}

      {/* 卡片区：五种视图共用同一份数据与详情/播放逻辑 */}
      <div className="mt-3">
        {feedQuery.isPending ? (
          <p className="text-sm text-[var(--dim)]">正在读取视频卡片…</p>
        ) : feedQuery.isError ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm" style={{ color: "var(--bad)" }} role="alert">
              卡片没读出来：{describeThrownError(feedQuery.error)}
            </p>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => feedQuery.refetch()}
              disabled={feedQuery.isFetching}
            >
              {feedQuery.isFetching ? "读取中…" : "重新读取"}
            </button>
          </div>
        ) : accounts.length === 0 && viewMode !== "cloud" ? (
          <p className="text-sm leading-5 text-[var(--dim)]">
            还没有卡片。把第一条视频的整段信息粘到上面的输入框里，就会自动生成第一张卡片。
          </p>
        ) : viewMode === "cloud" ? (
          <section aria-label="云端已存">
            {(() => {
              // 只显示云端清单（state.json downloaded）里有的
              // 卡片，以清单为准；按存入时间 at 倒序，最近存的
              // 排最前面。清单里有、卡片已删的条目不显示（删卡
              // 本来就会同步删云端文件与清单条目）。
              if (cloudSavedQuery.isPending) {
                return <p className="text-sm text-[var(--dim)]">正在读取云端清单…</p>;
              }
              const items: { account: FeedAccount; video: FeedVideo; atMs: number }[] = [];
              for (const a of accounts) {
                for (const v of a.videos) {
                  const at = cloudSavedAt.get(v.videoId);
                  if (at !== undefined) {
                    items.push({ account: a, video: v, atMs: parseCloudSavedAt(at) });
                  }
                }
              }
              items.sort((x, y) => y.atMs - x.atMs);
              // v4.68：云端文件总数（存储条的 N）大于本视图卡片数
              // （交集 M）时，顶部加一行小字把差额说清——那些视
              // 频的卡片已被删除，云端文件仍保留。
              const mismatchNote =
                cloudTotalCount !== undefined && cloudTotalCount > items.length ? (
                  <p className="mb-2 text-xs leading-5 text-[var(--dim)]" role="note">
                    云端共 {cloudTotalCount} 条，其中 {items.length} 条在监控页有卡片（其余卡片已被删除，文件仍保留）
                  </p>
                ) : null;
              if (items.length === 0) {
                return (
                  <>
                    {mismatchNote}
                    <p className="text-sm leading-5 text-[var(--dim)]">
                      还没有存云端的视频——去其他视图点右上角「存云端」，在勾选窗里勾好后批量存入
                    </p>
                  </>
                );
              }
              return (
                <>
                  {mismatchNote}
                  <div className="flex flex-wrap" style={{ gap: cardGap }} aria-label="已存云端的视频（按存入时间倒序）">
                  {items.map(({ account: a, video: v }) => (
                    <CompactVideoCard
                      cardStyle={cardStyle} cardScale={cardScale}
                      key={v.id}
                      video={v}
                      creatorName={a.name}
                      cloudBadge
                      onPlay={(vid) =>
                        setPlaying({ video: vid, creatorName: a.name, cloudOnly: true })
                      }
                      onDetail={(vid) =>
                        setDetail({ video: vid, creatorName: a.name, creatorId: a.creatorId, creatorUrl: a.url })
                      }
                      onAnalyze={(vid) => void handleAnalyze(vid, a.name)}
                      onOpenDissected={handleOpenDissected}
                      dissected={dissectedByVideoId.get(v.videoId) ?? null}
                      onRefresh={handleRefreshVideo}
                      refreshing={pendingRefresh.has(v.id)}
                      refreshFailed={refreshFailedIds.has(v.id)}
                    />
                  ))}
                  </div>
                </>
              );
            })()}
          </section>
        ) : viewMode === "collected" ? (
          <section aria-label="最新采集">
            {(() => {
              // 全部视频拉平，按采集时间倒序：采集时间没填的老行
              // 回退用入库时间（createdAt），最新入库的排最前面。
              // 与发布时间无关，跟「最新对比」区分开。
              const flat: { account: FeedAccount; video: FeedVideo }[] = [];
              for (const a of accounts) for (const v of a.videos) flat.push({ account: a, video: v });
              const collectedTime = (v: FeedVideo) => {
                const c = v.collectedAt ? new Date(v.collectedAt).getTime() : NaN;
                if (!Number.isNaN(c)) return c;
                const t = new Date(v.createdAt).getTime();
                return Number.isNaN(t) ? 0 : t;
              };
              flat.sort((x, y) => collectedTime(y.video) - collectedTime(x.video));
              if (flat.length === 0) {
                return <p className="text-sm text-[var(--dim)]">还没有视频卡片。</p>;
              }
              return (
                <div className="flex flex-wrap" style={{ gap: cardGap }} aria-label="按采集时间倒序的全部视频">
                  {flat.map(({ account: a, video: v }) => (
                    <CompactVideoCard
                    cardStyle={cardStyle} cardScale={cardScale}
                      key={v.id}
                      video={v}
                      creatorName={a.name}
                      showCollected
                      onPlay={(vid) => setPlaying({ video: vid, creatorName: a.name })}
                      onDetail={(vid) =>
                        setDetail({ video: vid, creatorName: a.name, creatorId: a.creatorId, creatorUrl: a.url })
                      }
                      onAnalyze={(vid) => void handleAnalyze(vid, a.name)}
                      onOpenDissected={handleOpenDissected}
                      dissected={dissectedByVideoId.get(v.videoId) ?? null}
                      onRefresh={handleRefreshVideo}
                      refreshing={pendingRefresh.has(v.id)}
                      refreshFailed={refreshFailedIds.has(v.id)}
                    />
                  ))}
                </div>
              );
            })()}
          </section>
        ) : viewMode === "latest" ? (
          <section aria-label="最新对比">
            {(() => {
              const latestItems = accounts
                .map((a) => {
                  const sorted = [...a.videos].sort((x, y) => {
                    const tx = x.publishedAt ? new Date(x.publishedAt).getTime() : 0;
                    const ty = y.publishedAt ? new Date(y.publishedAt).getTime() : 0;
                    return ty - tx;
                  });
                  return sorted[0] ? { account: a, video: sorted[0] } : null;
                })
                .filter((x): x is NonNullable<typeof x> => x !== null)
                .sort((a, b) => {
                  const ta = a.video.publishedAt ? new Date(a.video.publishedAt).getTime() : 0;
                  const tb = b.video.publishedAt ? new Date(b.video.publishedAt).getTime() : 0;
                  return tb - ta;
                });
              if (latestItems.length === 0) {
                return <p className="text-sm text-[var(--dim)]">还没有视频卡片。</p>;
              }
              return (
                <div className="flex overflow-x-auto pb-1.5 snap-x" style={{ gap: cardGap }} aria-label="各达人最新视频横向对比">
                  {latestItems.map(({ account: a, video: v }) => (
                    <CompactVideoCard
                    cardStyle={cardStyle} cardScale={cardScale}
                      key={v.id}
                      video={v}
                      creatorName={a.name}
                      onPlay={(vid) => setPlaying({ video: vid, creatorName: a.name })}
                      onDetail={(vid) =>
                        setDetail({ video: vid, creatorName: a.name, creatorId: a.creatorId, creatorUrl: a.url })
                      }
                      onAnalyze={(vid) => void handleAnalyze(vid, a.name)}
                      onOpenDissected={handleOpenDissected}
                      dissected={dissectedByVideoId.get(v.videoId) ?? null}
                      onRefresh={handleRefreshVideo}
                      refreshing={pendingRefresh.has(v.id)}
                      refreshFailed={refreshFailedIds.has(v.id)}
                    />
                  ))}
                </div>
              );
            })()}
          </section>
        ) : viewMode === "date" ? (
          <section aria-label="按日期分组">
            {(() => {
              const flat: { account: FeedAccount; video: FeedVideo }[] = [];
              for (const a of accounts) for (const v of a.videos) flat.push({ account: a, video: v });
              const groups = new Map<string, { account: FeedAccount; video: FeedVideo }[]>();
              for (const item of flat) {
                const key = dateKeyShanghai(item.video.publishedAt);
                const arr = groups.get(key) ?? [];
                arr.push(item);
                groups.set(key, arr);
              }
              const sortedKeys = [...groups.keys()].sort((a, b) => {
                if (a === "时间未填") return 1;
                if (b === "时间未填") return -1;
                return b.localeCompare(a);
              });
              if (flat.length === 0) return <p className="text-sm text-[var(--dim)]">还没有视频卡片。</p>;
              return sortedKeys.map((dateKey) => {
                // 组内排序：点赞量从高到低，点赞最高的排第一位；
                // 天分组本身的顺序不变（日期倒序，在 sortedKeys 处）。
                const items = (groups.get(dateKey) ?? []).sort((x, y) => {
                  return (y.video.likeCount ?? 0) - (x.video.likeCount ?? 0);
                });
                return (
                  <div key={dateKey} className="mb-4">
                    <div className="flex items-baseline gap-2">
                      <h3 className="font-display text-base font-bold">{dateKey}</h3>
                      <span className="text-xs text-[var(--dim)]">{items.length} 条</span>
                    </div>
                    <div className="mt-1.5 flex overflow-x-auto pb-1.5 snap-x" style={{ gap: cardGap }} aria-label={`${dateKey} 的视频`}>
                      {items.map(({ account: a, video: v }) => (
                        <CompactVideoCard
                    cardStyle={cardStyle} cardScale={cardScale}
                          key={v.id}
                          video={v}
                          creatorName={a.name}
                          onPlay={(vid) => setPlaying({ video: vid, creatorName: a.name })}
                          onDetail={(vid) =>
                            setDetail({ video: vid, creatorName: a.name, creatorId: a.creatorId, creatorUrl: a.url })
                          }
                          onAnalyze={(vid) => void handleAnalyze(vid, a.name)}
                          onOpenDissected={handleOpenDissected}
                          dissected={dissectedByVideoId.get(v.videoId) ?? null}
                          onRefresh={handleRefreshVideo}
                          refreshing={pendingRefresh.has(v.id)}
                          refreshFailed={refreshFailedIds.has(v.id)}
                        />
                      ))}
                    </div>
                  </div>
                );
              });
            })()}
          </section>
        ) : viewMode === "group" ? (
          <section aria-label="按作者分组">
            <NewMonitorGroupRow invalidate={invalidate} />
            {(() => {
              const knownIds = new Set(groups.map((g) => g.id));
              // 展示规则（v4.43）：没采到作品（0 条视频）的达人
              // 不显示（分组设置保留，采到后自动出现）；命名组
              // 本身保留展示以便改名/删除，「未分组」段没人时
              // 整段隐藏。
              const sections: { group: MonitorGroup | null; members: FeedAccount[] }[] = [
                ...groups.map((g) => ({
                  group: g as MonitorGroup | null,
                  members: accounts.filter((a) => a.groupId === g.id && a.videos.length > 0),
                })),
                {
                  group: null,
                  members: accounts.filter(
                    (a) => (a.groupId == null || !knownIds.has(a.groupId)) && a.videos.length > 0,
                  ),
                },
              ].filter(
                (s): s is { group: MonitorGroup | null; members: FeedAccount[] } =>
                  s.group !== null || s.members.length > 0,
              );
              return sections.map(({ group: g, members }) => (
                <AuthorGroupSection
                  cardStyle={cardStyle} cardScale={cardScale}
                  key={g ? `g${g.id}` : "ungrouped"}
                  group={g}
                  members={members}
                  allGroups={groups}
                  invalidate={invalidate}
                  onPlay={(acc, vid) => setPlaying({ video: vid, creatorName: acc.name })}
                  onDetail={(acc, vid) =>
                    setDetail({ video: vid, creatorName: acc.name, creatorId: acc.creatorId, creatorUrl: acc.url })
                  }
                  onAnalyze={(acc, vid) => void handleAnalyze(vid, acc.name)}
                  onOpenDissected={handleOpenDissected}
                  dissectedByVideoId={dissectedByVideoId}
                  onRefresh={handleRefreshVideo}
                  refreshingIds={new Set(pendingRefresh.keys())}
                  refreshFailedIds={refreshFailedIds}
                />
              ));
            })()}
          </section>
        ) : (
          (() => {
            // 展示规则（v4.43）：没采到作品（0 条视频）的达人不
            // 显示——分组等设置都保留，采到作品后自动出现。
            const visibleAccounts = accounts.filter((a) => a.videos.length > 0);
            if (visibleAccounts.length === 0) {
              return (
                <p className="text-sm leading-5 text-[var(--dim)]">
                  暂时没有带视频卡片的达人——没采到作品的达人先不显示，采到作品后会自动出现在这里。
                </p>
              );
            }
            return visibleAccounts.map((a) => (
            <div key={a.id} className="mb-4">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-bold text-white"
                  style={{ background: "var(--accent)" }}
                  aria-hidden="true"
                >
                  {(a.name || "达").slice(0, 1)}
                </span>
                {a.url ? (
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-display text-base font-bold underline-offset-2 hover:underline"
                    aria-label={`打开达人主页：${a.name || a.url}`}
                  >
                    {a.name || "未命名达人"}
                  </a>
                ) : (
                  <span className="font-display text-base font-bold">{a.name || "未命名达人"}</span>
                )}
                <span
                  className="rounded-full px-2 py-0.5 text-xs font-bold"
                  style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
                >
                  {a.platform}
                </span>
                {a.creatorId && <span className="text-xs text-[var(--dim)]">达人ID {a.creatorId}</span>}
                <span className="text-xs text-[var(--dim)]">{a.videos.length} 条视频</span>
                <span className="ml-auto flex flex-wrap items-center gap-2">
                  <CreatorGroupControl account={a} groups={groups} invalidate={invalidate} />
                  <button
                  type="button"
                  className="btn btn-danger-ghost btn-sm"
                  aria-label={`删除达人：${a.name || a.url}（连同其全部视频卡片）`}
                  onClick={() => {
                    setDeleteError(null);
                    setPendingAccount(a);
                  }}
                >
                  删除达人
                </button>
                </span>
              </div>
              {a.videos.length === 0 ? (
                <p className="mt-1.5 text-[13px] text-[var(--dim)]">
                  这位达人还没有视频卡片——把 TA 的一条视频整段信息粘到上面的输入框里，就会出现在这里。
                </p>
              ) : (
                <div className="mt-2 flex flex-wrap" style={{ gap: cardGap }}>
                  {a.videos.map((v) => (
                    <VideoCard
                      cardStyle={cardStyle} cardScale={cardScale}
                      key={v.id}
                      video={v}
                      creatorName={a.name}
                      onPlay={(vid) => setPlaying({ video: vid, creatorName: a.name })}
                      onDetail={(vid) =>
                        setDetail({
                          video: vid,
                          creatorName: a.name,
                          creatorId: a.creatorId,
                          creatorUrl: a.url,
                        })
                      }
                      onAnalyze={(vid) => void handleAnalyze(vid, a.name)}
                      onOpenDissected={handleOpenDissected}
                      dissected={dissectedByVideoId.get(v.videoId) ?? null}
                      onRefresh={handleRefreshVideo}
                      refreshing={pendingRefresh.has(v.id)}
                      refreshFailed={refreshFailedIds.has(v.id)}
                      onDelete={(vid) => {
                        setDeleteError(null);
                        setPendingVideo(vid);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
            ));
          })()
        )}
      </div>

      {intakeToast && (
        <div
          className="fixed bottom-5 left-1/2 z-[90] flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-3 rounded-[var(--radius)] border border-[var(--border)] px-4 py-3 shadow-lg"
          style={{ background: "var(--surface)", color: "var(--text)" }}
          role="status"
          aria-live="polite"
          aria-label="操作结果提示"
        >
          <p className="min-w-0 flex-1 text-sm leading-5 font-bold">{intakeToast}</p>
          <button
            type="button"
            className="btn btn-sm shrink-0"
            onClick={() => setIntakeToast(null)}
            aria-label="关闭提示"
          >
            关闭 ✕
          </button>
        </div>
      )}

      {cloudBatchOpen && (
        <CloudBatchSaveModal
          items={currentViewVideos}
          savedIds={cloudSavedIds}
          selected={cloudBatchSelected}
          allChecked={cloudBatchAllChecked}
          selectableCount={cloudBatchSelectableCount}
          onToggleItem={toggleCloudBatchItem}
          onToggleAll={toggleCloudBatchAll}
          onConfirm={() => void confirmCloudBatch()}
          onClose={() => setCloudBatchOpen(false)}
        />
      )}

      {/* v4.88：没存云端就点「发送到聊天解剖」时的提示窗——不复
          制残缺指令、不入队，只讲清先存云端再点，并直接给出去
          存云端的入口（打开既有批量勾选窗）。 */}
      {dissectNoCloudTitle !== null && (
        <div
          className="fixed inset-0 z-[85] flex items-center justify-center bg-black/70 p-3"
          role="dialog"
          aria-modal="true"
          aria-label="先存云端再发送到聊天解剖"
          onClick={() => setDissectNoCloudTitle(null)}
        >
          <div
            className="card w-full max-w-md p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-display text-base font-bold">
              先点存云端，再点分析
            </p>
            <p className="mt-2 text-sm leading-6 text-[var(--dim)]">
              「{dissectNoCloudTitle}」还没存云端。聊天里的助手要直接读云端里的视频文件才能精修解剖，没存云端的视频发过去也解剖不了。先把这条存云端，再回来点「发送到聊天解剖」。
            </p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setDissectNoCloudTitle(null)}
                aria-label="知道了，关闭提示"
              >
                知道了
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => {
                  setDissectNoCloudTitle(null);
                  openCloudBatch();
                }}
                aria-label="去存云端（打开批量存云端勾选窗）"
              >
                去存云端
              </button>
            </div>
          </div>
        </div>
      )}

      {/* v4.88：自动复制失败时的指令全文窗——把整段解剖指令摆
          出来让用户手动全选复制，绝不静默失败。 */}
      {dissectCopyFallback !== null && (
        <div
          className="fixed inset-0 z-[85] flex items-center justify-center bg-black/70 p-3"
          role="dialog"
          aria-modal="true"
          aria-label="解剖指令全文（自动复制没成功，请手动复制）"
          onClick={() => setDissectCopyFallback(null)}
        >
          <div
            className="card flex max-h-[88vh] w-full max-w-lg flex-col p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-display text-base font-bold">
              自动复制没成功，手动复制这段指令
            </p>
            <p className="mt-2 text-sm leading-6 text-[var(--dim)]">
              把下面这段全选复制，再去聊天框粘贴发送，助手就会开始精修解剖。
            </p>
            <textarea
              className="field mt-3 min-h-0 flex-1 text-[13px] leading-5"
              style={{ minHeight: 220 }}
              readOnly
              value={dissectCopyFallback}
              aria-label="解剖指令全文"
              onFocus={(e) => e.target.select()}
            />
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  void copyTextToClipboard(dissectCopyFallback).then(
                    (ok) => {
                      if (ok) {
                        setDissectCopyFallback(null);
                        setIntakeToast("已复制解剖指令，去聊天框粘贴发送");
                      } else {
                        setIntakeToast("还是没复制成，请长按文本全选后手动复制。");
                      }
                    },
                  );
                }}
                aria-label="再试一次复制解剖指令"
              >
                再试一次复制
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setDissectCopyFallback(null)}
                aria-label="关闭解剖指令全文窗"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {playing && (
        <VideoPlayerModal
          video={playing.video}
          creatorName={playing.creatorName}
          cloudOnly={playing.cloudOnly ?? false}
          onClose={() => setPlaying(null)}
        />
      )}

      {detail && (
        <VideoDetailModal
          video={detail.video}
          creatorName={detail.creatorName}
          creatorId={detail.creatorId}
          creatorUrl={detail.creatorUrl}
          onClose={() => setDetail(null)}
          onPrefillAnalysis={
            onAnalyzeVideo
              ? () => {
                  const d = detail;
                  setDetail(null);
                  handlePrefillAnalysis(d.video, d.creatorName);
                }
              : undefined
          }
        />
      )}

      {pendingVideo && (
        <ConfirmDialog
          title="删除这张视频卡片？"
          body={
            <>
              <p>
                要删的是「{splitDescription(pendingVideo.description).title || pendingVideo.videoId}」这张卡片。删了就是删了：扩展再上报同一条也不会把它建回来，刷新也不会复活。需要的话只能重新把整段信息粘到输入框里再建一次（手动粘回来可以）。
              </p>
              {deleteError && (
                <p className="mt-2" style={{ color: "var(--bad)" }} role="alert">
                  {deleteError}
                </p>
              )}
            </>
          }
          confirmLabel={deleteVideoMut.isPending ? "正在删除…" : "删除这张卡片"}
          pending={deleteVideoMut.isPending}
          onConfirm={() => deleteVideoMut.mutate(pendingVideo.id)}
          onCancel={() => {
            if (!deleteVideoMut.isPending) {
              setPendingVideo(null);
              setDeleteError(null);
            }
          }}
        />
      )}

      {pendingAccount && (
        <ConfirmDialog
          title="删除这位达人？"
          body={
            <>
              <p>
                要删的是「{pendingAccount.name || pendingAccount.url}」，连同 TA 名下的 {pendingAccount.videos.length} 张视频卡片一起删掉，不再监控。删后扩展再上报 TA 的视频也不会建回来；想恢复监控，把 TA 的一条视频信息粘到输入框里重新获取一次即可。
              </p>
              {deleteError && (
                <p className="mt-2" style={{ color: "var(--bad)" }} role="alert">
                  {deleteError}
                </p>
              )}
            </>
          }
          confirmLabel={deleteAccountMut.isPending ? "正在删除…" : "删除达人及全部卡片"}
          pending={deleteAccountMut.isPending}
          onConfirm={() => deleteAccountMut.mutate(pendingAccount.id)}
          onCancel={() => {
            if (!deleteAccountMut.isPending) {
              setPendingAccount(null);
              setDeleteError(null);
            }
          }}
        />
      )}

      {pendingClear && (
        <ConfirmDialog
          title="一键清除全部视频卡片？"
          body={
            <>
              <p>
                将删除全部 {totalVideos} 条视频，此操作不可恢复。只删视频卡片——达人名单和作者分组设置都保留；清完后同一条视频的自动上报（中转旧数据、扩展补推）也不会再把卡片建回来，达人的新作品照常进来。
              </p>
              {deleteError && (
                <p className="mt-2" style={{ color: "var(--bad)" }} role="alert">
                  {deleteError}
                </p>
              )}
            </>
          }
          confirmLabel={clearVideosMut.isPending ? "正在清除…" : `清除全部 ${totalVideos} 条视频`}
          pending={clearVideosMut.isPending}
          onConfirm={() => clearVideosMut.mutate()}
          onCancel={() => {
            if (!clearVideosMut.isPending) {
              setPendingClear(false);
              setDeleteError(null);
            }
          }}
        />
      )}

      {cleanupPreview && (
        <ConfirmDialog
          title="立即清理：这些卡片将被删除"
          body={
            <>
              <p>
                按 3 天留存规则算了一遍（共 {cleanupPreview.scannedCount} 条卡片）：发布超过 3 天、点赞不到 1000 且播放不到 5 万的有{" "}
                <strong>{cleanupPreview.candidates.length} 条</strong>
                ，删掉的同时会把云端文件一起删，删除不可恢复；其余 {cleanupPreview.keptCount} 条保留。
              </p>
              {cleanupPreview.candidates.length > 0 && (
                <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto pr-1">
                  {cleanupPreview.candidates.map((c: CleanupCandidate) => (
                    <li key={c.id} className="text-[13px] leading-5">
                      <span className="font-medium">{c.title}</span>
                      <span className="text-[var(--dim)]">
                        {" "}· {c.creatorName || "—"} · 视频ID {c.videoId || "—"} · 点赞 {c.likeCount} · 播放 {c.playCount} · 已发布约 {c.ageDays} 天
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {cleanupPreview.unjudged.length > 0 && (
                <>
                  <p className="mt-2">
                    另有 {cleanupPreview.unjudged.length} 条点赞和播放都没采到数据（都是 0），这次不删，先留在「无数据未判定」里等你定：
                  </p>
                  <ul className="mt-1 max-h-32 space-y-1 overflow-y-auto pr-1">
                    {cleanupPreview.unjudged.map((c: CleanupCandidate) => (
                      <li key={c.id} className="text-[13px] leading-5">
                        <span className="font-medium">{c.title}</span>
                        <span className="text-[var(--dim)]">
                          {" "}· {c.creatorName || "—"} · 视频ID {c.videoId || "—"} · 已发布约 {c.ageDays} 天
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {cleanupError && (
                <p className="mt-2" style={{ color: "var(--bad)" }} role="alert">
                  {cleanupError}
                </p>
              )}
            </>
          }
          confirmLabel={
            runCleanupMut.isPending
              ? "正在删除…"
              : cleanupPreview.candidates.length > 0
                ? `确认删除 ${cleanupPreview.candidates.length} 条`
                : "没有要删的，关掉"
          }
          cancelLabel="先不删"
          pending={runCleanupMut.isPending}
          onConfirm={() => {
            if (cleanupPreview.candidates.length > 0) {
              runCleanupMut.mutate();
            } else {
              setCleanupPreview(null);
            }
          }}
          onCancel={() => {
            if (!runCleanupMut.isPending) {
              setCleanupPreview(null);
              setCleanupError(null);
            }
          }}
        />
      )}
    </section>
  );
}
