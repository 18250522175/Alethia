import { Hono } from 'hono';
import { defaultSettings } from '../config/defaults';
import { getErrorMessage } from '../i18n/errors.zh-CN';
import logger from '../i18n/logger';
import { getApiKeys } from '../auth/bearer';
import type { Settings } from '@shared/index';

const app = new Hono();

app.get('/api/settings', async (c) => {
  try {
    const { getPool } = await import('../db/pool');
    const pool = getPool();
    const result = await pool.query('SELECT value FROM settings WHERE key = $1', ['global']);

    let settings: Settings;
    if (result.rows.length > 0) {
      settings = JSON.parse(result.rows[0].value);
    } else {
      settings = defaultSettings;
    }

    // API 密钥统一以环境变量 BRAIN_API_KEY 为唯一来源
    const envKeys = getApiKeys();
    settings.security.apiKey = envKeys.join(',') ?? '';

    return c.json({ settings });
  } catch (err) {
    logger.error({ err }, '获取设置失败');
    return c.json({ settings: defaultSettings });
  }
});

app.put('/api/settings', async (c) => {
  try {
    const body = await c.req.json();
    const { settings } = body as { settings: Settings };

    // API 密钥由环境变量 BRAIN_API_KEY 统一管理，避免与 settings 重复存储
    if (settings.security) {
      settings.security.apiKey = '';
    }

    const { getPool } = await import('../db/pool');
    const pool = getPool();
    await pool.query(`
      INSERT INTO settings (key, value, updated_at)
      VALUES ('global', $1::jsonb, NOW())
      ON CONFLICT (key) DO UPDATE SET
        value = EXCLUDED.value,
        updated_at = NOW()
    `, [JSON.stringify(settings)]);

    // 响应中始终返回环境变量中的实际 API 密钥
    settings.security.apiKey = getApiKeys().join(',') ?? '';

    return c.json({ success: true, settings });
  } catch (err) {
    logger.error({ err }, '保存设置失败');
    return c.json({
      error: {
        code: 'INTERNAL_ERROR',
        message: getErrorMessage('INTERNAL_ERROR')
      }
    }, 500);
  }
});

export default app;
