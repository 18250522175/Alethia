# 08_DEV_GUIDE.md 开发指南文档生成计划

## 文档目标
生成一份完整的 Alethia AI 知识库项目开发指南，基于真实项目结构，全部中文。

## 生成日期
2026-07-04

## 文档结构与内容规划

### 1. 标题 + 生成日期
- 文档标题：Alethia 开发指南
- 版本：v5.0
- 生成日期：2026-07-04

### 2. 项目结构详解
- **Monorepo 布局**：基于 Bun workspaces 的三模块架构（shared / server / web）
- **后端目录结构**：server/src 下各模块详解（agents, auth, brainapi, cli, config, db, evolution, i18n, ingest, llm, mcp, retrieval, routes, storage）
- **前端目录结构**：web/src 下各模块详解（blocks, components, contexts, i18n, layouts, lib, routes, store）
- **共享类型模块**：shared/types 下的类型定义（ask, diff, entities, evidence, evolution, health, llm, query, settings）

### 3. 开发环境搭建
- **前置要求**：Bun 1.2+、PostgreSQL 16 + pgvector、Node.js 环境
- **安装步骤**：克隆仓库、安装依赖、配置环境变量（基于 .env.example）
- **数据库迁移**：使用 bun run db:migrate 执行迁移脚本（0001_init.sql）
- **启动开发服务器**：同时启动后端（bun run dev:server）和前端（bun run dev:web）

### 4. 常用命令
- **根目录脚本**：dev:server, dev:web, build, db:migrate, seed, brain
- **server 脚本**：dev, start, build, db:migrate, seed, brain
- **web 脚本**：dev, build, preview
- **bun 常用命令**：bun install, bun run, bun test, bun add 等

### 5. 代码风格与约定
- **TypeScript 严格模式**：基于 tsconfig.base.json 的 strict 配置
- **全汉化原则**：错误信息全汉化（errors.zh-CN.ts）、日志中文、界面中文优先
- **文件命名**：kebab-case 文件名、PascalCase 组件名
- **错误处理**：统一错误码机制、HTTPException 处理、ApiErrorClass 前端封装
- **日志规范**：pino 日志库、logger 实例使用、结构化日志格式

### 6. 新增功能指南
- **新增 API 端点步骤**：在 routes/ 下创建路由、使用 Hono 框架、注册到 index.ts、类型定义放 shared
- **新增前端页面步骤**：在 routes/ 下创建页面组件、配置路由、使用 TanStack Query 调用 API
- **新增 LLM 适配器步骤**：继承 BaseLLMAdapter 或 BaseOpenAICompatibleAdapter、在 llm/adapters/ 下创建文件、注册到 router
- **新增 Agent 扩展步骤**：在 agents/ 下创建 agent 文件、遵循现有 agent 模式

### 7. 调试技巧
- **后端调试**：Bun inspector（--inspect）、日志调试（pino）、环境变量配置
- **前端调试**：React DevTools、TanStack Query DevTools、浏览器开发者工具
- **数据库调试**：psql 连接、常用查询语句、vector 操作
- **LLM 调试**：适配器 probe 接口、日志追踪、成本估算验证

### 8. 测试指南
- **Bun test 框架**：使用 bun:test、describe/it/expect 语法
- **现有测试用例**：parser.test.ts 示例（CompiledTruthParser 测试）
- **编写规范**：测试文件命名（*.test.ts）、中文描述、mock 数据使用

### 9. 贡献指南
- **代码提交规范**：Commit message 规范、分支命名
- **PR 流程**：Fork 工作流、代码审查、CI 检查

## 信息来源
- /workspace/package.json - 根目录配置
- /workspace/server/package.json - 后端依赖
- /workspace/web/package.json - 前端依赖
- /workspace/shared/package.json - 共享模块配置
- /workspace/tsconfig.base.json - TypeScript 基础配置
- /workspace/server/tsconfig.json - 后端 TS 配置
- /workspace/web/tsconfig.json - 前端 TS 配置
- /workspace/server/src/storage/parser.test.ts - 测试示例
- /workspace/server/src/index.ts - 后端入口
- /workspace/server/src/llm/adapter.ts - LLM 适配器基类
- /workspace/server/src/i18n/errors.zh-CN.ts - 错误信息
- /workspace/web/src/lib/api.ts - 前端 API 封装
- /workspace/docker-compose.yml - Docker 编排
- /workspace/.env.example - 环境变量示例
- /workspace/server/src/db/migrations/0001_init.sql - 数据库迁移
- 目录结构探索结果

## 输出文件
/workspace/docs/08_DEV_GUIDE.md
