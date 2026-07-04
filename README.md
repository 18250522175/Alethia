# Alethia AI 知识库 v5.0

> 人机共生的数字图书馆 · 全栈认知共生系统

一个由 AI 驱动的知识管理系统：自动从文档中提取知识、构建实体图谱、通过多轮反思的对话问答帮助探索和理解知识。所有 AI 行为可审核、可回滚，人类始终掌权。

---

## 核心特性

- **全汉化**：界面、日志、错误消息、AI 提示词均使用中文
- **10 家国产大模型适配**：百炼、智谱、月之暗面、文心、星火、混元、MiniMax、DeepSeek、零一万物、百川
- **混合检索引擎**：pgvector 向量检索 + tsvector 全文检索 + RRF 融合 + 图谱遍历 + 意图路由
- **L1 Agent 编排**：Planner → Retriever → Grader → Generator → Reflector，最多 5 轮反思，3 秒熔断
- **Compiled Truth Markdown**：结构化的真理 Markdown，含 8 个标准区块
- **人类掌权**：所有 AI 生成的知识变更需经审核面板确认才会写入
- **零配置启动**：未配置 LLM 密钥时自动降级到全文检索模式
- **Docker 一键部署**：`docker compose up -d` 即可启动完整系统

---

## 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                    浏览器 (React + Vite)                     │
│  问答面板 / 审核中心 / 知识图谱 / 仪表盘 / 设置               │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP / Bearer Token
┌────────────────────────▼────────────────────────────────────┐
│              Brain API (Bun + Hono, port 3000)              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ BrainAPI │  │ 检索引擎 │  │ Agent 层 │  │ 存储同步 │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
└────────────────────────┬────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
   ┌─────▼─────┐   ┌─────▼─────┐   ┌─────▼─────┐
   │ PostgreSQL │   │ 10 个 LLM │   │ Markdown  │
   │ + pgvector │   │  适配器   │   │  文件系统 │
   └───────────┘   └───────────┘   └───────────┘
```

### 项目结构

```
alethia/
├── shared/              # 全栈共享 TypeScript 类型
├── server/              # Bun + Hono 后端
│   ├── src/
│   │   ├── config/      # 配置加载、Zod 校验
│   │   ├── i18n/        # 中文 logger + 错误映射
│   │   ├── auth/        # Bearer Token 中间件
│   │   ├── db/          # pg 连接池、迁移、DAO
│   │   ├── storage/     # Markdown 解析、Delta 同步
│   │   ├── llm/         # 10 家 LLM 适配器 + 路由
│   │   ├── retrieval/   # 向量/全文/RRF/图谱/意图路由
│   │   ├── agents/      # Planner/Retriever/Grader/Generator/Reflector
│   │   ├── brainapi/    # BrainAPI 统一服务层
│   │   └── routes/      # Hono 路由
│   ├── scripts/         # migrate / seed
│   └── skills/prompts/  # 4 个 Agent 提示词
├── web/                 # React + Vite 前端
│   └── src/
│       ├── routes/      # 问答/审核/图谱/仪表盘/设置等页面
│       ├── layouts/     # Shell + Sidebar + TopBar + StatusBar
│       ├── store/       # Auth / Theme / Settings Context
│       ├── lib/         # API client + TanStack Query
│       └── i18n/        # zh-CN / en 语言包
└── wiki/                # 种子 Markdown 内容
```

---

## 📚 技术文档

详细技术文档请查阅 `docs/` 目录：

| 编号 | 文档 | 说明 |
|------|------|------|
| 01 | [系统架构总览](docs/01_ARCHITECTURE.md) | 设计哲学、分层架构、核心数据流、技术栈总览 |
| 02 | [API 接口参考](docs/02_API_REFERENCE.md) | 36 个 REST API 端点详解，含请求/响应字段、错误码 |
| 03 | [数据库 Schema 详解](docs/03_DATABASE_SCHEMA.md) | 26 张表逐表说明、22 个索引总览、向量迁移机制 |
| 04 | [知识模型规范](docs/04_KNOWLEDGE_MODEL.md) | Compiled Truth Markdown 八区段规范、关系模型、版本控制 |
| 05 | [AI 流水线详解](docs/05_AI_PIPELINE.md) | Agent 五阶段编排、Dream Cycle、分级审核、预算控制 |
| 06 | [检索引擎技术详解](docs/06_RETRIEVAL_ENGINE.md) | 向量/全文/RRF/图谱/重排序/NER/NLI/意图路由 |
| 07 | [部署与运维指南](docs/07_DEPLOYMENT.md) | Docker 部署、本地开发、CLI/MCP、监控故障排查 |
| 08 | [开发指南](docs/08_DEV_GUIDE.md) | 项目结构、代码规范、调试技巧、测试指南、贡献规范 |

---

## 快速开始（Docker 一键部署）

### 1. 准备环境变量

```bash
cp .env.example .env
# 编辑 .env，至少填写 BRAIN_API_KEY（前端登录密钥）
```

### 2. 启动服务

```bash
docker compose up -d
```

启动过程：
1. PostgreSQL + pgvector 容器启动
2. `init` 容器执行数据库迁移和种子数据（一次性）
3. `server` 容器启动 Brain API（端口 3000）
4. `web` 容器启动 nginx 静态服务（端口 80）

### 3. 访问应用

打开浏览器访问 `http://localhost`，使用 `.env` 中设置的 `BRAIN_API_KEY` 登录。

### 4. 查看服务状态

```bash
# 查看所有容器
docker compose ps

# 查看后端日志
docker compose logs -f server

# 检查后端健康
curl http://localhost:3000/health
```

---

## 本地开发

### 依赖

- [Bun](https://bun.sh) >= 1.1
- [Node.js](https://nodejs.org) >= 20
- PostgreSQL 16 + pgvector 扩展（或使用 Docker 启动 postgres 服务）

### 启动开发服务器

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

前端开发服务器已配置 `/api` 代理到 `http://localhost:3000`，可直接访问 `http://localhost:5173`。

---

## 环境变量

完整变量见 [`.env.example`](.env.example)，关键项：

| 变量 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `DATABASE_URL` | `postgres://alethia:alethia@postgres:5432/alethia` | PostgreSQL 连接串 |
| `BRAIN_API_KEY` | - | **必填**，前端登录密钥（支持逗号分隔多个） |
| `BRAIN_PORT` | `3000` | 后端服务端口 |
| `LANGUAGE` | `zh-CN` | 系统语言 |
| `DAILY_BUDGET` | `5` | 日预算上限（美元） |
| `MONTHLY_BUDGET` | `50` | 月预算上限（美元） |
| `PER_QUERY_BUDGET` | `0.5` | 单次问答上限 |
| `EMBEDDING_PROVIDER` | `local` | 嵌入服务：`local`(MiniLM) 或厂商 ID |
| `NLI_PROVIDER` | `local` | NLI 预检：`local` 或 `hf-inference` |
| `BAILIAN_API_KEY` 等 | - | 10 家大模型密钥（按需配置） |

---

## API 端点

所有受保护接口需在 `Authorization` 头携带 `Bearer <BRAIN_API_KEY>`。

### 公开接口

| 方法 | 路径 | 说明 |
| :--- | :--- | :--- |
| `GET` | `/health` | 系统健康状态 |
| `POST` | `/api/auth/login` | 登录验证 |

### Brain API

| 方法 | 路径 | 说明 |
| :--- | :--- | :--- |
| `POST` | `/api/ask` | AI 问答（多轮反思） |
| `POST` | `/api/query` | L2 混合检索 |
| `GET` | `/api/graph` | 全图节点与边 |
| `GET` | `/api/diffs` | 待审核变更列表 |
| `POST` | `/api/diffs/:id/apply` | 应用变更 |
| `POST` | `/api/diffs/:id/reject` | 拒绝变更 |
| `POST` | `/api/rollback/:batchId` | 回滚自动变更批次 |
| `GET` | `/api/conversations/:id` | 对话历史 |
| `GET` | `/api/health-dashboard` | 仪表盘全量数据 |
| `POST` | `/api/rebuild-struct` | 重建知识库结构 |
| `POST` | `/api/extract-pending` | 提取待处理文件 |

### 配置管理

| 方法 | 路径 | 说明 |
| :--- | :--- | :--- |
| `GET` | `/api/settings` | 获取全局设置 |
| `PUT` | `/api/settings` | 更新设置 |
| `GET` | `/api/llm/adapters` | LLM 适配器状态 |
| `POST` | `/api/llm/test` | 测试适配器连通性 |

---

## 维护命令

```bash
# 重建知识库结构（重新解析所有 Markdown、生成嵌入、重建图谱）
curl -X POST http://localhost:3000/api/rebuild-struct \
  -H "Authorization: Bearer $BRAIN_API_KEY"

# 触发数据库迁移
docker compose exec server bun run scripts/migrate.ts

# 写入种子数据
docker compose exec server bun run scripts/seed.ts

# 备份数据库
docker compose exec postgres pg_dump -U alethia alethia > backup.sql

# 查看 wiki 卷内容
docker compose run --rm -v wiki_data:/app/wiki alpine ls /app/wiki
```

---

## 技术栈

**后端**
- [Bun](https://bun.sh) 运行时
- [Hono](https://hono.dev) HTTP 框架
- [Kysely](https://kysely.dev) SQL 构建器
- [pg](https://node-postgres.com) + pgvector
- [pino](https://getpino.io) 日志
- [Zod](https://zod.dev) 校验

**前端**
- [React 18](https://react.dev) + [Vite 5](https://vitejs.dev)
- [TanStack Query v5](https://tanstack.com/query)
- [React Router v6](https://reactrouter.com)
- [Tailwind CSS 3](https://tailwindcss.com)
- [react-i18next](https://react.i18next.com)
- [Cytoscape.js](https://cytoscape.org) 图谱渲染
- [Phosphor Icons](https://phosphoricons.com)

**数据**
- PostgreSQL 16 + pgvector
- Markdown（Compiled Truth 格式）

---

## 许可

私有项目。
