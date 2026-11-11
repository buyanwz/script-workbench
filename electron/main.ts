// Electron 主进程（P1 骨架）— 剧本创作工作台 exe 的壳。
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
import { app, BrowserWindow, ipcMain } from "electron";

// 编译产物所在目录（electron/dist/）；import.meta.url 在 Node 与 Bun 下都可用。
const DIST_DIR = dirname(fileURLToPath(import.meta.url));

const DEFAULT_PORT = 3000;
const HEALTH_TIMEOUT_MS = 30_000;
const HEALTH_POLL_MS = 250;
const SHUTDOWN_TIMEOUT_MS = 5_000;

let serverChild: ChildProcess | null = null;
let serverPort = DEFAULT_PORT;
let mainWindow: BrowserWindow | null = null;
let shuttingDown = false;
let serverCrashed = false;

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
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>服务掉了</title>
<style>body{font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;background:#1a1a1a;color:#eee;margin:0}
div{max-width:420px;text-align:center;padding:24px}button{font-size:16px;padding:10px 24px;cursor:pointer}</style></head>
<body><div><h1>服务掉了</h1><p>工作台的本地服务意外退出了，你的项目数据没有丢（数据存在你电脑上，不在服务进程里）。</p>
<p><button onclick="window.electronAPI.restartService()">点这里重启服务</button></p></div></body></html>`;
  void mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    title: "剧本创作工作台",
    webPreferences: {
      preload: join(DIST_DIR, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  await mainWindow.loadURL(`http://127.0.0.1:${serverPort}/`);
  log("window loaded", `http://127.0.0.1:${serverPort}/`);
  // P1 验收钩子（仅 P1_SCREENSHOT 环境变量开启时）：等首屏渲染后截图、
  // 打印 DOM 证据，然后关窗口（顺带走一遍退出停服务路径）。
  // 正式使用时不设此变量，钩子完全不触发。
  const shotPath = process.env.P1_SCREENSHOT;
  if (shotPath) {
    setTimeout(() => {
      void (async () => {
        try {
          const info = (await mainWindow?.webContents.executeJavaScript(
            `({ title: document.title, rootChildren: document.querySelector('[data-generated-space-root]')?.children.length ?? -1, bodyText: document.body.innerText.slice(0, 400) })`,
          )) as { title: string; rootChildren: number; bodyText: string };
          log("first-screen DOM:", JSON.stringify(info));
          const image = await mainWindow?.webContents.capturePage();
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
    await mainWindow.loadURL(`http://127.0.0.1:${serverPort}/`);
  } else if (mainWindow && !mainWindow.isDestroyed()) {
    showServerDownPage();
  }
}

/** “服务掉了”窗口（服务端拉不起或健康检查超时时用，可点重启）。 */
function createErrorWindow(): void {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 500,
    title: "剧本创作工作台",
    webPreferences: {
      preload: join(DIST_DIR, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  showServerDownPage();
}

async function boot(): Promise<void> {
  await app.whenReady();
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
