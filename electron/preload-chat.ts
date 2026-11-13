// 最小预加载脚本（左视图专用）：只暴露聊天栏展开/收起与调宽四个接口，
// 供 36px 窄边页点一下展开、以及分界调宽调用。远端页面（muse.ai）与
// 窄边页共用左视图，因此这里绝不暴露 restartService / checkForUpdates /
// getAppVersion——那些只属于右工作台视图的完整 preload.ts。
// 注意：这里故意不声明全局 Window.electronAPI——完整 preload.ts 已声明
// 7 键版，两处声明同名属性类型不同会被 tsc 判冲突；本文件无人从 TS 侧
// 消费 window.electronAPI，声明纯属多余，故省略。
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  toggleChat: (expanded: boolean): Promise<{ expanded: boolean }> =>
    ipcRenderer.invoke("chat-set-expanded", expanded),
  getChatExpanded: (): Promise<{ expanded: boolean }> =>
    ipcRenderer.invoke("chat-get-expanded"),
  setChatWidth: (width: number): Promise<{ expanded: boolean; width: number }> =>
    ipcRenderer.invoke("chat-set-width", width),
  getChatWidth: (): Promise<{ expanded: boolean; width: number }> =>
    ipcRenderer.invoke("chat-get-width"),
});
