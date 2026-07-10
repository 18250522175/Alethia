# Tasks · 审计循环第二轮

按维度依次执行。每个维度发现问题后修复并验证无延申问题，再进入下一维度。

## 维度 1：TypeScript 类型安全

- [x] Task 1.1：检查 `@shared` 类型导入路径
  - [x] 搜索 `server/src/` 中所有 `from '@shared'` 导入，确认 `shared/types/index.ts` 导出了对应类型
  - [x] 搜索 `web/src/` 中所有 `from '@shared'` 导入，确认可解析
  - [x] 验证 tsconfig 中 paths 别名配置与实际目录一致

- [x] Task 1.2：检查类型定义与使用一致性
  - [x] 对比 `shared/types/` 中定义的类型与 `brainapi/index.ts` 中实际使用
  - [x] 检查函数返回值类型是否与声明一致
  - [x] 检查是否存在 `any` 类型应替换为具体类型（P3 级别，不影响运行时）

## 维度 2：错误处理完整性

- [x] Task 2.1：检查 API 路由错误处理
  - [x] 读取 `server/src/routes/` 所有路由文件，所有 handler 有 try-catch
  - [x] 错误响应格式统一（`{ error: { code, message } }`）
  - [x] 全局错误处理器存在

- [x] Task 2.2：检查异步操作错误处理
  - [x] 所有 `pool.query(` 调用有 try-catch 或调用方有错误处理
  - [x] 所有 LLM 调用有错误处理
  - [x] 网络操作（fetch）有超时和错误处理

## 维度 3：API 端点一致性

- [x] Task 3.1：检查前端 API 客户端与后端路由匹配
  - [x] 前端 API 方法路径与后端路由一致（130+ 端点全部匹配）
  - [x] HTTP 方法一致
  - [x] 请求参数名一致

## 维度 4：安全性

- [x] Task 4.1：检查 SQL 注入防护
  - [x] 所有 SQL 查询使用参数化（`$1`、`$2` 占位符）
  - [x] 无字符串拼接构建 SQL

- [x] Task 4.2：检查认证覆盖
  - [x] `authMiddleware` 正确注册，`/health` 和 `/api/auth/login` 在 PUBLIC_PATHS 中
  - [x] 公共端点正确跳过认证

## 维度 5：代码逻辑

- [x] Task 5.1：检查边界条件
  - [x] `rows[0]` 访问均有 `rows.length > 0` 检查或 `?.` 可选链
  - [x] `SELECT COUNT(*)` 查询的 `rows[0]` 安全（始终返回一行）

- [x] Task 5.2：检查竞态条件
  - [x] **发现并修复** `dream.ts`：`acquireCronLock` 使用 `pool.query` 导致锁立即释放，改用 `pool.connect()` 保持连接
  - [x] `budget.ts` 的 `recordUsage` 内存计数非原子（P3：仅影响显示，实际预算由数据库原子操作保障）
  - [x] `sync.ts` 无文件锁（P3：并发同步概率极低）

# Task Dependencies
- 维度 1–5 按顺序执行
- 每个维度内部任务可并行