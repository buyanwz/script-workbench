# 剧本创作工作台（script-workbench）

AI 短剧一站式创作工作台源码：学爆款、写剧本、做分镜、出封面，全流程一次搞定。

当前版本：v5.69（2026-11-10）

## 这是什么

- 五步创作流程：选模式 → 定人物 → 写大纲 → 审剧本 → 做分镜 → 出封面
- 爆款模式学习：基因卡 + 训练记录 + 元素库
- 聊天精修解剖：1:1 复刻爆款视频（台词一字不差核对、分镜表 + 资产清单、一键套用成项目）
- 分镜提示词：Seedance 四档 + MiniMax H3 两版，人物严格锁定、人物—参考图绑定
- 人物资产储存库：性别 + 成年/未成年分类、AI 分析待确认、一键匹配资产图、换装设为主体
- 封面生成：11 款爆款封面风格、参考图选择、封面分析
- 对标账号监控：视频入库、存云端、3 天留存自动清理、发送到聊天解剖
- 生图：参考图锁脸句 + 生成溯源记录

## 技术栈

- 前端：React 19 + Tailwind CSS 4（`client/`）
- 服务端：Bun + TypeScript 动作层（`server/src/actions.ts`，约 100 个动作）
- 数据库：SQLite + Drizzle ORM，迁移在 `drizzle/`（0001–0040）
- 构建：Bun（`bun run build`）

## 来源与现状

本仓库代码原为 Muse 平台上的 TypeScript 全栈应用，直接运行在 Muse 的
Artifact 运行时里，前后端通过 `@hatch/space-sdk` 连接。

**独立部署到自己的服务器时，以下几层需要换成自建实现（不在本次搬运范围内）：**

1. `@hatch/space-sdk` 客户端/服务端调用 → 换成自建 HTTP 服务层（动作接口、文件分片上传、查询客户端）
2. 数据库：首次运行按 `drizzle/` 迁移建空库即可；本仓库不含任何已有数据
3. 图片处理：服务端内嵌 Python 小程序，需 Python + Pillow（PIL）+ ffmpeg / ffprobe
4. AI 分析与生图：走 Geeknow OpenAI 兼容接口（默认 `https://api.geeknow.top`），Key 由部署方自行配置；工作台内有总设置入口可填 API 地址与 Key（Key 只存浏览器本机，不进数据库与备份）
5. 参考图异步提交：经 uguu.se 临时托管换 https 链接再交生图服务商（提交前需用户具名同意）
6. 监控收片：扩展 + Cloudflare Worker 中转站 + 下载器是工作台之外的三件套，不在本仓库内

## 本仓库不含

- 数据库（`app.db`）：按用户要求不搬，部署后是空的新工作台
- 用户图片（人物资产图、封面图等 blobs）
- 任何密钥、Token：代码里不含凭证

## 已知缺口

`client/src/assets/` 下的 21 张封面风格参照图（`cover-ref-*.jpg`、
`monitor-huanxiong-cover.jpg`，共约 1.3MB）因本次上传通道只支持 UTF-8
文本文件，暂未入库。`client/src/coverbench.tsx` 与监控页通过静态 import
引用这些图片，**缺失时客户端构建会失败**。补入方式：把这 21 张图放回
`client/src/assets/`（文件名与 import 一致），或通过 GitHub 网页端直接上传到该目录。

## 许可证

待定。
