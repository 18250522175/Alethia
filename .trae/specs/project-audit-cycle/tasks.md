# Tasks · 项目审计循环

按审计目标顺序执行。每个任务完成后验证无延申问题再进入下一任务。

## 审计轮次 1：验证上一轮修复完整性

- [x] Task 1.1：全面扫描 `ts` → `created_at` 遗漏引用
  - [x] 搜索 `conversation_logs` 表的所有 SQL 查询，确认无遗漏 `ts` 列引用
  - [x] 搜索 `knowledge_versions` 表的所有 SQL 查询，确认无遗漏 `ts` 列引用
  - [x] 搜索 `auto_change_log` 表的所有 SQL 查询，确认无遗漏 `ts` 列引用
  - [x] 验证 `SELECT *` 查询不受列名影响（pg 返回实际列名）
  - [x] 验证 JavaScript 属性别名 `ts: r.ts` 在 SQL 改为 `created_at as ts` 后仍正确

- [x] Task 1.2：验证 `pages.title` 列引用完整性
  - [x] 搜索所有引用 `pages.title` 的 SQL 查询，确认迁移 `0006` 添加列后全部可用
  - [x] 检查 `sync.ts` 中的 INSERT 语句是否包含 `title` 列
  - [x] 检查 `brainapi/index.ts` 中的 SELECT 查询是否使用 `title` 列

- [x] Task 1.3：验证 `conversation_logs.compressed` 列引用
  - [x] 确认 `routes/brainapi.ts` 中 `BOOL_OR(compressed)` 和 `UPDATE SET compressed = true` 与新列兼容
  - [x] 确认 `saveConversation` INSERT 因 `compressed` 有 DEFAULT false 不会报错

## 审计轮次 2：新增表结构与代码对齐

- [x] Task 2.1：检查 `budget_usage` 表与 `budget.ts` 代码对齐
  - [x] 读取 `server/src/evolution/budget.ts` 的 INSERT/SELECT 语句
  - [x] 发现并修复：表结构不匹配（`key`/`cost`/`updated_at` vs 错误的 `provider`/`model`/`tokens` 等）
  - [x] 修正迁移 `0006` 中 `budget_usage` 表定义

- [x] Task 2.2：检查 `eval_results` 表与 `brainapi/index.ts` 代码对齐
  - [x] 读取 `server/src/brainapi/index.ts` 中 `getHealth` 的 `eval_results` 查询
  - [x] 确认 `eval_results` 表字段与查询中使用的字段名一致

## 审计轮次 3：全项目剩余模块扫描

- [x] Task 3.1：扫描 `server/src/` 未覆盖模块
  - [x] `ingest/` 模块：各模态处理器错误处理完整
  - [x] `agents/` 模块：`translate.ts`、`observe.ts` 的 SQL 查询与迁移 Schema 一致
  - [x] `evolution/` 模块：`dream.ts`、`shadow.ts` 的 SQL 查询与迁移 Schema 一致
  - [x] `routes/` 模块：所有路由文件 SQL 查询与迁移 Schema 一致
  - [x] `db/` 模块：所有表均在迁移中定义，列名匹配

- [x] Task 3.2：扫描 `web/src/` 前端代码
  - [x] 检查 API 客户端方法与后端端点对齐
  - [x] 检查 i18n 键值完整性（zh-CN 与 en 均为 815 行，键值结构一致）
  - [x] 检查导入路径正确性

- [x] Task 3.3：扫描部署配置
  - [x] 检查 `docker-compose.yml` 与服务配置一致性
  - [x] 检查 `nginx.conf` 与前端路由兼容性
  - [x] 检查 `init.sh` 与迁移脚本路径一致性（`/app/server` → `bun dist/scripts/migrate.js`）

# Task Dependencies
- Task 1.1–1.3 可并行
- Task 2.1–2.2 可并行
- Task 3.1–3.3 可并行
- 审计轮次 2 依赖轮次 1 完成
- 审计轮次 3 依赖轮次 2 完成