import { executeQuery } from '../retrieval/router';
import { graphTraverse } from '../retrieval/graph';
import { getPool } from '../db/pool';
import { withTimeout } from './utils';
import logger from '../i18n/logger';
import type { EvidenceSpan, QueryResultItem } from '@shared/index';
import type { RetrievalPlan } from './planner';

export interface RetrievalResult {
  items: QueryResultItem[];
  evidence: EvidenceSpan[];
  graphContext: string[];
}

export async function retrieve(plan: RetrievalPlan): Promise<RetrievalResult> {
  return withTimeout(retrieveInternal(plan), 5 * 60 * 1000, 'retrieve');
}

async function retrieveInternal(plan: RetrievalPlan): Promise<RetrievalResult> {
  const query = plan.keywords.join(' ');
  logger.info({ query, depth: plan.depth }, '执行检索');

  const topK = plan.depth === 'shallow' ? 5 : plan.depth === 'medium' ? 10 : 20;

  const queryResult = await executeQuery({
    query,
    topK,
    withGraph: plan.depth === 'deep'
  });

  const evidence = await getEvidenceForPages(queryResult.items);

  let graphContext: string[] = [];
  if (queryResult.items.length > 0) {
    // 对前 N 个结果做图谱遍历（shallow=1, medium=3, deep=5）
    const traverseCount = plan.depth === 'shallow' ? 1 : plan.depth === 'medium' ? 3 : 5;
    const slugsToTraverse = queryResult.items.slice(0, traverseCount).map(i => i.slug);
    const allLinks: string[] = [];
    for (const slug of slugsToTraverse) {
      const links = await graphTraverse(slug, 2);
      for (const l of links) {
        if (!allLinks.includes(l.targetSlug)) {
          allLinks.push(l.targetSlug);
        }
      }
    }
    graphContext = allLinks;
  }

  logger.info({ itemCount: queryResult.items.length, evidenceCount: evidence.length }, '检索完成');

  return {
    items: queryResult.items,
    evidence,
    graphContext
  };
}

async function getEvidenceForPages(items: QueryResultItem[]): Promise<EvidenceSpan[]> {
  if (items.length === 0) return [];

  try {
    const pool = getPool();
    const slugs = items.map(i => i.slug);
    const evidenceLimit = plan.depth === 'shallow' ? 10 : plan.depth === 'medium' ? 30 : 60;
    const result = await pool.query(
      `SELECT span_id, slug, source_file_hash, source_text_offset, source_text_length,
              original_location, span_text, lang, confidence, source_type
       FROM evidence_spans
       WHERE slug = ANY($1::text[])
       ORDER BY confidence DESC
       LIMIT $2`,
      [slugs, evidenceLimit]
    );

    return result.rows.map((row: any) => ({
      span_id: row.span_id,
      slug: row.slug,
      source_file_hash: row.source_file_hash,
      source_text_offset: row.source_text_offset,
      source_text_length: row.source_text_length,
      original_location: row.original_location || '',
      span_text: row.span_text,
      lang: row.lang || 'zh-CN',
      confidence: row.confidence,
      source_type: row.source_type
    }));
  } catch (err) {
    logger.warn({ err }, '获取证据片段失败');
    return [];
  }
}
