// 预加载脚本（P1）：只暴露重启服务一个最小 API，
// 渲染进程拿不到 Node 能力（contextIsolation + sandbox 开启）。
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  restartService: (): Promise<{ ok: boolean }> => ipcRenderer.invoke("restart-service"),
});

declare global {
  interface Window {
    electronAPI: {
      restartService: () => Promise<{ ok: boolean }>;
    };
  }
}
