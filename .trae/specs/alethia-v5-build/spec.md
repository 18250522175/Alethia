# Alethia v5.0 认知共生版 · 全栈构建 Spec

## Why
现有项目仅有两份设计文档（架构 v5.0 与 Web 前端 v1.1）和一份占位 README，缺少任何可运行代码。需要一次性构建出可 `docker compose up` 直接启动的全栈应用：Bun + TypeScript 后端 BrainAPI、React + Vite 前端、十家国内大模型适配器、PostgreSQL 16 + pgvector 数据层与一键化部署脚本，使核心认知共生闭环（摄入 → 提取 → 审核 → 图谱演化 → 问答反馈）端到端可点击、可交互。

## Scope 与可行性声明

### 落地优先级（P0–P3）
为保证可交付，本 spec 将功能按优先级分层：

- **P0（MVP，必须完成）**：项目骨架、共享类型、PostgreSQL+pgvector、Markdown 同步、`rebuild-struct`、Bearer Token 认证、BrainAPI 核心接口（query/askQuestion/extractFacts/applyDiff/getHealth）、L1 基础 Agent 循环（Planner/Retriever/Grader/Generator/Reflector 不含追问压缩等增强）、十家 LLM 适配器（chat 接口）、前端核心 7 页（登录/首页/条目/图谱/审核/问答/设置）、`docker-compose.yml` + `init.sh` + `README.md`。
- **P1（核心增强）**：L2 全部检索组件（RRF/图谱遍历/zerank/NLI/意图路由）、追问压缩、静默观察、纠错反哺、证据翻译缓存、版本归档、幽灵清理、影子评估、`generateStaticSite`、全部前端剩余页面、模型分层拖拽。
- **P2（完整覆盖）**：Dream Cycle 六阶段编排、夜间简报、MCP Server 35+ 工具、CLI 全部命令、补提取观察列表 UI、仪表盘全部卡片。
- **P3（远期/可选）**：图片区域标注、Neo4j Bloom、Chrome 扩展、OAuth 多用户。

实现阶段须先完成 P0 闭环可演示，再按 P1→P2 顺序推进。**P3 不在本期范围**，仅在代码中预留接口或注释。

### 工程可行性约束
- 后端单一 Bun 进程，不引入消息队列；夜间任务用 `cron` 表 + `Bun.cron` 调度。
- NLI 预检默认通过外部 HTTP 服务（`Xenova/transformers.js` 本地推理或 HF Inference API），不强制 GPU。
- zerank-2 默认关闭，配置 `reranker.enabled=false` 时跳过，保证零外部依赖也能运行。
- Whisper/FFmpeg/MinerU 在容器中可选安装；缺失时摄入管道对应模态返回友好汉语错误并跳过。
- 国内大模型适配器统一通过各自官方 OpenAI 兼容端点（多数已支持）调用，避免每家独立 SDK；非兼容厂商（如百度、讯飞）使用各自官方 SDK。
- 嵌入模型默认使用各厂商兼容 OpenAI `text-embedding` 协议的端点；缺失时退化到 `Xenova/all-MiniLM-L6-v2` 本地嵌入。

### 工程可行性细化（实现必须遵循）

#### 1. 嵌入维度一致性（关键）
默认配置 `EMBEDDING_PROVIDER=local` → 使用 `all-MiniLM-L6-v2` 输出 **384 维**。迁移脚本 `0001_init.sql` 须将 `page_embeddings.embedding` 列定义为 `vector(384)`，与默认嵌入源严格对齐。若用户在前端切换到 1536 维的厂商嵌入（如 `text-embedding-3-small`），系统 SHALL：
- 在 `settings` 表记录当前嵌入维度；
- 启动时检测配置维度与 DB 列维度不匹配 → 自动执行 `ALTER TABLE page_embeddings ALTER COLUMN embedding TYPE vector(1536)` 并清空该表 + 重建 HNSW 索引；
- 该自动迁移记录写入 `auto_change_log`，仪表盘显示「嵌入维度已变更，索引已重建」。

#### 2. 零配置启动行为（Zero-Config Boot）
当 `.env` 中除 `BRAIN_API_KEY` 外所有厂商 API Key 均为空时，系统 SHALL：
- 正常启动并返回 `/health=ok`；
- 前端可登录、浏览种子 wiki、查看空仪表盘、查看空审核队列；
- 任何需要 LLM 的接口（`/api/ask`、`/api/extract`、`/api/translate`、`/api/eval`）返回 HTTP 503 + 汉语错误 `{"error":"未配置可用的大模型适配器，请在设置页→集成中填入至少一个厂商 API Key"}`；
- `rebuild-struct` 可正常工作（仅依赖 Markdown 解析，不调用 LLM）；
- `query` 接口的全文检索路径可用，向量检索路径返回空结果（无 embedding 时）。

#### 3. 数据库启动重试
`server/src/db/pool.ts` SHALL 在启动时执行最多 30 次（间隔 1 秒）的 `SELECT 1` 探测，全部失败后进程退出码 1 并输出汉语错误「无法连接到 PostgreSQL，请检查 DATABASE_URL 与容器健康状态」。`docker-compose.yml` 的 `server` 服务 `depends_on.postgres.condition: service_healthy`。

#### 4. 迁移幂等性
`0001_init.sql` 全部 DDL 语句使用 `IF NOT EXISTS`；`CREATE EXTENSION IF NOT EXISTS`；`CREATE INDEX IF NOT EXISTS`。重复执行迁移脚本不应报错。提供 `server/scripts/migrate.ts` 包装器，按文件名顺序执行 `migrations/*.sql`，已执行的记录在 `_migrations(name, applied_at)` 表中跳过。

#### 5. `/health` 端点扩展
`GET /health` 返回：
```json
{
  "status": "ok" | "degraded" | "down",
  "lang": "zh-CN",
  "db": "connected" | "disconnected",
  "llm": "configured" | "none",
  "embedding": "vendor" | "local" | "none",
  "version": "5.0.0"
}
```
- `status=degraded` 当 DB 连接正常但无 LLM 适配器配置；
- `status=down` 当 DB 连接失败。

#### 6. 端口与暴露约定
- 开发模式：后端 `BRAIN_PORT=3000`，前端 Vite dev server `5173`，Vite 配置 `/api` 代理到 `localhost:3000`；
- 生产模式：nginx 容器暴露 `80:80`，反代 `/api` → `server:3000`，静态文件由 nginx 直接服务；
- `docker-compose.yml` 仅暴露 `web` 的 80 端口，`server` 与 `postgres` 仅内部网络可见（安全默认）。

#### 7. 运行时降级矩阵
| 组件 | 依赖缺失时的行为 |
| --- | --- |
| LLM chat | 返回 503 + 汉语错误「未配置大模型」 |
| LLM embed | 退化到本地 MiniLM 384 维 |
| zerank-2 | passthrough（不重排序） |
| NLI 预检 | 退化到本地 transformers.js；本地也失败则跳过预检（直接进入生成） |
| RRF 融合 | 始终可用（纯算法） |
| 图谱遍历 | 始终可用（纯 SQL） |
| 全文检索 | 始终可用（PG 内置） |
| 向量检索 | 无 embedding 时返回空数组 |
| Whisper/FFmpeg | 摄入返回汉语错误并跳过该文件 |
| `@extractus/article-extractor` | 网页摄入返回汉语错误 |
| pdf-parse/mammoth/xlsx | 对应文档类型摄入返回汉语错误 |
| tesseract.js | 图片 OCR 跳过，仅返回 VLM 描述（若可用） |

#### 8. Compiled Truth Markdown 规范格式
所有 `wiki/*.md` 文件 SHALL 遵循以下格式（解析器按 `## ` 二级标题切分区块）：
```markdown
---
canonical_slug: entropy
title: 熵
contexts: [物理学, 信息论]
type: concept
---

# 熵

## State
熵是系统无序度的量度，在热力学与信息论中均有定义。

## Assessment
（当前对熵的理解与共识）

## Open Threads
- [ ] 熵与生命负熵的关系尚有争议

## Relations
- [[热力学]] · affects
- [[信息论]] · belongs_to

## Timeline
- 2026-07-01 · 版本变更 · 初始创建
- 2026-07-03 · 🗣 问答 · 用户询问了熵的本质

## Version History
- v3 · 2026-07-03 · 补充信息论定义
- v2 · 2026-07-02 · 修正公式
- v1 · 2026-07-01 · 初始创建

## Semantic Rings Archive
- ring-001 · 2026-07 周 · 「熵」概念在物理学语境稳定，信息论语境正在演化」

## Evidence
[^span-001]: 来源：热力学讲义.pdf 第 23 页 · "熵是状态函数..."
```

#### 9. P0 验收硬性标准
P0 闭环完成的判定标准（全部满足才算 P0 完成）：
1. `./init.sh` 在干净环境（仅装 Docker）一键跑通，最后输出访问地址；
2. 浏览器访问 `http://localhost` 显示登录页；
3. 输入 `BRAIN_API_KEY` 后登录成功，跳转首页；
4. 首页显示种子 wiki（index.md、portals/science.md、concepts/entropy.md）；
5. `/graph` 显示至少 3 个节点（熵、热力学、信息论）与对应边；
6. 在 `.env` 填入任一厂商 API Key 后，`/settings` 点击「测试连接」返回成功；
7. 在 `/qa` 提问「熵是什么？」返回带 `[^span-xxx]` 脚注的答案，脚注可弹出 EvidencePopover；
8. `docker compose down -v && ./init.sh` 可重复执行（幂等）。

#### 10. 错误处理统一规范
所有 BrainAPI 接口失败时返回统一格式：
```json
{
  "error": {
    "code": "UNAUTHORIZED" | "VALIDATION_ERROR" | "NOT_FOUND" | "BUDGET_EXCEEDED" | "LLM_UNAVAILABLE" | "INTERNAL",
    "message": "未授权：缺失 API 密钥",
    "details": { /* 可选，字段级错误 */ }
  }
}
```
HTTP 状态码：401/400/404/429/503/500 与 code 一一对应。所有 `message` 强制汉语。

## What Changes
- 新增 `server/` 全后端：Bun + Hono + TypeScript 实现 L0.5 BrainAPI、L1 Agent、L2 检索、L4 自进化、L5 存储、L6 摄入、Bearer Token 认证、全汉化提示词与日志。
- 新增 `server/src/llm/adapters/` 统一 `LLMAdapter` 接口与十家国内厂商适配器。
- 新增 `web/` 全前端：React 18 + Vite 5 + TypeScript + Tailwind 3 + react-i18next + TanStack Query v5 + React Router v6 + Headless UI + Cytoscape.js + Chart.js + Phosphor Icons。
- 新增无代码设置驾驶舱：9 组卡片 + 模型分配拖拽（`@dnd-kit/core`）。
- 新增前后端共享类型层 `shared/`，全栈 TypeScript 类型对齐。
- 新增 `docker-compose.yml`：postgres-pgvector + server + web 三容器。
- 新增 `init.sh`、`.env.example`、`Dockerfile.server`、`Dockerfile.web`、`nginx.conf`。
- 更新 `README.md`：项目简介、架构图、快速开始、环境变量说明。
- 全部系统提示词、错误消息、日志默认为汉语。
- **BREAKING**：从空仓库直接建立完整工程结构。

## Impact
- 受影响设计文档：《理想 AI 知识库融合架构 v5.0》（全部 L0–L8 层）、《Web 前端界面设计文档 v1.1》（全部 13 章路由与组件）。
- 受影响代码（新增，具体目录树见下文「目标项目结构」）。

## 目标项目结构

```
/workspace
├── README.md                          # 完整文档
├── docker-compose.yml
├── init.sh
├── .env.example
├── Dockerfile.server
├── Dockerfile.web
├── nginx.conf
├── package.json                       # workspace 根
├── tsconfig.base.json
├── shared/
│   ├── package.json
│   ├── tsconfig.json
│   └── types/
│       ├── index.ts                   # 统一导出
│       ├── ask.ts                     # AskRequest/AskResponse
│       ├── evidence.ts                # EvidenceSpan
│       ├── diff.ts                    # PendingDiff/ApplyResult
│       ├── query.ts                   # QueryParams/QueryResult
│       ├── health.ts                  # HealthDashboard
│       ├── evolution.ts               # EvalReport/ArchiveReport/GhostReport/GenerateReport
│       ├── settings.ts                # Settings（9 组全部字段）
│       ├── llm.ts                     # LLMAdapter 契约/LLMRequest/LLMResponse/ModelTier/ModelAssignment
│       └── entities.ts                # Page/Link/TimelineEntry/Version/SemanticRing/Cluster
├── server/
│   ├── package.json
│   ├── tsconfig.json
│   ├── bunfig.toml
│   ├── src/
│   │   ├── index.ts                   # Bun + Hono 入口
│   │   ├── config/
│   │   │   ├── loader.ts              # .env + .brain-config.yml 合并
│   │   │   ├── schema.ts              # Zod 校验
│   │   │   └── defaults.ts            # 出厂默认值
│   │   ├── i18n/
│   │   │   ├── logger.ts              # pino + lang 字段
│   │   │   └── errors.zh-CN.ts        # 汉语错误码映射
│   │   ├── auth/
│   │   │   └── bearer.ts              # Bearer Token 中间件
│   │   ├── db/
│   │   │   ├── pool.ts                # pg 连接池
│   │   │   ├── dao/
│   │   │   │   ├── pages.ts
│   │   │   │   ├── links.ts
│   │   │   │   ├── timeline.ts
│   │   │   │   ├── versions.ts
│   │   │   │   ├── clusters.ts
│   │   │   │   ├── rings.ts
│   │   │   │   ├── evidence.ts
│   │   │   │   ├── conversations.ts
│   │   │   │   ├── translations.ts
│   │   │   │   ├── ghosts.ts
│   │   │   │   ├── observed.ts
│   │   │   │   ├── rules.ts
│   │   │   │   ├── benchmarks.ts
│   │   │   │   ├── auto_changes.ts
│   │   │   │   └── anomaly.ts
│   │   │   └── migrations/
│   │   │       └── 0001_init.sql      # 全部 v5.0 表 + pgvector + tsvector + HNSW
│   │   ├── storage/
│   │   │   ├── markdown.ts            # FS 管理
│   │   │   ├── parser.ts              # Compiled Truth 解析
│   │   │   ├── manifest.ts            # Delta 追踪
│   │   │   └── sync.ts                # 双向同步
│   │   ├── retrieval/
│   │   │   ├── vector.ts              # pgvector HNSW
│   │   │   ├── fulltext.ts            # tsvector
│   │   │   ├── rrf.ts                 # 融合算法
│   │   │   ├── graph.ts               # 图谱 CTE
│   │   │   ├── rerank.ts              # zerank-2 适配
│   │   │   ├── source.ts              # 来源感知
│   │   │   ├── entity.ts              # 命名实体 + user_rules
│   │   │   ├── nli.ts                 # RoBERTa-mnli 预检
│   │   │   └── router.ts              # 意图路由 T0/T1/T2
│   │   ├── agents/
│   │   │   ├── planner.ts
│   │   │   ├── retriever.ts
│   │   │   ├── grader.ts
│   │   │   ├── generator.ts
│   │   │   ├── reflector.ts
│   │   │   ├── compression.ts         # 追问压缩
│   │   │   ├── observe.ts             # 静默观察补提取
│   │   │   ├── feedback.ts            # 纠错反哺
│   │   │   └── translate.ts           # 证据翻译缓存
│   │   ├── evolution/
│   │   │   ├── dream.ts               # Dream Cycle 编排
│   │   │   ├── budget.ts              # 全局预算
│   │   │   ├── archive.ts             # 版本归档
│   │   │   ├── ghost.ts               # 幽灵清理
│   │   │   ├── shadow.ts              # 影子评估 + 熔断
│   │   │   └── rollback.ts            # 全自动回滚
│   │   ├── ingest/
│   │   │   ├── pipeline.ts            # BrainIngest 入口
│   │   │   ├── document.ts            # PDF/DOCX/PPTX/XLSX
│   │   │   ├── image.ts               # OCR + VLM
│   │   │   ├── audio.ts               # Whisper.cpp
│   │   │   ├── video.ts               # FFmpeg + Whisper
│   │   │   ├── web.ts                 # Trafilatura
│   │   │   └── text.ts                # MD/TXT/CSV/JSON
│   │   ├── llm/
│   │   │   ├── adapter.ts             # LLMAdapter 抽象
│   │   │   ├── router.ts              # 模型分层路由
│   │   │   ├── embed.ts               # 嵌入生成（含本地退化）
│   │   │   └── adapters/
│   │   │       ├── bailian.ts         # 阿里百炼 Qwen
│   │   │       ├── zhipu.ts           # 智谱 ChatGLM
│   │   │       ├── moonshot.ts        # 月之暗面 Kimi
│   │   │       ├── ernie.ts           # 百度文心
│   │   │       ├── spark.ts           # 讯飞星火
│   │   │       ├── hunyuan.ts         # 腾讯混元
│   │   │       ├── minimax.ts         # MiniMax
│   │   │       ├── deepseek.ts        # DeepSeek
│   │   │       ├── yi.ts              # 零一 Yi
│   │   │       └── baichuan.ts        # 百川
│   │   ├── brainapi/
│   │   │   └── index.ts               # 全部 20+ 接口实现
│   │   ├── mcp/
│   │   │   └── server.ts              # stdio + HTTP 双模式
│   │   ├── cli/
│   │   │   └── brain.ts              # 全部 CLI 命令
│   │   └── routes/
│   │       ├── ask.ts
│   │       ├── diff.ts
│   │       ├── query.ts
│   │       ├── health.ts
│   │       ├── library.ts
│   │       ├── settings.ts
│   │       ├── llm.ts                 # /api/llm/test
│   │       ├── observed.ts
│   │       ├── feedback.ts
│   │       ├── translate.ts
│   │       ├── archive.ts
│   │       ├── ghost.ts
│   │       └── static.ts              # 静态站点导出
│   └── skills/
│       └── prompts/
│           ├── planner.zh-CN.md
│           ├── grader.zh-CN.md
│           ├── generator.zh-CN.md
│           ├── reflector.zh-CN.md
│           └── compression.zh-CN.md
├── web/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── index.html
│   ├── nginx.conf                     # 容器内 nginx 配置（拷贝自根）
│   └── src/
│       ├── main.tsx
│       ├── App.tsx                    # 路由配置 + 守卫
│       ├── i18n/
│       │   ├── config.ts
│       │   └── locales/
│       │       ├── zh-CN.json
│       │       └── en.json
│       ├── lib/
│       │   ├── api.ts                 # fetch 封装 + Bearer 自动注入
│       │   ├── query.ts               # TanStack Query 客户端
│       │   └── drag.ts                # @dnd-kit 封装
│       ├── store/
│       │   ├── AuthContext.tsx
│       │   ├── ThemeContext.tsx
│       │   ├── SettingsContext.tsx
│       │   └── NotificationContext.tsx
│       ├── layouts/
│       │   ├── Shell.tsx
│       │   ├── TopBar.tsx
│       │   ├── Sidebar.tsx
│       │   ├── StatusBar.tsx
│       │   └── NotificationCenter.tsx
│       ├── routes/
│       │   ├── LoginPage.tsx
│       │   ├── OnboardingPage.tsx
│       │   ├── WikiHomePage.tsx
│       │   ├── WikiEntryPage.tsx
│       │   ├── GraphFullPage.tsx
│       │   ├── DiffReviewPage.tsx
│       │   ├── QAPanelPage.tsx
│       │   ├── DashboardPage.tsx
│       │   ├── ChangelogPage.tsx
│       │   ├── EvalReportPage.tsx
│       │   ├── TimelineFullPage.tsx
│       │   ├── SearchResultPage.tsx
│       │   ├── LibraryFilePage.tsx
│       │   └── SettingsPage.tsx
│       ├── features/                  # 页面级组件
│       │   ├── wiki/
│       │   ├── graph/
│       │   ├── review/
│       │   ├── qa/
│       │   ├── dashboard/
│       │   ├── changelog/
│       │   ├── evaluation/
│       │   ├── timeline/
│       │   ├── search/
│       │   ├── library/
│       │   └── settings/
│       ├── blocks/                    # 分子/有机体
│       │   ├── EvidencePopover.tsx
│       │   ├── DiffCard.tsx
│       │   ├── GraphNodeCard.tsx
│       │   ├── MessageBubble.tsx
│       │   ├── BudgetBadge.tsx
│       │   ├── QuickAskButton.tsx
│       │   ├── GlobalSearch.tsx
│       │   └── UserMenu.tsx
│       ├── components/                # brain-media 等自研 Web Component
│       │   ├── brain-media.ts
│       │   ├── MarkdownRenderer.tsx
│       │   └── DiffCompare.tsx
│       └── ui/                        # 原子组件
│           ├── Button.tsx
│           ├── Input.tsx
│           ├── Select.tsx
│           ├── Checkbox.tsx
│           ├── Tooltip.tsx
│           └── Card.tsx
├── wiki/                              # 默认知识库（种子）
│   ├── index.md
│   ├── AGENTS.md
│   └── portals/
│       └── science.md
├── summaries/
├── changelog/
├── raw/
├── library/
└── exports/                           # 静态站点输出
```

## 关键技术栈与版本

| 层 | 库 | 版本 | 说明 |
| --- | --- | --- | --- |
| 后端运行时 | `bun` | ≥1.1 | 主进程 |
| HTTP 框架 | `hono` | ^4.6 | 路由+中间件 |
| ORM/查询 | `kysely` | ^0.27 | 类型安全 SQL 构建器，零魔法 |
| DB 驱动 | `pg` | ^8.13 | PostgreSQL 客户端 |
| 校验 | `zod` | ^3.23 | 配置与请求体 |
| 日志 | `pino` | ^9.5 | 高性能，含 `lang` 字段 |
| 调度 | `Bun.cron`（内置） | — | 夜间任务 |
| YAML | `yaml` | ^2.6 | `.brain-config.yml` |
| i18n | 自研轻量键值表 | — | 汉语错误码映射 |
| 文档解析 | `unified`+`remark`+`gray-matter` | latest | Compiled Truth 解析 |
| 摄入-文档 | `pdf-parse`/`mammoth`/`xlsx` | latest | 缺包则降级 |
| 摄入-音频 | `Whisper.cpp` 子进程 | v1.7 | 容器可选安装 |
| 摄入-视频 | `FFmpeg` 子进程 | 7.x | 容器可选安装 |
| 摄入-网页 | `@extractus/article-extractor` | latest | Trafilatura 替代 |
| 嵌入（本地退化） | `@xenova/transformers` | ^2.17 | all-MiniLM-L6-v2 |
| 前端构建 | `vite` | ^5.4 | — |
| 前端框架 | `react`/`react-dom` | ^18.3 | — |
| 路由 | `react-router-dom` | ^6.27 | — |
| 状态 | `@tanstack/react-query` | ^5.59 | 服务端状态 |
| i18n | `react-i18next`/`i18next` | ^15/^23 | — |
| 样式 | `tailwindcss`/`postcss`/`autoprefixer` | ^3.4 | — |
| 组件 | `@headlessui/react` | ^2.2 | 无样式可访问 |
| 拖拽 | `@dnd-kit/core` | ^6.1 | 模型分配 |
| 图谱 | `cytoscape`/`cytoscape-cose-bilkent` | ^3.30 | — |
| 图表 | `chart.js`/`react-chartjs-2` | ^4.4 | — |
| 图标 | `@phosphor-icons/react` | ^2.1 | — |
| Markdown 渲染 | `markdown-it`/`highlight.js`/`shiki` | latest | — |
| 浮层 | `@floating-ui/react` | ^0.27 | EvidencePopover 定位 |

## DB Schema 概要（v5.0 全表，全部建在 0001_init.sql）

```sql
CREATE EXTENSION IF NOT EXISTS vector;       -- pgvector
CREATE EXTENSION IF NOT EXISTS pg_trgm;      -- 模糊匹配

-- 核心缓存表（共 24 张，含 v5.0 新增 5 张）
pages(id, slug, path, type, contexts, raw_md, parsed_json, content_md, hash, updated_at)
page_fts(page_id, tsv tsvector, source_text)
page_embeddings(page_id, embedding vector(384), model)  -- 默认 384 维（本地 MiniLM），见「嵌入维度一致性」节
links(id, source_slug, target_slug, relation, weight, orphaned bool, created_at)
timeline_entries(id, slug, type, payload jsonb, ts timestamptz)
knowledge_versions(id, slug, version, ts timestamptz, change_summary, archived bool, changelog_path)
semantic_rings(id, slug, ring_version, period, summary)
evidence_spans(id, slug, source_file_hash, source_text_offset, original_location, span_text, lang)
clusters(id, cluster_id, name, lifecycle, generated_at)
cluster_members(cluster_id, slug)
communities(id, community_id, label)
community_reports(id, community_id, content)
clusters_meta(id, key, value)
library_files(hash, mime, original_name, size, status, ingested_at)
pending_diffs(id, slug, type, payload jsonb, confidence, impact, tier, created_at, resolved bool)
auto_change_log(batch_id, op, target, payload jsonb, ts timestamptz)
shadow_benchmarks(id, type, slug, source_text, expected_output, git_commit)
nli_cache(hash_a, hash_b, label, ts)
user_rules(id, pattern, mapping, hits, created_at)
settings(key, value jsonb, updated_at)              -- 单行 JSON 配置
conversation_logs(id, conversation_id, role, content, ts, tokens, cost)
evidence_translations(span_id, source_text, translated_text, lang, model, created_at, expires_at)
ghost_relations(id, source_slug, target_name, discovered_at, status)
observed_files(file_hash, reference_count, first_referenced_at, last_referenced_at)
eval_anomaly_flags(id, metric, threshold, actual, ts, message)

-- 索引（全部 IF NOT EXISTS，幂等）
CREATE INDEX IF NOT EXISTS idx_page_embeddings_hnsw ON page_embeddings USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_page_fts_gin ON page_fts USING gin (tsv);
CREATE INDEX IF NOT EXISTS idx_links_source ON links (source_slug) INCLUDE (target_slug);
CREATE INDEX IF NOT EXISTS idx_links_orphaned ON links (orphaned) WHERE orphaned = true;  -- 部分索引
CREATE INDEX IF NOT EXISTS idx_pending_diffs_tier ON pending_diffs (tier, resolved) WHERE resolved = false;
CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_versions_unique ON knowledge_versions (slug, version);
-- ... 其余索引在迁移中详细给出
```

## BrainAPI REST 端点清单

| Method | Path | 调用 | P 级 |
| --- | --- | --- | --- |
| GET | `/health` | liveness | P0 |
| POST | `/api/auth/login` | 校验 Bearer Token | P0 |
| POST | `/api/query` | `BrainAPI.query` | P0 |
| POST | `/api/ask` | `BrainAPI.askQuestion` | P0 |
| GET | `/api/conversations/:id` | 对话历史 | P1 |
| PUT | `/api/feedback` | `BrainAPI.submitFeedback` | P1 |
| GET | `/api/observed-files` | `BrainAPI.listObservedFiles` | P1 |
| POST | `/api/observed-files/:hash/extract` | `BrainAPI.triggerObservedExtraction` | P1 |
| POST | `/api/extract` | `BrainAPI.extractFacts` | P0 |
| POST | `/api/diff/:id/apply` | `BrainAPI.applyDiff` | P0 |
| GET | `/api/diff` | 待审核列表（按 tier 分组） | P0 |
| POST | `/api/rollback/:batchId` | `BrainAPI.rollbackAutoChange` | P1 |
| GET | `/api/media/:hash` | `BrainAPI.getMedia`（含 Range） | P0 |
| POST | `/api/rebuild-struct` | `BrainAPI.rebuildStruct` | P0 |
| POST | `/api/extract-pending` | `BrainAPI.extractPending` | P1 |
| GET | `/api/health-dashboard` | `BrainAPI.getHealth` | P0 |
| POST | `/api/budget` | `BrainAPI.setDailyBudget` | P1 |
| GET | `/api/budget` | `BrainAPI.getRemainingBudget` | P1 |
| POST | `/api/translate` | `BrainAPI.translateEvidence` | P1 |
| POST | `/api/archive` | `BrainAPI.archiveVersions` | P1 |
| POST | `/api/ghost/clean` | `BrainAPI.cleanGhostRelations` | P1 |
| POST | `/api/eval` | `BrainAPI.shadowEval` | P2 |
| POST | `/api/static-site` | `BrainAPI.generateStaticSite` | P1 |
| GET | `/api/settings` | 读取全部配置 | P0 |
| PATCH | `/api/settings` | 更新配置 | P0 |
| POST | `/api/llm/test` | 测试某适配器连接 | P0 |
| GET | `/api/llm/adapters` | 列出已注册适配器与状态 | P0 |
| POST | `/api/ingest` | 上传文件触发 BrainIngest | P1 |

## ADDED Requirements

### Requirement: 后端 BrainAPI 统一服务层（L0.5）
系统 SHALL 完整实现架构文档 4.2 节列出的全部 BrainAPI 接口（见上文端点清单 P0–P2 全部）。所有入口（Web REST / MCP / CLI）仅做协议适配，业务逻辑唯一。

#### Scenario: Web 问答
- **WHEN** 前端 `POST /api/ask` 携带 `{question, mode, conversationId}`
- **THEN** BrainAPI 路由到 `askQuestion()`，返回 `AskResponse`（含 `answer`、`sources`、`translatedSources?`、`confidence`、`tokensUsed`、`observationTriggered?`、`compressedHistory?`）

#### Scenario: CLI 重建索引
- **WHEN** 执行 `brain rebuild-struct`
- **THEN** 系统从 Markdown 完整重建 DB 索引，扫描并标记幽灵关系，返回 `RebuildReport`

#### Scenario: 缺失 Token
- **WHEN** 请求未携带 `Authorization: Bearer <token>` 头
- **THEN** 返回 `401 Unauthorized`，错误消息为汉语（如「未授权：缺失 API 密钥」）

### Requirement: L1 AI Agent 编排
系统 SHALL 实现 Planner → Retriever → Grader → Generator + Reflector 的标准 Agentic RAG 循环，并扩展：可控反思（信息增益追踪 + 5 轮硬上限 + 3 秒熔断）、追问压缩、静默观察补提取、纠错反哺、证据翻译缓存。系统提示词全部存放于 `server/skills/prompts/*.zh-CN.md`，默认汉语。

#### Scenario: 反思熔断
- **WHEN** 反思总耗时超过 3 秒
- **THEN** Reflector 立即停止迭代，返回当前最优结果，并在日志记录终止原因

### Requirement: L2 混合检索引擎
系统 SHALL 实现 pgvector HNSW 向量检索 + PG tsvector 全文检索 + RRF 融合 + 图谱 CTE 遍历 + zerank-2 重排序（可配置关闭）+ 来源感知 + 命名实体学习路由 + RoBERTa-mnli NLI 预检（可经 HF Inference API 或本地 transformers.js），并提供 T0/T1/T2 三层响应延迟与五类意图路由。当 `reranker.enabled=false` 或 NLI 服务不可用时，引擎应优雅降级并仍能返回结果。

### Requirement: L4 自进化引擎
系统 SHALL 实现 Dream Cycle 六阶段编排、全局日/月预算管理器（默认日 $5、月 $50）+ 问答单次上限 + 熔断、版本历史归档（>50 条触发）、幽灵关系清理、影子评估（含异常熔断）。夜间任务通过 `Bun.cron` 调度，全部日志汉语。

### Requirement: L5 存储层与灾难恢复
系统 SHALL 以 Markdown 文件系统为唯一真相源，PostgreSQL 16 + pgvector 作为纯缓存池。提供 `rebuild-struct` 秒级重建与 `extract-pending` 按需提取。所有 DB 表与架构 4.8 节清单对齐（含 v5.0 新增 5 张表）。

### Requirement: L6 多模态摄入管道
系统 SHALL 支持文档（PDF/DOCX/PPTX/XLSX）、图片、音频、视频、网页、纯文本六类输入，统一转为 Markdown 并建立证据双向映射，原始文件 SHA-256 命名归档至 `library/objects/`。当某模态依赖（Whisper.cpp/FFmpeg/MinerU）缺失时，管道返回友好汉语错误并跳过该文件，不阻塞其他摄入。

### Requirement: 国内十家大模型接入
系统 SHALL 在 `server/src/llm/adapters/` 下实现统一 `LLMAdapter` 接口，并集成阿里百炼、智谱、月之暗面、百度、讯飞、腾讯、MiniMax、DeepSeek、零一、百川共十家。优先使用各家 OpenAI 兼容端点；非兼容厂商使用各自官方 SDK。前端设置页「集成」分组提供 API Key 输入并启用；模型分层策略在前端通过 `@dnd-kit` 拖拽分配任务到模型；前端可测试模型连接状态。

#### Scenario: 模型连接测试
- **WHEN** 用户在设置页「集成」分组点击某适配器「测试连接」按钮
- **THEN** 后端调用 `LLMAdapter.probe()` 发送「你好」探针，返回成功/失败及延迟（毫秒）

### Requirement: 全汉化策略
系统 SHALL 默认使用汉语：前端 `zh-CN.json` 默认加载；后端提示词模板默认 `zh-CN`；错误消息、审计日志、CLI 输出、夜间简报均为汉语；面向用户的错误强制本地化。配置项 `language: zh-CN` 全局生效。

### Requirement: 前端 Web 应用
系统 SHALL 实现设计文档第 2 章路由表的全部 14 个路由与对应页面，包含 `EvidencePopover`、`BrainMedia`、`MarkdownRenderer`、`DiffCompare`、`BudgetBadge`、`NotificationCenter`、`Sidebar`、`TopBar`、`StatusBar`、`Onboarding` 等通用组件。所有界面全汉化，支持深色/浅色主题切换，新用户引导，完全响应式（≤768px 适配底部标签栏）。

#### Scenario: 路由守卫
- **WHEN** 未登录用户访问除 `/login` 与 `/onboarding` 之外的任何路由
- **THEN** 重定向至 `/login`

#### Scenario: 设置驾驶舱保存
- **WHEN** 用户在设置页修改任意字段
- **THEN** 子导航出现黄色脏标记，「保存所有更改」按钮启用并显示「有 N 处更改」，点击后调用 `PATCH /api/settings` 落库

### Requirement: 无代码设置驾驶舱
系统 SHALL 提供分 9 组（外观、通用、语言、预算、安全、隐私、任务、路径、集成、实验）的设置页，所有配置项通过表单控件操作，即时校验预览，危险操作（重置 API Key、清空缓存、强制重建）二次确认，支持「保存所有更改」、「重置」、「恢复默认」。模型分配在「预算」组采用 `@dnd-kit/core` 拖拽。

### Requirement: Bearer Token 认证
系统 SHALL 在 Phase 1 即实现 Bearer Token 认证。Token 从环境变量 `BRAIN_API_KEY` 或配置 `auth.api_key` 读取。认证中间件在 L0.5 BrainAPI 之前拦截所有 HTTP 请求。

### Requirement: 一键化部署
系统 SHALL 提供完整 `docker-compose.yml`（postgres-pgvector + server + web 三服务，含健康检查与依赖顺序）与 `init.sh`（检查 Docker → 复制 `.env.example` → 提示填 API Key → `docker compose up -d` → 等待健康 → 执行 DB 迁移 → `brain rebuild-struct` → 打印访问地址）。前端可一键「导出静态站点」。

#### Scenario: 一键启动
- **WHEN** 用户执行 `./init.sh`
- **THEN** 脚本完成环境检查、配置生成、容器启动、数据库初始化、索引重建，并打印访问地址 `http://localhost`

### Requirement: 全栈类型共享
系统 SHALL 在 `shared/types/` 中定义所有跨层共享类型，前后端引用同一份类型定义。`shared` 包不依赖运行时（仅类型导出），保证可被两端 tsconfig 直接引用。

### Requirement: 静态站点导出
系统 SHALL 提供 `BrainAPI.generateStaticSite(outputPath, options)` 与前端按钮「导出静态站点」，将完整知识库导出为可脱离服务端独立浏览的 HTML 站点（含 Markdown 渲染、媒体文件、图谱静态化）。

## MODIFIED Requirements

### Requirement: README 与文档
原占位 README SHALL 升级为完整文档，包含：项目简介、L0–L8 架构图（ASCII）、快速开始（`./init.sh` 流程）、环境变量说明（DB、BRAIN_API_KEY、各厂商 API Key、模型分层配置、预算默认值）、常见问题（如何重置密钥、如何切换模型、如何清理幽灵关系）。

## REMOVED Requirements
（无移除项——本 spec 为全栈新建）

## 验证策略（实现完成后逐项跑通）

1. **后端冒烟**：`bun run dev`，`curl localhost:3000/health` 返回 200。
2. **DB 迁移**：`bun run db:migrate`，所有表创建成功，pgvector 扩展可用。
3. **种子数据**：`bun run seed`，wiki/index.md 等种子写入并可被 `rebuild-struct` 解析。
4. **认证**：`curl` 不带 Token 返回 401 汉语错误；带正确 Token 返回 200。
5. **LLM 适配器**：在设置页填入至少一个厂商 API Key，点击「测试连接」返回成功。
6. **问答闭环**：在前端 `/qa` 提问，返回带脚注的答案，脚注可弹出 EvidencePopover。
7. **摄入闭环**：上传一个 PDF，触发 `extractFacts`，Diff 出现在 `/review`，审核后写入 Markdown 并出现在图谱。
8. **一键部署**：`./init.sh` 全流程通过，访问 `http://localhost` 可登录并使用。
9. **主题切换**：浅色/深色切换持久化到 localStorage。
10. **响应式**：浏览器宽度 ≤768px 时左侧导航转底部标签栏。
