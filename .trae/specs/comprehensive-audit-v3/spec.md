# 项目全面审计 v3 Spec

## Why
在前两轮审计（comprehensive-audit-report、comprehensive-audit-v2）基础上，继续深入审计未覆盖的代码区域：LLM/Agent 系统、QA 对话系统、Evolution 进化系统、检索系统、错误处理机制、以及代码冗余。本轮重点：发现沉默错误、死代码、重复定义、功能空缺。

## What Changes
- 发现新问题/错误 12 项
- 发现未实现功能/控件 8 项
- 发现缺失功能/UI 跳转 4 项
- 发现冗余/死代码 6 项

## Impact
- Affected specs: alethia-v5-build, comprehensive-audit-v2
- Affected code: QAPanelPage, llm/router, retrieval/router, evolution/, agents/, OnboardingPage, GraphFullPage

---

## 审计结果

### 一、问题/错误（12 项）

1. **QAPanelPage 重复定义 Conversation 接口**
   - 第 43-49 行和第 51-57 行定义了完全相同的 `Conversation` 接口，第二个定义会覆盖第一个
   - 位置：[QAPanelPage.tsx](file:///workspace/web/src/routes/QAPanelPage.tsx#L43-L57)

2. **数据库迁移文件命名冲突（持久未修复）**
   - `0002_add_aliases.sql` 和 `0002_schema_fixes.sql` 使用相同序号，迁移顺序不确定
   - 位置：[0002_add_aliases.sql](file:///workspace/server/src/db/migrations/0002_add_aliases.sql) / [0002_schema_fixes.sql](file:///workspace/server/src/db/migrations/0002_schema_fixes.sql)

3. **大量空 catch 块吞没错误（30+ 处）**
   - 服务端：`brainapi/index.ts`（5 处）、`brainapi.ts`（4 处）、`document.ts`（3 处）、`image.ts`（2 处）、`audio.ts`（2 处）等
   - 前端：`NotificationContext.tsx`（4 处）、`OnboardingPage.tsx`（3 处）、`SearchResultPage.tsx`（3 处）等
   - 这些空 catch 块会导致错误被静默吞没，难以调试

4. **LLM Router 无故障转移机制**
   - `route()` 方法在找不到适配器时直接抛错，不会尝试降级到其他可用适配器
   - 如果用户只配置了 1 个 LLM，该 LLM 不可用时整个系统受影响
   - 位置：[llm/router.ts](file:///workspace/server/src/llm/router.ts#L56-L73)

5. **Evolution 系统缺少触发机制**
   - `generateWeeklyReport()`、`runHypergraphEvolution()`、`runCausalDiscovery()` 等函数已实现但未见调度触发
   - 位置：[evolution/weekly.ts](file:///workspace/server/src/evolution/weekly.ts)、[evolution/hypergraph.ts](file:///workspace/server/src/evolution/hypergraph.ts)

6. **项目仅有 1 个测试文件**
   - 仅有 `storage/parser.test.ts`，所有其他模块（LLM、检索、因果推理、API 路由）均无测试覆盖
   - 位置：`/workspace/server/src/storage/parser.test.ts`

7. **检索系统 `executeQuery` 无错误隔离**
   - 向量搜索和全文搜索通过 `Promise.all` 并行执行，若其中一个失败，整个查询都会失败
   - 应使用 `Promise.allSettled` 并降级到成功的结果
   - 位置：[retrieval/router.ts](file:///workspace/server/src/retrieval/router.ts#L88-L91)

8. **OnboardingPage 导入未使用的 Graph 图标**
   - `Graph as GraphIcon` 导入但未在 JSX 中使用
   - 位置：[OnboardingPage.tsx](file:///workspace/web/src/routes/OnboardingPage.tsx#L7)

9. **`executeAdvancedSearch` 查询 `tags` 和 `quality` 列**
   - 高级搜索 SQL 查询 `tags`、`quality`、`cv_score` 列，但这些列可能不在 `pages` 表中（仅 `title` 通过迁移添加）
   - 位置：[retrieval/router.ts](file:///workspace/server/src/retrieval/router.ts#L224-L225)

10. **`graphTraverse` 可能返回重复结果**
    - 对多个 topSlug 调用 `graphTraverse` 后，结果被追加到 `allLinks` 但未去重
    - 位置：[retrieval/router.ts](file:///workspace/server/src/retrieval/router.ts#L126-L128)

11. **Agent 系统缺少超时控制**
    - `generator.ts`、`planner.ts`、`retriever.ts` 等 agent 可能长时间运行而无超时限制
    - 位置：`/workspace/server/src/agents/`

12. **Settings 系统部分配置项无实际效果**
    - `config/schema.ts` 中定义了 `knowledgePerPage`、`maxSearchDepth` 等配置，但可能未在运行时被实际使用
    - 位置：[config/schema.ts](file:///workspace/server/src/config/schema.ts)

---

### 二、未实现功能/控件（8 项）

13. **LLM 对话缺少流式输出（SSE）**
    - QA 面板发送消息后等待完整响应，无逐字流式输出
    - 后端 `POST /api/qa/ask` 不支持 SSE

14. **LLM 适配器缺少速率限制**
    - 10 个 LLM 适配器均无速率限制或请求队列管理

15. **Evolution 周报缺少前端展示**
    - 后端 `generateWeeklyReport()` 已实现，但前端无周报查看页面

16. **检索系统缺少搜索历史**
    - 无搜索历史记录或"最近搜索"功能

17. **Agent 翻译功能缺少前端入口**
    - `agents/translate.ts` 已实现，但前端无翻译功能入口

18. **Settings 页面缺少 LLM 模型分配配置**
    - 后端 `setModelAssignment` 已实现，但 SettingsPage 无模型分配 UI

19. **ObservedFilesPage 缺少文件变更实时通知**
    - 观察文件变更后无实时推送（WebSocket/SSE）

20. **PromptsPage 缺少提示词模板导入/导出**
    - 仅支持在线编辑和保存，无批量导入/导出

---

### 三、缺失功能/UI 跳转（4 项）

21. **QA 对话中缺少"在知识图谱中查看"按钮**
    - 对话引用了实体，但无跳转到认知地图的按钮

22. **ChangelogPage 缺少"查看受影响页面"跳转**
    - 变更日志条目无直接跳转到受影响 Wiki 页面的链接

23. **EvalReportPage 缺少"重新运行评测"按钮**
    - 评测结果页面仅展示，无重新运行评测的入口

24. **Settings 页面缺少 LLM 连接测试按钮**
    - 配置 API Key 后无法测试连接是否成功

---

### 四、冗余/死代码（6 项）

25. **GraphFullPage.tsx 已是死代码**
    - 路由已重定向到 `/cognitive-map`，App.tsx 已移除导入，但文件仍存在于磁盘
    - 位置：[GraphFullPage.tsx](file:///workspace/web/src/routes/GraphFullPage.tsx)（1006 行）

26. **GraphFullPage 的 i18n 翻译键已是死代码**
    - `graphFull.*` 翻译键（zh-CN 21 条 + en 21 条）不再被任何活跃页面使用
    - 位置：`zh-CN.json` 和 `en.json` 中的 `graphFull` 段落

27. **QAPanelPage Conversation 接口重复定义**
    - 同问题 #1，属冗余代码

28. **`clusters`/`communities` 数据库表未使用**
    - 在 `0001_init.sql` 中定义，但无任何代码写入这些表
    - 位置：[0001_init.sql](file:///workspace/server/src/db/migrations/0001_init.sql#L84-L108)

29. **`agents/feedback.ts` 可能未被调用**
    - 反馈收集 agent 可能无实际调用入口

30. **Migration 文件序列不连续**
    - 从 0001 到 0009，但缺少 0006 和 0008 的部分功能（被 0002 重复覆盖）