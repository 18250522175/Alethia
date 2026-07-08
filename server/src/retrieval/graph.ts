import { getPool } from '../db/pool';
import logger from '../i18n/logger';
import type { Link } from '@shared/index';

export async function graphTraverse(slug: string, depth: number = 2): Promise<Link[]> {
  const MAX_DEPTH = 5;
  const safeDepth = Math.min(depth, MAX_DEPTH);
  if (depth > MAX_DEPTH) {
    logger.warn({ depth, maxDepth: MAX_DEPTH }, '图谱遍历深度超出上限，已截断');
  }
  try {
    const pool = getPool();
    const result = await pool.query(
      `WITH RECURSIVE graph_traverse AS (
        SELECT source_slug, target_slug, relation, weight, orphaned, 0 AS current_depth
        FROM links
        WHERE source_slug = $1 AND orphaned = false

        UNION ALL

        SELECT l.source_slug, l.target_slug, l.relation, l.weight, l.orphaned, gt.current_depth + 1
        FROM links l
        JOIN graph_traverse gt ON l.source_slug = gt.target_slug
        WHERE l.orphaned = false AND gt.current_depth < $2
      )
      SELECT DISTINCT source_slug, target_slug, relation, weight, orphaned, created_at
      FROM graph_traverse`,
      [slug, safeDepth]
    );

    return result.rows.map((row: any, i: number) => ({
      id: i + 1,
      sourceSlug: row.source_slug,
      targetSlug: row.target_slug,
      relation: row.relation,
      weight: parseFloat(row.weight),
      orphaned: row.orphaned,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : ''
    }));
  } catch (err) {
    logger.error({ err, slug }, '图谱遍历失败');
    return [];
  }
}

export async function getGraphNodes(limit: number = 200): Promise<{ slug: string; title: string; type: string }[]> {
  try {
    const pool = getPool();
    const result = await pool.query(
      `SELECT slug, title, type FROM pages ORDER BY updated_at DESC LIMIT $1`,
      [limit]
    );
    return result.rows.map((row: any) => ({
      slug: row.slug,
      title: row.title,
      type: row.type
    }));
  } catch (err) {
    logger.error({ err }, '获取图谱节点失败');
    return [];
  }
}

export async function getGraphEdges(limit: number = 500): Promise<{ source: string; target: string; relation: string; orphaned: boolean }[]> {
  try {
    const pool = getPool();
    const result = await pool.query(
      `SELECT source_slug, target_slug, relation, orphaned
       FROM links
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );
    return result.rows.map((row: any) => ({
      source: row.source_slug,
      target: row.target_slug,
      relation: row.relation,
      orphaned: row.orphaned
    }));
  } catch (err) {
    logger.error({ err }, '获取图谱边失败');
    return [];
  }
}
