# 提示词工程可视化、别名页面迁移、多模态摄入审计 - 验证清单

## 提示词可视化编辑页面

- [x] `/prompts` 路由在 App.tsx 中注册
- [x] PromptsPage.tsx 显示所有提示词文件列表（generator, grader, planner, reflector）
- [x] 点击提示词文件可查看内容
- [x] 支持在线编辑提示词内容
- [x] 保存按钮能更新提示词文件
- [x] 后端 API `/api/prompts` 返回提示词列表
- [x] 后端 API `GET /api/prompts/:name` 返回提示词内容
- [x] 后端 API `PUT /api/prompts/:name` 更新提示词内容
- [x] 侧边栏包含 `/prompts` 导航入口

## 别名页面迁移

- [x] `/aliases` 路由在 App.tsx 中注册
- [x] AliasesPage.tsx 从 SettingsPage 提取，内容一致
- [x] SettingsPage.tsx 中删除 aliases section 和 aliases 导航项
- [x] 侧边栏包含 `/aliases` 导航入口（使用 Link 图标）
- [x] `/aliases` 页面正常加载别名冲突列表

##### 图像处理优化

- [x] VLM 不使用 data URL 传递大图片（使用临时文件或流式）
- [x] OCR 支持多语言自动检测
- [x] 图片处理失败时优雅降级，返回警告而非崩溃

## 音频处理优化

- [x] 音频处理使用 async 而非 execSync（不阻塞主事件循环）
- [x] whisper 缺失时优雅降级，返回警告
- [x] 音频转录失败时有错误恢复机制

##### 视频处理优化

- [x] 视频处理使用 async 而非 execSync
- [x] ffmpeg 缺失时优雅降级，返回警告
- [x] 视频处理除音频转录外，还提取关键帧进行 VLM 分析
- [x] 帧分析结果包含在 sections 中

### PDF 处理优化

- [x] 扫描版 PDF（纯图片）能通过 OCR 提取文本
- [x] PDF 中的内嵌图片能被处理和描述
- [x] OCR 失败时优雅降级，仅使用文本提取

### 通用处理优化

- [x] 文件大小超过 50MB 时返回错误
- [x] 摄入过程提供进度回调（百分比）
- [x] 重试机制（失败时重试最多 3 次）
- [x] 所有处理失败时返回明确的错误信息