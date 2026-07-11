import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { HTTPException } from 'hono/http-exception';
import { loadEnv } from './config/loader';
import loggerInstance from './i18n/logger';
import { getErrorMessage } from './i18n/errors.zh-CN';
import { bearerAuth, validateApiKeyOnStartup, getApiKeys } from './auth/bearer';
import { rateLimiter } from './middleware/rate-limit';
import { waitForDatabase, getPool } from './db/pool';
import llmRoutes from './routes/llm';
import settingsRoutes from './routes/settings';
import healthRoutes from './routes/health';
import brainapiRoutes from './routes/brainapi';
import causalRoutes from './routes/causal';
import viewsRoutes from './routes/views';
import { llmRouter } from './llm/router';
import { budgetManager } from './evolution/budget';

const VERSION = '5.0.0';

const app = new Hono();

app.use('*', cors({
  origin: (origin) => {
    const env = loadEnv();
    if (env.NODE_ENV === 'development') {
      return origin || '*';
    }
    // 生产环境：仅允许白名单中的 origin
    const CORS_ORIGINS = env.BRAIN_CORS_ORIGINS
      .split(',')
      .map(o => o.trim())
      .filter(o => o.length > 0);
    if (CORS_ORIGINS.length === 0) {
      // 未配置白名单时，默认只允许同源请求
      loggerInstance.warn('生产环境未配置 BRAIN_CORS_ORIGINS，仅允许同源请求');
      return origin || '';
    }
    if (origin && CORS_ORIGINS.includes(origin)) {
      return origin;
    }
    // 不在白名单中，拒绝（返回空字符串而非 '*'）
    return '';
  },
  credentials: true,
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));

app.use('*', logger((msg, ...rest) => {
  loggerInstance.debug(rest, msg);
}));

app.use('*', bearerAuth);

// 全局限速：每 IP 每分钟最多 60 请求
app.use('*', rateLimiter({
  windowMs: 60_000,
  max: 60
}));

// 轻量级存活检查：返回服务状态（DB/LLM/Embedding），用于 StatusBar 快速轮询
// 完整仪表盘数据见 /api/health-dashboard（routes/health.ts）
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
  const hasAnyLlm = adapters.some(a => ((env as Record<string, string>)[`${a}_API_KEY`] || '').trim().length > 0);
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
  }, 200);
});

app.post('/api/auth/login', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { apiKey } = body as { apiKey?: string };
    const validKeys = getApiKeys();

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
app.route('/', causalRoutes);
app.route('/', viewsRoutes);

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

  // 启动时从数据库恢复预算计数
  try {
    await budgetManager.restoreFromDB();
  } catch (err) {
    loggerInstance.warn({ err }, '预算计数恢复失败，使用默认零值');
  }

  // 启动时检测 embedding 维度
  try {
    const { ensureEmbeddingDimension } = await import('./db/dimension');
    const settingsResult = await getPool().query(
      "SELECT value FROM settings WHERE key = 'embedding.dimension'"
    );
    const targetDim = settingsResult.rows.length > 0
      ? parseInt(settingsResult.rows[0].value)
      : 384; // 默认 all-MiniLM-L6-v2 维度
    if (targetDim > 0) {
      const result = await ensureEmbeddingDimension(targetDim);
      if (result.migrated) {
        loggerInstance.info({ oldDim: result.oldDim, newDim: result.newDim },
          '嵌入维度已自动迁移');
      }
    }
  } catch (err) {
    loggerInstance.warn({ err }, '嵌入维度检测失败，跳过自动迁移');
  }

  const port = env.BRAIN_PORT;
  loggerInstance.info(`服务启动完成，监听端口: ${port}`);

  const server = Bun.serve({
    fetch: app.fetch,
    port: port,
    hostname: '0.0.0.0'
  });

  // 优雅关闭处理
  let isShuttingDown = false;
  const gracefulShutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    loggerInstance.info(`收到 ${signal} 信号，开始优雅关闭...`);

    // 1. 停止接受新连接
    server.stop();
    loggerInstance.info('HTTP 服务已停止接受新连接');

    // 2. 关闭数据库连接池
    try {
      const { closePool } = await import('./db/pool');
      await closePool();
      loggerInstance.info('数据库连接池已关闭');
    } catch (err) {
      loggerInstance.warn({ err }, '关闭数据库连接池时出错');
    }

    loggerInstance.info('Alethia 服务已安全关闭');
    process.exit(0);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

bootstrap().catch((err) => {
  loggerInstance.fatal({ err }, '服务启动失败');
  process.exit(1);
});
