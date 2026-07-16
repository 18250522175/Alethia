# 启动运行调试 Spec

## Why
前 5 轮调试已完成 TS 编译、前端构建、数据库迁移、API 端点、配置依赖的静态检查。现需尝试实际启动服务，找出运行时错误，确保 `bun run dev:server` 和 `bun run dev:web` 能正常启动。

## What Changes
- 修复 `server/src/db/migrate.ts` 中 ESM 环境下 `__dirname` 不可用的问题（改用 `import.meta.dirname`）
- 创建 `.env` 文件（从 `.env.example` 复制），确保默认配置可启动
- 修复 `server/src/config/schema.ts` 中 `SettingsSchema` 缺少 `llmConfig` 字段的问题
- 清理 `server/package.json` 中冗余的 `bun-types` 和 `@types/bun` 依赖
- 验证 `bun run dev:server` 启动流程
- 验证 `bun run dev:web` 启动流程

## Impact
- Affected specs: 配置/依赖调试 (config-dependency-fixes)
- Affected code: `server/src/db/migrate.ts`, `server/src/config/schema.ts`, `server/package.json`, `.env`

## ADDED Requirements

### Requirement: ESM 兼容的迁移路径解析
`server/src/db/migrate.ts` 中的 `runMigrations` 函数 SHALL 使用 `import.meta.dirname` 替代 `__dirname` 来解析迁移文件目录路径。

#### Scenario: 服务器启动时执行迁移
- **WHEN** `bun run src/index.ts` 启动服务器
- **THEN** `runMigrations()` 不应抛出 `ReferenceError: __dirname is not defined`

### Requirement: 环境变量文件
项目根目录 SHALL 存在 `.env` 文件，基于 `.env.example` 模板，包含可用的默认值。

#### Scenario: 开发者首次克隆项目后启动
- **WHEN** 开发者运行 `bun run dev:server`
- **THEN** `loadEnv()` 能从 `.env` 文件读取配置，无需手动设置所有环境变量

### Requirement: Settings Schema 完整性
`server/src/config/schema.ts` 中的 `SettingsSchema` SHALL 包含 `llmConfig` 字段，与 `shared/types/settings.ts` 中的 `Settings` 接口保持一致。

#### Scenario: 种子数据写入设置
- **WHEN** `seedSettings()` 将 `defaultSettings` 写入数据库
- **THEN** Zod 校验不应因缺少 `llmConfig` schema 而失败

### Requirement: 清理冗余类型依赖
`server/package.json` 的 `devDependencies` SHALL 仅保留 `@types/bun`（Bun 官方推荐），移除冗余的 `bun-types`。

#### Scenario: 安装依赖
- **WHEN** 运行 `bun install`
- **THEN** 不应安装冗余的 `bun-types` 包

## MODIFIED Requirements

### Requirement: 迁移文件路径解析
**原**: `server/src/db/migrate.ts` 使用 `__dirname` 解析迁移目录  
**改**: 使用 `import.meta.dirname` 解析，与 `scripts/migrate.ts` 保持一致

### Requirement: Zod Schema 定义
**原**: `SettingsSchema` 缺少 `llmConfig` 字段  
**改**: 添加 `llmConfig: z.object({ defaultTemperature: z.number(), defaultMaxTokens: z.number(), defaultTopP: z.number() })`