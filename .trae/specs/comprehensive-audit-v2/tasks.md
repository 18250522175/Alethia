# Tasks

## 高优先级：页面冗余合并

- [x] Task 1: 废弃 GraphFullPage，重定向到融合视图
  - 在 `App.tsx` 中将 `/graph` 路由重定向到 `/cognitive-map`
  - 在 `Sidebar.tsx` 中移除 `/graph` 入口，将 `/cognitive-map` 标签改为"图谱"

- [x] Task 2: 将 GraphFullPage 布局切换功能迁移至 CausalCanvas
  - 在 `CausalToolbar` 中添加布局切换按钮组（cose/circle/breadthfirst/grid）
  - 调用 cytoscape `cy.layout()` 切换布局

- [x] Task 3: 将节点搜索+高亮功能迁移至 CausalCanvas
  - 在 `CausalToolbar` 中添加搜索输入框，支持按 slug/label 模糊匹配
  - 高亮匹配节点，淡化非匹配节点

- [x] Task 4: 将导出 PNG/JSON 功能迁移至 CausalCanvas
  - 在 `CausalToolbar` 中添加导出按钮
  - PNG 导出使用 `cy.png()`，JSON 导出使用 `cy.json()`

- [x] Task 5: 将路径查找功能迁移至 CausalCanvas
  - 在工具栏添加路径查找按钮，支持选择两个节点
  - 使用 cytoscape `aStar` 算法查找并高亮最短路径

## 中优先级：新发现问题修复

- [x] Task 6: 优化 CausalCanvas 数据加载（并行化）
  - 将 3 个独立的 `useQuery` 合并为 `useQueries` 并行加载

- [x] Task 7: 检查并修复 MiniKnowledgeGraph 组件
  - 添加因果边数据获取，紫色渲染因果边，添加切换按钮

- [x] Task 8: 在全局搜索框中添加认知地图入口
  - 在 `SearchCombobox` 搜索结果中添加"在认知地图中查看"按钮

- [x] Task 9: 修复 WikiHomePage 门户页面
  - 创建 `PortalPage.tsx` 组件，按 context 过滤显示页面列表

- [x] Task 10: 在 CausalAlertPanel 中添加可操作按钮
  - 为每条预警添加"修复"下拉菜单（降低权重/删除边/忽略）

- [x] Task 11: 在 CausalCanvas 中集成 CausalCPTWidget
  - 在 `CausalCPTWidget` 中添加编辑模式，支持修改概率值

- [x] Task 12: 添加仪表盘认知地图统计卡片
  - 在 DashboardPage 中添加因果边数/节点数/预警数统计卡片

## 低优先级：清理和增强

- [x] Task 13: 清理废弃的 GraphFullPage 代码
  - 标记 `GraphFullPage.tsx` 为 DEPRECATED
  - 标记 `graphFull.*` i18n 翻译键为 DEPRECATED

- [x] Task 14: 上传完成后添加"查看关联图谱"跳转
  - 在 UploadPage 上传成功提示中添加跳转认知地图的按钮

- [x] Task 15: 通知消息添加认知地图跳转
  - 在 NotificationContext 和 NotificationsPage 中为异常类通知添加"在认知地图中查看"按钮

# Task Dependencies
- Task 2-5 依赖 Task 1（先废弃旧页面，再迁移功能）
- Task 2, Task 3, Task 4, Task 5 互相独立，可并行
- Task 6-12 互相独立，可并行
- Task 13 依赖 Task 1-5（迁移完成后才能清理）