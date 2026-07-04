# Checklist · Alethia v5.0 全栈构建

每项须在实现完成后逐一勾选。失败项须在 `tasks.md` 新增修复任务并重验证。

## 项目骨架与共享层
- [ ] 项目根目录结构（`server/`、`web/`、`shared/`）已建立，根 `package.json` workspace 配置可解析三个子包
- [ ] `shared/types/` 包含全部跨层类型，前后端 `import` 路径可解析
- [ ] `.env.example` 已包含 DB、`BRAIN_API_KEY`、十家厂商 API Key、模型分层、预算默认值全部字段

## 后端基础设施
- [ ] Bun HTTP 入口可启动，根路由 `/health` 返回 200
- [ ] 配置加载层可同时读取 `.env` 与 `.brain-config.yml`
- [ ] 全部错误消息与日志默认汉语，日志含 `lang` 字段
- [ ] Bearer Token 中间件：未带 Token 返回 401 + 汉语错误；正确 Token 放行
- [ ] DAO 抽象层封装 PG 连接，全部走 PG 标准 SQL 子集
- [ ] `0001_init.sql` 创建全部 v5.0 表（含 `conversation_logs`、`evidence_translations`、`ghost_relations`、`observed_files`、`eval_anomaly_flags` 五张新表）+ pgvector 扩展 + tsvector 列 + HNSW 索引
- [ ] 种子 wiki/index.md、AGENTS.md、portals 占位文件存在并可被解析

## L5 存储层与 Markdown 同步
- [ ] Markdown 文件系统全部目录（raw/wiki/summaries/changelog/library/skills/exports）已建立
- [ ] Compiled Truth 解析器可正确解析示例 entropy.md（State/Assessment/Threads/Relations/Timeline/Version History/Semantic Rings Archive/Evidence 全部区块）
- [ ] `.manifest.json` Delta 追踪可识别新增/修改/删除文件
- [ ] 双向同步可写入 pages、page_fts、page_embeddings、links、timeline_entries、knowledge_versions、clusters、semantic_rings、evidence_spans
- [ ] `rebuildStruct()` 可秒级重建并扫描幽灵关系
- [ ] `extractPending()` 可识别 `new` 状态文件

## 国内大模型适配层
- [ ] `LLMAdapter` 抽象接口与基类定义清晰（`chat`、`embed`、`probe` + token 计数 + 成本估算）
- [ ] 阿里云百炼（Qwen）适配器可成功调用 chat
- [ ] 智谱 AI（ChatGLM）适配器可成功调用 chat
- [ ] 月之暗面（Kimi/Moonshot）适配器可成功调用 chat
- [ ] 百度（文心 ERNIE）适配器可成功调用 chat
- [ ] 科大讯飞（星火 Spark）适配器可成功调用 chat
- [ ] 腾讯（混元 Hunyuan）适配器可成功调用 chat
- [ ] MiniMax 适配器可成功调用 chat
- [ ] DeepSeek 适配器可成功调用 chat
- [ ] 零一万物（Yi）适配器可成功调用 chat
- [ ] 百川智能（Baichuan）适配器可成功调用 chat
- [ ] 模型分层路由器可按任务类型路由到配置中分配的模型
- [ ] `POST /api/llm/test` 可返回连接状态与延迟

## L2 混合检索引擎
- [ ] pgvector HNSW 向量检索可返回 top-k 近似结果
- [ ] PG tsvector 全文检索支持中文分词
- [ ] RRF 融合算法可合并向量与全文排序
- [ ] 图谱 CTE 递归遍历可返回 N 跳邻居
- [ ] zerank-2 重排序可被启用/禁用（配置驱动）
- [ ] 来源感知可对不同来源类型加权
- [ ] 命名实体路由可读取 user_rules 表学习规则
- [ ] NLI 预检可命中 nli_cache，矛盾/中立才进入 LLM
- [ ] 意图路由分类器可区分 5 类查询，对应 T0/T1/T2 三层延迟

## L1 Agent 编排层
- [ ] Planner 可生成检索计划
- [ ] Retriever 可调用 L2 返回证据片段
- [ ] Grader 评分卡包含 4 个维度（含证据覆盖率 0–1）
- [ ] Generator 输出含 `[^span_id]` 脚注的 Markdown
- [ ] Reflector 在 5 轮或 3 秒后停止，日志记录终止原因
- [ ] 追问压缩在 5 轮后触发，UI 显示压缩状态
- [ ] 静默观察补提取计数达 3 次后夜间自动触发
- [ ] 纠错反哺可将错误陈述写入 shadow_benchmarks 并回退源文件状态
- [ ] 证据翻译结果缓存于 evidence_translations，90 天过期
- [ ] `narrate`、`shadow_eval`、`rule_learn`、`ask_question` 工具可被 MCP/CLI 调用

## L4 自进化引擎
- [ ] Dream Cycle 六阶段按顺序执行
- [ ] 全局预算管理器在日/月上限触达时熔断非交互式任务
- [ ] 版本历史归档在 >50 条时触发，生成摘要并移入 changelog/
- [ ] 幽灵关系清理可检测死链并生成 🟢 Diff
- [ ] 影子评估异常熔断在指标波动超阈值时中止并写入 eval_anomaly_flags
- [ ] 全自动写入回滚可恢复文件并触发 rebuild-struct
- [ ] 夜间简报为汉语输出

## BrainAPI 统一服务层
- [ ] 全部 20+ 接口已实现并通过简单调用测试
- [ ] `askQuestion()` 串联 L1 全链路并返回完整 AskResponse
- [ ] `getMedia()` 支持 HTTP 206 Range 请求
- [ ] `generateStaticSite()` 可输出可独立浏览的 HTML 站点

## L6 多模态摄入管道
- [ ] 文档（PDF/DOCX/PPTX/XLSX）可转 Markdown
- [ ] 图片可经 OCR + VLM 描述转文字
- [ ] 音频可经 Whisper.cpp 转带时间码转录
- [ ] 视频可经 FFmpeg + Whisper 转带时间戳文字
- [ ] 网页可经 Trafilatura 去广告/导航转干净 Markdown
- [ ] 纯文本直接通过
- [ ] 证据双向映射（source_text_offset + original_location）正确建立
- [ ] 原始文件 SHA-256 命名归档至 `library/objects/`，状态初始化为 `new`

## CLI 与 MCP Server
- [ ] `brain ask "问题"` 输出 Markdown + 来源
- [ ] `brain rebuild-struct` 可秒级重建并清理幽灵
- [ ] `brain archive-versions`、`clean-ghost-relations`、`translate-evidence`、`generate-static-site`、`dashboard-snapshot` 可执行
- [ ] MCP Server 支持 stdio + HTTP 双模式，35+ 工具全部经 BrainAPI 调用

## 前端基础设施
- [ ] Vite + React + TS 项目可 `bun dev` 启动
- [ ] Tailwind 主题令牌工作，深色/浅色切换正确并持久化到 localStorage
- [ ] `zh-CN.json` 默认加载，浏览器语言偏好可触发自动选择
- [ ] 全局壳层 Shell 含 TopBar、Sidebar（含幽灵红点）、StatusBar、NotificationCenter
- [ ] 路由守卫：未登录访问受保护路由重定向至 `/login`
- [ ] API 客户端自动注入 Bearer Token，统一错误处理为汉语

## 前端核心页面
- [ ] `LoginPage` 可输入 API Key 并登录
- [ ] `OnboardingPage` 3–5 步引导可跳过
- [ ] `WikiHomePage` Hero + Featured + Portal + Timeline + QuickActions 完整
- [ ] `WikiEntryPage` 双栏渲染 + EvidencePopover 内嵌
- [ ] `GraphFullPage` Cytoscape + 集群框 + 时间推演 + 幽灵虚线
- [ ] `DiffReviewPage` 🟢🟡🔴 三级分流 + 批量合并可用
- [ ] `QAPanelPage` 多轮对话 + 脚注双语 + 反馈按钮 + token/费用/压缩状态
- [ ] `DashboardPage` 全部仪表盘卡片 + 补提取观察列表
- [ ] `ChangelogPage` 24h 变更 + 回滚 + archive- 前缀归档批次
- [ ] `EvalReportPage` 回归表 + 异常熔断告警
- [ ] `TimelineFullPage` 实体/集群中心 + 🗣 问答日志
- [ ] `SearchResultPage` 条目/文件/问答分组
- [ ] `LibraryFilePage` PDF 预览 + 音视频播放 + 时间码跳转
- [ ] `SettingsPage` 9 组驾驶舱 + 模型分配拖拽 + 脏标记 + 即时校验 + 危险二次确认
- [ ] `EvidencePopover` 悬停 200ms + 钉住 + 双语 + 复制 library:// 链接
- [ ] `BrainMedia` Web Component 音视频播放 + start 时间戳 + 引用角标
- [ ] `MarkdownRenderer` 自定义媒体插件 + 历史区块折叠 + evidence_span 着色
- [ ] `BudgetBadge`、`QuickAskButton`、`GlobalSearch`、`UserMenu` 工作正常

## 部署与文档
- [ ] `Dockerfile.server` 多阶段构建可成功
- [ ] `Dockerfile.web` Vite build + Nginx 静态服务可成功
- [ ] `nginx.conf` SPA fallback + /api 反代 + 静态站点导出目录配置正确
- [ ] `docker-compose.yml` 三服务（postgres-pgvector + server + web）含健康检查与依赖顺序
- [ ] `init.sh` 可一键执行：检查 Docker → 复制 .env → 提示填 Key → 启动 → 初始化 → rebuild-struct → 打印地址
- [ ] `README.md` 含项目简介、L0–L8 架构图、快速开始、环境变量说明、常见问题

## 闭环验证
- [ ] 端到端冒烟测试通过：摄入 → 提取 → 审核 → 写回 → 图谱演化 → 问答证据
- [ ] `docker compose up` 一键启动成功，访问 http://localhost 可登录并使用
- [ ] 所有路由无死链接，所有按钮可点击
- [ ] 深色/浅色主题切换正确
- [ ] ≤768px 移动端响应式适配正确
