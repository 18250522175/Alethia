# Checklist

## 全局错误处理
- [x] `server/src/index.ts` 中注册了 `app.onError` 中间件
- [x] 未处理异常返回 `{ error: { code: 'INTERNAL_ERROR', message: ... } }` + HTTP 500
- [x] 404 路由返回 `{ error: { code: 'NOT_FOUND', message: ... } }` + HTTP 404
- [x] 正常请求不受全局中间件影响

## SQL 注入修复
- [x] `server/src/routes/causal.ts` 中所有 SQL 查询使用参数化占位符
- [x] 无字符串拼接 SQL 语句

## 错误响应格式统一
- [x] `server/src/routes/causal.ts` 所有错误响应使用 `{ error: { code, message } }` 格式
- [x] `server/src/routes/health.ts` 错误响应格式统一
- [x] `server/src/routes/llm.ts` 错误响应格式统一
- [x] `server/src/routes/views.ts` 错误响应格式统一

## 参数校验
- [x] 文件导出/读取路由拒绝含 `..` 的路径，返回 403
- [x] 笔记操作路由校验文件名合法性
- [x] 超边 ID 和 slug 参数有空值/格式校验

## 缺失 return / 未处理 promise
- [x] `server/src/routes/brainapi.ts` 所有分支均有 return 语句
- [x] `server/src/routes/causal.ts` 异步操作有错误处理
- [x] `server/src/routes/views.ts` 文件操作有错误处理

## 最终验证
- [x] `npx tsc --noEmit --project server/tsconfig.json` 无错误