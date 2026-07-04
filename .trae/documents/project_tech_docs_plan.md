# Alethia AI 知识库 v5.0 技术文档生成计划（细化版）

## 一、项目调研结论

**项目名称**：Alethia AI 知识库 v5.0（认知共生版）
**代码仓库**：Monorepo 结构（shared + server + web）
**总文件数**：后端 50+ TS 文件，前端 30+ TSX 文件，共享类型 9 个模块

### 模块细粒度清单

| 层级 | 模块 | 子模块/文件 | 行数级 |
|------|------|-------------|--------|
| L0 用户交互 | 前端路由 | 15 个页面（登录/问答/审核/图谱/仪表盘/设置/Wiki/时间线/搜索/图书馆/变更日志/评估报告/引导/首页） | ~5K 行 |
| L0 用户交互 | 前端组件 | 8 个 blocks + 3 个 components + 4 个 layouts + 3 个 contexts | ~3K 行 |
| L0.5 服务层 | BrainAPI | 26+ 方法（问答/审核/图谱/设置/预算/进化/图书馆/搜索/时间线/静态站点） | ~1K 行 |
| L1 Agent 层 | 核心 Agent | Planner / Retriever / Grader / Generator / Reflector | ~1.5K 行 |
| L1 Agent 层 | 扩展 Agent | Compression / Observe / Feedback / Translate | ~800 行 |
| L2 检索层 | 检索模块 | Vector / Fulltext / RRF / Graph / Router / Source | ~1.2K 行 |
| L2 检索层 | 增强模块 | Rerank (ZeroEntropy) / Entity (NER+Rules) / NLI (RoBERTa) | ~800 行 |
| L3 知识模型 | 存储模块 | Parser / Markdown / Sync / Summary / Manifest | ~1.5K 行 |
| L4 进化引擎 | 进化模块 | Dream / Ghost / Archive / Rollback / Shadow / Budget / Weekly | ~2K 行 |
| L5 存储层 | 数据库 | Pool / Dimension / Migration / 24 张表 | ~500 行 |
| L6 摄入管道 | 摄入模块 | Document / Image / Audio / Video / Web / Text / Clean / Pipeline | ~1.5K 行 |
| LLM 适配 | 10 家适配器 | Bailian / Zhipu / Moonshot / Ernie / Spark / Hunyuan / MiniMax / DeepSeek / Yi / Baichuan | ~2K 行 |
| 工具链 | CLI + MCP | brain CLI (9 命令) + MCP Server (36 工具) | ~1.5K 行 |

---

## 二、要生成的技术文档（细化为 8 份）

### 文档 1：`docs/01_ARCHITECTURE.md` — 系统架构总览
**详细程度**：深入到每个子模块的职责和交互

1. **设计哲学与核心原则**
   - 认知共生（人类 + AI 共同进化）
   - 全汉化（界面/日志/提示词/证据）
   - 长期可维护（归档/幽灵清理/影子评估）
   - 人类掌权（Diff 审核 / 可回滚 / 不自动写入 State）
   - Markdown 即真相源（DB 纯缓存池）

2. **架构分层详解（L0 - L7）**
   - L0 用户交互层：15 页面 + 8 blocks + 布局系统
   - L0.5 统一服务层：BrainAPI 26 方法全景
   - L1 AI Agent 编排层：五阶段流水线 + 四扩展
   - L2 混合检索层：五路检索 + RRF 融合 + 三重增强
   - L3 知识模型层：Compiled Truth 八区段规范
   - L4 自进化引擎：Dream Cycle 六阶段 + 预算 + 归档
   - L4.5 影子评估：基准测试 + 异常熔断
   - L5 存储层：Markdown FS + PostgreSQL + pgvector
   - L6 多模态摄入：8 种输入格式管道
   - L7 可视化层：图谱 + 时间线 + 仪表盘

3. **核心数据流**
   - 用户提问 → 回答生成的完整链路（配时序图）
   - 知识摄入 → 审核 → 写入 → 反哺的完整链路
   - Dream Cycle 六阶段执行流程图

4. **模块依赖关系图**
   - 后端模块依赖拓扑
   - 前后端 API 映射表

---

### 文档 2：`docs/02_API_REFERENCE.md` — API 接口参考
**详细程度**：每个端点都有完整的请求/响应字段说明和示例

1. **鉴权方式**
   - Bearer Token 机制
   - BRAIN_API_KEY 配置
   - 错误响应格式

2. **健康检查端点**
   - `GET /health` — 完整健康指标（节点数/边数/待审核/预算/幽灵/归档）

3. **认证端点**
   - `POST /api/auth/login` — API Key 登录
   - `POST /api/auth/logout` — 登出

4. **问答端点（6 个）**
   - `POST /api/ask` — 提问（流式/非流式）
   - `GET /api/ask/history` — 对话历史
   - `DELETE /api/ask/history/:id` — 删除对话
   - `POST /api/ask/feedback` — 反馈（点赞/踩）
   - `GET /api/ask/sessions` — 会话列表
   - `GET /api/ask/sessions/:id` — 会话详情

5. **审核端点（4 个）**
   - `GET /api/review/diffs` — Diff 列表（按 tier 分组）
   - `POST /api/review/diffs/:id/approve` — 批准
   - `POST /api/review/diffs/:id/reject` — 拒绝
   - `POST /api/review/batch-approve` — 批量批准🟢

6. **图谱端点（3 个）**
   - `GET /api/graph` — 图谱数据（Cytoscape 格式）
   - `GET /api/graph/nodes/:slug` — 节点详情
   - `GET /api/graph/search` — 图谱搜索

7. **设置端点（5 个）**
   - `GET /api/settings` — 获取全部设置
   - `PUT /api/settings` — 更新设置
   - `POST /api/settings/daily-budget` — 设置日预算
   - `GET /api/budget/remaining` — 剩余预算
   - `GET /api/budget/alerts` — 预算告警

8. **进化端点（4 个）**
   - `POST /api/evolution/dream` — 触发 Dream Cycle
   - `GET /api/changelog` — 变更日志（24h 批次）
   - `POST /api/changelog/rollback/:batchId` — 回滚批次
   - `GET /api/eval-report` — 评估报告

9. **图书馆端点（3 个）**
   - `GET /api/library-files` — 文件列表
   - `GET /api/library-files/:hash` — 文件元数据
   - `GET /api/library-files/:hash/content` — 文件内容（Range 支持）

10. **其他端点**
    - `GET /api/search` — 全局搜索（Wiki/实体/文件三标签）
    - `GET /api/timeline` — 实体时间线（无限滚动）
    - `GET /api/wiki/:slug` — Wiki 页面
    - `PUT /api/wiki/:slug` — 更新 Wiki 页面
    - `POST /api/generate-static-site` — 生成静态站点
    - `POST /api/shadow-eval` — 影子评估

11. **前端 API 客户端使用示例**
    - `api.ask()` / `api.getDiffs()` / `api.getGraph()` 等调用示例

---

### 文档 3：`docs/03_DATABASE_SCHEMA.md` — 数据库 schema 详解
**详细程度**：24 张表逐表说明，字段、索引、关系

1. **核心表（8 张）**
   - `pages` — Wiki 页面元数据（slug/title/type/contexts/version/updated_at）
   - `page_embeddings` — 页面向量（vector(384) + HNSW 索引）
   - `links` — 实体间链接（source_slug/target_slug/relation/orphaned）
   - `evidence_spans` — 证据片段（span_id/text/source/confidence）
   - `entities` — 实体表（slug/name/type/aliases）
   - `entity_aliases` — 实体别名映射

2. **审核与变更（6 张）**
   - `pending_diffs` — 待审核 Diff（id/type/tier/impact/confidence/payload/status）
   - `approved_diffs` — 已批准 Diff
   - `auto_change_log` — 自动变更日志（batch_id/entity/count/timestamp）
   - `diff_approvals` — Diff 审批记录
   - `review_feedback` — 审核反馈

3. **检索增强（4 张）**
   - `nli_cache` — NLI 推理缓存
   - `user_rules` — 用户自定义规则（NER 别名/关系规则）
   - `clusters` — 主题聚类（id/name/summary/size）
   - `cluster_members` — 聚类成员（cluster_id/entity_slug）

4. **系统配置（3 张）**
   - `settings` — 键值对设置
   - `llm_usage` — LLM 使用统计
   - `budget_alerts` — 预算告警记录

5. **知识图书馆（3 张）**
   - `library_files` — 图书馆文件（hash/name/mime/size/status/extracted_at）
   - `library_anchors` — 文件锚点（实体与文件的关联）
   - `ghost_relations` — 幽灵关系（source/target/status/discovered_at）

6. **索引列表**
   - 向量索引（HNSW on page_embeddings.embedding）
   - 全文索引（GIN on pages.tsv）
   - 常用查询索引说明

7. **维度自动迁移机制**
   - `ensureEmbeddingDimension()` 工作原理
   - ALTER TABLE + 重建索引流程

---

### 文档 4：`docs/04_KNOWLEDGE_MODEL.md` — 知识模型规范
**详细程度**：每个区段字段级说明，含完整示例

1. **Compiled Truth Markdown 格式规范**
   - Frontmatter 字段详解（title/type/contexts/canonical_slug/aliases/version/updated_at）
   - `## State` — 状态区（当前知识断言的完整表述）
   - `## Assessment` — 评估区（置信度/证据强度/开放问题）
   - `## Open Threads` — 悬而未决的问题清单
   - `## Relations` — 关系区（指向其他实体的链接 + 关系类型）
   - `## Timeline` — 时间线（关键事件/版本更新/知识演进）
   - `## Version History` — 版本历史（语义化版本 + 变更摘要）
   - `## Semantic Rings Archive` — 语义环归档（历史版本的压缩存档）
   - `## Evidence` — 证据区（span_id + 来源 + 原文摘录）

2. **完整示例文件**
   - 以"熵"为主题的完整 Compiled Truth Markdown 示例

3. **关系模型**
   - 关系类型定义（因果/组成/相关/对比/上下位...）
   - 悬空链接（orphaned）处理机制
   - 语境感知矛盾检测（context_variant）

4. **版本控制策略**
   - 语义化版本号规则
   - Semantic Rings 压缩归档机制
   - 回滚一致性保证

5. **集群与语义环**
   - `clusters` 表模型
   - `cluster_members` 关联
   - 从 summaries/*.md 同步集群的机制

6. **证据链规范**
   - evidence_span 的唯一标识（span_id）
   - 证据来源类型（library/ external/ user_input/ llm_extract）
   - 证据置信度分级

---

### 文档 5：`docs/05_AI_PIPELINE.md` — AI 流水线详解
**详细程度**：每个 Agent 的输入输出、提示词策略、熔断机制

1. **L1 Agent 五阶段编排**
   - **Planner**：意图识别 → 拆解子问题 → 生成检索计划
     - 输入：用户问题 + 对话历史
     - 输出：检索计划（queries[] + search_strategy）
   - **Retriever**：多路并行检索 → RRF 融合 → 去重排序
     - 向量检索 / 全文检索 / 图谱遍历 / 意图路由
     - 输出：Top-K 证据片段 + 相关实体
   - **Grader**：证据评估 → 相关性打分 → NLI 校验
     - ZeroEntropy rerank-2 重排序
     - RoBERTa-mnli 自然语言推理
     - 输出：分级证据列表（高/中/低置信）
   - **Generator**：基于证据生成回答 → 插入脚注
     - 证据双语呈现（翻译扩展）
     - 输出：回答 + 脚注引用 + 相关实体推荐
   - **Reflector**：自我反思 → 质量检查 → 最多 5 轮
     - 检查：事实一致性 / 证据覆盖率 / 回答完整性
     - 输出：最终回答 + 反思日志

2. **Agent 扩展模块**
   - **Compression**：对话历史压缩（摘要 + 关键词提取）
   - **Observe**：静默观察（用户浏览行为 → 补提取建议）
   - **Feedback**：用户反馈（点赞/踩 → 规则学习 → 反例采样）
   - **Translate**：证据翻译（中英文互译）

3. **L2 混合检索策略**
   - 五路检索详解：向量 / 全文 / 图谱 / 实体匹配 / 意图路由
   - RRF（Reciprocal Rank Fusion）融合算法
   - 三重增强：重排序 + NER 实体链接 + NLI 蕴含校验

4. **Dream Cycle 六阶段详解**
   - 阶段 1：关系凝聚（弱关系 → 强关系）
   - 阶段 2：实体归一化（别名合并 + 歧义消解）
   - 阶段 3：矛盾检测（语境感知 + 仲裁标记）
   - 阶段 4：幽灵清理（悬空链接检测 + Open Threads 追加）
   - 阶段 5：版本归档（Semantic Rings 压缩）
   - 阶段 6：影子评估（基准测试 + 质量评分）

5. **分级 Diff 审核机制**
   - 🟢 批量区：置信度 > 0.9 且低影响 → 一键批量合并
   - 🟡 预览区：置信度 0.7-0.9 或属性更新 → 逐条预览
   - 🔴 重点区：置信度 < 0.7 或矛盾/高风险 → 强制逐个

6. **影子评估与熔断**
   - 基准测试集构建
   - 评分维度（准确性/相关性/完整性/一致性）
   - 异常熔断机制（质量下降 → 暂停自动写入）

7. **预算控制策略**
   - 三级预算：单次查询 / 日 / 月
   - 预算告警与熔断
   - 费用追踪（token 级统计）

8. **10 家 LLM 适配器架构**
   - 基类 `LLMAdapter` 接口（chat / embed / probe）
   - 各适配器差异点（API 格式 / 模型列表 / 限流）
   - 路由策略（优先级 + 负载均衡 + 故障转移）

---

### 文档 6：`docs/06_RETRIEVAL_ENGINE.md` — 检索引擎技术详解
**详细程度**：算法级说明，含公式和参数

1. **向量检索**
   - pgvector HNSW 索引参数（m=16, ef_construction=64, ef_search=40）
   - 嵌入模型：all-MiniLM-L6-v2（384 维）
   - 余弦相似度 vs 内积

2. **全文检索**
   - PostgreSQL tsvector + tsquery
   - 中文分词方案
   - 权重分级（A:title, B:state, C:relations, D:evidence）

3. **RRF 融合算法**
   - 公式：`score = Σ 1 / (k + rank)`
   - k 值选择（默认 60）
   - 五路检索的权重分配

4. **图谱遍历检索**
   - 跳数限制（默认 2 跳）
   - 关系类型过滤
   - 路径相关性评分

5. **重排序（ZeroEntropy rerank-2）**
   - API 调用方式
   - 截断策略（512 tokens）
   - 可配置开关（RERANKER_ENABLED）

6. **实体识别与链接（NER）**
   - `[[wikilink]]` 正则提取
   - 用户规则库（user_rules 表）
   - 别名映射与消歧
   - 规则学习（从用户反馈中学习）

7. **自然语言推理（NLI）**
   - RoBERTa-mnli 模型
   - HF Inference API → 本地 @xenova/transformers 降级
   - 三分类：蕴含 / 矛盾 / 中立
   - nli_cache 缓存机制

8. **意图路由**
   - 问题分类：事实型 / 解释型 / 比较型 / 操作型
   - 不同意图的检索策略调整

---

### 文档 7：`docs/07_DEPLOYMENT.md` — 部署与运维指南
**详细程度**：从环境准备到故障排查的完整手册

1. **快速开始（Docker 一键部署）**
   - 环境要求（Docker + Docker Compose）
   - 环境变量配置（20+ 变量详解）
   - `./init.sh` 执行流程（等待 PG → 迁移 → 种子数据）
   - `docker compose up -d` 启动
   - 健康检查与验证

2. **本地开发环境搭建**
   - Bun 安装
   - PostgreSQL + pgvector 安装
   - 依赖安装（monorepo workspaces）
   - 数据库迁移与种子数据
   - 前后端开发服务器启动

3. **配置详解**
   - 数据库配置（DATABASE_URL）
   - LLM 配置（10 家 API Key + 模型选择）
   - 嵌入配置（EMBEDDING_PROVIDER / MODEL / DIMENSION）
   - 预算配置（DAILY_BUDGET / MONTHLY_BUDGET / PER_QUERY_BUDGET）
   - 检索配置（TOP_K / RRF_K / RERANKER_ENABLED）

4. **CLI 工具（brain 命令）**
   - `brain ask` — 命令行问答
   - `brain rebuild-struct` — 重建结构索引
   - `brain extract-pending` — 提取待处理文件
   - `brain archive-versions` — 归档历史版本
   - `brain clean-ghost-relations` — 清理幽灵关系
   - `brain translate-evidence` — 翻译证据
   - `brain generate-static-site` — 生成静态站点
   - `brain dashboard-snapshot` — 仪表盘快照

5. **MCP 服务器**
   - 36 个工具清单
   - stdio 模式 / HTTP 模式
   - 与 Claude Desktop / Cursor 等集成方法

6. **监控与运维**
   - 健康检查端点
   - 日志格式（Pino JSON）
   - 预算告警
   - 影子评估报告
   - 备份策略（Markdown 文件 + 数据库 dump）

7. **故障排查**
   - 数据库连接失败
   - LLM API 调用失败
   - 向量维度不匹配
   - 前端无法连接后端
   - 性能问题排查

---

### 文档 8：`docs/08_DEV_GUIDE.md` — 开发指南
**详细程度**：新开发者上手指南，含代码规范和调试技巧

1. **项目结构详解**
   - Monorepo 布局（shared / server / web）
   - 后端目录结构（agents / retrieval / storage / evolution / ...）
   - 前端目录结构（routes / blocks / layouts / store / ...）
   - 共享类型模块

2. **开发环境搭建**
   - 前置要求（Bun 1.2+ / PostgreSQL 16 + pgvector）
   - 安装步骤
   - 数据库迁移
   - 启动开发服务器

3. **常用命令**
   - `bun run dev:server` — 后端开发
   - `bun run dev:web` — 前端开发
   - `bun run build` — 全量构建
   - `bun run db:migrate` — 数据库迁移
   - `bun run seed` — 种子数据
   - `bun test` — 运行测试
   - `bun run brain` — CLI 工具

4. **代码风格与约定**
   - TypeScript 严格模式
   - 全汉化（注释/日志/错误消息）
   - 文件命名约定
   - 错误处理模式（try-catch + logger）

5. **新增功能指南**
   - 新增 API 端点的步骤
   - 新增前端页面的步骤
   - 新增 LLM 适配器的步骤
   - 新增 Agent 扩展的步骤

6. **调试技巧**
   - 后端调试（日志级别 + Bun inspector）
   - 前端调试（React DevTools + TanStack Query DevTools）
   - 数据库调试（SQL 日志 + 慢查询分析）
   - LLM 调用调试（请求/响应日志）

7. **测试指南**
   - 单元测试（Bun test）
   - 现有测试用例清单
   - 编写新测试的规范

---

## 三、实施步骤

1. 创建 `docs/` 目录
2. 生成 `01_ARCHITECTURE.md` — 系统架构总览
3. 生成 `02_API_REFERENCE.md` — API 接口参考
4. 生成 `03_DATABASE_SCHEMA.md` — 数据库 Schema 详解
5. 生成 `04_KNOWLEDGE_MODEL.md` — 知识模型规范
6. 生成 `05_AI_PIPELINE.md` — AI 流水线详解
7. 生成 `06_RETRIEVAL_ENGINE.md` — 检索引擎技术详解
8. 生成 `07_DEPLOYMENT.md` — 部署与运维指南
9. 生成 `08_DEV_GUIDE.md` — 开发指南
10. 更新 `README.md` 添加技术文档导航
11. 更新任务列表标记完成

---

## 四、依赖与注意事项

- **数据来源**：所有文档内容基于现有代码库实际实现，通过扫描源码自动提取结构和字段
- **代码引用**：每个技术点都附带指向具体实现文件的链接（`file://` 格式）
- **中文输出**：全部文档使用中文，与项目全汉化策略一致
- **准确性**：以实际代码为准，不包含未实现的推测内容
- **粒度**：字段级 / 函数级 / 模块级三级细化，覆盖从架构到实现的全貌

---

## 五、风险处理

| 风险 | 处理方式 |
|------|----------|
| 某些模块实现不完整 | 在文档中明确标注，说明当前状态和预留接口 |
| 文档数量大，生成时间长 | 按优先级分批生成，核心文档（架构/API/数据库）优先 |
| 代码与文档不同步 | 在文档开头标注生成日期和对应版本，提示以代码为准 |
| 某些细节需要进一步确认 | 标注"TODO"或"待确认"，不做推测性描述 |
