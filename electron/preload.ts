// 预加载脚本（P1）：只暴露重启服务一个最小 API，
// 渲染进程拿不到 Node 能力（contextIsolation + sandbox 开启）。
// v1.1.0：加自动更新的三个只读/触发接口（检查更新、取当前版本号）。
// 更新结果的提示框由主进程弹（原生 dialog），渲染进程只管触发与显示状态。
import { contextBridge, ipcRenderer } from "electron";

export type UpdateCheckResult =
  | { status: "available"; version: string }
  | { status: "up-to-date"; version: string }
  | { status: "error"; error: string }
  | { status: "not-packaged" };

contextBridge.exposeInMainWorld("electronAPI", {
  restartService: (): Promise<{ ok: boolean }> => ipcRenderer.invoke("restart-service"),
  checkForUpdates: (): Promise<UpdateCheckResult> =>
    ipcRenderer.invoke("check-for-updates"),
  getAppVersion: (): Promise<string> => ipcRenderer.invoke("get-app-version"),
});

declare global {
  interface Window {
    electronAPI: {
      restartService: () => Promise<{ ok: boolean }>;
      checkForUpdates: () => Promise<UpdateCheckResult>;
      getAppVersion: () => Promise<string>;
    };
  }
}
