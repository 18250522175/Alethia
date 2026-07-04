# Alethia AI 知识库 v5.0 技术文档生成计划

## 一、项目调研结论

**项目名称**：Alethia AI 知识库 v5.0（认知共生版）
**核心定位**：全智能驱动、AI 原生、人机双读、人类掌权、自我进化的全能个人知识库与认知伙伴

### 已实现的核心模块

| 层级 | 模块 | 状态 | 关键文件 |
|------|------|------|----------|
| L0 用户交互层 | Web 前端（15 页面） | ✅ 完成 | `web/src/routes/` |
| L0.5 统一服务层 | BrainAPI（26 端点） | ✅ 完成 | `server/src/brainapi/index.ts` |
| L1 Agent 编排 | Planner/Retriever/Grader/Generator/Reflector | ✅ 完成 | `server/src/agents/` |
| L1 Agent 扩展 | 压缩/观察/反馈/翻译 | ✅ 完成 | `server/src/agents/compression.ts` 等 |
| L2 混合检索 | 向量/全文/RRF/图谱/意图路由 | ✅ 完成 | `server/src/retrieval/` |
| L2 检索增强 | 重排序/NER/NLI | ✅ 完成 | `rerank.ts` / `entity.ts` / `nli.ts` |
| L3 知识模型 | Compiled Truth Markdown | ✅ 完成 | `server/src/storage/parser.ts` |
| L4 自进化引擎 | Dream Cycle + 预算 + 归档 + 幽灵清理 | ✅ 完成 | `server/src/evolution/` |
| L4.5 影子评估 | 基准测试 + 异常熔断 | ✅ 完成 | `server/src/evolution/shadow.ts` |
| L5 存储层 | Markdown 文件系统 + PostgreSQL | ✅ 完成 | `server/src/storage/` |
| L6 多模态摄入 | 文档/图片/音频/视频/网页/文本 | ✅ 完成 | `server/src/ingest/` |
| L7 可视化 | Cytoscape 图谱 + Chart.js | ✅ 完成 | `web/src/routes/GraphFullPage.tsx` |

### 技术栈概览

- **后端**：Bun 1.2 + Hono 4.6 + pg + Kysely + Zod + Pino
- **前端**：React 18 + Vite 5 + Tailwind CSS + TanStack Query v5 + React Router v6
- **数据库**：PostgreSQL 16 + pgvector + pg_trgm
- **LLM**：10 家国产大模型（百炼/智谱/月之暗面/文心/星火/混元/MiniMax/DeepSeek/零一万物/百川）
- **CLI & MCP**：`brain` CLI 9 命令 + MCP Server 36 工具

---

## 二、要生成的技术文档清单

计划生成以下 5 份技术文档，放置于 `docs/` 目录：

### 文档 1：`docs/ARCHITECTURE.md` — 系统架构总览
- 架构分层图（L0-L7）
- 核心设计原则（认知共生、全汉化、长期可维护、人类掌权）
- 数据流向图（用户提问 → 回答生成 → 知识反哺）
- 模块依赖关系图
- 关键设计决策摘要

### 文档 2：`docs/API_REFERENCE.md` — API 接口参考
- 完整的 26 个 REST API 端点清单
- 每个端点：方法、路径、请求参数、响应格式、错误码
- 鉴权方式（Bearer Token）
- 前端 API 客户端使用示例

### 文档 3：`docs/KNOWLEDGE_MODEL.md` — 知识模型与存储规范
- Compiled Truth Markdown 格式规范（8 个标准区块详解）
- 数据库表结构概览（24 张表）
- 版本控制与归档策略
- 集群（clusters）与语义环（semantic_rings）模型
- 证据链（evidence_spans）规范

### 文档 4：`docs/DEV_GUIDE.md` — 开发指南
- 环境搭建步骤（本地开发 / Docker 部署）
- 项目结构详解（monorepo 布局）
- 常用脚本命令（dev/build/test/migrate/seed）
- 代码风格与约定
- 调试技巧

### 文档 5：`docs/AI_PIPELINE.md` — AI 流水线详解
- L1 Agent 五阶段编排流程（Planner→Retriever→Grader→Generator→Reflector）
- L2 混合检索策略（向量+全文+RRF+图谱+意图路由）
- Dream Cycle 六阶段详解
- 分级 Diff 审核机制（🟢🟡🔴）
- 影子评估与熔断机制
- 预算控制策略

---

## 三、实施步骤

1. **创建 docs/ 目录**（如不存在）
2. **生成 ARCHITECTURE.md** — 系统架构总览
3. **生成 API_REFERENCE.md** — 接口参考（通过扫描路由文件自动提取）
4. **生成 KNOWLEDGE_MODEL.md** — 知识模型规范
5. **生成 DEV_GUIDE.md** — 开发指南
6. **生成 AI_PIPELINE.md** — AI 流水线详解
7. **更新 README.md** — 在 README 中添加技术文档导航链接

---

## 四、依赖与注意事项

- **数据来源**：所有文档内容基于现有代码库自动提取和总结，不凭空捏造
- **代码引用**：文档中将使用文件链接（`file://`）指向具体的实现文件，便于追溯
- **中文输出**：全部技术文档使用中文编写，与项目全汉化策略一致
- **保持同步**：文档是对现有实现的总结与梳理，不引入新功能

---

## 五、风险处理

| 风险 | 处理方式 |
|------|----------|
| 某些模块细节未完全实现 | 在文档中明确标注"部分实现"或"预留接口" |
| 接口字段与实际代码有偏差 | 以实际代码为准，扫描路由文件和 BrainAPI 方法自动提取 |
| 文档数量过多难以一次性完成 | 按优先级依次生成，核心文档优先 |
