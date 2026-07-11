# Tasks · Alethia v5.2 认知超图与因果原生

## 第一阶段：超图数据层（DB + Markdown）

- [x] Task 1: 数据库迁移 0008 — 创建超图相关表
  - 创建 `hyperedges` 表（id, source_slugs TEXT[], target_slugs TEXT[], type VARCHAR, params JSONB, created_at, updated_at）
  - 创建 `causal_hyperedges` 表（id, hyperedge_id FK→hyperedges, lag, weight, conf, evidence_spans TEXT[], created_at, updated_at）
  - 创建 `view_states` 表（id, view_id VARCHAR UNIQUE, user_label VARCHAR, snapshot JSONB, created_at, updated_at）
  - 创建 `causal_inference_cache` 表（id, query_hash VARCHAR UNIQUE, result JSONB, expires_at TIMESTAMPTZ）
  - 索引：source_slugs GIN, target_slugs GIN, type, view_id

- [x] Task 2: Markdown 解析器扩展 — 解析 `## Hyper Relations` 和升级 `## Causal Model`
  - 在 `server/src/storage/parser.ts` 中新增 `## Hyper Relations` 区块识别
  - 解析超边语法：`- H1: [A], [B], [C] --:jointlyCause--> [D] (conf:0.9, evidence:span_12)`
  - 支持操作符：`:jointlyCause`, `:达成决议`, 及自定义 `:relType`
  - 参数解析：`conf`, `evidence`, `context`（自由文本）
  - 升级 `## Causal Model` 解析：支持多源 `[A], [B] --:jointlyCause--> [C]` 超边格式
  - 新增 `ParsedHyperEdge` 接口（id, sourceSlugs, targetSlugs, type, params）
  - 在 `ParsedPage` 接口中添加 `hyperRelations: ParsedHyperEdge[]`

- [x] Task 3: 超图缓存重建 API
  - 升级 `sync.ts` 的 `syncAll`：同步超边到 `hyperedges` + `causal_hyperedges`
  - 将现有 `links` 表的二元关系也作为基数=2 的超边写入 `hyperedges`
  - 将现有 `causal_edges` 的数据迁移到 `causal_hyperedges`（通过 hyperedge_id 关联）
  - `truncateCache` 新增 `TRUNCATE TABLE hyperedges CASCADE` 和 `TRUNCATE TABLE causal_hyperedges CASCADE`
  - 提供 `GET /api/hypergraph` 返回完整超图数据（含 hyperedges + causal_hyperedges + cpts）
  - 提供 `GET /api/hypergraph/subgraph?slugs=a,b,c` 按需返回子图

## 第二阶段：因果推理引擎升级

- [x] Task 4: 超图推理引擎升级
  - 升级 `server/src/causal/reasoner.ts` 支持联合因果推理
  - 实现 `doCalculusOnHypergraph`：在超图上应用后门准则/前门准则/do-calculus 启发式搜索
  - 实现 `jointCausalInference`：多父节点联合干预下的概率计算
  - 扩展 `CausalGraph` 类型：`hyperedges: Array<{ sources: string[], targets: string[], type, weight, conf }>`
  - 保持向后兼容：现有二元因果推理仍可用

- [x] Task 5: queryCausal API
  - 在 `server/src/routes/causal.ts` 新增 `POST /api/causal/query`
  - 接收 `{ question, scopeSlugs?, maxResults? }` 
  - 从问题中提取目标变量和干预意图
  - 在超因果图上搜索候选干预变量（后门/前门/do-calculus 启发式）
  - 有 CPT 时执行概率推理，无 CPT 时基于权重生成定性判断
  - 融合知识图谱最新事实，输出自然语言报告 + 证据脚注 + 置信度
  - 结果缓存到 `causal_inference_cache`（TTL 1 小时）

## 第三阶段：视图管理系统

- [x] Task 6: 视图文件系统与 API
  - 创建 `.brain/views/` 目录结构
  - 实现 `POST /api/views/save`：保存当前视图为 JSON 文件
  - 实现 `GET /api/views/list`：列出所有已保存视图
  - 实现 `GET /api/views/:id`：加载指定视图
  - 实现 `DELETE /api/views/:id`：删除视图
  - 实现 `POST /api/views/suggest`：基于超图聚类主动建议打包/展开
  - 视图 JSON 格式：`{ viewId, hyperNodes, filters, layout, zoomPan }`

- [x] Task 7: 视图固化功能
  - 在 `server/src/routes/causal.ts` 新增 `POST /api/views/solidify`
  - 接收 `{ viewId, hyperNodeId }`，将超节点转换为 `## Hyper Relations` 条目的 Diff
  - 生成 🟡 预览区 Diff，包含推荐理由和证据强度
  - 用户确认后写入对应实体页面的 Markdown
  - 前端右键菜单添加"保存为知识超边"选项

## 第四阶段：IntentResolver 与离线智能

- [x] Task 8: IntentResolver 接口与远程实现
  - 创建 `server/src/causal/intent.ts`
  - 定义 `IntentResolver` 接口：`resolve(text, viewState) → Operation[]`
  - 实现 `RemoteLLMResolver`：调用远程 LLM（Sonnet/Haiku）解析意图
  - 操作指令集：pack, expand, peek, filterEdges, groupBy, queryCausal
  - 升级 `POST /api/causal/nl-command` 使用 IntentResolver

- [x] Task 9: 离线意图解析（Ollama + ONNX 回退）
  - 实现 `OllamaResolver`：连接本地 Ollama 实例进行意图分类
  - 实现 `TemplateResolver`：基于关键词匹配的模板意图解析（无需模型）
  - 实现 `IntentResolverChain`：按优先级链式尝试（RemoteLLM → Ollama → Template）
  - 配置项：`INTENT_RESOLVER_MODE`（remote/local/hybrid）

- [x] Task 10: 静态站点因果推理
  - 创建 `server/src/causal/infernet.ts`：轻量级贝叶斯推理库（纯 TypeScript，无外部依赖）
  - 实现 `compileCausalGraph()`：将超因果图编译为 `causal_graph.json`
  - 在 `generateStaticSite` 中嵌入 `causal_graph.json` 和 `infernet.js`
  - 实体页模板：含 `## Causal CPT` 的页面渲染交互式下拉控件
  - 控件：选择父变量状态 → 即时显示概率变化（纯前端计算）

## 第五阶段：前端组件升级

- [x] Task 11: 超边可视化渲染
  - 创建 `web/src/components/CognitiveMap/HyperEdgeRenderer.tsx`
  - 在 Cytoscape.js 中注册自定义超边类型：半透明多边形线束或弧形连接
  - 多源节点 → 单目标节点：绘制从各源节点汇聚到目标节点的线束
  - 单源节点 → 多目标节点：绘制从源节点发散到各目标节点的线束
  - 颜色：`:jointlyCause` 紫色，`:达成决议` 青色，自定义类型按色相环分配
  - 升级 `CausalCanvas.tsx` 使用超边渲染

- [x] Task 12: 视图管理器
  - 创建 `web/src/components/CognitiveMap/ViewManager.tsx`
  - 侧边栏面板：显示已保存视图列表（名称、时间、节点数）
  - 操作：加载视图、删除视图、分享视图（复制 JSON）
  - "保存当前视图"按钮，弹出命名输入框
  - 在 `CausalCanvas.tsx` 中集成（工具栏按钮）

- [x] Task 13: AI 指令栏
  - 创建 `web/src/components/CognitiveMap/IntentBar.tsx`
  - 在共生问答面板旁增加"操控视图"输入框
  - 实时解析意图：输入文本 → 调用 `POST /api/causal/nl-command`
  - 支持的操作反馈：打包/展开/透视/过滤/聚合/因果查询
  - 操作结果以 toast 通知 + 画布动画反馈
  - 集成到 `CognitiveMapPage.tsx`

- [x] Task 14: 离线 CPT 交互控件
  - 创建 `web/src/components/CausalCPTWidget.tsx`
  - 渲染 CPT 表格为交互式下拉控件
  - 用户选择父变量状态 → 即时计算并显示子变量各状态的概率分布
  - 柱状图可视化概率分布
  - 用于静态站点导出和在线实体页面

## 第六阶段：夜间任务升级

- [x] Task 15: 超图聚类夜间任务
  - 升级 `server/src/evolution/` 中的 `community_detect` 阶段
  - 实现 Leiden 算法适配超图（基于超边权重和类型）
  - 聚类结果生成 🟡 预览区建议："发现紧密超边簇，建议打包为一组"
  - 升级 `ghost_relations` 为 `ghost_hyperedges`：检测引用了不存在的 slug 的超边

- [x] Task 16: 因果发现与 CPT 更新
  - 创建 `server/src/causal/discovery.ts`
  - 实现频繁子图挖掘：在超图中查找频繁出现的因果模式
  - 实现简化版 PC 算法：对数值型属性时间序列进行因果结构学习
  - 发现结果生成 🟡 预览区 Diff："发现潜在因果超边，建议审查"
  - 实现 `cpt_update`：从 `observed_files` 和 `timeline_entries` 提取新事件，微调 CPT 参数
  - CPT 更新生成 Diff 建议，附带统计指标

# Task Dependencies
- Task 2 依赖 Task 1（数据库表）
- Task 3 依赖 Task 2（解析器）
- Task 4 依赖 Task 3（超图数据）
- Task 5 依赖 Task 4（推理引擎）
- Task 6 依赖 Task 3（超图数据）
- Task 7 依赖 Task 6（视图 API）
- Task 8 依赖 Task 3（超图数据）
- Task 9 依赖 Task 8（IntentResolver 接口）
- Task 10 依赖 Task 4（推理引擎）
- Task 11 依赖 Task 3（超图数据）
- Task 12 依赖 Task 6（视图 API）
- Task 13 依赖 Task 8（IntentResolver）
- Task 14 依赖 Task 10（infernet）
- Task 15 依赖 Task 3（超图数据）
- Task 16 依赖 Task 4（推理引擎）和 Task 3（超图数据）