# Checklist · 笔记系统、别名增强、文件上传与模型配置

## 别名系统增强

### 1.1 编辑器自动补全
- [x] MarkdownEditor 自动补全下拉列表每个候选项显示 `slug (别名1, 别名2, ...)`
- [x] 输入别名可匹配到对应 slug
- [x] 补全列表正确处理无别名实体的显示

### 1.2 别名补全数据源
- [x] `getAllAliasMap()` API 返回数据在前端可用
- [x] aliasMap 正确传递给 MarkdownEditor 组件
- [x] WikiEntryPage 编辑器中别名补全工作正常

## 笔记系统

### 2.1 笔记页面路由和框架
- [x] `/notes` 路由在 App.tsx 中注册
- [x] NotesPage 包含三栏布局（文件夹树 + 编辑器 + 元数据面板）
- [x] 左侧文件夹树显示 notes/ 目录结构

### 2.2 笔记 CRUD API
- [x] `POST /api/notes` 创建笔记文件
- [x] `GET /api/notes` 列表笔记文件
- [x] `GET /api/notes/:path` 读取笔记内容
- [x] `PUT /api/notes/:path` 保存笔记内容
- [x] `DELETE /api/notes/:path` 删除笔记

### 2.3 笔记编辑器集成
- [x] NotesPage 嵌入 MarkdownEditor 组件
- [x] `[[` 自动补全在笔记编辑器中可用
- [x] 支持编辑/预览模式切换

### 2.4 笔记提取与归档
- [x] 元数据面板有状态选择器（draft / ready-for-extraction）
- [x] "提交提取"按钮触发 API 调用
- [x] 后端 `POST /api/notes/extract` 实现
- [x] 提取后笔记归档至 library/objects/

### 2.5 笔记侧边栏入口
- [x] 侧边栏包含 `/notes` 导航入口
- [x] 笔记入口图标和标签正确显示

## 可视化文件上传

### 3.1 上传页面路由和框架
- [x] `/upload` 路由在 App.tsx 中注册
- [x] UploadPage 包含拖拽上传区域
- [x] 拖拽区域有虚线边框、拖拽高亮效果

### 3.2 文件上传功能
- [x] 支持拖拽上传文件
- [x] 支持点击选择文件上传
- [x] 上传进度条显示
- [x] 图片文件显示缩略图预览
- [x] 非图片文件显示对应图标
- [x] 后端 `POST /api/upload` 接收文件
- [x] 上传后文件出现在 observed_files

### 3.3 上传页面侧边栏入口
- [x] 侧边栏包含 `/upload` 导航入口
- [x] 上传入口图标和标签正确显示

## 可视化模型配置

### 4.1 模型配置 Section
- [x] SettingsPage 包含 `llm-config` section
- [x] 全局参数：温度滑块、上下文窗口输入、Top P 滑块
- [x] 每个厂商有独立配置卡片
- [x] 每个卡片包含 API Key、Base URL、启用开关

### 4.2 API Key 安全管理
- [x] API Key 默认脱敏显示
- [x] 提供显示/隐藏切换按钮
- [x] 保存时通过后端 API 安全存储

### 4.3 嵌入模型配置增强
- [x] EmbeddingSettings 包含 base_url 配置项
- [x] 嵌入模型选择支持"自定义"选项

### 4.4 后端设置 API
- [x] `PUT /api/settings` 支持 llmConfig 字段
- [x] `GET /api/settings` 返回 llmConfig（API Key 脱敏）