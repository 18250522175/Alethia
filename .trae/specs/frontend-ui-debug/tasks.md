# Tasks

- [x] Task 1: 修复 locale JSON 文件中的非法注释
  - 移除 `web/src/i18n/locales/zh-CN.json` 第 783 行的 `// DEPRECATED: graphFull keys are deprecated, page merged into CausalCanvas` 注释
  - 移除 `web/src/i18n/locales/en.json` 第 783 行的相同注释
  - 验证两个文件均为合法 JSON

- [x] Task 2: 验证 Vite 生产构建通过
  - 运行 `npx vite build` 确认构建成功
  - 确认 dist 目录生成

# Task Dependencies
- Task 2 依赖 Task 1