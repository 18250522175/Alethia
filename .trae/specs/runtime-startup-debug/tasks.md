# Tasks

- [x] Task 1: 修复 `server/src/db/migrate.ts` 中 `__dirname` 不可用问题
  - 将 `join(__dirname, 'migrations')` 改为 `join(import.meta.dirname, 'migrations')`
  - 确保 `runMigrations()` 在 ESM 环境下正确解析迁移文件路径

- [x] Task 2: 创建 `.env` 文件
  - 从 `.env.example` 复制为 `.env`
  - 确保 `DATABASE_URL` 等必要配置有默认值

- [x] Task 3: 修复 `server/src/config/schema.ts` 中 `SettingsSchema` 缺少 `llmConfig` 字段
  - 添加 `llmConfig: z.object({ defaultTemperature: z.number(), defaultMaxTokens: z.number(), defaultTopP: z.number() })`
  - 确保 `defaultSettings` 能通过 Zod 校验

- [x] Task 4: 清理 `server/package.json` 中冗余依赖
  - 移除 `bun-types`（保留 `@types/bun`）

- [x] Task 5: 验证 `bun run dev:server` 启动流程
  - 运行 `bun run src/index.ts` 检查启动是否无报错
  - 结果：无 JS 运行时错误，LLM 适配器初始化成功，PostgreSQL 连接重试中（预期行为）

- [x] Task 6: 验证 `bun run dev:web` 启动流程
  - 运行 `bunx vite --host` 检查 Vite 开发服务器是否能正常启动
  - 结果：155ms 启动成功，`http://localhost:5173/` 就绪

# Task Dependencies
- Task 1-4 互不依赖，可并行执行
- Task 5 依赖 Task 1-4 全部完成
- Task 6 独立，可与其他任务并行执行