# 本体建模融合：为认知超图注入语义骨架 Spec

## Why
在 v5.2 的超图与因果架构之上引入本体层，使 Alethia 的知识表示从"事实网络"升级为"带有形式语义的认知系统"。本体定义实体类别、关系类型、属性约束及推理规则，直接作用于超边构建、因果推断、矛盾检测和 AI 自动提取，同时保持 Markdown 自包含与人类可读。

## What Changes
- 新增 `## Ontology` Markdown 区块语法（Classes / Class Hierarchy / Properties / Hyperedge Types / Causal Constraints / Inference Rules）
- 新增 `ontology_classes`、`ontology_properties`、`ontology_hyperedge_signatures`、`ontology_rules` 缓存表
- 扩展 `ParsedPage` 解析器支持本体区块解析
- 新增超边签名校验器（`validateHyperedge`）
- 新增实体类型自动推断（`inferEntityType`）
- 新增本体一致性检查（`checkOntologyConsistency`）
- 因果发现管线增加本体过滤
- 问答管线集成本体推理（子类继承、逆关系、约束检测）
- 分级审核调整：本体修改为 🔴 重点区
- 编辑器/可视化增强：类层级选择、节点按本体类着色

## Impact
- Affected specs: hypergraph-causal-v52, causal-cognitive-map, unified-graph-view
- Affected code: `parser.ts`, `sync.ts`, `brainapi.ts`, `causal/discovery.ts`, `causal/reasoner.ts`, `causal/intent.ts`, `CausalCanvas.tsx`, `MarkdownEditor.tsx`, `WikiEntryPage.tsx`

---

## ADDED Requirements

### Requirement 1: 本体 Markdown 区块语法
系统 SHALL 支持在 Markdown 文件中通过 `## Ontology` 区块定义本体，包括六个子区块。

#### Scenario: 全局本体定义
- **WHEN** 用户在 `wiki/ontology/core.md` 中写入 `## Ontology` 区块
- **THEN** `rebuild-struct` 解析并填充 `ontology_*` 缓存表

#### Scenario: 局部本体追加
- **WHEN** 用户在具体条目中写入 `## Ontology (局部)` 区块
- **THEN** 解析时自动与全局本体合并，特化类或约束追加

#### Scenario: 子区块解析
- **WHEN** 区块包含 `### Classes`、`### Class Hierarchy`、`### Properties`、`### Hyperedge Types`、`### Causal Constraints`、`### Inference Rules`
- **THEN** 每个子区块被正确解析为对应的内部数据结构

### Requirement 2: 超边签名校验
系统 SHALL 在 AI 生成超边时校验其是否符合本体签名约束。

#### Scenario: 超边通过校验
- **WHEN** 超边 `:jointlyCause` 的参与实体均符合 `domain/range` 约束
- **THEN** 超边以正常置信度（≥0.7）生成 Diff

#### Scenario: 超边违反约束
- **WHEN** 超边参与实体类型不符合签名约束
- **THEN** Diff 置信度降为 0.5，标红，附带提示文案说明违反原因

#### Scenario: 用户手动覆盖约束
- **WHEN** 用户确认忽略本体约束的超边
- **THEN** 该超边标记为 `exception` 并记录原因

### Requirement 3: 实体类型自动推断
系统 SHALL 基于内容 + 图谱邻居推断实体类型。

#### Scenario: 未声明类型的实体
- **WHEN** 实体页 `frontmatter.type` 为空
- **THEN** `inferEntityType` 基于内容分析和图谱邻居自动建议类型，生成 Diff 建议

#### Scenario: 类型与本体不一致
- **WHEN** 实体类型与本体定义冲突
- **THEN** `checkOntologyConsistency` 生成 🟡 或 🔴 Diff 建议修正

### Requirement 4: 因果发现本体过滤
系统 SHALL 在夜间因果发现阶段使用本体过滤候选超边。

#### Scenario: 过滤无意义组合
- **WHEN** 因果发现生成候选超边"颜色 → 股价"
- **THEN** 本体过滤器检查因果约束后删除此候选

#### Scenario: 优先推荐符合约束的组合
- **WHEN** 因果发现生成候选"决策 → 指标"
- **THEN** 本体过滤器标记为优先推荐，提升置信度

### Requirement 5: 本体推理问答增强
系统 SHALL 在问答中集成轻量级本体推理。

#### Scenario: 子类继承
- **WHEN** 用户问"公司如何提升运营效率？"
- **THEN** 系统自动召回子类"部门"的实例关联的超边

#### Scenario: 逆关系查询
- **WHEN** 本体定义 `:hasEmployee` 的逆关系为 `:worksFor`
- **THEN** 系统可自动回答"张三为哪家公司工作？"

#### Scenario: 约束检测提示
- **WHEN** 用户尝试将 财务指标 直接链接到另一指标
- **THEN** 系统提示"根据本体可能需要通过 事件 中介"

### Requirement 6: 本体一致性检查
系统 SHALL 提供定期/手动触发的全库本体一致性检查。

#### Scenario: 全库一致性扫描
- **WHEN** 调用 `checkOntologyConsistency`
- **THEN** 检测所有实体类型、关系是否与本体一致，生成 Diff 列表

### Requirement 7: 分级审核调整
本体修改 SHALL 属于 🔴 重点审核区。

#### Scenario: 本体自身修改
- **WHEN** 用户修改本体类定义或关系签名
- **THEN** 该 Diff 进入 🔴 重点审核区

#### Scenario: 校验失败的超边
- **WHEN** 超边校验失败
- **THEN** 对应 Diff 默认进入 🔴 重点审核区

### Requirement 8: 编辑器与可视化增强
编辑器 SHALL 支持本体感知的自动补全，图谱 SHALL 按本体类着色。

#### Scenario: 编辑器类层级选择
- **WHEN** 用户在 Wiki 编辑器输入 `[[`
- **THEN** 下拉列表显示类层级，支持按本体类快速筛选

#### Scenario: 图谱本体类着色
- **WHEN** 认知地图渲染节点
- **THEN** 节点按本体类着色，超边显示类型标签

#### Scenario: 右键快捷操作
- **WHEN** 用户在画布右键点击
- **THEN** 显示"添加符合本体的新实体"快捷操作

---

## MODIFIED Requirements

### Requirement: 超边生成流程（原有）
原有超边生成流程不校验本体约束。修改后：
- AI 生成 `## Hyper Relations` 或 `## Causal Model` 时，必须通过本体签名校验。
- 校验失败的超边置信度降为 0.5，标红，附带提示。

### Requirement: 因果发现管线（原有）
原有因果发现无本体过滤。修改后：
- 候选超边在进入 Diff 队列前，先经本体过滤器。
- 删除明显无意义的组合，优先推荐符合约束的组合。

### Requirement: 问答管线（原有）
原有问答无本体推理。修改后：
- `BrainAPI.query` 和 `BrainAPI.queryCausal` 集成子类继承、逆关系、约束检测。

---

## 实施阶段

| 阶段 | 内容 | 前置条件 |
|------|------|----------|
| **Phase O1** | 本体 Markdown 语法、解析器、缓存表、超边签名校验 | - |
| **Phase O2** | 本体推理引擎、问答集成、实体类型自动推断 | O1 |
| **Phase O3** | 夜间一致性检查、实体重分类建议、缺失本体关系发现 | O2 |
| **Phase O4** | 可选导入 Schema.org/FOAF、跨知识库语义互操作 | O3 |

---

## 原则守护

- **Markdown 自包含**：所有本体定义均在 Markdown 内，无外部依赖，`rebuild-struct` 完整重建
- **人类掌权**：本体修改需确认；自动分类建议为 Diff；校验失败不静默丢弃
- **可回滚**：本体变更同属 `auto_change_log`，回滚时恢复 Markdown + 重建缓存