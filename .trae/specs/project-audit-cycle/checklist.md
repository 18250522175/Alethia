# Checklist · 项目审计循环

每项验证通过后勾选。未通过项须在 `tasks.md` 新增修复任务并重验证。

## 审计轮次 1：验证上一轮修复完整性

### 1.1 `ts` → `created_at` 遗漏检查
- [x] `conversation_logs` 表的 SQL 查询中无 `ts` 列引用（除 `created_at as ts` 别名）
- [x] `knowledge_versions` 表的 SQL 查询中无 `ts` 列引用（除 `created_at as ts` 别名）
- [x] `auto_change_log` 表的 SQL 查询中无 `ts` 列引用（除 `created_at as ts` 别名）
- [x] 所有 `SELECT *` 查询所在表已正确迁移列名，代码访问使用正确名称
- [x] 所有 JavaScript 属性 `ts: r.ts` 在 SQL 使用 `created_at as ts` 别名后数据正确

### 1.2 `pages.title` 列引用验证
- [x] `sync.ts` 中 INSERT INTO `pages` 包含 `title` 列
- [x] `brainapi/index.ts` 中所有 SELECT `pages.title` 的查询正确
- [x] `routes/brainapi.ts` 中所有 `pages.title` 引用正确

### 1.3 `conversation_logs.compressed` 列验证
- [x] `routes/brainapi.ts` 中 `BOOL_OR(compressed)` 查询正常（DEFAULT false 保证新列可用）
- [x] `routes/brainapi.ts` 中 `UPDATE SET compressed = true` 正常
- [x] `saveConversation` INSERT 因 `compressed` 有 DEFAULT false 不会报错

## 审计轮次 2：新增表结构与代码对齐

### 2.1 `budget_usage` 对齐
- [x] `budget.ts` 中 INSERT 字段与 `budget_usage` 表列名一致（已修正：`key`/`cost`/`updated_at`）
- [x] `budget.ts` 中 SELECT 字段与 `budget_usage` 表列名一致
- [x] `ON CONFLICT (key)` 因 `key` 为 UNIQUE 约束正常工作

### 2.2 `eval_results` 对齐
- [x] `brainapi/index.ts` 中 `getHealth` 查询的字段与 `eval_results` 表列名一致
- [x] 查询的 `WHERE created_at > NOW() - INTERVAL '30 days'` 语法正确

## 审计轮次 3：全项目剩余模块扫描

### 3.1 `server/src/` 未覆盖模块
- [x] `ingest/` 各处理器错误处理完整
- [x] `agents/translate.ts` SQL 查询与 `evidence_translations` 表 Schema 一致
- [x] `agents/observe.ts` SQL 查询与 `observed_files` 表 Schema 一致
- [x] `agents/planner.ts` 无 SQL 查询
- [x] `agents/retriever.ts` SQL 查询与 `evidence_spans` 表 Schema 一致
- [x] `evolution/dream.ts` SQL 查询与 `pending_diffs`/`ghost_relations` 表 Schema 一致
- [x] `evolution/shadow.ts` SQL 查询与 `shadow_benchmarks` 表 Schema 一致
- [x] `routes/` 所有 SQL 查询与对应表 Schema 一致
- [x] `db/` 模块所有表均在迁移中定义

### 3.2 `web/src/` 前端代码
- [x] API 客户端方法与后端端点匹配
- [x] i18n 键值无缺失（zh-CN 与 en 均为 815 行）
- [x] 导入路径全部可解析

### 3.3 部署配置
- [x] `docker-compose.yml` 服务名与代码引用一致（nginx → `server:3000`）
- [x] `nginx.conf` 路由规则覆盖所有前端路由（SPA fallback 正常）
- [x] `init.sh` 路径与实际文件结构一致（`/app/server/dist/scripts/migrate.js`）
- [x] `Dockerfile.server` CMD 路径正确（`dist/src/index.js`）
- [x] `Dockerfile.web` 构建与部署流程正确