import { describe, it, expect } from 'bun:test';
import { parser } from './parser';

const mockContent = `---
title: 熵
type: concept
contexts:
  - 热力学
  - 信息论
  - 统计力学
canonical_slug: shang-entropy
---

# 熵

熵是系统无序程度的度量，在热力学、信息论等多个领域有重要应用。

## State

当前状态：已确认
验证等级：高
最后审核：2024-01-15

## Assessment

熵增定律是自然界的基本定律之一，孤立系统的熵永远不会减少。
该概念已被广泛验证，具有极高的置信度。

## Open Threads

- [ ] 黑洞熵与信息悖论的最新研究进展
- [x] 量子纠缠与熵的关系已初步验证
- [ ] 生物系统中的负熵机制仍需深入研究

## Relations

- [[热力学第二定律]] · 核心定律
- [[信息熵]] · 跨学科对应概念
- [[玻尔兹曼]] · 奠基者

## Timeline

- 1865-01-01 · 提出 · 克劳修斯首次提出熵的概念
- 1877-01-01 · 发展 · 玻尔兹曼提出统计熵公式
- 1948-01-01 · 扩展 · 香农创立信息熵理论

## Version History

- v1.0 · 2023-06-01 · 初始版本，建立基本框架
- v1.1 · 2023-09-15 · 补充统计力学内容
- v2.0 · 2024-01-10 · 重大更新，整合信息论章节

## Semantic Rings Archive

- 热力学核心概念
- 无序与秩序
- 时间箭头
- 能量耗散

## Evidence

[^ev-001]: 热力学教材·克劳修斯在《热的力学理论》中首次定义熵
[^ev-002]: 统计物理学报·玻尔兹曼熵公式的推导与验证
[^ev-003]: 通信的数学理论·香农信息熵的原始论文
`;

describe('CompiledTruthParser', () => {
  describe('parse', () => {
    it('正确解析 frontmatter（title, type, contexts, canonical_slug）', async () => {
      const result = await parser.parse('test/entropy.md', mockContent);

      expect(result.title).toBe('熵');
      expect(result.type).toBe('concept');
      expect(result.contexts).toEqual(['热力学', '信息论', '统计力学']);
      expect(result.slug).toBe('shang-entropy');
    });

    it('解析 State 区段', async () => {
      const result = await parser.parse('test/entropy.md', mockContent);

      expect(result.state).toContain('当前状态：已确认');
      expect(result.state).toContain('验证等级：高');
      expect(result.state).toContain('最后审核：2024-01-15');
    });

    it('解析 Assessment 区段', async () => {
      const result = await parser.parse('test/entropy.md', mockContent);

      expect(result.assessment).toContain('熵增定律是自然界的基本定律之一');
      expect(result.assessment).toContain('具有极高的置信度');
    });

    it('解析 Open Threads（数组）', async () => {
      const result = await parser.parse('test/entropy.md', mockContent);

      expect(result.openThreads).toHaveLength(3);
      expect(result.openThreads).toContain('黑洞熵与信息悖论的最新研究进展');
      expect(result.openThreads).toContain('量子纠缠与熵的关系已初步验证');
      expect(result.openThreads).toContain('生物系统中的负熵机制仍需深入研究');
    });

    it('解析 Relations（包含 targetSlug, targetName, relation）', async () => {
      const result = await parser.parse('test/entropy.md', mockContent);

      expect(result.relations).toHaveLength(3);
      expect(result.relations[0]).toEqual({
        targetSlug: '热力学第二定律',
        targetName: '热力学第二定律',
        relation: '核心定律'
      });
      expect(result.relations[1]).toEqual({
        targetSlug: '信息熵',
        targetName: '信息熵',
        relation: '跨学科对应概念'
      });
      expect(result.relations[2]).toEqual({
        targetSlug: '玻尔兹曼',
        targetName: '玻尔兹曼',
        relation: '奠基者'
      });
    });

    it('解析 Timeline（date, type, description）', async () => {
      const result = await parser.parse('test/entropy.md', mockContent);

      expect(result.timeline).toHaveLength(3);
      expect(result.timeline[0]).toEqual({
        date: '1865-01-01',
        type: '提出',
        description: '克劳修斯首次提出熵的概念'
      });
      expect(result.timeline[1]).toEqual({
        date: '1877-01-01',
        type: '发展',
        description: '玻尔兹曼提出统计熵公式'
      });
      expect(result.timeline[2]).toEqual({
        date: '1948-01-01',
        type: '扩展',
        description: '香农创立信息熵理论'
      });
    });

    it('解析 Version History（version, date, summary）', async () => {
      const result = await parser.parse('test/entropy.md', mockContent);

      expect(result.versionHistory).toHaveLength(3);
      expect(result.versionHistory[0]).toEqual({
        version: 'v1.0',
        date: '2023-06-01',
        summary: '初始版本，建立基本框架'
      });
      expect(result.versionHistory[1]).toEqual({
        version: 'v1.1',
        date: '2023-09-15',
        summary: '补充统计力学内容'
      });
      expect(result.versionHistory[2]).toEqual({
        version: 'v2.0',
        date: '2024-01-10',
        summary: '重大更新，整合信息论章节'
      });
    });

    it('解析 Semantic Rings Archive（字符串数组）', async () => {
      const result = await parser.parse('test/entropy.md', mockContent);

      expect(result.semanticRings).toHaveLength(4);
      expect(result.semanticRings).toContain('热力学核心概念');
      expect(result.semanticRings).toContain('无序与秩序');
      expect(result.semanticRings).toContain('时间箭头');
      expect(result.semanticRings).toContain('能量耗散');
    });

    it('解析 Evidence（spanId, source, text）', async () => {
      const result = await parser.parse('test/entropy.md', mockContent);

      expect(result.evidence).toHaveLength(3);
      expect(result.evidence[0]).toEqual({
        spanId: '^ev-001',
        source: '热力学教材',
        text: '克劳修斯在《热的力学理论》中首次定义熵'
      });
      expect(result.evidence[1]).toEqual({
        spanId: '^ev-002',
        source: '统计物理学报',
        text: '玻尔兹曼熵公式的推导与验证'
      });
      expect(result.evidence[2]).toEqual({
        spanId: '^ev-003',
        source: '通信的数学理论',
        text: '香农信息熵的原始论文'
      });
    });

    it('slug 从 frontmatter canonical_slug 读取', async () => {
      const result = await parser.parse('test/entropy.md', mockContent);

      expect(result.slug).toBe('shang-entropy');
      expect(result.path).toBe('test/entropy.md');
    });
  });
});
