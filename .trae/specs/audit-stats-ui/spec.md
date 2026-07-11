# 审计统计、未实现功能与 UI 跳转 Spec

## Why
前两轮审计已覆盖 Schema 对齐、类型安全、错误处理等维度。第三轮聚焦用户可见的功能完整性：统计数据是否正确、已记录的功能是否实现、UI 页面之间的跳转是否完整。

## What Changes

### 统计问题
- `HealthDashboard.trend` 类型与实际使用不匹配（类型为 `number[]`，实际当 `{nodes, edges}[]` 使用）
- 成本分布饼图使用硬编码比例（0.4/0.3/0.3），非真实数据
- `contextHeatmap` 数据存在但未渲染
- `aiQuality.trend` 数据存在但未显示

### 未实现功能/控件
- **BREAKING** 侧边栏缺少搜索入口、通知入口、评测报告入口
- 无周报展示页面（后端 `/api/eval-report` 已实现但数据无来源）
- 仪表盘缺少上下文热度图可视化
- 仪表盘缺少 AI 质量趋势图

### UI 跳转问题
- 观察文件数跳转到 `/library` 而非 `/observed-files`
- 归档版本跳转到 `/wiki` 而非 `/changelog`
- 仪表盘无跳转到评测报告、时间线、通知的入口
- 侧边栏无 Library、Notifications、Search、EvalReport 链接

## Impact
- Affected specs: `project-audit-cycle`、`audit-cycle-v2`
- Affected code: `web/src/routes/DashboardPage.tsx`、`web/src/layouts/Sidebar.tsx`、`shared/types/health.ts`、`web/src/App.tsx`

## MODIFIED Requirements

### Requirement: 健康仪表盘统计正确性
系统 SHALL 在仪表盘中显示与 `HealthDashboard` 类型一致的统计数据。

#### Scenario: 趋势图数据渲染
- **WHEN** 仪表盘加载趋势图
- **THEN** 使用 `scale.trend` 数组中的 `{date, nodes, edges}` 结构渲染折线图

#### Scenario: 成本分布
- **WHEN** 仪表盘显示成本分布饼图
- **THEN** 使用 `budget` API 中的实际分类数据，而非硬编码比例

### Requirement: UI 导航完整性
系统 SHALL 在侧边栏提供所有主要页面的导航入口，仪表盘卡片应跳转到正确的目标页面。

#### Scenario: 仪表盘卡片跳转
- **WHEN** 用户点击"观察文件数"卡片
- **THEN** 导航到 `/observed-files` 页面

#### Scenario: 侧边栏入口
- **WHEN** 侧边栏渲染
- **THEN** 包含搜索、通知、评测报告、资料库等入口

### Requirement: 上下文热度图
系统 SHALL 在仪表盘中渲染 `contextHeatmap` 数据为可视化热度图。

#### Scenario: 热度图渲染
- **WHEN** 仪表盘数据加载完成
- **THEN** 使用 `contextHeatmap` 数组渲染每个上下文的活跃度条形图