# Tasks · 因果认知地图融合引擎

## 第一阶段：因果 Markdown 语法与数据层（L1-L3 基础）

- [x] Task 1: 数据库迁移 — 创建因果相关表
  - 创建 `causal_edges` 表（source, target, relation, lag, weight, conf, evidence, updated_at）
  - 创建 `causal_cpt` 表（variable_slug, conditions JSONB, probabilities JSONB）
  - 创建 `causal_versions` 表（version_id, snapshot JSONB, comment, created_at）
  - 创建 `causal_alerts` 表（edge_id, threshold JSONB, enabled, last_triggered_at）

- [x] Task 2: Markdown 解析器扩展 — 解析 `## Causal Model`
  - 在 `server/src/storage/parser.ts` 中扩展，识别 `## Causal Model` 区块
  - 解析因果声明行：`[source] --:rel--> [target] (params)`
  - 解析 `## Causal CPT` 表格

- [x] Task 3: 因果缓存重建 API
  - `rebuild-struct` 扫描所有实体页面，重建 `causal_edges` 和 `causal_cpt` 缓存
  - 提供 `GET /api/causal/graph` 返回完整因果图数据
  - 提供 `GET /api/causal/node/:slug` 返回单个节点的因果上下文

## 第二阶段：因果认知地图可视化（前端视图层）

- [x] Task 4: 因果认知地图画布组件
  - 创建 `web/src/components/CognitiveMap/` 目录
  - 实现 `CausalCanvas.tsx`（基于 Cytoscape.js 或 G6）
  - 支持节点拖拽、因果边渲染、节点颜色映射（根据 KPI 状态）
  - 支持节点与知识图谱实体双向绑定

- [x] Task 5: 自由嵌套功能
  - 实现打包/解包：`VirtualNode.tsx`、右键菜单
  - 实现透视模式：鼠标悬停浮现内部结构
  - 实现多分支展开：独立缩放和布局的子图
  - 视图状态管理（IndexedDB 存储）

- [x] Task 6: 因果认知地图页面路由
  - 创建 `web/src/routes/CognitiveMapPage.tsx`
  - 在 App.tsx 添加 `/cognitive-map` 路由
  - 侧边栏添加入口（Brain 图标）

## 第三阶段：AI 自然语言操控（交互层）

- [x] Task 7: 自然语言图操作 API
  - 实现 `POST /api/causal/nl-command` 接口
  - LLM 解析指令 → 图操作序列（选择/打包/展开/过滤/透视）
  - 前端集成自然语言输入框

- [x] Task 8: AI 智能建议系统
  - 后端实现社区检测、路径分析算法
  - 实现 `GET /api/causal/suggestions` 接口
  - 前端展示建议卡片（可一键执行）

## 第四阶段：因果推理引擎（推理层）

- [x] Task 9: 贝叶斯网络推理引擎
  - 创建 `server/src/causal/reasoner.ts`
  - 实现变量消元/吉布斯采样算法
  - 实现 P(目标 | do(干预)) 计算
  - 实现时间脉冲响应模拟

- [x] Task 10: 反事实推理与回溯推演
  - 实现历史数据反事实推断
  - 实现因果脉冲响应模拟（前端甘特图/流图展示）
  - 实现关键事件注入与连锁影响预测

- [x] Task 11: 因果问答集成
  - 在共生问答面板路由"如果…会怎样"问题到 causal_reasoner
  - 生成带概率说明和证据脚注的答案

## 第五阶段：证据链、护栏与版本化

- [x] Task 12: 因果证据链系统
  - 因果边关联 evidence span
  - 悬停展示原文双语引用
  - 推理报告附带置信区间和假设前提卡片

- [x] Task 13: 因果模型版本化
  - 实现版本提交、分支、切换
  - 实现分歧对比视图
  - 前端侧边栏版本树可视化

- [x] Task 14: 实时预警系统
  - 因果边阈值条件设置
  - 父节点状态变化推送通知
  - 预测连锁影响展示

# Task Dependencies
- Task 2 依赖 Task 1（数据表）
- Task 3 依赖 Task 2（解析器）
- Task 4 依赖 Task 3（API 数据）
- Task 5 依赖 Task 4（画布基础）
- Task 6 依赖 Task 4（画布 + 路由）
- Task 7 依赖 Task 4（画布可操作）
- Task 8 依赖 Task 3（图数据）
- Task 9 依赖 Task 1（数据表）和 Task 3（图数据）
- Task 10 依赖 Task 9（推理引擎）
- Task 11 依赖 Task 9（推理引擎）
- Task 12 依赖 Task 3（因果数据）
- Task 13 依赖 Task 3（因果数据）
- Task 14 依赖 Task 3（因果数据）和 Task 9（推理引擎）