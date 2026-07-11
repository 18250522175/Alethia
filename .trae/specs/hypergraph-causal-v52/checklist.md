# Checklist · Alethia v5.2 认知超图与因果原生

## 超图数据层

- [x] `hyperedges` 表已创建，包含 source_slugs TEXT[], target_slugs TEXT[], type, params JSONB
- [x] `causal_hyperedges` 表已创建，关联 hyperedge_id，含 lag, weight, conf, evidence_spans
- [x] `view_states` 表已创建，支持视图快照存储
- [x] `causal_inference_cache` 表已创建，支持查询结果缓存
- [x] GIN 索引已创建在 source_slugs 和 target_slugs 上

## 超图 Markdown 解析

- [x] Markdown 解析器识别 `## Hyper Relations` 区块
- [x] 超边语法正确解析：`- H1: [A], [B] --:jointlyCause--> [C] (conf:0.9, evidence:span_12)`
- [x] 支持 `:jointlyCause`、`:达成决议` 及自定义 `:relType` 操作符
- [x] 参数 `conf`、`evidence`、`context` 正确解析
- [x] 升级 `## Causal Model` 支持多源超边：`[A], [B] --:jointlyCause--> [C]`
- [x] `ParsedHyperEdge` 接口正确定义并在 `ParsedPage` 中可用

## 超图缓存重建

- [x] `rebuild-struct` 重建超图缓存（hyperedges + causal_hyperedges）
- [x] 现有 `links` 表二元关系也写入 `hyperedges`（基数=2）
- [x] 现有 `causal_edges` 数据迁移到 `causal_hyperedges`
- [x] `truncateCache` 清空 hyperedges 和 causal_hyperedges
- [x] `GET /api/hypergraph` 返回完整超图数据
- [x] `GET /api/hypergraph/subgraph?slugs=a,b,c` 按需返回子图

## 因果推理引擎升级

- [x] 推理引擎支持联合因果推理（多父节点→子节点）
- [x] `doCalculusOnHypergraph` 在后门/前门/do-calculus 启发式搜索后正确计算
- [x] `jointCausalInference` 多父节点联合干预概率计算正确
- [x] `POST /api/causal/query` 接口可用
- [x] 查询结果缓存到 `causal_inference_cache`（TTL 1小时）
- [x] 无 CPT 时生成定性判断并标记置信度

## 视图管理系统

- [x] `.brain/views/` 目录存在（代码自动创建）
- [x] `POST /api/views/save` 保存视图 JSON 文件
- [x] `GET /api/views/list` 列出所有视图
- [x] `GET /api/views/:id` 加载指定视图
- [x] `DELETE /api/views/:id` 删除视图
- [x] `POST /api/views/suggest` 基于超图聚类建议打包
- [x] 视图 JSON 格式符合 spec（viewId, hyperNodes, filters, layout, zoomPan）
- [x] 视图固化为知识超边（临时聚合 → 🟡 Diff → Markdown `## Hyper Relations`）
- [x] 前端右键菜单包含"保存为知识超边"选项

## IntentResolver 与离线智能

- [x] `IntentResolver` 接口定义（resolve → Operation[]）
- [x] `RemoteLLMResolver` 实现（远程 LLM 解析意图）
- [x] `OllamaResolver` 实现（本地 Ollama 回退）
- [x] `TemplateResolver` 实现（关键词模板回退，无需模型）
- [x] `IntentResolverChain` 按优先级链式回退
- [x] 配置项 `INTENT_RESOLVER_MODE` 可用
- [x] 操作指令集：pack, expand, peek, filterEdges, groupBy, queryCausal

## 静态站点因果推理

- [x] `infernet.ts` 轻量级贝叶斯推理库实现（纯 TypeScript，无外部依赖）
- [x] `compileCausalGraph()` 编译超因果图为 `causal_graph.json`
- [x] `generateStaticSite` 嵌入 `causal_graph.json` 和 `infernet.js`
- [x] 实体页模板渲染交互式 CPT 下拉控件
- [x] 选择父变量状态后即时显示概率变化（纯前端计算）

## 前端组件升级

- [x] 超边可视化：半透明多边形线束或弧形连接（Bezier 弧形边）
- [x] `:jointlyCause` 边渲染为紫色
- [x] 多源→单目标 和 单源→多目标的线束正确绘制（分解为独立边）
- [x] 视图管理器侧边栏面板可用
- [x] 视图加载/删除/分享操作正常
- [x] AI 指令栏在共生问答面板旁可用
- [x] 指令栏实时解析意图并执行画布操作
- [x] 离线 CPT 交互控件渲染 CPT 表格为下拉 + 柱状图

## 夜间任务升级

- [x] 超图聚类（Leiden 算法适配）运行并生成 🟡 Diff
- [x] `ghost_hyperedges` 检测引用不存在 slug 的超边
- [x] 频繁子图挖掘发现因果模式
- [x] 简化版 PC 算法对数值型属性进行因果结构学习
- [x] `cpt_update` 从 observed_files 和 timeline 微调 CPT 参数
- [x] CPT 更新生成 Diff 建议，附带统计指标

## 安全与护栏

- [x] 所有自动写入（超边、CPT 更新）进入 Diff 审核，遵循 🟢🟡🔴 分级
- [x] 超边及 CPT 写入 Markdown 后被纳入 auto_change_log
- [x] AI 推断的因果边必须携带 evidence span，否则 conf 自动降为 0.5（默认值即 0.5）
- [x] 概率推理结果显示 95% 置信区间
- [x] 人类审核后写入的因果超边 conf 自动设为 1.0 或用户指定值
- [x] 视图文件可通过删除对应 JSON 一键回滚