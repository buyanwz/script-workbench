# script-workbench-port — 剧本创作工作台移植工程

把工作台 v5.69 的源码 1:1 移植到用户自己的服务器上。只一人用，AI 与生图走
Geeknow，数据库不搬（部署后是空的新工作台）。

原版项目介绍见 GitHub 公开仓 `buyanwz/script-workbench` 的 README
（本目录原样复制的源码里也有一份，见 `README.github.md`）。

## 这个目录是什么

移植工程的工作目录：源码 + 新写的自建服务端层（逐步替换原来依赖 Muse 平台
`@hatch/space-sdk` 的部分）。第一阶段只搭架子，不接真实功能。

## 文件来源

- **原样复制（109 个文件）**：来自 `~/workspace/github-upload/script-workbench`
 （与 GitHub 公开仓 `buyanwz/script-workbench` 提交 `36cb2f4f` 的 88 个文本文件一致）。
  另外 21 张封面参照图（`client/src/assets/*.jpg`，约 1.3MB）因 GitHub 上传通道
  只支持 UTF-8 文本文件而未入库，本目录已从正在用的工作台副本
  （`~/workspace/ts-spaces/space-4`，只读复制、未改动原目录）补齐，文件名与
  `coverbench.tsx` / `monitorbench.tsx` 的静态 import 一致，客户端构建不再缺图。
- **本阶段新增（2 个文件）**：
  - `server.ts` — 最小服务端入口骨架：只做到能启动、能返回健康检查，不接任何真实动作。
  - 本文件 `README.md`（原 GitHub 版 README 改名为 `README.github.md` 保留在原处）。

## 还没接的东西（后续阶段，见 port-plan.md）

- 全部约 100 个服务端动作（`server/src/actions.ts`）尚未以 HTTP 路由暴露
- SQLite 数据库尚未按 `drizzle/` 迁移建立（部署时建空库）
- 前端静态文件尚未托管、`@hatch/space-sdk` 引用尚未替换
- 分片上传、文件下载、鉴权、Geeknow Key 配置尚未实现
- Python 图片处理（PIL / ffmpeg / ffprobe）尚未部署

## 跑骨架

```bash
bun server.ts
# 再开一个终端：
curl http://127.0.0.1:3000/health
# 应返回 {"ok":true,"service":"script-workbench-port","version":"v5.69-port-skeleton",...}
```

环境变量：`PORT`（默认 3000）、`HOST`（默认 127.0.0.1）。

## 约束

- 本目录不含任何密钥、Token；Geeknow Key 走环境变量配置，绝不写进文件。
- 不向 GitHub 推送任何东西；所有产出只留在本地。
- 清点与方案见 `~/workspace/goals/goal-3/hidden_files/port-inventory.md`
  与 `port-plan.md`。
