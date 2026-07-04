import { getPool } from '../db/pool';
import logger from '../i18n/logger';

export interface FulltextSearchResult {
  page_id: number;
  slug: string;
  title: string;
  snippet: string;
  score: number;
}

export async function fulltextSearch(query: string, k: number = 10): Promise<FulltextSearchResult[]> {
  try {
    const pool = getPool();
    const tsQuery = query.replace(/[&|!():*]/g, ' ').trim().split(/\s+/).filter(Boolean).join(' & ');

    if (tsQuery) {
      const result = await pool.query(
        `SELECT p.id AS page_id, p.slug, p.title,
                ts_headline('simple', pft.source_text, to_tsquery('simple', $1),
                  'StartSel=<<, StopSel=>>, MaxWords=35, MinWords=15') AS snippet,
                ts_rank(pft.tsv, to_tsquery('simple', $1)) AS score
         FROM page_fts pft
         JOIN pages p ON p.id = pft.page_id
         WHERE pft.tsv @@ to_tsquery('simple', $1)
         ORDER BY score DESC
         LIMIT $2`,
        [tsQuery, k]
      );

      if (result.rows.length > 0) {
        return result.rows.map((row: any) => ({
          page_id: row.page_id,
          slug: row.slug,
          title: row.title,
          snippet: row.snippet || '',
          score: parseFloat(row.score)
        }));
      }
    }

    logger.debug('tsvector 检索无结果，回退到 ILIKE 模糊检索');
    return ilikeSearch(query, k);
  } catch (err) {
    logger.error({ err }, '全文检索失败，回退到 ILIKE');
    return ilikeSearch(query, k);
  }
}

async function ilikeSearch(query: string, k: number): Promise<FulltextSearchResult[]> {
  try {
    const pool = getPool();
    const pattern = `%${query}%`;
    const result = await pool.query(
      `SELECT p.id AS page_id, p.slug, p.title,
              LEFT(p.content_md, 200) AS snippet,
              0.5 AS score
       FROM pages p
       WHERE p.content_md ILIKE $1 OR p.slug ILIKE $1 OR p.title ILIKE $1
       LIMIT $2`,
      [pattern, k]
    );

    return result.rows.map((row: any) => ({
      page_id: row.page_id,
      slug: row.slug,
      title: row.title,
      snippet: row.snippet || '',
      score: parseFloat(row.score)
    }));
  } catch (err) {
    logger.error({ err }, 'ILIKE 检索失败');
    return [];
  }
}
