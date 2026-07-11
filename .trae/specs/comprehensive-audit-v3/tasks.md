# Tasks

## 高优先级：Bug 修复和冗余清理

- [x] Task 1: 修复 QAPanelPage 重复的 Conversation 接口定义
  - 删除第 51-57 行重复的接口定义

- [x] Task 2: 删除死代码 GraphFullPage.tsx 和 i18n 翻译键
  - 删除 `/workspace/web/src/routes/GraphFullPage.tsx`
  - 从 `zh-CN.json` 和 `en.json` 中删除 `graphFull` 段落

- [x] Task 3: 修复检索系统 `executeQuery` 错误隔离
  - 将 `Promise.all` 改为 `Promise.allSettled`，单路搜索失败时降级
  - 位置：[retrieval/router.ts](file:///workspace/server/src/retrieval/router.ts#L88-L91)

- [x] Task 4: 修复 LLM Router 无故障转移
  - 在 `route()` 方法中添加降级逻辑：主适配器不可用时尝试下一个可用适配器
  - 位置：[llm/router.ts](file:///workspace/server/src/llm/router.ts#L56-L73)

- [x] Task 5: 修复数据库迁移文件命名冲突
  - 将 `0002_add_aliases.sql` 重命名为 `0002a_add_aliases.sql`

- [x] Task 6: 修复 `executeAdvancedSearch` 查询不存在的列
  - 使用 `COALESCE` 保护 `tags`、`quality`、`cv_score` 列
  - 位置：[retrieval/router.ts](file:///workspace/server/src/retrieval/router.ts#L234-L243)

## 中优先级：功能增强

- [x] Task 7: 为关键空 catch 块添加日志记录
  - 在 `brainapi/index.ts`、`brainapi.ts`、`document.ts`、`image.ts`、`audio.ts` 的空 catch 块中添加 `logger.warn`
  - 在 `NotificationContext.tsx`、`OnboardingPage.tsx` 的空 catch 块中添加 `console.warn`

- [x] Task 8: 为 Agent 系统添加超时控制
  - 在 `agents/utils.ts` 中创建 `withTimeout` 工具函数（5 分钟超时）
  - 在 `generator.ts`、`planner.ts`、`retriever.ts` 中应用

- [x] Task 9: 添加 Evolution 系统的定时触发
  - 在 `index.ts` 中添加 `setInterval` 触发超图进化和周报生成

- [x] Task 10: 添加 LLM 连接测试 API 和 UI
  - 新增 `POST /api/llm/test-connection` 端点
  - 在 SettingsPage 中添加"测试连接"按钮

- [x] Task 11: 修复 OnboardingPage 未使用的 Graph 图标导入
  - 移除 `Graph as GraphIcon` 导入

- [x] Task 12: 实现 QA 对话中"在认知地图中查看"按钮
  - 在 QAPanelPage 的消息中，为引用的实体添加跳转认知地图的按钮

## 低优先级：清理和增强

- [x] Task 13: 清理 `clusters`/`communities` 未使用的数据库表
  - 创建迁移 `0010_cleanup_unused_tables.sql` 删除未使用的表

- [x] Task 14: 检查并清理 `agents/feedback.ts` 未使用代码
  - 确认 feedback agent 正在被 `brainapi/index.ts` 使用，无需标记为 DEPRECATED

- [x] Task 15: 修复 `graphTraverse` 结果去重
  - 使用 `Set` 按 `sourceSlug||targetSlug` 去重

# Task Dependencies
- Task 2 独立（清理死代码）
- Task 3 和 Task 6 相关（同一文件），可一起处理
- Task 1, Task 5, Task 11 独立，可并行
- Task 7-12 互相独立，可并行
- Task 13 依赖 Task 2（先清理已知死代码，再清理数据库表）