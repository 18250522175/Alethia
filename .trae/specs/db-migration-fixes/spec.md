# 数据库调试 Spec

## Why
项目迁移文件存在多项问题：缺少迁移执行器、重复建表定义、外键约束未使用 IF NOT EXISTS、命名冲突等。这导致数据库 schema 无法被程序化初始化和版本管理，生产部署依赖手动执行 SQL 文件。

## What Changes
- 实现迁移执行器，按序自动执行所有 SQL 迁移文件
- 修复 `budget_usage` 表在 0001 和 0006 中重复定义的问题
- 外键约束添加 `IF NOT EXISTS` 保护
- 清理冗余索引定义

## Impact
- Affected specs: 无
- Affected code: `server/src/index.ts`（新增迁移执行器调用）, `server/src/db/migrations/0001_init.sql`, `server/src/db/migrations/0006_add_missing_columns_and_tables.sql`

## ADDED Requirements

### Requirement: 迁移自动执行
系统 SHALL 在启动时自动按编号顺序执行所有未应用的 SQL 迁移文件，并记录已应用的迁移名到 `_migrations` 表。

#### Scenario: 首次启动
- **WHEN** 数据库中存在 `_migrations` 表且为空
- **THEN** 按文件名排序依次执行 `0001_init.sql` 到 `0011_add_ontology_tables.sql`，每执行一个记录到 `_migrations`

#### Scenario: 增量迁移
- **WHEN** 数据库已应用部分迁移（`_migrations` 有记录）
- **THEN** 仅执行尚未记录的迁移文件

### Requirement: 无重复表定义
系统 SHALL 确保每个表仅在单个迁移文件中定义。

#### Scenario: budget_usage 表重复
- **WHEN** `0001_init.sql` 和 `0006_add_missing_columns_and_tables.sql` 均定义了 `budget_usage` 表
- **THEN** 应从 `0001_init.sql` 中移除 `budget_usage` 定义（保留 0006 中的正确定义：`key VARCHAR(256)`, `cost DOUBLE PRECISION`）

### Requirement: 外键约束幂等
系统 SHALL 确保外键约束添加语句可重复执行不报错。

#### Scenario: 重复执行迁移
- **WHEN** 迁移文件被多次执行
- **THEN** `ALTER TABLE ... ADD CONSTRAINT` 语句不应因约束已存在而失败

## MODIFIED Requirements

### Requirement: 迁移文件命名
系统 SHALL 使用纯数字前缀命名迁移文件以确保正确排序。`0002a_add_aliases.sql` 重命名为 `0003_add_aliases.sql`，后续文件编号顺延。

## REMOVED Requirements
无