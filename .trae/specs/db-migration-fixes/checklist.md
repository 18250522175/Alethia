# Checklist

## 迁移执行器
- [x] `server/src/db/migrate.ts` 已创建，导出 `runMigrations()` 函数
- [x] 按文件名排序扫描 `migrations/` 目录下所有 `.sql` 文件
- [x] 查询 `_migrations` 表跳过已应用的迁移
- [x] 每个迁移在事务中执行，失败回滚
- [x] `server/src/index.ts` 在 `waitForDatabase` 之后调用 `runMigrations()`

## 重复定义修复
- [x] `0001_init.sql` 中的 `budget_usage` 表定义已移除
- [x] `0007` 中的 `budget_usage` 表定义保留

## 外键约束幂等
- [x] `0001_init.sql` 中外键 `ALTER TABLE ... ADD CONSTRAINT` 语句可重复执行不报错

## 冗余索引清理
- [x] `0005_advanced_search.sql` 中重复的 `idx_pages_type` 索引已移除

## 迁移文件命名
- [x] 所有迁移文件使用纯数字前缀（0001-0012），无 `0002a` 等非数字前缀
- [x] 迁移文件内部注释中的文件名引用已更新

## 最终验证
- [x] 迁移文件按文件名排序后顺序正确（0001 → 0012）
- [x] TypeScript 编译无错误（`npx tsc --noEmit` 通过）