// ---------------------------------------------------------------------------
// v6.14 「选配台」（顶栏第六台，Bench = options）：把三批 GitHub 调研学到的
// 排版布局做法做成能真选的选配页。数值全部来自第三批调研报告
// （2026-11-14，26 个仓库源码实测，证据以仓库文件原文为主）：
// · 工作台页：W-01…W-42（第 1 类 9 家后台模板 + 第 3 类 5 家低代码）
// · 小程序页：M-01…M-22（第 2 类 7 家小程序 UI 框架，750rpx 设计稿）
// · exe 页：E-01…E-16（第 4 类 5 家桌面壳，只取界面做法、不换壳）
// 三页各有独立页面、独立配置、独立预览，互不影响。
//
// 口径与红线（照调研报告原文，不自创数值）：
// · Mantis 968 星、Datta Able 175 星未过 1000 星线：用到它们数值的地方
// 都标了星数，不标「千星模板」。
// · 报告说「二选一」的（W-16 侧栏激活态）只做单选，不混用；说「不许
// 抄」的（Mazer 0.7s 时长、Wux 安全区写死常量、打包体积 MB 数、
// 换壳选项）不做成推荐项，只在说明里如实写清。
// · 选配结果只存本机 localStorage（与全站「本机设置」同口径），不落
// 服务端、不动任何项目 / 剧本数据；本版只做选配台本身，选好的配置
// 还不自动改全站样式——先在这里选好、看好预览，再定夺是否落地。
// ---------------------------------------------------------------------------

import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { copyText} from "./scriptlib";

// ---- 选配数据模型 ---------------------------------------------------------

type ChoiceOption = { value: string; label: string; detail?: string};
type OptDef = {
id: string;
label: string;
/** 调研条目编号，如 W-01 */
ref: string;
source: string;
caveat?: string;
kind: "choice" | "toggle";
options?: ChoiceOption[];
def: string | boolean;
};
type GroupDef = { title: string; note?: string; opts: OptDef[]};
type PageDef = {
id: "workbench" | "mini" | "exe";
label: string;
intro: string;
storeKey: string;
sources: { name: string; stars: string; warn?: string}[];
groups: GroupDef[];
};

const choice = (
id: string,
label: string,
ref: string,
source: string,
options: ChoiceOption[],
def: string,
caveat?: string,
): OptDef => ({ id, label, ref, source, kind: "choice", options, def, caveat});
const toggle = (
id: string,
label: string,
ref: string,
source: string,
def: boolean,
caveat?: string,
): OptDef => ({ id, label, ref, source, kind: "toggle", def, caveat});

// ---- 工作台页（W-01…W-42） ------------------------------------------------

const WORKBENCH_GROUPS: GroupDef[] = [
{
title: "布局骨架",
note: "三批调研最强的共识：九家后台侧栏宽全部落在 250–300px，其中六家精确取 260px，默认值就取 260px（W-01）。",
opts: [
choice("sidebarWidth", "侧栏宽", "W-02", "CoreUI / Material Dashboard / Sneat·Berry / Mazer", [
{ value: "192", label: "192px", detail: "CoreUI sm 档 12rem"},
{ value: "250", label: "250px", detail: "Material Dashboard 悬浮侧栏"},
{ value: "260", label: "260px", detail: "六家共识：Sneat / Berry / Mantis / Volt / AdminKit 等"},
{ value: "300", label: "300px", detail: "Mazer 宽侧栏档"},
], "260"),
choice("miniWidth", "迷你栏宽（侧栏收起时）", "W-03", "Mantis / Berry / Volt", [
{ value: "60", label: "60px", detail: "Mantis（968 星，未过千星线）"},
{ value: "72", label: "72px", detail: "Berry"},
{ value: "95", label: "95px", detail: "Volt"},
], "72"),
choice("sidebarStyle", "侧栏样式", "W-05", "Material Dashboard / CoreUI", [
{ value: "attached", label: "贴边", detail: "常规贴边、满高"},
{ value: "floating", label: "悬浮", detail: "四周各留 16px、圆角 12px，像一张卡浮在背景上"},
{ value: "overlay", label: "浮层", detail: "CoreUI sidebar-overlaid：浮在内容上、不挤内容"},
], "attached"),
toggle("hoverExpand", "窄栏悬停展开（平时只剩图标，悬停展开回全宽）", "W-04", "CoreUI sidebar-narrow-unfoldable / Datta Able 80→300px（175 星，未过千星线）", true),
choice("headerHeight", "顶栏高", "W-07", "CoreUI / Sneat / Refine / Datta Able", [
{ value: "48", label: "48px", detail: "副栏（面包屑条）高 / ToolJet 顶栏"},
{ value: "64", label: "64px", detail: "CoreUI、Sneat、Refine 三家共识"},
{ value: "74", label: "74px", detail: "Datta Able（175 星，未过千星线）"},
], "64"),
choice("headerStyle", "顶栏样式", "W-06 / W-08", "Sneat / Datta Able", [
{ value: "attached", label: "贴顶", detail: "常规贴顶贴边"},
{ value: "detached", label: "分离式", detail: "Sneat：顶栏也是一张卡，圆角 6px、顶部留白 1rem"},
{ value: "glass", label: "毛玻璃", detail: "Datta Able：背景 70% 透明 + blur(7px)、去掉阴影（175 星，未过千星线）"},
], "attached"),
choice("contentPadding", "内容区内边距", "W-10", "CoreUI·Volt / Berry·Sneat / Datta Able", [
{ value: "16", label: "16px", detail: "CoreUI / Volt"},
{ value: "20", label: "20px", detail: "Berry 桌面档"},
{ value: "24", label: "24px", detail: "Berry / Sneat"},
{ value: "40", label: "40px", detail: "Datta Able 大留白（175 星，未过千星线）"},
], "24"),
toggle("autoCollapse", "窗口变窄自动收起侧栏（小于 xl 1536px 自动收起）", "W-30", "Mantis：断点直接定侧栏开合（968 星，未过千星线）", true),
],
},
{
title: "卡片",
opts: [
choice("cardPadding", "卡片内边距", "W-11", "CoreUI / AdminKit / Berry·Sneat", [
{ value: "16", label: "16px", detail: "CoreUI"},
{ value: "20", label: "20px", detail: "AdminKit"},
{ value: "24", label: "24px", detail: "Berry / Sneat"},
], "24"),
toggle("cardOverlap", "卡片头上叠（头图 / 图标块从卡片顶边叠出去 -24px、左右各缩进 16px）", "W-12", "Material Dashboard 统计卡 / 博客卡的招牌做法（mt=-3）", false),
toggle("cardHoverLift", "卡片悬停上浮（悬停上浮 2px + 阴影升一档）", "W-13", "AdminKit $card-hover-lift: -0.125rem", true),
choice("cardShadow", "卡片阴影", "W-14", "Datta Able / AdminKit / 现状", [
{ value: "light", label: "轻阴影", detail: "Datta Able：0 1px 20px rgba(69,90,100,.08)，几乎看不见边（175 星）"},
{ value: "standard", label: "现状阴影", detail: "工作台现行卡片阴影"},
{ value: "flat", label: "无边框轻浮", detail: "AdminKit：无边框、静止阴影几乎看不见、靠悬停上浮分层"},
], "standard", "Datta Able 的轻阴影扩散 20px，报告提醒在深色背景上可能糊成一片灰雾，选前先看预览。"),
],
},
{
title: "侧栏细节",
opts: [
choice("sidebarActive", "侧栏激活态（二选一，不要两套混用）", "W-16", "Volt / AdminKit", [
{ value: "block", label: "整块底色", detail: "Volt：激活 / 悬停整块灰底，简单直接"},
{ value: "gradient", label: "渐变底 + 3px 左竖线", detail: "AdminKit：90 度渐变淡出 + 左侧 3px 主色竖线，精致一档"},
], "block"),
toggle("badgeFloat", "收起态通知角标浮出（收起后角标变 18px 圆、浮到图标右上角，未读数不丢）", "W-19", "Volt sidenav 收起态做法", true),
choice("menuIndent", "菜单缩进", "W-18", "CoreUI / Datta Able", [
{ value: "coreui", label: "CoreUI 刻度", detail: "链接内边距 12px/16px、图标宽 20px、图标与文字间距 12px"},
{ value: "datta", label: "三级缩进标尺", detail: "Datta Able：二级 60px、三级 80px、四级 95px（175 星）"},
], "coreui", "Datta Able 的缩进到 95px 后，中文长菜单名容易被截断（报告原文提醒）。"),
],
},
{
title: "颜色、字体、字阶",
opts: [
choice("radius", "全局圆角", "W-15", "Mazer / CoreUI·Sneat / 现状 / Material Dashboard", [
{ value: "4", label: "4px", detail: "Mazer 方正档"},
{ value: "6", label: "6px", detail: "CoreUI / Sneat 经典档"},
{ value: "10", label: "10px", detail: "工作台现状"},
{ value: "12", label: "12px", detail: "Material Dashboard xl 悬浮档"},
], "10"),
choice("primary", "主色", "W-25", "现状 / Berry / AdminKit / Volt", [
{ value: "#4d7cfe", label: "电光蓝 #4D7CFE", detail: "工作台现状「深空未来」主色"},
{ value: "#2196f3", label: "亮蓝 #2196F3", detail: "Berry"},
{ value: "#266ed8", label: "沉稳蓝 #266ED8", detail: "AdminKit"},
{ value: "#1f2937", label: "深灰 #1F2937", detail: "Volt：主色就是深灰，彩色只留语义色"},
], "#4d7cfe", "Volt 深灰档是双刃剑：主按钮、主链接默认都变深灰，「生成」「保存」等主操作会失去视觉焦点，报告建议选这档时另配一个彩色强调色。Material Dashboard 的玫红 #e91e63 与深空未来不搭，报告明确不抄，未列入选项。"),
toggle("colorShadow", "彩色阴影（按钮 / 图标块的阴影跟着主色走）", "W-26", "Material Dashboard：0 4px 20px 黑.14 + 0 7px 10px -5px 品牌色.4", false),
choice("font", "字体", "W-23 / W-24", "Volt·AdminKit / Mantis / Mazer / 现状", [
{ value: "system", label: "系统字体栈", detail: "工作台现状：不加载外部字体"},
{ value: "inter", label: "Inter", detail: "Volt / AdminKit 共识"},
{ value: "publicsans", label: "Public Sans", detail: "Mantis（968 星，未过千星线）"},
{ value: "nunito", label: "Nunito 圆润档", detail: "Mazer，需自托管字体文件"},
], "system"),
choice("typeScale", "字阶", "W-22", "Material Dashboard / Berry / 现状", [
{ value: "current", label: "现状字阶", detail: "12 / 14 / 16 / 18 / 20 / 24 / 30"},
{ value: "material", label: "Material 大字阶", detail: "h1–h6 = 48 / 36 / 30 / 24 / 20 / 16px"},
{ value: "berry", label: "Berry 压低一档", detail: "h1 34px 起、正文 14px，标题整体压低"},
], "current", "Berry 字阶对中文不友好（h6、caption 只有 12px，中文小屏发虚），报告原文提醒。"),
choice("avatarScale", "头像档位", "W-27", "Berry / Sneat", [
{ value: "three", label: "三档 22 / 34 / 44px", detail: "Berry，圆角 8px"},
{ value: "five", label: "五档三元组", detail: "Sneat：每档同时定尺寸、字号、状态点偏移，24px 至 64px"},
], "three"),
],
},
{
title: "动效",
note: "动效不要每处写死秒数：改一个变量，全站统一（AdminKit 的令牌化是本批最值得抄的一条）。",
opts: [
choice("motion", "动效令牌", "W-20 / W-21", "AdminKit / CoreUI / Mazer", [
{ value: "tokens", label: "三档令牌 0.15 / 0.25 / 0.35s", detail: "AdminKit --ak-duration-* + 标准缓动 cubic-bezier(0.4,0,0.2,1)，全站只认变量"},
{ value: "fast", label: "全站收敛 0.15s", detail: "CoreUI：侧栏、链接过渡全部收敛到 0.15s"},
{ value: "quint", label: "easeOutQuint 曲线 + 0.15s", detail: "Mazer 的 cubic-bezier(0.22,1,0.36,1) 曲线，只抄曲线不抄时长"},
], "tokens", "Mazer 侧栏过渡是 0.7s，报告明确：缓动曲线可以抄、时长不要抄（开关侧栏等 0.7 秒太拖沓），所以这一档时长仍按 0.15s。"),
],
},
{
title: "搭建画布（把选配做成拼页面时用）",
opts: [
choice("canvasGrid", "画布网格", "W-31", "Budibase / amis / Appsmith·ToolJet", [
{ value: "grid12", label: "12 列 × 24px 行高", detail: "Budibase / amis：12 能被 2/3/4/6 整除，画布自动多留 10 行空白"},
{ value: "flex12", label: "12 列 flex 百分比", detail: "amis：列宽用百分比 flex、槽宽 16px，不用绝对定位"},
{ value: "off", label: "不启用画布", detail: "只选版式、不做拖拽搭建"},
], "grid12", "Appsmith 的 64 列、ToolJet 的 43 列太细，报告明确不抄：选配台是选几款版式拼页面，12 列足够。"),
choice("editorLayout", "编辑器三栏尺寸", "W-33", "amis / Appsmith / ToolJet / Refine", [
{ value: "amis", label: "左 308（48 图标轨 + 260 面板）/ 右 280", detail: "amis：左栏收起只剩 48px 图标轨，右栏可拖到 600px 上限"},
{ value: "appsmith", label: "左 256 / 右 288", detail: "Appsmith 实体浏览 256 + 属性面板 288"},
{ value: "twocol", label: "两栏简版（左 260 / 右 300）", detail: "ToolJet 右侧栏 300；只留左栏 + 右栏，不做四重侧栏"},
], "amis"),
choice("spacingSystem", "间距体系", "W-38 / W-39", "amis / Budibase", [
{ value: "amis", label: "2px 步进基准尺", detail: "amis：先定 2–50px 基准尺，gap 档位映射到尺上刻度（4/8/12/16/20/24）"},
{ value: "budibase", label: "spacing / layout 双套档位", detail: "Budibase：spacing（4/8/12/16/20）调组件内边距、layout（20/24/32/48/64）调区块间距"},
], "budibase"),
toggle("colorScale10", "颜色 10 阶规则（每色 10 阶、主色取第 5 阶，换主题只换色板）", "W-34", "amis", true),
choice("marginControl", "属性面板的边距控件", "W-35", "Budibase", [
{ value: "steps", label: "档位下拉", detail: "Budibase：margin/padding 只给档位下拉（4/8/12/16/20/32/48/64/128/256 + auto），不许自由输数字"},
{ value: "free", label: "自由输入", detail: "宽高与边距都可自由输数字"},
], "steps"),
choice("previewWidths", "预览宽度档", "W-37 / W-40", "Appsmith / Budibase", [
{ value: "appsmith", label: "五档区间", detail: "Appsmith：手机 350–450 / 平板 650–800 / 大平板 960–1080 / 桌面 1160–1280 / 不限"},
{ value: "budibase", label: "三档断点", detail: "Budibase：手机 <720 / 平板 720–1280 / 桌面 ≥1280，用 ResizeObserver 只监听画布容器"},
], "appsmith"),
],
},
];

// ---- 小程序页（M-01…M-22，750rpx 设计稿） ----------------------------------

const MINI_GROUPS: GroupDef[] = [
{
title: "字阶与间距",
note: "小程序的数值体系与桌面后台完全不同：屏幕宽永远是 750rpx，iPhone 6/7/8 上 1rpx = 0.5pt。预览按 375px 宽手机框渲染，rpx 数值 ÷2 换算成屏幕像素。",
opts: [
choice("fontPairing", "字阶行高配对", "M-19", "TDesign / Vant", [
{ value: "tdesign", label: "TDesign 成对 token", detail: "字 20/24/28/32/36/40/72rpx，行高 32/40/44/48/52/56/88rpx 一一配对"},
{ value: "vant", label: "Vant 配对", detail: "字 10/12/14/16px 对应行高 14/18/20/22，正文 14px、标题 16px"},
], "tdesign"),
choice("spacingBase", "间距基数派", "M-03 / M-04", "Vant / TDesign", [
{ value: "vant", label: "4px 基数派", detail: "Vant：基数 4px，派生 8/12/16/24/32，全库间距从一个数派生"},
{ value: "tdesign", label: "8rpx 倍数派（六档 token）", detail: "TDesign：16/24/32/48/64/96/160rpx，约 1.5 倍递进"},
], "tdesign"),
choice("pagePadding", "页边距", "M-02", "Vant / TDesign", [
{ value: "24", label: "24rpx", detail: "TDesign spacer-1"},
{ value: "32", label: "32rpx", detail: "最常见（Vant / TDesign 共识）"},
{ value: "48", label: "48rpx", detail: "TDesign spacer-3，留白更大"},
], "32"),
],
},
{
title: "按钮与圆角",
opts: [
choice("buttonHeight", "按钮默认高", "M-05 / M-06", "七家共识 / TDesign / Vant", [
{ value: "80", label: "80rpx", detail: "TDesign 中号档（偏矮）"},
{ value: "88", label: "88rpx", detail: "共识下限（44pt）"},
{ value: "96", label: "96rpx", detail: "TDesign 大号档 / 共识上限（48pt）"},
], "88"),
choice("buttonRadius", "按钮圆角", "M-07 / M-08", "TDesign / NutUI / Vant", [
{ value: "capsule", label: "胶囊（圆角 = 高度一半）", detail: "TDesign / NutUI 共识"},
{ value: "12", label: "12rpx", detail: "TDesign 默认圆角"},
{ value: "16", label: "16rpx", detail: "卡片 / 弹窗档上限"},
], "capsule"),
choice("miniPrimary", "主按钮色", "M-22", "Vant / NutUI / uView", [
{ value: "#07c160", label: "微信绿 #07C160", detail: "Vant 主按钮色"},
{ value: "#fa2c19", label: "品牌红 #FA2C19", detail: "NutUI 主色（京东红）"},
{ value: "#2979ff", label: "品牌蓝 #2979FF", detail: "uView 主色"},
], "#07c160", "报告提醒：不要默认用桌面后台的蓝——小程序主按钮色是单独一档选配。"),
],
},
{
title: "导航栏与标签栏",
opts: [
choice("navHeight", "导航栏高", "M-09", "Vant / TDesign", [
{ value: "88", label: "88rpx（44pt）", detail: "共识下限"},
{ value: "92", label: "92rpx（46pt）", detail: "Vant NavBar 46px"},
{ value: "96", label: "96rpx（48pt）", detail: "TDesign 48px"},
], "92"),
toggle("capsuleAdapt", "导航栏胶囊适配（运行时读系统胶囊按钮位置，右侧预留 220rpx）", "M-10", "TDesign（读 getMenuButtonBoundingClientRect）/ ColorUI（预留 220rpx）", true, "胶囊逻辑依赖微信专属 API，网页端没有这个 API——这一档只在真小程序里生效，网页预览只能示意位置。"),
choice("tabbarHeight", "标签栏高", "M-11", "Vant / NutUI / Taro / uView", [
{ value: "100", label: "100rpx（50pt）", detail: "Vant / NutUI / Taro 三家一致：图标 44rpx、字 24rpx"},
{ value: "110", label: "110rpx", detail: "uView 外层高（含上下内边距 12rpx）"},
], "100"),
],
},
{
title: "细节规范",
opts: [
choice("safeArea", "底部安全区", "M-13", "Vant·TDesign·Taro / Wux Weapp", [
{ value: "env", label: "env() 双写垫底", detail: "constant() + env(safe-area-inset-bottom) 双写，三家一致"},
{ value: "fixed", label: "写死常量 44 / 34", detail: "Wux Weapp：刘海 44、Home Indicator 34 写死成常量"},
], "env", "Wux 的写死常量不随真机刘海高度自适应（灵动岛、安卓挖孔屏高度各不相同），报告明确不推荐抄，只列出来对照。"),
toggle("hairline", "1rpx 细线（200% 伪元素 + scale(0.5) 实现真细线，不用 1px 边框）", "M-14", "Vant hairline / ColorUI 同款做法", true),
choice("miniMotion", "动效时长", "M-15", "Vant / NutUI / TDesign·ColorUI", [
{ value: "0.2", label: "0.2s 快档", detail: "Vant 快档"},
{ value: "0.25", label: "0.25s", detail: "NutUI"},
{ value: "0.3", label: "0.3s 基准", detail: "Vant / TDesign / ColorUI 三家一致"},
], "0.3"),
choice("miniGrid", "栅格", "M-16", "Vant·TDesign / uView·Wux / NutUI", [
{ value: "24", label: "24 列", detail: "Vant / TDesign"},
{ value: "12", label: "12 列", detail: "uView / Wux，心算更简单"},
{ value: "columnnum", label: "九宫格列数属性", detail: "NutUI columnNum / Vant column-num：按列数定分栏，不套固定栅格"},
], "24"),
choice("miniSkin", "换肤体系", "M-18", "NutUI / uView / ColorUI", [
{ value: "nutui", label: "全量 CSS 变量 + 暗黑变量组", detail: "NutUI：7 家里换肤体系最完整，换肤只改变量不改组件"},
{ value: "uview", label: "theme.scss 简版变量", detail: "uView：变量很薄，组件内联尺寸多为硬编码，换肤要逐个组件改"},
{ value: "colorui", label: "手动改单文件", detail: "ColorUI：只有一个 main.wxss，无版本化主题变量"},
], "nutui"),
choice("miniAvatar", "头像尺寸", "M-20", "ColorUI", [
{ value: "48", label: "48rpx（sm）", detail: "ColorUI sm 档"},
{ value: "64", label: "64rpx（默认）", detail: "ColorUI 默认档，字号用相对 em 跟头像走"},
{ value: "96", label: "96rpx（lg）", detail: "ColorUI lg 档"},
{ value: "128", label: "128rpx（xl）", detail: "ColorUI xl 档"},
], "64"),
choice("miniShadow", "阴影档", "M-21", "ColorUI", [
{ value: "sm", label: "小阴影 0 1rpx 6rpx", detail: "ColorUI shadow"},
{ value: "lg", label: "大阴影 0 40rpx 100rpx", detail: "ColorUI shadow-lg"},
{ value: "blur", label: "模糊阴影", detail: "ColorUI shadow-blur：blur 10rpx + 偏移 10rpx + 透明度 0.4"},
], "sm"),
choice("miniZIndex", "层级（z-index）分层表", "M-17", "Taro UI", [
{ value: "taro", label: "Taro 分层表", detail: "divider 100 / steps 500 / tab 600 / form 700 / nav 800 / drawer 900 / modal 1000 / picker 1010 / toast 1090"},
], "taro"),
],
},
];

// ---- exe 页（E-01…E-16，Electron 壳不变、只取界面做法） -------------------

const EXE_GROUPS: GroupDef[] = [
{
title: "窗口",
note: "现有 exe 是 Electron 壳：这一页只选窗口与界面的做法，Tauri / Wails / Neutralinojs 三家只取界面做法，绝不换壳（E-16），本页没有「换壳」选项。",
opts: [
choice("winSize", "默认窗口尺寸", "E-01", "Tauri / ERB / Wails / Neutralinojs", [
{ value: "800x600", label: "800 × 600", detail: "Tauri 默认，小工具档"},
{ value: "1024x728", label: "1024 × 728", detail: "electron-react-boilerplate 主窗（与现有 exe 同路线）"},
{ value: "1024x768", label: "1024 × 768", detail: "Wails 默认，多栏工作台首选"},
{ value: "800x500", label: "800 × 500", detail: "Neutralinojs 示例，窄窗档"},
], "1024x768"),
choice("minSize", "最小窗口尺寸", "E-01", "Neutralinojs / ERB", [
{ value: "none", label: "不设最小尺寸", detail: "ERB 现状：没有 minWidth / minHeight"},
{ value: "400x200", label: "400 × 200", detail: "Neutralinojs 示例值"},
], "none", "两家的原值都不能直接照搬：ERB 不设最小尺寸会把多栏布局缩坏；Neutralinojs 的 400×200 对工作台又偏小。报告口径是每档窗口都要配最小尺寸，具体下限要按工作台布局另定——先在这里记下选了哪种口径。"),
toggle("winMemory", "窗口记忆（自动记住窗口位置、尺寸、最大化状态，下次启动恢复）", "E-07", "Neutralinojs useSavedState：5 家里唯一有现成做法的一家", true, "Neutralinojs 把恢复文件存到临时目录（.tmp/window_state.json），报告提醒：抄这个做法时恢复文件别放临时目录，清缓存就丢了窗口记忆。"),
],
},
{
title: "标题栏与拖拽区",
opts: [
choice("titleBar", "标题栏样式", "E-02", "Tauri / Wails / 现状（第一批）", [
{ value: "visible", label: "正常标题栏", detail: "Tauri Visible / 系统原生标题栏"},
{ value: "transparent", label: "透明标题栏", detail: "Tauri Transparent：标题栏透明、露底色"},
{ value: "overlay", label: "浮层标题栏", detail: "Tauri Overlay：透明层浮在内容上方；现有 Electron 壳对应 hidden + titleBarOverlay 36px（第一批）"},
], "visible", "Overlay 的坑要照搬报告写清：各系统标题栏高度不同、窗口控件位置会跑偏，Overlay 下必须自己定义拖拽区，且窗口未聚焦时拖不动。"),
toggle("hiddenTitle", "藏标题文字（hiddenTitle，只留窗口控件）", "E-02", "Tauri", false),
toggle("win11Colors", "Win11 标题栏逐色配色（标题栏 / 标题文字 / 边框按深浅与激活态逐项定色）", "E-02", "Wails ThemeSettings，5 家里标题栏颜色控制最细", false, "Wails 的 Mica / Acrylic / Tabbed 毛玻璃背景只在 Windows 11 22621+ 生效，Win10 上没有，选前先看学员机器的系统版本。"),
choice("dragRegion", "拖拽区写法（四种并列，现行 Electron 用第一种）", "E-03", "现状 / Tauri / Wails / Neutralinojs", [
{ value: "electron", label: "-webkit-app-region（现行）", detail: "现有 Electron 壳的做法（第一批已有）"},
{ value: "tauri", label: "HTML 属性 data-tauri-drag-region", detail: "Tauri：不带值只拖自身、deep 子树可拖、false 禁拖"},
{ value: "wails", label: "CSS 属性 --wails-draggable: drag", detail: "Wails：带此样式的元素即拖拽手柄，no-drag 排除"},
{ value: "neutralino", label: "JS API setDraggableRegion(domId)", detail: "Neutralinojs：传元素 id 的命令式做法"},
], "electron"),
],
},
{
title: "启动与加载",
opts: [
choice("startup", "启动不闪白屏", "E-04 / E-05", "ERB / Tauri", [
{ value: "readytoshow", label: "先藏窗、就绪再显示（主推）", detail: "ERB：show: false + ready-to-show 再 show，Electron 原生、比闪屏窗更简单"},
{ value: "splash", label: "闪屏窗先出（备选）", detail: "Tauri 示例：400×200 无框不可调闪屏窗先露、主窗后出"},
{ value: "none", label: "不处理", detail: "建窗直接显示"},
], "readytoshow"),
choice("startBg", "启动底色（防白屏闪）", "E-06", "Tauri background_color / Wails BackgroundColour", [
{ value: "#0e1116", label: "深空底 #0E1116", detail: "与现行「深空未来」底色一致，启动不闪白"},
{ value: "#ffffff", label: "纯白", detail: "Wails 默认 BackgroundColour 就是纯白"},
], "#0e1116"),
toggle("startMinimized", "支持启动即最小化（环境变量 START_MINIMIZED）", "E-04", "ERB", false),
],
},
{
title: "窗口行为",
opts: [
choice("closeBehavior", "关窗行为", "E-12", "Wails / ERB", [
{ value: "quit", label: "关窗即退出", detail: "ERB：非 macOS 关窗退出，macOS 保留在内存（尊重平台惯例）"},
{ value: "hide", label: "只藏窗不退出", detail: "Wails HideWindowOnClose：托盘常驻应用的标准搭档"},
{ value: "intercept", label: "关前拦截确认", detail: "Wails OnBeforeClose：返回 true 可拦住关窗"},
], "quit"),
toggle("singleInstance", "单实例锁（防重复启动，第二次启动唤起已有窗口）", "E-12", "Wails SingleInstanceLock", false),
choice("autoUpdate", "自动更新", "E-09", "ERB / Tauri", [
{ value: "startup", label: "启动即查、有更新即提示", detail: "ERB electron-updater 一行接入 checkForUpdatesAndNotify()；Tauri 为内置自更新"},
{ value: "off", label: "不自动查（手动发版）", detail: "现状：靠 GitHub 手动发版"},
], "startup"),
choice("tray", "系统托盘", "E-08", "Wails v3 / Tauri 插件仓 / ERB·Neutralinojs", [
{ value: "none", label: "不用托盘", detail: "ERB 与 Neutralinojs 均未提供托盘"},
{ value: "wailsv3", label: "Wails v3 统一 API 式", detail: "app.SystemTray.New() 一套 API（v2 没有托盘，是 v3 才有的）"},
{ value: "tauriplugin", label: "Tauri 插件仓式", detail: "托盘不在 Tauri 主仓库里，是独立插件仓的功能，需另装插件"},
], "none"),
toggle("multiWindow", "多窗口（配置数组一行一个窗：主窗 + 副窗 600×400，以后加悬浮小窗 / 预览窗照此加）", "E-11", "Tauri multiwindow 示例", false),
toggle("snapshot", "窗口截图（snapshot() 截取窗口客户区存 PNG，5 家独有）", "E-13", "Neutralinojs 窗口 API（文档整理值）", false),
],
},
{
title: "菜单与快捷键",
opts: [
choice("menuRoles", "菜单快捷键写法", "E-10", "ERB menu.ts", [
{ value: "roles", label: "role 写法 + 双平台菜单模板", detail: "视图快捷键用内置 role（reload / toggleDevTools / togglefullscreen），不用自己写键位；macOS 与非 macOS 两套模板都要保留"},
], "roles"),
],
},
{
title: "构建 / 开发体验（electron-vite 属这一组，不是窗口布局）",
note: "electron-vite 是 Electron 的构建工具、不是界面模板：它没有布局、侧栏、标题栏可抄，只能放这一组（E-14）。",
opts: [
toggle("threeEntry", "三入口分离构建（main / preload / renderer 各自独立构建，改界面只重编 renderer）", "E-14", "electron-vite", true),
toggle("hmr", "Fast HMR 热更新（界面改动秒级刷新、不用重启 exe）", "E-14", "electron-vite", true),
toggle("bytecode", "V8 字节码保护源码（把代码编译成字节码再分发）", "E-14", "electron-vite", false, "字节码只防「随手看源码」，不是加密，不要写成「代码无法破解」（报告原文）。"),
],
},
];

const PAGES: PageDef[] = [
{
id: "workbench",
label: "工作台",
intro: "桌面后台的选配：侧栏、顶栏、卡片、颜色字体、动效，再加搭建画布那一套。数值来自第 1 类 9 家后台模板与第 3 类 5 家低代码工作台的源码实测。",
storeKey: "scriptbench.options.workbench.v1",
sources: [
{ name: "CoreUI", stars: "12,264 星"},
{ name: "Material Dashboard", stars: "3,024 星"},
{ name: "Sneat", stars: "1,246 星"},
{ name: "Mazer", stars: "3,107 星"},
{ name: "Berry", stars: "2,192 星"},
{ name: "Mantis", stars: "968 星", warn: "未过千星线"},
{ name: "Datta Able", stars: "175 星", warn: "未过千星线"},
{ name: "Volt", stars: "2,679 星"},
{ name: "AdminKit", stars: "1,661 星"},
{ name: "Appsmith", stars: "41,250 星"},
{ name: "ToolJet", stars: "41,229 星"},
{ name: "Refine", stars: "36,035 星"},
{ name: "Budibase", stars: "28,414 星"},
{ name: "amis", stars: "18,889 星"},
],
groups: WORKBENCH_GROUPS,
},
{
id: "mini",
label: "小程序",
intro: "小程序是独立的一页、独立的数值体系：750rpx 设计稿，正文 28rpx、按钮 88–96rpx、导航栏 88–96rpx、标签栏 100rpx，再加安全区双写与 1rpx 细线。桌面后台的数值不要直接套到这一页。",
storeKey: "scriptbench.options.mini.v1",
sources: [
{ name: "Taro UI", stars: "4,733 星"},
{ name: "Vant Weapp", stars: "18,476 星"},
{ name: "NutUI", stars: "6,514 星"},
{ name: "uView", stars: "4,211 星"},
{ name: "TDesign 小程序版", stars: "1,798 星"},
{ name: "Wux Weapp", stars: "5,032 星"},
{ name: "ColorUI", stars: "12,354 星"},
],
groups: MINI_GROUPS,
},
{
id: "exe",
label: "exe 程序",
intro: "exe 是独立的一页：现有 exe 还是 Electron 壳，不换壳，只选窗口尺寸、标题栏、拖拽区、启动方式、关窗行为这些界面做法。打包体积五家仓库原文里都没有具体 MB 数，这一页不写数字（E-15）。",
storeKey: "scriptbench.options.exe.v1",
sources: [
{ name: "Tauri", stars: "112,897 星"},
{ name: "electron-vite", stars: "5,641 星"},
{ name: "electron-react-boilerplate", stars: "24,251 星"},
{ name: "Wails", stars: "37,102 星"},
{ name: "Neutralinojs", stars: "8,693 星"},
],
groups: EXE_GROUPS,
},
];

// ---- 本机存取 -------------------------------------------------------------

type Cfg = Record<string, string | boolean>;

function defaultsOf(groups: GroupDef[]): Cfg {
const cfg: Cfg = {};
for (const g of groups) for (const o of g.opts) cfg[o.id] = o.def;
return cfg;
}
function loadCfg(page: PageDef): Cfg {
const base = defaultsOf(page.groups);
try {
const raw = window.localStorage.getItem(page.storeKey);
if (!raw) return base;
const parsed = JSON.parse(raw) as Record<string, unknown>;
const next: Cfg = {...base};
for (const g of page.groups) {
for (const o of g.opts) {
const v = parsed[o.id];
if (o.kind === "toggle" && typeof v === "boolean") next[o.id] = v;
if (o.kind === "choice" && typeof v === "string" && o.options?.some((op) => op.value === v)) {
next[o.id] = v;
}
}
}
return next;
} catch {
return base;
}
}
function saveCfg(page: PageDef, cfg: Cfg) {
try {
window.localStorage.setItem(page.storeKey, JSON.stringify(cfg));
} catch {
/* private mode */
}
}
function optLabel(o: OptDef, cfg: Cfg): string {
const v = cfg[o.id];
if (o.kind === "toggle") return v === true? "开": "关";
return o.options?.find((op) => op.value === v)?.label?? String(v?? "");
}
function summaryText(page: PageDef, cfg: Cfg): string {
const lines: string[] = [`选配台 · ${page.label}页配置（${new Date().toLocaleDateString("zh-CN")}）`];
for (const g of page.groups) {
lines.push("", ``);
for (const o of g.opts) lines.push(`- ${o.label}：${optLabel(o, cfg)}（${o.ref}，来源：${o.source}）`);
}
return lines.join("\n");
}

// ---- 通用控件 -------------------------------------------------------------

function OptRow({
opt,
cfg,
onSet,
}: {
opt: OptDef;
cfg: Cfg;
onSet: (id: string, v: string | boolean) => void;
}) {
const value = cfg[opt.id];
return (
<div className="border-t py-3 first:border-t-0 first:pt-0 last:pb-0" style={{ borderColor: "var(--border)"}}>
<div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
<span className="text-sm font-bold leading-6">{opt.label}</span>
<span className="tc text-xs text-[var(--dim)]">{opt.ref}</span>
</div>
<p className="mt-0.5 text-xs leading-5 text-[var(--dim)]">来源：{opt.source}</p>
{opt.kind === "choice"? (
<div className="seg seg-sm mt-2" role="group" aria-label={opt.label}>
{(opt.options?? []).map((op) => (
<button
key={op.value}
type="button"
aria-pressed={value === op.value}
title={op.detail?? op.label}
onClick={() => onSet(opt.id, op.value)}
>
{op.label}
</button>
))}
</div>
): (
<button
type="button"
role="switch"
aria-checked={value === true}
aria-label={`${opt.label}（当前${value === true? "开": "关"}，点击切换）`}
className="mt-2 inline-flex min-h-[32px] items-center gap-2 rounded-full border px-3 py-1 text-[13px] font-semibold"
style={{
borderColor: value === true? "var(--accent)": "var(--border)",
background: value === true? "var(--accent-soft)": "transparent",
color: value === true? "var(--accent)": "var(--dim)",
}}
onClick={() => onSet(opt.id, value!== true)}
>
<span
aria-hidden="true"
className="inline-block h-2.5 w-2.5 rounded-full"
style={{ background: value === true? "var(--accent)": "var(--taupe)"}}
/>
{value === true? "开": "关"}
</button>
)}
{opt.kind === "choice" && (
<p className="mt-1.5 text-xs leading-5 text-[var(--dim)]">
{(opt.options?? []).find((op) => op.value === value)?.detail?? ""}
</p>
)}
{opt.caveat && (
<p className="mt-1.5 text-xs leading-5" style={{ color: "var(--bad)"}} role="note">
注意：{opt.caveat}
</p>
)}
</div>
);
}

function PageShell({
page,
cfg,
onSet,
onReset,
preview,
}: {
page: PageDef;
cfg: Cfg;
onSet: (id: string, v: string | boolean) => void;
onReset: () => void;
preview: ReactNode;
}) {
const [copied, setCopied] = useState(false);
const total = page.groups.reduce((n, g) => n + g.opts.length, 0);
const changed = page.groups.reduce(
(n, g) => n + g.opts.filter((o) => cfg[o.id]!== o.def).length,
0,
);
const copySummary = async () => {
const ok = await copyText(summaryText(page, cfg));
if (ok) {
setCopied(true);
window.setTimeout(() => setCopied(false), 2500);
}
};
return (
<div>
<p className="max-w-3xl text-sm leading-6 text-[var(--dim)]">{page.intro}</p>
<div className="mt-3 flex flex-wrap gap-1.5" aria-label={`${page.label}页的数据来源与星数`}>
{page.sources.map((s) => (
<span
key={s.name}
className="rounded-full border px-2.5 py-0.5 text-xs leading-5"
style={{
borderColor: s.warn? "var(--bad)": "var(--border)",
color: s.warn? "var(--bad)": "var(--dim)",
background: s.warn? "var(--bad-soft)": "transparent",
}}
title={s.warn? `${s.name}：${s.stars}，${s.warn}，入库时不标「千星模板」`: `${s.name}：${s.stars}`}
>
{s.name} · {s.stars}
{s.warn? "（未过千星线）": ""}
</span>
))}
</div>
<p className="mt-2 text-xs leading-5 text-[var(--dim)]" role="status">
本页共 {total} 项可选{changed > 0? `，已改 ${changed} 项（与调研推荐默认值不同）`: "，当前全部是调研推荐默认值"}。选择只存在这台设备的浏览器里，不改动工作台现在的样子。
</p>

<div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
<div className="space-y-4">
{page.groups.map((g) => (
<section key={g.title} className="card" aria-label={`${page.label}选配：${g.title}`}>
<h3 className="text-base font-bold">{g.title}</h3>
{g.note && <p className="mt-1 text-xs leading-5 text-[var(--dim)]">{g.note}</p>}
<div className="mt-2">
{g.opts.map((o) => (
<OptRow key={o.id} opt={o} cfg={cfg} onSet={onSet} />
))}
</div>
</section>
))}
<div className="card" aria-label={`${page.label}页配置摘要`}>
<h3 className="text-base font-bold">配置摘要</h3>
<pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-[var(--dim)]">
{summaryText(page, cfg)}
</pre>
<div className="mt-3 flex flex-wrap gap-2">
<button type="button" className="btn btn-primary" aria-label={`复制${page.label}页的配置摘要`} onClick={() => void copySummary()}>
{copied? "已复制 ✓": "复制配置摘要"}
</button>
<button type="button" className="btn" aria-label={`把${page.label}页恢复成调研推荐默认值`} onClick={onReset}>
恢复默认
</button>
</div>
</div>
</div>
<div className="min-w-0">
<div className="xl:sticky xl:top-4">{preview}</div>
</div>
</div>
</div>
);
}

// ---- 工作台预览 -----------------------------------------------------------

const FONT_STACKS: Record<string, string> = {
  system: 'ui-sans-serif, system-ui, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
  inter: 'Inter, ui-sans-serif, system-ui, "PingFang SC", "Microsoft YaHei", sans-serif',
  publicsans: '"Public Sans", ui-sans-serif, system-ui, "PingFang SC", "Microsoft YaHei", sans-serif',
  nunito: 'Nunito, ui-sans-serif, system-ui, "PingFang SC", "Microsoft YaHei", sans-serif',
};
const TYPE_SCALES: Record<string, { h: number; body: number }> = {
  current: { h: 24, body: 14 },
  material: { h: 30, body: 16 },
  berry: { h: 24, body: 14 },
};

function WorkbenchPreview({ cfg }: { cfg: Cfg }) {
  const [mini, setMini] = useState(false);
  const sidebarW = Number(cfg.sidebarWidth ?? 260);
  const miniW = Number(cfg.miniWidth ?? 72);
  const headerH = Number(cfg.headerHeight ?? 64);
  const pad = Number(cfg.contentPadding ?? 24);
  const cardPad = Number(cfg.cardPadding ?? 24);
  const radius = Number(cfg.radius ?? 10);
  const primary = String(cfg.primary ?? "#4d7cfe");
  const floating = cfg.sidebarStyle === "floating";
  const overlay = cfg.sidebarStyle === "overlay";
  const scale = TYPE_SCALES[String(cfg.typeScale ?? "current")] ?? TYPE_SCALES.current!;
  const avatarSizes = cfg.avatarScale === "five" ? [24, 32, 38, 48, 64] : [22, 34, 44];
  const navItems = ["模式选择", "基础设置", "人物与大纲", "剧本审查", "分镜", "封面生成"];
  const shownW = mini ? miniW : sidebarW;
  const sidebar = (
    <div
      className="relative flex shrink-0 flex-col overflow-hidden"
      style={{
        width: shownW,
        background: "var(--surface)",
        borderRight: overlay ? undefined : "1px solid var(--border)",
        border: floating ? "1px solid var(--border)" : undefined,
        borderRadius: floating ? 12 : 0,
        margin: floating ? 16 : 0,
        height: floating ? "calc(100% - 32px)" : "100%",
        fontFamily: FONT_STACKS[String(cfg.font ?? "system")],
      }}
      aria-hidden="true"
    >
      <div className="flex items-center gap-2 px-3" style={{ height: 48 }}>
        <span
          className="flex shrink-0 items-center justify-center rounded-full font-black text-white"
          style={{ width: 26, height: 26, background: primary, fontSize: 13 }}
        >
          剧
        </span>
        {!mini && <span className="truncate text-sm font-bold">剧本工作台</span>}
      </div>
      <nav className="mt-1 space-y-0.5 px-2">
        {navItems.map((label, i) => {
          const active = i === 3;
          return (
            <div
              key={label}
              className="relative flex items-center"
              style={{
                gap: mini ? 0 : 12,
                padding: mini ? "8px 0" : "8px 12px",
                justifyContent: mini ? "center" : "flex-start",
                borderRadius: cfg.sidebarActive === "gradient" ? 4 : 8,
                background: active
                  ? cfg.sidebarActive === "gradient"
                    ? `linear-gradient(90deg, ${primary}2e 0%, ${primary}16 50%, transparent 100%)`
                    : "var(--surface-alt)"
                  : "transparent",
                boxShadow: active && cfg.sidebarActive === "gradient" ? `inset 3px 0 0 ${primary}` : undefined,
                color: active ? "var(--text)" : "var(--dim)",
                fontSize: 13,
              }}
            >
              <span
                className="flex shrink-0 items-center justify-center rounded"
                style={{ width: 20, height: 20, background: "var(--surface-alt)", fontSize: 11 }}
              >
                {label.slice(0, 1)}
              </span>
              {!mini && <span className="truncate">{label}</span>}
              {i === 1 &&
                (mini ? (
                  cfg.badgeFloat === true ? (
                    <span
                      className="absolute flex items-center justify-center rounded-full font-bold text-white"
                      style={{ width: 18, height: 18, fontSize: 10, background: "var(--bad)", top: 0, right: 2 }}
                    >
                      3
                    </span>
                  ) : null
                ) : (
                  <span
                    className="ml-auto rounded-full px-1.5 text-[11px] font-bold text-white"
                    style={{ background: "var(--bad)" }}
                  >
                    3
                  </span>
                ))}
            </div>
          );
        })}
      </nav>
      {!mini && cfg.hoverExpand === true && (
        <p className="mt-auto px-3 pb-3 text-[11px] leading-4 text-[var(--dim)]">窄栏悬停展开：开</p>
      )}
    </div>
  );
  return (
    <section className="card" aria-label="工作台页实时预览">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-bold">实时预览</h3>
        <span className="text-xs text-[var(--dim)]">改左边任何一项，这里立刻跟着变（示意预览，尺寸按比例）</span>
        <div className="seg seg-sm ml-auto" role="group" aria-label="预览侧栏状态">
          <button type="button" aria-pressed={!mini} onClick={() => setMini(false)}>展开态</button>
          <button type="button" aria-pressed={mini} onClick={() => setMini(true)}>迷你态</button>
        </div>
      </div>
      <div className="mt-3 overflow-x-auto">
        <div
          className="relative flex overflow-hidden border"
          style={{
            minWidth: 620,
            height: 430,
            borderColor: "var(--border)",
            borderRadius: radius,
            background: "var(--bg)",
            fontFamily: FONT_STACKS[String(cfg.font ?? "system")],
          }}
        >
          {sidebar}
          <div className="flex min-w-0 flex-1 flex-col" style={{ marginLeft: overlay && mini ? -40 : 0 }}>
            <div
              className="flex shrink-0 items-center gap-3"
              style={{
                height: headerH,
                padding: `0 ${pad}px`,
                margin: cfg.headerStyle === "detached" ? "16px 16px 0" : 0,
                borderRadius: cfg.headerStyle === "detached" ? 6 : 0,
                background:
                  cfg.headerStyle === "glass" ? "rgba(22,27,34,0.7)" : "var(--surface)",
                backdropFilter: cfg.headerStyle === "glass" ? "blur(7px)" : undefined,
                borderBottom: cfg.headerStyle === "detached" ? undefined : "1px solid var(--border)",
                boxShadow: cfg.headerStyle === "detached" ? "0 2px 6px rgba(0,0,0,.25)" : undefined,
              }}
            >
              <span className="text-sm font-bold">剧本审查</span>
              <span className="ml-auto text-xs text-[var(--dim)]">项目 46 · 校门口这点生意</span>
              <span
                className="rounded px-2.5 py-1 text-xs font-bold text-white"
                style={{
                  background: primary,
                  boxShadow: cfg.colorShadow === true ? `0 4px 20px rgba(0,0,0,.35), 0 7px 10px -5px ${primary}` : undefined,
                }}
              >
                生成分镜
              </span>
            </div>
            <div style={{ padding: pad }} className="min-h-0 flex-1 overflow-hidden">
              <div className="flex items-baseline justify-between gap-3">
                <span style={{ fontSize: scale.h, fontWeight: 800, lineHeight: 1.3 }}>校门口这点生意</span>
                <span className="shrink-0 text-xs text-[var(--dim)]">工作台 / 剧本审查</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                {[0, 1].map((i) => (
                  <div
                    key={i}
                    className="relative"
                    style={{
                      padding: cardPad,
                      paddingTop: cfg.cardOverlap === true ? cardPad + 10 : cardPad,
                      borderRadius: radius,
                      background: "var(--surface)",
                      border: cfg.cardShadow === "flat" ? "none" : "1px solid var(--border)",
                      boxShadow:
                        cfg.cardShadow === "light"
                          ? "0 1px 20px 0 rgba(69,90,100,0.08)"
                          : cfg.cardShadow === "flat"
                            ? "0 0 14px 0 rgba(0,0,0,0.12)"
                            : "var(--shadow-card)",
                    }}
                  >
                    {cfg.cardOverlap === true && (
                      <span
                        className="absolute flex items-center justify-center rounded-lg font-black text-white"
                        style={{ width: 34, height: 34, background: primary, top: -24, left: 16, fontSize: 15 }}
                      >
                        {i === 0 ? "47" : "38"}
                      </span>
                    )}
                    <p className="font-bold" style={{ fontSize: scale.body }}>{i === 0 ? "节拍总数" : "台词总数"}</p>
                    <p className="mt-1 text-xs leading-5 text-[var(--dim)]">
                      {i === 0 ? "47 拍 · 总时长按语速现算" : "38 句 · 已全部确认说话人"}
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-end gap-3" aria-hidden="true">
                {avatarSizes.map((s) => (
                  <span
                    key={s}
                    className="flex shrink-0 items-center justify-center rounded-full font-bold text-white"
                    style={{ width: s, height: s, background: "var(--surface-alt)", color: "var(--dim)", fontSize: Math.max(10, s * 0.36), border: "1px solid var(--border)" }}
                  >
                    {s}
                  </span>
                ))}
                <span className="pb-1 text-[11px] text-[var(--dim)]">头像档位（px）</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <p className="mt-2 text-xs leading-5 text-[var(--dim)]">
        当前：侧栏 {mini ? `${miniW}px（迷你态）` : `${sidebarW}px`} · 顶栏 {headerH}px · 内容内边距 {pad}px · 卡片内边距 {cardPad}px · 圆角 {radius}px。
        {cfg.autoCollapse === true ? "窗口小于 1536px 时侧栏自动收起。" : ""}
        {cfg.cardHoverLift === true ? "卡片悬停上浮 2px 在真页面里把鼠标放上去才看得到，静态预览不演示。" : ""}
      </p>
    </section>
  );
}

// ---- 小程序预览 -----------------------------------------------------------

function MiniPreview({ cfg }: { cfg: Cfg }) {
  const rpx = (v: number) => v / 2;
  const btnH = Number(cfg.buttonHeight ?? 88);
  const navH = Number(cfg.navHeight ?? 92);
  const tabH = Number(cfg.tabbarHeight ?? 100);
  const pagePad = Number(cfg.pagePadding ?? 32);
  const avatar = Number(cfg.miniAvatar ?? 64);
  const primary = String(cfg.miniPrimary ?? "#07c160");
  const btnRadius = cfg.buttonRadius === "capsule" ? btnH / 4 : rpx(Number(cfg.buttonRadius ?? 12));
  const shadow =
    cfg.miniShadow === "lg"
      ? "0 20px 50px rgba(0,0,0,.28)"
      : cfg.miniShadow === "blur"
        ? "5px 5px 10px rgba(0,0,0,.4)"
        : "0 1px 3px rgba(0,0,0,.25)";
  const bodyFs = cfg.fontPairing === "vant" ? 14 : 14;
  const titleFs = cfg.fontPairing === "vant" ? 16 : 16;
  return (
    <section className="card" aria-label="小程序页实时预览">
      <h3 className="text-base font-bold">实时预览</h3>
      <p className="mt-1 text-xs leading-5 text-[var(--dim)]">375px 宽手机框示意：rpx 数值 ÷2 换算成屏幕像素渲染。</p>
      <div className="mt-3 flex justify-center">
        <div
          className="flex w-full flex-col overflow-hidden border"
          style={{ maxWidth: 375, borderColor: "var(--border)", borderRadius: 18, background: "#10141a", height: 560 }}
        >
          <div
            className="relative flex shrink-0 items-center justify-center border-b"
            style={{ height: rpx(navH), borderColor: "var(--border)", background: "var(--surface)" }}
          >
            <span style={{ fontSize: titleFs, fontWeight: 600 }}>剧本工作台小程序</span>
            {cfg.capsuleAdapt === true && (
              <span
                className="absolute flex items-center justify-center gap-1 rounded-full border"
                style={{ right: 8, width: 87, height: 32, borderColor: "var(--border)", background: "var(--surface-alt)" }}
                aria-hidden="true"
              >
                <span className="text-[11px] leading-none text-[var(--dim)]">•••</span>
                <span className="h-3 w-px" style={{ background: "var(--border)" }} />
                <span className="inline-block h-2.5 w-2.5 rounded-full border-2" style={{ borderColor: "var(--dim)" }} />
              </span>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-hidden" style={{ padding: rpx(pagePad) }}>
            <div
              style={{ padding: "13px 16px", borderRadius: 8, background: "var(--surface)", boxShadow: shadow }}
            >
              <div className="flex items-center gap-3">
                <span
                  className="flex shrink-0 items-center justify-center rounded-full font-bold"
                  style={{ width: rpx(avatar), height: rpx(avatar), background: "var(--surface-alt)", color: "var(--dim)", fontSize: Math.max(10, rpx(avatar) * 0.36) }}
                >
                  头
                </span>
                <div className="min-w-0">
                  <p style={{ fontSize: bodyFs, fontWeight: 600 }}>校门口这点生意</p>
                  <p className="truncate text-xs text-[var(--dim)]">47 拍 · 38 句台词 · 已分镜</p>
                </div>
              </div>
              <button
                type="button"
                className="mt-3 w-full font-bold text-white"
                style={{ height: rpx(btnH), borderRadius: btnRadius, background: primary, fontSize: 15 }}
                aria-label="小程序预览主按钮（示意，不执行操作）"
              >
                生成分镜
              </button>
            </div>
            <div className="mt-3 overflow-hidden" style={{ borderRadius: 8, background: "var(--surface)" }}>
              {["人物与大纲", "剧本审查", "封面生成"].map((label, i) => (
                <div
                  key={label}
                  className="flex items-center"
                  style={{
                    padding: "13px 16px",
                    fontSize: bodyFs,
                    borderBottom: i < 2 ? "1px solid var(--border)" : undefined,
                    boxShadow: cfg.hairline === true && i < 2 ? "inset 0 -0.5px 0 rgba(255,255,255,0.06)" : undefined,
                  }}
                >
                  <span>{label}</span>
                  <span className="ml-auto text-[var(--dim)]">›</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs leading-5 text-[var(--dim)]">
              Cell 内边距 26–32rpx · 字 28rpx（uView / TDesign / NutUI 共识，M-12）
            </p>
          </div>
          <div className="shrink-0 border-t" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
            <div className="flex items-center justify-around" style={{ height: rpx(tabH) }}>
              {["首页", "项目", "我的"].map((label, i) => (
                <span key={label} className="flex flex-col items-center gap-1" style={{ color: i === 0 ? primary : "var(--dim)" }}>
                  <span className="flex items-center justify-center rounded" style={{ width: 22, height: 22, background: "var(--surface-alt)", fontSize: 11 }}>
                    {label.slice(0, 1)}
                  </span>
                  <span style={{ fontSize: 12 }}>{label}</span>
                </span>
              ))}
            </div>
            <div
              className="flex items-center justify-center"
              style={{ height: 20, background: "var(--surface-alt)" }}
            >
              <span className="text-[10px] leading-none text-[var(--dim)]">
                {cfg.safeArea === "env" ? "安全区：env(safe-area-inset-bottom) 双写垫底" : "安全区：写死 34 常量（不推荐）"}
              </span>
            </div>
          </div>
        </div>
      </div>
      <p className="mt-2 text-xs leading-5 text-[var(--dim)]">
        当前：导航栏 {navH}rpx · 标签栏 {tabH}rpx（图标 44rpx、字 24rpx）· 按钮高 {btnH}rpx · 页边距 {pagePad}rpx · 动效 {String(cfg.miniMotion ?? "0.3")}s。
        {cfg.hairline === true ? "列表分隔线用 1rpx 细线做法（伪元素 scale(0.5)），高清屏上不显粗。" : ""}
      </p>
    </section>
  );
}

// ---- exe 预览 -------------------------------------------------------------

function ExePreview({ cfg }: { cfg: Cfg }) {
  const [w = "1024", h = "768"] = String(cfg.winSize ?? "1024x768").split("x");
  const aspect = `${Number(w)} / ${Number(h)}`;
  const overlay = cfg.titleBar === "overlay";
  const transparent = cfg.titleBar === "transparent";
  return (
    <section className="card" aria-label="exe 页实时预览">
      <h3 className="text-base font-bold">实时预览</h3>
      <p className="mt-1 text-xs leading-5 text-[var(--dim)]">桌面窗口示意：比例按所选窗口尺寸 {w} × {h} 渲染，内容是工作台壳的缩略示意。</p>
      <div className="relative mt-3">
        <div
          className="relative w-full overflow-hidden border"
          style={{
            aspectRatio: aspect,
            maxHeight: 460,
            borderColor: "var(--border)",
            borderRadius: 10,
            background: String(cfg.startBg ?? "#0e1116"),
            boxShadow: "0 18px 44px rgba(0,0,0,.4)",
          }}
        >
          <div
            className="absolute inset-x-0 top-0 z-10 flex items-center gap-2 px-3"
            style={{
              height: 38,
              background: transparent ? "transparent" : "var(--surface)",
              borderBottom: overlay || transparent ? undefined : "1px solid var(--border)",
              // 演示现行 Electron 拖拽区写法，仅作样式示意
              ...({ WebkitAppRegion: "drag" } as CSSProperties),
            }}
          >
            <span className="flex gap-1.5" aria-hidden="true">
              <span className="h-3 w-3 rounded-full" style={{ background: "#f0665e" }} />
              <span className="h-3 w-3 rounded-full" style={{ background: "#e8c33a" }} />
              <span className="h-3 w-3 rounded-full" style={{ background: "#3cb179" }} />
            </span>
            {cfg.hiddenTitle !== true && <span className="text-xs font-semibold text-[var(--dim)]">剧本创作工作台</span>}
            <span className="ml-auto text-[10px] text-[var(--dim)]">
              {cfg.dragRegion === "tauri"
                ? "data-tauri-drag-region"
                : cfg.dragRegion === "wails"
                  ? "--wails-draggable: drag"
                  : cfg.dragRegion === "neutralino"
                    ? "setDraggableRegion()"
                    : "-webkit-app-region: drag"}
            </span>
          </div>
          <div className="flex h-full" style={{ paddingTop: overlay || transparent ? 0 : 38 }}>
            <div
              className="hidden shrink-0 flex-col gap-1 border-r p-2 sm:flex"
              style={{ width: 132, borderColor: "var(--border)", background: "var(--surface)", paddingTop: overlay || transparent ? 46 : 8 }}
            >
              {["模式选择", "基础设置", "人物与大纲", "剧本审查", "分镜"].map((label, i) => (
                <span
                  key={label}
                  className="rounded px-2 py-1 text-[11px]"
                  style={{ background: i === 3 ? "var(--accent-soft)" : "transparent", color: i === 3 ? "var(--accent)" : "var(--dim)" }}
                >
                  {label}
                </span>
              ))}
            </div>
            <div className="min-w-0 flex-1 p-3" style={{ paddingTop: overlay || transparent ? 46 : 12 }}>
              <p className="text-sm font-bold">剧本审查</p>
              <p className="mt-1 text-xs leading-5 text-[var(--dim)]">
                {cfg.startup === "readytoshow"
                  ? "启动方式：先藏窗、内容就绪才显示，不闪白屏。"
                  : cfg.startup === "splash"
                    ? "启动方式：400×200 闪屏窗先出、主窗后出。"
                    : "启动方式：建窗直接显示。"}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <span className="rounded border p-2 text-[11px] text-[var(--dim)]" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                  关窗：{cfg.closeBehavior === "hide" ? "只藏窗（托盘常驻）" : cfg.closeBehavior === "intercept" ? "关前拦截确认" : "关窗即退出"}
                </span>
                <span className="rounded border p-2 text-[11px] text-[var(--dim)]" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                  更新：{cfg.autoUpdate === "startup" ? "启动即查更新" : "手动发版"}
                  {cfg.winMemory === true ? " · 窗口记忆：开" : ""}
                </span>
              </div>
            </div>
          </div>
          {cfg.multiWindow === true && (
            <div
              className="absolute border"
              style={{
                right: 14,
                bottom: 14,
                width: 168,
                height: 112,
                borderColor: "var(--accent)",
                borderRadius: 8,
                background: "var(--surface)",
                boxShadow: "0 12px 28px rgba(0,0,0,.45)",
              }}
            >
              <p className="border-b px-2 py-1 text-[10px] font-bold" style={{ borderColor: "var(--border)" }}>副窗（600 × 400）</p>
              <p className="px-2 py-1 text-[10px] text-[var(--dim)]">悬浮小窗 / 预览窗示意</p>
            </div>
          )}
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs leading-5 sm:grid-cols-3">
        <div><dt className="text-[var(--dim)]">窗口尺寸</dt><dd className="font-bold">{w} × {h}</dd></div>
        <div><dt className="text-[var(--dim)]">最小尺寸</dt><dd className="font-bold">{cfg.minSize === "none" ? "不设" : String(cfg.minSize).replace("x", " × ")}</dd></div>
        <div><dt className="text-[var(--dim)]">标题栏</dt><dd className="font-bold">{cfg.titleBar === "overlay" ? "浮层" : cfg.titleBar === "transparent" ? "透明" : "正常"}{cfg.hiddenTitle === true ? " · 藏标题" : ""}</dd></div>
        <div><dt className="text-[var(--dim)]">启动底色</dt><dd className="font-bold">{String(cfg.startBg ?? "")}</dd></div>
        <div><dt className="text-[var(--dim)]">托盘</dt><dd className="font-bold">{cfg.tray === "wailsv3" ? "Wails v3 API 式" : cfg.tray === "tauriplugin" ? "Tauri 插件仓式" : "不用"}</dd></div>
        <div><dt className="text-[var(--dim)]">单实例锁</dt><dd className="font-bold">{cfg.singleInstance === true ? "开" : "关"}</dd></div>
      </dl>
      <p className="mt-2 text-xs leading-5 text-[var(--dim)]">
        打包体积：五家仓库原文里都没有具体 MB 数，这里不写数字；只记路线差异——Electron 内嵌 Chromium 偏大，Tauri / Wails / Neutralinojs 用系统 WebView 偏小，数字等实测再补（E-15）。
      </p>
    </section>
  );
}

// ---- 选配台本体 -----------------------------------------------------------

export function OptionBench() {
  const [pageId, setPageId] = useState<PageDef["id"]>("workbench");
  const [cfgs, setCfgs] = useState<Record<PageDef["id"], Cfg>>(() => {
    const out = {} as Record<PageDef["id"], Cfg>;
    for (const p of PAGES) out[p.id] = loadCfg(p);
    return out;
  });
  const page = PAGES.find((p) => p.id === pageId) ?? PAGES[0]!;
  const cfg = cfgs[page.id];
  const onSet = (id: string, v: string | boolean) => {
    setCfgs((prev) => {
      const next = { ...prev, [page.id]: { ...prev[page.id], [id]: v } };
      saveCfg(page, next[page.id]);
      return next;
    });
  };
  const onReset = () => {
    setCfgs((prev) => {
      const next = { ...prev, [page.id]: defaultsOf(page.groups) };
      saveCfg(page, next[page.id]);
      return next;
    });
  };
  const preview = useMemo(
    () =>
      page.id === "workbench" ? (
        <WorkbenchPreview cfg={cfg} />
      ) : page.id === "mini" ? (
        <MiniPreview cfg={cfg} />
      ) : (
        <ExePreview cfg={cfg} />
      ),
    [page.id, cfg],
  );
  return (
    <section aria-label="选配台" data-tour="options-bench">
      <div className="mb-4">
        <h1 className="font-display text-xl font-black leading-7">选配台</h1>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--dim)]">
          把三批调研从 GitHub 千星级工作台、小程序框架和桌面程序里学到的排版布局做法，都做成了能真选的选项：左边选、右边立刻看预览效果，选好的配置存在本机，随时能改回来。这一版先把选配台本身做扎实——选出的配置还不会自动改全站的样子，等你在这里选好、看好了，再定夺往工作台上落哪几项。
        </p>
        <div className="seg mt-3" role="group" aria-label="选配台页面切换（工作台 / 小程序 / exe 程序三个独立页面）">
          {PAGES.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={pageId === p.id}
              onClick={() => setPageId(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs leading-5 text-[var(--dim)]">
          三个页面各自独立：工作台用 px 数值、小程序用 rpx 数值、exe 只选窗口做法，互不套用。数值来源为 2026-11-14 对 26 个 GitHub 仓库的源码调研（星数为当日实测）；其中 Mantis 968 星、Datta Able 175 星未过 1000 星线，用到它们数值的地方都标了出来。
        </p>
      </div>
      <PageShell page={page} cfg={cfg} onSet={onSet} onReset={onReset} preview={preview} />
    </section>
  );
}
