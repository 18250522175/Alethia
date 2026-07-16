# Tasks

- [x] Task 1: 添加全局错误处理中间件
  - 在 `server/src/index.ts` 中，于所有路由注册之前（`app.route(...)` 调用之前）添加 `app.onError` 中间件
  - 捕获所有未处理的异常，记录日志，返回 `{ error: { code: 'INTERNAL_ERROR', message: err.message } }` + HTTP 500
  - 同时添加 404 中间件，返回 `{ error: { code: 'NOT_FOUND', message: '...' } }` + HTTP 404

- [x] Task 2: 修复 SQL 注入风险
  - 在 `server/src/routes/causal.ts` 中查找所有字符串拼接 SQL 的代码
  - 改为使用参数化查询（`$1`, `$2` 占位符）
  - 重点检查第 1508 行附近的动态 WHERE 条件构建

- [x] Task 3: 统一错误响应格式
  - 在 `server/src/routes/causal.ts` 中，将所有 `{ error: '...' }`, `{ message: '...' }`, `{ success: false }` 等不一致格式改为 `{ error: { code: '...', message: '...' } }`
  - 在 `server/src/routes/health.ts` 中，确保错误路径返回标准格式
  - 在 `server/src/routes/llm.ts` 中，确保错误路径返回标准格式
  - 在 `server/src/routes/views.ts` 中，确保错误路径返回标准格式

- [x] Task 4: 补充关键路由参数校验
  - 在 `server/src/routes/brainapi.ts` 文件导出/读取路由中，添加路径遍历检查（拒绝含 `..` 的路径），返回 403
  - 在 `server/src/routes/brainapi.ts` 笔记操作路由中，添加文件名合法性校验
  - 在 `server/src/routes/causal.ts` 中，添加超边 ID 和 slug 参数的空值/格式校验

- [x] Task 5: 修复缺失 return 和未处理 promise
  - 在 `server/src/routes/brainapi.ts` 中，检查所有分支确保都有 return 语句
  - 在 `server/src/routes/causal.ts` 中，为异步操作添加 `.catch()` 或 try/catch
  - 在 `server/src/routes/views.ts` 中，为文件写入操作添加错误处理

# Task Dependencies
- Task 1 是基础，完成后 Task 3 中的部分错误处理可简化
- Task 2, 3, 4, 5 互不依赖，可并行执行