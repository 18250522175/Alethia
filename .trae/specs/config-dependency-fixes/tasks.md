# Tasks

- [x] Task 1: 为 shared 包添加 build 脚本
  - 在 `shared/package.json` 的 `scripts` 中添加 `"build": "echo 'shared: no build needed (types only)'"`
  - 确保根 `bun run build` 不会因 shared 失败

- [ ] Task 2: 为启动迁移执行器添加 advisory lock
  - 在 `server/src/db/migrate.ts` 中，参考 `server/scripts/migrate.ts` 的 advisory lock 实现
  - 在执行迁移前获取 `pg_advisory_lock(7331)`
  - 在 finally 块中释放锁

- [ ] Task 3: 修复 scripts/migrate.ts 硬编码路径
  - 将 `MIGRATIONS_DIR = join(process.cwd(), 'src/db/migrations')` 改为使用 `import.meta.dir` 或 `__dirname` 解析相对路径
  - 使用 `join(import.meta.dirname, '..', 'src/db/migrations')` 以确保路径正确

- [ ] Task 4: 清理重复依赖
  - 从根 `package.json` 的 `devDependencies` 中移除 `@tailwindcss/typography`（已在 web 中声明）

- [ ] Task 5: 补充 .gitignore
  - 添加 `bun.lockb` 条目

# Task Dependencies
- 所有任务互不依赖，可并行执行