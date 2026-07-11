# Checklist · 审计统计、未实现功能与 UI 跳转

## 统计问题

### 1.1 trend 类型修复
- [x] `shared/types/health.ts` 中 `trend` 类型改为 `Array<{ date: string; nodes: number; edges: number }>`
- [x] `DashboardPage.tsx` 趋势图数据访问使用正确结构
- [x] 后端 `getHealth` 返回的 `trend` 数据匹配新类型

### 1.2 成本分布修复
- [x] 成本饼图使用真实 API 数据而非硬编码比例
- [ ] 若后端无分类数据，`HealthDashboard.budget` 扩展 `breakdown` 字段（N/A：此修复使用 daily/monthly budget 数据替代，无需 breakdown 字段）

### 1.3 contextHeatmap 可视化
- [x] 仪表盘渲染 `contextHeatmap` 热度图
- [x] 热度图显示各上下文活跃度

### 1.4 aiQuality.trend 可视化
- [x] AI 质量卡片包含正确率趋势折线图
- [x] 趋势图使用 `aiQuality.trend` 数据

## UI 跳转

### 2.1 卡片跳转修复
- [x] 观察文件数卡片跳转到 `/observed-files`
- [x] 归档版本卡片跳转到 `/changelog`

### 2.2 缺失跳转入口
- [x] AI 质量卡片有"查看详情"链接到 `/eval-report`
- [x] 趋势图标题可点击跳转到 `/timeline`
- [x] 预算卡片有"查看详情"链接到 `/settings#budget`

## 侧边栏入口

### 3.1 缺失导航入口
- [x] 侧边栏有搜索入口 `/search`
- [x] 侧边栏有通知入口 `/notifications`（含未读 badge）
- [x] 侧边栏有评测报告入口 `/eval-report`
- [x] 侧边栏有资料库入口 `/library`