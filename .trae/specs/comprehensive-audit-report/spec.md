# 项目全面审计报告 Spec

## Why
对 Alethia 项目进行系统性审计，覆盖别名链接、笔记系统、认知地图与知识图谱融合、认知超图与因果原生、聚类、多模态文件摄入处理流程六大模块，发现并统计问题、错误、未实现功能和缺失功能。

## What Changes
- 审计报告文档（本文档），不涉及代码修改
- 统计问题/错误 12 项
- 统计未实现功能/控件 18 项
- 统计缺失功能/UI 跳转 12 项

## Impact
- Affected specs: 全部已有 spec（unified-graph-view, causal-cognitive-map, hypergraph-causal-v52, notes-and-config, audit-cycle-v2 等）
- Affected code: server/src/routes/brainapi.ts, server/src/routes/causal.ts, server/src/storage/parser.ts, web/src/components/CognitiveMap/*, web/src/routes/*, server/src/ingest/pipeline.ts

---

## 审计结果

### 一、别名链接和笔记系统

#### 问题/错误（3 项）

1. **数据库迁移文件命名冲突**
   - `0002_add_aliases.sql` 和 `0002_schema_fixes.sql` 使用相同的序号前缀 `0002`，可能导致迁移顺序不确定。
   - 位置：[0002_add_aliases.sql](file:///workspace/server/src/db/migrations/0002_add_aliases.sql) / [0002_schema_fixes.sql](file:///workspace/server/src/db/migrations/0002_schema_fixes.sql)

2. **pages 表缺少 title 列**
   - `GET /api/pages` 查询 `SELECT slug, title, type, ...`，但 `pages` 表定义中没有 `title` 列（只在 frontmatter 中存在）。这会导致 SQL 查询失败。
   - 位置：[brainapi.ts](file:///workspace/server/src/routes/brainapi.ts#L509)

3. **WikiEntryPage 别名点击未解析**
   - 别名点击 `navigate(/wiki/${encodeURIComponent(alias)})` 直接使用别名作为 URL，但别名可能不是合法的 slug 格式。应调用 `resolveAlias` API 先解析。
   - 位置：[WikiEntryPage.tsx](file:///workspace/web/src/routes/WikiEntryPage.tsx#L386)

#### 未实现功能（3 项）

4. **笔记内链不支持 wikilink 语法**
   - 笔记编辑器没有 `[[wikilink]]` 自动补全和解析

5. **笔记未关联到知识图谱节点**
   - 笔记内容提取后创建了 diff，但笔记本身没有与知识图谱节点建立双向链接

6. **笔记列表无搜索/过滤**
   - `GET /api/notes` 返回所有笔记，无搜索参数

#### 缺失功能（2 项）

7. **笔记无标签/分类系统**
   - 笔记只能按文件夹（inbox/drafts/ready-for-review）分类，无自定义标签

8. **笔记无批量操作（多选删除/移动/导出）**

---

### 二、认知地图与知识图谱融合

#### 问题/错误（3 项）

9. **因果节点 API 路径不一致**
   - 前端 `api.getCausalNode(slug)` 调用 `/causal/nodes/${slug}`（复数），后端定义 `/api/causal/node/:slug`（单数）
   - 位置：[api.ts](file:///workspace/web/src/lib/api.ts#L947) vs [causal.ts](file:///workspace/server/src/routes/causal.ts#L55)

10. **因果证据查询使用原始整数 ID**
    - `getCausalEvidence(edgeId)` 按原始数据库整数 ID 查询，但画布中因果边 ID 已改为 `ce_` 前缀。前端传递 edgeId 时可能传递的是带前缀的 ID。
    - 位置：[CausalCanvas.tsx](file:///workspace/web/src/components/CognitiveMap/CausalCanvas.tsx#L799) 中 `parseInt(edgeId, 10)` 传入的 edgeId 是 `ce_1` 格式，parseInt 会返回 NaN

11. **知识图谱节点 conf 硬编码为 0.5**
    - 来自知识图谱的节点未从 `graphData` 中获取实际的 weight/置信度，全部使用默认值 0.5
    - 位置：[CausalCanvas.tsx](file:///workspace/web/src/components/CognitiveMap/CausalCanvas.tsx#L285)

#### 未实现功能（3 项）

12. **知识图谱页面和认知地图页面之间无直接导航按钮**
    - `/graph` 和 `/cognitive-map` 两个页面互相独立，用户需要手动切换 URL

13. **Wiki 条目页无"在认知地图中查看"按钮**
    - 用户在阅读 Wiki 时无法一键跳转到以当前节点为中心的认知地图

14. **认知地图画布无全屏模式切换**

---

### 三、认知超图与因果原生

#### 问题/错误（2 项）

15. **超图聚类结果未被 UI 完整展示**
    - `evolution/hypergraph.ts` 的 Leiden 聚类结果和 Ghost Hyperedge 检测通过 diff 机制返回，但前端没有专门展示这些 diff 的视图
    - 位置：[hypergraph.ts](file:///workspace/server/src/evolution/hypergraph.ts)

16. **causal_inference_cache 无定期清理机制**
    - 缓存有过期时间（`expires_at`），但无定时任务清理过期条目，可能导致表膨胀
    - 位置：[causal.ts](file:///workspace/server/src/routes/causal.ts#L46-L52)

#### 未实现功能（4 项）

17. **反事实推理无前端 UI**
    - 后端 `POST /api/causal/counterfactual` 已实现，前端 `api.postCausalCounterfactual` 已封装，但 `CausalReasoningPanel` 中没有反事实推理的交互入口

18. **时间脉冲响应无图表展示**
    - 后端 `POST /api/causal/time-pulse` 已实现，前端 `api.postCausalTimePulse` 已封装，但没有折线图/时序图展示脉冲结果

19. **因果模型版本对比无前端展示**
    - 后端 `GET /api/causal/version/compare` 已实现，前端 `api.compareCausalVersions` 已封装，但 `CausalVersionPanel` 中没有版本对比视图

20. **超边无可视化编辑/删除 UI**
    - 超边在画布上渲染为普通边，但无法通过 UI 编辑超边的参数或删除超边

---

### 四、聚类功能

#### 问题/错误（2 项）

21. **clusters/communities 表未被活跃使用**
    - `clusters`、`cluster_members`、`communities`、`community_reports` 表在 `0001_init.sql` 中定义，但代码中未找到写入这些表的逻辑（融合聚类结果通过 API 实时计算返回，不持久化）
    - 位置：[0001_init.sql](file:///workspace/server/src/db/migrations/0001_init.sql#L84-L108)

22. **融合聚类 classifyComponent 字段名不一致**
    - 知识边检查使用 `edge.source_slug || edge.source`，取决于 `links` 表的实际列名。`links` 表定义使用 `source_slug`/`target_slug`，但 `knowledgeEdges` 可能来自不同的查询结果
    - 位置：[causal.ts](file:///workspace/server/src/routes/causal.ts#L1520-L1521)

#### 未实现功能（3 项）

23. **聚类结果无可视化高亮**
    - 融合聚类发现的模块在画布上无视觉区分（无高亮边框、背景色等）

24. **无手动创建/编辑聚类的 UI**
    - 用户无法手动将节点归入聚类或从聚类中移除

25. **聚类无时间线演化展示**
    - 无法查看聚类从创建到现在的变化历史

---

### 五、多模态文件摄入和处理

#### 问题/错误（2 项）

26. **registerLibraryFile 失败后无临时文件清理**
    - `ingest/pipeline.ts` 中 `registerLibraryFile` 失败时直接返回错误，但在此之前可能已创建临时文件或部分写入
    - 位置：[pipeline.ts](file:///workspace/server/src/ingest/pipeline.ts#L123-L142)

27. **文件上传无进度回调**
    - `POST /api/ingest/upload` 处理后端处理，但前端 `UploadPage` 无法获取处理进度（解析 PDF/转录音频等耗时操作无反馈）
    - 位置：[brainapi.ts](file:///workspace/server/src/routes/brainapi.ts#L1131-L1149)

#### 未实现功能（5 项）

28. **文件上传无进度条 UI**
    - `UploadPage` 只有上传按钮，无上传进度显示

29. **无批量文件上传**
    - 一次只能上传一个文件

30. **文件无内联预览**
    - 图片/视频/音频文件上传后无法在浏览器中直接预览，只能通过 API 获取原始内容

31. **文件无标签/分类**
    - `library_files` 表只有 `mime`、`original_name`、`status`，无自定义标签

32. **文件与知识图谱节点无关联可视化**
    - 文件被摄入后提取了证据，但库文件详情页不显示关联的知识图谱节点

---

### 六、UI 页面间跳转缺失

#### 缺失跳转（12 项）

33. **知识图谱全屏页 → 认知地图页**：`GraphFullPage` 无跳转到 `CognitiveMapPage` 的按钮
34. **认知地图页 → 知识图谱全屏页**：`CognitiveMapPage` 无跳转到 `GraphFullPage` 的按钮
35. **Wiki 条目页 → 认知地图（以当前节点为中心）**：`WikiEntryPage` 无"在认知地图中查看"按钮
36. **仪表盘 → 认知地图**：`DashboardPage` 无跳转到认知地图的快捷入口
37. **仪表盘 → 文件上传**：`DashboardPage` 无跳转到上传页面的快捷入口
38. **库文件详情 → 关联 Wiki 页面**：`LibraryFilePage` 无显示关联的 Wiki 页面列表
39. **搜索结果 → 认知地图**：`SearchResultPage` 搜索结果无跳转到认知地图的操作
40. **笔记页 → Wiki 条目**：`NotesPage` 无"转为 Wiki 条目"按钮
41. **别名管理页 → 对应 Wiki 条目**：`AliasesPage` 别名列表无直接跳转到对应 Wiki 页面的链接
42. **变更审查页 → 认知地图**：`DiffReviewPage` 无"在认知地图中查看影响"按钮
43. **通知 → 相关页面**：通知列表无点击跳转到相关页面的功能
44. **时间线 → Wiki 条目**：`TimelineFullPage` 时间线事件无直接跳转到对应 Wiki 条目