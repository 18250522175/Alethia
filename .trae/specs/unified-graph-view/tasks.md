# Tasks · 知识图谱与认知地图融合视图

## 第一阶段：数据融合与渲染

- [x] Task 1: 融合数据获取
  - 在 `CausalCanvas.tsx` 中新增 `useQuery` 调用 `api.getGraphData()` 获取知识图谱数据
  - 将知识图谱的 nodes 和 edges 与认知地图的 nodes 和 edges 合并去重
  - 节点去重：以 `slug` 为键，知识图谱节点和认知地图节点合并（优先保留知识图谱节点的 label/title）
  - 边 ID 前缀区分：知识边 `kg_{id}`，因果边 `ce_{id}`，超边 `he_{id}`

- [x] Task 2: 知识图谱边视觉样式
  - 在 Cytoscape 样式表中新增知识图谱边的样式
  - 默认样式：蓝色虚线（`#3b82f6`），线宽 1.5，透明度 0.6
  - 边标签显示 `relation` 字段（如 `relatesTo`、`dependsOn`、`contains` 等）
  - 添加 `data(type) = 'knowledge'` 标记到所有知识图谱边上
  - 更新图例：新增"知识图谱边"条目

- [x] Task 3: 融合节点渲染
  - 确保来自知识图谱的节点和来自认知地图的节点在同一画布上正确显示
  - 知识图谱节点使用默认样式（蓝色调），认知地图节点保持现有样式（绿/橙/灰基于 conf）
  - 融合后节点同时显示在两种数据源中时，使用知识图谱的 label 作为显示名

## 第二阶段：边类型开关

- [x] Task 4: 工具栏边类型开关
  - 在 `CausalToolbar.tsx` 中新增两个 toggle 按钮
  - "知识图谱边"开关：控制 `showKnowledgeEdges` 状态
  - "认知地图边"开关：控制 `showCausalEdges` 状态
  - 两个开关默认均为开启
  - 开关按钮使用图标（如 `Graph` 和 `Brain`）+ 标签文字
  - Props 接口扩展：`showKnowledgeEdges`, `onToggleKnowledgeEdges`, `showCausalEdges`, `onToggleCausalEdges`

- [x] Task 5: 边过滤逻辑升级
  - 在 `CausalCanvas.tsx` 的 `useMemo` 过滤逻辑中，扩展为三层过滤
  - 一层：`showKnowledgeEdges` 控制知识边（`type === 'knowledge'`）
  - 二层：`showCausalEdges` 控制因果边（`type !== 'knowledge'`）
  - 三层：保留原有的 `showFeedbackLoops` 和 `showLowConfidence` 细粒度过滤
  - 过滤后更新 Cytoscape 元素时使用 `cy.remove()` + `cy.add()` 或 `cy.filter()` 实现

## 第三阶段：融合聚类与功能升级

- [x] Task 6: 融合聚类 API
  - 升级 `GET /api/causal/suggestions` 端点的聚类计算
  - 在聚类时，同时查询 `links` 表中的知识边并纳入邻接矩阵
  - 知识边以权重 0.5 参与连通分量计算
  - 因果边以权重 1.0 参与连通分量计算
  - 输出建议时标注模块类型：`knowledge`、`causal`、`mixed`

- [x] Task 7: 建议系统融合
  - 在 `CausalSuggestions.tsx` 中显示融合聚类建议
  - 混合模块建议以特殊样式标记（如紫色边框）
  - 建议卡片增加"类型"标签（知识/因果/混合）
  - 一键执行时，混合模块的打包操作同时考虑知识边和因果边

## 第四阶段：功能融合与验证

- [x] Task 8: NL 命令支持边类型切换
  - 在 `IntentBar.tsx` 的操作映射中新增 `filter` 类型支持 `knowledge` 和 `causal` 参数
  - 在 `IntentResolver` 的模板中添加：`"只显示知识边"` → `filter { edgeTypes: ['knowledge'] }`
  - 在 `IntentResolver` 的模板中添加：`"只显示因果边"` → `filter { edgeTypes: ['causal'] }`

- [x] Task 9: 导出功能适配
  - 导出 PNG 时包含知识图谱边和认知地图边
  - 如果某类边被关闭，导出的 PNG 中也不包含该类边

- [x] Task 10: 视图保存适配
  - 在 `ViewManager` 的视图快照中保存 `showKnowledgeEdges` 和 `showCausalEdges` 状态
  - 加载视图时恢复这两个开关状态

# Task Dependencies
- Task 2 依赖 Task 1（数据就绪）
- Task 3 依赖 Task 1
- Task 5 依赖 Task 4（开关状态）
- Task 6 依赖 Task 1（数据源）
- Task 7 依赖 Task 6（融合聚类结果）
- Task 8 依赖 Task 4（开关状态）
- Task 9 依赖 Task 1
- Task 10 依赖 Task 4