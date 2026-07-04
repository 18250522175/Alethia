import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { HTTPException } from 'hono/http-exception';
import { loadEnv } from './config/loader';
import loggerInstance from './i18n/logger';
import { getErrorMessage } from './i18n/errors.zh-CN';
import { bearerAuth, validateApiKeyOnStartup } from './auth/bearer';
import { waitForDatabase, getPool } from './db/pool';
import llmRoutes from './routes/llm';
import settingsRoutes from './routes/settings';
import healthRoutes from './routes/health';
import brainapiRoutes from './routes/brainapi';
import { llmRouter } from './llm/router';

const VERSION = '5.0.0';

const app = new Hono();

app.use('*', cors({
  origin: (origin) => {
    const env = loadEnv();
    if (env.NODE_ENV === 'development') {
      return origin || '*';
    }
    return origin || '*';
  },
  credentials: true,
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));

app.use('*', logger((msg, ...rest) => {
  loggerInstance.debug(rest, msg);
}));

app.use('*', bearerAuth);

app.get('/health', async (c) => {
  let dbStatus: 'connected' | 'disconnected' = 'disconnected';
  try {
    const pool = getPool();
    await pool.query('SELECT 1');
    dbStatus = 'connected';
  } catch {
    dbStatus = 'disconnected';
  }

  const env = loadEnv();
  const adapters = ['BAILIAN', 'ZHIPU', 'MOONSHOT', 'ERNIE', 'SPARK', 'HUNYUAN', 'MINIMAX', 'DEEPSEEK', 'YI', 'BAICHUAN'];
  const hasAnyLlm = adapters.some(a => (process.env[`${a}_API_KEY`] || '').trim().length > 0);
  const llmStatus = hasAnyLlm ? 'configured' : 'none';

  const embeddingStatus = env.EMBEDDING_PROVIDER === 'local' ? 'local' :
    (env.EMBEDDING_PROVIDER && env.EMBEDDING_PROVIDER !== 'local') ? 'vendor' : 'none';

  let status: 'ok' | 'degraded' | 'down' = 'ok';
  if (dbStatus === 'disconnected') {
    status = 'down';
  } else if (llmStatus === 'none') {
    status = 'degraded';
  }

  return c.json({
    status,
    lang: 'zh-CN',
    db: dbStatus,
    llm: llmStatus,
    embedding: embeddingStatus,
    version: VERSION
  });
});

app.post('/api/auth/login', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { apiKey } = body as { apiKey?: string };
    const env = loadEnv();

    const validKeys = env.BRAIN_API_KEY
      .split(',')
      .map(k => k.trim())
      .filter(k => k.length > 0);

    if (!apiKey || !validKeys.includes(apiKey.trim())) {
      return c.json({
        error: {
          code: 'UNAUTHORIZED',
          message: getErrorMessage('INVALID_API_KEY')
        }
      }, 401);
    }

    return c.json({ success: true, token: apiKey });
  } catch (err) {
    loggerInstance.error({ err }, '登录处理失败');
    return c.json({
      error: {
        code: 'INTERNAL_ERROR',
        message: getErrorMessage('INTERNAL_ERROR')
      }
    }, 500);
  }
});

app.route('/', llmRoutes);
app.route('/', settingsRoutes);
app.route('/', healthRoutes);
app.route('/', brainapiRoutes);

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    const status = err.status;
    let code = 'INTERNAL_ERROR';
    if (status === 401) code = 'UNAUTHORIZED';
    else if (status === 404) code = 'NOT_FOUND';
    else if (status === 400) code = 'VALIDATION_ERROR';

    return c.json({
      error: {
        code,
        message: getErrorMessage(code)
      }
    }, status);
  }

  loggerInstance.error({ err }, '未捕获的服务端错误');
  return c.json({
    error: {
      code: 'INTERNAL_ERROR',
      message: getErrorMessage('INTERNAL_ERROR')
    }
  }, 500);
});

app.notFound((c) => {
  return c.json({
    error: {
      code: 'NOT_FOUND',
      message: getErrorMessage('NOT_FOUND')
    }
  }, 404);
});

async function bootstrap() {
  const env = loadEnv();

  loggerInstance.info('正在启动 Alethia Brain API 服务...');

  validateApiKeyOnStartup();

  await waitForDatabase();

  const port = env.BRAIN_PORT;
  loggerInstance.info(`服务启动完成，监听端口: ${port}`);

  Bun.serve({
    fetch: app.fetch,
    port: port,
    hostname: '0.0.0.0'
  });
}

bootstrap().catch((err) => {
  loggerInstance.fatal({ err }, '服务启动失败');
  process.exit(1);
});
