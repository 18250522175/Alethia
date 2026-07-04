# API 接口参考文档生成计划

## 目标
创建 `/workspace/docs/02_API_REFERENCE.md` API 接口参考文档，基于实际代码生成，不捏造端点。

## 数据来源
已读取以下文件获取真实端点：
- `/workspace/server/src/routes/brainapi.ts` - 27个端点
- `/workspace/server/src/routes/health.ts` - 3个端点
- `/workspace/server/src/routes/llm.ts` - 2个端点
- `/workspace/server/src/routes/settings.ts` - 2个端点
- `/workspace/server/src/index.ts` - 2个端点（/health, /api/auth/login）
- `/workspace/shared/types/*.ts` - 类型定义

## 文档结构

### 1. 标题与元信息
- 标题：# Alethia AI 知识库 v5.0 — API 接口参考
- 生成日期：2026-07-04 | 版本：v5.0

### 2. 鉴权方式
- Bearer Token 机制
- Header: `Authorization: Bearer {BRAIN_API_KEY}`
- 配置项：`BRAIN_API_KEY` 环境变量
- 支持多 API Key（逗号分隔）

### 3. 标准错误响应格式
- 格式：`{ error: { code: string, message: string, details?: any } }`
- 常见错误码：
  - `UNAUTHORIZED` - 未授权
  - `VALIDATION_ERROR` - 验证错误
  - `NOT_FOUND` - 资源不存在
  - `INTERNAL_ERROR` - 内部错误
  - `RATE_LIMITED` - 速率限制（预留）
  - `BUDGET_EXCEEDED` - 预算超支（预留）

### 4. 端点分组（按功能）

#### 4.1 健康检查
- `GET /health` - 健康状态检查
- `GET /api/health-dashboard` - 健康仪表盘

#### 4.2 认证
- `POST /api/auth/login` - API Key 登录验证

#### 4.3 问答（5个端点）
- `POST /api/ask` - 智能问答
- `POST /api/query` - 语义检索
- `GET /api/conversations/:id` - 获取对话记录
- `POST /api/feedback` - 提交反馈
- `POST /api/translate-evidence` - 翻译证据片段

#### 4.4 审核（4个端点）
- `GET /api/diffs` - 待审核变更列表
- `POST /api/diffs/:id/apply` - 批准变更
- `POST /api/diffs/:id/reject` - 拒绝变更
- `POST /api/rollback/:batchId` - 回滚批量变更

#### 4.5 图谱
- `GET /api/graph` - 获取知识图谱数据

#### 4.6 设置
- `GET /api/settings` - 获取全局设置
- `PUT /api/settings` - 保存全局设置

#### 4.7 预算（3个端点）
- `POST /api/settings/daily-budget` - 设置日预算
- `GET /api/budget/remaining` - 获取剩余预算
- `GET /api/budget/alerts` - 获取预算告警列表

#### 4.8 进化/变更日志/评估（7个端点）
- `GET /api/changelog` - 变更日志
- `GET /api/eval-report` - 评估报告
- `POST /api/shadow-eval` - 影子评估
- `POST /api/rebuild-struct` - 重建知识结构
- `POST /api/extract-pending` - 抽取待处理文件
- `POST /api/archive-versions` - 归档知识版本
- `POST /api/clean-ghost-relations` - 清理幽灵关系

#### 4.9 图书馆（4个端点）
- `GET /api/library-files/:hash` - 获取库文件元数据
- `GET /api/library-files/:hash/content` - 获取库文件内容（支持 Range）
- `GET /api/observed-files` - 观察文件列表
- `POST /api/observed-files/:hash/extract` - 触发事实抽取

#### 4.10 Wiki
- `POST /api/generate-draft` - 生成 Wiki 页面草稿

#### 4.11 搜索/时间线/静态站点（3个端点）
- `GET /api/search` - 全站搜索
- `GET /api/timeline` - 知识时间线
- `POST /api/generate-static-site` - 生成静态站点

#### 4.12 LLM 配置（2个端点）
- `GET /api/llm/adapters` - 获取 LLM 适配器列表
- `POST /api/llm/test` - 测试 LLM 适配器

### 5. 前端 API 客户端使用示例
- 示例 1：健康检查 + 登录
- 示例 2：智能问答
- 示例 3：审核变更
- 示例 4：搜索

### 6. 预留端点说明
对用户提到但代码中不存在的端点标注「预留」

## 每个端点包含
- 方法 + 路径
- 功能描述
- 请求参数（path/query/body 字段表）
- 响应字段（字段表）
- 错误码
- 指向源码的 file:// 链接

## 执行步骤
1. 编写完整的 API 参考文档 Markdown 内容
2. 写入 `/workspace/docs/02_API_REFERENCE.md`
3. 验证文档完整性
