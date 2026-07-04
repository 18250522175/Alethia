# 检索引擎技术详解文档生成计划

## 目标
创建 `/workspace/docs/06_RETRIEVAL_ENGINE.md` 文档，基于真实代码实现详细阐述 Alethia AI 知识库 v5.0 的检索引擎技术架构。

## 文档结构
1. **标题与元数据**
   - 标题：# Alethia AI 知识库 v5.0 — 检索引擎技术详解
   - 生成日期标注（2026-07-04）

2. **整体架构**
   - 五路检索 + RRF 融合 + 三重增强的流水线说明
   - Mermaid 架构流程图

3. **向量检索（vector.ts）**
   - pgvector + HNSW 索引技术原理
   - 嵌入模型：all-MiniLM-L6-v2，384 维
   - 相似度计算：余弦距离（<=> 操作符）
   - 代码引用与说明

4. **全文检索（fulltext.ts）**
   - PostgreSQL tsvector + tsquery 机制
   - 权重分级说明
   - 中文处理方案（simple 配置 + ILIKE 回退）
   - ts_headline 摘要生成
   - 代码引用与说明

5. **RRF 融合算法（rrf.ts）**
   - 公式：score = Σ weight / (k + rank)
   - k = 60 参数说明
   - 权重分配策略（factual: 0.7/0.3, 其他: 0.5/0.5）
   - 代码引用与说明

6. **图谱遍历检索（graph.ts）**
   - 递归 CTE 实现
   - 跳数限制（默认 2 层）
   - 关系类型与权重
   - 代码引用与说明

7. **重排序（rerank.ts）**
   - ZeroEntropy rerank-2 模型
   - API 调用方式
   - 截断策略（title + snippet）
   - 配置开关（RERANKER_ENABLED + ZERANK_API_KEY）
   - 失败回退机制
   - 代码引用与说明

8. **实体识别与链接（entity.ts）**
   - [[wikilink]] 正则提取
   - 显式命名实体正则（连续大写开头词）
   - 用户规则库（user_rules 表）
   - 别名映射与消歧
   - 规则学习（learnRule）
   - 命中次数统计
   - 代码引用与说明

9. **自然语言推理（nli.ts）**
   - RoBERTa-large-mnli 模型
   - HF Inference API → 本地降级策略
   - 三分类：蕴含/矛盾/中立
   - nli_cache 缓存（SHA256 哈希）
   - 批量处理
   - 代码引用与说明

10. **意图路由（router.ts）**
    - 问题分类规则（factual / cross_domain / file_search / topic / ai_qa）
    - 检索策略调整（向量/全文权重动态调整）
    - Tier 分级（T0/T1/T2）
    - 代码引用与说明

11. **性能优化**
    - 缓存策略（nli_cache、嵌入结果缓存）
    - 并行检索（Promise.all 向量+全文）
    - 提前终止（空结果快速返回）

## 技术依据
所有内容基于以下真实源文件：
- `/workspace/server/src/retrieval/vector.ts`
- `/workspace/server/src/retrieval/fulltext.ts`
- `/workspace/server/src/retrieval/rrf.ts`
- `/workspace/server/src/retrieval/graph.ts`
- `/workspace/server/src/retrieval/rerank.ts`
- `/workspace/server/src/retrieval/entity.ts`
- `/workspace/server/src/retrieval/nli.ts`
- `/workspace/server/src/retrieval/router.ts`
- `/workspace/server/src/llm/embed.ts`

## 输出
单一 Markdown 文件，全部使用中文，包含代码块引用、Mermaid 图表、技术原理说明。
