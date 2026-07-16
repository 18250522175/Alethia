# Tasks

- [x] Task 1: 实现迁移执行器
  - 在 `server/src/db/` 中新增 `migrate.ts`
  - 读取 `migrations/` 目录下所有 `.sql` 文件，按文件名排序
  - 查询 `_migrations` 表获取已应用的迁移列表
  - 依次执行未应用的迁移，每个迁移执行后插入 `_migrations` 记录
  - 使用事务包裹每个迁移文件，失败则回滚并终止
  - 在 `server/src/index.ts` 启动时（`waitForDatabase` 之后）调用 `runMigrations()`

- [x] Task 2: 修复 `budget_usage` 表重复定义
  - 从 `0001_init.sql` 中移除 `budget_usage` 表定义（第 225-228 行）
  - 保留 `0006_add_missing_columns_and_tables.sql` 中的定义

- [x] Task 3: 外键约束添加 `IF NOT EXISTS` 保护
  - 在 `0001_init.sql` 第 255-261 行，将 `ALTER TABLE ... ADD CONSTRAINT ...` 改为 `ALTER TABLE ... DROP CONSTRAINT IF EXISTS ...; ALTER TABLE ... ADD CONSTRAINT ...;` 模式，或使用 `DO $$ ... END $$` 块检查约束是否存在

- [x] Task 4: 清理冗余索引
  - 从 `0004_advanced_search.sql` 中移除 `CREATE INDEX IF NOT EXISTS idx_pages_type ON pages(type)`（已在 0001_init.sql 中定义）

- [x] Task 5: 重命名迁移文件消除命名冲突
  - 将 `0002a_add_aliases.sql` 重命名为 `0003_add_aliases.sql`
  - 将 `0003_add_embed_cache.sql` 重命名为 `0004_add_embed_cache.sql`
  - 将 `0004_advanced_search.sql` 重命名为 `0005_advanced_search.sql`
  - 将 `0005_add_notifications.sql` 重命名为 `0006_add_notifications.sql`
  - 将 `0006_add_missing_columns_and_tables.sql` 重命名为 `0007_add_missing_columns_and_tables.sql`
  - 将 `0007_add_causal_tables.sql` 重命名为 `0008_add_causal_tables.sql`
  - 将 `0008_add_hypergraph_tables.sql` 重命名为 `0009_add_hypergraph_tables.sql`
  - 将 `0009_add_library_file_tags.sql` 重命名为 `0010_add_library_file_tags.sql`
  - 将 `0010_cleanup_unused_tables.sql` 重命名为 `0011_cleanup_unused_tables.sql`
  - 将 `0011_add_ontology_tables.sql` 重命名为 `0012_add_ontology_tables.sql`
  - 更新 `0002_schema_fixes.sql` 内注释中的文件名引用（如 `0006` 改为 `0007`）

# Task Dependencies
- Task 2, 3, 4, 5 可在 Task 1 之前并行执行（纯文件修改）
- Task 1 是独立的新文件创建