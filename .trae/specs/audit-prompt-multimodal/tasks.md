# 提示词工程可视化、别名页面迁移、多模态摄入审计 - 实施计划

## [x] Task 1: 创建提示词可视化编辑页面
- **Priority**: high
- **Depends On**: None
- **Description**: 创建独立的提示词编辑页面，展示所有提示词文件，支持在线编辑和保存
- **Acceptance Criteria Addressed**: AC-1
- **Test Requirements**:
  - `human-judgement` TR-1.1: `/prompts` 页面显示所有提示词文件列表（generator, grader, planner, reflector）
  - `human-judgement` TR-1.2: 点击文件可查看内容，支持编辑和保存
  - `programmatic` TR-1.3: 后端 API `/api/prompts` 返回提示词列表，`GET /api/prompts/:name` 返回内容，`PUT /api/prompts/:name` 更新内容
- **Notes**: 需要在 App.tsx 添加路由，创建 PromptsPage.tsx，添加后端 API，添加侧边栏入口

## [x] Task 2: 别名页面迁移
- **Priority**: high
- **Depends On**: None
- **Description**: 将别名冲突管理从 SettingsPage 移出为独立路由 `/aliases`，侧边栏添加入口
- **Acceptance Criteria Addressed**: AC-2
- **Test Requirements**:
  - `programmatic` TR-2.1: `/aliases` 路由在 App.tsx 中注册
  - `programmatic` TR-2.2: 侧边栏包含 `/aliases` 导航入口（使用 Link 图标）
  - `human-judgement` TR-2.3: `/aliases` 页面内容与原 SettingsPage 中 aliases section 一致
- **Notes**: 创建 AliasesPage.tsx，从 SettingsPage.tsx 提取 AliasSettings 组件，删除 SettingsPage 中的 aliases section，在侧边栏添加入口

## [x] Task 3: 图像处理优化
- **Priority**: high
- **Depends On**: None
- **Description**: 修复图像处理中的不合理点：1) VLM 使用 data URL 传递大图片；2) OCR 固定使用中英混合识别
- **Acceptance Criteria Addressed**: AC-3
- **Test Requirements**:
  - `programmatic` TR-3.1: 图片处理不使用 data URL，而是使用临时文件或流式上传
  - `programmatic` TR-3.2: OCR 支持多语言（根据检测到的语言自动选择）
- **Notes**: 修改 `server/src/ingest/image.ts`，优化 VLM 调用方式，改进 OCR 语言选择

## [x] Task 4: 音频处理优化
- **Priority**: medium
- **Depends On**: None
- **Description**: 修复音频处理中的不合理点：1) 使用 execSync 同步阻塞；2) 依赖外部 CLI；3) 缺少错误恢复
- **Acceptance Criteria Addressed**: AC-4
- **Test Requirements**:
  - `human-judgement` TR-4.1: 音频处理使用 async 而非同步 execSync
  - `programmatic` TR-4.2: whisper 缺失时优雅降级，返回警告而非崩溃
- **Notes**: 修改 `server/src/ingest/audio.ts`，将 execSync 替换为 exec 或 spawn，添加错误处理

## [x] Task 5: 视频处理优化
- **Priority**: medium
- **Depends On**: Task 4
- **Description**: 修复视频处理中的不合理点：1) 使用 execSync 同步阻塞；2) 仅提取音频，缺少帧分析
- **Acceptance Criteria Addressed**: AC-5
- **Test Requirements**:
  - `human-judgement` TR-5.1: 视频处理使用 async 而非同步 execSync
  - `programmatic` TR-5.2: 视频处理除音频转录外，还提取关键帧进行 VLM 分析
- **Notes**: 修改 `server/src/ingest/video.ts`，将 execSync 替换为 exec，添加帧提取逻辑

## [x] Task 6: PDF 处理优化
- **Priority**: medium
- **Depends On**: Task 3 (OCR)
- **Description**: 修复 PDF 处理中的不合理点：1) 不支持扫描版 PDF；2) 未处理内嵌图片
- **Acceptance Criteria Addressed**: AC-6
- **Test Requirements**:
  - `programmatic` TR-6.1: 扫描版 PDF（纯图片）能通过 OCR 提取文本
  - `programmatic` TR-6.2: PDF 中的内嵌图片能被处理和描述
- **Notes**: 修改 `server/src/ingest/document.ts` 中的 parsePdf 函数，集成 OCR 和图片处理

## [x] Task 7: 通用处理优化
- **Priority**: high
- **Depends On**: None
- **Description**: 添加文件大小限制、进度回调、重试机制
- **Acceptance Criteria Addressed**: AC-7
- **Test Requirements**:
  - `programmatic` TR-7.1: 文件大小超过 50MB 时返回错误
  - `programmatic` TR-7.2: 摄入过程提供进度回调（百分比）
- **Notes**: 修改 `server/src/ingest/pipeline.ts`，添加文件大小检查，添加进度回调机制

# Task Dependencies
- Task 5 (视频处理) depends on Task 4 (音频处理优化)
- Task 6 (PDF 处理) depends on Task 3 (图像处理优化)
- All other tasks are independent