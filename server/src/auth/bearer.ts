import { Context, Next } from 'hono';
import { loadEnv, isDevelopment, isProduction } from '../config/loader';
import logger from '../i18n/logger';
import { getErrorMessage } from '../i18n/errors.zh-CN';

const PUBLIC_PATHS = [
  '/health',
  '/api/auth/login',
];

function isPublicPath(path: string, method: string): boolean {
  if (method === 'OPTIONS') return true;
  return PUBLIC_PATHS.some(p => path === p || path.startsWith(p + '/'));
}

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

export function getApiKeys(): string[] {
  const env = loadEnv();
  return env.BRAIN_API_KEY
    .split(',')
    .map(k => k.trim())
    .filter(k => k.length > 0);
}

export async function bearerAuth(c: Context, next: Next) {
  const path = c.req.path;
  const method = c.req.method;

  if (isPublicPath(path, method)) {
    return next();
  }

  const authHeader = c.req.header('Authorization') || null;
  const token = extractBearerToken(authHeader);
  const validKeys = getApiKeys();

  if (!token || !validKeys.includes(token)) {
    logger.warn({ path, method }, '认证失败：缺失或无效的 API 密钥');
    return c.json({
      error: {
        code: 'UNAUTHORIZED',
        message: getErrorMessage('UNAUTHORIZED')
      }
    }, 401);
  }

  await next();
}

export function validateApiKeyOnStartup(): void {
  const validKeys = getApiKeys();

  if (validKeys.length === 0) {
    if (isProduction()) {
      logger.fatal('未配置 BRAIN_API_KEY，生产模式下无法启动');
      process.exit(1);
    } else {
      logger.warn('⚠️  未配置 BRAIN_API_KEY，所有受保护接口将拒绝访问');
    }
  }
}
