# Checklist

## JSON 语法修复
- [x] `web/src/i18n/locales/zh-CN.json` — 第 783 行 `// DEPRECATED` 注释已移除
- [x] `web/src/i18n/locales/en.json` — 第 783 行 `// DEPRECATED` 注释已移除
- [x] 两个文件均为合法 JSON（`python3 -c "import json; json.load(open(...))"` 通过）

## 构建验证
- [x] `npx vite build` 无错误完成
- [x] `dist/` 目录已生成

## 路由验证
- [x] 所有路由对应的页面组件文件存在
- [x] 无未使用的悬空路由引用