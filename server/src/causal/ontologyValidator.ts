import { getPool } from '../db/pool';
import logger from '../i18n/logger';

export interface ValidationReport {
  valid: boolean;
  violations: string[];
}

export async function validateHyperedge(
  hyperedge: { type: string; sourceSlugs: string[]; targetSlugs: string[] }
): Promise<ValidationReport> {
  const pool = getPool();
  const violations: string[] = [];

  // 1. Get hyperedge type signature
  const sigResult = await pool.query(
    'SELECT * FROM ontology_hyperedge_signatures WHERE type_name = $1',
    [hyperedge.type]
  );

  if (sigResult.rows.length === 0) {
    return { valid: true, violations: [] }; // No signature = no constraints
  }

  const sig = sigResult.rows[0];

  // 2. Get entity types for all participants
  const allSlugs = [...hyperedge.sourceSlugs, ...hyperedge.targetSlugs];
  const typeResult = await pool.query(
    'SELECT slug, type FROM pages WHERE slug = ANY($1)',
    [allSlugs]
  );
  const typeMap = new Map(typeResult.rows.map((r: any) => [r.slug, r.type]));

  // 3. Check domain constraints (source entities)
  for (const slug of hyperedge.sourceSlugs) {
    const entityType = typeMap.get(slug) || 'unknown';
    if (!sig.domain_classes.includes(entityType) && !sig.domain_classes.includes('*')) {
      violations.push(`实体 [${slug}] 类型为 ${entityType}，但超边 ${hyperedge.type} 要求源类型为: ${sig.domain_classes.join(', ')}`);
    }
  }

  // 4. Check range constraints (target entities)
  for (const slug of hyperedge.targetSlugs) {
    const entityType = typeMap.get(slug) || 'unknown';
    if (!sig.range_classes.includes(entityType) && !sig.range_classes.includes('*')) {
      violations.push(`实体 [${slug}] 类型为 ${entityType}，但超边 ${hyperedge.type} 要求目标类型为: ${sig.range_classes.join(', ')}`);
    }
  }

  return {
    valid: violations.length === 0,
    violations
  };
}