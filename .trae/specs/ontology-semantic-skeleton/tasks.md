# Tasks

## Phase O1：本体基础

- [x] Task 1: 设计并实现本体 Markdown 区块解析器
  - 在 `parser.ts` 中新增 `ParsedOntology` 接口和解析函数 `parseOntologySection(rawMd: string)`
  - 解析 `### Classes`、`### Class Hierarchy`、`### Properties`、`### Hyperedge Types`、`### Causal Constraints`、`### Inference Rules` 六个子区块
  - 处理全局本体（`wiki/ontology/core.md`）和局部本体（`## Ontology (局部)`）的合并
  - 输出 `ParsedOntology` 结构

- [x] Task 2: 创建本体缓存数据库表
  - 创建迁移文件 `0011_add_ontology_tables.sql`
  - 建表：`ontology_classes`（id, name, parent, description, source_slug）、`ontology_properties`（id, name, domain_class, range_class, inverse_of, source_slug）、`ontology_hyperedge_signatures`（id, type_name, signature, domain_classes, range_classes, source_slug）、`ontology_rules`（id, rule_type, description, body, source_slug）
  - 扩展 `ParsedPage` 接口添加 `ontology?: ParsedOntology`

- [x] Task 3: 实现 `rebuild-struct` 本体重建
  - 在 `sync.ts` 的 `rebuildStruct` 中，扫描所有 `.md` 文件的 `## Ontology` 区块
  - 解析后写入 `ontology_*` 缓存表
  - 全局本体 + 局部本体合并逻辑

- [x] Task 4: 实现超边签名校验器 `validateHyperedge`
  - 在 `causal/` 中新增 `ontologyValidator.ts`
  - 检查超边参与实体类型是否符合 `domain/range` 约束
  - 返回 `ValidationReport { valid: boolean, violations: string[] }`
  - 校验失败时 Diff 置信度降为 0.5，标红，附带提示

- [x] Task 5: 在 AI 超边生成流程中集成校验
  - 在 `brainapi.ts` 和 `sync.ts` 的超边生成/提交流程中调用 `validateHyperedge`
  - 校验失败的超边标记为 `exception` 并记录原因
  - 用户手动确认覆盖时允许写入

## Phase O2：推理与集成

- [x] Task 6: 实现本体推理引擎
  - 在 `causal/` 中新增 `ontologyReasoner.ts`
  - 实现子类继承推理（`getSubClasses`、`getAllInstancesOfClass`）
  - 实现逆关系推理（`getInverseProperty`）
  - 实现约束检测（`checkConstraint`）
  - 基于图遍历，不依赖外部 RDF 引擎

- [x] Task 7: 实现实体类型自动推断 `inferEntityType`
  - 在 `causal/` 中新增 `entityClassifier.ts`
  - 基于内容分析（关键词匹配）+ 图谱邻居（相邻节点类型）推断
  - 使用低成本模型，不使用 LLM（避免消耗）
  - 返回 `SuggestedType { className: string, confidence: number }`

- [x] Task 8: 问答管线集成本体推理
  - 在 `brainapi/index.ts` 的 `askQuestion` 方法中集成 `ontologyReasoner`
  - 子类继承：展开查询类为自身 + 所有子类
  - 逆关系：自动识别并反向查询
  - 约束检测：在响应中附加本体提示

- [x] Task 9: 因果发现管线添加本体过滤
  - 在 `causal/discovery.ts` 的 `runCausalDiscovery` 中添加本体过滤步骤
  - 删除明显无意义的候选组合（如类不匹配的因果边）
  - 优先推荐符合因果约束的候选组合

- [x] Task 10: 实现本体一致性检查 `checkOntologyConsistency`
  - 在 `causal/` 中新增 `ontologyChecker.ts`
  - 扫描全库实体类型是否与本体一致
  - 检测实体类型缺失、类型冲突、关系违规
  - 生成 🟡 或 🔴 Diff 列表

## Phase O3：主动学习与可视化

- [x] Task 11: 实现夜间本体一致性检查任务
  - 在 `index.ts` 中添加 `checkOntologyConsistency()` 调用
  - 集成到现有夜间任务调度中
  - 生成 Diff 建议实体重新分类

- [x] Task 12: 实现编辑器本体感知自动补全
  - 在 `MarkdownEditor.tsx` 中，`[[` 补全下拉增加类层级筛选
  - 按本体类分组显示候选实体
  - 添加"按类筛选"下拉框

- [x] Task 13: 实现图谱本体类着色
  - 在 `CausalCanvas.tsx` 中，根据实体 `type` 所属本体类分配颜色
  - 超边显示类型标签
  - 右键菜单添加"添加符合本体的新实体"快捷操作

- [x] Task 14: 分级审核调整
  - 在 `brainapi/index.ts` 的 Diff 生成中，标记本体修改为 🔴 重点区
  - 校验失败的超边 Diff 默认进入 🔴 重点区
  - 在 `DiffReviewPage` 中显示本体相关 Diff 的特别标记

# Task Dependencies
- Task 2 依赖 Task 1（解析器完成后才能定义缓存表结构）
- Task 3 依赖 Task 1, Task 2
- Task 4 依赖 Task 2（缓存表就绪后才能校验）
- Task 5 依赖 Task 4
- Task 6 依赖 Task 2
- Task 7 依赖 Task 2
- Task 8 依赖 Task 6
- Task 9 依赖 Task 2
- Task 10 依赖 Task 2
- Task 11 依赖 Task 10
- Task 12 依赖 Task 2
- Task 13 依赖 Task 2
- Task 14 依赖 Task 4, Task 10

**可并行执行**：Task 4, 6, 7, 9, 10, 12, 13 均依赖 Task 2 完成后可并行