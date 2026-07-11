# Checklist

## 审计完成度
- [x] LLM/Agent 系统已审计
- [x] QA 对话系统已审计
- [x] Evolution 进化系统已审计
- [x] 检索系统已审计
- [x] Settings 系统已审计
- [x] 错误处理机制已审计
- [x] 代码冗余已审计
- [x] 死代码已统计

## 问题/错误（12 项）
- [x] QAPanelPage 重复 Conversation 接口已记录
- [x] 数据库迁移文件命名冲突已记录
- [x] 大量空 catch 块吞没错误已记录
- [x] LLM Router 无故障转移已记录
- [x] Evolution 系统缺少触发机制已记录
- [x] 项目仅有 1 个测试文件已记录
- [x] 检索系统 executeQuery 无错误隔离已记录
- [x] OnboardingPage 未使用的 Graph 导入已记录
- [x] executeAdvancedSearch 查询不存在的列已记录
- [x] graphTraverse 结果未去重已记录
- [x] Agent 系统缺少超时控制已记录
- [x] Settings 配置项可能无实际效果已记录

## 未实现功能/控件（8 项）
- [x] LLM 对话缺少流式输出已记录
- [x] LLM 适配器缺少速率限制已记录
- [x] Evolution 周报缺少前端展示已记录
- [x] 检索系统缺少搜索历史已记录
- [x] Agent 翻译功能缺少前端入口已记录
- [x] Settings 页面缺少 LLM 模型分配 UI 已记录
- [x] ObservedFilesPage 缺少实时通知已记录
- [x] PromptsPage 缺少导入/导出已记录

## 缺失功能/UI 跳转（4 项）
- [x] QA 对话缺少认知地图跳转已记录
- [x] ChangelogPage 缺少查看受影响页面跳转已记录
- [x] EvalReportPage 缺少重新运行评测已记录
- [x] Settings 缺少 LLM 连接测试已记录

## 冗余/死代码（6 项）
- [x] GraphFullPage.tsx 已是死代码已记录
- [x] graphFull.* i18n 翻译键已是死代码已记录
- [x] QAPanelPage Conversation 重复定义已记录
- [x] clusters/communities 数据库表未使用已记录
- [x] agents/feedback.ts 可能未被调用已记录
- [x] Migration 文件序列不连续已记录