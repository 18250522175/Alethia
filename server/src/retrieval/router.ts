import { vectorSearch } from './vector';
import { fulltextSearch } from './fulltext';
import { rrfFusion, type RRFResult } from './rrf';
import { graphTraverse } from './graph';
import { rerank } from './rerank';
import { applySourceWeights } from './source';
import { parseSearchQuery, filtersToSql, exclusionsToSql, type ParsedQuery } from './syntaxParser';
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

  // 解析高级搜索语法
  const parsed: ParsedQuery = parseSearchQuery(query);
  const effectiveQuery = parsed.text || query;
  const hasAdvancedSyntax = parsed.hasSyntax;

  const classification = classifyIntent(effectiveQuery);
  const finalIntent = intent || classification.intent;
  const finalTier = tier || classification.tier;

  logger.info({ query, effectiveQuery, hasAdvancedSyntax, intent: finalIntent, tier: finalTier }, '执行检索查询');

  let items: QueryResultItem[] = [];

  if (hasAdvancedSyntax) {
    // 高级搜索模式：先应用 SQL 过滤条件
    items = await executeAdvancedSearch(parsed, effectiveQuery, topK);
  } else {
    // 普通检索模式：使用混合检索
    const [vectorResults, fulltextResults] = await Promise.all([
      vectorSearch(effectiveQuery, topK),
      fulltextSearch(effectiveQuery, topK)
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

    items = fused.map(result => ({
      slug: result.slug,
      title: result.title,
      snippet: snippetMap.get(result.slug) || result.snippet || '',
      score: result.score
    }));

    if (withRerank) {
      items = await rerank(items, effectiveQuery);
      logger.debug({ count: items.length }, '重排序完成');
    }

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
  }

  // 按 contexts 过滤
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

/**
 * 执行高级搜索：在 SQL 层面应用过滤条件
 */
async function executeAdvancedSearch(
  parsed: ParsedQuery,
  textQuery: string,
  topK: number
): Promise<QueryResultItem[]> {
  const { getPool } = await import('../db/pool');
  const pool = getPool();

  const includeCondition = filtersToSql(parsed.filters);
  const excludeCondition = exclusionsToSql(parsed.exclusions);

  const whereParts: string[] = [];
  const params: any[] = [];

  if (includeCondition.clause) {
    whereParts.push(`(${includeCondition.clause})`);
    params.push(...includeCondition.params);
  }

  if (excludeCondition.clause) {
    whereParts.push(`(${excludeCondition.clause})`);
    params.push(...excludeCondition.params);
  }

  if (textQuery) {
    whereParts.push(`(pages.title ILIKE $${params.length + 1} OR pages.content_md ILIKE $${params.length + 1})`);
    params.push(`%${textQuery}%`);
  }

  const whereClause = whereParts.length > 0 ? 'WHERE ' + whereParts.join(' AND ') : '';

  const result = await pool.query(
    `SELECT slug, title, type, contexts, tags, aliases, quality, cv_score, created_at,
            LEFT(content_md, 200) as snippet,
            CASE
              WHEN pages.quality = 'A' THEN 1.0
              WHEN pages.quality = 'B' THEN 0.7
              ELSE 0.4
            END * 0.6
            + LEAST(COALESCE(pages.cv_score, 0.0), 1.0) * 0.3
            + (SELECT COUNT(*) FROM links WHERE target_slug = pages.slug AND NOT orphaned) * 0.001 * 0.1
            AS score
     FROM pages
     ${whereClause}
     ORDER BY score DESC, created_at DESC
     LIMIT $${params.length + 1}`,
    [...params, topK]
  );

  return result.rows.map((r: any) => ({
    slug: r.slug,
    title: r.title || r.slug,
    snippet: r.snippet || '',
    score: r.score
  }));
}
