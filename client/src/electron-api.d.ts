// exe 打包版才有的 window.electronAPI（electron/preload.ts 经 contextBridge 注入；
// 网页版 / Muse 版没有它，各调用处先守卫再使用）。
// 类型与 electron/preload.ts 的 UpdateCheckResult 保持一致（两个编译单元分开编译，
// 改一处要同步改另一处）。

export type UpdateCheckResult =
  | { status: "available"; version: string }
  | { status: "up-to-date"; version: string }
  | { status: "error"; error: string }
  | { status: "not-packaged" };

declare global {
  interface Window {
    electronAPI?: {
      restartService: () => Promise<{ ok: boolean }>;
      checkForUpdates: () => Promise<UpdateCheckResult>;
      getAppVersion: () => Promise<string>;
    };
  }
}

export {};
