import { readdirSync, readFileSync } from 'fs';
import { join, basename } from 'path';
import { getPool } from './pool';
import logger from '../i18n/logger';

/**
 * 按文件名排序执行所有未应用的 SQL 迁移文件。
 * 每个迁移在事务中执行，失败则回滚并终止。
 */
export async function runMigrations(): Promise<void> {
  const pool = getPool();
  const migrationsDir = join(import.meta.dirname, 'migrations');
  const ADVISORY_LOCK_KEY = 7331;

  // 读取所有 .sql 文件并按文件名排序
  const files = readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    logger.info('未找到迁移文件');
    return;
  }

  const client = await pool.connect();
  logger.info('正在获取迁移 advisory lock...');
  await client.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_KEY]);
  logger.info('已获取 advisory lock');

  try {
    // 获取已应用的迁移列表
    const { rows: applied } = await client.query(
      'SELECT name FROM _migrations ORDER BY name'
    );
    const appliedNames = new Set(applied.map((r: any) => r.name));

    let appliedCount = 0;
    for (const file of files) {
      if (appliedNames.has(file)) {
        continue;
      }

      const sql = readFileSync(join(migrationsDir, file), 'utf-8');
      logger.info(`正在执行迁移: ${file}`);

      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          'INSERT INTO _migrations (name) VALUES ($1)',
          [file]
        );
        await client.query('COMMIT');
        appliedCount++;
        logger.info(`迁移完成: ${file}`);
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        logger.error({ err, file }, `迁移失败: ${file}`);
        throw err;
      }
    }

    logger.info(`迁移执行完毕，新应用 ${appliedCount} 个迁移`);
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]);
    } catch (err) {
      logger.warn({ err }, '释放 advisory lock 失败（连接关闭时会自动释放）');
    }
    client.release();
  }
}