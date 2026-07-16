# 配置文件/依赖调试 Spec

## Why
审计发现多个配置和依赖问题：shared 包缺少 build 脚本导致根构建失败、启动迁移执行器缺少 advisory lock、脚本路径硬编码、依赖重复等。

## What Changes
- 为 shared 包添加 build 脚本
- 为启动迁移执行器添加 advisory lock
- 修复 scripts/migrate.ts 硬编码路径
- 清理重复依赖
- 补充 .gitignore 条目

## Impact
- Affected specs: 无
- Affected code: `shared/package.json`, `server/src/db/migrate.ts`, `server/scripts/migrate.ts`, `package.json`, `.gitignore`

## ADDED Requirements

### Requirement: shared 包可构建
系统 SHALL 确保根 `build` 命令中所有 workspace 包均有对应 build 脚本。

#### Scenario: 根 build 失败
- **WHEN** 运行 `bun run build`（根目录）
- **THEN** `--filter shared build` 不会因 shared 缺少 build 脚本而失败

### Requirement: 启动迁移执行器并发安全
系统 SHALL 确保启动时迁移执行器使用 advisory lock 防止多实例并发冲突。

#### Scenario: 多实例同时启动
- **WHEN** 多个服务实例同时启动并执行迁移
- **THEN** 仅一个实例执行迁移，其余等待锁释放后跳过

### Requirement: 迁移脚本路径可移植
系统 SHALL 确保 `scripts/migrate.ts` 在不同工作目录下均能正确定位迁移文件。

#### Scenario: 从根目录运行迁移
- **WHEN** 从项目根目录运行 `bun run server/scripts/migrate.ts`
- **THEN** 迁移文件路径正确解析，不依赖 `process.cwd()` 为 server 目录