# Checklist

## ESM 兼容性
- [x] `server/src/db/migrate.ts` 使用 `import.meta.dirname` 而非 `__dirname`
- [x] `npx tsc --noEmit --project server/tsconfig.json` 无错误

## 环境变量
- [x] `.env` 文件存在于项目根目录
- [x] `.env` 包含 `DATABASE_URL` 配置

## Schema 完整性
- [x] `server/src/config/schema.ts` 的 `SettingsSchema` 包含 `llmConfig` 字段
- [x] `npx tsc --noEmit --project server/tsconfig.json` 无错误

## 依赖清理
- [x] `server/package.json` 的 `devDependencies` 中不再有 `bun-types`

## 启动验证
- [x] `bun run dev:server` 启动无 JS 运行时错误（数据库连接失败可接受）
- [x] `bun run dev:web` 启动 Vite 开发服务器成功