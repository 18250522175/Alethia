import { getPool } from '../db/pool';
import { getEmbedding } from '../llm/embed';
import logger from '../i18n/logger';

export interface VectorSearchResult {
  page_id: number;
  slug: string;
  title: string;
  score: number;
}

export async function vectorSearch(query: string, k: number = 10): Promise<VectorSearchResult[]> {
  try {
    const embedding = await getEmbedding(query);
    if (embedding.length === 0) {
      logger.warn('嵌入向量为空，跳过向量检索');
      return [];
    }

    const pool = getPool();
    const vectorStr = `[${embedding.join(',')}]`;
    const result = await pool.query(
      `SELECT p.id AS page_id, p.slug, p.title,
              1 - (pe.embedding <=> $1::vector) AS score
       FROM page_embeddings pe
       JOIN pages p ON p.id = pe.page_id
       ORDER BY pe.embedding <=> $1::vector
       LIMIT $2`,
      [vectorStr, k]
    );

    return result.rows.map((row: any) => ({
      page_id: row.page_id,
      slug: row.slug,
      title: row.title,
      score: parseFloat(row.score)
    }));
  } catch (err) {
    logger.error({ err }, '向量检索失败');
    return [];
  }
}
