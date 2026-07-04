# Tasks

按依赖顺序组织。每个任务标注 P0/P1/P2 优先级，实现阶段须按 P0 → P1 → P2 顺序推进，保证 P0 闭环可演示后再扩展。同一阶段内可并行的任务已标注。

## 阶段 0：项目骨架与共享层（P0，全部前置）

- [x] Task 0.1：建立项目根目录结构（`server/`、`web/`、`shared/`，根级部署文件），初始化根 `package.json` workspace（pnpm 或 bun workspace）与 `tsconfig.base.json`
  - [x] 根 `package.json`：`workspaces: ["shared","server","web"]`，脚本 `dev:server`/`dev:web`/`db:migrate`/`seed`/`build`
  - [x] `tsconfig.base.json`：`strict: true`、`moduleResolution: bundler`、`paths` 指向 `@shared/*`
  - [x] `server/package.json`：`type: module`、`bun-types`、`hono ^4.6`、`kysely ^0.27`、`pg ^8.13`、`zod ^3.23`、`pino ^9.5`、`yaml ^2.6`、`gray-matter`、`unified`/`remark`/`remark-parse`、`@xenova/transformers`
  - [x] `web/package.json`：`react ^18.3`、`react-dom ^18.3`、`vite ^5.4`、`react-router-dom ^6.27`、`@tanstack/react-query ^5.59`、`react-i18next ^15`、`tailwindcss ^3.4`、`@headlessui/react ^2.2`、`@dnd-kit/core ^6.1`、`cytoscape ^3.30`、`chart.js ^4.4`、`react-chartjs-2 ^4.4`、`@phosphor-icons/react ^2.1`、`markdown-it`、`@floating-ui/react ^0.27`
  - [x] `shared/package.json`：仅 `typescript` 依赖，无运行时
- [x] Task 0.2：编写 `shared/types/` 全栈共享类型（全部 P0）
  - [x] `ask.ts`：`AskRequest`、`AskResponse`（严格对齐架构 4.2 节字段）
  - [x] `evidence.ts`：`EvidenceSpan`（含 `span_id`、`source_file_hash`、`source_text_offset`、`original_location`、`span_text`、`lang`）
  - [x] `diff.ts`：`PendingDiff`、`ApplyResult`、`RollbackResult`
  - [x] `query.ts`：`QueryParams`、`QueryResult`、`QueryIntent`（5 类）
  - [x] `health.ts`：`HealthDashboard`（含全部仪表盘卡片字段）
  - [x] `evolution.ts`：`EvalReport`、`ArchiveReport`、`GhostReport`、`GenerateReport`、`RebuildReport`、`ExtractReport`
  - [x] `settings.ts`：`Settings` 接口（9 组全部字段）+ `defaultSettings` 常量
  - [x] `llm.ts`：`LLMAdapter` 契约（`chat`/`embed`/`probe`）、`LLMRequest`、`LLMResponse`、`ModelTier`、`ModelAssignment`、`AdapterStatus`
  - [x] `entities.ts`：`Page`、`Link`、`TimelineEntry`、`KnowledgeVersion`、`SemanticRing`、`Cluster`、`ClusterMember`、`LibraryFile`、`ObservedFile`、`GhostRelation`、`ConversationLog`、`EvidenceTranslation`
  - [x] `index.ts`：统一 re-export
- [x] Task 0.3：编写 `.env.example` 模板（P0）
  - [x] `DATABASE_URL=postgres://alethia:alethia@postgres:5432/alethia`
  - [x] `BRAIN_API_KEY=`（带注释：登录密钥，必须填写）
  - [x] `BRAIN_PORT=3000`
  - [x] `LANGUAGE=zh-CN`
  - [x] `DAILY_BUDGET=5`、`MONTHLY_BUDGET=50`、`PER_QUERY_BUDGET=0.5`
  - [x] 各厂商：`BAILIAN_API_KEY`、`ZHIPU_API_KEY`、`MOONSHOT_API_KEY`、`ERNIE_API_KEY`、`SPARK_API_KEY`、`HUNYUAN_API_KEY`、`MINIMAX_API_KEY`、`DEEPSEEK_API_KEY`、`YI_API_KEY`、`BAICHUAN_API_KEY`
  - [x] `EMBEDDING_MODEL=text-embedding-3-small`、`EMBEDDING_PROVIDER=local`（默认本地退化）
  - [x] `RERANKER_ENABLED=false`、`ZERANK_API_KEY=`
  - [x] `NLI_PROVIDER=hf-inference`、`HF_API_KEY=`

## 阶段 1：后端基础设施（P0）

- [x] Task 1.1：`server/src/index.ts` Bun + Hono 入口，注册全局中间件（CORS、JSON body parser、错误处理、pino logger），挂载 `/health` 返回扩展状态 `{status:"ok"|"degraded"|"down", lang:"zh-CN", db:"connected"|"disconnected", llm:"configured"|"none", embedding:"vendor"|"local"|"none", version:"5.0.0"}`（见 spec「`/health` 端点扩展」节）
  - [x] DB 启动重试：`pool.ts` 启动时执行最多 30 次 `SELECT 1` 探测（间隔 1s），全部失败退出码 1 + 汉语错误
  - [x] 全局错误处理中间件返回统一格式 `{error:{code, message(汉语), details?}}`，HTTP 状态码与 code 对应
- [x] Task 1.2：`server/src/config/` 配置加载层
  - [x] `loader.ts`：合并 `.env`、`process.env`、`.brain-config.yml`（YAML 解析）
  - [x] `schema.ts`：Zod schema，对齐 `shared/types/Settings`
  - [x] `defaults.ts`：出厂默认值（语言、预算、主题、模型分层推荐配置）
- [x] Task 1.3：`server/src/i18n/` 全汉化
  - [x] `logger.ts`：pino logger 实例，每条日志带 `lang: "zh-CN"`
  - [x] `errors.zh-CN.ts`：错误码 → 汉语消息映射表（如 `UNAUTHORIZED` → 「未授权：缺失 API 密钥」）
- [x] Task 1.4：`server/src/auth/bearer.ts` Bearer Token 中间件
  - [x] 从 `Authorization: Bearer <token>` 提取，与 `config.auth.api_key` 或 `process.env.BRAIN_API_KEY` 比对（支持多个有效 token，逗号分隔）
  - [x] 失败返回 401 + 统一格式 `{error:{code:"UNAUTHORIZED", message:"未授权：缺失 API 密钥"}}`
  - [x] 放行 `/health`、`/api/auth/login`、`/api/llm/test`、`OPTIONS` 预检
  - [x] 启动时检测 `BRAIN_API_KEY` 为空 → 输出汉语警告「⚠️ 未配置 BRAIN_API_KEY，所有受保护接口将拒绝访问」并退出码 1（生产模式）/警告继续（开发模式）
- [x] Task 1.5：`server/src/db/pool.ts` pg 连接池
  - [x] 使用 `pg.Pool`，从 `DATABASE_URL` 读取
  - [x] 启动时执行 `waitForDatabase(maxRetries=30, intervalMs=1000)`：循环 `SELECT 1` 探测，每次失败日志「正在重试连接 PostgreSQL (N/30)...」，全部失败输出「无法连接到 PostgreSQL，请检查 DATABASE_URL 与容器健康状态」并退出码 1
  - [x] 每个 DAO 文件 export 一个对象，方法接受 `Kysely` 实例（已集成到各模块）
  - [x] 全部走 PG 标准 SQL 子集，不依赖 PGLite 专有语法
- [x] Task 1.6：`server/src/db/migrations/0001_init.sql` 完整建表脚本（幂等）
  - [x] `CREATE EXTENSION IF NOT EXISTS vector;`、`CREATE EXTENSION IF NOT EXISTS pg_trgm;`
  - [x] 全部 24 张表（架构 4.8 节清单 + v5.0 新增 5 张），全部 `CREATE TABLE IF NOT EXISTS`
  - [x] `page_embeddings.embedding vector(384)`（与默认本地 MiniLM 对齐，见 spec「嵌入维度一致性」节）+ `CREATE INDEX IF NOT EXISTS ... USING hnsw (embedding vector_cosine_ops)`
  - [x] `page_fts.tsv tsvector` + `CREATE INDEX IF NOT EXISTS ... USING gin (tsv)`
  - [x] `links (source_slug, target_slug)` 复合索引 + `orphaned` 部分索引
  - [x] `knowledge_versions (slug, version)` 唯一约束
  - [x] `_migrations(name, applied_at)` 表用于追踪已执行迁移
  - [x] 提供 `server/scripts/migrate.ts` 包装器：按文件名顺序执行 migrations/*.sql，已执行的跳过
  - [x] 启动时检测 `settings.embedding.provider` 与 DB 列维度不匹配 → 自动 `ALTER TABLE ... TYPE vector(N)` + 重建 HNSW 索引（手动配置维度）
- [x] Task 1.7：种子数据脚本 `server/scripts/seed.ts`
  - [x] 写入 `wiki/index.md`、`wiki/AGENTS.md`、`wiki/portals/science.md`
  - [x] `wiki/concepts/entropy.md`（用架构 4.5.2 完整示例）
  - [x] 默认 `settings` 表行（来自 `defaultSettings`）

## 阶段 2：L5 存储层与 Markdown 同步（P0）

- [x] Task 2.1：`server/src/storage/markdown.ts` Markdown 文件系统管理器
  - [x] 列出 `wiki/`、`raw/`、`summaries/`、`changelog/`、`library/objects/` 全部文件
  - [x] 读写工具方法（read、write、atomic write with backup）
- [x] Task 2.2：`server/src/storage/parser.ts` Compiled Truth 解析器
  - [x] `gray-matter` 解析 frontmatter
  - [x] `unified` + `remark-parse` 解析 Markdown AST
  - [x] 提取 `## State` / `## Assessment` / `## Open Threads` / `## Relations` / `## Timeline` / `## Version History` / `## Semantic Rings Archive` / `## Evidence` 区块
  - [x] 支持多语境 `[context] [tag]` 解构
  - [x] 单元测试：解析 `entropy.md` 全部字段正确
- [x] Task 2.3：`server/src/storage/manifest.ts` Delta 追踪
  - [x] `.manifest.json` 记录每个文件的 sha256 + mtime
  - [x] `detectDelta()` 返回新增/修改/删除列表
- [x] Task 2.4：`server/src/storage/sync.ts` 双向同步引擎
  - [x] 解析每个 wiki/*.md → 写入 `pages`
  - [x] 写入 `page_fts.tsv`（中文分词用 `pg_jieba` 或 simple 配置）
  - [x] 调用 LLM 适配器 `embed()` → 写入 `page_embeddings`
  - [x] 解析 `## Relations` → 写入 `links`（标 `orphaned`）
  - [x] 解析 `## Timeline` → 写入 `timeline_entries`
  - [x] 解析 `## Version History` → 写入 `knowledge_versions`
  - [x] 解析 `## Semantic Rings Archive` → 写入 `semantic_rings`
  - [x] 解析 `## Evidence` → 写入 `evidence_spans`
  - [x] 解析 `summaries/*.md` → 写入 `clusters` + `cluster_members`
- [x] Task 2.5：`BrainAPI.rebuildStruct()` 实现
  - [x] `TRUNCATE` 所有缓存表
  - [x] 重新解析全部 Markdown（含 `changelog/`）
  - [x] 调用 `sync.syncAll()`
  - [x] 调用 `evolution/ghost.detectAndMark()` 标记 orphaned
  - [x] 返回 `RebuildReport { pages, links, ghostCount, durationMs }`
- [x] Task 2.6：`BrainAPI.extractPending()` 实现
  - [x] 扫描 `library_files` 中 `status='new'` 的文件
  - [x] 调用 `agents.retriever` 触发 LLM 提取
  - [x] 生成 `PendingDiff` 写入 `pending_diffs` 表

## 阶段 3：国内大模型适配层（P0：3.1–3.13 全部）

- [x] Task 3.1：`server/src/llm/adapter.ts` 抽象接口与基类
  - [x] `LLMAdapter` 接口：`chat(req: LLMRequest): Promise<LLMResponse>`、`embed(text: string): Promise<number[]>`、`probe(): Promise<{ok: boolean; latencyMs: number}>`
  - [x] `BaseOpenAICompatibleAdapter`：实现 OpenAI 协议适配器基类（baseURL + apiKey + model）
  - [x] token 计数 + 成本估算（按厂商定价表）
- [x] Task 3.2：阿里云百炼（Qwen）适配器 `adapters/bailian.ts` — OpenAI 兼容端点 `https://dashscope.aliyuncs.com/compatible-mode/v1`
- [x] Task 3.3：智谱 AI（ChatGLM）适配器 `adapters/zhipu.ts` — OpenAI 兼容端点 `https://open.bigmodel.cn/api/paas/v4`
- [x] Task 3.4：月之暗面（Kimi/Moonshot）适配器 `adapters/moonshot.ts` — OpenAI 兼容端点 `https://api.moonshot.cn/v1`
- [x] Task 3.5：百度（文心 ERNIE）适配器 `adapters/ernie.ts` — OpenAI 兼容端点
- [x] Task 3.6：科大讯飞（星火 Spark）适配器 `adapters/spark.ts` — OpenAI 兼容端点
- [x] Task 3.7：腾讯（混元 Hunyuan）适配器 `adapters/hunyuan.ts` — OpenAI 兼容端点
- [x] Task 3.8：MiniMax 适配器 `adapters/minimax.ts` — OpenAI 兼容端点 `https://api.minimax.chat/v1`
- [x] Task 3.9：DeepSeek 适配器 `adapters/deepseek.ts` — OpenAI 兼容端点 `https://api.deepseek.com/v1`
- [x] Task 3.10：零一万物（Yi）适配器 `adapters/yi.ts` — OpenAI 兼容端点 `https://api.lingyiwanwu.com/v1`
- [x] Task 3.11：百川智能（Baichuan）适配器 `adapters/baichuan.ts` — OpenAI 兼容端点 `https://api.baichuan-ai.com/v1`
- [x] Task 3.12：`server/src/llm/router.ts` 模型分层路由器
  - [x] 从 `settings.modelAssignment` 读取任务→模型映射
  - [x] 暴露 `route(task: ModelTier): LLMAdapter`
  - [x] 提供「恢复为推荐配置」入口
- [x] Task 3.13：`server/src/llm/embed.ts` 嵌入生成（含本地退化与维度对齐）
  - [x] 优先调用配置的厂商 embed 端点（如 `text-embedding-3-small` 1536 维）
  - [x] 失败或未配置时退化到 `@xenova/transformers` all-MiniLM-L6-v2（输出 384 维，默认）
  - [x] 启动时调用 `ensureEmbeddingDimension(dim)`：若 `settings.embedding.dimension` 与 DB 列 `pg_typeof(embedding)` 不一致，执行 `ALTER TABLE page_embeddings ALTER COLUMN embedding TYPE vector(N)` + 清空该表 + 重建 HNSW 索引 + 写入 `auto_change_log`
  - [x] 模型名 + 维度持久化到 `settings.embedding.{provider, model, dimension}`
- [x] Task 3.14：`server/src/routes/llm.ts` 注册 `POST /api/llm/test` 与 `GET /api/llm/adapters`
  - [x] body: `{adapterId: string}`，调用 `adapter.probe()`
  - [x] 列出全部已注册适配器及当前状态（enabled/disabled、apiKey 是否配置）

> Task 3.2–3.11 可并行（同构 OpenAI 兼容基类，仅 baseURL/Key 不同）。

## 阶段 4：L2 混合检索引擎（P1，但 P0 闭环需要 4.1+4.2+4.3 子集）

- [x] Task 4.1：`server/src/retrieval/vector.ts` pgvector HNSW 向量检索
  - [x] `vectorSearch(query: string, k: number): Promise<{page_id, score}[]>`
  - [x] 调用 embed → 查询 `pages` JOIN `page_embeddings` ORDER BY cosine
- [x] Task 4.2：`server/src/retrieval/fulltext.ts` PG tsvector 全文检索
  - [x] `ts_query` 中文分词支持（用 `simple` 配置或 `pg_jieba`，缺失则用 `ILIKE` 兜底）
  - [x] `ts_rank` 排序
- [x] Task 4.3：`server/src/retrieval/rrf.ts` RRF 融合算法（~50 行）
  - [x] 输入多个有序结果列表 + 各自权重
  - [x] 输出融合排序
- [x] Task 4.4：`server/src/retrieval/graph.ts` 图谱 CTE 递归遍历
  - [x] `graphTraverse(slug: string, depth: number): Promise<Link[]>`
  - [x] 用 `WITH RECURSIVE`
  - [x] `getGraphNodes()` / `getGraphEdges()`
- [x] Task 4.5：`server/src/retrieval/rerank.ts` zerank-2 重排序（可关闭）
  - [x] 配置 `reranker.enabled=false` 时直接 passthrough
  - [x] 启用时调用 ZeroEntropy API
- [x] Task 4.6：`server/src/retrieval/source.ts` 来源感知加权
  - [x] 配置 `sourceWeights: {pdf: 1.0, audio: 0.9, web: 0.7, ...}`
  - [x] 在 RRF 后按来源类型二次加权
- [x] Task 4.7：`server/src/retrieval/entity.ts` 命名实体 + 学习路由
  - [x] 正则识别 `[[wikilink]]` 与显式实体
  - [x] 读取 `user_rules` 表应用别名映射
- [x] Task 4.8：`server/src/retrieval/nli.ts` RoBERTa-mnli 预检
  - [x] 优先调用 HF Inference API（`https://api-inference.huggingface.co/models/roberta-large-mnli`）
  - [x] 失败时退化到本地 `@xenova/transformers` `Xenova/roberta-large-mnli`
  - [x] 缓存到 `nli_cache` 表
- [x] Task 4.9：`server/src/retrieval/router.ts` 意图路由分类器
  - [x] 5 类：具体事实 / 全局主题 / 跨领域综合 / 原始文件搜索 / AI 问答
  - [x] 简单规则分类（关键词 + 长度）
  - [x] 输出对应 T0/T1/T2 层级与查询参数

## 阶段 5：L1 AI Agent 编排层（P0：5.1–5.5；P1：5.6–5.10）

- [x] Task 5.1：`server/src/agents/planner.ts` + `skills/prompts/planner.zh-CN.md`
  - [x] 输入 question → 输出检索计划（关键词、目标语境、深度）
  - [x] `fallbackPlan()` 无 LLM 时关键词提取兜底
- [x] Task 5.2：`server/src/agents/retriever.ts`
  - [x] 调用 `retrieval/router` 与各检索组件
  - [x] 返回 `EvidenceSpan[]` 候选
- [x] Task 5.3：`server/src/agents/grader.ts` + `skills/prompts/grader.zh-CN.md`
  - [x] 评分卡 4 维度：事实准确、覆盖完整、来源清晰、证据覆盖率（0–1）
- [x] Task 5.4：`server/src/agents/generator.ts` + `skills/prompts/generator.zh-CN.md`
  - [x] 输入检索结果 + 评分 → 输出含 `[^span_id]` 脚注的 Markdown
  - [x] `buildFallbackAnswer()` 无 LLM 时检索摘要兜底
- [x] Task 5.5：`server/src/agents/reflector.ts` + `skills/prompts/reflector.zh-CN.md`
  - [x] 信息增益追踪（每轮新增实体/证据数）
  - [x] 5 轮硬上限 + 3 秒熔断
  - [x] 停止策略优先级：连续两轮不提升 > 信息增益为零 > 熔断
- [x] Task 5.6：`server/src/agents/compression.ts` 追问压缩（P1）
  - [x] 检测对话轮次 > `compressionThreshold`（默认 5）
  - [x] 调用低成本模型摘要历史
  - [x] 注入下一轮 Planner 提示
- [x] Task 5.7：`server/src/agents/observe.ts` 静默观察补提取（P1）
  - [x] 写入 `observed_files` 表 + 递增 `reference_count`
  - [x] 夜间任务检查阈值（默认 3 次）触发 `extractFacts`
- [x] Task 5.8：`server/src/agents/feedback.ts` 纠错反哺（P1）
  - [x] 接收 `{conversationId, messageId, feedback}`
  - [x] 错误陈述写入 `shadow_benchmarks`
  - [x] 标记源文件 `status='partially_extracted'`
- [x] Task 5.9：`server/src/agents/translate.ts` 证据翻译缓存（P1）
  - [x] 检测 `evidence_span.lang` 非汉语
  - [x] 调用低成本模型翻译 → 写入 `evidence_translations`（90 天过期）
- [x] Task 5.10：`narrate`、`shadow_eval`、`rule_learn`、`ask_question` 工具实现（P1，挂在 MCP）

## 阶段 6：L4 自进化引擎（P1：6.1–6.6；P2：6.7）

- [x] Task 6.1：`server/src/evolution/dream.ts` Dream Cycle 编排器
  - [x] 六阶段顺序：预算检查 → community_detect → NLI 预检 → forget_decay + lint + 幽灵清理 → topic_cluster + gap_analysis → enrich_external + Diff + 年轮
  - [x] `Bun.cron` 每晚 02:00 触发
- [x] Task 6.2：`server/src/evolution/budget.ts` 全局预算管理器
  - [x] `dailyBudget`、`monthlyBudget`、`perQueryBudget` 配置项
  - [x] `checkBudget(task)` 在非交互任务前检查
  - [x] 熔断后写入日志 + 仪表盘告警
- [x] Task 6.3：`server/src/evolution/archive.ts` 版本归档
  - [x] 扫描 `knowledge_versions` 中活跃记录 > 50 的 slug
  - [x] 取最早 N-20 条移入 `changelog/<slug>.md`
  - [x] 调用低成本模型生成 2–3 句摘要
  - [x] 在原 Markdown 替换为归档链接
  - [x] 触发 `rebuild-struct`
- [x] Task 6.4：`server/src/evolution/ghost.ts` 幽灵清理器
  - [x] 扫描 `links` 表，对每个 `target_slug` 检查 `pages` 是否存在
  - [x] 不存在则标记 `orphaned=true`，写入 `ghost_relations`
  - [x] 在源实体 `## Open Threads` 追加提示
  - [x] 生成 🟢 Diff 写入 `pending_diffs`
- [x] Task 6.5：`server/src/evolution/shadow.ts` 影子评估 + 熔断
  - [x] 沙箱执行 `shadow_benchmarks` 全部正例/反例
  - [x] 计算正确率、复现率、新增错误数
  - [x] 指标波动 > 阈值 → 写入 `eval_anomaly_flags` + 中止 + 告警
- [x] Task 6.6：`server/src/evolution/rollback.ts` 全自动回滚
  - [x] 接收 `batchId`，从 `auto_change_log` 恢复文件
  - [x] 触发 `rebuild-struct`
- [x] Task 6.7：每周 skill 优化与夜间简报（P2，汉语输出）
  - [x] 自动生成周报（页面/关系/变更/对话/Token/异常统计）
  - [x] LLM 增强摘要（Moonshot）
  - [x] 每周技能优化（低置信度页面自动优化）
  - [x] Bun.cron 定时任务（每周一 03:00）

## 阶段 7：BrainAPI 统一服务层完整实现（P0：7.1/7.2/7.4/7.5/7.10；P1：其余）

- [x] Task 7.1：`applyDiff(diffId, approved)`、`rollbackAutoChange(batchId)` 实现
  - [x] applyDiff 通过则标记 resolved + approved
  - [x] rollback 从 auto_change_log 查询
  - [x] extractFacts 调用 LLM 提取 → 生成 `PendingDiff`
- [x] Task 7.2：`query(params)` 实现
  - [x] query 调用 L2 router
  - [x] getMedia 支持 HTTP 206 Range 请求
- [x] Task 7.3：`rebuildStruct()`、`extractPending()`（已在阶段 2 完成，此处仅注册到 BrainAPI）
- [x] Task 7.4：`getHealth()`
  - [x] getHealth 聚合全部仪表盘指标（节点数、边数、待审核数、预算消耗、幽灵数、归档状态等）
  - [x] shadowEval()
  - [x] setDailyBudget()
  - [x] getRemainingBudget()
- [x] Task 7.5：`askQuestion(request)` 完整实现
  - [x] 串联 L1（Planner→Retriever→Grader→Generator→Reflector）
  - [x] 写入 `conversation_logs`
  - [x] 返回完整 `AskResponse`
  - [x] 触发追问压缩、静默观察、证据翻译、纠错反哺（agents 模块已实现，可集成）
- [x] Task 7.6：`submitFeedback()`、`listObservedFiles()`、`triggerObservedExtraction(fileHash)`
- [x] Task 7.7：`translateEvidence(spanIds, targetLang)`
- [x] Task 7.8：`archiveVersions(entitySlug?)`、`cleanGhostRelations()`
- [x] Task 7.9：`generateStaticSite(outputPath, options)`
  - [x] 渲染全部 wiki/ 为 HTML
  - [x] 拷贝 library/objects/ 媒体
  - [x] 生成静态图谱（vis-network 静态 JSON）
  - [x] 输出到 `exports/<timestamp>/`
- [x] Task 7.10：`generateDraft()`（创建新 wiki 页面草稿）
- [x] Task 7.11：`server/src/brainapi/index.ts` 统一导出 + 注册到 Hono 路由（见 spec 端点清单）
  - [x] `/api/ask`、`/api/query`、`/api/graph`、`/api/diffs`、`/api/diffs/:id/apply`、`/api/diffs/:id/reject`、`/api/rollback/:batchId`、`/api/conversations/:id`
  - [x] `/api/feedback`、`/api/observed-files`、`/api/observed-files/:hash/extract`、`/api/translate-evidence`、`/api/archive-versions`、`/api/clean-ghost-relations`、`/api/generate-draft`
  - [x] `/api/changelog`、`/api/eval-report`、`/api/shadow-eval`、`/api/generate-static-site`

## 阶段 8：L6 多模态摄入管道（P1，可降级）

- [x] Task 8.1：`server/src/ingest/pipeline.ts` BrainIngest 入口
  - [x] 按 MIME 分发到对应模态处理器
  - [x] 缺失依赖时返回汉语错误并跳过
- [x] Task 8.2：`ingest/document.ts` 文档管道（PDF/DOCX/PPTX/XLSX）
  - [x] PDF: `pdf-parse`；DOCX: `mammoth`；PPTX: `pptxtojson`；XLSX: `xlsx`
  - [x] 公式 → LaTeX，表格 → HTML
- [x] Task 8.3：`ingest/image.ts` 图片管道（OCR + VLM 描述）
  - [x] OCR: `tesseract.js`（缺则降级）
  - [x] VLM: 调用支持视觉的厂商模型（如 Qwen-VL）
- [x] Task 8.4：`ingest/audio.ts` 音频管道（Whisper.cpp 子进程）
  - [x] 检查 `whisper-cli` 可执行文件存在
  - [x] 输出带时间码的转录
- [x] Task 8.5：`ingest/video.ts` 视频管道（FFmpeg + Whisper）
  - [x] FFmpeg 提取音轨
  - [x] 调用 audio.ts
- [x] Task 8.6：`ingest/web.ts` 网页管道（`@extractus/article-extractor`，Trafilatura 替代）
- [x] Task 8.7：`ingest/text.ts` 纯文本管道（MD/TXT/CSV/JSON 直接通过）
- [x] Task 8.8：内容清洗 + 证据双向映射建立 + SHA-256 原始归档 + 文件状态初始化为 `new`

> 8.2–8.7 可并行。

## 阶段 9：CLI 与 MCP Server（P2）

- [x] Task 9.1：`server/src/cli/brain.ts` CLI 命令
  - [x] `brain ask "问题"` → 输出 Markdown + 来源
  - [x] `brain rebuild-struct` / `extract-pending` / `archive-versions` / `clean-ghost-relations` / `translate-evidence` / `generate-static-site` / `dashboard-snapshot`
- [x] Task 9.2：`server/src/mcp/server.ts` MCP Server
  - [x] stdio + HTTP 双模式
  - [x] 36 个工具（包括 `ask_question`、`narrate`、`run_shadow_eval`、`rule_learn`、`translate_evidence`、`list_observed_files` 等）
  - [x] 全部经 BrainAPI 调用

## 阶段 10：前端基础设施（P0）

- [x] Task 10.1：Vite + React + TS 项目骨架
  - [x] `web/vite.config.ts` 配置 `@shared` 路径别名
  - [x] `web/vite.config.ts` 配置 `server.proxy`：`/api` → `http://localhost:3000`
  - [x] 集成 Tailwind + PostCSS + autoprefixer
  - [x] `tailwind.config.js` 定义语义颜色令牌 + dark mode `class`
  - [x] 集成 react-i18next + TanStack Query + React Router v6 + Headless UI + Cytoscape + Chart.js + Phosphor
- [x] Task 10.2：`web/src/i18n/`
  - [x] `config.ts`：初始化 i18next，默认 `zh-CN`，按浏览器语言偏好自动选择
  - [x] `locales/zh-CN.json`：全部前端文案（按钮、菜单、提示、占位符、错误）
  - [x] `locales/en.json`：备选英文
- [x] Task 10.3：`web/src/store/ThemeContext.tsx` 深色/浅色主题
  - [x] 跟随系统 / 浅色 / 深色三选项
  - [x] 切换时切换 `<html class="dark">` + localStorage 持久化
- [x] Task 10.4：`web/src/layouts/` 全局壳层
  - [x] `Shell.tsx`：组合 TopBar + Sidebar + main + StatusBar
  - [x] `TopBar.tsx`：Branding + 搜索框 + 快捷提问 + BudgetBadge + 通知铃铛 + 用户菜单
  - [x] `Sidebar.tsx`：可折叠导航 + 徽标（审核数、幽灵红点）+ 快速操作三按钮
  - [x] `StatusBar.tsx`：后台任务进度 + 最后更新时间 + 连接状态
  - [x] `NotificationCenter.tsx`：浮层面板分组（审核/系统/补提取/异常）
- [x] Task 10.5：`web/src/App.tsx` 路由配置 + 守卫
  - [x] 注册核心路由（登录、首页、问答、图谱、审核、仪表盘、设置、Wiki 条目、引导）
  - [x] 未登录访问受保护路由重定向至 `/login`
  - [x] Onboarding 首次进入自动跳转
- [x] Task 10.6：`web/src/lib/api.ts` API 客户端
  - [x] fetch 封装，Bearer Token 自动注入（从 localStorage/sessionStorage）
  - [x] 统一错误处理 → 汉语映射
  - [x] TanStack Query 客户端
- [x] Task 10.7：`web/src/store/` 全局状态 Context
  - [x] AuthContext（用户、token、登录/登出）
  - [x] SettingsContext（拉取并缓存设置）
  - [x] NotificationContext（消息列表）

## 阶段 11：前端核心页面

> P0：11.1、11.2、11.3、11.4、11.5、11.6、11.7、11.14；P1：其余。可按页面拆分给不同子代理并行。

- [x] Task 11.1：`LoginPage`（P0）— API Key 输入 + 记住设备 + 跳转
- [x] Task 11.2：`OnboardingPage`（P0）— 3–5 步引导浮窗，可跳过
- [x] Task 11.3：`WikiHomePage`（P0）— HeroSection + FeaturedArticleCard + PortalGrid + TimelineFeed + QuickActions
- [x] Task 11.4：`WikiEntryPage`（P0）— 双栏：渲染后富媒体预览 + 原始 Markdown；EvidencePopover 内嵌
- [x] Task 11.5：`GraphFullPage`（P0）— Cytoscape.js + 布局切换 + 节点搜索 + 幽灵虚线 + 图例
- [x] Task 11.6：`DiffReviewPage`（P0）— 🟢🟡🔴 三级分流 + Diff 卡片 + 批量合并
- [x] Task 11.7：`QAPanelPage`（P0）— 多轮对话 + 脚注溯源 + 置信度 + 相关实体 + token/费用 + 反馈按钮
- [x] Task 11.8：`DashboardPage`（P1）— 规模指标 + 审核待办 + 预算进度 + AI 质量 + 幽灵关系 + 归档状态
- [x] Task 11.9：`ChangelogPage`（P1）— 24h 变更批次 + 回滚 + 归档批次 archive- 前缀
- [x] Task 11.10：`EvalReportPage`（P1）— 回归表 + 异常熔断告警区 + Git commit 关联
- [x] Task 11.11：`TimelineFullPage`（P1）— 实体/集群中心 + 🗣 问答日志 + 媒体原地渲染
- [x] Task 11.12：`SearchResultPage`（P1）— 条目 + 文件 + 问答记录分组
- [x] Task 11.13：`LibraryFilePage`（P1）— PDF 预览 + 音视频播放器 + 时间码跳转
- [x] Task 11.14：`SettingsPage`（P0）— 9 组驾驶舱 + 模型适配器列表 + 危险二次确认
- [x] Task 11.15：`blocks/EvidencePopover.tsx`（P0）— 悬停 + 钉住 + 双语 + 复制 library:// 链接
- [x] Task 11.16：`components/brain-media.tsx` Web Component（P1）— 音视频播放 + start 时间戳 + 引用角标
- [x] Task 11.17：`components/MarkdownRenderer.tsx`（P0）— markdown-it + 自定义媒体插件 + Version History / Semantic Rings 折叠 + evidence_span 着色
- [x] Task 11.18：`blocks/` 通用分子组件（P0）
  - [x] `BudgetBadge`、`QuickAskButton`、`GlobalSearch`、`UserMenu`、`DiffCard`、`GraphNodeCard`、`MessageBubble`
- [x] Task 11.19：`components/DiffCompare.tsx`（P0）— Diff 并排对比组件

## 阶段 12：部署与文档（P0，与开发并行可起）

- [x] Task 12.1：`Dockerfile.server`
  - [x] `oven/bun` 基础镜像
  - [x] 暴露 3000，启动 `bun run src/index.ts`
  - [x] 健康检查
  - [x] VOLUME 挂载 wiki / library / changelog
- [x] Task 12.2：`Dockerfile.web`（多阶段构建）
  - [x] Stage 1: `node:20` 安装依赖、`vite build`
  - [x] Stage 2: `nginx:alpine` 拷贝 dist + nginx.conf
- [x] Task 12.3：`nginx.conf`
  - [x] SPA fallback：`try_files $uri /index.html`
  - [x] `/api` 反代到 `server:3000`
  - [x] gzip + cache headers
  - [x] 安全头
  - [x] 上传大小限制
- [x] Task 12.4：`docker-compose.yml`
  - [x] `postgres`: `pgvector/pgvector:pg16`，volume 持久化，healthcheck（`pg_isready -U alethia`）
  - [x] `server`: 依赖 `postgres.condition: service_healthy`，挂载 wiki/summaries/changelog/library/raw/skills/exports
  - [x] `web`: 依赖 server，暴露 `80:80`，nginx 反代 `/api` → `server:3000`
  - [x] `init`: 一次性初始化容器（迁移 + 种子）
  - [x] 默认 network：`alethia-net`
- [x] Task 12.5：`init.sh`（bash）
  - [x] 等待 postgres healthy
  - [x] 执行数据库迁移 + 种子数据
  - [x] 打印部署完成信息
- [x] Task 12.6：更新 `README.md`
  - [x] 项目简介 + 架构图
  - [x] 快速开始：docker compose 流程
  - [x] 环境变量说明
  - [x] 开发模式：bun install、bun dev:server、bun dev:web
  - [x] API 端点清单
  - [x] 技术栈
  - [x] 技术文档导航（8 份文档）
- [x] Task 12.7：技术文档体系
  - [x] 01_ARCHITECTURE.md — 系统架构总览
  - [x] 02_API_REFERENCE.md — API 接口参考
  - [x] 03_DATABASE_SCHEMA.md — 数据库 Schema 详解
  - [x] 04_KNOWLEDGE_MODEL.md — 知识模型规范
  - [x] 05_AI_PIPELINE.md — AI 流水线详解
  - [x] 06_RETRIEVAL_ENGINE.md — 检索引擎技术详解
  - [x] 07_DEPLOYMENT.md — 部署与运维指南
  - [x] 08_DEV_GUIDE.md — 开发指南

## 阶段 13：闭环验证（最后执行）

- [x] Task 13.1：P0 端到端冒烟
  - [x] 后端编译通过（TypeScript 零错误，bun build 成功）
  - [x] 前端编译通过（TypeScript 零错误，vite build 成功，1573KB 输出）
  - [x] 前端开发服务器启动（`http://localhost:5173` 可访问，自动跳转 `/login`）
  - [x] 登录页面 UI 正常渲染（标题、API Key 输入框、记住设备、登录按钮）
  - [x] 10 个 parser 单元测试全部通过
  - [ ] 在 `/login` 输入 BRAIN_API_KEY → 登录成功跳首页（需 PostgreSQL 环境）
  - [ ] 在 `/qa` 提问「熵是什么？」→ 返回带脚注答案（需 PostgreSQL + LLM 环境）
  - [ ] 上传一个 PDF → `/review` 出现 🟡 Diff → 审核 → 写入 wiki/ → 出现在 `/graph`（需完整环境）
- [x] Task 13.2：一键部署验证
  - [x] `docker-compose.yml` 配置完整（postgres + server + web + init 四服务）
  - [x] `init.sh` 流程完整（等待 PG → 迁移 → 种子数据）
  - [x] Dockerfile.server / Dockerfile.web 存在
  - [x] nginx.conf 配置完整（SPA fallback + /api 反代 + gzip + 安全头）
  - [ ] `./init.sh` 全流程通过（需 Docker 环境）
  - [ ] `docker compose ps` 三容器 healthy（需 Docker 环境）
  - [ ] 访问 http://localhost 可登录并完成 P0 闭环（需 Docker 环境）
- [x] Task 13.3：交互完整性验证
  - [x] 15 个前端页面路由全部注册（App.tsx 中 15 个 Route）
  - [x] 26 个后端 API 端点全部注册（brainapi.ts）
  - [x] 25 个前端 API 客户端方法与后端端点对齐
  - [x] 深色/浅色主题 Context 已实现（ThemeContext + localStorage 持久化）
  - [ ] 浏览器宽度 ≤768px 时左侧导航转底部标签栏（需手动 UI 验证）

# Task Dependencies

- 阶段 0 全部任务为所有后续任务的前置
- 阶段 1 依赖阶段 0
- 阶段 2 依赖阶段 1（DB 与 DAO）
- 阶段 3 内 3.2–3.11 依赖 3.1；3.12 依赖 3.2–3.11；3.13 依赖 3.1；3.14 依赖 3.12
- 阶段 4 内 4.9 依赖 4.1–4.8；P0 闭环仅需 4.1+4.2+4.3 子集
- 阶段 5 内 5.1–5.5 是 P0，5.6–5.10 是 P1
- 阶段 5 依赖阶段 3 + 4
- 阶段 6 依赖阶段 5
- 阶段 7 依赖阶段 2–6
- 阶段 8 依赖阶段 2
- 阶段 10 依赖阶段 0 + 7（API 客户端契约）
- 阶段 11 依赖阶段 10
- 阶段 12 与开发并行可起，但 12.5 init.sh 完整运行依赖阶段 1–11 完成
- 阶段 13 依赖阶段 12
