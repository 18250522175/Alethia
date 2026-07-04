import { getPool } from './pool';
import logger from '../i18n/logger';

export interface DimensionResult {
  migrated: boolean;
  oldDim: number;
  newDim: number;
}

/**
 * 检测 page_embeddings.embedding 列的当前维度
 */
async function detectCurrentDimension(): Promise<number> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type
     FROM pg_attribute a
     JOIN pg_class c ON a.attrelid = c.oid
     WHERE c.relname = 'page_embeddings' AND a.attname = 'embedding'`
  );

  if (result.rows.length === 0) {
    throw new Error('page_embeddings.embedding 列不存在');
  }

  const dataType: string = result.rows[0].data_type;
  const match = dataType.match(/vector\((\d+)\)/);
  if (!match) {
    throw new Error(`无法解析 embedding 列类型: ${dataType}`);
  }

  return parseInt(match[1], 10);
}

/**
 * 确保 page_embeddings.embedding 列维度与目标维度一致，不一致时自动迁移
 *
 * 迁移步骤：删除 HNSW 索引 → 清空表 → 修改列类型 → 重建索引 → 写入变更日志
 */
export async function ensureEmbeddingDimension(targetDim: number): Promise<DimensionResult> {
  const currentDim = await detectCurrentDimension();

  if (currentDim === targetDim) {
    return { migrated: false, oldDim: currentDim, newDim: targetDim };
  }

  logger.info({ oldDim: currentDim, newDim: targetDim }, '嵌入维度不匹配，开始自动迁移');

  const pool = getPool();

  try {
    await pool.query('BEGIN');

    // 1. 删除 HNSW 索引
    await pool.query('DROP INDEX IF EXISTS idx_page_embeddings_hnsw');

    // 2. 清空表
    await pool.query('TRUNCATE TABLE page_embeddings');

    // 3. 修改列类型
    await pool.query(
      `ALTER TABLE page_embeddings ALTER COLUMN embedding TYPE vector(${targetDim})`
    );

    // 4. 重建 HNSW 索引
    await pool.query(
      `CREATE INDEX idx_page_embeddings_hnsw ON page_embeddings USING hnsw (embedding vector_cosine_ops)`
    );

    // 5. 写入变更日志
    const batchId = `dim-migrate-${Date.now()}`;
    await pool.query(
      `INSERT INTO auto_change_log (batch_id, op, target, payload)
       VALUES ($1, $2, $3, $4)`,
      [
        batchId,
        'migrate',
        'page_embeddings.embedding',
        JSON.stringify({ oldDim: currentDim, newDim: targetDim })
      ]
    );

    await pool.query('COMMIT');

    logger.info({ oldDim: currentDim, newDim: targetDim }, '嵌入维度迁移完成');
    return { migrated: true, oldDim: currentDim, newDim: targetDim };
  } catch (err) {
    await pool.query('ROLLBACK').catch(() => {});
    logger.error({ err, oldDim: currentDim, newDim: targetDim }, '嵌入维度迁移失败');
    throw err;
  }
}
