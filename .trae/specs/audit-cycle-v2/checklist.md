# Checklist · 审计循环第二轮

## 维度 1：TypeScript 类型安全

### 1.1 `@shared` 导入路径
- [x] `server/src/` 中所有 `@shared` 导入的类型在 `shared/types/index.ts` 中均有导出
- [x] `web/src/` 中所有 `@shared` 导入可解析
- [x] tsconfig paths 别名配置正确

### 1.2 类型一致性
- [x] `brainapi/index.ts` 函数返回类型与声明一致
- [x] 无不当的 `any` 类型使用（P3 级别，不影响运行时）

## 维度 2：错误处理完整性

### 2.1 API 路由
- [x] 所有路由 handler 有 try-catch 错误处理
- [x] 错误响应格式统一

### 2.2 异步操作
- [x] 所有 `pool.query()` 调用有错误处理
- [x] 所有 LLM 调用有错误处理
- [x] 网络操作有超时和错误处理

## 维度 3：API 端点一致性

### 3.1 前端-后端匹配
- [x] 前端 API 方法路径与后端路由一致
- [x] HTTP 方法一致
- [x] 请求参数名一致

## 维度 4：安全性

### 4.1 SQL 注入防护
- [x] 所有 SQL 查询使用参数化（`$1` 占位符）
- [x] 无字符串拼接 SQL

### 4.2 认证覆盖
- [x] `authMiddleware` 正确注册
- [x] 公共端点（`/health`、`/api/auth/login`）正确跳过认证

## 维度 5：代码逻辑

### 5.1 边界条件
- [x] 数组/对象访问有防御性检查
- [x] `rows[0]` 访问前检查 `rows.length > 0` 或使用 `?.`

### 5.2 竞态条件
- [x] `dream.ts` 分布式锁已修复（`pool.connect()` 保持连接）
- [x] `budget.ts` 预算执行由数据库原子操作保障，内存计数仅用于显示
- [x] `sync.ts` 并发同步场景极低概率