# Tasks

本 spec 为审计报告，审计已全部完成。以下 20 项修复/增强任务已全部实施。

## 高优先级修复（Bug/错误）

- [x] Task 1: 修复 pages 表缺少 title 列的 SQL 查询错误
  - 在 `brainapi.ts` 的 `GET /api/pages` 查询中，使用 `COALESCE(NULLIF(title, ''), slug)` 作为 title 回退

- [x] Task 2: 修复因果边 ID 前缀导致的证据查询失败
  - 在 `CausalCanvas.tsx` 的 `getCausalEvidence` 调用处，使用 `edgeId.replace(/^ce_/, '')` 去除前缀

- [x] Task 3: 修复因果节点 API 路径不一致（nodes vs node）
  - 统一前端 `api.getCausalNode` 为 `/causal/node/${slug}`（单数）

- [x] Task 4: 修复 WikiEntryPage 别名点击未解析问题
  - 在跳转前调用 `api.resolveAlias(alias)` 获取正确的 slug

- [x] Task 5: 修复 registerLibraryFile 失败后无临时文件清理
  - 确认 `video.ts` 和 `audio.ts` 已有 `finally` 块清理临时目录，无需额外修改

- [x] Task 6: 添加 causal_inference_cache 定期清理任务
  - 在 `causal.ts` 中添加 `setInterval` 每 30 分钟清理过期缓存条目

## 中优先级（未实现功能）

- [x] Task 7: 实现知识图谱页与认知地图页之间的导航按钮
  - 在 `GraphFullPage` 和 `CognitiveMapPage` 相互添加导航链接

- [x] Task 8: Wiki 条目页添加"在认知地图中查看"按钮
  - 在 `WikiEntryPage` 添加跳转到认知地图（以当前节点为中心）的按钮

- [x] Task 9: 实现聚类结果的可视化高亮
  - 在 `CausalCanvas` 中添加 `highlightedCluster` 状态和琥珀色发光边框效果

- [x] Task 10: 实现文件上传进度条 UI
  - 在 `UploadPage` 中添加上传进度显示（模拟阶段进度）

- [x] Task 11: 实现反事实推理前端 UI
  - 在 `CausalReasoningPanel` 中添加反事实推理标签页（变量选择、干预设置、结果展示）

- [x] Task 12: 实现时间脉冲响应图表展示
  - 在 `CausalReasoningPanel` 中添加时间脉冲标签页（SVG 折线图 + 数据表格）

- [x] Task 13: 实现因果模型版本对比前端展示
  - 在 `CausalVersionPanel` 中添加版本对比区域（双下拉选择 + 差异展示）

- [x] Task 14: 实现文件内联预览（图片/视频/音频）
  - 在 `brain-media` 中添加 MIME 类型检测和内联预览（img/video/audio 标签）

- [x] Task 15: 补充跨页面 UI 跳转链接
  - 在 DashboardPage、SearchResultPage、NotesPage、DiffReviewPage 等页面添加缺失的跳转链接

## 低优先级（增强功能）

- [x] Task 16: 笔记系统添加 wikilink 语法支持
  - 在 `MarkdownEditor` 中添加 `[[wikilink]]` 自动补全，`MarkdownRenderer` 中支持 wikilink 渲染

- [x] Task 17: 笔记添加标签/分类系统
  - 新增 `GET /api/notes/tags` 和 `PUT /api/notes/:path/tags` 端点，前端 NotesPage 添加标签筛选和编辑

- [x] Task 18: 文件添加标签/分类系统
  - 新增 `library_files.tags` 列，`GET /api/library-files/tags` 和 `PUT /api/library-files/:hash/tags` 端点

- [x] Task 19: 实现超边的可视化编辑/删除 UI
  - 在 `CausalCanvas` 中为超边添加紫色样式、右键菜单、编辑表单和删除功能（含后端 API）

- [x] Task 20: 实现批量文件上传
  - 在 `UploadPage` 中支持多文件选择、并发上传队列、进度追踪和完成摘要

# Task Dependencies
- Task 2 和 Task 3 互相独立，可并行
- Task 9 依赖 Task 7（先有导航，才能看到聚类高亮）
- Task 11, Task 12, Task 13 互相独立，可并行
- Task 15 依赖 Task 7, Task 8（基础导航实现后统一补充）