import { Hono } from 'hono';
import { getErrorMessage } from '../i18n/errors.zh-CN';
import logger from '../i18n/logger';
import { llmRouter } from '../llm/router';

const app = new Hono();

app.get('/api/llm/adapters', (c) => {
  const adapters = llmRouter.getAdapterStatuses();
  return c.json({ adapters });
});

app.post('/api/llm/test', async (c) => {
  try {
    const body = await c.req.json();
    const { adapterId } = body as { adapterId: string };

    const adapter = llmRouter.getAdapter(adapterId);
    if (!adapter) {
      return c.json(
        {
          error: {
            code: 'NOT_FOUND',
            message: `未找到适配器: ${adapterId}`
          }
        },
        404
      );
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
    return c.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: getErrorMessage('INTERNAL_ERROR')
        }
      },
      500
    );
  }
});

export default app;
