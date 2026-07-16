import { getPool } from '../db/pool';
import logger from '../i18n/logger';

export interface ConsistencyIssue {
  type: string;
  slug: string;
  message: string;
  severity: 'warning' | 'error';
}

/**
 * 检查本体一致性：
 * 1. 检查页面类型是否属于已注册的本体类
 * 2. 检查超边签名是否与实体类型一致
 * 3. 检查孤立实体（有类型但无超边连接）
 */
export async function checkOntologyConsistency(): Promise<ConsistencyIssue[]> {
  const pool = getPool();
  const issues: ConsistencyIssue[] = [];

  try {
    // 1. 获取所有已注册的本体类
    const classResult = await pool.query('SELECT name FROM ontology_classes');
    const validClasses = new Set(classResult.rows.map((r: any) => r.name));

    if (validClasses.size === 0) {
      logger.info('本体类表为空，跳过一致性检查');
      return issues;
    }

    // 2. 检查页面类型是否在本体类中
    const pageResult = await pool.query(
      "SELECT slug, type FROM pages WHERE type IS NOT NULL AND type != ''"
    );
    for (const page of pageResult.rows) {
      if (!validClasses.has(page.type)) {
        issues.push({
          type: 'unknown_entity_class',
          slug: page.slug,
          message: `实体 [${page.slug}] 的类型 "${page.type}" 未在本体类中注册`,
          severity: 'warning',
        });
      }
    }

    // 3. 检查超边签名与实体类型一致性
    const sigResult = await pool.query(
      'SELECT * FROM ontology_hyperedge_signatures'
    );
    for (const sig of sigResult.rows) {
      const domainClasses: string[] = sig.domain_classes || [];
      const rangeClasses: string[] = sig.range_classes || [];

      if (domainClasses.length === 0 && rangeClasses.length === 0) continue;

      // 查找使用此类型的超边
      const heResult = await pool.query(
        'SELECT * FROM causal_hyperedges WHERE type = $1',
        [sig.type_name]
      );

      if (heResult.rows.length === 0) continue;

      for (const he of heResult.rows) {
        const sourceSlugs: string[] = he.source_slugs || [];
        const targetSlugs: string[] = he.target_slugs || [];

        // 获取源实体类型
        if (sourceSlugs.length > 0) {
          const srcTypeResult = await pool.query(
            'SELECT slug, type FROM pages WHERE slug = ANY($1)',
            [sourceSlugs]
          );
          const srcTypeMap = new Map(srcTypeResult.rows.map((r: any) => [r.slug, r.type]));

          for (const slug of sourceSlugs) {
            const entityType = srcTypeMap.get(slug) || 'unknown';
            if (domainClasses.length > 0 && !domainClasses.includes('*') && !domainClasses.includes(entityType)) {
              issues.push({
                type: 'type_mismatch',
                slug,
                message: `超边 ${sig.type_name} (id=${he.id}) 源实体 [${slug}] 类型为 "${entityType}"，但要求域类型为: ${domainClasses.join(', ')}`,
                severity: 'error',
              });
            }
          }
        }

        // 获取目标实体类型
        if (targetSlugs.length > 0) {
          const tgtTypeResult = await pool.query(
            'SELECT slug, type FROM pages WHERE slug = ANY($1)',
            [targetSlugs]
          );
          const tgtTypeMap = new Map(tgtTypeResult.rows.map((r: any) => [r.slug, r.type]));

          for (const slug of targetSlugs) {
            const entityType = tgtTypeMap.get(slug) || 'unknown';
            if (rangeClasses.length > 0 && !rangeClasses.includes('*') && !rangeClasses.includes(entityType)) {
              issues.push({
                type: 'type_mismatch',
                slug,
                message: `超边 ${sig.type_name} (id=${he.id}) 目标实体 [${slug}] 类型为 "${entityType}"，但要求值域类型为: ${rangeClasses.join(', ')}`,
                severity: 'error',
              });
            }
          }
        }
      }
    }

    // 4. 检查孤立实体：有类型但无任何边连接
    const edgeResult = await pool.query(
      'SELECT DISTINCT source_slug AS slug FROM causal_edges UNION SELECT DISTINCT target_slug FROM causal_edges'
    );
    const connectedSlugs = new Set(edgeResult.rows.map((r: any) => r.slug));

    // 也检查超边连接
    const heSlugResult = await pool.query(
      'SELECT DISTINCT unnest(source_slugs) AS slug FROM causal_hyperedges UNION SELECT DISTINCT unnest(target_slugs) FROM causal_hyperedges'
    );
    for (const row of heSlugResult.rows) {
      connectedSlugs.add(row.slug);
    }

    for (const page of pageResult.rows) {
      if (!connectedSlugs.has(page.slug) && validClasses.has(page.type)) {
        issues.push({
          type: 'isolated_entity',
          slug: page.slug,
          message: `实体 [${page.slug}] (类型: ${page.type}) 在因果图中无任何连接`,
          severity: 'warning',
        });
      }
    }

    logger.info({ issueCount: issues.length }, '本体一致性检查完成');
    return issues;
  } catch (err) {
    logger.warn({ err }, '本体一致性检查失败');
    return [];
  }
}