import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { getPool } from '../src/db/pool';
import logger from '../src/i18n/logger';

// 兼容源码运行（scripts/migrate.ts）与打包后运行（dist/migrate.js）
// 打包后 __dirname 会指向 dist/，故改用 process.cwd() 相对路径
const MIGRATIONS_DIR = join(process.cwd(), 'src/db/migrations');

async function ensureMigrationsTable(client: any): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getAppliedMigrations(client: any): Promise<Set<string>> {
  const result = await client.query('SELECT name FROM _migrations ORDER BY name');
  return new Set(result.rows.map((row: any) => row.name));
}

async function applyMigration(client: any, name: string, sql: string): Promise<void> {
  logger.info(`正在执行迁移: ${name}`);
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('INSERT INTO _migrations (name) VALUES ($1)', [name]);
    await client.query('COMMIT');
    logger.info(`迁移完成: ${name}`);
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error({ err, migration: name }, '迁移执行失败');
    throw err;
  }
}

async function runMigrations(): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();

  // 并发锁：多实例同时启动时，确保只有一个实例执行迁移
  // 使用 session 级 advisory lock，连接关闭时自动释放；这里仍显式释放以尽快归还连接池
  const ADVISORY_LOCK_KEY = 7331;
  logger.info('正在获取迁移 advisory lock...');
  await client.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_KEY]);
  logger.info('已获取 advisory lock');

  try {
    await ensureMigrationsTable(client);
    const applied = await getAppliedMigrations(client);

    const files = readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort();

    let appliedCount = 0;
    for (const file of files) {
      if (!applied.has(file)) {
        const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8');
        await applyMigration(client, file, sql);
        appliedCount++;
      }
    }

    if (appliedCount === 0) {
      logger.info('所有迁移已执行，数据库已是最新状态');
    } else {
      logger.info(`共执行 ${appliedCount} 个迁移文件`);
    }
  } finally {
    // 显式释放 advisory lock，避免连接归还连接池后锁仍持有
    try {
      await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]);
    } catch (err) {
      logger.warn({ err }, '释放 advisory lock 失败（连接关闭时会自动释放）');
    }
    client.release();
  }
}

runMigrations()
  .then(() => {
    logger.info('数据库迁移完成');
    process.exit(0);
  })
  .catch((err) => {
    logger.fatal({ err }, '数据库迁移失败');
    process.exit(1);
  });
