# Checklist

## Phase O1：本体基础
- [x] Markdown `## Ontology` 区块语法已定义并文档化
- [x] `ParsedOntology` 接口和解析函数已实现
- [x] 六个子区块（Classes / Class Hierarchy / Properties / Hyperedge Types / Causal Constraints / Inference Rules）均可正确解析
- [x] 全局本体 + 局部本体合并逻辑正确
- [x] `ontology_classes` 表已创建
- [x] `ontology_properties` 表已创建
- [x] `ontology_hyperedge_signatures` 表已创建
- [x] `ontology_rules` 表已创建
- [x] `rebuild-struct` 扫描并填充本体缓存表
- [x] `validateHyperedge` 校验器可正确检测约束违反
- [x] 校验失败超边 Diff 置信度降为 0.5，标红
- [x] 用户手动覆盖时超边标记为 `exception` 并记录原因

## Phase O2：推理与集成
- [x] 子类继承推理（`getSubClasses`/`getAllInstancesOfClass`）已实现
- [x] 逆关系推理（`getInverseProperty`）已实现
- [x] 约束检测（`checkConstraint`）已实现
- [x] `inferEntityType` 基于内容+图谱邻居推断类型
- [x] 问答 `query` 集成了子类继承展开
- [x] 问答 `query` 集成了逆关系自动识别
- [x] 问答响应中附加了本体约束提示
- [x] 因果发现管线添加了本体过滤步骤
- [x] 无意义候选组合被正确过滤
- [x] 符合约束的组合被优先推荐
- [x] `checkOntologyConsistency` 可扫描全库一致性
- [x] 实体类型缺失/冲突/关系违规被正确检测

## Phase O3：主动学习与可视化
- [x] 夜间任务包含本体一致性检查
- [x] 编辑器 `[[` 补全下拉支持本体类层级筛选
- [x] 图谱节点按本体类着色
- [x] 超边显示类型标签
- [x] 右键菜单包含"添加符合本体的新实体"选项
- [x] 本体修改 Diff 标注为 🔴 重点区
- [x] 校验失败超边 Diff 默认进入 🔴 重点区
- [x] DiffReviewPage 显示本体相关 Diff 的特别标记

## 原则验证
- [x] 所有本体定义在 Markdown 内，无外部依赖
- [x] `rebuild-struct` 可完整重建本体缓存
- [x] 本体修改需审核确认
- [x] 自动分类建议为 Diff 而非直接写入
- [x] 校验失败不静默丢弃
- [x] 本体变更纳入 `auto_change_log` 可回滚