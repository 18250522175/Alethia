# Alethia v5.0 认知共生版 · 全栈构建 Spec

## Why
现有项目仅有两份设计文档（架构 v5.0 与 Web 前端 v1.1）和一份占位 README，缺少任何可运行代码。需要一次性构建出可 `docker-compose up` 直接启动的全栈应用：Bun + TypeScript 后端 BrainAPI、React + Vite 前端、十家国内大模型适配器、PostgreSQL + pgvector 数据层与一键化部署脚本，使核心认知共生闭环（摄入 → 提取 → 审核 → 图谱演化 → 问答反馈）端到端可点击、可交互。

## What Changes
- 新增 `server/` 全后端：Bun + TypeScript 实现 L0.5 BrainAPI 统一服务层全部接口、L1 Agent 编排、L2 混合检索、L4 自进化引擎、L5 存储、L6 多模态摄入、Bearer Token 认证、全汉化提示词与日志。
- 新增 `server/src/llm/adapters/` 统一 `LLMAdapter` 接口与十家国内厂商适配器（阿里百炼、智谱、Kimi/Moonshot、百度文心、讯飞星火、腾讯混元、MiniMax、DeepSeek、零一、百川）。
- 新增 `web/` 全前端：React + Vite + TypeScript + Tailwind + react-i18next，实现设计文档第 2 章全部路由与页面（首页、条目、图谱、Diff 审核、共生问答、仪表盘、变更面板、影子评估、时间线、搜索、文件预览、设置、登录、引导）。
- 新增无代码设置驾驶舱：外观 / 通用 / 语言 / 预算 / 安全 / 隐私 / 任务 / 路径 / 集成 / 实验 共 9 组卡片，模型分配采用拖拽，所有配置经 `PATCH /api/settings` 落库，无需编辑任何文件。
- 新增前后端共享类型层 `shared/`，全栈 TypeScript 类型对齐。
- 新增 `docker-compose.yml`：PostgreSQL 16 + pgvector、后端 BrainAPI、前端 Nginx 静态服务三容器。
- 新增 `init.sh`：检查 Docker、复制 `.env.example`、提示填 API Key、启动服务、执行数据库初始化与索引重建。
- 新增 `.env.example` 模板，包含全部必填项（DB、API Key、模型密钥等）。
- 更新 `README.md`：项目简介、架构图、快速开始、环境变量说明。
- 全部系统提示词、错误消息、日志默认为汉语（全汉化策略）。
- **BREAKING**：从空仓库直接建立完整工程结构，无旧实现兼容包袱。

## Impact
- 受影响设计文档：《理想 AI 知识库融合架构 v5.0》（全部 L0–L8 层）、《Web 前端界面设计文档 v1.1》（全部 13 章路由与组件）。
- 受影响代码（新增）：
  - `server/src/{brainapi,agents,retrieval,evolution,storage,ingest,auth,llm,config,cli,mcp,i18n}/`
  - `server/src/db/migrations/*.sql`、`server/src/db/dao/*.ts`
  - `web/src/{routes,layouts,features,blocks,ui,store,hooks,i18n,lib}/`
  - `shared/types/*.ts`
  - 根级 `docker-compose.yml`、`init.sh`、`.env.example`、`Dockerfile.server`、`Dockerfile.web`、`nginx.conf`。

## ADDED Requirements

### Requirement: 后端 BrainAPI 统一服务层（L0.5）
系统 SHALL 完整实现架构文档 4.2 节列出的全部 BrainAPI 接口，至少包括：
`extractFacts`、`applyDiff`、`rollbackAutoChange`、`query`、`getMedia`、`rebuildStruct`、`extractPending`、`shadowEval`、`getHealth`、`setDailyBudget`、`getRemainingBudget`、`askQuestion`、`submitFeedback`、`listObservedFiles`、`triggerObservedExtraction`、`translateEvidence`、`archiveVersions`、`cleanGhostRelations`、`generateStaticSite`、`generateDraft`。所有入口（Web REST / MCP / CLI）仅做协议适配，业务逻辑唯一。

#### Scenario: Web 问答
- **WHEN** 前端 `POST /api/ask` 携带 `{question, mode, conversationId}`
- **THEN** BrainAPI 路由到 `askQuestion()`，返回含 `answer`、`sources`、`translatedSources?`、`confidence`、`tokensUsed`、`observationTriggered?`、`compressedHistory?` 的 `AskResponse`

#### Scenario: CLI 重建索引
- **WHEN** 执行 `brain rebuild-struct`
- **THEN** 系统从 Markdown 完整重建 DB 索引，扫描并标记幽灵关系，返回 `RebuildReport`

### Requirement: L1 AI Agent 编排
系统 SHALL 实现 Planner → Retriever → Grader → Generator + Reflector 的标准 Agentic RAG 循环，并扩展：可控反思（信息增益追踪 + 5 轮硬上限 + 3 秒熔断）、追问压缩、静默观察补提取、纠错反哺、证据翻译缓存。系统提示词全部存放于 `server/skills/prompts/*.zh-CN.md`，默认汉语。

#### Scenario: 反思熔断
- **WHEN** 反思总耗时超过 3 秒
- **THEN** Reflector 立即停止迭代，返回当前最优结果，并在日志记录终止原因

### Requirement: L2 混合检索引擎
系统 SHALL 实现 pgvector HNSW 向量检索 + PG tsvector 全文检索 + RRF 融合 + 图谱 CTE 遍历 + zerank-2 重排序 + 来源感知 + 命名实体学习路由 + RoBERTa-mnli NLI 预检，并提供 T0/T1/T2 三层响应延迟与五类意图路由。

### Requirement: L4 自进化引擎
系统 SHALL 实现 Dream Cycle 六阶段编排、全局日/月预算管理器（默认日 $5、月 $50）+ 问答单次上限 + 熔断、版本历史归档（>50 条触发）、幽灵关系清理、影子评估（含异常熔断）。

### Requirement: L5 存储层与灾难恢复
系统 SHALL 以 Markdown 文件系统为唯一真相源，PostgreSQL 16 + pgvector 作为纯缓存池。提供 `rebuild-struct` 秒级重建与 `extract-pending` 按需提取。所有 DB 表与架构 4.8 节清单对齐（含 v5.0 新增 5 张表）。

### Requirement: L6 多模态摄入管道
系统 SHALL 支持文档（PDF/DOCX/PPTX/XLSX）、图片、音频、视频、网页、纯文本六类输入，统一转为 Markdown 并建立证据双向映射，原始文件 SHA-256 命名归档至 `library/objects/`。

### Requirement: 国内十家大模型接入
系统 SHALL 在 `server/src/llm/adapters/` 下实现统一 `LLMAdapter` 接口，并集成阿里百炼、智谱、月之暗面、百度、讯飞、腾讯、MiniMax、DeepSeek、零一、百川共十家。前端设置页“集成”分组提供 API Key 输入并启用；模型分层策略在前端通过拖拽分配任务到模型；前端可测试模型连接状态。

#### Scenario: 模型连接测试
- **WHEN** 用户在设置页“集成”分组点击某适配器“测试连接”按钮
- **THEN** 后端调用对应适配器发送探针请求，返回成功/失败及延迟

### Requirement: 全汉化策略
系统 SHALL 默认使用汉语：前端 `zh-CN.json` 默认加载；后端提示词模板默认 `zh-CN`；错误消息、审计日志、CLI 输出、夜间简报均为汉语；面向用户的错误强制本地化。配置项 `language: zh-CN` 全局生效。

### Requirement: 前端 Web 应用
系统 SHALL 实现设计文档第 2 章路由表的全部 14 个路由与对应页面，包含 `EvidencePopover`、`BrainMedia`、`MarkdownRenderer`、`Diff 对比组件`、`BudgetBadge`、`NotificationCenter`、`Sidebar`、`TopBar`、`StatusBar`、`Onboarding` 等通用组件。所有界面全汉化，支持深色/浅色主题切换，新用户引导，完全响应式（≤768px 适配底部标签栏）。

#### Scenario: 路由守卫
- **WHEN** 未登录用户访问除 `/login` 与 `/onboarding` 之外的任何路由
- **THEN** 重定向至 `/login`

#### Scenario: 设置驾驶舱保存
- **WHEN** 用户在设置页修改任意字段
- **THEN** 子导航出现黄色脏标记，“保存所有更改”按钮启用并显示“有 N 处更改”，点击后调用 `PATCH /api/settings` 落库

### Requirement: 无代码设置驾驶舱
系统 SHALL 提供分 9 组（外观、通用、语言、预算、安全、隐私、任务、路径、集成、实验）的设置页，所有配置项通过表单控件操作，即时校验预览，危险操作二次确认，支持“保存所有更改”、“重置”、“恢复默认”，模型分配拖拽。

### Requirement: Bearer Token 认证
系统 SHALL 在 Phase 1 即实现 Bearer Token 认证。Token 从环境变量 `BRAIN_API_KEY` 或配置 `auth.api_key` 读取。认证中间件在 L0.5 BrainAPI 之前拦截所有 HTTP 请求。

#### Scenario: 缺失 Token
- **WHEN** 请求未携带 `Authorization: Bearer <token>` 头
- **THEN** 返回 `401 Unauthorized`，错误消息为汉语

### Requirement: 一键化部署
系统 SHALL 提供完整 `docker-compose.yml`（PostgreSQL 16 + pgvector、后端 BrainAPI、前端 Nginx 静态服务）与 `init.sh`（检查 Docker、复制 `.env.example`、提示填 API Key、启动服务、初始化数据库与重建索引）。前端可一键“导出静态站点”。

#### Scenario: 一键启动
- **WHEN** 用户执行 `./init.sh`
- **THEN** 脚本完成环境检查、配置生成、容器启动、数据库初始化、索引重建，并打印访问地址

### Requirement: 全栈类型共享
系统 SHALL 在 `shared/types/` 中定义所有跨层共享类型（AskRequest/AskResponse、PendingDiff、EvidenceSpan、HealthDashboard、QueryParams/QueryResult、Settings 等），前后端引用同一份类型定义。

### Requirement: 静态站点导出
系统 SHALL 提供 `BrainAPI.generateStaticSite(outputPath, options)` 与前端按钮“导出静态站点”，将完整知识库导出为可脱离服务端独立浏览的 HTML 站点。

## MODIFIED Requirements

### Requirement: README 与文档
原占位 README SHALL 升级为完整文档，包含：项目简介、架构图（L0–L8）、快速开始（`./init.sh` 流程）、环境变量说明（DB、BRAIN_API_KEY、各厂商 API Key、模型分层配置）、常见问题。

## REMOVED Requirements
（无移除项——本 spec 为全栈新建）
