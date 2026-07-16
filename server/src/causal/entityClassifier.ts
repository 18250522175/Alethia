// ============================================================================
// 实体类型自动推断 — 基于内容关键词和图邻居的类型推断
// ============================================================================

import { getPool } from '../db/pool';

export interface SuggestedType {
  className: string;
  confidence: number;
}

// Infer entity type based on content keywords and graph neighbors
export async function inferEntityType(slug: string): Promise<SuggestedType | null> {
  const pool = getPool();

  // Get the page content
  const pageResult = await pool.query(
    'SELECT title, content_md, type FROM pages WHERE slug = $1',
    [slug]
  );
  if (pageResult.rows.length === 0) return null;

  const page = pageResult.rows[0];

  // If type is already set and valid, return it
  if (page.type && page.type !== 'concept') {
    const classResult = await pool.query(
      'SELECT name FROM ontology_classes WHERE name = $1',
      [page.type]
    );
    if (classResult.rows.length > 0) {
      return { className: page.type, confidence: 1.0 };
    }
  }

  // Get all ontology classes
  const classesResult = await pool.query('SELECT name, description FROM ontology_classes');
  const classes = classesResult.rows;

  // Score each class based on keyword matching
  const scores: Map<string, number> = new Map();
  const content = (page.title + ' ' + (page.content_md || '')).toLowerCase();

  for (const cls of classes) {
    let score = 0;
    const keywords = [cls.name.toLowerCase()];
    if (cls.description) {
      keywords.push(...cls.description.toLowerCase().split(/\s+/));
    }

    for (const kw of keywords) {
      if (content.includes(kw)) score += 1;
    }

    if (score > 0) scores.set(cls.name, score);
  }

  // Also check graph neighbors' types
  const neighborResult = await pool.query(
    `SELECT DISTINCT p.type FROM links l
     JOIN pages p ON (l.target_slug = p.slug OR l.source_slug = p.slug)
     WHERE (l.source_slug = $1 OR l.target_slug = $1) AND p.slug != $1 AND p.type IS NOT NULL
     LIMIT 10`,
    [slug]
  );

  for (const neighbor of neighborResult.rows) {
    if (neighbor.type && neighbor.type !== 'concept') {
      scores.set(neighbor.type, (scores.get(neighbor.type) || 0) + 0.5);
    }
  }

  // Find best match
  let bestClass = '';
  let bestScore = 0;
  for (const [name, score] of scores) {
    if (score > bestScore) {
      bestScore = score;
      bestClass = name;
    }
  }

  if (bestClass && bestScore > 0) {
    return {
      className: bestClass,
      confidence: Math.min(bestScore / 5, 0.9)
    };
  }

  return null;
}