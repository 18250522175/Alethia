# Checklist

## shared 包构建
- [x] `shared/package.json` 已添加 `build` 脚本
- [x] 根 `bun run build` 不会因 shared 包失败

## 启动迁移锁
- [x] `server/src/db/migrate.ts` 在迁移前获取 `pg_advisory_lock`
- [x] 锁在 finally 块中释放

## 迁移脚本路径
- [x] `server/scripts/migrate.ts` 使用 `import.meta.dirname` 解析路径
- [x] 不依赖 `process.cwd()` 为 server 目录

## 重复依赖清理
- [x] 根 `package.json` 中不再有 `@tailwindcss/typography`

## .gitignore
- [x] `.gitignore` 包含 `bun.lockb`

## 最终验证
- [x] `npx tsc --noEmit --project server/tsconfig.json` 无错误