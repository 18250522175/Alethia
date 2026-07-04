import { Hono } from 'hono';
import { defaultSettings } from '../config/defaults';
import { getErrorMessage } from '../i18n/errors.zh-CN';
import logger from '../i18n/logger';
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

    const { getPool } = await import('../db/pool');
    const pool = getPool();
    await pool.query(`
      INSERT INTO settings (key, value, updated_at)
      VALUES ('global', $1::jsonb, NOW())
      ON CONFLICT (key) DO UPDATE SET
        value = EXCLUDED.value,
        updated_at = NOW()
    `, [JSON.stringify(settings)]);

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
