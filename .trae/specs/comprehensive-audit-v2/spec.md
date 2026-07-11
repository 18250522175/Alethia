# 项目全面审计 v2 Spec

## Why
在首轮审计（comprehensive-audit-report）完成后，继续深入审计。用户发现融合视图上线后 `GraphFullPage`（知识图谱独立页）与 `CognitiveMapPage`（融合视图页）并存，存在功能冗余和导航混乱。本轮审计聚焦于：发现尚未暴露的问题、统计仍然缺失的功能、评估页面冗余并提出合并方案。

## What Changes
- 发现新问题/错误 8 项
- 发现未实现功能/控件 10 项
- 发现缺失功能/UI 跳转 6 项
- **重点**：`GraphFullPage` 与 `CognitiveMapPage` 冗余分析及合并方案

## Impact
- Affected specs: unified-graph-view, comprehensive-audit-report
- Affected code: App.tsx, Sidebar.tsx, GraphFullPage.tsx, CognitiveMapPage.tsx, CausalCanvas.tsx, i18n 文件

---

## 审计结果

### 一、GraphFullPage 与 CognitiveMapPage 冗余分析

#### 现状
- **`/graph`** → `GraphFullPage`：独立知识图谱页，使用自建 cytoscape 实例，仅显示知识图谱数据（语义关系边）
- **`/cognitive-map`** → `CognitiveMapPage`：融合视图页，使用 `CausalCanvas`，同时显示知识图谱边 + 因果边 + 超边
- 侧边栏同时列出两个入口，用户困惑

#### GraphFullPage 独有功能（CausalCanvas 缺失）
| 功能 | 重要性 | 说明 |
|------|--------|------|
| 多布局切换（cose/circle/breadthfirst/grid） | 高 | 用户可切换不同布局算法 |
| 时间筛选（7d/30d/90d/all） | 中 | 按时间范围过滤节点和边 |
| 节点搜索 + 高亮 | 高 | 搜索框输入即时高亮匹配节点 |
| 路径查找 | 中 | 选择两个节点，显示最短路径 |
| 导出 PNG/JSON | 中 | 将当前画布导出为图片或 JSON |
| 右键上下文菜单 | 低 | 节点右键菜单（聚焦/展开/打开 Wiki） |
| 时间线视图 | 低 | 底部时间线面板 |

#### CausalCanvas 独有功能（GraphFullPage 缺失）
| 功能 | 重要性 | 说明 |
|------|--------|------|
| 边类型开关（知识边/因果边） | 核心 | 融合视图的核心交互 |
| 因果推理面板 | 高 | do-calculus、反事实、时间脉冲 |
| 预警系统 | 中 | 因果冲突检测 |
| 版本管理 | 中 | 视图快照保存/恢复 |
| NL 命令栏 | 高 | 自然语言操作画布 |
| 超边编辑/删除 | 中 | 超图交互 |
| 融合聚类建议 | 高 | 跨知识/因果的模块发现 |
| 聚类高亮 | 中 | 琥珀色发光边框 |

#### 结论
**GraphFullPage 应被废弃**，其有价值的独有功能（布局切换、节点搜索、导出）应迁移至 CausalCanvas。`/graph` 路由应重定向到 `/cognitive-map`。

---

### 二、新发现问题/错误（8 项）

1. **侧边栏知识图谱入口仍指向旧版 GraphFullPage**
   - 融合视图上线后，侧边栏 `/graph` 仍指向仅含知识图谱的旧页面，而非融合视图
   - 位置：[Sidebar.tsx](file:///workspace/web/src/layouts/Sidebar.tsx#L176)

2. **GraphFullPage 的 i18n 翻译键大量冗余**
   - `graphFull.*` 翻译键（约 30+ 条）在 `zh-CN.json` 和 `en.json` 中，页面废弃后成为死代码
   - 位置：`/workspace/web/src/i18n/locales/zh-CN.json` 和 `en.json` 中的 `graphFull.*` 键

3. **CausalCanvas 数据加载优化缺失**
   - 同时 fetch 3 个数据源（`getGraphData`、`getCausalGraph`、`getHypergraph`），但未使用 `Promise.all` 或 `useQueries` 并行加载
   - 位置：[CausalCanvas.tsx](file:///workspace/web/src/components/CognitiveMap/CausalCanvas.tsx) 的 `useQuery` 调用

4. **MiniKnowledgeGraph 组件可能未适配融合视图**
   - `MiniKnowledgeGraph` 是 Wiki 页面侧边栏的小型知识图谱，可能仍使用旧版数据源
   - 位置：[MiniKnowledgeGraph.tsx](file:///workspace/web/src/components/MiniKnowledgeGraph.tsx)

5. **SearchCombobox 搜索结果可能不包含认知地图入口**
   - 全局搜索框的搜索结果中，可能没有跳转到认知地图的选项
   - 位置：[SearchCombobox.tsx](file:///workspace/web/src/blocks/SearchCombobox.tsx)

6. **CausalCanvas 的 `useEffect` 清理不完整**
   - 多个 `useEffect` 创建了 cytoscape 事件监听器，但组件卸载时可能未完全清理
   - 位置：[CausalCanvas.tsx](file:///workspace/web/src/components/CognitiveMap/CausalCanvas.tsx)

7. **WikiHomePage 门户链接可能硬编码**
   - 侧边栏 Portal 区域（portal-product/portal-engineering 等）可能指向不存在的 wiki 页面
   - 位置：[Sidebar.tsx](file:///workspace/web/src/layouts/Sidebar.tsx#L93-L96)

8. **ObservedFilesPage 功能可能不完整**
   - 观察文件页面依赖 `observed_files` 表，但文件变更检测和通知可能未完整实现
   - 位置：[ObservedFilesPage.tsx](file:///workspace/web/src/routes/ObservedFilesPage.tsx)

---

### 三、未实现功能/控件（10 项）

9. **CausalCanvas 缺少布局切换控件**
   - 当前仅支持默认布局，无 cose/circle/breadthfirst/grid 切换

10. **CausalCanvas 缺少节点搜索框**
    - 无搜索框来快速定位和高亮节点

11. **CausalCanvas 缺少画布导出功能**
    - 无 PNG/JSON 导出按钮

12. **CausalCanvas 缺少路径查找**
    - 无选择两个节点查找最短路径的功能

13. **WikiHomePage 门户页面缺少实际内容**
    - `/wiki/portal-product`、`/wiki/portal-engineering` 等门户页面可能不存在或是空页面

14. **CausalAlertPanel 预警可能缺少可操作按钮**
    - 预警显示后，用户无法一键修复冲突（如删除冲突边、调整权重）

15. **CausalCPTWidget 未在 CausalCanvas 中集成**
    - CPT 条件概率表控件为独立组件，未在画布的节点详情或推理面板中集成

16. **笔记页面缺少 Markdown 实时预览**
    - NotesPage 编辑笔记时无分栏预览

17. **搜索全局框缺少认知地图结果**
    - SearchCombobox 搜索结果中无"在认知地图中查看"选项

18. **仪表盘缺少认知地图相关统计卡片**
    - DashboardPage 无显示因果边数量、聚类数量、预警数量等统计

---

### 四、缺失功能/UI 跳转（6 项）

19. **侧边栏缺少 `/cognitive-map` 与 `/graph` 合并后的统一入口**
    - 当前两个入口并存，应合并为一个"图谱"入口

20. **`/graph` 路由未重定向到 `/cognitive-map`**
    - 旧 URL 应 301 重定向到新融合视图

21. **Wiki 页面内链跳转后缺少返回认知地图的快捷方式**
    - 从认知地图点击节点进入 Wiki 后，无快速返回按钮

22. **上传完成后缺少"查看关联图谱"按钮**
    - 文件上传完成后，仅显示成功消息，无跳转到认知地图查看关联节点的按钮

23. **CausalCanvas 中节点点击后缺少"复制 slug"等快捷操作**
    - 节点详情弹窗仅有基本信息，缺少复制 slug、在 Wiki 中打开等操作

24. **通知消息缺少"在认知地图中查看"操作链接**
    - 因果冲突通知点击后应能跳转到认知地图并高亮相关节点

---

## 合并方案

### 推荐方案：废弃 GraphFullPage，增强 CausalCanvas

**Phase 1: 废弃（立即）**
- `/graph` 路由重定向到 `/cognitive-map`
- 侧边栏移除 `/graph` 入口，保留 `/cognitive-map`（重命名为"图谱"）
- 保留 `GraphFullPage.tsx` 源文件不删除（以备将来参考）

**Phase 2: 迁移（高优先级）**
- 将 GraphFullPage 的以下功能迁移至 CausalCanvas：
  - 布局切换控件（cose/circle/breadthfirst/grid）
  - 节点搜索框 + 高亮
  - 导出 PNG/JSON 按钮
  - 路径查找功能

**Phase 3: 清理（低优先级）**
- 删除 `graphFull.*` i18n 翻译键
- 删除 `GraphFullPage.tsx` 源文件
- 删除关联的 CSS 样式