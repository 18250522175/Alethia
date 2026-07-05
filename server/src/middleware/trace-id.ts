import { Context, Next } from 'hono';

// 请求 / 响应中携带 TraceId 的头名称
const REQUEST_ID_HEADER = 'x-request-id';

/**
 * TraceId 中间件
 * - 若请求携带 X-Request-Id 头，则沿用该值；
 * - 否则通过 crypto.randomUUID() 生成新的 TraceId；
 * - 将 TraceId 写入上下文变量（c.set('traceId', id)），供后续中间件 / 路由 handler 关联日志；
 * - 在响应头中回写 X-Request-Id，便于客户端 / 网关 / 日志系统进行链路追踪。
 *
 * 注册顺序：应位于 logger 之后、bearerAuth 之前，确保所有受保护接口均带 TraceId。
 */
export async function traceIdMiddleware(c: Context, next: Next) {
  const incoming = c.req.header(REQUEST_ID_HEADER);
  const traceId = incoming && incoming.trim().length > 0
    ? incoming.trim()
    : crypto.randomUUID();

  // 写入上下文，供下游 handler 通过 c.get('traceId') 关联日志
  c.set('traceId', traceId);

  await next();

  // 在响应头中回写 TraceId，便于客户端与网关关联请求
  c.header(REQUEST_ID_HEADER, traceId);
}
