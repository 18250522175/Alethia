# Tasks · 笔记系统、别名增强、文件上传与模型配置

## 别名系统增强

- [x] Task 1.1：编辑器自动补全展示别名信息
  - [x] 修改 `MarkdownEditor.tsx` 的自动补全下拉列表，每个候选项显示 `slug (别名1, 别名2, ...)`
  - [x] 补全列表项包含 slug 和其所有 aliases，支持搜索别名匹配

- [x] Task 1.2：别名补全数据源增强
  - [x] 确保 `getAllAliasMap()` API 返回的数据在前端可用
  - [x] 在 `WikiEntryPage.tsx` 或相关页面中，将 aliasMap 传递给 MarkdownEditor

## 笔记系统

- [x] Task 2.1：创建笔记页面路由和页面框架
  - [x] 在 `web/src/App.tsx` 添加 `/notes` 路由
  - [x] 创建 `web/src/routes/NotesPage.tsx`，包含三栏布局：左侧文件夹树、中间编辑器、右侧元数据面板
  - [x] 左侧文件夹树显示 `notes/` 目录结构（inbox/、drafts/、ready-for-review/）

- [x] Task 2.2：笔记编辑器核心功能
  - [x] 创建笔记文件（API: `POST /api/notes`）
  - [x] 读取笔记文件（API: `GET /api/notes/:path`）
  - [x] 保存笔记内容（API: `PUT /api/notes/:path`）
  - [x] 删除笔记（API: `DELETE /api/notes/:path`）
  - [x] 列表笔记文件（API: `GET /api/notes`）

- [x] Task 2.3：笔记编辑器中集成 Markdown 编辑
  - [x] 在 NotesPage 中嵌入 MarkdownEditor 组件
  - [x] 支持 `[[` 自动补全（复用已有机制）
  - [x] 支持实时预览切换

- [x] Task 2.4：笔记提取与归档流程
  - [x] 元数据面板添加"状态"选择器（draft → ready-for-extraction）
  - [x] 添加"提交提取"按钮，调用 `POST /api/notes/extract`
  - [x] 后端实现笔记提取 API：读取笔记内容 → 调用 extractFacts() → 生成 State Diff
  - [x] 提取完成后，笔记标记为 archived，文件移入 library/objects/

- [x] Task 2.5：笔记页面侧边栏入口
  - [x] 在 `Sidebar.tsx` 的 navItems 中添加 `/notes` 入口（图标：Notebook 或 PencilSimple）

## 可视化文件上传界面

- [x] Task 3.1：创建上传页面路由和页面框架
  - [x] 在 `web/src/App.tsx` 添加 `/upload` 路由
  - [x] 创建 `web/src/routes/UploadPage.tsx`
  - [x] 设计拖拽上传区域（虚线边框、拖拽高亮、点击选择文件）

- [x] Task 3.2：实现文件上传功能
  - [x] 拖拽/点击上传处理逻辑
  - [x] 上传进度条（使用 XMLHttpRequest 或 fetch + ReadableStream）
  - [x] 文件预览（图片缩略图、PDF 图标、文档图标）
  - [x] 批量上传支持
  - [x] 后端 `POST /api/upload` 接收文件并存入 observed_files

- [x] Task 3.3：上传页面侧边栏入口
  - [x] 在 `Sidebar.tsx` 的 navItems 中添加 `/upload` 入口（图标：UploadSimple）

## 可视化模型配置页面

- [x] Task 4.1：创建模型配置 Section
  - [x] 在 `SettingsPage.tsx` 的 sections 数组中添加 `llm-config` section
  - [x] 创建 `LLMConfigSettings` 组件，包含以下子配置区域：
    - 全局参数：温度（temperature）、上下文窗口（contextWindow/maxTokens）、Top P
    - 各厂商配置卡片（百炼、智谱、Moonshot、文心、星火、混元、MiniMax、DeepSeek、Yi、百川）
    - 每个厂商卡片包含：API Key 输入框（带显示/隐藏切换）、Base URL 输入框、启用开关

- [x] Task 4.2：API Key 安全管理
  - [x] API Key 输入框默认脱敏显示（`****`）
  - [x] 提供"显示/隐藏"切换按钮
  - [x] 保存到 SettingsContext 时通过后端 API 安全存储

- [x] Task 4.3：嵌入模型配置增强
  - [x] 在现有 EmbeddingSettings 中增加 base_url 配置项
  - [x] 嵌入模型选择增加"自定义"选项，允许输入任意模型名称

- [x] Task 4.4：后端设置 API 扩展
  - [x] 确保 `PUT /api/settings` 支持保存 llmConfig 字段
  - [x] 确保 `GET /api/settings` 返回 llmConfig 字段（API Key 脱敏）

# Task Dependencies
- Task 1.1 和 1.2 可并行（别名增强）
- Task 2.1–2.5 串行依赖（笔记系统需逐步构建）
- Task 3.1–3.3 可并行（上传系统）
- Task 4.1–4.4 可并行（模型配置）
- 所有 Task 组之间无依赖，可并行开发