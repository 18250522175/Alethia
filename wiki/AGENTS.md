---
canonical_slug: AGENTS
title: Alethia Agent 系统
contexts: [系统, 架构]
type: concept
---

# Alethia Agent 系统

Alethia 采用多层级 Agent 架构，从数据摄入到知识问答形成完整的认知闭环。

## State

系统包含 L0 到 L6 共 7 层架构，每层负责特定的认知功能。

## 核心层级

| 层级 | 名称 | 功能 |
|------|------|------|
| L0 | BrainAPI | 统一服务接口层 |
| L1 | Agent 编排 | 规划、检索、评分、生成、反思 |
| L2 | 混合检索 | 向量、全文、图谱、重排序 |
| L3 | 大模型适配 | 十家国内大模型统一接入 |
| L4 | 自进化引擎 | Dream Cycle、归档、影子评估 |
| L5 | 存储层 | Markdown + PostgreSQL + pgvector |
| L6 | 摄入管道 | 多模态文档处理 |

## Assessment

多层 Agent 架构能够实现知识的自动提取、组织和演化，形成「摄入→提取→审核→演化→问答」的完整闭环。

## Open Threads

- [ ] 探索多 Agent 协作模式
- [ ] 研究知识冲突的自动消解机制

## Relations

- [[熵]] · example_concept
- [[科学门户]] · portal

## Timeline

- 2026-07-04 · 版本变更 · 初始创建 AGENTS 文档

## Version History

- v1 · 2026-07-04 · 初始版本
