import { Hono } from 'hono';
import { llmRouter } from '../llm/router';
import { getErrorMessage } from '../i18n/errors.zh-CN';
import logger from '../i18n/logger';

const app = new Hono();

app.get('/api/llm/adapters', (c) => {
  try {
    const adapters = llmRouter.getAdapterStatuses();
    return c.json({ adapters });
  } catch (err) {
    logger.error({ err }, '获取 LLM 适配器列表失败');
    return c.json({
      error: {
        code: 'INTERNAL_ERROR',
        message: getErrorMessage('INTERNAL_ERROR')
      }
    }, 500);
  }
});

app.post('/api/llm/test', async (c) => {
  try {
    const body = await c.req.json();
    const { adapterId } = body as { adapterId: string };

    const adapter = llmRouter.getAdapter(adapterId);
    if (!adapter) {
      return c.json({
        error: {
          code: 'NOT_FOUND',
          message: getErrorMessage('NOT_FOUND')
        }
      }, 404);
    }

    const result = await adapter.probe();
    return c.json({
      adapterId,
      ok: result.ok,
      latencyMs: result.latencyMs,
      error: result.error
    });
  } catch (err) {
    logger.error({ err }, 'LLM 测试失败');
    return c.json({
      error: {
        code: 'INTERNAL_ERROR',
        message: getErrorMessage('INTERNAL_ERROR')
      }
    }, 500);
  }
});

app.post('/api/llm/test-connection', async (c) => {
  try {
    const body = await c.req.json();
    const { adapterId, apiKey, model } = body as { adapterId: string; apiKey: string; model: string };

    if (!adapterId || !apiKey) {
      return c.json({
        error: {
          code: 'VALIDATION_ERROR',
          message: getErrorMessage('VALIDATION_ERROR')
        }
      }, 400);
    }

    const adapter = llmRouter.createTestAdapter(adapterId, apiKey, model || '');
    if (!adapter) {
      return c.json({
        error: {
          code: 'NOT_FOUND',
          message: getErrorMessage('NOT_FOUND')
        }
      }, 404);
    }

    const startTime = Date.now();
    const result = await adapter.probe();
    const latency = Date.now() - startTime;

    if (result.ok) {
      return c.json({ success: true, latency });
    } else {
      return c.json({ success: false, error: result.error || '连接测试失败' });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    logger.error({ err }, 'LLM 连接测试失败');
    return c.json({ success: false, error: message });
  }
});

export default app;
