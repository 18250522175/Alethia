# 部署与运维指南文档生成计划

## 目标
生成 `/workspace/docs/07_DEPLOYMENT.md` 部署与运维指南文档，全中文，基于真实配置文件。

## 文档结构（8 个章节）

### 1. 标题 + 生成日期
- Alethia AI 知识库 v5.0 部署与运维指南
- 生成日期：2026-07-04

### 2. Docker 一键部署
- **环境要求**：Docker + Docker Compose v2，最低硬件配置建议
- **环境变量完整列表**：基于 `.env.example` 和 `schema.ts`，约 25+ 个变量，含说明和默认值
  - 基础配置：DATABASE_URL, BRAIN_PORT, BRAIN_API_KEY, LANGUAGE
  - 预算配置：DAILY_BUDGET, MONTHLY_BUDGET, PER_QUERY_BUDGET
  - LLM 密钥（10 家）：BAILIAN, ZHIPU, MOONSHOT, ERNIE, SPARK, HUNYUAN, MINIMAX, DEEPSEEK, YI, BAICHUAN
  - 嵌入配置：EMBEDDING_PROVIDER, EMBEDDING_MODEL
  - 重排序：RERANKER_ENABLED, ZERANK_API_KEY
  - NLI：NLI_PROVIDER, HF_API_KEY
- **init.sh 流程**：3 步流程（等待 PostgreSQL → 执行迁移 → 写入种子数据）
- **docker compose 启动**：4 个服务（postgres, server, web, init），启动命令与验证
- **健康检查**：各服务健康检查配置与端点

### 3. 本地开发搭建
- Bun 安装（v1.1+）
- PostgreSQL + pgvector（pg16）
- 依赖安装（monorepo 结构，bun install）
- 数据库迁移
- 启动开发服务器

### 4. 配置详解
- **数据库**：PostgreSQL + pgvector，连接池配置
- **LLM（10 家）**：bailian, zhipu, moonshot, ernie, spark, hunyuan, minimax, deepseek, yi, baichuan，各自默认模型
- **嵌入**：local（all-MiniLM-L6-v2）与厂商适配器
- **预算**：日/月/单次预算，nightlyFuse，模型分配
- **检索**：向量+全文混合检索，RRF 融合，重排序，图谱扩展

### 5. CLI 工具（9 个 brain 命令）
基于 `brain.ts`：
1. `ask <问题>` — 提问并获取 Markdown 答案与来源
2. `rebuild-struct` — 重建知识库结构
3. `extract-pending` — 扫描并提取待处理文件
4. `archive-versions [slug]` — 归档超过 50 条的活跃版本
5. `clean-ghost-relations` — 清理幽灵关系
6. `translate-evidence <spanIds...> [--lang=xx]` — 翻译证据片段
7. `generate-static-site [outputPath]` — 生成静态站点
8. `dashboard-snapshot` — 输出健康仪表盘快照
9. `help` — 显示帮助信息

### 6. MCP 服务器
- **工具数量**：约 30+ 个工具（问答/检索、图谱、待审核、对话、观察文件、维护、草稿、健康、变更日志、实体规则、LLM 适配器、设置、时间线、库文件、基础工具等分类）
- **stdio 模式**：从 stdin 读取 JSON-RPC，写入 stdout
- **HTTP 模式**：Hono 挂载 `/mcp` 路由，默认端口 3100
- **集成方法**：协议版本 2024-11-05，JSON-RPC 2.0，支持的 methods（initialize, tools/list, tools/call, ping）

### 7. 监控运维
- **健康检查**：`/health` 端点，健康仪表盘数据
- **日志格式**：结构化日志（基于 logger）
- **预算告警**：日/月预算超限检测
- **影子评估**：run_shadow_eval，AI 质量评估
- **备份策略**：PostgreSQL 数据卷备份，wiki 数据卷备份

### 8. 故障排查
- 常见问题与解决方案（数据库连接、LLM 密钥、嵌入模型、预算超限、容器启动失败等）

## 数据源文件
- `/workspace/docker-compose.yml`
- `/workspace/init.sh`
- `/workspace/Dockerfile.server`
- `/workspace/Dockerfile.web`
- `/workspace/nginx.conf`
- `/workspace/.env.example`
- `/workspace/server/src/config/schema.ts`
- `/workspace/server/src/config/defaults.ts`
- `/workspace/server/src/cli/brain.ts`
- `/workspace/server/src/mcp/server.ts`

## 执行步骤
1. 确保 `/workspace/docs/` 目录存在
2. 编写完整的 `07_DEPLOYMENT.md` 文档
3. 验证文档结构完整性
