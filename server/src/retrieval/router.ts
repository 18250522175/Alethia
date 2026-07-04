import { vectorSearch } from './vector';
import { fulltextSearch } from './fulltext';
import { rrfFusion, type RRFResult } from './rrf';
import { graphTraverse } from './graph';
import { applySourceWeights } from './source';
import logger from '../i18n/logger';
import type { QueryParams, QueryResult, QueryResultItem, QueryIntent, QueryTier } from '@shared/index';

type Intent = QueryIntent;
type Tier = QueryTier;

function classifyIntent(query: string): { intent: Intent; tier: Tier } {
  const lower = query.toLowerCase().trim();
  const length = query.length;

  if (length < 10 && /是什么|是什么|定义|概念/.test(query)) {
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

  if (/为什么|如何|怎么|怎样|为什么/.test(query)) {
    return { intent: 'ai_qa', tier: 'T2' };
  }

  if (length < 20) {
    return { intent: 'factual', tier: 'T0' };
  }

  return { intent: 'ai_qa', tier: 'T2' };
}

async function getSnippetsForPages(slugs: string[]): Promise<Map<string, string>> {
  const snippetMap = new Map<string, string>();
  if (slugs.length === 0) return snippetMap;

  try {
    const { getPool } = await import('../db/pool');
    const pool = getPool();
    const result = await pool.query(
      `SELECT slug, LEFT(content_md, 300) AS snippet FROM pages WHERE slug = ANY($1::text[])`,
      [slugs]
    );
    for (const row of result.rows) {
      snippetMap.set(row.slug, row.snippet || '');
    }
  } catch (err) {
    logger.error({ err }, '获取页面摘要失败');
  }

  return snippetMap;
}

export async function executeQuery(params: QueryParams): Promise<QueryResult> {
  const startTime = Date.now();
  const { query, intent, tier, contexts, topK = 10, withGraph = false } = params;

  const classification = classifyIntent(query);
  const finalIntent = intent || classification.intent;
  const finalTier = tier || classification.tier;

  logger.info({ query, intent: finalIntent, tier: finalTier }, '执行检索查询');

  const [vectorResults, fulltextResults] = await Promise.all([
    vectorSearch(query, topK),
    fulltextSearch(query, topK)
  ]);

  const vectorWeight = finalIntent === 'factual' ? 0.7 : 0.5;
  const fulltextWeight = finalIntent === 'factual' ? 0.3 : 0.5;

  const fused = rrfFusion([
    {
      results: vectorResults.map(r => ({ slug: r.slug, title: r.title, score: r.score })),
      weight: vectorWeight
    },
    {
      results: fulltextResults.map(r => ({ slug: r.slug, title: r.title, score: r.score, snippet: r.snippet })),
      weight: fulltextWeight
    }
  ], topK);

  const slugs = fused.map(r => r.slug);
  const snippetMap = await getSnippetsForPages(slugs);

  let items: QueryResultItem[] = fused.map(result => ({
    slug: result.slug,
    title: result.title,
    snippet: snippetMap.get(result.slug) || result.snippet || '',
    score: result.score
  }));

  if (withGraph && items.length > 0) {
    const graphLinks = await graphTraverse(items[0].slug, 1);
    logger.debug({ graphLinks: graphLinks.length }, '图谱扩展完成');
  }

  if (contexts && contexts.length > 0) {
    items = items.map(item => {
      return item;
    });
  }

  const durationMs = Date.now() - startTime;
  logger.info({ durationMs, resultCount: items.length }, '检索查询完成');

  return {
    items,
    intent: finalIntent,
    tier: finalTier,
    durationMs
  };
}
