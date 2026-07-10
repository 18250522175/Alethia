# 项目全面审计循环 Spec

## Why
上一轮审计修复（Plan Mode）已发现并修复了 14 个问题，但项目规模大、模块多，可能存在未覆盖的遗漏和修复带来的延申问题。需要建立系统化的迭代审计流程，确保项目功能完整、代码一致、无遗留缺陷。

## What Changes
- 建立审计循环流程：发现 → 修复 → 审查延申问题 → 重复
- 当前审计范围：检查上一轮修复的完整性和正确性、发现新的未覆盖问题
- 覆盖全部模块：server、web、shared、docker、配置

## Impact
- Affected specs: `alethia-v5-build`（审计目标）
- Affected code: 全部 `server/src/`、`web/src/`、`shared/types/`、根级部署文件

## ADDED Requirements

### Requirement: 审计发现流程
系统 SHALL 对项目进行分模块的全面代码审查，逐文件检查以下维度：
- 数据库 Schema 与代码中 SQL 查询的一致性
- 类型定义与实际使用的对齐
- 导入路径是否正确解析
- 错误处理是否完整
- 是否存在未声明的依赖

#### Scenario: 审计循环
- **WHEN** 审计流程启动
- **THEN** 按模块顺序扫描，记录所有发现的问题，按优先级排序（P0 运行时错误 > P1 功能缺陷 > P2 代码质量 > P3 文档配置）

### Requirement: 修复验证
每次修复后 SHALL 检查该修复是否引入了新的关联问题（如列名修改后 SQL 查询的别名是否一致、表结构变更后代码引用是否同步）。

#### Scenario: 修复后验证
- **WHEN** 一个问题的修复代码被提交
- **THEN** 搜索该修复影响的所有引用点，确认无遗漏，无新增不一致

## 当前审计状态

### 已完成（上一轮 Plan Mode）
- P0：6 个数据库 Schema 缺陷 + 11 个 `ts` → `created_at` 列名引用修复
- P1：`applyDiff` 返回值、`xml2js` 依赖、Dockerfile 注释
- P2：RateLimiter Map、atomWrite 备份清理、Dockerfile healthcheck 超时
- P3：`.env.example` 补充、`shared/types/index.ts` 扩展名

### 本轮审计目标
1. 验证上一轮修复的完整性（无遗漏的 `ts` → `created_at` 引用）
2. 检查新增迁移 `0006` 与现有代码的兼容性
3. 检查 `budget_usage` 表结构与 `budget.ts` 代码的字段对齐
4. 检查 `eval_results` 表结构与 `brainapi/index.ts` 的查询对齐
5. 扫描全项目剩余未覆盖的模块是否有其他问题