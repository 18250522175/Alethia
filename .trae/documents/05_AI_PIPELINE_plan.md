# 05_AI_PIPELINE.md 文档生成计划

## 文档目标
创建 `/workspace/docs/05_AI_PIPELINE.md` — Alethia AI 知识库 v5.0 的 AI 流水线详解文档，基于真实代码实现编写。

## 文档结构（共 10 个章节）

### 1. 标题与元数据
- 标题：# Alethia AI 知识库 v5.0 — AI 流水线详解
- 生成日期：2026-07-04
- 文档概述

### 2. L1 Agent 五阶段编排
每个阶段包含：职责定位、输入/输出、核心逻辑、代码引用
- **Planner（规划器）** - `server/src/agents/planner.ts`
  - 生成检索计划（关键词、上下文、深度、实体）
  - 回退策略：关键词提取
- **Retriever（检索器）** - `server/src/agents/retriever.ts`
  - 五路检索执行、证据获取、图遍历
- **Grader（评分器）** - `server/src/agents/grader.ts`
  - 四维评分：事实准确度、覆盖完整度、来源清晰度、证据覆盖度
- **Generator（生成器）** - `server/src/agents/generator.ts`
  - 基于检索结果生成回答，证据引用格式
- **Reflector（反思器）** - `server/src/agents/reflector.ts`
  - 多轮反思循环，停止条件（轮次/时间/无增益）

### 3. Agent 扩展模块
- **Compression（对话压缩）** - `server/src/agents/compression.ts`
  - 阈值触发（默认 5 轮）、摘要注入 Planner、降级策略
- **Observe（静默观察）** - `server/src/agents/observe.ts`
  - 文件引用计数、阈值触发事实抽取、pending_diff 生成
- **Feedback（用户反馈）** - `server/src/agents/feedback.ts`
  - 正向/负向反馈处理、影子基准反哺、源文件重标记
- **Translate（证据翻译）** - `server/src/agents/translate.ts`
  - 缓存机制（90 天 TTL）、批量翻译、降级策略

### 4. L2 混合检索策略（概述）
- 五路检索（简述，详细见检索引擎文档）
- RRF 融合
- 三重增强

### 5. Dream Cycle 六阶段详解
基于 `server/src/evolution/dream.ts`
- 阶段 1：关系凝聚（community_detect，暂跳过）
- 阶段 2：实体归一化（NLI 预检，暂跳过）
- 阶段 3：矛盾检测（暂跳过）
- 阶段 4：幽灵清理（forget_decay + lint + ghost_cleanup，已实现）
- 阶段 5：版本归档（topic_cluster + gap_analysis，暂跳过）
- 阶段 6：影子评估（enrich_external + diff + annual_ring，暂跳过）

每个阶段说明：触发条件、操作内容、输出产物

### 6. 分级 Diff 审核机制
基于 `shared/types/diff.ts` + `server/src/agents/observe.ts`
- 🟢 批量区（green）：低影响、高置信、自动应用
- 🟡 预览区（yellow）：中影响、需确认
- 🔴 重点区（red）：高影响、低置信、人工审核
- PendingDiff 数据结构详解

### 7. 影子评估与熔断
基于 `server/src/evolution/shadow.ts`
- 基准测试集（shadow_benchmarks 表）
- 评分维度：正确率、复现率、波动幅度、新增错误占比
- 熔断机制：阈值触发、异常标记写入、任务中止

### 8. 预算控制策略
基于 `server/src/evolution/budget.ts`
- 三级预算：单次查询 / 日 / 月
- 告警与熔断机制
- 费用追踪：内存计数器 + 持久化告警
- 跨日/跨月惰性重置

### 9. 10 家 LLM 适配器架构
基于 `server/src/llm/router.ts` + `server/src/llm/adapter.ts` + `shared/types/settings.ts`
- 基类接口：BaseLLMAdapter / BaseOpenAICompatibleAdapter
- 适配器清单（10 家）：百炼、智谱、月之暗面、文心、星火、混元、MiniMax、DeepSeek、零一万物、百川
- 路由策略：按任务类型（ModelTier）分配模型
- 推荐模型分配表

## 技术要求
- 全部使用中文
- 所有代码引用使用 file:// 绝对路径
- 基于真实代码实现，不编造功能
- 已实现/未实现的功能需明确标注
- Markdown 格式，适当使用表格、列表、代码块
