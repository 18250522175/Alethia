# Alethia AI 知识库 v5.0 — 全面审计与修复计划

## 一、项目概述

本计划针对 `/workspace` 下的 **Alethia AI 知识库融合架构 v5.0** 项目进行全面审计，发现并修复所有问题。

项目由以下部分组成：
- `server/` — Bun 后端服务（BrainAPI + 知识库管理）
- `web/` — React 前端（知识库 UI）
- `shared/` — 共享 TypeScript 类型定义
- `docs/` — 架构文档
- `wiki/` — 内置知识库

---

## 二、审计发现的问题清单

### 🔴 P0 — 关键缺陷（运行时错误 / 系统不可用）

#### 问题 #1：`pages` 表缺少 `title` 列

- **文件**：`server/src/db/migrations/0001_init.sql` （创建 `pages` 表）
- **影响范围**：`server/src/storage/sync.ts`、`server/src/brainapi/index.ts`、`server/src/routes/brainapi.ts`
- **问题描述**：迁移脚本创建 `pages` 表时没有 `title` 列，但代码中大量 SQL 查询引用了 `pages.title`，包括：
  - `sync.ts` 第 84-108 行 INSERT 语句
  - `brainapi/index.ts` 中的 `getBacklinks`、`searchEntities`、`getEntityPreview`、`search` 等查询
  - `routes/brainapi.ts` 中的页面列表和 Wiki 页面查询
- **后果**：所有涉及 `pages.title` 的 SQL 查询都会在运行时失败（PostgreSQL 报错：column "title" does not exist）

#### 问题 #2：`conversation_logs` 表列名 `ts` → `created_at` 迁移后不一致

- **文件**：`server/src/routes/brainapi.ts`（第 192、203 行）
- **影响范围**：对话历史 API
- **问题描述**：迁移 `0002_schema_fixes.sql` 将 `conversation_logs.ts` 重命名为 `created_at`，但 `routes/brainapi.ts` 中的 `getConversations` 和 `getConversation` 查询仍使用 `ts` 列名。
- **具体代码**：
  - `getConversations`（第 192 行）：`GROUP BY conversation_id ORDER BY MAX(ts) DESC` → 应为 `MAX(created_at)`
  - `getConversation`（第 203 行）：`MAX(ts) as updated_at` → 应为 `MAX(created_at)`
- **后果**：`conversation_logs` 相关 API 在运行迁移 0002 后全部报错

#### 问题 #3：`conversation_logs` 表缺少 `compressed` 列

- **文件**：`server/src/routes/brainapi.ts`（第 200、242-243 行）
- **影响范围**：对话压缩功能
- **问题描述**：查询和更新使用了 `compressed` 列（`BOOL_OR(compressed)` 和 `SET compressed = true`），但 `conversation_logs` 表在所有迁移脚本中均未定义此列。
- **后果**：对话压缩功能完全不可用，运行时 SQL 报错

#### 问题 #4：`sync.ts` 中 `knowledge_versions` 插入仍用 `ts` 列名

- **文件**：`server/src/storage/sync.ts`（第 176-178 行）
- **影响范围**：Wiki 同步功能
- **问题描述**：`syncVersions` 函数 INSERT 语句使用 `ts` 列，但迁移 0002 已将其重命名为 `created_at`。
- **后果**：Wiki 同步到版本表时报错，同步功能不可用

#### 问题 #5：`eval_results` 表不存在

- **文件**：`server/src/brainapi/index.ts`（第 270-271 行）
- **影响范围**：健康检查 API `/api/health-dashboard`
- **问题描述**：`getHealth` 函数查询 `eval_results` 表，但所有迁移脚本均未创建此表。
- **后果**：健康检查 API 报错 `/api/health-dashboard`

#### 问题 #6：`budget_usage` 表不存在

- **文件**：`server/src/evolution/budget.ts`
- **影响范围**：预算管理功能
- **问题描述**：`BudgetManager` 使用 `budget_usage` 表记录开销，但所有迁移脚本均未创建此表。
- **后果**：预算管理功能完全不可用

---

### 🟡 P1 — 高优先级（功能缺陷 / 逻辑错误）

#### 问题 #7：`applyDiff` 返回硬编码 `newVersion: 1`

- **文件**：`server/src/brainapi/index.ts`（第 472 行）
- **问题描述**：`applyDiff` 方法中正确计算了 `nextVersion`（第 435 行），但返回时却硬编码 `newVersion: 1`。应返回 `nextVersion` 的实际值。
- **后果**：前端显示的版本号始终为 1，与实际版本不符

#### 问题 #8：`embedProxy` 使用 `xml2js` 但未声明依赖

- **文件**：`server/src/brainapi/index.ts`（第 1875 行）
- **问题描述**：`embedProxy` 函数处理 `rss` 类型时动态 `require('xml2js')`，但 `xml2js` 未在 `server/package.json` 的 `dependencies` 中声明。
- **后果**：RSS feed 代理功能在运行时因找不到模块而失败

#### 问题 #9：`Dockerfile.server` 注释与代码不一致

- **文件**：`Dockerfile.server`（第 84 行）
- **问题描述**：Healthcheck 注释写"用 wget"，但实际命令使用 `curl -sf`。虽然 `curl` 已在之前安装，但注释会产生误导。
- **后果**：维护时可能产生混淆

---

### 🔵 P2 — 中优先级（代码质量 / 潜在风险）

#### 问题 #10：`RateLimiter` 使用普通对象存储记录

- **文件**：`server/src/middleware/rate-limit.ts`
- **问题描述**：`store` 使用普通对象 `{}` 而非 `Map`，虽然有定时清理但无法处理 `__proto__` 键注入等边缘情况。
- **后果**：极低风险的潜在安全问题

#### 问题 #11：`atomWrite` 备份路径在异常时未清理

- **文件**：`server/src/storage/markdown.ts`
- **问题描述**：`atomWrite` 函数在写入失败时创建 `.bak` 文件但未在 catch 块中清理，可能导致残留备份文件。
- **后果**：磁盘上积累无效备份文件

#### 问题 #12：`Dockerfile.server` 中 Healthcheck 使用 `curl -sf` 但缺少 `--max-time` 参数

- **文件**：`Dockerfile.server`
- **问题描述**：Healthcheck 缺少超时控制，网络异常时可能阻塞。
- **后果**：Docker 健康检查可能超时

---

### 🟢 P3 — 低优先级（文档 / 配置 / 优化）

#### 问题 #13：`.env.example` 与实际配置不完全一致

- **文件**：`.env.example`
- **问题描述**：部分环境变量（如 `LLM_ROUTER_STRATEGY`）在代码中没有实际使用对应检查。
- **后果**：配置混乱

#### 问题 #14：`shared/types/index.ts` 使用 `.js` 扩展名导出

- **文件**：`shared/types/index.ts`
- **问题描述**：导出语句使用 `'./ask.js'` 等形式，虽然 ESM 打包器支持，但源码检查工具可能报错。
- **后果**：潜在的 IDE 类型提示问题

---

## 三、修复方案

### 修复顺序：按 P0 → P1 → P2 → P3 依次进行

### 步骤 1：修复 P0 问题（数据库 Schema 缺陷）

#### 1.1 创建新迁移脚本 `0006_add_missing_columns_and_tables.sql`

这是本次修复的核心，需要一次性添加所有缺失的数据库对象：

```sql
-- 添加 pages.title 列
ALTER TABLE pages ADD COLUMN IF NOT EXISTS title VARCHAR(512) NOT NULL DEFAULT '';

-- 添加 conversation_logs.compressed 列
ALTER TABLE conversation_logs ADD COLUMN IF NOT EXISTS compressed BOOLEAN NOT NULL DEFAULT false;

-- 创建 eval_results 表
CREATE TABLE IF NOT EXISTS eval_results (
  id SERIAL PRIMARY KEY,
  test_name VARCHAR(255) NOT NULL,
  passed BOOLEAN NOT NULL DEFAULT false,
  score DOUBLE PRECISION,
  details JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 创建 budget_usage 表
CREATE TABLE IF NOT EXISTS budget_usage (
  id SERIAL PRIMARY KEY,
  provider VARCHAR(64) NOT NULL,
  model VARCHAR(128) NOT NULL,
  tokens INTEGER NOT NULL,
  cost DOUBLE PRECISION NOT NULL,
  endpoint VARCHAR(255),
  target VARCHAR(256),
  period VARCHAR(10) NOT NULL DEFAULT 'daily',
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_budget_usage_provider_model ON budget_usage(provider, model);
CREATE INDEX IF NOT EXISTS idx_budget_usage_period ON budget_usage(period);
CREATE INDEX IF NOT EXISTS idx_budget_usage_recorded_at ON budget_usage(recorded_at);
```

#### 1.2 修复 `routes/brainapi.ts` 中的列名引用

将 `ts` 替换为 `created_at`：

- 第 192 行：`GROUP BY conversation_id ORDER BY MAX(ts) DESC` → `GROUP BY conversation_id ORDER BY MAX(created_at) DESC`
- 第 203 行：`MAX(ts) as updated_at` → `MAX(created_at) as updated_at`

#### 1.3 修复 `sync.ts` 中的列名引用

- 第 176 行：`INSERT INTO knowledge_versions (slug, version, ts, change_summary, archived)` → `INSERT INTO knowledge_versions (slug, version, created_at, change_summary, archived)`

---

### 步骤 2：修复 P1 问题（功能缺陷）

#### 2.1 修复 `applyDiff` 返回硬编码版本号

- **文件**：`server/src/brainapi/index.ts` 第 472 行
- **修改**：`newVersion: 1` → `newVersion: nextVersion`

#### 2.2 添加 `xml2js` 依赖

- **文件**：`server/package.json`
- **修改**：在 `dependencies` 中添加 `"xml2js": "^0.6.2"`

#### 2.3 修正 `Dockerfile.server` 注释

- **文件**：`Dockerfile.server` 第 84 行
- **修改**：注释 `# 用 wget` → `# 用 curl`

---

### 步骤 3：修复 P2 问题（代码质量）

#### 3.1 将 RateLimiter 的 store 改为 Map

- **文件**：`server/src/middleware/rate-limit.ts`
- **修改**：`store: Record<string, ...>` → `store: Map<string, ...>`，并调整相关存取逻辑

#### 3.2 清理 atomWrite 失败时的备份文件

- **文件**：`server/src/storage/markdown.ts`
- **修改**：在 catch 块中添加删除 `.bak` 文件的逻辑

#### 3.3 为 Dockerfile Healthcheck 添加超时

- **文件**：`Dockerfile.server`
- **修改**：`curl -sf` → `curl -sf --max-time 5`

---

### 步骤 4：修复 P3 问题（文档和配置）

#### 4.1 对齐 `.env.example` 与环境变量

- **文件**：`.env.example`
- **修改**：移除未使用的环境变量，补充缺失的变量

#### 4.2 将 `shared/types/index.ts` 的导出改为 `.ts` 扩展名

- **文件**：`shared/types/index.ts`
- **修改**：所有 `'./xxx.js'` → `'./xxx'`（无扩展名），兼容 Bun 和 TypeScript 解析

---

## 四、验证步骤

修复完成后，按以下顺序验证：

1. **数据库迁移**：运行 `bun dist/scripts/migrate.js`，确认新迁移 `0006` 成功执行
2. **SQL 语法验证**：启动服务后，分别调用以下 API 确认无报错：
   - `GET /api/conversations` — 验证 `conversation_logs` 列名修复
   - `GET /api/pages` — 验证 `pages.title` 列可用
   - `GET /api/health-dashboard` — 验证 `eval_results` 表可用
   - `POST /api/brain/applyDiff` — 验证返回正确的 `newVersion`
3. **预算管理验证**：触发一次 LLM 调用，确认 `budget_usage` 记录正常写入
4. **对话压缩验证**：创建对话并触发压缩，确认 `compressed` 列正常更新
5. **RSS 代理验证**：使用 RSS 类型的 embed proxy，确认 `xml2js` 模块可用
6. **Wiki 同步验证**：修改 Wiki 文件并触发同步，确认 `knowledge_versions` 表正常写入
7. **Docker 健康检查**：构建 Docker 镜像并启动容器，确认健康检查正常通过

---

## 五、影响范围总结

| 修复项 | 影响文件 | 影响功能 |
|--------|----------|----------|
| 添加 `pages.title` | `0006...sql`（新） | 所有页面查询、搜索、Wiki 页面 |
| 添加 `conversation_logs.compressed` | `0006...sql`（新） | 对话压缩 |
| 创建 `eval_results` 表 | `0006...sql`（新） | 健康检查仪表盘 |
| 创建 `budget_usage` 表 | `0006...sql`（新） | 预算管理 |
| 修复 `ts` → `created_at` | `routes/brainapi.ts` | 对话历史 API |
| 修复 `ts` → `created_at` | `sync.ts` | Wiki 同步 |
| 修复 `applyDiff` 返回值 | `brainapi/index.ts` | 版本管理 |
| 添加 `xml2js` 依赖 | `server/package.json` | RSS 代理 |
| 优化 RateLimiter | `rate-limit.ts` | 频率限制 |
| 优化 atomWrite | `markdown.ts` | 文件写入 |
| 修复 Dockerfile | `Dockerfile.server` | 容器部署 |
| 修复类型导出 | `shared/types/index.ts` | 类型定义 |
| 修复文档 | `.env.example` | 配置文档 |

---

## 六、关联性分析

各问题之间存在以下关联：

1. **问题 #1（pages.title）** 与 **问题 #7（applyDiff）** 都涉及版本管理和页面查询，修复后需联合验证页面 CRUD 功能。
2. **问题 #2（ts → created_at）** 与 **问题 #3（compressed 列）** 都涉及 `conversation_logs` 表，修复需在同一迁移中完成。
3. **问题 #4（sync.ts 的 ts）** 与 **问题 #2** 是同一类问题（列名迁移后不一致），但分属不同文件。
4. **问题 #5（eval_results）** 与 **问题 #6（budget_usage）** 都是缺失表，在同一个迁移脚本中创建，无交叉依赖。
5. 所有 P0 修复完成后，需逐一验证 P1-P3 修复是否引入新的关联问题。

---

## 七、假设与决策

1. **假设**：数据库中 `pages` 表现在没有 `title` 列，需要 ALTER TABLE 添加。
2. **假设**：`eval_results` 表结构按标准评测结果设计（test_name、passed、score、details、created_at）。
3. **假设**：`budget_usage` 表结构按 `BudgetManager` 代码中的查询模式设计。
4. **决策**：所有 P0 修复集中在一个迁移脚本 `0006` 中，避免多次迁移的复杂性。
5. **决策**：P2 优化（RateLimiter 改为 Map）需要谨慎，确保不影响现有频率限制逻辑。