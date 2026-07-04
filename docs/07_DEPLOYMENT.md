# Alethia AI 知识库 v5.0 · 部署与运维指南

> 生成日期：2026-07-04
> 版本：v5.0

---

## 目录

1. [Docker 一键部署](#1-docker-一键部署)
2. [本地开发搭建](#2-本地开发搭建)
3. [配置详解](#3-配置详解)
4. [CLI 工具](#4-cli-工具)
5. [MCP 服务器](#5-mcp-服务器)
6. [监控运维](#6-监控运维)
7. [故障排查](#7-故障排查)

---

## 1. Docker 一键部署

### 1.1 环境要求

| 项目 | 最低要求 | 推荐配置 |
|------|---------|---------|
| Docker | 20.10+ | 最新稳定版 |
| Docker Compose | v2.0+ | v2.20+ |
| 内存 | 4 GB | 8 GB+ |
| 磁盘 | 10 GB | 50 GB+（取决于知识库规模） |
| 操作系统 | Linux / macOS / Windows（WSL2） | Linux（Ubuntu 22.04+） |

### 1.2 环境变量完整列表

在项目根目录创建 `.env` 文件，可基于 `.env.example` 修改。以下是完整的环境变量说明：

#### 基础配置

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `DATABASE_URL` | `postgres://alethia:alethia@postgres:5432/alethia` | PostgreSQL 数据库连接串 |
| `BRAIN_PORT` | `3000` | Brain API 后端服务监听端口 |
| `BRAIN_API_KEY` | （空） | 登录 API 密钥，前端登录时输入此值，**生产环境必须设置** |
| `LANGUAGE` | `zh-CN` | 全局语言，支持 `zh-CN` / `en` / `ja` |
| `NODE_ENV` | `development` | 运行环境，`development` / `production` / `test` |

#### 预算配置

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `DAILY_BUDGET` | `5` | 日预算上限（美元），超过后触发限流 |
| `MONTHLY_BUDGET` | `50` | 月预算上限（美元） |
| `PER_QUERY_BUDGET` | `0.5` | 单次问答预算上限（美元） |

#### LLM 适配器密钥（10 家厂商）

| 变量名 | 对应厂商 | 默认模型 |
|--------|---------|---------|
| `BAILIAN_API_KEY` | 阿里云百炼（通义千问） | `qwen-turbo` |
| `ZHIPU_API_KEY` | 智谱 AI（ChatGLM） | `glm-4-flash` |
| `MOONSHOT_API_KEY` | 月之暗面（Kimi / Moonshot） | `moonshot-v1-8k` |
| `ERNIE_API_KEY` | 百度文心一言 | `ernie-speed-128k` |
| `SPARK_API_KEY` | 科大讯飞星火 | `spark-lite` |
| `HUNYUAN_API_KEY` | 腾讯混元 | `hunyuan-lite` |
| `MINIMAX_API_KEY` | MiniMax | `abab6.5-chat` |
| `DEEPSEEK_API_KEY` | DeepSeek | `deepseek-chat` |
| `YI_API_KEY` | 零一万物 Yi | `yi-large` |
| `BAICHUAN_API_KEY` | 百川智能 | `Baichuan2-Turbo` |

> 至少配置一家 LLM 厂商的 API Key 才能使用智能问答功能。

#### 嵌入模型配置

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `EMBEDDING_PROVIDER` | `local` | 嵌入模型提供方，`local` 为本地 transformers.js 退化方案，或指定厂商适配器 ID |
| `EMBEDDING_MODEL` | `all-MiniLM-L6-v2` | 嵌入模型名称，`local` 模式下固定使用 all-MiniLM-L6-v2 |

#### 重排序配置

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `RERANKER_ENABLED` | `false` | 是否启用重排序（需要 Zerank API Key） |
| `ZERANK_API_KEY` | （空） | Zerank 重排序服务 API Key |

#### NLI 预检服务配置

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `NLI_PROVIDER` | `local` | NLI（自然语言推理）提供方，`hf-inference` 或 `local` |
| `HF_API_KEY` | （空） | Hugging Face Inference API Key，`NLI_PROVIDER=hf-inference` 时需要 |

### 1.3 init.sh 初始化流程

数据库初始化由 `init.sh` 脚本完成，该脚本由 docker-compose 的 `init` 服务一次性调用，执行三步流程：

```
[1/3] 等待 PostgreSQL 就绪
      ↓ 轮询 pg_isready，每 5 秒重试
[2/3] 执行数据库迁移
      ↓ bun run scripts/migrate.ts
[3/3] 写入种子数据
      ↓ bun run scripts/seed.ts
```

- 脚本使用 `set -e` 确保任何一步失败立即终止
- init 服务 `restart: "no"`，成功或失败后均不会自动重启
- 初始化完成后可通过 `docker logs alethia-init` 查看日志

### 1.4 Docker Compose 启动

项目包含 4 个服务：

| 服务 | 镜像/构建 | 端口 | 说明 |
|------|----------|------|------|
| `postgres` | `pgvector/pgvector:pg16` | `5432:5432` | PostgreSQL 数据库 + pgvector 扩展 |
| `server` | `Dockerfile.server` | `3000:3000` | Brain API 后端服务（Bun 运行时） |
| `web` | `Dockerfile.web` | `80:80` | Web 前端（nginx 静态服务 + API 反向代理） |
| `init` | `Dockerfile.server` | - | 一次性数据库初始化任务 |

#### 启动命令

```bash
# 1. 复制环境变量模板
cp .env.example .env

# 2. 编辑 .env，至少设置 BRAIN_API_KEY 和至少一个 LLM API Key
vim .env

# 3. 一键启动（后台运行）
docker compose up -d

# 4. 查看初始化进度
docker logs -f alethia-init

# 5. 查看所有服务状态
docker compose ps

# 6. 停止服务
docker compose down

# 7. 停止并删除数据卷（⚠️ 会丢失所有数据）
docker compose down -v
```

#### 服务启动顺序

```
postgres（健康检查通过）
    ↓
init（数据库迁移 + 种子数据）
    ↓
server（等待 postgres 健康）
    ↓
web（等待 server 健康）
```

### 1.5 健康检查

各服务均配置了健康检查：

| 服务 | 检查方式 | 间隔 | 超时 | 重试 | 启动宽限期 |
|------|---------|------|------|------|-----------|
| postgres | `pg_isready -U alethia -d alethia` | 5s | 5s | 10 次 | 10s |
| server | `curl -fs http://localhost:3000/health` | 30s | 5s | 3 次 | 30s |
| web | `wget -q -O- http://localhost/` | 30s | 5s | 3 次 | - |

**健康检查端点**：`GET /health`

通过 nginx 访问：`http://your-domain/health`
直接访问后端：`http://your-domain:3000/health`

返回示例：
```json
{
  "status": "ok",
  "timestamp": "2026-07-04T12:00:00.000Z"
}
```

---

## 2. 本地开发搭建

### 2.1 Bun 安装

Alethia 后端基于 Bun 运行时，需要 Bun 1.1+：

```bash
# macOS / Linux
curl -fsSL https://bun.sh/install | bash

# 验证安装
bun --version  # 应输出 1.1.x 或更高
```

> Windows 用户请使用 WSL2 或参考 [Bun 官方文档](https://bun.sh/docs/installation)。

### 2.2 PostgreSQL + pgvector

需要 PostgreSQL 16 + pgvector 扩展：

**方式一：Docker 启动数据库（推荐）**

```bash
docker run -d \
  --name alethia-postgres \
  -e POSTGRES_USER=alethia \
  -e POSTGRES_PASSWORD=alethia \
  -e POSTGRES_DB=alethia \
  -p 5432:5432 \
  pgvector/pgvector:pg16
```

**方式二：本地安装**

```bash
# Ubuntu / Debian
sudo apt install postgresql-16 postgresql-16-pgvector

# macOS（Homebrew）
brew install postgresql@16 pgvector
```

### 2.3 依赖安装

项目采用 monorepo 结构（Bun workspaces）：

```bash
# 克隆项目
git clone <repository-url>
cd alethia

# 安装所有依赖
bun install
```

依赖结构：
- `@alethia/shared` — 共享类型与工具
- `@alethia/server` — 后端 Brain API
- `@alethia/web` — 前端 React 应用

### 2.4 数据库迁移

```bash
# 设置环境变量
export DATABASE_URL=postgres://alethia:alethia@localhost:5432/alethia

# 执行迁移
cd server
bun run scripts/migrate.ts

# 写入种子数据
bun run scripts/seed.ts
```

### 2.5 启动开发服务器

```bash
# 启动后端开发服务器（端口 3000）
cd server
bun run dev

# 启动前端开发服务器（端口 5173，另开终端）
cd web
bun run dev
```

访问前端：`http://localhost:5173`
访问后端 API：`http://localhost:3000/api/`

---

## 3. 配置详解

### 3.1 数据库

**数据库类型**：PostgreSQL 16 + pgvector 扩展

**核心数据表**：
- `knowledge_pages` — 知识页面（节点）
- `knowledge_relations` — 知识关联（边）
- `evidence_spans` — 证据片段
- `conversation_logs` — 对话日志
- `pending_diffs` — 待审核变更
- `settings` — 全局设置
- `library_files` — 库文件元数据

**连接池**：通过 `pg` 连接池管理，默认配置可通过环境变量调整。

### 3.2 LLM 适配器（10 家）

系统支持 10 家国内主流大模型厂商，通过统一适配器接口调用：

| 适配器 ID | 厂商 | 默认模型 | 定位 |
|-----------|------|---------|------|
| `bailian` | 阿里云百炼 | `qwen-turbo` | 通用高速 |
| `zhipu` | 智谱 AI | `glm-4-flash` | 轻量高速 |
| `moonshot` | 月之暗面 | `moonshot-v1-8k` | 长文本 |
| `ernie` | 百度文心一言 | `ernie-speed-128k` | 长上下文 |
| `spark` | 科大讯飞星火 | `spark-lite` | 轻量 |
| `hunyuan` | 腾讯混元 | `hunyuan-lite` | 轻量 |
| `minimax` | MiniMax | `abab6.5-chat` | 通用 |
| `deepseek` | DeepSeek | `deepseek-chat` | 代码/推理 |
| `yi` | 零一万物 | `yi-large` | 高质量 |
| `baichuan` | 百川智能 | `Baichuan2-Turbo` | 通用 |

**模型任务分配**：系统支持按任务类型分配不同模型，包括：
- `fact_extract` — 事实抽取
- `whitelist_fix` — 白名单修正
- `disambiguate` — 消歧
- `nli_pre` — NLI 预检
- `translate` — 翻译
- `compress` — 压缩
- `archive_summary` — 归档摘要
- `ring_gen` — Ring 生成
- `contradiction` — 矛盾分析
- `gap_analysis` — 差距分析
- `narrate` — 叙述
- `qa_gen` — QA 生成
- `embed` — 嵌入

### 3.3 嵌入配置

**本地模式（默认）**：
- Provider: `local`
- 模型: `all-MiniLM-L6-v2`（384 维）
- 实现: transformers.js，纯 CPU 运行
- 适用场景：小规模知识库、离线部署、测试

**厂商模式**：
- 将 `EMBEDDING_PROVIDER` 设置为对应适配器 ID（如 `bailian`）
- 支持更高维度的嵌入模型，检索质量更优
- 需消耗对应厂商的 API 调用额度

### 3.4 预算配置

三级预算防护机制：

| 预算级别 | 环境变量 | 默认值 | 说明 |
|---------|---------|--------|------|
| 单次问答 | `PER_QUERY_BUDGET` | $0.5 | 单次问答的最大花费上限 |
| 日预算 | `DAILY_BUDGET` | $5 | 每日总花费上限，超限后当日拒绝新请求 |
| 月预算 | `MONTHLY_BUDGET` | $50 | 每月总花费上限，超限后当月拒绝新请求 |

**夜间熔断（nightlyFuse）**：默认开启，夜间任务（社区检测、矛盾分析等）会在预算紧张时自动降级或跳过。

### 3.5 检索配置

检索引擎采用多层级混合检索架构：

**检索层级（T0 / T1 / T2）**：
- **T0** — 页面级别检索，快速返回相关页面
- **T1** — 证据片段级别检索，精确匹配
- **T2** — 深度检索，含图谱扩展与多跳推理

**检索策略**：
- **向量检索**：基于 pgvector 的余弦相似度搜索
- **全文检索**：PostgreSQL 全文搜索（tsvector / tsquery）
- **RRF 融合**：Reciprocal Rank Fusion 算法融合多路结果
- **重排序**：可选 Zerank 重排序（需配置 API Key）
- **图谱扩展**：基于知识图谱的关联实体扩展

---

## 4. CLI 工具

Alethia 提供 `brain` 命令行工具，用于运维与管理操作。

### 使用方式

```bash
# Docker 环境中执行
docker exec -it alethia-server bun run src/cli/brain.ts <command>

# 本地开发环境
cd server
bun run src/cli/brain.ts <command>
```

> 以下命令说明中，`brain` 代指上述执行方式。

### 4.1 ask — 智能问答

```bash
brain ask <问题>
```

向知识库提问，获取 Markdown 格式答案与来源引用。

**示例**：
```bash
brain ask "熵是什么？"
```

**输出内容**：
- Markdown 格式答案
- 来源证据列表（span ID、所属页面、片段内容）
- 会话 ID、置信度、Token 用量、估算成本
- 相关实体列表

### 4.2 rebuild-struct — 重建知识库结构

```bash
brain rebuild-struct
```

清空缓存并重新同步 wiki / summaries / changelog，重建页面与链接结构。

**适用场景**：
- 手动修改了 wiki 目录下的文件
- 知识库结构出现异常
- 升级后数据结构变化

**输出**：重建的页面数、链接数、幽灵关系数、耗时。

### 4.3 extract-pending — 提取待处理文件

```bash
brain extract-pending
```

扫描观察目录中的待处理文件，触发事实抽取流程，生成待审核变更。

**输出**：处理文件数、创建的待审核变更数、错误列表。

### 4.4 archive-versions — 归档历史版本

```bash
brain archive-versions [slug]
```

归档活跃版本超过 50 条的页面最早若干条记录，保持数据库精简。

**参数**：
- `slug`（可选）：指定页面 slug，为空则扫描全部页面

**示例**：
```bash
brain archive-versions quantum-mechanics
```

### 4.5 clean-ghost-relations — 清理幽灵关系

```bash
brain clean-ghost-relations
```

清理已解决或超期的幽灵关系（指向不存在页面的链接）。

**输出**：清理的幽灵关系条数。

### 4.6 translate-evidence — 翻译证据片段

```bash
brain translate-evidence <spanIds...> [--lang=xx]
```

翻译指定的证据片段到目标语言。

**参数**：
- `spanIds` — 一个或多个证据片段 ID（必填）
- `--lang` — 目标语言代码，如 `en`、`zh-CN`（可选，默认使用系统语言设置）

**示例**：
```bash
brain translate-evidence span-1 span-2 --lang=en
```

### 4.7 generate-static-site — 生成静态站点

```bash
brain generate-static-site [outputPath]
```

将知识库导出为静态站点，可部署到任意静态文件服务器。

**参数**：
- `outputPath`（可选）：输出目录路径，默认使用配置的导出路径

**示例**：
```bash
brain generate-static-site ./site
```

### 4.8 dashboard-snapshot — 健康仪表盘快照

```bash
brain dashboard-snapshot
```

输出当前知识库健康状态快照，包含：

- **规模**：节点数、边数、观察文件数
- **审核积压**：绿/黄/红三级待审核变更数量
- **版本归档**：活跃版本数、归档版本数
- **幽灵关系**：待处理数量
- **预算**：日/月预算使用情况（含超限标记）
- **AI 质量**：正确性百分比
- **其他**：缓存命中率、断链证据、孤儿文件

### 4.9 help — 帮助信息

```bash
brain help
```

显示所有命令的帮助信息与使用示例。

---

## 5. MCP 服务器

MCP（Model Context Protocol）服务器允许外部 AI 客户端通过标准协议接入 Alethia 知识库。

### 5.1 工具数量

MCP 服务器提供 **30+ 个工具**，覆盖以下类别：

| 类别 | 工具数量 | 说明 |
|------|---------|------|
| 问答 / 检索 | 4 | ask_question, query, search, narrate |
| 图谱 | 2 | get_graph, get_graph_data |
| 待审核变更 | 5 | get_diffs, get_pending_diffs, apply_diff, reject_diff, rollback |
| 对话 / 反馈 | 3 | get_conversation, list_conversations, submit_feedback |
| 观察文件 / 证据 | 3 | list_observed_files, trigger_extraction, translate_evidence |
| 维护 | 2 | archive_versions, clean_ghost_relations |
| 草稿 / 静态站点 | 2 | generate_draft, generate_static_site |
| 健康 / 重建 / 提取 | 3 | get_health, rebuild_struct, extract_pending |
| 变更日志 / 评估 | 3 | get_changelog, get_eval_report, run_shadow_eval |
| 实体规则学习 | 1 | rule_learn |
| LLM 适配器 | 2 | list_adapters, test_adapter |
| 设置 | 2 | get_settings, update_settings |
| 时间线 | 1 | get_timeline |
| 库文件 | 2 | get_library_file, ingest_file |
| 基础工具 | 1 | ping |

### 5.2 运行模式

#### stdio 模式

通过标准输入输出来交换 JSON-RPC 消息，适合与本地 AI 客户端集成。

```bash
# 启动 stdio 模式 MCP 服务器
cd server
bun run src/mcp/server.ts stdio
```

- 从 `process.stdin` 读取 JSON-RPC 请求（每行一条）
- 将 JSON-RPC 响应写入 `process.stdout`
- 通知（无 id 的请求）静默忽略，不返回响应

#### HTTP 模式

通过 HTTP 接口提供 MCP 服务，适合远程调用或多客户端共享。

```bash
# 启动 HTTP 模式 MCP 服务器（默认端口 3100）
cd server
bun run src/mcp/server.ts http --port 3100
```

**端点**：
- `POST /mcp` — 接收 JSON-RPC 请求
- `GET /mcp` — 获取服务器信息（名称、版本、工具数量等）

**启动配置**：
- 在设置中开启 `integration.mcpHttpEnabled`
- 默认端口：`3100`（`integration.mcpHttpPort`）

### 5.3 集成方法

#### 协议规格

| 项目 | 值 |
|------|-----|
| 协议版本 | `2024-11-05` |
| 服务器名称 | `alethia-mcp` |
| 服务器版本 | `5.0.0` |
| 传输协议 | JSON-RPC 2.0 |

#### 支持的 Methods

| Method | 说明 |
|--------|------|
| `initialize` | 初始化握手，协商协议版本与能力 |
| `notifications/initialized` | 客户端初始化完成通知 |
| `tools/list` | 获取可用工具列表 |
| `tools/call` | 调用指定工具 |
| `ping` | 健康检查 |

#### 调用示例（HTTP 模式）

```bash
# 1. 初始化
curl -X POST http://localhost:3100/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": { "name": "my-client", "version": "1.0.0" }
    }
  }'

# 2. 获取工具列表
curl -X POST http://localhost:3100/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/list"
  }'

# 3. 调用工具：提问
curl -X POST http://localhost:3100/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "ask_question",
      "arguments": {
        "question": "什么是熵？",
        "maxReflections": 3
      }
    }
  }'
```

---

## 6. 监控运维

### 6.1 健康检查

**主动健康检查**：
- 容器级：Docker healthcheck 自动检测
- 应用级：`GET /health` 端点

**健康仪表盘**：通过 `dashboard-snapshot` CLI 命令或 `get_health` MCP 工具获取全面的健康状态。

**关键监控指标**：
- 数据库连接状态
- 预算使用比例（日/月）
- 待审核变更积压量（绿/黄/红）
- 幽灵关系数量
- 缓存命中率
- 断链证据数
- AI 回答正确率

### 6.2 日志格式

系统采用结构化日志（JSON 格式），便于日志收集与分析。

**日志级别**：
- `fatal` — 致命错误，进程退出
- `error` — 错误，功能不可用
- `warn` — 警告，功能降级
- `info` — 一般信息
- `debug` — 调试信息

**查看日志**：
```bash
# Docker 环境
docker logs -f alethia-server
docker logs -f alethia-web
docker logs -f alethia-postgres

# 查看最近 100 行
docker logs --tail 100 alethia-server
```

### 6.3 预算告警

**预算超限检测**：
- 日预算超限：当日所有 AI 调用将被拒绝，返回预算不足错误
- 月预算超限：当月所有 AI 调用将被拒绝
- 单次预算超限：单次问答会被中断或降级

**告警建议**：
- 监控预算使用比例，达到 80% 时触发预警
- 设置合理的预算阈值，避免意外超额
- 可通过 `dashboard-snapshot` 随时查看当前预算使用情况

### 6.4 影子评估

系统支持影子评估（Shadow Evaluation）机制，用于监测 AI 回答质量：

```bash
# 运行影子评估
brain dashboard-snapshot  # 查看 AI 质量指标
# 或通过 MCP 调用 run_shadow_eval
```

**评估内容**：
- 回答正确性比例
- 异常案例检测
- 基准测试对比
- 质量趋势分析

**评估周期**：每周自动运行一次（可配置 `weeklyEvalDay`）。

### 6.5 备份策略

#### 数据卷说明

Docker Compose 配置了以下持久化数据卷：

| 卷名 | 挂载路径 | 内容 |
|------|---------|------|
| `postgres_data` | `/var/lib/postgresql/data` | 数据库数据 |
| `wiki_data` | `/app/wiki` | Wiki 页面文件 |
| `library_data` | `/app/server/data/library` | 库文件（上传的文档） |
| `changelog_data` | `/app/server/data/changelog` | 变更日志 |
| `raw_data` | `/app/server/data/raw` | 原始文件 |
| `summaries_data` | `/app/server/data/summaries` | 摘要数据 |

#### 备份建议

**数据库备份**（最重要）：
```bash
# 导出数据库备份
docker exec alethia-postgres pg_dump -U alethia -d alethia > backup_$(date +%Y%m%d).sql

# 恢复数据库
docker exec -i alethia-postgres psql -U alethia -d alethia < backup_20260704.sql
```

**文件备份**：
```bash
# 备份所有数据卷到 tar 文件
docker run --rm \
  -v alethia_postgres_data:/data/postgres \
  -v alethia_wiki_data:/data/wiki \
  -v alethia_library_data:/data/library \
  -v /backup:/backup \
  alpine tar czf /backup/alethia_full_$(date +%Y%m%d).tar.gz /data
```

**备份频率建议**：
- 数据库：每日自动备份，保留 30 天
- 文件数据：每周备份，保留 8 周
- 升级前：务必做一次完整备份

---

## 7. 故障排查

### 7.1 容器启动失败

**问题**：`docker compose up` 后某个服务一直重启或退出。

**排查步骤**：
```bash
# 查看服务状态
docker compose ps

# 查看具体容器日志
docker logs alethia-server
docker logs alethia-init

# 检查端口是否被占用
sudo lsof -i :3000
sudo lsof -i :5432
sudo lsof -i :80
```

**常见原因**：
- 端口被占用 → 修改 `docker-compose.yml` 中的端口映射
- 内存不足 → 增加 Docker 内存限制或释放内存
- 权限问题 → 检查数据卷目录权限

### 7.2 数据库连接失败

**问题**：后端服务日志显示数据库连接错误。

**排查步骤**：
```bash
# 检查 postgres 容器状态
docker ps | grep postgres

# 检查数据库是否可连接
docker exec -it alethia-postgres pg_isready -U alethia -d alethia

# 检查 DATABASE_URL 环境变量
docker exec alethia-server env | grep DATABASE_URL
```

**常见原因**：
- PostgreSQL 尚未就绪 → 等待 healthcheck 通过（通常 10-30 秒）
- 密码不匹配 → 检查 `.env` 与 `docker-compose.yml` 中的配置
- 网络问题 → 确保容器在同一 network 中

### 7.3 智能问答不可用

**问题**：提问时返回错误或无结果。

**排查步骤**：
```bash
# 检查后端日志
docker logs -f alethia-server

# 检查 LLM 适配器状态（通过 MCP）
curl -X POST http://localhost:3100/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_adapters"}}'

# 测试指定适配器连通性
curl -X POST http://localhost:3100/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"test_adapter","arguments":{"adapterId":"bailian"}}}'
```

**常见原因**：
- 未配置任何 LLM API Key → 在 `.env` 中设置至少一个厂商的 API Key
- API Key 无效 → 检查 Key 是否正确，是否已激活
- 预算超限 → 检查 `dashboard-snapshot` 中的预算使用情况
- 网络问题 → 确保服务器能访问对应厂商的 API 端点

### 7.4 检索结果不准确

**问题**：搜索结果不相关或缺少关键信息。

**排查步骤**：
```bash
# 重建知识库结构
brain rebuild-struct

# 触发文件重新提取
brain extract-pending

# 检查嵌入模型配置
docker exec alethia-server env | grep EMBEDDING
```

**常见原因与解决方案**：
- 文档尚未被索引 → 运行 `extract-pending` 处理待提取文件
- 嵌入模型质量不足 → 切换到厂商级嵌入模型
- 知识库内容不足 → 添加更多相关文档
- 检索参数不适配 → 调整 topK、启用重排序或图谱扩展

### 7.5 预算超限

**问题**：所有 AI 调用返回预算不足错误。

**排查步骤**：
```bash
# 查看当前预算使用情况
brain dashboard-snapshot
```

**解决方案**：
1. 临时方案：调高预算上限（修改 `.env` 并重启服务）
2. 长期方案：
   - 调整模型分配，使用更便宜的模型处理低优先级任务
   - 开启 `nightlyFuse` 以降低夜间任务消耗
   - 优化检索参数，减少单次问答的反思轮数
   - 升级 API 套餐以获取更优惠的价格

### 7.6 前端页面无法访问

**问题**：浏览器访问域名/IP 无法打开页面。

**排查步骤**：
```bash
# 检查 web 容器状态
docker compose ps web

# 检查 nginx 日志
docker logs alethia-web

# 检查端口 80 是否监听
docker exec alethia-web netstat -tlnp | grep :80

# 测试后端 API 是否正常
curl http://localhost:3000/health
```

**常见原因**：
- web 容器未启动 → 查看日志排查启动失败原因
- 80 端口被占用 → 修改端口映射或停止占用进程
- 后端服务未就绪 → 等待 server 服务健康检查通过
- 防火墙问题 → 开放 80 端口或使用反向代理

### 7.7 MCP 服务器无法连接

**问题**：MCP 客户端无法连接到服务器。

**排查步骤**：
```bash
# 检查 MCP HTTP 是否启用（查看设置）
curl -X POST http://localhost:3100/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"ping"}'

# stdio 模式：检查进程是否在运行
ps aux | grep mcp
```

**常见原因**：
- HTTP 模式未启用 → 在设置中开启 `integration.mcpHttpEnabled`
- 端口未开放 → 检查防火墙与安全组
- 协议版本不匹配 → 确保客户端使用 `2024-11-05` 协议版本

---

> 如遇本文档未覆盖的问题，请检查：
> 1. 各容器日志（`docker logs <container>`）
> 2. 健康仪表盘（`brain dashboard-snapshot`）
> 3. 环境变量配置（`.env` 文件）
