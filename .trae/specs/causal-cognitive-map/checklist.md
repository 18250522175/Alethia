# Checklist · 因果认知地图融合引擎

## 因果 Markdown 语法与数据层

- [x] `causal_edges` 表已创建，包含 source, target, relation, lag, weight, conf, evidence 字段
- [x] `causal_cpt` 表已创建，支持 JSONB 条件概率存储
- [x] `causal_versions` 表已创建，支持版本快照
- [x] `causal_alerts` 表已创建，支持阈值预警
- [x] Markdown 解析器识别 `## Causal Model` 区块
- [x] 因果声明行正确解析为 `(source, target, relation, lag, weight, conf, evidence)`
- [x] `## Causal CPT` 表格正确解析
- [x] `rebuild-struct` 重建因果图缓存
- [x] `GET /api/causal/graph` 返回完整因果图

## 因果认知地图可视化

- [x] 认知地图画布组件渲染因果节点和边
- [x] 节点颜色随 KPI 状态自动变化
- [x] 支持节点拖拽操作
- [x] 右键菜单支持打包/解包/透视
- [x] 打包生成虚拟节点，双击可展开内部结构
- [x] 透视模式：悬停浮现内部关键连接
- [x] 多分支并行展开互不干扰
- [x] 视图状态存储于 IndexedDB
- [x] `/cognitive-map` 路由已注册
- [x] 侧边栏包含认知地图入口

## AI 自然语言操控

- [x] `POST /api/causal/nl-command` 接口可用
- [x] 自然语言指令正确转化为图操作
- [x] 前端自然语言输入框可用
- [x] AI 智能建议系统可用
- [x] 建议卡片可一键执行

## 因果推理引擎

- [x] 贝叶斯网络推理引擎实现
- [x] `P(目标 | do(干预))` 计算正确
- [x] 时间脉冲响应模拟可用
- [x] 反事实推理与回溯推演可用
- [x] 因果问答集成到共生问答面板

## 证据链、护栏与版本化

- [x] 因果边关联 evidence span
- [x] 悬停展示原文双语引用
- [x] 推理报告附带置信区间
- [x] 假设前提卡片可折叠
- [x] 因果模型版本提交/切换可用
- [x] 分歧对比视图可用
- [x] 因果预警链路可用
- [x] 父节点状态变化触发通知

## 视图-真相解耦

- [x] 视图状态独立于 Markdown 知识真相
- [x] 前端虚拟化渲染（仅渲染视口内节点）
- [x] 后端异步增量计算（夜间预计算 + 按需提取）