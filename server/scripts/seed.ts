import { defaultSettings } from '../src/config/defaults';
import { getPool } from '../src/db/pool';
import logger from '../src/i18n/logger';

async function seedSettings(client: any): Promise<void> {
  const result = await client.query('SELECT COUNT(*) as count FROM settings');
  if (result.rows[0].count > 0) {
    logger.info('设置表已有数据，跳过种子数据');
    return;
  }

  const settingsJson = JSON.stringify(defaultSettings);
  await client.query(
    'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING',
    ['global', settingsJson]
  );
  logger.info('默认设置已写入');
}

async function seedWikiFiles(): Promise<void> {
  logger.info('种子 wiki 文件已存在于 wiki/ 目录，后续由 rebuild-struct 同步到数据库');
}

async function runSeed(): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    logger.info('开始执行种子数据...');

    await seedSettings(client);
    await seedWikiFiles();

    logger.info('种子数据执行完成');
  } finally {
    client.release();
  }
}

runSeed()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    logger.fatal({ err }, '种子数据执行失败');
    process.exit(1);
  });
