import type { QueryParams, QueryResult, QueryResultItem } from '@shared/index';
import logger from '../i18n/logger';
import { fulltextSearch } from './fulltext';
import { graphTraverse } from './graph';
import { classifyIntentByEmbedding } from './intent';
import { rerank } from './rerank';
import { rrfFusion } from './rrf';
import { vectorSearch } from './vector';

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
  const {
    query,
    intent,
    tier,
    contexts,
    topK = 10,
    withGraph = false,
    withRerank = false
  } = params;

  // 优先使用嵌入向量 + 余弦相似度分类，自动退化到正则规则
  const classification = await classifyIntentByEmbedding(query);
  const finalIntent = intent || classification.intent;
  const finalTier = tier || classification.tier;

  logger.info({ query, intent: finalIntent, tier: finalTier }, '执行检索查询');

  const [vectorResults, fulltextResults] = await Promise.all([
    vectorSearch(query, topK),
    fulltextSearch(query, topK)
  ]);

  const vectorWeight = finalIntent === 'factual' ? 0.7 : 0.5;
  const fulltextWeight = finalIntent === 'factual' ? 0.3 : 0.5;

  const fused = rrfFusion(
    [
      {
        results: vectorResults.map((r) => ({ slug: r.slug, title: r.title, score: r.score })),
        weight: vectorWeight
      },
      {
        results: fulltextResults.map((r) => ({
          slug: r.slug,
          title: r.title,
          score: r.score,
          snippet: r.snippet
        })),
        weight: fulltextWeight
      }
    ],
    topK
  );

  const slugs = fused.map((r) => r.slug);
  const snippetMap = await getSnippetsForPages(slugs);

  let items: QueryResultItem[] = fused.map((result) => ({
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

  // 图谱扩展：将遍历到的邻居节点合并到检索结果中
  if (withGraph && items.length > 0) {
    const graphLinks = await graphTraverse(items[0].slug, 2);
    logger.debug({ graphLinks: graphLinks.length }, '图谱扩展完成');
    const existingSlugs = new Set(items.map((i) => i.slug));
    for (const link of graphLinks) {
      const neighborSlug = link.sourceSlug === items[0].slug ? link.targetSlug : link.sourceSlug;
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

  // 按 contexts 过滤：只保留匹配指定上下文的页面
  if (contexts && contexts.length > 0) {
    const contextSet = new Set(contexts);
    const filteredItems: QueryResultItem[] = [];
    for (const item of items) {
      try {
        const { getPool } = await import('../db/pool');
        const pool = getPool();
        const pageResult = await pool.query('SELECT contexts FROM pages WHERE slug = $1', [
          item.slug
        ]);
        if (pageResult.rows.length > 0) {
          const pageContexts: string[] = pageResult.rows[0].contexts || [];
          if (pageContexts.some((c) => contextSet.has(c))) {
            filteredItems.push(item);
          }
        }
      } catch {
        // 查询失败时保留该条目
        filteredItems.push(item);
      }
    }
    items = filteredItems;
    logger.debug({ before: items.length, after: filteredItems.length }, 'contexts 过滤完成');
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
