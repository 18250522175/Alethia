# Alethia 开发指南

> 版本：v5.0 · 生成日期：2026-07-04

本文档为 Alethia AI 知识库项目的完整开发指南，涵盖项目结构、环境搭建、编码规范、调试技巧与测试方法。

---

## 目录

1. [项目结构详解](#1-项目结构详解)
2. [开发环境搭建](#2-开发环境搭建)
3. [常用命令](#3-常用命令)
4. [代码风格与约定](#4-代码风格与约定)
5. [新增功能指南](#5-新增功能指南)
6. [调试技巧](#6-调试技巧)
7. [测试指南](#7-测试指南)
8. [贡献指南](#8-贡献指南)

---

## 1. 项目结构详解

### 1.1 Monorepo 布局

Alethia 采用 **Bun Workspaces** 管理的 Monorepo 架构，包含三个核心包：

```
alethia/
├── package.json          # 根配置，定义 workspaces
├── tsconfig.base.json    # 共享 TypeScript 配置
├── bun.lock              # Bun 锁定文件
├── shared/               # 共享类型模块 (@alethia/shared)
├── server/               # 后端服务 (@alethia/server)
└── web/                  # 前端应用 (@alethia/web)
```

根 `package.json` 定义了工作空间与全局脚本：

```json
{
  "name": "alethia",
  "private": true,
  "workspaces": ["shared", "server", "web"]
}
```

三个包通过 `@alethia/*` 作用域互相引用，共享类型通过 `@shared/*` 路径别名导入。

---

### 1.2 后端目录结构 (server/)

后端基于 **Hono** 框架 + **Bun** 运行时，目录位于 `server/src/`：

| 目录 | 职责 | 关键文件 |
|------|------|----------|
| `agents/` | AI Agent 实现，负责知识处理各环节 | `planner.ts`, `retriever.ts`, `generator.ts`, `grader.ts`, `reflector.ts`, `compression.ts`, `feedback.ts`, `observe.ts`, `translate.ts` |
| `auth/` | 认证中间件 | `bearer.ts` - Bearer Token 认证 |
| `brainapi/` | Brain API 核心逻辑 | `index.ts`, `static.ts` |
| `cli/` | 命令行工具 | `brain.ts` - Brain CLI 入口 |
| `config/` | 配置加载与校验 | `loader.ts`, `schema.ts`, `defaults.ts` |
| `db/` | 数据库层 | `pool.ts` - 连接池, `dimension.ts` - 向量维度管理, `migrations/` - 迁移脚本 |
| `evolution/` | 知识演化引擎 | `dream.ts`, `shadow.ts`, `archive.ts`, `rollback.ts`, `ghost.ts`, `budget.ts`, `weekly.ts` |
| `i18n/` | 国际化与日志 | `errors.zh-CN.ts` - 错误信息, `logger.ts` - Pino 日志实例 |
| `ingest/` | 数据摄取管道 | `pipeline.ts`, `document.ts`, `text.ts`, `web.ts`, `image.ts`, `audio.ts`, `video.ts`, `clean.ts` |
| `llm/` | 大模型接入层 | `router.ts` - 路由调度, `adapter.ts` - 适配器基类, `embed.ts` - 嵌入模型, `adapters/` - 各厂商实现 |
| `mcp/` | Model Context Protocol | `server.ts` |
| `retrieval/` | 检索引擎 | `router.ts`, `vector.ts`, `fulltext.ts`, `graph.ts`, `entity.ts`, `rerank.ts`, `rrf.ts`, `nli.ts`, `source.ts` |
| `routes/` | API 路由定义 | `health.ts`, `llm.ts`, `settings.ts`, `brainapi.ts` |
| `storage/` | 知识库存储 | `parser.ts` - Markdown 解析, `markdown.ts`, `manifest.ts`, `summary.ts`, `sync.ts` |
| `index.ts` | 服务入口 | 应用初始化、中间件注册、路由挂载 |

**技术栈**：Hono（Web 框架）、Kysely（SQL 查询构建器）、pg（PostgreSQL 驱动）、Zod（校验）、Pino（日志）、Unified/Remark（Markdown 处理）、Transformers.js（本地嵌入/NLI）。

---

### 1.3 前端目录结构 (web/)

前端基于 **React 18** + **Vite** + **TypeScript**，目录位于 `web/src/`：

| 目录 | 职责 | 关键文件 |
|------|------|----------|
| `blocks/` | 高级 UI 区块组件 | `GlobalSearch.tsx`, `MessageBubble.tsx`, `DiffCard.tsx`, `BudgetBadge.tsx`, `EvidencePopover.tsx`, `GraphNodeCard.tsx`, `QuickAskButton.tsx`, `UserMenu.tsx` |
| `components/` | 通用组件 | `MarkdownRenderer.tsx`, `DiffCompare.tsx`, `brain-media.tsx` |
| `contexts/` | React Context | `NotificationContext.tsx` - 通知系统 |
| `i18n/` | 国际化配置 | `config.ts`, `locales/zh-CN.json`, `locales/en.json` |
| `layouts/` | 布局组件 | `Shell.tsx`, `Sidebar.tsx`, `TopBar.tsx`, `StatusBar.tsx` |
| `lib/` | 工具库 | `api.ts` - API 封装, `query.ts` - TanStack Query 配置 |
| `routes/` | 页面级组件 | `DashboardPage.tsx`, `WikiHomePage.tsx`, `WikiEntryPage.tsx`, `QAPanelPage.tsx`, `SearchResultPage.tsx`, `GraphFullPage.tsx`, `TimelineFullPage.tsx`, `DiffReviewPage.tsx`, `ChangelogPage.tsx`, `EvalReportPage.tsx`, `SettingsPage.tsx`, `LibraryFilePage.tsx`, `LoginPage.tsx`, `OnboardingPage.tsx` |
| `store/` | 全局状态 Context | `AuthContext.tsx`, `SettingsContext.tsx`, `ThemeContext.tsx` |
| `App.tsx` | 应用根组件 | 路由配置 |
| `main.tsx` | 入口文件 | React DOM 渲染 |
| `index.css` | 全局样式 | Tailwind 基础样式 |

**技术栈**：React 18、React Router v6、TanStack Query v5、Headless UI、Tailwind CSS、Cytoscape.js（知识图谱）、Chart.js（图表）、Phosphor Icons（图标）、i18next（国际化）、dnd-kit（拖拽）、Floating UI（浮层）、Markdown-It + Highlight.js（Markdown 渲染）。

---

### 1.4 共享类型模块 (shared/)

共享类型定义位于 `shared/types/`，前后端共用，通过 `@shared/*` 路径别名导入：

| 文件 | 内容 |
|------|------|
| `index.ts` | 统一导出入口 |
| `ask.ts` | 问答相关类型（AskRequest, AskResponse 等） |
| `diff.ts` | 知识差异相关类型（PendingDiff, DiffApplyResult 等） |
| `entities.ts` | 实体类型（Page, Link, TimelineEntry, EvidenceSpan 等） |
| `evidence.ts` | 证据链相关类型 |
| `evolution.ts` | 知识演化相关类型 |
| `health.ts` | 健康检查相关类型 |
| `llm.ts` | LLM 适配器类型（LLMRequest, LLMResponse, LLMAdapter, AdapterId 等） |
| `query.ts` | 检索查询相关类型 |
| `settings.ts` | 系统设置相关类型 |

**路径别名配置**（`tsconfig.base.json`）：

```json
{
  "paths": {
    "@shared/*": ["./shared/types/*"]
  },
  "baseUrl": "."
}
```

---

## 2. 开发环境搭建

### 2.1 前置要求

| 工具 | 最低版本 | 说明 |
|------|----------|------|
| **Bun** | 1.2+ | JavaScript 运行时与包管理器，项目全程使用 Bun |
| **PostgreSQL** | 16+ | 关系型数据库，需安装 **pgvector** 扩展 |
| **pgvector** | 0.7+ | PostgreSQL 向量搜索扩展 |
| **Git** | 2.30+ | 版本控制 |

> **提示**：推荐使用 Docker 方式快速启动 PostgreSQL + pgvector，详见 `docker-compose.yml`。

---

### 2.2 安装步骤

#### 步骤 1：克隆仓库

```bash
git clone <repository-url>
cd alethia
```

#### 步骤 2：安装依赖

```bash
bun install
```

Bun 会自动安装所有 workspace 的依赖（shared、server、web）。

#### 步骤 3：配置环境变量

复制 `.env.example` 为 `.env`：

```bash
cp .env.example .env
```

关键环境变量说明：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DATABASE_URL` | PostgreSQL 连接串 | `postgres://alethia:alethia@localhost:5432/alethia` |
| `BRAIN_PORT` | 后端服务端口 | `3000` |
| `BRAIN_API_KEY` | API 访问密钥（必填，逗号分隔多个） | 空 |
| `LANGUAGE` | 默认语言 | `zh-CN` |
| `DAILY_BUDGET` | 日预算上限（美元） | `5` |
| `MONTHLY_BUDGET` | 月预算上限（美元） | `50` |
| `PER_QUERY_BUDGET` | 单次问答预算上限（美元） | `0.5` |
| `EMBEDDING_PROVIDER` | 嵌入模型提供方（`local` 或厂商 ID） | `local` |
| `EMBEDDING_MODEL` | 嵌入模型名称 | `all-MiniLM-L6-v2` |
| `NLI_PROVIDER` | NLI 服务提供方 | `local` |
| `RERANKER_ENABLED` | 是否启用重排序 | `false` |
| `*_API_KEY` | 各 LLM 厂商 API Key | 空 |

---

### 2.3 数据库迁移

#### 方式一：Docker 快速启动（推荐）

项目根目录提供了完整的 `docker-compose.yml`，可一键启动 PostgreSQL + pgvector：

```bash
docker compose up -d postgres
```

#### 方式二：本地 PostgreSQL

确保本地已安装 PostgreSQL 16 + pgvector，然后创建数据库：

```sql
CREATE USER alethia WITH PASSWORD 'alethia';
CREATE DATABASE alethia OWNER alethia;
\c alethia
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

#### 执行迁移

```bash
bun run db:migrate
```

迁移脚本位于 `server/src/db/migrations/`，首个迁移 `0001_init.sql` 会创建所有核心表（pages、page_embeddings、page_fts、links、timeline_entries、knowledge_versions、semantic_rings、evidence_spans、clusters、communities、library_files、pending_diffs、conversation_logs 等 20+ 张表）。

---

### 2.4 启动开发服务器

#### 同时启动前后端（推荐两个终端）

**终端 1 - 启动后端**：
```bash
bun run dev:server
```

后端将在 `http://localhost:3000` 启动，支持热重载（`--watch` 模式）。

**终端 2 - 启动前端**：
```bash
bun run dev:web
```

前端将在 `http://localhost:5173` 启动（Vite 默认端口），支持 HMR 热更新。

#### 验证服务

访问健康检查接口：
```bash
curl http://localhost:3000/health
```

返回示例：
```json
{
  "status": "ok",
  "lang": "zh-CN",
  "db": "connected",
  "llm": "configured",
  "embedding": "local",
  "version": "5.0.0"
}
```

---

## 3. 常用命令

### 3.1 根目录脚本

在项目根目录执行：

| 命令 | 说明 |
|------|------|
| `bun install` | 安装所有 workspace 依赖 |
| `bun run dev:server` | 启动后端开发服务器（watch 模式） |
| `bun run dev:web` | 启动前端开发服务器（Vite） |
| `bun run build` | 按顺序构建 shared → server → web |
| `bun run db:migrate` | 执行数据库迁移 |
| `bun run seed` | 运行种子数据脚本 |
| `bun run brain` | 启动 Brain CLI 工具 |

---

### 3.2 Server 脚本

在 `server/` 目录执行，或根目录用 `bun run --filter server <script>`：

| 命令 | 说明 |
|------|------|
| `bun run dev` | 以 watch 模式启动开发服务器 |
| `bun run start` | 直接启动生产模式服务 |
| `bun run build` | 构建到 `dist/` 目录（target: bun） |
| `bun run db:migrate` | 执行数据库迁移脚本 |
| `bun run seed` | 运行种子数据 |
| `bun run brain` | 启动 Brain CLI |
| `bun test` | 运行所有测试用例 |

---

### 3.3 Web 脚本

在 `web/` 目录执行：

| 命令 | 说明 |
|------|------|
| `bun run dev` | 启动 Vite 开发服务器 |
| `bun run build` | 类型检查 + 生产构建（tsc && vite build） |
| `bun run preview` | 预览生产构建产物 |

---

### 3.4 Bun 常用命令

| 命令 | 说明 |
|------|------|
| `bun add <pkg>` | 添加依赖到当前包 |
| `bun add -d <pkg>` | 添加开发依赖 |
| `bun remove <pkg>` | 移除依赖 |
| `bun run <script>` | 运行 package.json 脚本 |
| `bun test` | 运行测试 |
| `bun test --watch` | watch 模式运行测试 |
| `bun build` | 打包构建 |
| `bun run --filter <workspace> <script>` | 在指定 workspace 运行脚本 |
| `bunx <command>` | 执行 npm 包二进制 |

---

## 4. 代码风格与约定

### 4.1 TypeScript 严格模式

项目全局启用 TypeScript 严格模式（`tsconfig.base.json`）：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "jsx": "react-jsx"
  }
}
```

**关键规则**：
- `strict: true`：启用所有严格类型检查
- `noImplicitAny`：禁止隐式 `any` 类型
- `strictNullChecks`：严格空值检查
- `noUnusedLocals` / `noUnusedParameters`：未使用变量/参数报错（通过 skipLibCheck 跳过库文件）

---

### 4.2 全汉化原则

项目遵循**中文优先**的汉化原则：

#### 后端错误信息
所有用户可见的错误信息统一存放于 `server/src/i18n/errors.zh-CN.ts`，通过错误码引用：

```typescript
export const errorMessages: Record<string, string> = {
  UNAUTHORIZED: '未授权：缺失或无效的 API 密钥',
  VALIDATION_ERROR: '请求参数校验失败',
  NOT_FOUND: '请求的资源不存在',
  BUDGET_EXCEEDED: '预算已超出限制',
  LLM_UNAVAILABLE: '未配置可用的大模型适配器...',
  INTERNAL_ERROR: '服务器内部错误',
  DATABASE_CONNECTION_FAILED: '无法连接到 PostgreSQL...',
  // ...
};
```

使用方式：
```typescript
import { getErrorMessage } from './i18n/errors.zh-CN';

return c.json({
  error: {
    code: 'NOT_FOUND',
    message: getErrorMessage('NOT_FOUND')
  }
}, 404);
```

#### 日志规范
后端日志统一使用中文描述，便于排查问题。

#### 前端界面
前端默认语言为 `zh-CN`，通过 react-i18next 管理多语言，中文翻译优先完成。

---

### 4.3 文件命名

| 类型 | 规范 | 示例 |
|------|------|------|
| 工具/逻辑文件 | kebab-case | `parser.ts`, `llm-router.ts` |
| React 组件 | PascalCase | `WikiEntryPage.tsx`, `MessageBubble.tsx` |
| 类型定义 | kebab-case | `ask.ts`, `evidence.ts` |
| 测试文件 | `*.test.ts` / `*.test.tsx` | `parser.test.ts` |
| 数据库迁移 | `XXXX_name.sql`（四位数字前缀） | `0001_init.sql` |

---

### 4.4 错误处理

#### 后端错误处理

后端采用**统一错误码 + 错误对象**的响应格式：

```typescript
// 错误响应格式
{
  error: {
    code: string;       // 错误码，如 UNAUTHORIZED, NOT_FOUND, INTERNAL_ERROR
    message: string;    // 中文错误信息
    details?: object;   // 可选的详细信息
  }
}
```

**全局错误处理**（`server/src/index.ts`）：
- `app.onError()`：捕获所有未处理异常，统一返回 JSON 错误
- `app.notFound()`：404 统一处理
- `HTTPException`：Hono 内置异常类，自动映射状态码

#### 前端错误处理

前端通过 `ApiErrorClass` 封装 API 错误（`web/src/lib/api.ts`）：

```typescript
class ApiErrorClass extends Error {
  code: string;
  details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
  }
}
```

使用 TanStack Query 时，错误会自动抛出为 `ApiErrorClass` 实例，可通过 `error.code` 判断错误类型。

---

### 4.5 日志规范

后端使用 **Pino** 作为日志库，实例位于 `server/src/i18n/logger.ts`。

**日志级别**：
- `fatal`：致命错误，服务无法启动
- `error`：错误，功能异常但服务继续运行
- `warn`：警告，潜在问题
- `info`：一般信息，服务状态、关键操作
- `debug`：调试信息，详细流程

**使用方式**：
```typescript
import logger from './i18n/logger';

logger.info('服务启动完成，监听端口: 3000');
logger.error({ err, adapter: 'qwen' }, 'LLM 调用失败');
logger.debug({ prompt: '...' }, '调试信息');
```

**约定**：
- 第一个参数为结构化对象（可选），第二个为中文消息
- 错误对象通过 `{ err }` 形式传入，Pino 会自动序列化
- 日志消息使用中文，便于排查

---

## 5. 新增功能指南

### 5.1 新增 API 端点步骤

以新增一个「获取统计信息」接口为例：

#### 步骤 1：定义共享类型

在 `shared/types/` 下新增或补充类型定义（如 `stats.ts`）：

```typescript
// shared/types/stats.ts
export interface KnowledgeStats {
  totalPages: number;
  totalLinks: number;
  totalEvidence: number;
  lastUpdated: string;
}
```

并在 `shared/types/index.ts` 中导出：
```typescript
export * from './stats.js';
```

#### 步骤 2：创建路由文件

在 `server/src/routes/` 下创建新路由（如 `stats.ts`）：

```typescript
import { Hono } from 'hono';
import { getPool } from '../db/pool';
import { getErrorMessage } from '../i18n/errors.zh-CN';
import logger from '../i18n/logger';

const app = new Hono();

app.get('/stats', async (c) => {
  try {
    const pool = getPool();
    
    const [pagesResult, linksResult, evidenceResult] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS count FROM pages'),
      pool.query('SELECT COUNT(*)::int AS count FROM links'),
      pool.query('SELECT COUNT(*)::int AS count FROM evidence_spans')
    ]);

    return c.json({
      totalPages: pagesResult.rows[0].count,
      totalLinks: linksResult.rows[0].count,
      totalEvidence: evidenceResult.rows[0].count,
      lastUpdated: new Date().toISOString()
    });
  } catch (err) {
    logger.error({ err }, '获取统计信息失败');
    return c.json({
      error: {
        code: 'INTERNAL_ERROR',
        message: getErrorMessage('INTERNAL_ERROR')
      }
    }, 500);
  }
});

export default app;
```

#### 步骤 3：注册路由

在 `server/src/index.ts` 中导入并挂载：

```typescript
import statsRoutes from './routes/stats';

// ...

app.route('/', statsRoutes);
```

#### 步骤 4：前端 API 封装

在 `web/src/lib/api.ts` 中添加对应方法：

```typescript
getStats() {
  return request<KnowledgeStats>('/stats');
}
```

---

### 5.2 新增前端页面步骤

以新增「统计面板」页面为例：

#### 步骤 1：创建页面组件

在 `web/src/routes/` 下创建 `StatsPage.tsx`：

```tsx
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export default function StatsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['stats'],
    queryFn: () => api.getStats()
  });

  if (isLoading) return <div>加载中...</div>;
  if (error) return <div>加载失败：{error.message}</div>;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">知识统计</h1>
      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 bg-white rounded-lg shadow">
          <div className="text-gray-500 text-sm">知识条目</div>
          <div className="text-3xl font-bold">{data?.totalPages}</div>
        </div>
        {/* 更多卡片 */}
      </div>
    </div>
  );
}
```

#### 步骤 2：配置路由

在 `web/src/App.tsx` 中添加路由：

```tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import StatsPage from './routes/StatsPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* 已有路由 */}
        <Route path="/stats" element={<StatsPage />} />
      </Routes>
    </BrowserRouter>
  );
}
```

#### 步骤 3：添加侧边栏入口（可选）

在 `web/src/layouts/Sidebar.tsx` 中添加导航项。

---

### 5.3 新增 LLM 适配器步骤

项目支持 10+ 家国内主流大模型厂商，新增适配器方式如下：

#### 方式一：OpenAI 兼容接口（推荐）

如果厂商提供 OpenAI 兼容 API，直接使用 `BaseOpenAICompatibleAdapter`：

```typescript
// server/src/llm/adapters/example.ts
import { BaseOpenAICompatibleAdapter } from '../adapter';

export class ExampleAdapter extends BaseOpenAICompatibleAdapter {
  constructor(apiKey: string) {
    super(
      'example',                           // AdapterId
      '示例大模型',                         // displayName
      'https://api.example.com/v1',        // baseURL
      apiKey,                              // apiKey
      'example-model'                      // defaultModel
    );
  }
}
```

#### 方式二：完全自定义适配器

继承 `BaseLLMAdapter` 抽象类：

```typescript
import { BaseLLMAdapter } from '../adapter';
import type { LLMRequest, LLMResponse } from '@shared/index';

export class CustomAdapter extends BaseLLMAdapter {
  readonly id = 'custom';
  readonly displayName = '自定义模型';

  async chat(req: LLMRequest): Promise<LLMResponse> {
    // 实现对话逻辑
    return {
      content: '回复内容',
      model: req.model || 'custom-model',
      tokensUsed: { prompt: 10, completion: 20, total: 30 },
      estimatedCost: this.estimateCost('custom-model', 10, 20),
      finishReason: 'stop'
    };
  }

  async embed(text: string): Promise<number[]> {
    // 实现嵌入逻辑
    return [];
  }

  async probe(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    // 实现连通性检测
    return { ok: true, latencyMs: 100 };
  }
}
```

#### 步骤 3：注册适配器

在 `server/src/llm/router.ts` 中注册新适配器（从环境变量读取 API Key 并初始化）。

#### 步骤 4：添加环境变量

在 `.env.example` 和 `docker-compose.yml` 中添加对应的 `EXAMPLE_API_KEY` 变量。

---

### 5.4 新增 Agent 扩展步骤

Agent 位于 `server/src/agents/`，负责知识处理的各个环节。

#### 新增 Agent 步骤：

1. 在 `server/src/agents/` 下创建 agent 文件（如 `analyzer.ts`）
2. 定义清晰的输入输出类型（优先放在 shared）
3. 使用 `llmRouter` 调用大模型
4. 使用 `logger` 记录关键日志
5. 错误处理要完善，抛出有意义的错误信息
6. 在需要的地方（如 brainapi 或 pipeline）调用新 agent

参考现有 agent 的结构（如 `planner.ts`、`retriever.ts`、`generator.ts`）。

---

## 6. 调试技巧

### 6.1 后端调试

#### Bun Inspector 调试

启动时添加 `--inspect` 参数：

```bash
cd server
bun run --inspect src/index.ts
```

或修改 `package.json` 的 dev 脚本：
```json
"dev": "bun run --watch --inspect src/index.ts"
```

然后在 Chrome 中打开 `chrome://inspect`，连接 Bun 的调试器进行断点调试。

#### 日志调试

最常用的调试方式是添加日志：

```typescript
import logger from '../i18n/logger';

logger.debug({ input, result }, '调试信息');
logger.warn({ data }, '警告信息');
```

日志会输出到控制台，包含结构化数据和时间戳。

#### 环境变量调试

设置 `NODE_ENV=development` 启用开发模式，CORS 策略更宽松。

---

### 6.2 前端调试

#### React DevTools

安装浏览器扩展 **React Developer Tools**，可查看组件树、Props、State、Hooks。

#### TanStack Query DevTools

项目已集成 TanStack Query，可在应用中查看查询缓存、请求状态、手动触发重取。

在开发环境下，Query DevTools 通常会自动显示（或通过配置开启）。

#### 浏览器开发者工具

- **Network 面板**：查看 API 请求/响应，检查请求头、响应体
- **Console 面板**：查看日志、错误堆栈
- **Application 面板**：查看 localStorage（auth_token 等）、IndexedDB
- **Sources 面板**：源码断点调试

---

### 6.3 数据库调试

#### 连接数据库

```bash
# Docker 方式
docker exec -it alethia-postgres psql -U alethia -d alethia

# 本地方式
psql postgres://alethia:alethia@localhost:5432/alethia
```

#### 常用查询

```sql
-- 查看知识条目数量
SELECT COUNT(*) FROM pages;

-- 查看最近更新的条目
SELECT slug, title, updated_at FROM pages ORDER BY updated_at DESC LIMIT 10;

-- 向量相似度搜索
SELECT p.slug, p.title, e.embedding <=> (SELECT embedding FROM page_embeddings WHERE page_id = 1) AS distance
FROM pages p
JOIN page_embeddings e ON e.page_id = p.id
ORDER BY distance ASC LIMIT 10;

-- 全文搜索
SELECT p.slug, p.title, ts_rank(f.tsv, phraseto_tsquery('zh', '熵')) AS rank
FROM pages p
JOIN page_fts f ON f.page_id = p.id
WHERE f.tsv @@ phraseto_tsquery('zh', '熵')
ORDER BY rank DESC LIMIT 10;
```

---

### 6.4 LLM 调试

#### 适配器连通性测试

调用测试接口：

```bash
curl -X POST http://localhost:3000/api/llm/test \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{"adapterId": "qwen"}'
```

返回：
```json
{
  "adapterId": "qwen",
  "ok": true,
  "latencyMs": 320
}
```

#### 查看可用适配器

```bash
curl http://localhost:3000/api/llm/adapters \
  -H "Authorization: Bearer YOUR_API_KEY"
```

#### 日志追踪

LLM 调用失败时，查看后端日志的 `adapter` 和 `model` 字段，定位具体适配器错误。

#### 成本估算验证

`BaseLLMAdapter.estimateCost()` 方法提供成本估算，可在 `adapter.ts` 中查看各模型定价配置。

---

## 7. 测试指南

### 7.1 Bun test 框架

项目使用 Bun 内置的测试框架 `bun:test`，无需额外安装依赖。

**基本语法**：

```typescript
import { describe, it, expect } from 'bun:test';

describe('测试套件名称', () => {
  it('测试用例描述', () => {
    expect(1 + 1).toBe(2);
  });
});
```

**常用断言**：
- `expect(value).toBe(expected)` — 严格相等
- `expect(value).toEqual(expected)` — 深度相等
- `expect(value).toContain(item)` — 包含
- `expect(value).toHaveLength(n)` — 长度
- `expect(fn).toThrow()` — 抛出异常
- `expect(value).toBeTruthy()` / `toBeFalsy()`

**运行测试**：
```bash
# 运行所有测试
bun test

# watch 模式
bun test --watch

# 运行指定文件
bun test parser.test.ts

# 运行匹配的测试
bun test -t "测试名称"
```

---

### 7.2 现有测试用例

当前已有 `server/src/storage/parser.test.ts`，测试 Markdown 解析器 `CompiledTruthParser`。

**测试覆盖范围**：

| 测试用例 | 验证内容 |
|----------|----------|
| 正确解析 frontmatter | title, type, contexts, canonical_slug |
| 解析 State 区段 | 状态信息提取 |
| 解析 Assessment 区段 | 评估内容提取 |
| 解析 Open Threads | 待办事项数组 |
| 解析 Relations | 关联关系（targetSlug, targetName, relation） |
| 解析 Timeline | 时间线条目（date, type, description） |
| 解析 Version History | 版本历史（version, date, summary） |
| 解析 Semantic Rings Archive | 语义环数组 |
| 解析 Evidence | 证据引用（spanId, source, text） |
| slug 读取 | 从 frontmatter canonical_slug 读取 |

**测试数据**：使用真实格式的 mock Markdown 内容（熵概念示例），确保测试贴近实际使用场景。

---

### 7.3 编写规范

#### 测试文件位置

测试文件与源文件同目录，命名为 `*.test.ts`：

```
storage/
├── parser.ts          # 源文件
└── parser.test.ts     # 测试文件
```

#### 编写规范

1. **中文描述**：`describe` 和 `it` 的描述使用中文，清晰表达测试意图
2. **Mock 数据**：使用贴近真实场景的 mock 数据，避免过于简单的测试用例
3. **独立运行**：每个测试用例应独立，不依赖其他用例的执行结果
4. **明确断言**：每个用例应有明确的断言，测试一个具体功能点
5. **异步测试**：异步函数使用 `async/await`，Bun test 自动支持
6. **覆盖率**：关键逻辑（解析、校验、核心算法）应有测试覆盖

#### 示例模板

```typescript
import { describe, it, expect } from 'bun:test';
import { yourFunction } from './your-module';

describe('模块/类名', () => {
  describe('方法名', () => {
    it('应在 XX 条件下返回 XX 结果', async () => {
      const input = '测试输入';
      const result = await yourFunction(input);
      
      expect(result.property).toBe('期望值');
    });
  });
});
```

---

## 8. 贡献指南

### 8.1 代码提交规范

#### 分支命名

| 分支类型 | 命名格式 | 示例 |
|----------|----------|------|
| 功能开发 | `feature/<功能描述>` | `feature/stats-dashboard` |
| Bug 修复 | `fix/<问题描述>` | `fix/parser-empty-content` |
| 文档更新 | `docs/<文档名>` | `docs/dev-guide-update` |
| 性能优化 | `perf/<优化点>` | `perf/vector-search` |
| 重构 | `refactor/<模块>` | `refactor/llm-router` |

#### Commit Message 规范

推荐使用 **Conventional Commits** 格式：

```
<type>(<scope>): <中文描述>

<可选的详细说明>
```

**type 类型**：
- `feat`：新功能
- `fix`：Bug 修复
- `docs`：文档更新
- `style`：代码格式（不影响功能）
- `refactor`：重构
- `perf`：性能优化
- `test`：测试相关
- `chore`：构建/工具链相关

**示例**：

```
feat(stats): 新增知识统计接口

- 添加 /api/stats 端点
- 新增 KnowledgeStats 类型定义
- 前端页面集成
```

```
fix(parser): 修复空 frontmatter 解析崩溃问题
```

---

### 8.2 PR 流程

#### 提交 Pull Request

1. Fork 仓库或创建功能分支
2. 完成代码开发与测试
3. 确保所有测试通过：`bun test`
4. 确保 TypeScript 类型检查通过
5. 提交 PR，填写 PR 模板

#### PR 描述模板

```markdown
## 变更类型
- [ ] 新功能 (feat)
- [ ] Bug 修复 (fix)
- [ ] 文档更新 (docs)
- [ ] 性能优化 (perf)
- [ ] 代码重构 (refactor)
- [ ] 其他 (chore)

## 变更内容
简要描述本次变更的内容和目的。

## 关联 Issue
Closes #123

## 测试方式
- [ ] 单元测试已通过
- [ ] 手动测试验证
- [ ] 无需测试（文档/格式等）

## 影响范围
- 后端 / 前端 / 共享类型
- 涉及模块：xxx

## 截图（如适用）
```

#### 代码审查

- 所有 PR 需至少一人审查通过后方可合并
- 审查重点：功能正确性、代码风格、错误处理、性能影响、测试覆盖
- 建议保持 PR 粒度适中，避免超大 PR

---

> 如有其他疑问，请参考项目其他文档或提交 Issue。
