# API 端点调试 Spec

## Why
全量 API 路由审计发现 114 个问题，涵盖：60+ 路由缺少 try/catch 错误处理、SQL 注入风险、响应格式不一致、缺少参数校验、未处理 promise rejection 等。这些问题导致 API 在异常情况下返回 500 空白页或未定义错误，严重影响可用性。

## What Changes
- 添加全局错误处理中间件，统一捕获所有未处理异常，返回标准 JSON 错误响应
- 修复 SQL 注入风险（causal.ts 中拼接查询条件）
- 统一错误响应格式为 `{ error: { code: string, message: string } }`
- 补充关键路由的参数校验
- 修复未处理 promise 和缺失 return 语句

## Impact
- Affected specs: 无
- Affected code: `server/src/index.ts`（全局中间件）, `server/src/routes/brainapi.ts`, `server/src/routes/causal.ts`, `server/src/routes/health.ts`, `server/src/routes/llm.ts`, `server/src/routes/views.ts`

## ADDED Requirements

### Requirement: 全局错误处理中间件
系统 SHALL 在 Hono 应用顶层注册全局错误处理中间件，捕获所有未处理的异常并返回标准 JSON 错误响应。

#### Scenario: 路由抛出未捕获异常
- **WHEN** 任意路由 handler 抛出异常（如数据库连接失败、空指针）
- **THEN** 返回 `{ error: { code: 'INTERNAL_ERROR', message: '...' } }`，HTTP 500

#### Scenario: 正常请求不受影响
- **WHEN** 路由正常返回 c.json()
- **THEN** 全局中间件不拦截，响应原样返回

### Requirement: 统一错误响应格式
系统 SHALL 使用统一的错误响应格式 `{ error: { code: string, message: string } }` 替代散落的 `{ message: ... }`, `{ error: '...' }`, `{ success: false }` 等不一致格式。

#### Scenario: 任何错误响应
- **WHEN** API 返回错误
- **THEN** 响应体包含 `error.code` 和 `error.message`，HTTP 状态码反映错误类型

### Requirement: SQL 注入防护
系统 SHALL 使用参数化查询，禁止字符串拼接 SQL。

#### Scenario: causal.ts 动态查询条件
- **WHEN** 构建 SQL WHERE 子句
- **THEN** 必须使用 `$1`, `$2` 占位符，不得字符串拼接用户输入

### Requirement: 关键路由参数校验
系统 SHALL 对文件路径、ID、slug 等参数进行校验，防止路径遍历和无效输入。

#### Scenario: 文件路径参数
- **WHEN** 用户传入文件路径参数
- **THEN** 校验路径不包含 `..` 且不超出允许的目录范围，否则返回 403