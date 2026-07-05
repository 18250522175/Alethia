/**
 * Drizzle 客户端 · 类型安全的查询构建器入口
 *
 * 复用 db/pool.ts 中已有的 pg.Pool，确保连接池唯一。
 * 通过 `getDb()` 获取 NodePgDatabase 实例，所有 Repository 均基于此实例构建。
 */

import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { getPool } from './pool';
import * as schema from './schema';

export type Database = NodePgDatabase<typeof schema>;

let dbInstance: Database | null = null;

/** 获取 Drizzle 数据库实例（懒初始化，复用全局 pg.Pool）。 */
export function getDb(): Database {
  if (!dbInstance) {
    dbInstance = drizzle(getPool(), { schema });
  }
  return dbInstance;
}

export { schema };
