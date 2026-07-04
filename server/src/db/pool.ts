import { Pool } from 'pg';
import { loadEnv } from '../config/loader';
import logger from '../i18n/logger';

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    const env = loadEnv();
    pool = new Pool({
      connectionString: env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000
    });

    pool.on('error', (err) => {
      logger.error({ err }, 'PostgreSQL 连接池发生错误');
    });
  }
  return pool;
}

export async function waitForDatabase(
  maxRetries: number = 30,
  intervalMs: number = 1000
): Promise<void> {
  const client = getPool();
  let lastError: Error | null = null;

  for (let i = 1; i <= maxRetries; i++) {
    try {
      await client.query('SELECT 1');
      logger.info(`成功连接到 PostgreSQL (${i}/${maxRetries})`);
      return;
    } catch (err) {
      lastError = err as Error;
      logger.warn(`正在重试连接 PostgreSQL (${i}/${maxRetries})...`);
      if (i < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, intervalMs));
      }
    }
  }

  logger.fatal({ err: lastError }, '无法连接到 PostgreSQL，请检查 DATABASE_URL 与容器健康状态');
  process.exit(1);
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
