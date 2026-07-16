# 前端 UI 交互调试 Spec

## Why
TypeScript 编译错误已清零，但 `vite build` 构建失败：locale JSON 文件存在非法注释，导致前端无法打包部署。此外需排查可能的运行时 UI 交互问题。

## What Changes
- 修复 locale JSON 文件中的非法注释（2 个文件）
- 验证 Vite build 通过
- 修复前端 UI 交互中的潜在问题

## Impact
- Affected specs: 无
- Affected code: `web/src/i18n/locales/zh-CN.json`, `web/src/i18n/locales/en.json`

## ADDED Requirements

### Requirement: JSON 文件语法合规
系统 SHALL 确保所有 JSON 文件为合法 JSON 格式，不包含注释或尾随逗号等非法语法。

#### Scenario: locale JSON 文件包含 `//` 注释导致构建失败
- **WHEN** Vite 打包时解析 `zh-CN.json` 和 `en.json`
- **THEN** 应移除 `// DEPRECATED` 注释行，保持 JSON 合法

### Requirement: Vite 生产构建通过
系统 SHALL 确保 `vite build` 无错误完成。

#### Scenario: 构建成功
- **WHEN** 运行 `npx vite build`
- **THEN** 输出 dist 目录，无构建错误

### Requirement: 前端路由完整性
系统 SHALL 确保所有路由引用的页面组件存在且可正常加载。

#### Scenario: 路由页面存在
- **WHEN** 访问任意已定义路由
- **THEN** 对应页面组件可正常渲染，无 404 或白屏