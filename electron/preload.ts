// 预加载脚本（P1）：只暴露重启服务一个最小 API，
// 渲染进程拿不到 Node 能力（contextIsolation + sandbox 开启）。
// v1.1.0：加自动更新的三个只读/触发接口（检查更新、取当前版本号）。
// 更新结果的提示框由主进程弹（原生 dialog），渲染进程只管触发与显示状态。
// 左聊天（第一期）：加聊天栏展开/收起两个接口，供左聊天视图调用；
// 工作台视图也加载同一份 preload，多出的接口对工作台无任何影响。
// 拖拽调宽：加聊天栏宽度设置/读取两个接口，供聊天页分界手柄调用。
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
  toggleChat: (expanded: boolean): Promise<{ expanded: boolean }> =>
    ipcRenderer.invoke("chat-set-expanded", expanded),
  getChatExpanded: (): Promise<{ expanded: boolean }> =>
    ipcRenderer.invoke("chat-get-expanded"),
  setChatWidth: (width: number): Promise<{ expanded: boolean; width: number }> =>
    ipcRenderer.invoke("chat-set-width", width),
  getChatWidth: (): Promise<{ expanded: boolean; width: number }> =>
    ipcRenderer.invoke("chat-get-width"),
});

declare global {
  interface Window {
    electronAPI: {
      restartService: () => Promise<{ ok: boolean }>;
      checkForUpdates: () => Promise<UpdateCheckResult>;
      getAppVersion: () => Promise<string>;
      toggleChat: (expanded: boolean) => Promise<{ expanded: boolean }>;
      getChatExpanded: () => Promise<{ expanded: boolean }>;
      setChatWidth: (width: number) => Promise<{ expanded: boolean; width: number }>;
      getChatWidth: () => Promise<{ expanded: boolean; width: number }>;
    };
  }
}
