# 提示词工程可视化、别名页面迁移、多模态摄入审计 Spec

## Overview
- **Summary**: 审计项目中提示词工程、别名系统页面位置、多模态文件摄入流程，发现并修复不合理设计
- **Purpose**: 1) 提供提示词可视化编辑界面供用户微调；2) 将别名管理从设置页移出为独立页面；3) 修复多模态文件摄入流程中的不合理点
- **Target Users**: 知识库管理员、内容创作者、系统维护者

## Goals
- 提示词可视化编辑：创建独立页面展示和编辑所有提示词文件
- 别名页面迁移：将别名冲突管理从 SettingsPage 移出为独立路由 `/aliases`
- 多模态流程修复：修复图像处理、音频处理、视频处理、PDF 处理中的不合理设计

## Non-Goals (Out of Scope)
- 重写整个文件摄入架构（仅修复现有不合理点）
- 添加新的文件格式支持（仅修复现有格式的问题）
- 添加完整的提示词版本管理（仅提供基础编辑能力）

## Background & Context

### 提示词文件位置
所有提示词文件位于 `/workspace/server/skills/prompts/`：
- generator.zh-CN.md - 知识问答生成器
- grader.zh-CN.md - 检索质量评估器
- planner.zh-CN.md - 知识检索规划器
- reflector.zh-CN.md - 检索反思器

### 别名管理现状
别名冲突管理当前位于 `SettingsPage.tsx` 的 `aliases` section（第 1164-1220 行），用户要求独立页面。

### 多模态处理流程现状
文件摄入入口：`/workspace/server/src/ingest/pipeline.ts` - `ingestFile()` 函数，根据 MIME 分发到对应处理器。

## Functional Requirements

### FR-1: 提示词可视化编辑页面
系统 SHALL 提供独立页面展示所有提示词文件，并支持在线编辑和保存。

### FR-2: 别名页面迁移
系统 SHALL 将别名冲突管理从设置页移出为独立路由 `/aliases`，侧边栏添加入口。

### FR-3: 图像处理优化
系统 SHALL 修复图像处理中的不合理点：VLM 图片传递方式、多语言支持。

### FR-4: 音频处理优化
系统 SHALL 修复音频处理中的不合理点：依赖外部 CLI、同步阻塞、错误恢复。

### FR-5: 视频处理优化
系统 SHALL 修复视频处理中的不合理点：依赖外部 CLI、同步阻塞、缺少帧分析。

### FR-6: PDF 处理优化
系统 SHALL 修复 PDF 处理中的不合理点：不支持扫描版 PDF、未处理内嵌图片。

### FR-7: 通用处理优化
系统 SHALL 添加文件大小限制、进度回调、重试机制。

## Non-Functional Requirements

### NFR-1: 性能
音频/视频处理不应阻塞主事件循环（使用 async 而非 execSync）。

### NFR-2: 健壮性
外部依赖缺失时应优雅降级，而非崩溃或静默失败。

### NFR-3: 安全性
文件摄入应限制文件大小，防止内存溢出攻击。

## Constraints

### Technical
- 保持现有文件结构不变
- 不引入新的第三方依赖（除非必要）
- 保持与现有 API 的兼容性

### Dependencies
- 提示词编辑需后端 API 支持读取/写入提示词文件
- 别名页面需复用现有 `api.getAliasConflicts()` API

## Assumptions
- 用户会定期检查别名冲突
- 提示词文件为 Markdown 格式且相对较小（< 10KB）
- 外部工具（ffmpeg、whisper）在生产环境中可能不可用

## Acceptance Criteria

### AC-1: 提示词编辑页面
- **Given**: 用户访问 `/prompts` 页面
- **When**: 用户点击某个提示词文件
- **Then**: 显示提示词内容，支持编辑并保存
- **Verification**: `human-judgment`

### AC-2: 别名页面独立
- **Given**: 用户访问 `/aliases` 页面
- **When**: 页面加载完成
- **Then**: 显示别名冲突列表，与原设置页内容一致
- **Verification**: `programmatic`

### AC-3: 图像处理不使用大 base64
- **Given**: 上传一张 10MB 的图片
- **When**: 系统处理图片
- **Then**: 不使用 data URL 传递给 LLM，而是使用其他方式（临时文件或流式）
- **Verification**: `programmatic`

### AC-4: 音频处理非阻塞
- **Given**: 上传一个长音频文件
- **When**: 系统处理音频
- **Then**: 主事件循环不被阻塞，其他 API 请求仍可响应
- **Verification**: `human-judgment`

### AC-5: 视频处理包含帧分析
- **Given**: 上传一个视频文件
- **When**: 系统处理视频
- **Then**: 除音频转录外，还提取关键帧进行 VLM 分析
- **Verification**: `programmatic`

### AC-6: PDF OCR 支持
- **Given**: 上传一个扫描版 PDF（纯图片）
- **When**: 系统处理 PDF
- **Then**: 对每页图片进行 OCR，提取文本内容
- **Verification**: `programmatic`

### AC-7: 文件大小限制
- **Given**: 上传一个超过 50MB 的文件
- **When**: 系统处理文件
- **Then**: 返回错误提示，拒绝处理
- **Verification**: `programmatic`

## Open Questions
- [ ] 提示词文件是否需要版本历史？
- [ ] 是否需要支持多语言提示词？
- [ ] 视频帧分析的频率（每秒几帧）？
- [ ] 文件大小限制的具体阈值？