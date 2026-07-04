# 系统架构总览文档创建计划

## 任务目标
创建 `/workspace/docs/01_ARCHITECTURE.md` 文件，作为 Alethia AI 知识库 v5.0 的系统架构总览文档。

## 文档结构规划

### 1. 标题与元信息
- 主标题：# Alethia AI 知识库 v5.0 — 系统架构总览
- 生成日期标注：> 生成日期：2026-07-04 | 版本：v5.0

### 2. 第一部分：设计哲学与核心原则
- 认知共生（人类 + AI 共同进化，问答即反哺）
- 全汉化（界面/日志/提示词/证据，汉语是思考的原生语言）
- 长期可维护（归档/幽灵清理/影子评估，像精心保养的图书馆）
- 人类掌权（Diff 审核 / 可回滚 / 不自动写入 State，效率不牺牲主权）
- Markdown 即真相源（DB 纯缓存池，损坏可一键从 Markdown 重建）

### 3. 第二部分：架构分层详解（L0 - L7）
每层包含：定位、核心模块、关键文件路径（file:// 链接）

- **L0 用户交互层**：15 页面 + 8 blocks + 4 layouts + 3 contexts
- **L0.5 统一服务层**：BrainAPI 统一服务层，26+ 方法
- **L1 AI Agent 编排层**：Planner/Retriever/Grader/Generator/Reflector + 4扩展
- **L2 混合检索层**：Vector/Fulltext/RRF/Graph/Intent + Rerank/NER/NLI
- **L3 知识模型层**：Compiled Truth Markdown 八区段规范
- **L4 自进化引擎**：Dream Cycle 六阶段 + 预算 + 归档 + 周报
- **L4.5 影子评估**：基准测试 + 异常熔断
- **L5 存储层**：Markdown FS + PostgreSQL 16 + pgvector
- **L6 多模态摄入**：8 种输入格式管道
- **L7 可视化层**：Cytoscape 图谱 + 时间线 + Chart.js 仪表盘

### 4. 第三部分：核心数据流（Mermaid 图）
- 用户提问 → 回答生成的完整链路时序图
- 知识摄入 → 审核 → 写入 → 反哺的流程图
- Dream Cycle 六阶段执行流程图

### 5. 第四部分：模块依赖关系
- 后端模块依赖拓扑（文字描述 + 表格）
- 前后端 API 映射表（按功能分组列出主要端点）

### 6. 第五部分：技术栈总览表
- 类别 | 技术选型 | 说明
- 运行时 / 框架 / 数据库 / 向量 / LLM / 前端 / 部署 / 测试

## 文件路径引用（基于实际代码结构）

### 后端路径
- `file:///workspace/server/src/brainapi/index.ts` - BrainAPI 统一服务层
- `file:///workspace/server/src/agents/` - AI Agent 编排层
- `file:///workspace/server/src/retrieval/` - 混合检索层
- `file:///workspace/server/src/storage/` - 存储层
- `file:///workspace/server/src/evolution/` - 自进化引擎
- `file:///workspace/server/src/ingest/` - 多模态摄入
- `file:///workspace/server/src/llm/` - LLM 适配器
- `file:///workspace/server/src/db/` - 数据库层
- `file:///workspace/server/src/routes/` - HTTP 路由

### 前端路径
- `file:///workspace/web/src/routes/` - 15 个页面
- `file:///workspace/web/src/blocks/` - 8 个 blocks
- `file:///workspace/web/src/layouts/` - 4 个 layouts
- `file:///workspace/web/src/store/` - 3 个 contexts
- `file:///workspace/web/src/lib/api.ts` - API 客户端

### 共享类型
- `file:///workspace/shared/types/` - 全栈共享类型

## 实施步骤
1. 创建 `/workspace/docs/` 目录（如果不存在）
2. 编写完整的架构文档 `01_ARCHITECTURE.md`
3. 验证文件格式和内容完整性
