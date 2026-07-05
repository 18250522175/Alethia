import type { Context, Next } from 'hono';
import logger from '../i18n/logger';

/**
 * Sentry 错误捕获中间件（最小化桩实现）
 *
 * 当前实现：捕获下游抛出的异常，以 Sentry 风格的结构化事件写入日志，随后重新抛出，
 * 交由 Hono 的 onError 处理器（见 src/index.ts）统一返回错误响应。不进行远端上报。
 *
 * 当 SENTRY_DSN 环境变量配置后，请按以下步骤启用真正的 Sentry 上报：
 *   1. 安装依赖：bun add @sentry/bun；
 *   2. 在本文件顶部（或应用启动入口）调用 Sentry.init({ dsn: process.env.SENTRY_DSN })；
 *   3. 将下方 captureError 中的日志记录替换为 Sentry.captureException(err, { extra, tags })，
 *      并使用 Sentry.lastEventId() 关联响应。
 *
 * 注意：未配置 SENTRY_DSN 时，本中间件仅做结构化日志，不引入任何 Sentry 依赖。
 */

// 生成简易事件 ID（模拟 Sentry 的 event_id 格式：32 位十六进制）
function generateEventId(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

/**
 * 以 Sentry 风格结构化记录错误。
 * TODO: 配置 SENTRY_DSN 后替换为 Sentry.captureException。
 */
function captureError(err: unknown, c: Context, isConfigured: boolean): void {
  const traceId = c.get('traceId') as string | undefined;

  const event = {
    event_id: generateEventId(),
    level: 'error',
    platform: 'bun',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    tags: {
      service: 'alethia-brain',
      path: c.req.path,
      method: c.req.method,
      sentry_enabled: isConfigured
    },
    extra: {
      traceId: traceId ?? null,
      userAgent: c.req.header('user-agent') ?? null
    }
  };

  logger.error({ err, sentry: event }, '捕获到未处理异常（Sentry 桩）');
}

/**
 * Sentry 中间件：包裹下游 handler，捕获并结构化记录异常。
 * 注册顺序：应位于 traceId 之后，以便在事件中关联 traceId。
 */
export async function sentryMiddleware(c: Context, next: Next) {
  const dsn = process.env.SENTRY_DSN;
  const isConfigured = !!(dsn && dsn.trim().length > 0);

  try {
    await next();
  } catch (err) {
    captureError(err, c, isConfigured);
    // 重新抛出，交由 Hono 的 onError 处理器统一返回错误响应
    throw err;
  }
}
