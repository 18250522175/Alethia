# 笔记系统、别名增强、文件上传与模型配置 Spec

## Why
当前知识库缺少"创作-提取-归档"闭环：用户无法在知识库内直接撰写笔记并由 AI 自动提取知识；别名系统后端已实现但前端体验不完整；文件上传缺可视化界面；模型配置分散在环境变量中，缺乏可视化配置页面。

## What Changes

### 别名系统增强（后端已实现，前端完善）
- Wiki 链接渲染已支持 `aliasMap` 解析，需确保别名补全下拉列表同时显示 slug 和所有别名
- 编辑器 `[[` 自动补全需展示别名信息
- 补充 AI 辅助别名建议（Dream Cycle 中 Analyze 阶段）

### 笔记系统（全新）
- 新增 `notes/` 目录结构（inbox/、drafts/、ready-for-review/）
- 新增笔记编辑器页面（Markdown 编辑器 + 文件夹树 + 元数据面板）
- 笔记生命周期：创作 → 标记提取 → AI 提取知识 → 审核 → 归档至 Library
- 侧面栏新增笔记入口

### 可视化文件上传界面（全新）
- 新增文件上传页面，支持拖拽/点击上传，支持图片、PDF、文档等多模态文件
- 上传进度显示、文件预览、批量上传
- 上传后自动入观察区（observed_files）

### 可视化模型配置页面（全新）
- 设置页新增"模型配置"独立 section，可自由设置：
  - 对话温度（temperature）
  - 上下文窗口大小（context window / max_tokens）
  - API Key（各厂商独立配置）
  - Base URL（各厂商独立配置）
  - 词嵌入模型配置
- 覆盖 `.env.example` 中所有厂商（百炼、智谱、Moonshot、文心、星火、混元、MiniMax、DeepSeek、Yi、百川）

## Impact
- Affected specs: `audit-stats-ui`（侧边栏入口）
- Affected code:
  - `web/src/App.tsx`（新增路由）
  - `web/src/routes/`（新增 NotesPage、UploadPage）
  - `web/src/components/`（MarkdownEditor、MarkdownRenderer 增强）
  - `web/src/layouts/Sidebar.tsx`（新增入口）
  - `web/src/routes/SettingsPage.tsx`（新增模型配置 section）
  - `server/src/brainapi/index.ts`（笔记提取 API）
  - `server/src/routes/brainapi.ts`（新增路由）
  - `server/src/evolution/dream.ts`（别名建议任务）
  - `shared/types/`（新增笔记类型）

## ADDED Requirements

### Requirement: 笔记系统
系统 SHALL 提供完整的笔记创作、提取、归档工作流。

#### Scenario: 创建笔记
- **WHEN** 用户在笔记页面点击"新建笔记"
- **THEN** 在 `notes/drafts/` 创建 `.md` 文件，打开编辑器

#### Scenario: Markdown 编辑
- **WHEN** 用户在笔记编辑器中输入 `[[`
- **THEN** 弹出自动补全下拉列表，同时显示 slug 和所有别名

#### Scenario: 提取知识
- **WHEN** 用户标记笔记为"可提取"并点击"提交提取"
- **THEN** 系统调用 `extractFacts()` 解析笔记，生成 State Diff 进入预览区

#### Scenario: 归档笔记
- **WHEN** 用户确认提取结果
- **THEN** 笔记原文件移至 `library/objects/`，注册哈希，标记为 `fully_extracted`

### Requirement: 可视化文件上传
系统 SHALL 提供拖拽式多模态文件上传界面。

#### Scenario: 拖拽上传
- **WHEN** 用户拖拽文件到上传区域
- **THEN** 显示上传进度条，上传完成后文件出现在观察文件列表

#### Scenario: 多模态支持
- **WHEN** 用户上传图片/PDF/文档
- **THEN** 系统接受文件并显示缩略图预览

### Requirement: 可视化模型配置
系统 SHALL 在设置页面提供可视化模型参数配置。

#### Scenario: 配置温度
- **WHEN** 用户在模型配置页调整温度滑块
- **THEN** 设置保存到 SettingsContext，影响后续 LLM 调用

#### Scenario: 配置 API Key
- **WHEN** 用户输入各厂商 API Key
- **THEN** Key 安全存储（脱敏显示），支持显示/隐藏切换

#### Scenario: 配置 Base URL
- **WHEN** 用户为某厂商设置自定义 Base URL
- **THEN** 该厂商的 API 请求使用自定义端点

## MODIFIED Requirements

### Requirement: 别名自动补全
系统 SHALL 在 Markdown 编辑器中输入 `[[` 时，下拉列表同时显示规范 slug 和所有别名。

#### Scenario: 别名补全
- **WHEN** 用户在编辑器中输入 `[[熵`
- **THEN** 下拉列表显示 `entropy`（规范 slug）及其别名 `[熵, Entropy, 热力学熵]`

### Requirement: 侧边栏导航
系统 SHALL 在侧边栏提供笔记和上传入口。

#### Scenario: 笔记入口
- **WHEN** 侧边栏渲染
- **THEN** 包含"笔记"导航入口，链接到 `/notes`