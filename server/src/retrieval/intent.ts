import type { QueryIntent, QueryTier } from '@shared/index';
import logger from '../i18n/logger';
import { getEmbedding } from '../llm/embed';

interface IntentPrototype {
  intent: QueryIntent;
  tier: QueryTier;
  description: string;
}

/**
 * 每种意图的标准语义描述。
 * 用于预计算嵌入向量，实时查询时通过余弦相似度匹配最接近的意图。
 */
const INTENT_PROTOTYPES: IntentPrototype[] = [
  {
    intent: 'factual',
    tier: 'T0',
    description: '什么是定义 概念解释 含义说明 X是什么 基本定义 术语含义 核心定义是什么'
  },
  {
    intent: 'cross_domain',
    tier: 'T2',
    description: '比较区别 对比分析 关系联系 综合跨领域 X和Y的区别 不同之处 关联分析'
  },
  {
    intent: 'file_search',
    tier: 'T1',
    description: '查找文件 搜索文档 PDF原始文件 来源文档 文件中的内容 原始资料'
  },
  {
    intent: 'topic',
    tier: 'T1',
    description: '概述总结 介绍综述 全局概览 所有相关内容 主题概览 整体介绍'
  },
  {
    intent: 'ai_qa',
    tier: 'T2',
    description: '为什么原因 如何做 怎样实现 原理分析 推理解释 深度问答'
  }
];

let prototypeEmbeddings: Array<{
  intent: QueryIntent;
  tier: QueryTier;
  embedding: number[];
}> | null = null;
let initFailed = false;

/**
 * 初始化意图原型嵌入向量（惰性加载，仅执行一次）。
 */
async function ensurePrototypes(): Promise<typeof prototypeEmbeddings> {
  if (initFailed) return null;
  if (prototypeEmbeddings) return prototypeEmbeddings;

  try {
    const results = await Promise.all(
      INTENT_PROTOTYPES.map(async (p) => ({
        intent: p.intent,
        tier: p.tier,
        embedding: await getEmbedding(p.description)
      }))
    );

    // 验证嵌入向量非空
    if (results.some((r) => !r.embedding || r.embedding.length === 0)) {
      throw new Error('部分意图原型嵌入向量为空');
    }

    prototypeEmbeddings = results;
    logger.info(
      { count: results.length, dim: results[0].embedding.length },
      '意图分类原型嵌入向量已预计算'
    );
    return prototypeEmbeddings;
  } catch (err) {
    logger.warn({ err }, '意图分类嵌入向量预计算失败，将退化到正则规则分类');
    initFailed = true;
    return null;
  }
}

/**
 * 计算两个向量的余弦相似度
 */
function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;

  return dot / denom;
}

/**
 * 正则规则分类器（退化方案）
 */
function regexClassify(query: string): { intent: QueryIntent; tier: QueryTier } {
  const lower = query.toLowerCase().trim();
  const length = query.length;

  if (/是什么|定义|概念|含义/.test(query)) {
    return { intent: 'factual', tier: 'T0' };
  }
  if (/比较|区别|关系|联系|综合|对比/.test(query)) {
    return { intent: 'cross_domain', tier: 'T2' };
  }
  if (/文件|文档|pdf|来源|原始/.test(lower)) {
    return { intent: 'file_search', tier: 'T1' };
  }
  if (/概述|总结|介绍|综述|全局|所有/.test(query)) {
    return { intent: 'topic', tier: 'T1' };
  }
  if (/为什么|如何|怎么|怎样/.test(query)) {
    return { intent: 'ai_qa', tier: 'T2' };
  }
  if (length < 20) {
    return { intent: 'factual', tier: 'T0' };
  }
  return { intent: 'ai_qa', tier: 'T2' };
}

/**
 * 嵌入向量 + 余弦相似度意图分类器
 *
 * 优先使用语义相似度分类，能捕捉表述不同但语义相近的意图。
 * 当嵌入服务不可用时，自动退化到正则规则分类。
 */
export async function classifyIntentByEmbedding(query: string): Promise<{
  intent: QueryIntent;
  tier: QueryTier;
  method: 'embedding' | 'regex';
  confidence?: number;
}> {
  const prototypes = await ensurePrototypes();

  // 嵌入服务不可用时退化到正则
  if (!prototypes) {
    const result = regexClassify(query);
    return { ...result, method: 'regex' };
  }

  try {
    const queryEmbedding = await getEmbedding(query);
    if (!queryEmbedding || queryEmbedding.length === 0) {
      throw new Error('查询嵌入向量为空');
    }

    let bestIntent: QueryIntent = 'ai_qa';
    let bestTier: QueryTier = 'T2';
    let bestScore = -1;

    for (const proto of prototypes) {
      const score = cosineSimilarity(queryEmbedding, proto.embedding);
      if (score > bestScore) {
        bestScore = score;
        bestIntent = proto.intent;
        bestTier = proto.tier;
      }
    }

    logger.debug(
      { query: query.slice(0, 50), intent: bestIntent, score: bestScore.toFixed(3) },
      '嵌入向量意图分类完成'
    );

    return {
      intent: bestIntent,
      tier: bestTier,
      method: 'embedding',
      confidence: bestScore
    };
  } catch (err) {
    logger.warn({ err }, '嵌入向量意图分类失败，退化到正则规则');
    const result = regexClassify(query);
    return { ...result, method: 'regex' };
  }
}
