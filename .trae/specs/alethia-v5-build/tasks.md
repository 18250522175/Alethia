# Tasks

按依赖顺序组织。同一阶段内可并行的任务已标注。

## 阶段 0：项目骨架与共享层

- [ ] Task 0.1：建立项目根目录结构（`server/`、`web/`、`shared/`、根级部署文件），初始化根 `package.json`（workspace）与 `tsconfig.base.json`
  - [ ] 创建 `server/package.json`（Bun + TypeScript）、`server/tsconfig.json`
  - [ ] 创建 `web/package.json`（Vite + React + TS）、`web/tsconfig.json`、`web/tailwind.config.js`、`web/vite.config.ts`
  - [ ] 创建 `shared/package.json` 与 `shared/tsconfig.json`
- [ ] Task 0.2：编写 `shared/types/` 全栈共享类型
  - [ ] `AskRequest`、`AskResponse`、`EvidenceSpan`、`PendingDiff`、`ApplyResult`、`QueryParams`、`QueryResult`
  - [ ] `HealthDashboard`、`EvalReport`、`ArchiveReport`、`GhostReport`、`GenerateReport`、`Settings`、`ObservedFile`
  - [ ] `LLMAdapter` 接口契约、`LLMRequest`、`LLMResponse`、`ModelTier`、`ModelAssignment`
- [ ] Task 0.3：编写 `.env.example` 模板（DB、BRAIN_API_KEY、十家厂商 API Key、模型分层、预算默认值）

## 阶段 1：后端基础设施

- [ ] Task 1.1：Bun 入口与 HTTP 框架（Hono 推荐），含路由注册、CORS、JSON 错误处理中间件
- [ ] Task 1.2：配置加载层 `server/src/config/`，从 `.env` 与 `.brain-config.yml` 双源合并，类型对齐 `shared/types/Settings`
- [ ] Task 1.3：i18n 与全汉化日志（`server/src/i18n/`），汉语错误码映射、`pino` 日志含 `lang` 字段
- [ ] Task 1.4：Bearer Token 认证中间件（Phase 1 即实现），从 `BRAIN_API_KEY` 读取，401 返回汉语错误
- [ ] Task 1.5：PostgreSQL 连接池与 DAO 抽象层 `server/src/db/dao/`，PG 标准 SQL 子集
- [ ] Task 1.6：数据库迁移 `server/src/db/migrations/0001_init.sql`，创建全部 v5.0 表（含 5 张新表：`conversation_logs`、`evidence_translations`、`ghost_relations`、`observed_files`、`eval_anomaly_flags`）+ pgvector 扩展 + tsvector 列 + HNSW 索引
- [ ] Task 1.7：种子数据脚本与默认 wiki/index.md、AGENTS.md、portals 占位

## 阶段 2：L5 存储层与 Markdown 同步

- [ ] Task 2.1：Markdown 文件系统管理器（`raw/`、`wiki/`、`summaries/`、`changelog/`、`library/`、`skills/`、`exports/`）
- [ ] Task 2.2：Compiled Truth 页面解析器（YAML frontmatter + State/Assessment/Threads/Relations/Timeline/Version History/Semantic Rings Archive/Evidence）
- [ ] Task 2.3：`.manifest.json` Delta 追踪（文件哈希、最后修改时间）
- [ ] Task 2.4：双向同步引擎：Markdown → DB（写入 pages、page_fts、page_embeddings、links、timeline_entries、knowledge_versions、clusters、semantic_rings、evidence_spans）
- [ ] Task 2.5：`rebuildStruct()` 秒级重建（含 changelog/ 解析、幽灵关系检测、orphaned 标记）
- [ ] Task 2.6：`extractPending()` 按需提取入口

## 阶段 3：国内大模型适配层

- [ ] Task 3.1：`LLMAdapter` 抽象接口与基类（`chat()`、`embed()`、`probe()` 三方法 + token 计数 + 成本估算）
- [ ] Task 3.2：阿里云百炼（Qwen）适配器
- [ ] Task 3.3：智谱 AI（ChatGLM）适配器
- [ ] Task 3.4：月之暗面（Kimi/Moonshot）适配器
- [ ] Task 3.5：百度（文心 ERNIE）适配器
- [ ] Task 3.6：科大讯飞（星火 Spark）适配器
- [ ] Task 3.7：腾讯（混元 Hunyuan）适配器
- [ ] Task 3.8：MiniMax 适配器
- [ ] Task 3.9：DeepSeek 适配器
- [ ] Task 3.10：零一万物（Yi）适配器
- [ ] Task 3.11：百川智能（Baichuan）适配器
- [ ] Task 3.12：模型分层路由器（按任务类型 → 模型槽位），从配置读取分配表
- [ ] Task 3.13：连接探针 endpoint `POST /api/llm/test`，前端可调用测试

> Task 3.2–3.11 可并行。

## 阶段 4：L2 混合检索引擎

- [ ] Task 4.1：pgvector HNSW 向量检索（含嵌入生成，text-embedding-3-small）
- [ ] Task 4.2：PG tsvector 全文检索（含中文分词支持）
- [ ] Task 4.3：RRF 融合算法（约 50 行）
- [ ] Task 4.4：图谱 CTE 递归遍历
- [ ] Task 4.5：zerank-2 重排序适配（可配置关闭）
- [ ] Task 4.6：来源感知加权
- [ ] Task 4.7：命名实体 + 学习路由（user_rules 表）
- [ ] Task 4.8：RoBERTa-mnli NLI 预检（nli_cache 表）
- [ ] Task 4.9：意图路由分类器（5 类）+ 三层延迟 T0/T1/T2

> 4.1–4.8 在阶段 4 内可并行；4.9 依赖 4.1–4.8。

## 阶段 5：L1 Agent 编排层

- [ ] Task 5.1：Planner Agent（制定检索计划），系统提示词 `skills/prompts/planner.zh-CN.md`
- [ ] Task 5.2：Retriever Agent（调用 L2）
- [ ] Task 5.3：Grader Agent（评分卡：事实准确/覆盖完整/来源清晰/证据覆盖率），`grader.zh-CN.md`
- [ ] Task 5.4：Generator Agent（生成含 `[^span_id]` 脚注的 Markdown），`generator.zh-CN.md`
- [ ] Task 5.5：Reflector Agent（信息增益追踪 + 5 轮硬上限 + 3 秒熔断）
- [ ] Task 5.6：追问压缩策略（低成本模型摘要）
- [ ] Task 5.7：静默观察补提取（observed_files 表 + 阈值计数 + 自动触发）
- [ ] Task 5.8：纠错反哺（用户纠错 → 反例采样 → 源文件状态回退）
- [ ] Task 5.9：证据翻译缓存（evidence_translations 表 + 90 天过期 + 后台异步）
- [ ] Task 5.10：`narrate`、`shadow_eval`、`rule_learn`、`ask_question` 工具实现

## 阶段 6：L4 自进化引擎

- [ ] Task 6.1：Dream Cycle 编排器（六阶段：预算检查 → community_detect → NLI 预检 → forget_decay + lint + 幽灵清理 → topic_cluster + gap_analysis → enrich_external + Diff 生成 + 年轮）
- [ ] Task 6.2：全局预算管理器（日/月上限 + 单次问答上限 + 熔断）
- [ ] Task 6.3：版本历史归档（>50 条触发 → 摘要生成 → 移入 changelog/ → 归档链接 → rebuild-struct）
- [ ] Task 6.4：幽灵关系清理器（检测 → 追加 Threads 提示 → 生成 🟢 Diff → ghost_relations 表）
- [ ] Task 6.5：影子评估引擎（基准集 + 自动回归 + 异常熔断 + eval_anomaly_flags）
- [ ] Task 6.6：全自动写入版本记录 + 一键回滚（文件恢复 + rebuild-struct）
- [ ] Task 6.7：每周 skill 优化与夜间简报（汉语）

## 阶段 7：BrainAPI 统一服务层完整实现

- [ ] Task 7.1：`extractFacts(filePath)`、`applyDiff(diffId, approved)`、`rollbackAutoChange(batchId)`
- [ ] Task 7.2：`query(params)`、`getMedia(hash, range)`（含 HTTP 206 Range 请求）
- [ ] Task 7.3：`rebuildStruct()`、`extractPending()`
- [ ] Task 7.4：`shadowEval()`、`getHealth()`、`setDailyBudget()`、`getRemainingBudget()`
- [ ] Task 7.5：`askQuestion(request)` 完整实现（串联 L1，含追问压缩、静默观察、证据翻译、纠错反哺）
- [ ] Task 7.6：`submitFeedback()`、`listObservedFiles()`、`triggerObservedExtraction(fileHash)`
- [ ] Task 7.7：`translateEvidence(spanIds, targetLang)`
- [ ] Task 7.8：`archiveVersions(entitySlug?)`、`cleanGhostRelations()`
- [ ] Task 7.9：`generateStaticSite(outputPath, options)`
- [ ] Task 7.10：`generateDraft()`

## 阶段 8：L6 多模态摄入管道

- [ ] Task 8.1：模态转换统一入口 `BrainIngest`，按 MIME 分发
- [ ] Task 8.2：文档管道（PDF/DOCX/PPTX/XLSX → Markdown，公式 LaTeX，表格 HTML）
- [ ] Task 8.3：图片管道（OCR + VLM 描述）
- [ ] Task 8.4：音频管道（Whisper.cpp 带时间码）
- [ ] Task 8.5：视频管道（FFmpeg 提取音轨 + Whisper）
- [ ] Task 8.6：网页管道（Trafilatura 去广告/导航）
- [ ] Task 8.7：纯文本管道（MD/TXT/CSV/JSON 直接通过）
- [ ] Task 8.8：内容清洗 + 证据双向映射建立 + SHA-256 原始归档 + 文件状态初始化为 `new`

> 8.2–8.7 可并行。

## 阶段 9：CLI 与 MCP Server

- [ ] Task 9.1：CLI 命令：`ask`、`rebuild-struct`、`extract-pending`、`archive-versions`、`clean-ghost-relations`、`translate-evidence`、`generate-static-site`、`dashboard-snapshot`
- [ ] Task 9.2：MCP Server（stdio + HTTP 双模式，35+ 工具，全部经 BrainAPI 调用）

## 阶段 10：前端基础设施

- [ ] Task 10.1：Vite + React + TS 项目骨架，集成 Tailwind + react-i18next + TanStack Query + React Router v6 + Headless UI + Cytoscape.js + Chart.js + Phosphor Icons
- [ ] Task 10.2：`zh-CN.json` 默认语言包，`en.json` 备选，浏览器语言偏好自动选择
- [ ] Task 10.3：深色/浅色主题令牌（`bg-primary`/`text-secondary` 等）+ localStorage 持久化 + 跟随系统
- [ ] Task 10.4：全局壳层 Shell：TopBar、Sidebar（含幽灵红点）、StatusBar、NotificationCenter
- [ ] Task 10.5：路由守卫（未登录仅 `/login`、`/onboarding`，其余重定向）
- [ ] Task 10.6：API 客户端 `web/src/lib/api.ts`（Bearer Token 自动注入、统一错误处理、汉语错误映射）
- [ ] Task 10.7：全局状态 Context（用户、主题、设置、通知）+ TanStack Query 查询封装

## 阶段 11：前端核心页面

> 本阶段可按页面拆分给不同子代理并行。

- [ ] Task 11.1：`LoginPage`（API Key 输入 + 记住设备 + 跳转）
- [ ] Task 11.2：`OnboardingPage`（3–5 步引导浮窗，可跳过）
- [ ] Task 11.3：`WikiHomePage`（Hero + FeaturedArticleCard + PortalGrid + TimelineFeed + QuickActions）
- [ ] Task 11.4：`WikiEntryPage`（双栏：渲染后富媒体预览 + 原始 Markdown 编辑；EvidencePopover 内嵌）
- [ ] Task 11.5：`GraphFullPage`（Cytoscape.js + 集群框 + 时间推演滑块 + 幽灵虚线）
- [ ] Task 11.6：`DiffReviewPage`（🟢🟡🔴 三级分流 + Diff 对比 + 媒体预览 + 批量合并）
- [ ] Task 11.7：`QAPanelPage`（多轮对话 + 脚注溯源 + 双语证据 + 反馈按钮 + token/费用/压缩状态）
- [ ] Task 11.8：`DashboardPage`（仪表盘卡片组：规模/语境热力图/审核积压/AI 质量/预算/熔断/幽灵/归档/缓存/孤岛 + 补提取观察列表）
- [ ] Task 11.9：`ChangelogPage`（24h 变更批次 + 回滚 + 归档批次 archive- 前缀）
- [ ] Task 11.10：`EvalReportPage`（回归表 + 异常熔断告警区 + Git commit 关联）
- [ ] Task 11.11：`TimelineFullPage`（实体/集群中心 + 🗣 问答日志 + 媒体原地渲染）
- [ ] Task 11.12：`SearchResultPage`（条目 + 文件 + 问答记录分组）
- [ ] Task 11.13：`LibraryFilePage`（PDF 预览 + 音视频播放器 + 时间码跳转）
- [ ] Task 11.14：`SettingsPage`（9 组设置驾驶舱 + 模型分配拖拽 + 脏标记 + 即时校验 + 危险二次确认）
- [ ] Task 11.15：`EvidencePopover`（悬停 200ms + 钉住 + 双语 + 复制 library:// 链接）
- [ ] Task 11.16：`BrainMedia` Web Component（音视频播放 + start 时间戳 + 引用角标）
- [ ] Task 11.17：`MarkdownRenderer` + 自定义媒体插件 + Version History / Semantic Rings 折叠 + evidence_span 着色
- [ ] Task 11.18：`BudgetBadge`、`QuickAskButton`、`GlobalSearch`、`UserMenu`

## 阶段 12：部署与文档

- [ ] Task 12.1：`Dockerfile.server`（Bun + 多阶段构建）
- [ ] Task 12.2：`Dockerfile.web`（Vite build + Nginx 静态服务）
- [ ] Task 12.3：`nginx.conf`（SPA fallback + /api 反代到后端 + 静态站点导出目录）
- [ ] Task 12.4：`docker-compose.yml`（postgres-pgvector + server + web 三服务，含健康检查、依赖顺序、卷挂载）
- [ ] Task 12.5：`init.sh`（检查 Docker → 复制 .env.example → 提示填 API Key → `docker compose up -d` → 等待健康 → 执行 DB 初始化 → `brain rebuild-struct` → 打印访问地址）
- [ ] Task 12.6：更新 `README.md`（项目简介 + L0–L8 架构图 + 快速开始 + 环境变量说明 + 常见问题）

## 阶段 13：闭环验证

- [ ] Task 13.1：端到端冒烟测试：摄入 Markdown → 自动提取 → 生成 Diff → 人类审核 → 写回 Markdown → 图谱演化 → 问答引用证据
- [ ] Task 13.2：`docker compose up` 一键启动验证（含健康检查、访问 http://localhost、登录、设置 API Key、测试模型连接）
- [ ] Task 13.3：所有路由无死链接、所有按钮可点击、深色/浅色切换正确、移动端响应式

# Task Dependencies

- Task 0.1–0.3 是所有后续任务的前置
- 阶段 2 依赖阶段 1
- 阶段 3 内 Task 3.2–3.11 依赖 3.1；3.12 依赖 3.2–3.11；3.13 依赖 3.12
- 阶段 4 内 4.9 依赖 4.1–4.8
- 阶段 5 依赖阶段 3 + 4
- 阶段 6 依赖阶段 5
- 阶段 7 依赖阶段 2–6
- 阶段 8 依赖阶段 2
- 阶段 10 依赖阶段 0 + 7（API 客户端契约）
- 阶段 11 依赖阶段 10
- 阶段 12 依赖阶段 1–11
- 阶段 13 依赖阶段 12
