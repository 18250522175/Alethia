import { vectorSearch } from './vector';
import { fulltextSearch } from './fulltext';
import { rrfFusion, type RRFResult } from './rrf';
import { graphTraverse } from './graph';
import { rerank } from './rerank';
import { applySourceWeights } from './source';
import logger from '../i18n/logger';
import type { QueryParams, QueryResult, QueryResultItem, QueryIntent, QueryTier } from '@shared/index';

type Intent = QueryIntent;
type Tier = QueryTier;

function classifyIntent(query: string): { intent: Intent; tier: Tier } {
  const lower = query.toLowerCase().trim();
  const length = query.length;

  if (length < 10 && /是什么|什么是|定义|概念/.test(query)) {
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
  const { query, intent, tier, contexts, topK = 10, withGraph = false, withRerank = false } = params;

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

  // 重排序（如果启用且已配置 reranker）
  if (withRerank) {
    items = await rerank(items, query);
    logger.debug({ count: items.length }, '重排序完成');
  }

  // 图谱扩展：将遍历到的邻居节点合并到检索结果中（取 top-3 避免单一节点偏差）
  if (withGraph && items.length > 0) {
    const topSlugs = items.slice(0, 3).map(i => i.slug);
    const existingSlugs = new Set(items.map(i => i.slug));
    const allLinks: Awaited<ReturnType<typeof graphTraverse>> = [];
    for (const slug of topSlugs) {
      const links = await graphTraverse(slug, 2);
      allLinks.push(...links);
    }
    logger.debug({ graphLinks: allLinks.length }, '图谱扩展完成');
    for (const link of allLinks) {
      const seedSlug = topSlugs.find(s => s === link.sourceSlug || s === link.targetSlug);
      if (!seedSlug) continue;
      const neighborSlug = link.sourceSlug === seedSlug ? link.targetSlug : link.sourceSlug;
      if (!existingSlugs.has(neighborSlug)) {
        const snippet = snippetMap.get(neighborSlug) || '';
        items.push({
          slug: neighborSlug,
          title: neighborSlug,
          snippet,
          score: 0.3
        });
        existingSlugs.add(neighborSlug);
      }
    }
  }

  // 按 contexts 过滤：只保留匹配指定上下文的页面（批量查询，避免 N+1）
  if (contexts && contexts.length > 0) {
    const contextSet = new Set(contexts);
    const slugList = items.map(i => i.slug).filter(Boolean);
    const filteredItems: QueryResultItem[] = [];
    try {
      const { getPool } = await import('../db/pool');
      const pool = getPool();
      const pageResult = await pool.query(
        'SELECT slug, contexts FROM pages WHERE slug = ANY($1::text[])',
        [slugList]
      );
      const slugToContexts = new Map<string, string[]>();
      for (const row of pageResult.rows) {
        slugToContexts.set(row.slug, row.contexts || []);
      }
      for (const item of items) {
        const pageContexts = slugToContexts.get(item.slug) || [];
        if (pageContexts.some(c => contextSet.has(c))) {
          filteredItems.push(item);
        }
      }
      items = filteredItems;
    } catch {
      // 查询失败时保留所有条目
      filteredItems.push(...items);
    }
    logger.debug({ after: items.length }, 'contexts 过滤完成');
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
