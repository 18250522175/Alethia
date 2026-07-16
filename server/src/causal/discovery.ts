// ============================================================================
// 因果发现 — 频繁子图挖掘 + PC 算法简化版 + CPT 参数更新
// ============================================================================

import { getPool } from '../db/pool';
import logger from '../i18n/logger';
import { checkConstraint } from './ontologyReasoner';

// ── 频繁子图挖掘 ────────────────────────────────────────────────────────────

export async function frequentSubgraphMining(
  minSupport: number = 2,
): Promise<Array<{
  pattern: { sources: string[]; targets: string[]; type: string };
  frequency: number;
  examples: string[][];
}>> {
  const pool = getPool();

  // Fetch all hyperedges
  const { rows: hyperedges } = await pool.query(
    'SELECT * FROM hyperedges ORDER BY id'
  );

  if (hyperedges.length < minSupport) {
    return [];
  }

  // Group hyperedges by type
  const byType = new Map<string, typeof hyperedges>();
  for (const he of hyperedges) {
    if (!byType.has(he.type)) byType.set(he.type, []);
    byType.get(he.type)!.push(he);
  }

  const patterns: Array<{
    pattern: { sources: string[]; targets: string[]; type: string };
    frequency: number;
    examples: string[][];
  }> = [];

  // Find patterns: same type, overlapping nodes
  for (const [type, edges] of byType) {
    if (edges.length < minSupport) continue;

    for (let i = 0; i < edges.length; i++) {
      for (let j = i + 1; j < edges.length; j++) {
        const a = edges[i];
        const b = edges[j];

        // Check overlap in sources
        const sharedSources = a.source_slugs.filter((s: string) => b.source_slugs.includes(s));
        const sharedTargets = a.target_slugs.filter((t: string) => b.target_slugs.includes(t));

        if (sharedSources.length > 0 || sharedTargets.length > 0) {
          // Count frequency
          let freq = 0;
          const examples: string[][] = [];
          for (const edge of edges) {
            const hasOverlap = sharedSources.some((s: string) => edge.source_slugs.includes(s)) ||
              sharedTargets.some((t: string) => edge.target_slugs.includes(t));
            if (hasOverlap) {
              freq++;
              examples.push([...edge.source_slugs, ...edge.target_slugs]);
            }
          }

          if (freq >= minSupport) {
            patterns.push({
              pattern: {
                sources: sharedSources,
                targets: sharedTargets,
                type,
              },
              frequency: freq,
              examples,
            });
          }
        }
      }
    }
  }

  // Deduplicate patterns
  const seen = new Set<string>();
  const unique = patterns.filter(p => {
    const key = `${p.pattern.sources.sort().join(',')}|${p.pattern.targets.sort().join(',')}|${p.pattern.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort by frequency descending
  unique.sort((a, b) => b.frequency - a.frequency);

  return unique;
}

// ── 简化版 PC 算法（因果结构学习） ──────────────────────────────────────────

export async function pcAlgorithm(): Promise<Array<{
  pair: [string, string];
  correlation: number;
  partialCorrelation: number;
  suggestion: string;
}>> {
  const pool = getPool();

  // Fetch causal edges for existing pairs
  const { rows: causalEdges } = await pool.query(
    'SELECT * FROM causal_hyperedges ch JOIN hyperedges h ON ch.hyperedge_id = h.id ORDER BY ch.id'
  );

  if (causalEdges.length === 0) {
    return [];
  }

  const results: Array<{
    pair: [string, string];
    correlation: number;
    partialCorrelation: number;
    suggestion: string;
  }> = [];

  // Build a set of existing causal pairs
  const existingPairs = new Set<string>();
  for (const edge of causalEdges) {
    for (const source of (edge.source_slugs || [])) {
      for (const target of (edge.target_slugs || [])) {
        existingPairs.add(`${source}->${target}`);
      }
    }
  }

  // Find potential new causal pairs: transitive closure
  for (const edge1 of causalEdges) {
    for (const edge2 of causalEdges) {
      if (edge1.id === edge2.id) continue;

      for (const t1 of (edge1.target_slugs || [])) {
        for (const s2 of (edge2.source_slugs || [])) {
          if (t1 === s2) {
            // Transitive potential: source1 -> t1/s2 -> target2
            for (const s1 of (edge1.source_slugs || [])) {
              for (const t2 of (edge2.target_slugs || [])) {
                if (s1 === t2) continue;
                const pairKey = `${s1}->${t2}`;
                if (!existingPairs.has(pairKey)) {
                  const correlation = (edge1.conf || 0.5) * (edge2.conf || 0.5);
                  results.push({
                    pair: [s1, t2],
                    correlation,
                    partialCorrelation: correlation * 0.8,
                    suggestion: `通过「${s1} → ${t1} → ${t2}」传递链发现潜在因果关联`,
                  });
                }
              }
            }
          }
        }
      }
    }
  }

  // Deduplicate
  const seen = new Set<string>();
  return results.filter(r => {
    const key = r.pair.sort().join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── CPT 参数更新 ─────────────────────────────────────────────────────────────

export async function updateCPTFromEvents(): Promise<Array<{
  variableSlug: string;
  suggestedChanges: Array<{ parentCombo: string; oldProb: number; newProb: number; evidence: string }>;
}>> {
  const pool = getPool();

  // Fetch existing CPTs
  const { rows: cpts } = await pool.query(
    'SELECT * FROM causal_cpt ORDER BY id'
  );

  if (cpts.length === 0) {
    return [];
  }

  const updates: Array<{
    variableSlug: string;
    suggestedChanges: Array<{ parentCombo: string; oldProb: number; newProb: number; evidence: string }>;
  }> = [];

  for (const cpt of cpts) {
    const conditions = cpt.conditions || {};
    const probabilities = cpt.probabilities || {};
    const parentVars: string[] = conditions.parents || conditions.parentVariables || [];

    if (parentVars.length === 0) continue;

    // Try to find recent timeline events or observed files for the parent variables
    const { rows: events } = await pool.query(
      `SELECT * FROM timeline_entries 
       WHERE entity_slug = $1 
       ORDER BY created_at DESC 
       LIMIT 10`,
      [cpt.variable_slug]
    );

    if (events.length === 0) continue;

    const table = probabilities.table || probabilities.rows || [];
    if (table.length === 0) continue;

    // Simple update: adjust probabilities based on recent event frequency
    // Count events that suggest high vs low states
    let highCount = 0;
    let lowCount = 0;

    for (const event of events) {
      const eventText = (event.content || event.description || '').toLowerCase();
      if (eventText.includes('increase') || eventText.includes('improve') || eventText.includes('success') || eventText.includes('增长') || eventText.includes('改善') || eventText.includes('成功')) {
        highCount++;
      } else if (eventText.includes('decrease') || eventText.includes('fail') || eventText.includes('degrad') || eventText.includes('下降') || eventText.includes('失败') || eventText.includes('恶化')) {
        lowCount++;
      }
    }

    if (highCount + lowCount < 3) continue;

    const totalEvents = highCount + lowCount;
    const newProbHigh = highCount / totalEvents;

    // Find the table row where all parents are in their default state
    const defaultRow = table[0];
    if (defaultRow) {
      const probKey = Object.keys(defaultRow).find(k => !parentVars.includes(k) && k !== 'state' && k !== 'outcome');
      const oldProb = probKey ? parseFloat(defaultRow[probKey] || '0.5') : 0.5;

      if (Math.abs(newProbHigh - oldProb) > 0.1) {
        updates.push({
          variableSlug: cpt.variable_slug,
          suggestedChanges: [{
            parentCombo: parentVars.map(p => `${p}=默认`).join(', '),
            oldProb,
            newProb: newProbHigh,
            evidence: `基于最近 ${totalEvents} 个相关事件的分析`,
          }],
        });
      }
    }
  }

  return updates;
}

// ── 主入口：运行因果发现 ────────────────────────────────────────────────────

export async function runCausalDiscovery(): Promise<{
  patterns: Array<any>;
  pcResults: Array<any>;
  cptUpdates: Array<any>;
  diffs: Array<{ type: string; tier?: string; title: string; description: string; data: any }>;
}> {
  logger.info('Running causal discovery...');

  const patterns = await frequentSubgraphMining(2);
  const pcResults = await pcAlgorithm();
  const cptUpdates = await updateCPTFromEvents();

  const diffs: Array<{ type: string; tier?: string; title: string; description: string; data: any }> = [];

  for (const pattern of patterns) {
    diffs.push({
      type: 'causal_pattern',
      tier: 'yellow',
      title: '发现频繁因果模式',
      description: `超边类型「${pattern.pattern.type}」出现 ${pattern.frequency} 次，涉及节点: ${[...pattern.pattern.sources, ...pattern.pattern.targets].join(', ')}`,
      data: pattern,
    });
  }

  // Ontology filtering: filter pcResults through ontology constraints
  const filteredPcResults = await filterPcCandidatesWithOntology(pcResults);

  for (const pc of filteredPcResults) {
    diffs.push({
      type: 'potential_causal',
      tier: 'yellow',
      title: '发现潜在因果关联',
      description: pc.suggestion,
      data: pc,
    });
  }

  for (const update of cptUpdates) {
    for (const change of update.suggestedChanges) {
      diffs.push({
        type: 'cpt_update',
        tier: 'yellow',
        title: '建议更新 CPT 参数',
        description: `变量「${update.variableSlug}」在条件「${change.parentCombo}」下，概率从 ${(change.oldProb * 100).toFixed(0)}% 调整为 ${(change.newProb * 100).toFixed(0)}%。${change.evidence}`,
        data: update,
      });
    }
  }

  logger.info(`Causal discovery complete: ${patterns.length} patterns, ${filteredPcResults.length} pc results (${pcResults.length - filteredPcResults.length} filtered by ontology), ${cptUpdates.length} cpt updates`);

  return { patterns, pcResults: filteredPcResults, cptUpdates, diffs };
}

// ── 本体过滤：将候选因果对通过本体约束过滤 ──────────────────────────────────

async function filterPcCandidatesWithOntology(
  candidates: Array<{
    pair: [string, string];
    correlation: number;
    partialCorrelation: number;
    suggestion: string;
  }>,
): Promise<Array<{
  pair: [string, string];
  correlation: number;
  partialCorrelation: number;
  suggestion: string;
}>> {
  if (candidates.length === 0) return [];

  const pool = getPool();

  // Collect all unique slugs
  const allSlugs = new Set<string>();
  for (const c of candidates) {
    allSlugs.add(c.pair[0]);
    allSlugs.add(c.pair[1]);
  }

  // Get entity types for all slugs
  const typeResult = await pool.query(
    'SELECT slug, type FROM pages WHERE slug = ANY($1)',
    [Array.from(allSlugs)]
  );
  const entityTypes = new Map<string, string>();
  for (const row of typeResult.rows) {
    entityTypes.set(row.slug, row.type || 'unknown');
  }

  const filtered: Array<{
    pair: [string, string];
    correlation: number;
    partialCorrelation: number;
    suggestion: string;
  }> = [];

  for (const candidate of candidates) {
    const sourceType = entityTypes.get(candidate.pair[0]) || 'unknown';
    const targetType = entityTypes.get(candidate.pair[1]) || 'unknown';

    // Check if this combination violates causal constraints
    const constraints = await checkConstraint(sourceType, targetType, 'causes');

    if (constraints.length > 0) {
      logger.debug({ candidate: candidate.pair, constraints }, '候选因果对被本体过滤');
      continue; // Skip invalid combinations
    }

    // Boost confidence for candidates that match causal constraints
    filtered.push({
      ...candidate,
      correlation: Math.min(candidate.correlation * 1.1, 0.95),
      partialCorrelation: Math.min(candidate.partialCorrelation * 1.1, 0.95),
    });
  }

  return filtered;
}

export default {
  frequentSubgraphMining,
  pcAlgorithm,
  updateCPTFromEvents,
  runCausalDiscovery,
};