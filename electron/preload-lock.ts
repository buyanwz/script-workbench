// 最小预加载脚本（管理员锁屏视图专用）：只暴露本机管理员锁的四个接口，
// 供 /exe-admin-lock/ 锁屏页调用。绝不暴露聊天 / 工作台接口——锁屏
// 视图在解锁前盖在最上层，它拿到的能力必须最小。
// 注意：这里故意不声明全局 Window.electronAPI——完整 preload.ts 已声明
// 键更多的版本，两处声明同名属性类型不同会被 tsc 判冲突；本文件无人从
// TS 侧消费 window.electronAPI，声明纯属多余，故省略（与 preload-chat.ts 同例）。
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  getAdminLockState: (): Promise<{ set: boolean }> =>
    ipcRenderer.invoke("admin-lock-state"),
  setAdminPassword: (password: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke("admin-set-password", password),
  unlockAdmin: (password: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke("admin-unlock", password),
  getAdminLockFilePath: (): Promise<{ path: string }> =>
    ipcRenderer.invoke("admin-lock-file-path"),
});
