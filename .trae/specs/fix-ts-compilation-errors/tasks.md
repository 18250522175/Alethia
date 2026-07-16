# Tasks

## 变量作用域修复

- [x] Task 1: 修复 retriever.ts 中 `plan` 未定义
  - `getEvidenceForPages` 函数需要 `plan` 参数但未传入
  - 将 `plan.depth` 替换为合理的默认值（如 `'medium'`），或修改函数签名接收 `plan` 参数
  - 文件：`server/src/agents/retriever.ts:65`

- [x] Task 2: 修复 brainapi/index.ts 中 `nextVersion` 作用域
  - `nextVersion` 在 `if (existsSync(targetFile))` 块内定义，但在块外 return 中使用
  - 在函数顶部声明 `let nextVersion = 0`，块内赋值
  - 文件：`server/src/brainapi/index.ts:516-553`

- [x] Task 3: 修复 OnboardingPage.tsx 中 `GraphIcon` 未导入
  - 移除 `GraphIcon` 引用，使用已有的其他图标替代（如 `Graph` from `@phosphor-icons/react`）
  - 文件：`web/src/routes/OnboardingPage.tsx:65`

## 缺失方法/属性实现

- [x] Task 4: 在 MarkdownStorage 中实现 `saveLibraryFile` 和 `getSkillsPath`
  - 在 `server/src/storage/markdown.ts` 中添加 `saveLibraryFile(hash: string, content: string): void` 方法
  - 在 `server/src/storage/markdown.ts` 中添加 `getSkillsPath(): string` 方法
  - 文件：`server/src/storage/markdown.ts`

- [x] Task 5: 修复 brainapi 路由中 `extractFacts` 调用方式
  - `extractFacts` 是独立函数，不是 BrainAPI 的实例方法
  - 将 `brainAPI.extractFacts(content, notePath)` 改为直接调用 `extractFacts(content, notePath)`
  - 文件：`server/src/routes/brainapi.ts:1738`

## 缺失类型字段

- [x] Task 6: 在 defaultSettings 中补充 `llmConfig` 字段
  - 添加 `llmConfig: { defaultTemperature: 0.7, defaultMaxTokens: 4096, defaultTopP: 0.9 }`
  - 文件：`server/src/config/defaults.ts:4`

- [x] Task 7: 修复 video.ts 中 `VideoProcessResult` 缺少 `frames` 字段
  - 在两处错误返回中添加 `frames: []`
  - 文件：`server/src/ingest/video.ts:44,72`

## 类型不匹配/API 误用修复

- [x] Task 8: 修复 fetch 中 `timeout` 选项（Bun 不支持）
  - 将所有 `fetch(url, { timeout: 5000 })` 改为使用 `AbortController` + `setTimeout` 实现超时
  - 或直接移除 `timeout` 选项（Bun 原生 fetch 不支持该字段）
  - 文件：`server/src/brainapi/index.ts` (6 处：1921, 1941, 1956, 1975, 1985 + 还有一处)

- [x] Task 9: 修复 intent.ts 中 `logger.warn` 传入 `unknown` 类型
  - 将 error 参数转为 string：`logger.warn(msg, String(error))`
  - 文件：`server/src/causal/intent.ts:70,224`

- [x] Task 10: 修复 image.ts 中 `os.join` 导入错误
  - 将 `import { join } from 'os'` 改为 `import { join } from 'path'`
  - 文件：`server/src/ingest/image.ts:4`

- [x] Task 11: 修复 web.ts 中 `html` 变量使用前未赋值
  - 在函数顶部声明 `let html = ''`
  - 文件：`server/src/ingest/web.ts:56`

- [x] Task 12: 修复 brainapi 路由中 `.entries()` 和 `string | undefined` 问题
  - 将 `c.req.query.entries()` 改为 `Object.entries(c.req.query())`
  - 为 `c.req.param('*')` 添加空值检查
  - 文件：`server/src/routes/brainapi.ts:1336,1483`

- [x] Task 13: 修复 index.ts 中 `Record<string, string>` 类型转换
  - 将 `as Record<string, string>` 改为 `as Record<string, string | number>`
  - 文件：`server/src/index.ts:81`

- [x] Task 14: 修复 audio.ts 中 `encoding` 与 `stdio` 选项不兼容
  - 移除 `encoding: 'utf-8'` 选项
  - 文件：`server/src/ingest/audio.ts:68`

## 隐式类型修复

- [x] Task 15: 修复 brainapi/index.ts 中 xml2js 隐式 any 类型
  - 为回调参数添加类型标注：`(_: any, result: any) =>`
  - 声明 `json` 为 `any` 类型
  - 文件：`server/src/brainapi/index.ts:1959-1963`

## 前端类型修复

- [x] Task 16: 修复 CausalSuggestions 中 `moduleType` 不在 API 响应类型中
  - 在 `api.ts` 的 `getCausalSuggestions` 返回类型中添加 `moduleType?: string`
  - 文件：`web/src/lib/api.ts:1007-1017`

# Task Dependencies
- Task 4 独立（MarkdownStorage 类修改）
- Task 5 独立（路由调用方式修正）
- Task 8 和 Task 15 在同一文件，可合并处理
- Task 12 同一文件内两处修复，可合并处理
- 其余 Task 互不依赖，可并行执行

**可并行执行**：Task 1-16 全部互不依赖，可全并行