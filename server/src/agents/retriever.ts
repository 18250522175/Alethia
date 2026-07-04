import { executeQuery } from '../retrieval/router';
import { graphTraverse } from '../retrieval/graph';
import { getPool } from '../db/pool';
import logger from '../i18n/logger';
import type { EvidenceSpan, QueryResultItem } from '@shared/index';
import type { RetrievalPlan } from './planner';

export interface RetrievalResult {
  items: QueryResultItem[];
  evidence: EvidenceSpan[];
  graphContext: string[];
}

export async function retrieve(plan: RetrievalPlan): Promise<RetrievalResult> {
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
    const links = await graphTraverse(queryResult.items[0].slug, 1);
    graphContext = links.map(l => l.targetSlug);
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
    const result = await pool.query(
      `SELECT span_id, slug, source_file_hash, source_text_offset, source_text_length,
              original_location, span_text, lang, confidence, source_type
       FROM evidence_spans
       WHERE slug = ANY($1::text[])
       LIMIT 20`,
      [slugs]
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
