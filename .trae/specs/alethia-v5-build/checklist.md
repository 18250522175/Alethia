# Checklist · Alethia v5.0 全栈构建

每项须在实现完成后逐一勾选。失败项须在 `tasks.md` 新增修复任务并重验证。每项尽量给出可执行的验证命令或操作步骤。

## 项目骨架与共享层（P0）

- [ ] 根目录存在 `server/`、`web/`、`shared/` 三个子目录
- [ ] 根 `package.json` 含 `workspaces: ["shared","server","web"]`，且 `bun install` 在根目录可成功执行
- [ ] `tsconfig.base.json` 配置 `strict: true`、`paths: {"@shared/*": ["shared/types/*"]}`
- [ ] `server/package.json` 依赖列表完整（hono、kysely、pg、zod、pino、yaml、gray-matter、unified、remark-parse、@xenova/transformers、bun-types）
- [ ] `web/package.json` 依赖列表完整（react、react-dom、vite、react-router-dom、@tanstack/react-query、react-i18next、tailwindcss、@headlessui/react、@dnd-kit/core、cytoscape、chart.js、react-chartjs-2、@phosphor-icons/react、markdown-it、@floating-ui/react）
- [ ] `shared/types/` 全部 9 个类型文件存在并可被前后端 `import '@shared/...'` 解析
- [ ] `.env.example` 存在，包含 DB、BRAIN_API_KEY、十家厂商 API Key、嵌入、reranker、NLI 全部字段，每行带中文注释
- [ ] 验证命令：在根目录执行 `bun install` 与 `bun run --filter shared build`（或 `tsc -p shared`）应成功

## 后端基础设施（P0）

- [ ] `cd server && bun run dev` 可启动，`curl http://localhost:3000/health` 返回扩展状态 `{status:"ok"|"degraded", lang:"zh-CN", db:"connected", llm:"configured"|"none", embedding:"vendor"|"local", version:"5.0.0"}`
- [ ] DB 不可用时 `/health` 返回 `{status:"down", db:"disconnected"}` 而非崩溃
- [ ] `server/src/config/loader.ts` 可同时读取 `.env` 与 `.brain-config.yml`（手动放置一份 yaml 验证合并）
- [ ] Zod schema 校验通过 `defaultSettings`
- [ ] pino 日志输出包含 `lang: "zh-CN"` 字段
- [ ] 汉语错误码映射表覆盖 UNAUTHORIZED、FORBIDDEN、NOT_FOUND、VALIDATION_ERROR、BUDGET_EXCEEDED、LLM_UNAVAILABLE、INTERNAL 关键码
- [ ] `curl` 不带 Authorization 头访问 `/api/query` 返回 401 + 统一格式 `{error:{code:"UNAUTHORIZED", message:"未授权：缺失 API 密钥"}}`
- [ ] `curl -H "Authorization: Bearer $BRAIN_API_KEY"` 访问 `/api/query` 返回 200
- [ ] `/health`、`/api/auth/login`、`/api/llm/test` 三路径不强制认证
- [ ] DAO 抽象层封装 Kysely 实例，无任何 PGLite 专有语法
- [ ] `0001_init.sql` 全部 DDL 使用 `IF NOT EXISTS`，重复执行不报错（幂等性验证）
- [ ] `0001_init.sql` 在干净数据库执行成功，`psql -c "\dt"` 输出全部 24 张表 + `_migrations` 表
- [ ] `psql -c "SELECT extname FROM pg_extension"` 含 `vector`、`pg_trgm`
- [ ] `page_embeddings.embedding` 类型为 `vector(384)`（与默认本地 MiniLM 对齐），`page_fts.tsv` 类型为 `tsvector`
- [ ] HNSW 索引存在：`psql -c "\di idx_page_embeddings_hnsw"` 输出 `hnsw`
- [ ] GIN 索引存在：`psql -c "\di idx_page_fts_gin"` 输出 `gin`
- [ ] `_migrations` 表存在并记录已执行迁移：`psql -c "SELECT name FROM _migrations"` 至少含 `0001_init`
- [ ] `bun run db:migrate` 包装器幂等：二次执行不报错
- [ ] `bun run seed` 写入 `wiki/index.md`、`wiki/AGENTS.md`、`wiki/portals/science.md`、`wiki/concepts/entropy.md`，且 `settings` 表存在默认行
- [ ] `bun run seed` 幂等：二次执行检测种子已存在则跳过
- [ ] 验证命令：`psql -c "SELECT key,value FROM settings"` 返回至少一行默认配置
- [ ] 无厂商 API Key 时调用 `/api/ask` 返回 503 + `{error:{code:"LLM_UNAVAILABLE", message:"未配置可用的大模型适配器，请在设置页→集成中填入至少一个厂商 API Key"}}`
- [ ] DB 启动重试：手动 `docker compose stop postgres` 后启动 server，30s 内重试连接（日志可见「正在重试连接 PostgreSQL (N/30)...」）

## L5 存储层与 Markdown 同步（P0）

- [ ] `storage/markdown.ts` 可列出 `wiki/`、`raw/`、`summaries/`、`changelog/`、`library/objects/` 全部文件
- [ ] `storage/parser.ts` 解析 `wiki/concepts/entropy.md` 后正确提取 8 个区块字段，frontmatter `canonical_slug=entropy`、`contexts=[物理学, 信息论]` 正确
- [ ] `.manifest.json` 在种子写入后生成，包含 sha256 字段
- [ ] `manifest.detectDelta()` 在新增一个 wiki 文件后能正确返回 `added: [newSlug]`
- [ ] `storage/sync.ts` 执行后 `pages`、`page_fts`、`page_embeddings`、`links`、`timeline_entries`、`knowledge_versions`、`semantic_rings`、`evidence_spans`、`clusters`、`cluster_members` 表均有数据
- [ ] `rebuildStruct()` 在 `TRUNCATE pages` 后重新执行可恢复全部数据
- [ ] `rebuildStruct()` 执行后 `links.orphaned=true` 的死链被标记（手动添加一条指向不存在 slug 的关系验证）
- [ ] `rebuildStruct()` 返回 `RebuildReport` 含 `pages`、`links`、`ghostCount`、`durationMs`
- [ ] `extractPending()` 在添加 `status='new'` 的 library_files 后返回 `ExtractReport`

## 国内大模型适配层（P0：3.1–3.14 全部）

- [ ] `LLMAdapter` 接口与 `BaseOpenAICompatibleAdapter` 基类定义清晰
- [ ] `adapters/bailian.ts` 存在，baseURL 指向 `https://dashscope.aliyuncs.com/compatible-mode/v1`
- [ ] `adapters/zhipu.ts` 存在，baseURL 指向 `https://open.bigmodel.cn/api/paas/v4`
- [ ] `adapters/moonshot.ts` 存在，baseURL 指向 `https://api.moonshot.cn/v1`
- [ ] `adapters/ernie.ts` 存在，使用 `@baiducloud/qianfan` SDK
- [ ] `adapters/spark.ts` 存在，使用 ws 协议封装
- [ ] `adapters/hunyuan.ts` 存在，使用腾讯云 SDK
- [ ] `adapters/minimax.ts` 存在，baseURL 指向 `https://api.minimax.chat/v1`
- [ ] `adapters/deepseek.ts` 存在，baseURL 指向 `https://api.deepseek.com/v1`
- [ ] `adapters/yi.ts` 存在，baseURL 指向 `https://api.lingyiwanwu.com/v1`
- [ ] `adapters/baichuan.ts` 存在，baseURL 指向 `https://api.baichuan-ai.com/v1`
- [ ] 在 `.env` 填入 DeepSeek API Key 后，调用 `adapter.probe()` 返回 `{ok:true, latencyMs:<number>}`
- [ ] `llm/router.ts` `route('chat')` 返回配置中分配的适配器实例
- [ ] 「恢复为推荐配置」可重置 `settings.modelAssignment` 为默认值
- [ ] `llm/embed.ts` 在厂商 embed 不可用时退化到 `@xenova/transformers` all-MiniLM-L6-v2，返回 384 维向量
- [ ] 启动时 `ensureEmbeddingDimension()` 检测：将 `settings.embedding.dimension` 从 384 改为 1536 后重启 server，DB 列自动 `ALTER TYPE vector(1536)`，`page_embeddings` 表被清空，HNSW 索引重建，`auto_change_log` 出现「嵌入维度已变更 384→1536」记录
- [ ] 维度变更后调用 `rebuild-struct` 可重新生成全部 embedding（384 或 1536 与配置一致）
- [ ] `POST /api/llm/test` body `{adapterId:"deepseek"}` 返回 `{ok:true, latencyMs:...}`
- [ ] `GET /api/llm/adapters` 返回 10 个适配器及 enabled/disabled 状态
- [ ] 无任何厂商 API Key 时 `GET /api/llm/adapters` 返回全部 `enabled:false`
- [ ] `/health.llm="none"` 当无任何适配器启用

## L2 混合检索引擎（P1，P0 闭环仅需子集）

- [ ] `vector.ts` 输入「熵」查询返回 top-k 相关页面（embedding 已生成时）
- [ ] `fulltext.ts` 输入「熵」执行 `to_tsquery('simple', '熵')` 返回匹配页面
- [ ] `rrf.ts` 单元测试：两个有序列表融合后排序合理
- [ ] `graph.ts` `graphTraverse('entropy', 2)` 返回 2 跳邻居
- [ ] `rerank.ts` 配置 `reranker.enabled=false` 时直接返回输入
- [ ] `rerank.ts` 配置 `reranker.enabled=true` 且 `ZERANK_API_KEY` 有效时调用 ZeroEntropy API
- [ ] `source.ts` 按 `sourceWeights` 配置加权
- [ ] `entity.ts` 识别 `[[entropy]]` 与读取 `user_rules` 表
- [ ] `nli.ts` 缓存命中：第二次相同输入直接读 `nli_cache` 表
- [ ] `nli.ts` HF 不可用时退化到本地 transformers.js（不抛错）
- [ ] `router.ts` 5 类意图分类正确：「什么是熵」→ 具体事实；「物理学领域全貌」→ 全局主题；「熵与信息论的关系」→ 跨领域综合；「找原始 PDF」→ 原始文件搜索；「问答」→ AI 问答

## L1 AI Agent 编排层（P0：5.1–5.5；P1：5.6–5.10）

- [ ] `agents/planner.ts` 输入 question 返回检索计划 JSON
- [ ] `skills/prompts/planner.zh-CN.md` 内容为汉语
- [ ] `agents/retriever.ts` 返回 `EvidenceSpan[]`
- [ ] `agents/grader.ts` 评分卡输出 4 维度评分（含 `evidenceCoverage` 0–1）
- [ ] `skills/prompts/grader.zh-CN.md` 内容为汉语
- [ ] `agents/generator.ts` 输出含 `[^span_id]` 脚注的 Markdown
- [ ] `skills/prompts/generator.zh-CN.md` 内容为汉语
- [ ] `agents/reflector.ts` 在 5 轮后强制停止，日志记录「达到反思轮次上限」
- [ ] `agents/reflector.ts` 在 3 秒后强制停止，日志记录「达到反思时间上限」
- [ ] `agents/reflector.ts` 信息增益连续两轮为 0 时停止
- [ ] `agents/compression.ts` 在对话 >5 轮后触发摘要，返回压缩历史
- [ ] `agents/observe.ts` 写入 `observed_files` 表，`reference_count` 递增
- [ ] `agents/feedback.ts` 接收纠错反馈后写入 `shadow_benchmarks`，源文件状态变为 `partially_extracted`
- [ ] `agents/translate.ts` 非汉语 evidence_span 触发翻译并写入 `evidence_translations` 表，过期时间 90 天

## L4 自进化引擎（P1：6.1–6.6；P2：6.7）

- [ ] `evolution/dream.ts` 六阶段按顺序执行，每阶段日志输出汉语
- [ ] `Bun.cron` 注册 `0 2 * * *` 触发 Dream Cycle
- [ ] `evolution/budget.ts` 日预算触达后非交互任务返回 `{allowed:false, reason:"日预算已耗尽"}`
- [ ] 预算熔断时仪表盘 `getHealth().budgetExceeded=true`
- [ ] `evolution/archive.ts` 在 `knowledge_versions` 活跃记录 >50 的 slug 上执行归档，生成 `changelog/<slug>.md`
- [ ] 归档后原 Markdown `## Version History` 底部出现归档链接 `> 较早的 N 条版本历史已归档至 [[changelog/<slug>]]`
- [ ] 归档后 `rebuild-struct` 重建 `knowledge_versions` 包含 changelog 中的记录
- [ ] `evolution/ghost.ts` 在添加死链后扫描发现 `orphaned=true`，写入 `ghost_relations` 表
- [ ] 源实体 `## Open Threads` 自动追加「关系 [[已删除实体]] 的目标不存在」
- [ ] 生成 🟢 Diff 写入 `pending_diffs` 表，tier='green'
- [ ] `evolution/shadow.ts` 执行返回 `EvalReport`，含正确率、复现率、新增错误数
- [ ] 指标波动超阈值时写入 `eval_anomaly_flags`，仪表盘显示告警
- [ ] `evolution/rollback.ts` 接收 batchId 后恢复文件并触发 `rebuild-struct`
- [ ] 夜间简报输出汉语 Markdown

## BrainAPI 统一服务层（P0：7.1/7.2/7.4/7.5/7.10；P1：其余）

- [ ] `POST /api/extract` body `{filePath:'raw/test.md'}` 返回 `PendingDiff[]`
- [ ] `POST /api/diff/:id/apply` body `{approved:true}` 返回 `ApplyResult`
- [ ] applyDiff 通过后 wiki/ 文件被修改且 Version History 追加新版本
- [ ] `POST /api/query` body `{query:'熵',intent:'factual'}` 返回 `QueryResult`
- [ ] `GET /api/media/<hash>` 返回 200 + 内容
- [ ] `GET /api/media/<hash>` with `Range: bytes=0-1023` 返回 206 + 范围内容
- [ ] `POST /api/rebuild-struct` 返回 `RebuildReport`
- [ ] `GET /api/health-dashboard` 返回 `HealthDashboard`，包含节点数、边数、待审核数、预算消耗、幽灵数、归档状态
- [ ] `POST /api/budget` body `{daily:10}` 设置后 `GET /api/budget` 返回 `{daily:10, monthly:50}`
- [ ] `POST /api/ask` body `{question:'熵是什么？'}` 返回 `AskResponse`，含 answer、sources、confidence、tokensUsed
- [ ] `POST /api/ask` 在多轮对话后 `compressedHistory=true`
- [ ] `POST /api/ask` 引用非汉语 evidence 时 `translatedSources` 不为空
- [ ] `PUT /api/feedback` body `{conversationId, messageId, feedback:{type:'wrong',span:'错误陈述'}}` 返回 200
- [ ] `GET /api/observed-files` 返回观察列表
- [ ] `POST /api/observed-files/<hash>/extract` 触发提取
- [ ] `POST /api/translate` body `{spanIds:['span1'], targetLang:'zh-CN'}` 返回 `TranslationResult`
- [ ] `POST /api/archive` body `{slug:'entropy'}` 返回 `ArchiveReport`
- [ ] `POST /api/ghost/clean` 返回 `GhostReport`
- [ ] `POST /api/static-site` body `{outputPath:'exports/test'}` 在 `exports/test/` 生成 HTML 站点
- [ ] 生成的静态站点可独立用浏览器打开（无后端服务也能浏览）
- [ ] `POST /api/settings` body `{section:'language', values:{translateEvidence:true}}` 更新配置
- [ ] `GET /api/settings` 返回完整 Settings JSON

## L6 多模态摄入管道（P1，可降级）

- [ ] `ingest/pipeline.ts` 按 MIME 分发到对应处理器
- [ ] 上传一个 PDF → 转 Markdown，`library/objects/` 出现 SHA-256 命名文件
- [ ] 上传一个 DOCX → 转 Markdown
- [ ] 上传一个 PPTX → 转 Markdown
- [ ] 上传一个 XLSX → 转 Markdown（表格 HTML）
- [ ] 上传一个图片 → OCR + VLM 描述返回文字
- [ ] 上传一个 MP3 → Whisper 转录带时间码
- [ ] 上传一个 MP4 → FFmpeg + Whisper 转录带时间码
- [ ] 提交一个 URL → Trafilatura 返回干净 Markdown
- [ ] 上传一个 .md 文件 → 直接通过
- [ ] Whisper/FFmpeg 未安装时上传对应文件返回汉语错误 `{error:"未安装 whisper-cli，无法处理音频"}` 且不阻塞其他模态
- [ ] 证据双向映射：`source_text_offset` 与 `original_location` 同时写入 `evidence_spans`
- [ ] 文件状态初始化为 `new`

## CLI 与 MCP Server（P2）

- [ ] `brain ask "什么是熵？"` 输出 Markdown + 来源列表
- [ ] `brain rebuild-struct` 返回 `RebuildReport`
- [ ] `brain archive-versions --slug=entropy` 执行归档
- [ ] `brain clean-ghost-relations` 执行清理
- [ ] `brain translate-evidence --clean-expired` 清理过期翻译缓存
- [ ] `brain generate-static-site ./output` 在 output 生成 HTML
- [ ] `brain dashboard-snapshot` 输出仪表盘摘要
- [ ] MCP Server stdio 模式可被 Claude/Codex 客户端连接
- [ ] MCP Server HTTP 模式监听端口，可被远程调用
- [ ] MCP 35+ 工具全部经 BrainAPI 调用（不绕过统一服务层）

## 前端基础设施（P0）

- [ ] `cd web && bun install` 成功
- [ ] `bun dev` 启动后访问 http://localhost:5173 显示登录页
- [ ] `tailwind.config.js` 含 `darkMode: 'class'` 与语义颜色令牌
- [ ] 切换主题时 `<html class="dark">` 正确添加/移除，刷新后保留（localStorage 持久化）
- [ ] `zh-CN.json` 默认加载，所有按钮文案显示为汉语
- [ ] 浏览器语言设为 en 时仍加载 `zh-CN`（因为默认配置覆盖）
- [ ] 全局壳层 Shell 渲染 TopBar、Sidebar、StatusBar、NotificationCenter
- [ ] Sidebar 含全部导航项，审核徽标显示数量
- [ ] Sidebar 在存在 `ghost_relations` 时显示红色幽灵图标
- [ ] StatusBar 显示服务连接状态（绿点在线）
- [ ] 未登录访问 `/` 自动跳转 `/login`
- [ ] 登录成功后跳转回原访问路径
- [ ] 首次登录后跳转 `/onboarding`，引导可跳过
- [ ] API 客户端 fetch 自动注入 `Authorization: Bearer <token>`
- [ ] 后端返回 401 时前端自动跳转登录页
- [ ] TanStack Query 客户端配置全局 staleTime 与 retry

## 前端核心页面（P0：11.1/2/3/4/5/6/7/14/15/17/18/19；P1：其余）

- [ ] `/login` 输入正确 API Key 后跳转首页；错误时显示「密钥无效，请重试」
- [ ] `/onboarding` 3–5 步引导浮窗可点击下一步/上一步/跳过
- [ ] `/` WikiHomePage 显示 Hero、FeaturedArticleCard、PortalGrid、TimelineFeed、QuickActions
- [ ] 点击 FeaturedArticleCard 跳转 `/wiki/concepts/entropy`
- [ ] 点击 PortalGrid 卡片跳转 `/wiki/portals/science`
- [ ] 点击 TimelineFeed 条目跳转对应实体
- [ ] `/wiki/*` 双栏布局：左侧渲染后富媒体预览，右侧 Markdown 源
- [ ] EvidencePopover 悬停 200ms 出现，点击钉住
- [ ] EvidencePopover 默认显示汉语译文，可展开原文
- [ ] `/graph` Cytoscape 图谱渲染，节点可拖动，集群框显示
- [ ] 时间推演滑块可拖动改变图谱状态
- [ ] 死链显示为虚线
- [ ] `/review` 三级分流 🟢🟡🔴 显示，颜色正确
- [ ] 🟢 批量区可一键「全部合并」
- [ ] 🟡 预览区可逐条预览后合并/拒绝
- [ ] 🔴 重点区强制逐个确认
- [ ] DiffCompare 组件并排对比，evidence_span 双语原文框显示
- [ ] `/qa` 多轮对话界面，输入问题返回带脚注的答案
- [ ] 答案脚注可点击弹出 EvidencePopover
- [ ] 答案下方有「回答有误」与「有帮助」按钮
- [ ] 顶部显示 token 消耗、预估费用、压缩状态
- [ ] 压缩时可展开完整历史
- [ ] `/dashboard` 全部仪表盘卡片渲染
- [ ] 补提取观察列表显示文件、引用次数、状态
- [ ] 「立即提取」按钮触发 `triggerObservedExtraction`
- [ ] `/changelog` 显示 24h 内全自动写入批次
- [ ] 归档批次以 `archive-` 前缀标识
- [ ] 每批次有「回滚」按钮，点击后二次确认并执行
- [ ] `/evaluation` 回归结果表格显示正确率、复现率、新增错误数
- [ ] 异常熔断告警区在触发熔断时醒目展示
- [ ] `/timeline` 以实体为中心的时间线叙事
- [ ] 🗣 问答日志图标可点击查看对话详情
- [ ] `/search?q=熵` 返回条目、文件、问答记录三组结果
- [ ] `/library/:hash` PDF 预览，音视频播放器
- [ ] 时间码跳转：点击 evidence_span 跳转到对应时间
- [ ] `/settings` 9 组设置驾驶舱显示
- [ ] 子导航点击切换右侧表单
- [ ] 修改任意字段后子导航出现黄色脏标记
- [ ] 「保存所有更改」按钮显示「有 N 处更改」
- [ ] 点击保存后调用 `PATCH /api/settings` 成功后显示「设置已保存」
- [ ] 「重置」按钮二次确认后恢复上次保存的值
- [ ] 「恢复默认」每个卡片右下角链接，点击后只重置该卡片字段
- [ ] 模型分配拖拽：可拖动模型标签到任务槽
- [ ] 「恢复为推荐配置」按钮可重置模型分配
- [ ] 危险操作（重置 API Key、清空缓存、强制重建）二次确认
- [ ] 即时校验：正则输入框失焦后立即验证并显示错误
- [ ] EvidencePopover 在所有出现 `[^span_id]` 的地方（条目、问答、Diff）均可触发
- [ ] BrainMedia Web Component 可播放音视频
- [ ] BrainMedia 支持跳转 start 时间戳
- [ ] 引用角标点击可复制 `library://<hash>` 链接
- [ ] MarkdownRenderer 识别 `library://` 链接并替换为 `<brain-media>`
- [ ] Version History 与 Semantic Rings Archive 区块可折叠/展开
- [ ] evidence_span 着色（不同来源类型不同颜色）
- [ ] BudgetBadge 圆形进度环 + 金额文本，颜色按消耗比例变化
- [ ] QuickAskButton 点击弹出迷你提问浮层
- [ ] GlobalSearch 输入关键词实时下拉显示条目、文件、问答结果
- [ ] UserMenu 下拉菜单含外观/帮助/设置/退出登录

## 部署与文档（P0，12.1–12.6）

- [ ] `docker build -f Dockerfile.server -t alethia-server .` 成功
- [ ] `docker build -f Dockerfile.web -t alethia-web .` 成功
- [ ] `nginx.conf` 含 `try_files $uri /index.html` 与 `/api` 反代到 `server:3000`
- [ ] `docker compose up -d` 启动三容器（postgres、server、web）
- [ ] `docker compose ps` 三容器均为 healthy
- [ ] `docker compose exec postgres psql -U alethia -c "\dt"` 输出全部 24 张表
- [ ] `docker compose` 仅 `web` 暴露 80 端口到宿主，`server` 与 `postgres` 不映射端口（安全默认）
- [ ] `./init.sh` 全流程通过，最后打印「✅ 部署完成！访问 http://localhost 开始使用」「默认密钥：$BRAIN_API_KEY」
- [ ] **幂等性验证**：`docker compose down -v && ./init.sh` 二次执行成功（无报错、最终 healthy）
- [ ] 访问 http://localhost 显示登录页
- [ ] 在浏览器中填入 BRAIN_API_KEY 后登录成功
- [ ] **降级模式验证**：未填任何厂商 API Key 时，登录后访问 `/qa` 显示空状态提示「未配置大模型，请前往设置→集成填入 API Key」
- [ ] `README.md` 含项目简介（≥3 段）
- [ ] README 含 L0–L8 ASCII 架构图
- [ ] README 含「快速开始」章节，描述 `./init.sh` 流程
- [ ] README 含「环境变量说明」表格，按 `.env.example` 顺序逐项说明
- [ ] README 含「常见问题」章节：重置密钥、切换模型、清理幽灵、导出静态站点、嵌入维度变更
- [ ] README 含「开发模式」章节：`bun install`、`bun dev:server`、`bun dev:web`
- [ ] README 含「降级行为」表格：列出各依赖缺失时的行为

## 闭环验证（最后执行 · P0 验收硬性标准）

以下 8 项全部通过才算 P0 闭环完成（见 spec「P0 验收硬性标准」节）：

- [ ] **P0-1 一键启动**：`./init.sh` 在干净环境（仅装 Docker）一键跑通，最后输出访问地址
- [ ] **P0-2 登录页可达**：浏览器访问 `http://localhost` 显示登录页
- [ ] **P0-3 登录成功**：输入 `BRAIN_API_KEY` 后登录成功，跳转首页
- [ ] **P0-4 种子 wiki 显示**：首页显示 `index.md`、`portals/science.md`、`concepts/entropy.md`
- [ ] **P0-5 图谱节点**：`/graph` 显示至少 3 个节点（熵、热力学、信息论）与对应边
- [ ] **P0-6 LLM 测试连接**：在 `.env` 填入任一厂商 API Key 后，`/settings` 点击「测试连接」返回成功
- [ ] **P0-7 问答闭环**：在 `/qa` 提问「熵是什么？」返回带 `[^span-xxx]` 脚注的答案，脚注可弹出 EvidencePopover
- [ ] **P0-8 幂等性**：`docker compose down -v && ./init.sh` 可重复执行

补充验证项：
- [ ] **端到端冒烟**：`bun dev:server` + `bun dev:web` 全部启动
- [ ] 上传一个 PDF（通过 `/api/ingest` 或前端上传）→ `/review` 出现 🟡 Diff
- [ ] 审核 Diff → 写入 `wiki/concepts/<新实体>.md`
- [ ] `/graph` 出现新实体节点
- [ ] **一键部署验证**：`./init.sh` 全流程通过
- [ ] `docker compose ps` 三容器 healthy
- [ ] 访问 http://localhost 可登录并完成 P0 闭环
- [ ] **交互完整性**：所有 14 个路由无死链接
- [ ] 所有按钮可点击且有效果
- [ ] 深色/浅色切换持久化到 localStorage 并刷新后保留
- [ ] 浏览器宽度 ≤768px 时左侧导航转底部标签栏
- [ ] 全部错误消息显示为汉语（如未授权访问、上传失败等）
- [ ] **零配置启动验证**：删除 `.env` 中所有厂商 API Key，仅保留 `BRAIN_API_KEY`，`./init.sh` 仍能跑通，`/health` 返回 `degraded`，前端可登录并浏览种子 wiki
