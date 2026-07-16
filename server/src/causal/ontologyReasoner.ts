// ============================================================================
// 本体推理引擎 — 类层次推理、属性逆向、约束检查
// ============================================================================

import { getPool } from '../db/pool';

export interface ReasoningResult {
  subClasses: string[];
  inverseProperty?: string;
  constraints: string[];
}

// Get all subclasses of a given class (recursive)
export async function getSubClasses(className: string): Promise<string[]> {
  const pool = getPool();
  const result = new Set<string>();
  const queue = [className];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const rows = await pool.query(
      'SELECT name FROM ontology_classes WHERE parent = $1',
      [current]
    );
    for (const row of rows.rows) {
      if (!result.has(row.name)) {
        result.add(row.name);
        queue.push(row.name);
      }
    }
  }

  return Array.from(result);
}

// Get all instances (slugs) belonging to a class or any of its subclasses
export async function getAllInstancesOfClass(className: string): Promise<string[]> {
  const pool = getPool();
  const subClasses = await getSubClasses(className);
  const allClasses = [className, ...subClasses];

  if (allClasses.length === 0) return [];

  const result = await pool.query(
    'SELECT slug FROM pages WHERE type = ANY($1)',
    [allClasses]
  );
  return result.rows.map((r: any) => r.slug);
}

// Get the inverse property of a given property
export async function getInverseProperty(propertyName: string): Promise<string | null> {
  const pool = getPool();
  const result = await pool.query(
    'SELECT inverse_of FROM ontology_properties WHERE name = $1 AND inverse_of IS NOT NULL LIMIT 1',
    [propertyName]
  );
  return result.rows.length > 0 ? result.rows[0].inverse_of : null;
}

// Check if a relation violates any ontology constraints
export async function checkConstraint(
  sourceType: string,
  targetType: string,
  relationType: string
): Promise<string[]> {
  const pool = getPool();
  const constraints: string[] = [];

  // Check property domain/range constraints
  const propResult = await pool.query(
    'SELECT * FROM ontology_properties WHERE name = $1',
    [relationType]
  );

  if (propResult.rows.length > 0) {
    const prop = propResult.rows[0];
    if (prop.domain_class && prop.domain_class !== sourceType && prop.domain_class !== '*') {
      constraints.push(`属性 ${relationType} 要求源类型为 ${prop.domain_class}，当前为 ${sourceType}`);
    }
    if (prop.range_class && prop.range_class !== targetType && prop.range_class !== '*') {
      constraints.push(`属性 ${relationType} 要求目标类型为 ${prop.range_class}，当前为 ${targetType}`);
    }
  }

  // Check causal constraints
  const constraintResult = await pool.query(
    'SELECT * FROM ontology_rules WHERE rule_type = $1',
    ['causal_constraint']
  );
  for (const rule of constraintResult.rows) {
    constraints.push(rule.description);
  }

  return constraints;
}

// Get all direct children of a class
export async function getDirectSubClasses(className: string): Promise<string[]> {
  const pool = getPool();
  const result = await pool.query(
    'SELECT name FROM ontology_classes WHERE parent = $1',
    [className]
  );
  return result.rows.map((r: any) => r.name);
}

// Get the class hierarchy as a tree
export async function getClassHierarchy(): Promise<Record<string, string[]>> {
  const pool = getPool();
  const result = await pool.query('SELECT name, parent FROM ontology_classes WHERE parent IS NOT NULL');
  const hierarchy: Record<string, string[]> = {};
  for (const row of result.rows) {
    if (!hierarchy[row.parent]) hierarchy[row.parent] = [];
    hierarchy[row.parent].push(row.name);
  }
  return hierarchy;
}

// Get all top-level classes (no parent)
export async function getRootClasses(): Promise<string[]> {
  const pool = getPool();
  const result = await pool.query('SELECT name FROM ontology_classes WHERE parent IS NULL');
  return result.rows.map((r: any) => r.name);
}