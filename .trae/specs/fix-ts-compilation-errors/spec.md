# 修复 TypeScript 编译错误 Spec

## Why
项目当前存在 32 个 TypeScript 编译错误（server 29 个 + web 3 个），导致 `tsc --noEmit` 无法通过。这些错误涵盖变量作用域、缺失方法、类型不匹配、隐式 any 等多种类型，影响代码质量和开发体验。

## What Changes
- 修复变量作用域/未定义引用（5 个错误）
- 补充缺失的方法/属性实现（7 个错误）
- 补充缺失的类型字段（3 个错误）
- 修复类型不匹配/API 误用（13 个错误）
- 修复隐式 any/unknown 类型（4 个错误）

## Impact
- Affected specs: 无（纯 bug 修复）
- Affected code: server/src/agents/retriever.ts, server/src/brainapi/index.ts, server/src/config/defaults.ts, server/src/index.ts, server/src/ingest/audio.ts, server/src/ingest/image.ts, server/src/ingest/video.ts, server/src/ingest/web.ts, server/src/causal/intent.ts, server/src/routes/brainapi.ts, web/src/components/CognitiveMap/CausalSuggestions.tsx, web/src/routes/OnboardingPage.tsx, web/src/lib/api.ts

## ADDED Requirements

### Requirement: 变量作用域修复
系统 SHALL 确保所有变量在使用前已正确定义且处于可见作用域内。

#### Scenario: retriever 中 plan 未定义
- **WHEN** `getEvidenceForPages` 函数引用 `plan.depth`
- **THEN** `plan` 应作为函数参数传入，或从调用上下文获取

#### Scenario: applyDiff 中 nextVersion 作用域
- **WHEN** `nextVersion` 在 if 块内定义但在块外 return 中使用
- **THEN** 应在函数顶层声明 `let nextVersion = 0`，在块内赋值

#### Scenario: OnboardingPage 中 GraphIcon 未导入
- **WHEN** 组件引用 `GraphIcon`
- **THEN** 应正确导入该图标组件

### Requirement: 缺失方法/属性实现
系统 SHALL 为所有被引用的方法提供实现，或修正调用方式。

#### Scenario: MarkdownStorage 缺失 saveLibraryFile
- **WHEN** 代码调用 `storage.saveLibraryFile(sha256, content)`
- **THEN** 应在 MarkdownStorage 类中实现该方法，将文件写入 library 目录

#### Scenario: MarkdownStorage 缺失 getSkillsPath
- **WHEN** 代码 4 次调用 `storage.getSkillsPath()`
- **THEN** 应在 MarkdownStorage 类中实现该方法，返回 skills 目录路径

#### Scenario: brainAPI.extractFacts 不是实例方法
- **WHEN** 路由调用 `brainAPI.extractFacts(content, notePath)`
- **THEN** 应改为调用独立的 `extractFacts` 函数（已从 `../agents/observe` 导入）

### Requirement: 缺失类型字段
系统 SHALL 确保所有对象字面量满足其类型声明。

#### Scenario: defaultSettings 缺少 llmConfig
- **WHEN** Settings 类型要求 `llmConfig: LLMGlobalConfig`
- **THEN** 应在 defaultSettings 中添加 `llmConfig` 字段及默认值

#### Scenario: VideoProcessResult 缺少 frames
- **WHEN** 函数返回 `{ text: '', segments: [], warnings }` 但类型要求 `frames: string[]`
- **THEN** 应在返回值中添加 `frames: []` 字段

### Requirement: 类型不匹配修复
系统 SHALL 确保函数调用参数类型与签名匹配。

#### Scenario: fetch 使用 timeout 选项（Bun 不支持）
- **WHEN** 代码 `fetch(url, { timeout: 5000 })` 在 Bun 环境下
- **THEN** 应使用 `AbortController` + `setTimeout` 替代，或移除 timeout 选项

#### Scenario: logger.warn 传入 unknown 类型
- **WHEN** `logger.warn(msg, error)` 中 error 为 `unknown` 类型
- **THEN** 应将 error 转为 string：`String(error)` 或 `(error as Error).message`

#### Scenario: os.join 导入错误
- **WHEN** `import { join } from 'os'` 但 os 模块无 join 导出
- **THEN** 应改为 `import { join } from 'path'`

#### Scenario: html 变量使用前未赋值
- **WHEN** `html` 在 try 块内赋值但 catch 块外使用
- **THEN** 应在函数顶部声明 `let html = ''` 初始化

#### Scenario: Hono query.entries() 不存在
- **WHEN** 代码 `c.req.query.entries()` 在 Hono 框架中
- **THEN** 应使用 `Object.entries(c.req.query())` 或 `c.req.queries()` 替代

#### Scenario: string | undefined 赋值给 string
- **WHEN** `c.req.param('*')` 返回 `string | undefined`
- **THEN** 应添加空值检查或使用默认值

#### Scenario: Record<string, string> 类型转换含 number 值
- **WHEN** env 对象含 `BRAIN_PORT: number` 但被转为 `Record<string, string>`
- **THEN** 应改为 `Record<string, string | number>` 或使用 `as any`

### Requirement: 隐式类型修复
系统 SHALL 为所有变量提供显式类型标注。

#### Scenario: xml2js 回调参数隐式 any
- **WHEN** `parser.parseString(xml, (_, result) => resolve(result))` 参数无类型
- **THEN** 应添加类型标注：`(_: any, result: any)`

#### Scenario: json 变量为 unknown 类型
- **WHEN** `json.rss?.channel?.title` 访问 unknown 类型属性
- **THEN** 应声明 `json` 为 `any` 类型，或添加类型守卫

### Requirement: 前端 API 响应类型补充
系统 SHALL 确保 API 响应类型与实际使用字段一致。

#### Scenario: CausalSuggestions 中 moduleType 不在 API 响应类型中
- **WHEN** 组件访问 `suggestion.moduleType` 但 API 响应类型不含此字段
- **THEN** 应在 `api.ts` 的 `getCausalSuggestions` 返回类型中添加 `moduleType?: string`

### Requirement: audio.ts 编码选项修复
系统 SHALL 确保 execAsync 选项兼容。

#### Scenario: encoding 与 stdio 选项不兼容
- **WHEN** `execAsync` 同时传入 `encoding: 'utf-8'` 和 `stdio: [...]`
- **THEN** 应移除 `encoding` 选项（stdio 模式已指定输出流类型）