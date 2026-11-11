// 特权层合约类型文件（P1 手写版，替代原来构建生成的产物）。
//
// 原来由构建流程生成 `server/.generated/privileged.contract.ts`，
// 只导出 `privileged` 合约对象；客户端与服务端都经 `@space/privileged`
// 这个路径别名引用它。本文件直接从源码 re-export，
// 合约内容与 `server/src/privileged.ts` 的 `definePrivilegedContracts`
// 调用完全一致，不存在生成时漂移。

export { privileged } from "../src/privileged";
export type { PrivilegedContractsFor } from "../src/local-sdk";
