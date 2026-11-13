// Electron 主进程（P1 骨架）— 剧本创作工作台 exe 的壳。
//
// 双视图（左聊天第一期）：主窗口内两个 WebContentsView——左视图加载
// exe 专属聊天页（/exe-chat/），右视图原样加载工作台（/）。默认左视图
// 收成 36px 窄边，点小边滑出到 380px，点收起回到窄边；工作台视图的
// URL 与加载方式与原来完全一致，工作台代码零改动。切工作台页面时
// 聊天视图独立存在，聊天不丢。
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
import { createServer } from "node:net";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, dialog, ipcMain, Menu, WebContentsView } from "electron";
import type { MenuItemConstructorOptions } from "electron";
import { autoUpdater } from "electron-updater";
import type { UpdateInfo } from "electron-updater";

// 编译产物所在目录（electron/dist/）；import.meta.url 在 Node 与 Bun 下都可用。
const DIST_DIR = dirname(fileURLToPath(import.meta.url));

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

let serverChild: ChildProcess | null = null;
let serverPort = DEFAULT_PORT;
let mainWindow: BrowserWindow | null = null;
let chatView: WebContentsView | null = null;
let workView: WebContentsView | null = null;
let chatExpanded = false;
let shuttingDown = false;
let serverCrashed = false;

// 左聊天栏宽度：收起时只留一条窄边（点一下滑出），展开时 380px。
const CHAT_COLLAPSED_WIDTH = 36;
const CHAT_EXPANDED_WIDTH = 380;

function log(...args: unknown[]): void {
  console.log(`[electron-main ${new Date().toISOString()}]`, ...args);
}

// 工程根（开发期）或安装包 resources 目录（打包后）：
// 开发期 main.js 编译到 electron/dist/，往上一级即工程根；
// 打包后 server.exe 与 client/dist 都放在 resources/ 下（见 electron-builder.yml）。
const BASE_DIR = app.isPackaged ? process.resourcesPath : join(DIST_DIR, "..");
const CLIENT_DIST_DIR = join(BASE_DIR, "client", "dist");

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
  // 双视图形态下错误页进工作台视图（它有 preload，重启按钮可用）；
  // 无视图的兜底窗口则沿用原来的窗口级加载。
  if (workView && !workView.webContents.isDestroyed()) {
    void workView.webContents.loadURL(url);
    return;
  }
  if (!mainWindow || mainWindow.isDestroyed()) return;
  void mainWindow.loadURL(url);
}

/** 按当前展开状态排两个视图：左聊天栏 + 右工作台，窗口 resize 时重排。 */
function layoutViews(): void {
  if (!mainWindow || mainWindow.isDestroyed() || !chatView || !workView) return;
  const bounds = mainWindow.getContentBounds();
  const chatWidth = chatExpanded ? CHAT_EXPANDED_WIDTH : CHAT_COLLAPSED_WIDTH;
  chatView.setBounds({ x: 0, y: 0, width: chatWidth, height: bounds.height });
  workView.setBounds({
    x: chatWidth,
    y: 0,
    width: Math.max(0, bounds.width - chatWidth),
    height: bounds.height,
  });
}

function setChatExpanded(expanded: boolean): { expanded: boolean } {
  chatExpanded = expanded;
  layoutViews();
  return { expanded: chatExpanded };
}

/** 建双视图壳窗口（两个视图共用同一份 preload，隔离配置与原来一致）。 */
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
  const viewPreferences = {
    preload: join(DIST_DIR, "preload.cjs"),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
  };
  chatView = new WebContentsView({ webPreferences: viewPreferences });
  workView = new WebContentsView({ webPreferences: viewPreferences });
  mainWindow.contentView.addChildView(chatView);
  mainWindow.contentView.addChildView(workView);
  mainWindow.on("resize", layoutViews);
  mainWindow.on("closed", () => {
    mainWindow = null;
    chatView = null;
    workView = null;
  });
  layoutViews();
}

async function createWindow(): Promise<void> {
  createShellWindow(1280, 860);
  if (!workView || !chatView) return;
  await workView.webContents.loadURL(`http://127.0.0.1:${serverPort}/`);
  await chatView.webContents.loadURL(`http://127.0.0.1:${serverPort}/exe-chat/`);
  log("window loaded", `http://127.0.0.1:${serverPort}/`, "+ chat view /exe-chat/");
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
      await chatView.webContents.loadURL(`http://127.0.0.1:${serverPort}/exe-chat/`);
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
  await createWindow();
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
