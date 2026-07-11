# Alethia v5.2 架构升级：认知超图与因果原生 Spec

## Overview
- **Summary**: 将 Alethia 知识管理系统的底层抽象从"二元关系图"升级为"超图"，以超边统一表达实体、关系、因果链、笔记事件、用户视图打包。在 Markdown 自包含真相源之上，叠加超图解析、因果推理、自由嵌套与 AI 自然操控。
- **Purpose**: 统一知识表示（消除二元边 vs 因果边的分裂），增强因果推理能力（联合因果、超边权重），提升视图灵活性与离线可传世性。
- **Target Users**: 知识库管理员、分析师、决策者、企业战略用户
- **Version**: v0.5 → v0.5.2（架构升级，非破坏性）

## Why
当前 v0.5 的因果认知地图系统存在两个根本性分裂：
1. **知识边 vs 因果边** — 二元 `links` 表与 `causal_edges` 表各自独立，无法表达"多个因素联合导致一个结果"的联合因果，也无法在统一图算法中同时考虑知识关系和因果链。
2. **视图状态游离** — 打包/展开等视图操作与知识模型无映射关系，无法将临时聚合固化为持久知识，也无法在离线导出中保留视图上下文。

v5.2 以超图作为统一抽象解决上述问题：所有关系（知识、因果、高阶）都是超边；视图打包本质上是超边上的临时聚合；Markdown 新增 `## Hyper Relations` 语法块承载高阶事实。

## What Changes

### 一、统一超图知识表示
- **新增** `## Hyper Relations` Markdown 区块语法，支持多源→多目标的高阶事实边
- **升级** `## Causal Model` 语法，支持 `:jointlyCause` 联合因果超边
- **新增** 数据库表：`hyperedges`、`causal_hyperedges`、`view_states`、`causal_inference_cache`
- **修改** 现有 `links` 和 `causal_edges` 数据在底层也以超边形式存储，保证图算法统一
- **修改** `rebuild-struct` 扫描所有实体页，重建超图和因果网络

### 二、自由嵌套与视图管理（以超图为基）
- **新增** `.brain/views/` 目录，视图以 JSON 文件存储，记录超节点变换
- **新增** 视图保存/加载/删除/分享 API 与前端面板
- **修改** 打包/展开操作映射为超图上的超节点变换，不再是纯前端临时状态
- **新增** 视图固化为知识超边（临时聚合 → 永久知识）

### 三、因果推理引擎升级
- **新增** `queryCausal` API 接口，支持超图上的后门准则/前门准则/do-calculus 启发式搜索
- **升级** 推理引擎支持联合因果（多父节点→子节点概率推理）
- **新增** 因果发现夜间任务（频繁子图挖掘 + PC 算法简化版）
- **新增** 增量 CPT 学习（从 observed_files 事件自动更新 CPT 参数）
- **新增** 反例学习与护栏增强

### 四、AI 自然操控与离线智能
- **新增** `IntentResolver` 接口，支持 LLM 远端 + Ollama 本地 + ONNX 嵌入式三种实现
- **新增** 操作指令集：pack/expand/peek/filterEdges/groupBy/queryCausal
- **新增** 静态站点导出时嵌入因果推理库（infernet-js）和编译后的 causal_graph.json
- **新增** 静态实体页的交互式 CPT 控件

### 五、夜间任务升级
- **升级** `community_detect` → 超图聚类（Leiden 算法适配超图）
- **新增** `causal_discovery` 阶段：频繁子图挖掘 + 潜在因果对检测
- **新增** `cpt_update`：根据新 Timeline 事件微调 CPT
- **升级** `ghost_relations` → `ghost_hyperedges`

### 六、前端组件升级
- **新增** 超边渲染（Cytoscape.js 自定义边类型，半透明多边形线束）
- **升级** 打包节点为带折叠图标的圆角矩形
- **新增** 视图管理器侧边栏
- **新增** AI 指令栏（在共生问答面板旁）
- **新增** 离线版 CPT 交互控件

## Impact
- Affected specs: `causal-cognitive-map`（升级，非替代）
- 新增数据库迁移：`0008`（hyperedges, causal_hyperedges, view_states, causal_inference_cache）
- 修改文件：`parser.ts`（新增 Hyper Relations 解析）、`sync.ts`（升级 rebuild）、`causal.ts`（升级 API）
- 新增文件：`server/src/causal/discovery.ts`、`server/src/causal/intent.ts`、`server/src/causal/infernet.ts`
- 新增前端组件：`HyperEdgeRenderer.tsx`、`ViewManager.tsx`、`IntentBar.tsx`
- 新增目录：`.brain/views/`、`.brain/causal/`

## ADDED Requirements

### Requirement: 超图 Markdown 语法
系统 SHALL 解析实体页面中 `## Hyper Relations` 区块，提取高阶事实超边存入 `hyperedges` 表。

#### Scenario: 解析联合因果超边
- **WHEN** `rebuild-struct` 扫描到 `## Hyper Relations` 含 `- H1: [A], [B] --:jointlyCause--> [C] (conf:0.9)`
- **THEN** 超边 `H1` 解析为 `{ sources: [A, B], targets: [C], type: "jointlyCause", params: { conf: 0.9 } }` 存入缓存

### Requirement: 因果超边（联合因果）
系统 SHALL 在 `## Causal Model` 中支持 `:jointlyCause` 操作符，表达多个因素联合导致一个结果。

#### Scenario: 联合因果推理
- **WHEN** 超边 `[资金充足], [团队经验] --:jointlyCause--> [项目成功率]` 存在 CPT
- **THEN** 推理引擎计算 P(项目成功率=高 | do(资金充足=高, 团队经验=高))，输出联合条件下的概率

### Requirement: 视图即超图变换
系统 SHALL 将用户的打包/展开/透视操作记录为超图上的超节点变换，存储为 JSON 视图文件。

#### Scenario: 保存视图
- **WHEN** 用户点击"保存视图"，命名"利润驱动因素"
- **THEN** 系统生成 `.brain/views/profit-drivers.json`，包含当前超节点结构、过滤条件、布局状态

### Requirement: 视图固化
系统 SHALL 支持将临时聚合固化为永久知识超边，通过 Diff 审核写入 Markdown。

#### Scenario: 固化聚合
- **WHEN** 用户右键超节点选择"保存为知识超边"
- **THEN** 系统生成 🟡 预览区 Diff，建议在相关实体页添加 `## Hyper Relations` 条目

### Requirement: IntentResolver 接口
系统 SHALL 提供可替换的意图解析器，默认使用远程 LLM，支持离线 Ollama 和 ONNX 嵌入式回退。

#### Scenario: 离线意图解析
- **WHEN** 远程 LLM 不可用且配置了 Ollama 本地模型
- **THEN** IntentResolver 自动回退到 Ollama，执行意图分类和槽位提取

### Requirement: 静态站点因果推理
系统 SHALL 在静态站点导出时编译因果模型为 `causal_graph.json`，嵌入轻量贝叶斯推理库。

#### Scenario: 静态页面交互式 CPT
- **WHEN** 用户打开静态站点中的实体页面
- **THEN** 含 `## Causal CPT` 的页面显示交互控件（下拉选择父变量状态），即时显示概率变化

### Requirement: 超图聚类夜间任务
系统 SHALL 在夜间 Dream Cycle 中运行超图聚类（Leiden 算法适配），生成 🟡 预览区建议。

### Requirement: 因果发现夜间任务
系统 SHALL 在夜间运行频繁子图挖掘和潜在因果对检测，发现的候选因果超边以 🟡 Diff 提交审核。

### Requirement: 增量 CPT 学习
系统 SHALL 当 observed_files 中积累新事件时，自动进行贝叶斯参数更新，生成 Diff 建议修订 CPT。

## MODIFIED Requirements

### Requirement: 因果推理引擎（升级）
系统 SHALL 在原有二元因果推理基础上，支持超图上的后门准则/前门准则/do-calculus 启发式搜索，以及联合因果（多父节点→子节点）的概率推理。

### Requirement: 视图-真相解耦（升级）
系统 SHALL 将视图状态从纯前端临时缓存升级为 JSON 视图文件（`.brain/views/`），支持保存、加载、删除、分享，并可将临时聚合固化为 Markdown 知识超边。

### Requirement: 数据库表（升级）
系统 SHALL 将现有 `causal_edges` 和 `causal_cpt` 表升级为 `hyperedges` + `causal_hyperedges` + `causal_cpt` 三表结构，现有二元边在底层也存储为基数=2的超边，保证图算法统一。