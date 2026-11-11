// 本地 ctx（P2）— 替代 SDK 运行时注入的 ctx。
//
// P2 接线完成：
//   - ctx.db：initDataLayer() 建好的 drizzle 单例（bun:sqlite + WAL，
//     启动时已跑完 40 个迁移），不再抛 P2_NOT_IMPLEMENTED。
//   - ctx.blobs：文件系统实现（server/src/blobs-fs.ts），数据落在
//     <dataDir>/blobs/，重启不丢；P1 的内存占位实现已删除。
//   - ctx.inference：P4 已接线（Geeknow chat/completions，见
//     server/src/geeknow.ts）；无 Key 时抛明确的中文“未填 Geeknow
//     Key”错误，不再抛 P4_NOT_IMPLEMENTED。
//   - ctx.executePrivileged：P4 已接线——按 contract.name 在
//     privilegedHandlers.entries 里找 handler 分发；没有对应
//     handler 时抛明确错误，不再抛 P4_NOT_IMPLEMENTED。
//   - ctx.invalidateQueries：本地单机无推送通道，no-op；
//     客户端的 React Query 本来就会在 mutation 后自行 refetch。

import { getDb, initDataLayer } from "./db";
import { initFsBlobs } from "./blobs-fs";
import { geeknowComplete } from "./geeknow";
import type { GeeknowRequestAuth } from "./local-sdk";
import type { Ctx } from "./local-sdk";
import { privilegedHandlers } from "./privileged";

export const P2_NOT_IMPLEMENTED = "P2_NOT_IMPLEMENTED";
export const P4_NOT_IMPLEMENTED = "P4_NOT_IMPLEMENTED";

export class NotImplementedError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "NotImplementedError";
    this.code = code;
  }
}

let invocationCounter = 0;

/**
 * 每次动作调用建一个 ctx（与 SDK 的 per-invocation 语义一致）。
 * auth 可选：服务端从请求头 x-geeknow-api-key / x-geeknow-api-base
 * 取到后传进来，交给 inference 与 executePrivileged 分发；不传时
 * 各自再回落环境变量 GEEKNOW_API_KEY / GEEKNOW_API_BASE。
 */
export function createLocalCtx(auth?: GeeknowRequestAuth): Ctx {
  // server.ts 在监听前已调过 initDataLayer()；这里取单例（重复调回同一份）。
  const layer = initDataLayer();
  const blobs = initFsBlobs(layer.blobsDir);
  return {
    slug: "space-4",
    invocationId: `local-${Date.now()}-${++invocationCounter}`,
    spaceDir: layer.dataDir,
    db: (() => getDb()) as Ctx["db"],
    blobs,
    inference: {
      async complete(prompt, options) {
        return geeknowComplete(prompt, options, auth);
      },
    },
    executePrivileged: (async (contract, args) => {
      const entry = privilegedHandlers.entries.find(
        (e) => e.contract.name === contract.name,
      );
      if (!entry) {
        throw new Error(
          `特权层 ${contract.name} 没有对应的处理程序（未接线），本次调用无法执行`,
        );
      }
      return entry.handler(args, auth);
    }) as Ctx["executePrivileged"],
    emit() {
      // P2 无流式通道，no-op。
    },
    invalidateQueries() {
      // 本地单机无推送通道，no-op（客户端 mutation 后自行 refetch）。
    },
  };
}
