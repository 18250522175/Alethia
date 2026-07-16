# Alethia AI 知识库 v5.2

<p align="center">
  <strong>人机共生的数字图书馆 · 全栈认知共生系统</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Bun-1.1+-fbf0df?logo=bun" alt="Bun">
  <img src="https://img.shields.io/badge/React-18-61dafb?logo=react" alt="React">
  <img src="https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript" alt="TS">
  <img src="https://img.shields.io/badge/PostgreSQL-16-4169e1?logo=postgresql" alt="PG">
  <img src="https://img.shields.io/badge/Tailwind-3-06b6d4?logo=tailwindcss" alt="Tailwind">
  <img src="https://img.shields.io/badge/Docker-✓-2496ed?logo=docker" alt="Docker">
</p>

---

一个由 AI 驱动的知识管理系统：自动从文档中提取知识、构建实体图谱与因果认知地图、通过多轮反思的对话问答帮助探索和理解知识。所有 AI 行为可审核、可回滚，人类始终掌权。

---

## 核心特性

### 知识构建
- **全汉化**：界面、日志、错误消息、AI 提示词均使用中文
- **10 家国产大模型适配**：百炼、智谱、月之暗面、文心、星火、混元、MiniMax、DeepSeek、零一万物、百川
- **多模态文件摄入**：支持 PDF、Word、Markdown、图片（OCR）、音频（转录）、视频（抽帧）的自动解析与知识提取
- **Compiled Truth Markdown**：结构化的真理 Markdown，含 8 个标准区块（摘要、关系、证据、版本、因果、超图、交叉引用、附件）

### 智能检索
- **混合检索引擎**：pgvector 向量检索 + tsvector 全文检索 + RRF 融合 + 图谱遍历 + 意图路由
- **L1 Agent 编排**：Planner → Retriever → Grader → Generator → Reflector，最多 5 轮反思，3 秒熔断
- **LLM 故障转移**：主适配器不可用时自动降级到可用适配器

### 认知推理
- **知识图谱**：实体语义关系可视化，支持布局切换、节点搜索、路径查找、导出 PNG/JSON
- **认知地图**：因果链建模与可视化，支持 do-calculus 推理、反事实推演、时间脉冲响应
- **融合视图**：知识图谱 + 认知地图 + 超图统一画布，边类型独立开关，跨类型聚类
- **超图引擎**：Leiden 聚类、Ghost Hyperedge 检测、超边编辑/删除
- **CPT 条件概率表**：贝叶斯网络概率编辑与离线推理

### 人类掌权
- **审核面板**：所有 AI 生成的知识变更需经审核才会写入
- **版本管理**：视图快照保存/恢复，因果模型版本对比
- **预警系统**：因果冲突检测，一键修复（降低权重/删除边/忽略）
- **零配置降级**：未配置 LLM 密钥时自动降级到全文检索模式

---

## 架构概览

```
┌──────────────────────────────────────────────────────────────────┐
│                     浏览器 (React + Vite)                         │
│  问答面板 / 审核中心 / 知识图谱 / 认知地图 / 仪表盘 / 设置          │
└───────────────────────────┬──────────────────────────────────────┘
                            │ HTTP / Bearer Token
┌───────────────────────────▼──────────────────────────────────────┐
│               Brain API (Bun + Hono, port 3000)                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ │
│  │ BrainAPI │ │ 检索引擎 │ │ Agent 层 │ │ 因果推理 │ │ 进化   │ │
│  │          │ │ 向量/全文│ │ P→R→G→G→R│ │ do-calc  │ │ 超图   │ │
│  │          │ │ RRF/图谱 │ │ 5轮反思  │ │ 贝叶斯   │ │ 发现   │ │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └────────┘ │
└───────────────────────────┬──────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
  ┌─────▼─────┐    ┌────────▼────────┐   ┌─────▼─────┐
  │ PostgreSQL │    │ 10 个 LLM 适配器 │   │ 文件系统  │
  │ + pgvector │    │ + 故障转移路由   │   │ Markdown  │
  │ + 因果表   │    │ + 连接测试       │   │ 多模态    │
  └───────────┘    └─────────────────┘   └───────────┘
```

### 项目结构

```
alethia/
├── shared/              # 全栈共享 TypeScript 类型
├── server/              # Bun + Hono 后端
│   ├── src/
│   │   ├── config/      # 配置加载、Zod 校验
│   │   ├── auth/        # Bearer Token 中间件
│   │   ├── db/          # pg 连接池、迁移、DAO
│   │   ├── storage/     # Markdown 解析、Delta 同步
│   │   ├── ingest/      # 多模态文件处理流水线
│   │   ├── llm/         # 10 家 LLM 适配器 + 路由
│   │   ├── retrieval/   # 向量/全文/RRF/图谱/意图路由
│   │   ├── agents/      # Planner/Retriever/Grader/Generator/Reflector
│   │   ├── causal/      # 因果推理引擎、意图解析、发现
│   │   ├── evolution/   # 超图进化、周报生成
│   │   ├── brainapi/    # BrainAPI 统一服务层
│   │   └── routes/      # Hono 路由
│   └── skills/prompts/  # Agent 提示词
├── web/                 # React + Vite 前端
│   └── src/
│       ├── routes/      # 页面组件（20+ 路由）
│       ├── layouts/     # Shell + Sidebar + TopBar
│       ├── components/  # 共享组件
│       │   └── CognitiveMap/  # 认知地图组件集
│       ├── store/       # Auth / Theme / Settings Context
│       ├── lib/         # API client + TanStack Query
│       └── i18n/        # zh-CN / en 语言包
└── wiki/                # 种子 Markdown 内容
```

---

## 页面路由

| 路由 | 页面 | 说明 |
|:---|:---|:---|
| `/` | 知识主页 | Wiki 首页，浏览所有知识条目 |
| `/wiki/:slug` | 知识条目 | 查看/编辑单个知识条目 |
| `/cognitive-map` | 统一图谱 | 知识图谱 + 认知地图 + 超图融合视图 |
| `/qa` | 问答面板 | AI 多轮对话 |
| `/qa/:conversationId` | 对话详情 | 历史对话查看 |
| `/dashboard` | 仪表盘 | 系统概览与统计 |
| `/review` | 审核中心 | AI 变更审核 |
| `/search` | 搜索结果 | 全局搜索 |
| `/upload` | 文件上传 | 多模态文件摄入 |
| `/library` | 文件库 | 已上传文件管理 |
| `/notes` | 笔记 | 个人笔记管理 |
| `/timeline` | 时间线 | 知识变更时间线 |
| `/changelog` | 变更日志 | 系统变更记录 |
| `/settings` | 设置 | 系统配置 |
| `/prompts` | 提示词 | AI 提示词模板管理 |
| `/aliases` | 别名 | 术语别名管理 |
| `/notifications` | 通知 | 系统通知中心 |
| `/observed-files` | 观察文件 | 文件变更监控 |
| `/eval-report` | 评测报告 | AI 效果评测 |
| `/portal/:context` | 门户 | 按分类浏览知识 |
| `/login` | 登录 | 用户认证 |
| `/onboarding` | 引导 | 首次使用引导 |

---

## 快速开始

### Docker 一键部署

```bash
# 1. 准备环境变量
cp .env.example .env
# 编辑 .env，至少填写 BRAIN_API_KEY（前端登录密钥）

# 2. 启动服务
docker compose up -d

# 3. 访问应用
# 打开浏览器访问 http://localhost
# 使用 .env 中设置的 BRAIN_API_KEY 登录
```

### 本地开发

```bash
# 安装依赖
bun install

# 启动 PostgreSQL（如果尚未运行）
docker run -d --name alethia-pg \
  -e POSTGRES_USER=alethia \
  -e POSTGRES_PASSWORD=alethia \
  -e POSTGRES_DB=alethia \
  -p 5432:5432 \
  pgvector/pgvector:pg16

# 设置环境变量
export DATABASE_URL="postgres://alethia:alethia@localhost:5432/alethia"
export BRAIN_API_KEY="dev-key-123"

# 执行迁移和种子
bun run db:migrate
bun run seed

# 启动后端（端口 3000）
bun run dev:server

# 另开终端启动前端（端口 5173）
bun run dev:web
```

---

## 环境变量

完整变量见 [`.env.example`](.env.example)，关键项：

| 变量 | 默认值 | 说明 |
|:---|:---|:---|
| `DATABASE_URL` | `postgres://alethia:alethia@postgres:5432/alethia` | PostgreSQL 连接串 |
| `BRAIN_API_KEY` | - | **必填**，前端登录密钥 |
| `BRAIN_PORT` | `3000` | 后端服务端口 |
| `LANGUAGE` | `zh-CN` | 系统语言 |
| `DAILY_BUDGET` | `5` | 日预算上限（美元） |
| `MONTHLY_BUDGET` | `50` | 月预算上限（美元） |
| `EMBEDDING_PROVIDER` | `local` | 嵌入服务：`local`(MiniLM) 或厂商 ID |
| `NLI_PROVIDER` | `local` | NLI 预检：`local` 或 `hf-inference` |
| `BAILIAN_API_KEY` 等 | - | 10 家大模型密钥（按需配置） |

---

## 技术栈

### 后端
- **[Bun](https://bun.sh)** — JavaScript/TypeScript 运行时
- **[Hono](https://hono.dev)** — 轻量 HTTP 框架
- **[Kysely](https://kysely.dev)** — 类型安全 SQL 构建器
- **[PostgreSQL 16](https://www.postgresql.org)** + **pgvector** — 关系型 + 向量数据库
- **[pino](https://getpino.io)** — 结构化日志
- **[Zod](https://zod.dev)** — 运行时校验
- **[gray-matter](https://github.com/jonschlinkert/gray-matter)** — Markdown frontmatter 解析

### 前端
- **[React 18](https://react.dev)** + **[Vite 5](https://vitejs.dev)** — 构建工具
- **[TanStack Query v5](https://tanstack.com/query)** — 服务端状态管理
- **[React Router v6](https://reactrouter.com)** — 路由
- **[Tailwind CSS 3](https://tailwindcss.com)** — 原子化 CSS
- **[react-i18next](https://react.i18next.com)** — 国际化
- **[Cytoscape.js](https://cytoscape.org)** — 图可视化引擎
- **[Phosphor Icons](https://phosphoricons.com)** — 图标库

### AI / 推理
- **10 家 LLM** — 百炼、智谱、月之暗面、文心、星火、混元、MiniMax、DeepSeek、零一万物、百川
- **transformers.js** — 本地嵌入与 NLI
- **贝叶斯推理** — do-calculus、反事实、时间脉冲
- **Leiden 聚类** — 超图社区发现

---

## 维护命令

```bash
# 重建知识库结构
curl -X POST http://localhost:3000/api/rebuild-struct \
  -H "Authorization: Bearer $BRAIN_API_KEY"

# 触发数据库迁移
docker compose exec server bun run scripts/migrate.ts

# 写入种子数据
docker compose exec server bun run scripts/seed.ts

# 备份数据库
docker compose exec postgres pg_dump -U alethia alethia > backup.sql

# 查看服务状态
curl http://localhost:3000/health
```

---

## 许可

私有项目。