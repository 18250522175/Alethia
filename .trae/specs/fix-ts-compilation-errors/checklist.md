# Checklist

## 变量作用域修复
- [x] `server/src/agents/retriever.ts:65` — `plan` 变量已定义或引用已修正
- [x] `server/src/brainapi/index.ts:553` — `nextVersion` 在函数顶层声明，块内赋值
- [x] `web/src/routes/OnboardingPage.tsx:65` — `GraphIcon` 已正确导入或替换

## 缺失方法/属性实现
- [x] `server/src/storage/markdown.ts` — `saveLibraryFile` 方法已实现
- [x] `server/src/storage/markdown.ts` — `getSkillsPath` 方法已实现
- [x] `server/src/routes/brainapi.ts:1738` — `extractFacts` 调用方式已修正为独立函数调用

## 缺失类型字段
- [x] `server/src/config/defaults.ts` — `llmConfig` 字段已添加默认值
- [x] `server/src/ingest/video.ts:44` — 错误返回已添加 `frames: []`
- [x] `server/src/ingest/video.ts:72` — 错误返回已添加 `frames: []`

## 类型不匹配/API 误用修复
- [x] `server/src/brainapi/index.ts` — 所有 fetch 调用已移除 `timeout` 选项或用 AbortController 替代
- [x] `server/src/causal/intent.ts:70` — `logger.warn` 的 error 参数已转为 string
- [x] `server/src/causal/intent.ts:224` — `logger.warn` 的 error 参数已转为 string
- [x] `server/src/ingest/image.ts:4` — `os.join` 导入已改为 `path.join`
- [x] `server/src/ingest/web.ts` — `html` 变量已初始化
- [x] `server/src/routes/brainapi.ts:1336` — `.entries()` 已改为兼容写法
- [x] `server/src/routes/brainapi.ts:1483` — `string | undefined` 已添加空值检查
- [x] `server/src/index.ts:81` — `Record<string, string>` 类型转换已修正
- [x] `server/src/ingest/audio.ts:68` — `encoding` 选项已移除

## 隐式类型修复
- [x] `server/src/brainapi/index.ts:1959` — 回调参数已添加类型标注
- [x] `server/src/brainapi/index.ts:1960,1963` — `json` 类型已显式声明

## 前端类型修复
- [x] `web/src/lib/api.ts` — `getCausalSuggestions` 返回类型已添加 `moduleType`

## 最终验证
- [x] `npx tsc --noEmit --project server/tsconfig.json` 无错误
- [x] `npx tsc --noEmit --project web/tsconfig.json` 无错误