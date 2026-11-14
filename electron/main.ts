// Electron 主进程（P1 骨架）— 剧本创作工作台 exe 的壳。
//
// 三视图（左聊天 + 分界条）：主窗口内三个 WebContentsView——左视图
// 收起时加载本地窄边页（/exe-chat-collapsed/，36px 窄边，点一下滑出），
// 展开时直接导航到真正的 muse.ai 网页（顶层导航，不是 iframe；各人登
// 各人的号）；中间一条 8px 分界视图（/exe-chat-divider/，本地极简页，
// 只在展开时可见），按住左右拖动调宽、双击收起/展开——muse.ai 远端
// 页面上没有手柄也没有页内收起按钮，这条分界把拖拽调宽补回来；右视图
// 原样加载工作台（/）。展开宽度默认 380px，可调宽（280–640px，钳制与
// 记忆都在主进程），拖好的宽度记在本机，下次打开还在。工作台视图的 URL 与加载方式与原来完全一致，工作台代码零改动。
// 左视图用默认持久会话（不设 partition），登录态靠 Cookie 跨重启保留；
// 收起时 muse.ai 页面卸载，下次展开重载、凭 Cookie 恢复登录态。
// 真 Muse 够不着本机项目、写不回工作台，分析结果靠手动复制（用户已定）。
// exe 自己的聊天后端（/exe-chat/ 与 /api/chat/*）保留休眠不断链，以便回退，
// 只是左视图不再默认加载它。切工作台页面时聊天视图独立存在，聊天不丢。
//
// 职责（port-plan.md D2）：
//   1. 找一个本机空闲端口（默认 3000，被占则往后顺延）；
//   2. 以子进程拉起服务端（开发期 `bun server.ts`，打包后为
//      resources/ 下的 `bun build --compile` 产物 script-workbench-server.exe），
//      端口与数据目录以环境变量传入；
//   3. 等 /health 通了再开窗口、加载同源前端；
//   4. 服务端崩溃时窗口内显示“服务掉了，点这里重启服务”，不白屏；
//   5. 关窗口/退出时先正常停服务（SIGTERM，等落盘收尾），
//      超时 5 秒未退则强制杀整个进程树（Windows 上 taskkill /T /F），
//      不残留占端口。
//
// 本机 Linux 沙箱验证用 `bun server.ts` 子进程（SERVER_EXE 未设且未打包时）；
// 打包形态默认用 resources/ 下的编译产物（SERVER_EXE 可覆盖），见 p1-report.md。
// v1.0.1 修：打包后默认走内置 exe，不再回落到 spawn("bun")（用户电脑无 Bun 会 ENOENT crash）。
// 数据目录（P2）：默认 %APPDATA%\ScriptWorkbench（Windows）或
// ~/.local/share/ScriptWorkbench（Linux/macOS），与服务端直接跑
// `bun server.ts` 的默认口径一致；DATA_DIR 环境变量可覆盖。

import { spawn, execFile } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { app, BrowserWindow, dialog, ipcMain, Menu, WebContentsView } from "electron";
import type { MenuItemConstructorOptions } from "electron";
import { autoUpdater } from "electron-updater";
import type { UpdateInfo } from "electron-updater";

// 编译产物所在目录（electron/dist/）。
// 注意：import.meta.url 与 __filename 都不能用——Bun 打包会把二者都烤成
// 构建机上的源文件绝对路径（…/electron/main.ts），运行期在别的电脑上根本
// 不存在，导致 preload 路径 ENOENT、渲染进程拿不到 electronAPI（沙箱实测
// 已证实：两个视图都报 Unable to load preload script，window.electronAPI
// 缺失）。改用 Electron 运行期 API + 存在性探测定位，三种启动方式都通：
//  - 开发期 electron electron/dist/main.cjs：getAppPath() = electron/dist；
//  - 开发期 electron .：getAppPath() = 工程根，dist 在 工程根/electron/dist；
//  - 打包后：getAppPath() = resources/app.asar，dist 在 app.asar/electron/dist。
// isPackaged 不可靠（直接跑 electron app.asar 时它是 false），故不以它分流，
// 改为按 preload.cjs 是否存在选目录；两个候选都不存在时回落到打包形态路径，
// 让 Electron 报错可见。
const DIST_DIR = (() => {
  const appPath = app.getAppPath();
  const candidates = [appPath, join(appPath, "electron", "dist")];
  for (const c of candidates) {
    if (existsSync(join(c, "preload.cjs"))) return c;
  }
  return join(appPath, "electron", "dist");
})();

const DEFAULT_PORT = 3000;
const HEALTH_TIMEOUT_MS = 30_000;
const HEALTH_POLL_MS = 250;
const SHUTDOWN_TIMEOUT_MS = 5_000;

// 自动更新（v1.1.0）：electron-updater，更新源 = GitHub Releases
// （见 electron-builder.yml 的 publish 配置，owner buyanwz / repo script-workbench）。
//   - 仅打包版启用（开发态不检查；沙箱 Linux dir / AppImage 构建是打包态，
//     会检查——这正是端到端测试要用的形态）。
//   - 启动后 20 秒检查一次，之后每 6 小时检查一次；设置页可手动检查。
//   - 自动下载；下载完弹原生提示：立即重启更新 / 下次打开时更新（退出时自动装）。
//   - 更新只换程序文件：数据目录（%APPDATA%\ScriptWorkbench 或
//     ~/.local/share/ScriptWorkbench）不在安装包里，卸载重装都不动，更新更不会动。
//   - UPDATE_FEED_URL（沙箱测试专用）：设了就改走通用更新源（本地搭的更新服务器），
//     用于端到端测试；正式发布包里没人设这个变量，走 GitHub Releases。
//   - E2E_UPDATE_TEST=1（沙箱测试专用）：下载完不等用户点提示，直接自动重启安装，
//     用于无人值守的端到端测试；正式使用时不设，走提示框。
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const UPDATE_FIRST_CHECK_DELAY_MS = 20_000;

// 左聊天栏宽度：收起时只留一条窄边（点一下滑出），展开时默认 380px。
// 展开宽度经 IPC 可调，范围钳制在 280–640px；调好的宽度记在
// userData 的 chat-layout.json 里（只存展开宽度一个数），下次打开
// exe 还在。分界视图宽 8px，只在展开时可见，夹在左视图与工作台
// 视图之间；收起时分界视图宽 0（点不中），工作台从 36px 处开始。
const CHAT_COLLAPSED_WIDTH = 36;
const CHAT_DEFAULT_WIDTH = 380;
const CHAT_MIN_WIDTH = 280;
const CHAT_MAX_WIDTH = 640;
const DIVIDER_WIDTH = 8;

let serverChild: ChildProcess | null = null;
let serverPort = DEFAULT_PORT;
let mainWindow: BrowserWindow | null = null;
let chatView: WebContentsView | null = null;
let dividerView: WebContentsView | null = null;
let workView: WebContentsView | null = null;
// 管理员锁屏视图：启动后盖在窗口最上层的全窗口视图（/exe-admin-lock/），
// 工作台/聊天/分界三个视图在解锁前不加载任何 URL；解锁后撤掉它再加载
// 三个视图。shellUnlocked 防重复触发（设密码/输密码两个入口都走它）。
let lockView: WebContentsView | null = null;
let shellUnlocked = false;
let chatExpanded = false;
// 当前展开宽度：启动时从本机记忆文件读回（读不到就用默认 380px），
// 拖拽时更新并立即写回文件；收起/展开切换不改它，窗口 resize 也不改它。
let chatExpandedWidth = CHAT_DEFAULT_WIDTH;
let shuttingDown = false;
let serverCrashed = false;

function log(...args: unknown[]): void {
  console.log(`[electron-main ${new Date().toISOString()}]`, ...args);
}

// 工程根（开发期）或安装包 resources 目录（打包后）：
// 开发期 DIST_DIR 是 electron/dist，往上两级即工程根；若以 electron . 方式
// 启动，getAppPath 本身就是工程根，直接用它；
// 打包后 server.exe 与 client/dist 都放在 resources/ 下（见 electron-builder.yml）。
const BASE_DIR = app.isPackaged
  ? process.resourcesPath
  : existsSync(join(DIST_DIR, "server.ts"))
    ? DIST_DIR
    : join(DIST_DIR, "..", "..");
const CLIENT_DIST_DIR = join(BASE_DIR, "client", "dist");

// preload 脚本路径：按文件名在 DIST_DIR 下找，找不到改从工程根推导；
// 都不存在时仍返回首选，让 Electron 报错可见。完整版（preload.cjs，
// 7 个接口）只给右工作台视图；最小版（preload-chat.cjs，仅聊天栏
// 展开/收起与调宽 4 个接口）只给左视图——远端页面绝不能拿到
// restartService / checkForUpdates / getAppVersion。
function resolvePreloadPath(fileName: string): string {
  const direct = join(DIST_DIR, fileName);
  if (existsSync(direct)) return direct;
  const viaBase = join(BASE_DIR, "electron", "dist", fileName);
  return existsSync(viaBase) ? viaBase : direct;
}
const PRELOAD_PATH = resolvePreloadPath("preload.cjs");
const CHAT_PRELOAD_PATH = resolvePreloadPath("preload-chat.cjs");
const LOCK_PRELOAD_PATH = resolvePreloadPath("preload-lock.cjs");

// 左视图展开时加载的真正 Muse 网页（直接导航，不是 iframe）。
const MUSE_WEB_URL = "https://muse.ai";

/** 左视图当前应加载的地址：展开是 muse.ai，收起是本地窄边页。 */
function chatTargetUrl(expanded: boolean): string {
  return expanded
    ? MUSE_WEB_URL
    : `http://127.0.0.1:${serverPort}/exe-chat-collapsed/`;
}

/** 找空闲端口：从 startPort 起逐个试 bind，第一个能 bind 的即空闲。 */
function findFreePort(startPort: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const tryPort = (port: number): void => {
      const tester = createServer();
      tester.once("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE") {
          tryPort(port + 1);
        } else {
          reject(err);
        }
      });
      tester.once("listening", () => {
        tester.close(() => resolve(port));
      });
      tester.listen(port, "127.0.0.1");
    };
    tryPort(startPort);
  });
}

/** 默认数据目录，与服务端 server/src/db.ts 的 resolveDataDir() 同口径。 */
function resolveDefaultDataDir(): string {
  if (process.platform === "win32") {
    const appData =
      process.env.APPDATA?.trim() || join(homedir(), "AppData", "Roaming");
    return join(appData, "ScriptWorkbench");
  }
  const xdg = process.env.XDG_DATA_HOME?.trim();
  if (xdg) return join(xdg, "ScriptWorkbench");
  return join(homedir(), ".local", "share", "ScriptWorkbench");
}

function startServer(port: number): ChildProcess {
  const env = {
    ...process.env,
    PORT: String(port),
    HOST: "127.0.0.1",
    CLIENT_DIST: process.env.CLIENT_DIST ?? CLIENT_DIST_DIR,
    DATA_DIR: process.env.DATA_DIR?.trim() || resolveDefaultDataDir(),
  };
  // 打包后默认用随安装包一起装好的服务端 exe（resources/script-workbench-server.exe）；
  // SERVER_EXE 环境变量仍保留作覆盖（测试用）。未打包时保持原行为（bun server.ts）。
  // v1.0.0 的 bug：这里只认 SERVER_EXE，安装包里没人设它，于是回落到 spawn("bun")，
  // 用户电脑没装 Bun 就 ENOENT、未捕获异常直接 crash。
  const packaged =
    process.env.SERVER_EXE?.trim() ||
    (app.isPackaged ? join(process.resourcesPath, "script-workbench-server.exe") : "");
  let child: ChildProcess;
  try {
    if (packaged) {
      log("starting packaged server:", packaged, "port", port);
      child = spawn(packaged, [], {
        env,
        detached: process.platform !== "win32",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } else {
      const serverTs = join(BASE_DIR, "server.ts");
      log("starting dev server: bun", serverTs, "port", port);
      child = spawn("bun", [serverTs], {
        env,
        detached: process.platform !== "win32",
        stdio: ["ignore", "pipe", "pipe"],
      });
    }
  } catch (err) {
    // spawn 失败（如 exe 缺失、或开发机无 Bun）：抛给调用方走“服务掉了”页面，不要 crash。
    log("failed to spawn server:", err);
    throw err;
  }
  child.stdout?.on("data", (d: Buffer) => process.stdout.write(`[server] ${d}`));
  child.stderr?.on("data", (d: Buffer) => process.stderr.write(`[server:err] ${d}`));
  child.once("error", (err) => {
    // 异步拉起失败：同样走“服务掉了”页面。
    log("server process error:", err);
    serverChild = null;
    if (!shuttingDown && mainWindow && !mainWindow.isDestroyed()) {
      serverCrashed = true;
      showServerDownPage();
    }
  });
  child.once("exit", (code, signal) => {
    log(`server exited code=${code} signal=${signal} shuttingDown=${shuttingDown}`);
    serverChild = null;
    if (!shuttingDown && mainWindow && !mainWindow.isDestroyed()) {
      serverCrashed = true;
      showServerDownPage();
    }
  });
  return child;
}

async function waitForHealth(port: number): Promise<boolean> {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) {
        const body = (await res.json()) as { ok?: boolean; actions?: number };
        if (body.ok) {
          log(`health ok on ${port} (actions: ${body.actions ?? "?"})`);
          return true;
        }
      }
    } catch {
      // 服务还没起来，继续等。
    }
    await new Promise((r) => setTimeout(r, HEALTH_POLL_MS));
  }
  return false;
}

function showServerDownPage(): void {
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>服务掉了</title>
<style>body{font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;background:#1a1a1a;color:#eee;margin:0}
div{max-width:420px;text-align:center;padding:24px}button{font-size:16px;padding:10px 24px;cursor:pointer}</style></head>
<body><div><h1>服务掉了</h1><p>工作台的本地服务意外退出了，你的项目数据没有丢（数据存在你电脑上，不在服务进程里）。</p>
<p><button onclick="window.electronAPI.restartService()">点这里重启服务</button></p></div></body></html>`;
  const url = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
  // 三视图形态下错误页进工作台视图（它有 preload，重启按钮可用）；
  // 无视图的兜底窗口则沿用原来的窗口级加载。
  if (workView && !workView.webContents.isDestroyed()) {
    void workView.webContents.loadURL(url);
    return;
  }
  if (!mainWindow || mainWindow.isDestroyed()) return;
  void mainWindow.loadURL(url);
}

/** 展开宽度记忆文件：userData 目录下的 chat-layout.json（只存一个数）。 */
function chatLayoutFilePath(): string {
  return join(app.getPath("userData"), "chat-layout.json");
}

function clampChatWidth(width: number): number {
  if (!Number.isFinite(width)) return CHAT_DEFAULT_WIDTH;
  return Math.min(CHAT_MAX_WIDTH, Math.max(CHAT_MIN_WIDTH, Math.round(width)));
}

/** 启动时读回上次拖好的宽度；文件不存在或内容不对就用默认 380px。 */
function loadChatExpandedWidth(): number {
  try {
    const parsed = JSON.parse(
      readFileSync(chatLayoutFilePath(), "utf-8"),
    ) as { expandedWidth?: unknown };
    if (typeof parsed.expandedWidth === "number") {
      return clampChatWidth(parsed.expandedWidth);
    }
  } catch {
    // 首次打开或文件损坏：用默认值，不报错打扰。
  }
  return CHAT_DEFAULT_WIDTH;
}

function saveChatExpandedWidth(width: number): void {
  try {
    const file = chatLayoutFilePath();
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ expandedWidth: width }), "utf-8");
  } catch (err) {
    log("failed to save chat width:", err);
  }
}

// ── 本机管理员锁（只锁这台电脑上的这份软件；真正“全网只有你能用”要等
// 服务器核验，见 p7 一期设计，本次不做服务器、不做邀请码、不做同步）──
// 锁文件在 userData 目录下的 admin-lock.json（不放 DATA_DIR，别让它进
// 项目备份），内容只有版本号、算法名、盐与哈希，没有密码明文；
// 写文件尽量 0600 权限。密码与哈希永不进日志。
const ADMIN_LOCK_MIN_PASSWORD_LENGTH = 6;
const ADMIN_LOCK_UNLOCK_DELAY_MS = 600;

interface AdminLockFile {
  version: 1;
  algo: "scrypt";
  salt: string;
  hash: string;
  createdAt: string;
}

function adminLockFilePath(): string {
  return join(app.getPath("userData"), "admin-lock.json");
}

function readAdminLock(): AdminLockFile | null {
  try {
    const parsed = JSON.parse(
      readFileSync(adminLockFilePath(), "utf-8"),
    ) as Partial<AdminLockFile>;
    if (
      parsed.version !== 1 ||
      parsed.algo !== "scrypt" ||
      typeof parsed.salt !== "string" ||
      typeof parsed.hash !== "string"
    ) {
      return null;
    }
    return parsed as AdminLockFile;
  } catch {
    return null;
  }
}

function hashAdminPassword(password: string, saltHex: string): Buffer {
  return scryptSync(password, Buffer.from(saltHex, "hex"), 64, {
    N: 16384,
    r: 8,
    p: 1,
  });
}

function verifyAdminPassword(password: string, lock: AdminLockFile): boolean {
  try {
    const expected = Buffer.from(lock.hash, "hex");
    const actual = hashAdminPassword(password, lock.salt);
    if (expected.length !== actual.length) return false;
    return timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

type AdminLockResult = { ok: boolean; error?: string };

/** 首次设密码：仅当未设锁时可设；密码至少 6 位。成功写锁文件。 */
function setAdminPassword(password: string): AdminLockResult {
  if (readAdminLock()) {
    return { ok: false, error: "已经设过密码了，请直接登录。" };
  }
  if (typeof password !== "string" || password.length < ADMIN_LOCK_MIN_PASSWORD_LENGTH) {
    return { ok: false, error: "密码至少 6 位，再想一个长一点的。" };
  }
  const salt = randomBytes(16).toString("hex");
  const hash = hashAdminPassword(password, salt).toString("hex");
  const file: AdminLockFile = {
    version: 1,
    algo: "scrypt",
    salt,
    hash,
    createdAt: new Date().toISOString(),
  };
  try {
    const path = adminLockFilePath();
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(file), { encoding: "utf-8", mode: 0o600 });
    try {
      chmodSync(path, 0o600);
    } catch {
      // 已有文件时写模式不生效、chmod 在个别系统上也可能失败：不挡设密码，
      // 锁文件本身不含明文，权限只是纵深。
    }
  } catch (err) {
    log("failed to save admin lock:", err);
    return { ok: false, error: "没能设好密码，再试一次。" };
  }
  log("admin lock set");
  return { ok: true };
}

/** 输密码解锁：验对返回 ok；验错先等约 600ms 再回（防猜）。 */
async function unlockAdmin(password: string): Promise<AdminLockResult> {
  const lock = readAdminLock();
  if (!lock) {
    return { ok: false, error: "还没设密码，请先设定一个密码。" };
  }
  if (typeof password !== "string" || !verifyAdminPassword(password, lock)) {
    await new Promise((r) => setTimeout(r, ADMIN_LOCK_UNLOCK_DELAY_MS));
    return { ok: false, error: "密码不对，再试一次。" };
  }
  return { ok: true };
}

/** 按当前展开状态排三个视图：左聊天栏 + 8px 分界条 + 右工作台，窗口
 *  resize 时重排。展开时分界条贴在左视图右缘，工作台从分界条右侧
 *  开始；收起时分界条宽 0（不可见、点不中），工作台从 36px 窄边处开始。 */
function layoutViews(): void {
  if (!mainWindow || mainWindow.isDestroyed() || !chatView || !dividerView || !workView) return;
  const bounds = mainWindow.getContentBounds();
  const chatWidth = chatExpanded ? chatExpandedWidth : CHAT_COLLAPSED_WIDTH;
  const dividerWidth = chatExpanded ? DIVIDER_WIDTH : 0;
  chatView.setBounds({ x: 0, y: 0, width: chatWidth, height: bounds.height });
  dividerView.setBounds({
    x: chatWidth,
    y: 0,
    width: dividerWidth,
    height: bounds.height,
  });
  workView.setBounds({
    x: chatWidth + dividerWidth,
    y: 0,
    width: Math.max(0, bounds.width - chatWidth - dividerWidth),
    height: bounds.height,
  });
  // 锁屏视图在时盖满整个窗口（在最上层，窗口 resize 也重排它）。
  if (lockView && !lockView.webContents.isDestroyed()) {
    lockView.setBounds({ x: 0, y: 0, width: bounds.width, height: bounds.height });
  }
}

function setChatExpanded(expanded: boolean): { expanded: boolean } {
  const changed = expanded !== chatExpanded;
  chatExpanded = expanded;
  layoutViews();
  // 状态真变了才换左视图地址：展开加载 muse.ai，收起切回本地窄边页
  // （muse.ai 页面随之卸载，登录态靠默认会话的 Cookie 保留，下次展开
  // 重载恢复）。重复点同一状态不重复加载，避免把正在聊的页面刷掉。
  if (changed && chatView && !chatView.webContents.isDestroyed()) {
    chatView.webContents.loadURL(chatTargetUrl(expanded)).catch((err: unknown) => {
      log("chat view failed to load:", err instanceof Error ? err.message : err);
    });
  }
  return { expanded: chatExpanded };
}

/** 调宽：钳制到 280–640px，立即记到本机文件，下次打开还在。
 *  收起时只记宽度、不改当前窄边。
 *  非数字入参直接忽略，返回当前状态，不改任何东西。 */
function setChatWidth(width: unknown): { expanded: boolean; width: number } {
  if (typeof width !== "number" || !Number.isFinite(width)) {
    return { expanded: chatExpanded, width: chatExpandedWidth };
  }
  const clamped = clampChatWidth(width);
  if (clamped !== chatExpandedWidth) {
    chatExpandedWidth = clamped;
    saveChatExpandedWidth(clamped);
  }
  layoutViews();
  return { expanded: chatExpanded, width: chatExpandedWidth };
}

/** 建三视图壳窗口（三个视图隔离配置与原来一致；preload 分开：左视图
 *  与分界视图只拿最小版，右工作台视图拿完整版。三个视图都不设
 *  partition，走默认持久会话，muse.ai 的登录 Cookie 能跨重启保留；
 *  不改 userAgent，不加任何证书绕过）。 */
function createShellWindow(width: number, height: number): void {
  mainWindow = new BrowserWindow({
    width,
    height,
    title: "剧本创作工作台",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  const chatPreferences = {
    preload: CHAT_PRELOAD_PATH,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
  };
  const workPreferences = {
    preload: PRELOAD_PATH,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
  };
  chatView = new WebContentsView({ webPreferences: chatPreferences });
  dividerView = new WebContentsView({ webPreferences: chatPreferences });
  workView = new WebContentsView({ webPreferences: workPreferences });
  mainWindow.contentView.addChildView(chatView);
  mainWindow.contentView.addChildView(workView);
  mainWindow.contentView.addChildView(dividerView);
  mainWindow.on("resize", layoutViews);
  mainWindow.on("closed", () => {
    mainWindow = null;
    chatView = null;
    dividerView = null;
    workView = null;
    lockView = null;
    shellUnlocked = false;
  });
  layoutViews();
}

/** 建锁屏视图并盖在窗口最上层：启动后先盖它，工作台/聊天/分界三个
 *  视图在解锁前不加载任何 URL。锁屏页用最小 preload（preload-lock），
 *  只拿本机锁四个接口。 */
function createLockView(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  lockView = new WebContentsView({
    webPreferences: {
      preload: LOCK_PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.contentView.addChildView(lockView);
  layoutViews();
  lockView.webContents.loadURL(`http://127.0.0.1:${serverPort}/exe-admin-lock/`).catch((err: unknown) => {
    log("lock view failed to load:", err instanceof Error ? err.message : err);
  });
}

/** 解锁成功后由验过密码的 IPC 处理器调用（不另设 admin-lock-done 接口）：
 *  撤掉锁屏视图、按原有顺序加载三个视图 URL。shellUnlocked 守卫防重复触发。 */
async function unlockShell(): Promise<void> {
  if (shellUnlocked) return;
  shellUnlocked = true;
  if (lockView) {
    const view = lockView;
    lockView = null;
    try {
      mainWindow?.contentView.removeChildView(view);
    } catch {
      // 窗口已关，无事可做。
    }
    // 不再持有引用，视图随 GC 回收（WebContentsView 没有 destroy 方法）。
  }
  try {
    await loadMainViews();
  } catch (err) {
    // 三视图加载失败（如服务刚好掉了）：只记日志，锁已撤，不再挡住窗口；
    // 服务掉了的兜底仍走原有的 showServerDownPage 路径。
    log("failed to load main views after unlock:", err instanceof Error ? err.message : err);
  }
}

/** 按原有顺序加载三个视图 URL（工作台 + 收起态聊天窄边页 + 分界条）。 */
async function loadMainViews(): Promise<void> {
  if (!workView || !chatView || !dividerView) return;
  await workView.webContents.loadURL(`http://127.0.0.1:${serverPort}/`);
  await chatView.webContents.loadURL(chatTargetUrl(false));
  await dividerView.webContents.loadURL(`http://127.0.0.1:${serverPort}/exe-chat-divider/`);
  log("window loaded", `http://127.0.0.1:${serverPort}/`, "+ chat view /exe-chat-collapsed/ (collapsed) + divider view /exe-chat-divider/");
  // P1 验收钩子（仅 P1_SCREENSHOT 环境变量开启时）：等首屏渲染后截图、
  // 打印 DOM 证据，然后关窗口（顺带走一遍退出停服务路径）。
  // 正式使用时不设此变量，钩子完全不触发。
  const shotPath = process.env.P1_SCREENSHOT;
  if (shotPath) {
    setTimeout(() => {
      void (async () => {
        try {
          const info = (await workView?.webContents.executeJavaScript(
            `({ title: document.title, rootChildren: document.querySelector('[data-generated-space-root]')?.children.length ?? -1, bodyText: document.body.innerText.slice(0, 400) })`,
          )) as { title: string; rootChildren: number; bodyText: string };
          log("first-screen DOM:", JSON.stringify(info));
          const image = await workView?.webContents.capturePage();
          if (image) {
            const { writeFileSync } = await import("node:fs");
            writeFileSync(shotPath, image.toPNG());
            log("screenshot saved:", shotPath, `${image.getSize().width}x${image.getSize().height}`);
          }
        } catch (e) {
          log("screenshot hook failed:", e);
        } finally {
          mainWindow?.close();
        }
      })();
    }, 6000);
  }
}

/** 正常停服务：先 SIGTERM 等收尾，超时则杀整个进程树。 */
async function stopServer(): Promise<void> {
  const child = serverChild;
  if (!child || child.exitCode !== null) return;
  serverChild = null;
  const pid = child.pid;
  log(`stopping server pid=${pid} (SIGTERM, ${SHUTDOWN_TIMEOUT_MS}ms grace)`);
  child.kill("SIGTERM");
  const exited = await new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), SHUTDOWN_TIMEOUT_MS);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
  if (exited) {
    log("server stopped gracefully");
    return;
  }
  log("server did not stop in time, killing process tree");
  await killProcessTree(pid);
}

async function killProcessTree(pid: number | undefined): Promise<void> {
  if (pid === undefined) return;
  if (process.platform === "win32") {
    // Windows：taskkill /T 杀整个进程树（只杀父进程会残留 Bun 服务与 Python 子进程占端口）。
    await new Promise<void>((resolve) => {
      execFile("taskkill", ["/pid", String(pid), "/T", "/F"], () => resolve());
    });
    return;
  }
  try {
    // POSIX：子进程以 detached 方式启动，自成进程组，负 pid 杀整组。
    process.kill(-pid, "SIGKILL");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // 已退出，无事可做。
    }
  }
}

async function restartService(): Promise<void> {
  if (shuttingDown) return;
  log("restarting server on user request");
  await stopServer();
  serverCrashed = false;
  try {
    serverChild = startServer(serverPort);
  } catch (err) {
    log("server failed to restart:", err);
    if (mainWindow && !mainWindow.isDestroyed()) showServerDownPage();
    return;
  }
  const ok = await waitForHealth(serverPort);
  if (ok && mainWindow && !mainWindow.isDestroyed()) {
    if (workView && chatView) {
      await workView.webContents.loadURL(`http://127.0.0.1:${serverPort}/`);
      await chatView.webContents.loadURL(chatTargetUrl(chatExpanded));
      // 服务重启后分界视图也重载一次（它的页面同样由本服务托管），
      // 否则展开时分界条是空白页、拖不动。
      if (dividerView && !dividerView.webContents.isDestroyed()) {
        await dividerView.webContents.loadURL(`http://127.0.0.1:${serverPort}/exe-chat-divider/`);
      }
    } else {
      await mainWindow.loadURL(`http://127.0.0.1:${serverPort}/`);
    }
  } else if (mainWindow && !mainWindow.isDestroyed()) {
    showServerDownPage();
  }
}

/** “服务掉了”窗口（服务端拉不起或健康检查超时时用，可点重启）。 */
function createErrorWindow(): void {
  createShellWindow(800, 500);
  showServerDownPage();
}

/** 下载完弹的提示：立即重启更新 / 下次打开时更新。 */
async function showUpdateDownloadedDialog(version: string): Promise<void> {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: "info",
    title: "新版本已下载好",
    message: `剧本创作工作台 ${version} 已下载好`,
    detail:
      "现在重启就换成新版本；选“下次打开时更新”，下次退出软件时自动装上。你的项目数据不受影响。",
    buttons: ["立即重启更新", "下次打开时更新"],
    defaultId: 0,
    cancelId: 1,
  });
  if (response === 0) {
    autoUpdater.quitAndInstall(false, true);
  }
  // response === 1：什么都不做，退出时自动装（autoInstallOnAppQuit）。
}

/** 自动更新总开关：仅打包版启用；后台检查出错只记日志，不弹框打扰。 */
function setupAutoUpdater(): void {
  if (!app.isPackaged) {
    log("auto-update disabled (not packaged)");
    return;
  }
  // 沙箱测试专用：改走本地更新源（正式发布包里没人设这个变量）。
  const feedUrl = process.env.UPDATE_FEED_URL?.trim();
  if (feedUrl) {
    log("auto-update test feed:", feedUrl);
    autoUpdater.setFeedURL({ provider: "generic", url: feedUrl });
  }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;
  autoUpdater.logger = {
    info: (msg: unknown) => log("[updater]", msg),
    warn: (msg: unknown) => log("[updater:warn]", msg),
    error: (msg: unknown) => log("[updater:error]", msg),
    debug: (msg: unknown) => log("[updater:debug]", msg),
  };
  autoUpdater.on("checking-for-update", () => log("[updater] checking for update"));
  autoUpdater.on("update-available", (info: UpdateInfo) => {
    log("[updater] update available:", info.version);
  });
  autoUpdater.on("update-not-available", (info: UpdateInfo) => {
    log("[updater] up to date:", info.version);
  });
  autoUpdater.on("download-progress", (p) => {
    log(`[updater] download ${Math.round(p.percent)}% (${p.transferred}/${p.total})`);
  });
  autoUpdater.on("update-downloaded", (info: UpdateInfo) => {
    log("[updater] update downloaded:", info.version);
    if (process.env.E2E_UPDATE_TEST === "1") {
      // 沙箱无人值守测试：模拟用户点“立即重启更新”。
      log("[updater] E2E test: auto quitAndInstall");
      setTimeout(() => autoUpdater.quitAndInstall(false, true), 2000);
      return;
    }
    void showUpdateDownloadedDialog(info.version);
  });
  autoUpdater.on("error", (err: Error) => {
    // 后台检查出错（断网、更新源 404 等）：只记日志；
    // 手动检查的错误由 check-for-updates 的返回值带回设置页显示。
    log("[updater] error:", err?.message ?? err);
  });
  const check = () => {
    void autoUpdater.checkForUpdates().catch((err: unknown) => {
      log("[updater] check failed:", err instanceof Error ? err.message : err);
    });
  };
  setTimeout(check, UPDATE_FIRST_CHECK_DELAY_MS);
  const timer = setInterval(check, UPDATE_CHECK_INTERVAL_MS);
  app.on("before-quit", () => clearInterval(timer));
}

/** 中文应用菜单（v1.1.1）：Electron 默认菜单是英文 File / Edit / View / Window，
 *  这里全部换成中文。编辑／视图／窗口里的操作直接用 Electron 内置 role
 *  （行为与快捷键都原样保留，只改显示文字）；「检查更新」走与设置页
 *  同一套检查逻辑，「关于」弹中文对话框。 */
function setupApplicationMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    {
      label: "文件",
      submenu: [{ label: "退出", role: "quit" }],
    },
    {
      label: "编辑",
      submenu: [
        { label: "撤销", role: "undo" },
        { label: "重做", role: "redo" },
        { type: "separator" },
        { label: "剪切", role: "cut" },
        { label: "复制", role: "copy" },
        { label: "粘贴", role: "paste" },
        { label: "全选", role: "selectAll" },
      ],
    },
    {
      label: "视图",
      submenu: [
        {
          label: "聊天栏展开/收起",
          click: () => {
            setChatExpanded(!chatExpanded);
          },
        },
        { type: "separator" },
        { label: "重新加载", role: "reload" },
        { label: "强制重新加载", role: "forceReload" },
        { label: "切换开发者工具", role: "toggleDevTools" },
        { type: "separator" },
        { label: "放大", role: "zoomIn" },
        { label: "缩小", role: "zoomOut" },
        { label: "实际大小", role: "resetZoom" },
        { type: "separator" },
        { label: "切换全屏", role: "togglefullscreen" },
      ],
    },
    {
      label: "窗口",
      submenu: [
        { label: "最小化", role: "minimize" },
        { label: "关闭", role: "close" },
      ],
    },
    {
      label: "帮助",
      submenu: [
        {
          label: "检查更新",
          click: () => {
            void checkForUpdatesManually();
          },
        },
        { type: "separator" },
        {
          label: "关于",
          click: () => {
            if (!mainWindow || mainWindow.isDestroyed()) return;
            void dialog.showMessageBox(mainWindow, {
              type: "info",
              title: "关于",
              message: "剧本创作工作台",
              detail: `版本 ${app.getVersion()}\n本地运行的 AI 短剧剧本工作台。`,
            });
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  log(
    "application menu:",
    template.map((item) => item.label).join(" / "),
  );
}

async function boot(): Promise<void> {
  await app.whenReady();
  chatExpandedWidth = loadChatExpandedWidth();
  setupApplicationMenu();
  setupAutoUpdater();
  serverPort = await findFreePort(
    Number(process.env.PORT ?? DEFAULT_PORT),
  );
  try {
    serverChild = startServer(serverPort);
  } catch (err) {
    // 服务根本拉不起来：直接开“服务掉了”窗口（可点重启），不要 crash。
    log("server failed to start:", err);
    createErrorWindow();
    return;
  }
  const ok = await waitForHealth(serverPort);
  if (!ok) {
    log("server did not become healthy in time; showing error page");
    createErrorWindow();
    return;
  }
  // 服务健康后先建壳窗口、再盖全窗口锁屏；三个视图等解锁成功后再加载。
  createShellWindow(1280, 860);
  createLockView();
}

ipcMain.handle("restart-service", async () => {
  await restartService();
  return { ok: !serverCrashed };
});

// 左聊天栏展开/收起（聊天视图经 preload 调用；工作台视图不受影响）。
ipcMain.handle("chat-set-expanded", (_event, expanded: unknown) =>
  setChatExpanded(expanded === true),
);
ipcMain.handle("chat-get-expanded", () => ({ expanded: chatExpanded }));

// 左聊天栏调宽（经最小 preload 调用；钳制与记忆都在主进程做）。
ipcMain.handle("chat-set-width", (_event, width: unknown) => setChatWidth(width));
ipcMain.handle("chat-get-width", () => ({
  expanded: chatExpanded,
  width: chatExpandedWidth,
}));

// 本机管理员锁（锁屏视图经最小 preload 调用；解锁过渡必须由验过密码的
// 处理器直接驱动——设密码/输密码成功就在这里撤锁屏、加载三视图，
// 页面只拿 {ok} 做界面反馈，不另设 admin-lock-done 接口）。
ipcMain.handle("admin-lock-state", () => ({ set: readAdminLock() !== null }));
ipcMain.handle("admin-set-password", async (_event, password: unknown) => {
  const result = setAdminPassword(typeof password === "string" ? password : "");
  // 先把 {ok} 回给锁屏页（让它显示“正在进入…”），再撤锁屏、加载三视图：
  // 若先撤视图再回包，渲染进程已销毁、回包永远到不了页面。
  if (result.ok) void unlockShell();
  return result;
});
ipcMain.handle("admin-unlock", async (_event, password: unknown) => {
  const result = await unlockAdmin(typeof password === "string" ? password : "");
  if (result.ok) void unlockShell();
  return result;
});
ipcMain.handle("admin-lock-file-path", () => ({ path: adminLockFilePath() }));

// 自动更新（v1.1.0）：设置页手动检查；结果回设置页显示，下载完由
// update-downloaded 事件弹原生提示（见 setupAutoUpdater）。
type UpdateCheckOutcome =
  | { status: "available"; version: string }
  | { status: "up-to-date"; version: string }
  | { status: "error"; error: string }
  | { status: "not-packaged" };

/** 查一次更新（设置页手动检查与菜单「检查更新」共用；只查不弹框）。 */
async function checkForUpdatesOnce(): Promise<UpdateCheckOutcome> {
  if (!app.isPackaged) return { status: "not-packaged" };
  try {
    const result = await autoUpdater.checkForUpdates();
    const latest = result?.updateInfo?.version ?? "";
    const current = app.getVersion();
    if (latest && latest !== current) {
      return { status: "available", version: latest };
    }
    return { status: "up-to-date", version: current };
  } catch (err) {
    return {
      status: "error",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** 菜单「帮助 → 检查更新」：查完用中文对话框告诉用户结果。 */
async function checkForUpdatesManually(): Promise<void> {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const outcome = await checkForUpdatesOnce();
  if (outcome.status === "not-packaged") {
    await dialog.showMessageBox(mainWindow, {
      type: "info",
      title: "检查更新",
      message: "当前是开发版，无法检查更新。",
      buttons: ["知道了"],
    });
    return;
  }
  if (outcome.status === "available") {
    await dialog.showMessageBox(mainWindow, {
      type: "info",
      title: "发现新版本",
      message: `发现新版本 ${outcome.version}，正在后台下载`,
      detail:
        "下载完会提示你重启更新；也可以下次退出软件时自动装上。你的项目数据不受影响。",
      buttons: ["知道了"],
    });
    return;
  }
  if (outcome.status === "up-to-date") {
    await dialog.showMessageBox(mainWindow, {
      type: "info",
      title: "检查更新",
      message: `已经是最新版本（当前版本 ${outcome.version}）。`,
      buttons: ["知道了"],
    });
    return;
  }
  await dialog.showMessageBox(mainWindow, {
    type: "warning",
    title: "检查更新失败",
    message: "检查更新失败",
    detail: `${outcome.error}。请检查网络后重试，也可以在生图面板的「软件更新」里再试一次。`,
    buttons: ["知道了"],
  });
}

ipcMain.handle("check-for-updates", async () => checkForUpdatesOnce());

ipcMain.handle("get-app-version", () => app.getVersion());

app.on("window-all-closed", () => {
  // 本应用只有一个窗口：窗口关了就退出（macOS 也不留后台）。
  void (async () => {
    shuttingDown = true;
    await stopServer();
    app.quit();
  })();
});

app.on("before-quit", () => {
  shuttingDown = true;
});

void boot();
