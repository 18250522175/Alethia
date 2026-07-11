# Tasks · 审计统计、未实现功能与 UI 跳转

## 统计问题修复

- [x] Task 1.1：修复 `HealthDashboard.trend` 类型与实际使用不匹配
  - [x] 修改 `shared/types/health.ts` 中 `trend` 类型：`number[]` → `Array<{ date: string; nodes: number; edges: number }>`
  - [x] 修改 `DashboardPage.tsx` 中趋势图数据访问：`data?.scale.trend?.map((t: any) => t.nodes)` → 使用正确的 `{ nodes, edges }` 结构

- [x] Task 1.2：修复成本分布饼图使用硬编码比例
  - [x] 检查后端 `getHealth` 是否返回成本分类数据，若无则添加
  - [x] 修改 `DashboardPage.tsx` 的成本饼图数据为真实 API 数据

- [x] Task 1.3：添加 `contextHeatmap` 热度图可视化到仪表盘
  - [x] 在 `DashboardPage.tsx` 中添加热度图区域
  - [x] 使用 `contextHeatmap` 数据渲染各上下文活跃度

- [x] Task 1.4：添加 `aiQuality.trend` 趋势图到仪表盘
  - [x] 在 AI 质量卡片中添加正确率趋势折线图

## UI 跳转修复

- [x] Task 2.1：修复仪表盘卡片跳转目标
  - [x] 观察文件数：`/library` → `/observed-files`
  - [x] 归档版本：`/wiki` → `/changelog`

- [x] Task 2.2：添加缺失的仪表盘跳转入口
  - [x] AI 质量卡片添加"查看详情"链接到 `/eval-report`
  - [x] 趋势图标题添加链接到 `/timeline`
  - [x] 预算卡片添加"查看详情"链接到 `/settings#budget`

## 侧边栏入口补充

- [x] Task 3.1：在侧边栏添加缺失的导航入口
  - [x] 添加搜索入口 `/search`
  - [x] 添加通知入口 `/notifications`（含未读计数 badge）
  - [x] 添加评测报告入口 `/eval-report`
  - [x] 添加资料库入口 `/library`

# Task Dependencies
- Task 1.1–1.4 可并行（统计修复）
- Task 2.1–2.2 可并行（跳转修复）
- Task 3.1 可独立并行（侧边栏入口）