/**
 * Drizzle Kit 配置 · 用于生成 migration / 推送 schema
 *
 * 用法：
 *   bunx drizzle-kit generate   # 根据本仓库 schema 生成 SQL migration
 *   bunx drizzle-kit push       # 直接将 schema 推送到数据库（开发环境）
 *   bunx drizzle-kit studio     # 启动可视化数据库浏览器
 *
 * 生产环境仍以 server/src/db/migrations/*.sql 为准，
 * Drizzle Kit 生成的 migration 可在 review 后合并到该目录。
 */

import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    // 仅在执行 drizzle-kit 命令时读取，运行时由 db/client.ts 通过 loadEnv 注入
    url: process.env.DATABASE_URL ?? 'postgres://alethia:alethia@localhost:5432/alethia'
  },
  verbose: true,
  strict: true
});
