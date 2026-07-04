# Alethia Brain API 接口参考文档

> 生成日期：2026-07-04  
> API 版本：v5.0.0  
> 基础路径：`/api`

---

## 目录

1. [鉴权方式](#1-鉴权方式)
2. [标准错误响应](#2-标准错误响应)
3. [错误码表](#3-错误码表)
4. [API 端点分组](#4-api-端点分组)
   - [4.1 认证与健康检查](#41-认证与健康检查)
   - [4.2 问答与检索](#42-问答与检索)
   - [4.3 知识图谱](#43-知识图谱)
   - [4.4 变更审核与回滚](#44-变更审核与回滚)
   - [4.5 对话与反馈](#45-对话与反馈)
   - [4.6 文件管理](#46-文件管理)
   - [4.7 知识演化](#47-知识演化)
   - [4.8 内容生成](#48-内容生成)
   - [4.9 审计与评估](#49-审计与评估)
   - [4.10 系统设置](#410-系统设置)
   - [4.11 预算管理](#411-预算管理)
   - [4.12 LLM 集成](#412-llm-集成)
5. [前端 API 客户端使用示例](#5-前端-api-客户端使用示例)
6. [预留/未实现端点](#6-预留未实现端点)

---

## 1. 鉴权方式

所有 API 端点（除 `/health` 外）均使用 **Bearer Token** 鉴权。

### 请求头

```
Authorization: Bearer <your-api-key>
```

### 登录获取 Token

通过登录接口验证 API Key 并获取 Token（Token 即为 API Key 本身）。

### 源码

- 鉴权中间件：[file:///workspace/server/src/auth/bearer.ts](file:///workspace/server/src/auth/bearer.ts)

---

## 2. 标准错误响应

所有错误响应统一使用以下 JSON 格式：

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "错误描述信息"
  }
}
```

### HTTP 状态码

| 状态码 | 说明 |
|--------|------|
| 200 | 请求成功 |
| 206 | 部分内容（文件分片） |
| 400 | 请求参数校验失败 |
| 401 | 未授权 / API Key 无效 |
| 404 | 资源不存在 |
| 416 | 请求范围不满足 |
| 500 | 服务器内部错误 |

---

## 3. 错误码表

| 错误码 | HTTP 状态 | 说明 |
|--------|-----------|------|
| `UNAUTHORIZED` | 401 | 未授权：缺失或无效的 API 密钥 |
| `INVALID_API_KEY` | 401 | API 密钥无效 |
| `VALIDATION_ERROR` | 400 | 请求参数校验失败 |
| `NOT_FOUND` | 404 | 请求的资源不存在 |
| `FILE_NOT_FOUND` | 404 | 文件不存在 |
| `INVALID_FILE_TYPE` | 400 | 不支持的文件类型 |
| `BUDGET_EXCEEDED` | 402 | 预算已超出限制 |
| `LLM_UNAVAILABLE` | 503 | 未配置可用的大模型适配器 |
| `DATABASE_CONNECTION_FAILED` | 500 | 无法连接到 PostgreSQL |
| `MIGRATION_FAILED` | 500 | 数据库迁移执行失败 |
| `EXTRACT_FAILED` | 500 | 内容提取失败 |
| `EMBEDDING_FAILED` | 500 | 向量嵌入生成失败 |
| `RATE_LIMITED` | 429 | 请求过于频繁，请稍后再试 |
| `CONTEXT_TOO_LONG` | 400 | 上下文长度超出模型限制 |
| `INTERNAL_ERROR` | 500 | 服务器内部错误 |

### 源码

- 错误消息定义：[file:///workspace/server/src/i18n/errors.zh-CN.ts](file:///workspace/server/src/i18n/errors.zh-CN.ts)

---

## 4. API 端点分组

### 4.1 认证与健康检查

#### 4.1.1 健康检查

- **方法**: `GET`
- **路径**: `/health`
- **功能描述**: 检查服务健康状态，包括数据库连接、LLM 配置、嵌入模型配置状态。
- **鉴权**: 无需鉴权

**请求参数**: 无

**响应字段**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `status` | string | 整体状态：`ok` / `degraded` / `down` |
| `lang` | string | 语言：`zh-CN` |
| `db` | string | 数据库状态：`connected` / `disconnected` |
| `llm` | string | LLM 状态：`configured` / `none` |
| `embedding` | string | 嵌入模型状态：`local` / `vendor` / `none` |
| `version` | string | API 版本号 |

**错误码**: 无（始终返回 200）

**源码**: [file:///workspace/server/src/index.ts#L39-L72](file:///workspace/server/src/index.ts#L39-L72)

---

#### 4.1.2 用户登录

- **方法**: `POST`
- **路径**: `/api/auth/login`
- **功能描述**: 使用 API Key 登录验证，返回 Token。
- **鉴权**: 无需鉴权

**请求参数 (Body)**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `apiKey` | string | 是 | API 密钥 |

**响应字段**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `success` | boolean | 是否登录成功 |
| `token` | string | 访问令牌（即 API Key 本身） |

**错误码**:

| 错误码 | 触发条件 |
|--------|----------|
| `UNAUTHORIZED` | API Key 无效 |
| `INTERNAL_ERROR` | 服务器内部错误 |

**源码**: [file:///workspace/server/src/index.ts#L74-L104](file:///workspace/server/src/index.ts#L74-L104)

---

### 4.2 问答与检索

#### 4.2.1 智能问答

- **方法**: `POST`
- **路径**: `/api/ask`
- **功能描述**: 向知识库提问，基于 RAG 管道生成带证据引用的回答。支持多轮对话、反思迭代、翻译等高级功能。
- **鉴权**: 需要 Bearer Token

**请求参数 (Body)**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `question` | string | 是 | 用户问题 |
| `conversationId` | string | 否 | 对话 ID，用于多轮对话上下文 |
| `mode` | string | 否 | 回答模式：`concise`（简洁）/ `detailed`（详细） |
| `maxReflections` | number | 否 | 最大反思迭代次数 |
| `enableTranslation` | boolean | 否 | 是否启用证据翻译 |
| `compressionThreshold` | number | 否 | 对话历史压缩阈值 |

**响应字段**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `answer` | string | AI 生成的回答文本 |
| `sources` | EvidenceSpan[] | 证据来源片段列表 |
| `translatedSources` | EvidenceSpan[] | 翻译后的证据片段（可选） |
| `confidence` | number | 回答置信度 (0-1) |
| `relatedEntities` | EntityRef[] | 相关实体列表 |
| `conversationId` | string | 对话 ID |
| `tokensUsed` | number | 消耗的 Token 数量 |
| `estimatedCost` | number | 预估费用（美元） |
| `observationTriggered` | boolean | 是否触发了观察机制（可选） |
| `compressedHistory` | boolean | 历史对话是否被压缩（可选） |

**错误码**:

| 错误码 | 触发条件 |
|--------|----------|
| `VALIDATION_ERROR` | 问题为空 |
| `INTERNAL_ERROR` | 服务器内部错误 |

**源码**: [file:///workspace/server/src/routes/brainapi.ts#L13-L46](file:///workspace/server/src/routes/brainapi.ts#L13-L46)

---

#### 4.2.2 知识检索

- **方法**: `POST`
- **路径**: `/api/query`
- **功能描述**: 执行多策略知识检索，支持向量检索、全文检索、图谱检索、重排序等混合检索管道。
- **鉴权**: 需要 Bearer Token

**请求参数 (Body)**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `query` | string | 是 | 查询文本 |
| `intent` | string | 否 | 查询意图：`factual` / `topic` / `cross_domain` / `file_search` / `ai_qa` |
| `tier` | string | 否 | 检索层级：`T0` / `T1` / `T2` |
| `contexts` | string[] | 否 | 上下文过滤列表 |
| `topK` | number | 否 | 返回结果数量 |
| `withGraph` | boolean | 否 | 是否启用图谱检索 |
| `withRerank` | boolean | 否 | 是否启用重排序 |

**响应字段**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `items` | QueryResultItem[] | 检索结果列表 |
| `intent` | string | 识别出的查询意图 |
| `tier` | string | 使用的检索层级 |
| `durationMs` | number | 检索耗时（毫秒） |

**QueryResultItem 结构**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `slug` | string | 页面唯一标识 |
| `title` | string | 页面标题 |
| `snippet` | string | 结果摘要 |
| `score` | number | 相关性分数 |
| `sources` | EvidenceSpan[] | 证据片段（可选） |

**错误码**:

| 错误码 | 触发条件 |
|--------|----------|
| `VALIDATION_ERROR` | 查询内容为空 |
| `INTERNAL_ERROR` | 服务器内部错误 |

**源码**: [file:///workspace/server/src/routes/brainapi.ts#L48-L83](file:///workspace/server/src/routes/brainapi.ts#L48-L83)

---

### 4.3 知识图谱

#### 4.3.1 获取图谱数据

- **方法**: `GET`
- **路径**: `/api/graph`
- **功能描述**: 获取知识图谱的节点和边数据，用于可视化展示。
- **鉴权**: 需要 Bearer Token

**请求参数**: 无

**响应字段**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `nodes` | Array | 图谱节点列表 |
| `edges` | Array | 图谱边列表 |

**错误码**:

| 错误码 | 触发条件 |
|--------|----------|
| `INTERNAL_ERROR` | 服务器内部错误 |

**源码**: [file:///workspace/server/src/routes/brainapi.ts#L85-L98](file:///workspace/server/src/routes/brainapi.ts#L85-L98)

---

### 4.4 变更审核与回滚

#### 4.4.1 获取待审核变更列表

- **方法**: `GET`
- **路径**: `/api/diffs`
- **功能描述**: 获取待人工审核的知识变更列表，支持按风险等级过滤。
- **鉴权**: 需要 Bearer Token

**请求参数 (Query)**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `tier` | string | 否 | 风险等级过滤：`green` / `yellow` / `red` |

**响应字段**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `items` | PendingDiff[] | 待审核变更列表 |
| `total` | number | 变更总数 |

**PendingDiff 结构**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 变更 ID |
| `slug` | string | 关联页面 slug |
| `type` | string | 变更类型：`state` / `assessment` / `threads` / `relations` / `ghost_cleanup` / `archive` |
| `payload` | object | 变更内容详情 |
| `confidence` | number | AI 置信度 |
| `impact` | string | 影响程度：`low` / `medium` / `high` |
| `tier` | string | 风险等级：`green` / `yellow` / `red` |
| `createdAt` | string | 创建时间 |
| `resolved` | boolean | 是否已处理 |

**错误码**:

| 错误码 | 触发条件 |
|--------|----------|
| `INTERNAL_ERROR` | 服务器内部错误 |

**源码**: [file:///workspace/server/src/routes/brainapi.ts#L100-L115](file:///workspace/server/src/routes/brainapi.ts#L100-L115)

---

#### 4.4.2 应用变更

- **方法**: `POST`
- **路径**: `/api/diffs/:id/apply`
- **功能描述**: 审核通过并应用指定的知识变更。
- **鉴权**: 需要 Bearer Token

**请求参数 (Path)**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | 变更 ID |

**响应字段**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `diffId` | string | 变更 ID |
| `applied` | boolean | 是否成功应用 |
| `newVersion` | number | 新版本号 |
| `modifiedFiles` | string[] | 被修改的文件列表 |

**错误码**:

| 错误码 | 触发条件 |
|--------|----------|
| `INTERNAL_ERROR` | 服务器内部错误 |

**源码**: [file:///workspace/server/src/routes/brainapi.ts#L117-L132](file:///workspace/server/src/routes/brainapi.ts#L117-L132)

---

#### 4.4.3 拒绝变更

- **方法**: `POST`
- **路径**: `/api/diffs/:id/reject`
- **功能描述**: 审核拒绝指定的知识变更，不应用到知识库。
- **鉴权**: 需要 Bearer Token

**请求参数 (Path)**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | 变更 ID |

**响应字段**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `diffId` | string | 变更 ID |
| `applied` | boolean | 是否应用（始终为 false） |

**错误码**:

| 错误码 | 触发条件 |
|--------|----------|
| `INTERNAL_ERROR` | 服务器内部错误 |

**源码**: [file:///workspace/server/src/routes/brainapi.ts#L134-L149](file:///workspace/server/src/routes/brainapi.ts#L134-L149)

---

#### 4.4.4 回滚变更批次

- **方法**: `POST`
- **路径**: `/api/rollback/:batchId`
- **功能描述**: 回滚指定批次的自动变更，恢复到变更前的状态。
- **鉴权**: 需要 Bearer Token

**请求参数 (Path)**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `batchId` | string | 是 | 变更批次 ID |

**响应字段**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `batchId` | string | 批次 ID |
| `restored` | boolean | 是否成功恢复 |
| `restoredFiles` | string[] | 被恢复的文件列表 |
| `rebuildTriggered` | boolean | 是否触发了重建 |

**错误码**:

| 错误码 | 触发条件 |
|--------|----------|
| `INTERNAL_ERROR` | 服务器内部错误 |

**源码**: [file:///workspace/server/src/routes/brainapi.ts#L151-L166](file:///workspace/server/src/routes/brainapi.ts#L151-L166)

---

### 4.5 对话与反馈

#### 4.5.1 获取对话记录

- **方法**: `GET`
- **路径**: `/api/conversations/:id`
- **功能描述**: 获取指定对话的完整消息历史记录。
- **鉴权**: 需要 Bearer Token

**请求参数 (Path)**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | 对话 ID |

**响应字段**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `items` | ConversationMessage[] | 消息列表 |
| `total` | number | 消息总数 |

**ConversationMessage 结构**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 消息 ID |
| `conversationId` | string | 对话 ID |
| `role` | string | 角色：`user` / `assistant` / `system` |
| `content` | string | 消息内容 |
| `ts` | string | 时间戳 |
| `tokens` | number | Token 消耗 |
| `cost` | number | 费用 |

**错误码**:

| 错误码 | 触发条件 |
|--------|----------|
| `INTERNAL_ERROR` | 服务器内部错误 |

**源码**: [file:///workspace/server/src/routes/brainapi.ts#L168-L182](file:///workspace/server/src/routes/brainapi.ts#L168-L182)

---

#### 4.5.2 提交反馈

- **方法**: `POST`
- **路径**: `/api/feedback`
- **功能描述**: 对 AI 回答提交用户反馈，用于质量评估和模型改进。
- **鉴权**: 需要 Bearer Token

**请求参数 (Body)**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `conversationId` | string | 是 | 对话 ID |
| `messageId` | string | 是 | 消息 ID |
| `feedback` | string | 是 | 反馈类型：`helpful` / `wrong` |
| `note` | string | 否 | 补充说明 |

**响应字段**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `success` | boolean | 是否提交成功 |

**错误码**:

| 错误码 | 触发条件 |
|--------|----------|
| `VALIDATION_ERROR` | 缺少必要参数或 feedback 取值非法 |
| `INTERNAL_ERROR` | 服务器内部错误 |

**源码**: [file:///workspace/server/src/routes/brainapi.ts#L185-L219](file:///workspace/server/src/routes/brainapi.ts#L185-L219)

---

### 4.6 文件管理

#### 4.6.1 列出观察文件

- **方法**: `GET`
- **路径**: `/api/observed-files`
- **功能描述**: 列出被系统观察到的、引用次数达到阈值的文件。
- **鉴权**: 需要 Bearer Token

**请求参数**: 无

**响应字段**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `items` | ObservedFile[] | 观察文件列表 |
| `total` | number | 文件总数 |

**ObservedFile 结构**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `fileHash` | string | 文件哈希 |
| `referenceCount` | number | 被引用次数 |
| `firstReferencedAt` | string | 首次引用时间 |
| `lastReferencedAt` | string | 最后引用时间 |

**错误码**:

| 错误码 | 触发条件 |
|--------|----------|
| `INTERNAL_ERROR` | 服务器内部错误 |

**源码**: [file:///workspace/server/src/routes/brainapi.ts#L222-L235](file:///workspace/server/src/routes/brainapi.ts#L222-L235)

---

#### 4.6.2 触发事实抽取

- **方法**: `POST`
- **路径**: `/api/observed-files/:hash/extract`
- **功能描述**: 对指定的观察文件手动触发事实抽取过程。
- **鉴权**: 需要 Bearer Token

**请求参数 (Path)**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `hash` | string | 是 | 文件哈希 |

**响应字段**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `success` | boolean | 是否触发成功 |
| `diffsCreated` | number | 生成的待审核变更数量 |

**错误码**:

| 错误码 | 触发条件 |
|--------|----------|
| `VALIDATION_ERROR` | 文件 hash 为空 |
| `INTERNAL_ERROR` | 服务器内部错误 |

**源码**: [file:///workspace/server/src/routes/brainapi.ts#L238-L260](file:///workspace/server/src/routes/brainapi.ts#L238-L260)

---

#### 4.6.3 翻译证据片段

- **方法**: `POST`
- **路径**: `/api/translate-evidence`
- **功能描述**: 将指定的证据片段翻译为目标语言。
- **鉴权**: 需要 Bearer Token

**请求参数 (Body)**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `spanIds` | string[] | 是 | 证据片段 ID 列表 |
| `targetLang` | string | 否 | 目标语言代码，默认中文 |

**响应字段**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `items` | EvidenceTranslation[] | 翻译结果列表 |
| `total` | number | 翻译数量 |

**EvidenceTranslation 结构**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `spanId` | string | 证据片段 ID |
| `sourceText` | string | 源文本 |
| `translatedText` | string | 翻译后文本 |
| `lang` | string | 目标语言 |
| `model` | string | 使用的翻译模型 |
| `createdAt` | string | 创建时间 |
| `expiresAt` | string | 过期时间 |

**错误码**:

| 错误码 | 触发条件 |
|--------|----------|
| `VALIDATION_ERROR` | spanIds 为空或非数组 |
| `INTERNAL_ERROR` | 服务器内部错误 |

**源码**: [file:///workspace/server/src/routes/brainapi.ts#L263-L288](file:///workspace/server/src/routes/brainapi.ts#L263-L288)

---

#### 4.6.4 全局搜索

- **方法**: `GET`
- **路径**: `/api/search`
- **功能描述**: 在知识库中执行全局搜索，返回页面、文件、对话等多类型结果。
- **鉴权**: 需要 Bearer Token

**请求参数 (Query)**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `q` | string | 是 | 搜索关键词 |

**响应字段**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `pages` | Array | 匹配的 Wiki 页面列表 |
| `files` | Array | 匹配的库文件列表 |
| `conversations` | Array | 匹配的对话记录列表 |
| `total` | number | 总匹配数 |

**错误码**:

| 错误码 | 触发条件 |
|--------|----------|
| `INTERNAL_ERROR` | 服务器内部错误 |

**源码**: [file:///workspace/server/src/routes/brainapi.ts#L450-L462](file:///workspace/server/src/routes/brainapi.ts#L450-L462)

---

#### 4.6.5 获取库文件信息

- **方法**: `GET`
- **路径**: `/api/library-files/:hash`
- **功能描述**: 获取指定库文件的元数据和关联的证据片段。
- **鉴权**: 需要 Bearer Token

**请求参数 (Path)**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `hash` | string | 是 | 文件哈希 |

**响应字段**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `file` | LibraryFile | 文件元数据 |
| `evidenceSpans` | Array | 关联的证据片段列表 |
| `contentUrl` | string | 文件内容访问 URL |

**LibraryFile 结构**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `hash` | string | 文件哈希 |
| `mime` | string | MIME 类型 |
| `originalName` | string | 原始文件名 |
| `size` | number | 文件大小（字节） |
| `status` | string | 处理状态：`new` / `partially_extracted` / `fully_extracted` / `superseded` |
| `ingestedAt` | string | 入库时间 |

**错误码**:

| 错误码 | 触发条件 |
|--------|----------|
| `NOT_FOUND` | 文件不存在 |
| `INTERNAL_ERROR` | 服务器内部错误 |

**源码**: [file:///workspace/server/src/routes/brainapi.ts#L465-L477](file:///workspace/server/src/routes/brainapi.ts#L465-L477)

---

#### 4.6.6 获取库文件内容

- **方法**: `GET`
- **路径**: `/api/library-files/:hash/content`
- **功能描述**: 获取库文件的原始内容，支持 HTTP Range 请求用于流媒体播放。
- **鉴权**: 需要 Bearer Token

**请求参数 (Path)**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `hash` | string | 是 | 文件哈希 |

**请求头**:

| 头部 | 说明 |
|------|------|
| `Range` | 字节范围请求，格式：`bytes=start-end` |

**响应**:

- 状态码 200：返回完整文件内容
- 状态码 206：返回分片内容（带 Range 请求）
- 状态码 416：范围请求无效

**响应头**:

| 头部 | 说明 |
|------|------|
| `Content-Type` | 文件 MIME 类型 |
| `Content-Length` | 内容长度 |
| `Accept-Ranges` | 支持范围请求，值为 `bytes` |
| `Content-Range` | 当前分片范围（仅 206 状态） |

**错误码**:

| 错误码 | 触发条件 |
|--------|----------|
| `NOT_FOUND` | 文件不存在 |
| `INTERNAL_ERROR` | 服务器内部错误 |

**源码**: [file:///workspace/server/src/routes/brainapi.ts#L480-L592](file:///workspace/server/src/routes/brainapi.ts#L480-L592)

---

### 4.7 知识演化

#### 4.7.1 归档知识版本

- **方法**: `POST`
- **路径**: `/api/archive-versions`
- **功能描述**: 归档指定页面的旧版本知识，生成变更摘要并存档。
- **鉴权**: 需要 Bearer Token

**请求参数 (Body)**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `slug` | string | 否 | 页面 slug，不填则归档所有页面 |

**响应字段**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `slug` | string | 页面 slug（可选） |
| `archivedCount` | number | 归档的版本数量 |
| `summary` | string | 归档摘要 |
| `changelogPath` | string | 变更日志路径 |

**错误码**:

| 错误码 | 触发条件 |
|--------|----------|
| `INTERNAL_ERROR` | 服务器内部错误 |

**源码**: [file:///workspace/server/src/routes/brainapi.ts#L291-L306](file:///workspace/server/src/routes/brainapi.ts#L291-L306)

---

#### 4.7.2 清理幽灵关系

- **方法**: `POST`
- **路径**: `/api/clean-ghost-relations`
- **功能描述**: 检测并清理知识库中的幽灵关系（指向不存在实体的链接）。
- **鉴权**: 需要 Bearer Token

**请求参数**: 无

**响应字段**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `detected` | number | 检测到的幽灵关系数量 |
| `marked` | number | 已标记的数量 |
| `generatedDiffs` | number | 生成的待审核变更数量 |

**错误码**:

| 错误码 | 触发条件 |
|--------|----------|
| `INTERNAL_ERROR` | 服务器内部错误 |

**源码**: [file:///workspace/server/src/routes/brainapi.ts#L309-L322](file:///workspace/server/src/routes/brainapi.ts#L309-L322)

---

#### 4.7.3 重建知识结构

- **方法**: `POST`
- **路径**: `/api/rebuild-struct`
- **功能描述**: 完全重建知识库的结构索引，包括页面解析、链接提取和幽灵关系检测。
- **鉴权**: 需要 Bearer Token

**请求参数**: 无

**响应字段**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `pages` | number | 处理的页面数 |
| `links` | number | 提取的链接数 |
| `ghostCount` | number | 检测到的幽灵关系数 |
| `durationMs` | number | 耗时（毫秒） |

**错误码**:

| 错误码 | 触发条件 |
|--------|----------|
| `INTERNAL_ERROR` | 服务器内部错误 |

**源码**: [file:///workspace/server/src/routes/health.ts#L6-L9](file:///workspace/server/src/routes/health.ts#L6-L9)

---

#### 4.7.4 提取待处理内容

- **方法**: `POST`
- **路径**: `/api/extract-pending`
- **功能描述**: 对所有待处理的库文件执行事实提取，生成待审核变更。
- **鉴权**: 需要 Bearer Token

**请求参数**: 无

**响应字段**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `processed` | number | 处理的文件数 |
| `pendingDiffsCreated` | number | 创建的待审核变更数 |
| `errors` | Array | 错误列表 |

**错误码**:

| 错误码 | 触发条件 |
|--------|----------|
| `INTERNAL_ERROR` | 服务器内部错误 |

**源码**: [file:///workspace/server/src/routes/health.ts#L11-L14](file:///workspace/server/src/routes/health.ts#L11-L14)

---

### 4.8 内容生成

#### 4.8.1 生成 Wiki 页面草稿

- **方法**: `POST`
- **路径**: `/api/generate-draft`
- **功能描述**: 基于指定的标题和上下文，AI 自动生成 Wiki 页面草稿。
- **鉴权**: 需要 Bearer Token

**请求参数 (Body)**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `title` | string | 是 | 页面标题 |
| `type` | string | 否 | 页面类型 |
| `contexts` | string[] | 否 | 上下文列表 |
| `sources` | string[] | 否 | 来源列表 |

**响应字段**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `title` | string | 页面标题 |
| `content` | string | 生成的 Markdown 内容 |
| `suggestedTags` | string[] | 建议的标签 |
| `relatedSlugs` | string[] | 相关页面 slug 列表 |

**错误码**:

| 错误码 | 触发条件 |
|--------|----------|
| `VALIDATION_ERROR` | 标题为空 |
| `INTERNAL_ERROR` | 服务器内部错误 |

**源码**: [file:///workspace/server/src/routes/brainapi.ts#L325-L350](file:///workspace/server/src/routes/brainapi.ts#L325-L350)

---

#### 4.8.2 生成静态站点

- **方法**: `POST`
- **路径**: `/api/generate-static-site`
- **功能描述**: 将知识库导出为静态 HTML 站点，可独立部署。
- **鉴权**: 需要 Bearer Token

**请求参数 (Body)**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `outputPath` | string | 否 | 输出路径 |
| `includeMedia` | boolean | 否 | 是否包含媒体文件 |
| `includeGraph` | boolean | 否 | 是否包含图谱数据 |
| `theme` | string | 否 | 主题：`light` / `dark` |

**响应字段**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `outputPath` | string | 输出路径 |
| `renderedPages` | number | 渲染的页面数 |
| `copiedMedia` | number | 复制的媒体文件数 |
| `durationMs` | number | 耗时（毫秒） |

**错误码**:

| 错误码 | 触发条件 |
|--------|----------|
| `INTERNAL_ERROR` | 服务器内部错误 |

**源码**: [file:///workspace/server/src/routes/brainapi.ts#L353-L376](file:///workspace/server/src/routes/brainapi.ts#L353-L376)

---

### 4.9 审计与评估

#### 4.9.1 获取变更日志

- **方法**: `GET`
- **路径**: `/api/changelog`
- **功能描述**: 获取知识库的变更历史日志，支持分页和操作类型过滤。
- **鉴权**: 需要 Bearer Token

**请求参数 (Query)**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `limit` | number | 否 | 返回数量限制 |
| `op` | string | 否 | 操作类型过滤 |

**响应字段**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `batches` | Array | 变更批次列表 |
| `total` | number | 总批次数 |

**错误码**:

| 错误码 | 触发条件 |
|--------|----------|
| `INTERNAL_ERROR` | 服务器内部错误 |

**源码**: [file:///workspace/server/src/routes/brainapi.ts#L379-L397](file:///workspace/server/src/routes/brainapi.ts#L379-L397)

---

#### 4.9.2 获取评估报告

- **方法**: `GET`
- **路径**: `/api/eval-report`
- **功能描述**: 获取 AI 回答质量的评估报告，包括基准测试结果、准确率趋势和异常检测。
- **鉴权**: 需要 Bearer Token

**请求参数**: 无

**响应字段**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `benchmarks` | Array | 基准测试用例列表 |
| `anomalies` | Array | 异常检测结果列表 |
| `summary` | object | 评估摘要 |
| `trend` | Array | 准确率趋势数据 |

**错误码**:

| 错误码 | 触发条件 |
|--------|----------|
| `INTERNAL_ERROR` | 服务器内部错误 |

**源码**: [file:///workspace/server/src/routes/brainapi.ts#L400-L413](file:///workspace/server/src/routes/brainapi.ts#L400-L413)

---

#### 4.9.3 执行影子评估

- **方法**: `POST`
- **路径**: `/api/shadow-eval`
- **功能描述**: 在影子模式下运行评估套件，不影响生产数据，用于验证新版本效果。
- **鉴权**: 需要 Bearer Token

**请求参数**: 无

**响应字段**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `passed` | boolean | 是否通过 |
| `accuracy` | number | 准确率 |
| `reproductionRate` | number | 复现率 |
| `newErrors` | number | 新发现错误数 |
| `errors` | string[] | 错误详情列表 |

**错误码**:

| 错误码 | 触发条件 |
|--------|----------|
| `INTERNAL_ERROR` | 服务器内部错误 |

**源码**: [file:///workspace/server/src/routes/brainapi.ts#L416-L429](file:///workspace/server/src/routes/brainapi.ts#L416-L429)

---

#### 4.9.4 获取时间线

- **方法**: `GET`
- **路径**: `/api/timeline`
- **功能描述**: 获取知识库的事件时间线，支持按页面过滤和分页。
- **鉴权**: 需要 Bearer Token

**请求参数 (Query)**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `slug` | string | 否 | 页面 slug 过滤 |
| `limit` | number | 否 | 返回数量限制 |
| `offset` | number | 否 | 偏移量（分页） |

**响应字段**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `items` | TimelineEntry[] | 时间线条目列表 |
| `total` | number | 总条目数 |

**TimelineEntry 结构**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | number | 条目 ID |
| `slug` | string | 关联页面 slug |
| `type` | string | 事件类型 |
| `payload` | object | 事件详情 |
| `ts` | string | 时间戳 |

**错误码**:

| 错误码 | 触发条件 |
|--------|----------|
| `INTERNAL_ERROR` | 服务器内部错误 |

**源码**: [file:///workspace/server/src/routes/brainapi.ts#L432-L447](file:///workspace/server/src/routes/brainapi.ts#L432-L447)

---

#### 4.9.5 健康仪表盘

- **方法**: `GET`
- **路径**: `/api/health-dashboard`
- **功能描述**: 获取系统健康仪表盘的完整数据，包括知识规模、活跃度、审核积压、AI 质量、预算状态等。
- **鉴权**: 需要 Bearer Token

**请求参数**: 无

**响应字段**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `scale` | object | 知识规模统计（节点、边、页面数及趋势） |
| `contextHeatmap` | Array | 上下文活跃度热力图 |
| `reviewBacklog` | object | 审核积压统计（绿/黄/红数量） |
| `aiQuality` | object | AI 质量指标（正确率及趋势） |
| `budget` | object | 预算使用情况（日/月/单次查询） |
| `ghostRelations` | number | 幽灵关系数量 |
| `archiveStatus` | object | 归档状态（活跃/归档版本数） |
| `cacheHitRate` | number | 缓存命中率 |
| `brokenEvidenceChains` | number | 断裂证据链数量 |
| `orphanedFiles` | number | 孤立文件数量 |
| `observedFiles` | number | 观察文件数量 |
| `lastUpdated` | string | 最后更新时间 |

**错误码**:

| 错误码 | 触发条件 |
|--------|----------|
| `INTERNAL_ERROR` | 服务器内部错误 |

**源码**: [file:///workspace/server/src/routes/health.ts#L16-L19](file:///workspace/server/src/routes/health.ts#L16-L19)

---

### 4.10 系统设置

#### 4.10.1 获取设置

- **方法**: `GET`
- **路径**: `/api/settings`
- **功能描述**: 获取系统全局设置配置。
- **鉴权**: 需要 Bearer Token

**请求参数**: 无

**响应字段**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `settings` | Settings | 全局设置对象 |

**Settings 包含的主要子对象**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `appearance` | object | 外观设置（主题、字体大小） |
| `general` | object | 常规设置（知识库名称、刷新间隔等） |
| `language` | string | 界面语言 |
| `budget` | object | 预算设置 |
| `security` | object | 安全设置 |
| `privacy` | object | 隐私设置 |
| `tasks` | object | 任务调度设置 |
| `paths` | object | 路径配置 |
| `integration` | object | 集成设置（LLM 适配器等） |
| `experimental` | object | 实验性功能设置 |

**错误码**: 无（出错时返回默认设置）

**源码**: [file:///workspace/server/src/routes/settings.ts#L9-L27](file:///workspace/server/src/routes/settings.ts#L9-L27)

---

#### 4.10.2 更新设置

- **方法**: `PUT`
- **路径**: `/api/settings`
- **功能描述**: 更新系统全局设置配置。
- **鉴权**: 需要 Bearer Token

**请求参数 (Body)**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `settings` | Settings | 是 | 完整的设置对象 |

**响应字段**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `success` | boolean | 是否保存成功 |
| `settings` | Settings | 保存后的设置对象 |

**错误码**:

| 错误码 | 触发条件 |
|--------|----------|
| `INTERNAL_ERROR` | 服务器内部错误 |

**源码**: [file:///workspace/server/src/routes/settings.ts#L29-L54](file:///workspace/server/src/routes/settings.ts#L29-L54)

---

### 4.11 预算管理

#### 4.11.1 设置日预算

- **方法**: `POST`
- **路径**: `/api/settings/daily-budget`
- **功能描述**: 设置每日 LLM 调用预算上限。
- **鉴权**: 需要 Bearer Token

**请求参数 (Body)**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `amount` | number | 是 | 日预算金额（美元），必须非负 |

**响应字段**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `success` | boolean | 是否设置成功 |
| `dailyBudget` | number | 更新后的日预算 |

**错误码**:

| 错误码 | 触发条件 |
|--------|----------|
| `VALIDATION_ERROR` | amount 为负数或非数字 |
| `INTERNAL_ERROR` | 服务器内部错误 |

**源码**: [file:///workspace/server/src/routes/brainapi.ts#L595-L620](file:///workspace/server/src/routes/brainapi.ts#L595-L620)

---

#### 4.11.2 获取剩余预算

- **方法**: `GET`
- **路径**: `/api/budget/remaining`
- **功能描述**: 获取当前剩余的预算金额。
- **鉴权**: 需要 Bearer Token

**请求参数**: 无

**响应字段**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `daily` | object | 今日预算使用情况 |
| `monthly` | object | 本月预算使用情况 |

**错误码**:

| 错误码 | 触发条件 |
|--------|----------|
| `INTERNAL_ERROR` | 服务器内部错误 |

**源码**: [file:///workspace/server/src/routes/brainapi.ts#L623-L636](file:///workspace/server/src/routes/brainapi.ts#L623-L636)

---

#### 4.11.3 获取预算告警

- **方法**: `GET`
- **路径**: `/api/budget/alerts`
- **功能描述**: 获取预算告警列表，包括阈值触发的警告通知。
- **鉴权**: 需要 Bearer Token

**请求参数**: 无

**响应字段**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `items` | Array | 告警列表 |
| `total` | number | 告警总数 |

**错误码**:

| 错误码 | 触发条件 |
|--------|----------|
| `INTERNAL_ERROR` | 服务器内部错误 |

**源码**: [file:///workspace/server/src/routes/brainapi.ts#L639-L652](file:///workspace/server/src/routes/brainapi.ts#L639-L652)

---

### 4.12 LLM 集成

#### 4.12.1 获取 LLM 适配器列表

- **方法**: `GET`
- **路径**: `/api/llm/adapters`
- **功能描述**: 获取所有支持的 LLM 适配器及其配置状态。
- **鉴权**: 需要 Bearer Token

**请求参数**: 无

**响应字段**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `adapters` | AdapterStatus[] | 适配器状态列表 |

**AdapterStatus 结构**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 适配器 ID |
| `displayName` | string | 显示名称 |
| `enabled` | boolean | 是否启用 |
| `apiKeyConfigured` | boolean | API Key 是否已配置 |
| `defaultModel` | string | 默认模型名称 |

**支持的适配器**:

| 适配器 ID | 厂商 |
|-----------|------|
| `bailian` | 阿里云百炼 |
| `zhipu` | 智谱 AI |
| `moonshot` | 月之暗面 Kimi |
| `ernie` | 百度文心一言 |
| `spark` | 讯飞星火 |
| `hunyuan` | 腾讯混元 |
| `minimax` | MiniMax |
| `deepseek` | 深度求索 |
| `yi` | 零一万物 |
| `baichuan` | 百川智能 |

**错误码**: 无

**源码**: [file:///workspace/server/src/routes/llm.ts#L8-L11](file:///workspace/server/src/routes/llm.ts#L8-L11)

---

#### 4.12.2 测试 LLM 适配器

- **方法**: `POST`
- **路径**: `/api/llm/test`
- **功能描述**: 测试指定 LLM 适配器的连通性和延迟。
- **鉴权**: 需要 Bearer Token

**请求参数 (Body)**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `adapterId` | string | 是 | 适配器 ID |

**响应字段**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `adapterId` | string | 适配器 ID |
| `ok` | boolean | 测试是否成功 |
| `latencyMs` | number | 延迟（毫秒） |
| `error` | string | 错误信息（失败时） |

**错误码**:

| 错误码 | 触发条件 |
|--------|----------|
| `NOT_FOUND` | 适配器不存在 |
| `INTERNAL_ERROR` | 服务器内部错误 |

**源码**: [file:///workspace/server/src/routes/llm.ts#L13-L44](file:///workspace/server/src/routes/llm.ts#L13-L44)

---

## 5. 前端 API 客户端使用示例

前端使用内置的 `api` 客户端进行 API 调用，自动处理鉴权、错误处理和 Token 管理。

### 源码

- API 客户端：[file:///workspace/web/src/lib/api.ts](file:///workspace/web/src/lib/api.ts)

---

### 示例 1：用户登录

```typescript
import api from './lib/api';

// 登录并保存 Token
async function login(apiKey: string) {
  try {
    const result = await api.login(apiKey);
    // Token 自动保存到 localStorage
    console.log('登录成功:', result.success);
    console.log('Token:', result.token);
    return result;
  } catch (err: any) {
    console.error('登录失败:', err.code, err.message);
    throw err;
  }
}

// 使用方式
await login('your-api-key-here');
```

---

### 示例 2：智能问答

```typescript
import api from './lib/api';

// 发起问答请求
async function askQuestion(question: string, conversationId?: string) {
  try {
    const result = await api.askQuestion(question, {
      conversationId,
      maxReflections: 3
    });

    console.log('回答:', result.answer);
    console.log('置信度:', result.confidence);
    console.log('证据来源:', result.sources);
    console.log('相关实体:', result.relatedEntities);
    console.log('消耗 Token:', result.tokensUsed);
    console.log('预估费用:', result.estimatedCost);

    return result;
  } catch (err: any) {
    if (err.code === 'VALIDATION_ERROR') {
      console.error('问题不能为空');
    } else if (err.code === 'UNAUTHORIZED') {
      console.error('请先登录');
    } else {
      console.error('问答失败:', err.message);
    }
    throw err;
  }
}

// 首次提问
const firstResult = await askQuestion('什么是知识图谱？');

// 多轮对话（使用返回的 conversationId）
const followUpResult = await askQuestion(
  '它有什么应用场景？',
  firstResult.conversationId
);
```

---

### 示例 3：知识检索

```typescript
import api from './lib/api';

// 执行检索
async function searchKnowledge(query: string) {
  try {
    const result = await api.queryKnowledge(query, {
      intent: 'factual',
      topK: 10,
      contexts: ['技术文档']
    });

    console.log('检索意图:', result.intent);
    console.log('检索层级:', result.tier);
    console.log('耗时:', result.durationMs, 'ms');
    console.log('结果数:', result.items.length);

    result.items.forEach((item, index) => {
      console.log(`${index + 1}. ${item.title} (${item.score})`);
      console.log(`   ${item.snippet}`);
    });

    return result;
  } catch (err: any) {
    console.error('检索失败:', err.message);
    throw err;
  }
}

// 使用方式
await searchKnowledge('向量数据库');
```

---

### 示例 4：获取设置与更新

```typescript
import api from './lib/api';

// 获取当前设置
async function loadSettings() {
  try {
    const { settings } = await api.getSettings();
    console.log('知识库名称:', settings.general.knowledgeBaseName);
    console.log('主题:', settings.appearance.theme);
    console.log('日预算:', settings.budget.dailyBudget);
    return settings;
  } catch (err: any) {
    console.error('获取设置失败:', err.message);
    throw err;
  }
}

// 更新设置
async function updateTheme(theme: 'light' | 'dark' | 'system') {
  try {
    const current = await loadSettings();
    const updated = {
      ...current,
      appearance: {
        ...current.appearance,
        theme
      }
    };

    const result = await api.updateSettings(updated);
    console.log('设置已更新:', result.success);
    return result.settings;
  } catch (err: any) {
    console.error('更新设置失败:', err.message);
    throw err;
  }
}

// 使用方式
await updateTheme('dark');
```

---

### 客户端 API 方法一览

| 方法 | 说明 |
|------|------|
| `api.login(apiKey)` | 用户登录 |
| `api.getToken()` | 获取当前 Token |
| `api.setToken(token, remember)` | 设置 Token |
| `api.clearToken()` | 清除 Token |
| `api.isAuthenticated()` | 检查是否已登录 |
| `api.getSettings()` | 获取设置 |
| `api.updateSettings(settings)` | 更新设置 |
| `api.getLlmAdapters()` | 获取 LLM 适配器列表 |
| `api.testLlmAdapter(adapterId)` | 测试 LLM 适配器 |
| `api.askQuestion(question, options)` | 智能问答 |
| `api.queryKnowledge(query, options)` | 知识检索 |
| `api.getGraphData()` | 获取图谱数据 |
| `api.getPendingDiffs(tier)` | 获取待审核变更 |
| `api.applyDiff(diffId)` | 应用变更 |
| `api.rejectDiff(diffId)` | 拒绝变更 |
| `api.getConversation(conversationId)` | 获取对话记录 |
| `api.getChangeLog(params)` | 获取变更日志 |
| `api.rollbackBatch(batchId)` | 回滚变更批次 |
| `api.getEvalReport()` | 获取评估报告 |
| `api.runShadowEval()` | 执行影子评估 |
| `api.getTimeline(params)` | 获取时间线 |
| `api.search(query)` | 全局搜索 |
| `api.getLibraryFile(hash)` | 获取库文件信息 |
| `api.rebuildStruct()` | 重建知识结构 |
| `api.getHealthDashboard()` | 获取健康仪表盘 |

---

## 6. 预留/未实现端点

以下端点在前端 API 客户端中已定义，但后端路由中**尚未实现**，为预留功能：

| 方法 | 路径 | 说明 | 状态 |
|------|------|------|------|
| `GET` | `/api/pages/:slug` | 获取 Wiki 页面详情 | ⚠️ 预留 |
| `PUT` | `/api/pages/:slug` | 更新 Wiki 页面内容 | ⚠️ 预留 |
| `POST` | `/api/ingest/upload` | 文件上传入库 | ⚠️ 预留 |
| `POST` | `/api/ingest/url` | URL 网页抓取 | ⚠️ 预留 |
| `DELETE` | `/api/library-files/:hash` | 删除库文件 | ⚠️ 预留 |
| `POST` | `/api/entities/merge` | 合并实体 | ⚠️ 预留 |
| `POST` | `/api/entities/split` | 拆分实体 | ⚠️ 预留 |
| `GET` | `/api/stats/overview` | 统计概览 | ⚠️ 预留 |
| `POST` | `/api/export/pdf` | 导出 PDF | ⚠️ 预留 |
| `GET` | `/api/mcp/tools` | MCP 工具列表 | ⚠️ 预留 |

> **说明**：以上端点为规划中的功能，当前版本（v5.0.0）尚未实现，将在后续版本中逐步上线。前端 API 客户端中的相关方法仅为占位实现。

---

## 附录

### A. 端点总览（36 个已实现端点）

| 分组 | 端点数量 | 端点列表 |
|------|----------|----------|
| 认证与健康检查 | 2 | `GET /health`, `POST /api/auth/login` |
| 问答与检索 | 2 | `POST /api/ask`, `POST /api/query` |
| 知识图谱 | 1 | `GET /api/graph` |
| 变更审核与回滚 | 4 | `GET /api/diffs`, `POST /api/diffs/:id/apply`, `POST /api/diffs/:id/reject`, `POST /api/rollback/:batchId` |
| 对话与反馈 | 2 | `GET /api/conversations/:id`, `POST /api/feedback` |
| 文件管理 | 6 | `GET /api/observed-files`, `POST /api/observed-files/:hash/extract`, `POST /api/translate-evidence`, `GET /api/search`, `GET /api/library-files/:hash`, `GET /api/library-files/:hash/content` |
| 知识演化 | 4 | `POST /api/archive-versions`, `POST /api/clean-ghost-relations`, `POST /api/rebuild-struct`, `POST /api/extract-pending` |
| 内容生成 | 2 | `POST /api/generate-draft`, `POST /api/generate-static-site` |
| 审计与评估 | 5 | `GET /api/changelog`, `GET /api/eval-report`, `POST /api/shadow-eval`, `GET /api/timeline`, `GET /api/health-dashboard` |
| 系统设置 | 2 | `GET /api/settings`, `PUT /api/settings` |
| 预算管理 | 3 | `POST /api/settings/daily-budget`, `GET /api/budget/remaining`, `GET /api/budget/alerts` |
| LLM 集成 | 2 | `GET /api/llm/adapters`, `POST /api/llm/test` |
| **合计** | **36** | |

### B. 相关源码文件

| 文件 | 说明 |
|------|------|
| [file:///workspace/server/src/index.ts](file:///workspace/server/src/index.ts) | 服务主入口，全局路由与错误处理 |
| [file:///workspace/server/src/routes/brainapi.ts](file:///workspace/server/src/routes/brainapi.ts) | Brain API 核心路由（27 个端点） |
| [file:///workspace/server/src/routes/health.ts](file:///workspace/server/src/routes/health.ts) | 健康与运维路由（3 个端点） |
| [file:///workspace/server/src/routes/llm.ts](file:///workspace/server/src/routes/llm.ts) | LLM 集成路由（2 个端点） |
| [file:///workspace/server/src/routes/settings.ts](file:///workspace/server/src/routes/settings.ts) | 设置路由（2 个端点） |
| [file:///workspace/server/src/auth/bearer.ts](file:///workspace/server/src/auth/bearer.ts) | Bearer Token 鉴权中间件 |
| [file:///workspace/server/src/i18n/errors.zh-CN.ts](file:///workspace/server/src/i18n/errors.zh-CN.ts) | 错误消息定义 |
| [file:///workspace/web/src/lib/api.ts](file:///workspace/web/src/lib/api.ts) | 前端 API 客户端 |
| [file:///workspace/shared/types/index.ts](file:///workspace/shared/types/index.ts) | 共享类型定义 |

---

*文档结束*
