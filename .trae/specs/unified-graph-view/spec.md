# 知识图谱与认知地图融合视图 Spec

## Overview
- **Summary**: 将知识图谱（实体关系）与认知地图（因果链）融合到同一画布上统一显示，提供独立的边类型开关，并实现跨边类型的聚类功能。
- **Purpose**: 让用户在同一视图中同时观察实体间的语义关系和因果推理链，通过开关灵活切换视角，降低在两个独立视图间来回切换的认知负担。
- **Target Users**: 分析师、知识库管理员、决策者
- **Version**: v0.5.2 → v0.5.3（增量特性）

## Why
当前认知地图页面（`/cognitive-map`）仅显示因果边（`causal_edges`），知识图谱页面（`/graph`）仅显示语义关系边（`links`）。用户无法在同一画布上同时观察"实体间的语义关联"和"变量间的因果推理链"，导致分析时需要频繁切换视图。此外，现有的聚类算法仅针对单一类型的边，无法发现跨知识/因果的复合模块。

## What Changes
- **修改** `CausalCanvas.tsx`：同时获取知识图谱数据（`GET /graph`）和认知地图数据（`GET /api/causal/graph`），融合渲染
- **修改** `CausalToolbar.tsx`：新增两个边类型开关（知识图谱边 / 认知地图边）
- **修改** `CausalCanvas.tsx`：知识图谱边和因果边使用不同视觉样式区分
- **修改** 建议系统（`suggestions` API）：跨知识边和因果边进行聚类
- **修改** 过滤逻辑：支持按边类型（知识/因果）独立过滤

## Impact
- Affected specs: `causal-cognitive-map`, `hypergraph-causal-v52`
- 修改文件：`CausalCanvas.tsx`, `CausalToolbar.tsx`, `CausalSuggestions.tsx`
- 修改 API：`GET /api/causal/suggestions` 扩展为融合聚类

## ADDED Requirements

### Requirement: 知识图谱与认知地图融合渲染
系统 SHALL 在认知地图画布上同时渲染知识图谱边（来自 `GET /graph`）和认知地图边（来自 `GET /api/causal/graph`），两者共享同一节点集。

#### Scenario: 融合视图加载
- **WHEN** 用户打开认知地图页面
- **THEN** 画布同时显示知识图谱关系边（蓝色）和因果边（绿/红/橙/紫），节点去重合并

### Requirement: 边类型独立开关
系统 SHALL 在工具栏提供两个切换按钮，分别控制知识图谱边和认知地图边的显示/隐藏。

#### Scenario: 关闭知识图谱边
- **WHEN** 用户点击"知识图谱边"开关关闭
- **THEN** 所有语义关系边（来自 `links` 表）从画布上消失，因果边保持显示

#### Scenario: 关闭认知地图边
- **WHEN** 用户点击"认知地图边"开关关闭
- **THEN** 所有因果边从画布上消失，知识图谱边保持显示

### Requirement: 知识图谱边视觉样式
系统 SHALL 以区别于因果边的视觉样式渲染知识图谱边。

#### Scenario: 知识图谱边样式
- **WHEN** 知识图谱边被渲染
- **THEN** 边使用蓝色虚线样式，标签显示关系类型，粗细基于权重

### Requirement: 融合聚类
系统 SHALL 在 `GET /api/causal/suggestions` 端点的聚类计算中，同时考虑知识图谱边和认知地图边，输出跨边类型的复合模块建议。

#### Scenario: 跨类型聚类发现
- **WHEN** 5 个节点通过知识边和因果边紧密连接
- **THEN** 建议系统将它们识别为一个复合模块，建议打包

## MODIFIED Requirements

### Requirement: 过滤逻辑（升级）
系统 SHALL 将原有的 `showFeedbackLoops` 和 `showLowConfidence` 过滤扩展为支持按边类型（知识图谱/认知地图）独立过滤，并保留原有细粒度过滤能力。