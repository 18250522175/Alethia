import { Hono } from 'hono';
import { brainAPI } from '../brainapi';
import logger from '../i18n/logger';
import { getErrorMessage } from '../i18n/errors.zh-CN';

const app = new Hono();

app.post('/api/rebuild-struct', async (c) => {
  try {
    const report = await brainAPI.rebuildStruct();
    return c.json(report);
  } catch (err) {
    logger.error({ err }, '结构重建失败');
    return c.json({
      error: {
        code: 'INTERNAL_ERROR',
        message: getErrorMessage('INTERNAL_ERROR')
      }
    }, 500);
  }
});

app.post('/api/extract-pending', async (c) => {
  try {
    const report = await brainAPI.extractPending();
    return c.json(report);
  } catch (err) {
    logger.error({ err }, '提取待处理文件失败');
    return c.json({
      error: {
        code: 'INTERNAL_ERROR',
        message: getErrorMessage('INTERNAL_ERROR')
      }
    }, 500);
  }
});

// 完整健康仪表盘：返回详细指标（规模、预算、AI 质量、待审核等），用于 DashboardPage
// 轻量级存活检查见 index.ts 的 /health 端点
app.get('/api/health-dashboard', async (c) => {
  try {
    const dashboard = await brainAPI.getHealth();
    return c.json(dashboard);
  } catch (err) {
    logger.error({ err }, '获取健康仪表盘数据失败');
    return c.json({
      error: {
        code: 'INTERNAL_ERROR',
        message: getErrorMessage('INTERNAL_ERROR')
      }
    }, 500);
  }
});

export default app;
