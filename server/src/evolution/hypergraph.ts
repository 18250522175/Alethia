// ============================================================================
// 超图聚类与进化任务
// Leiden 算法适配超图 + Ghost Hyperedge 检测
// ============================================================================

import { getPool } from '../db/pool';
import logger from '../i18n/logger';

// ── 超图聚类（Leiden 算法简化版适配超图） ────────────────────────────────────

export async function hypergraphCluster(): Promise<Array<{
  nodes: string[];
  density: number;
  type: string;
}>> {
  const pool = getPool();

  // Fetch all hyperedges
  const { rows: hyperedges } = await pool.query(
    'SELECT * FROM hyperedges ORDER BY id'
  );

  if (hyperedges.length === 0) {
    return [];
  }

  // Build adjacency from hyperedges
  // Each hyperedge {source_slugs: [A,B], target_slugs: [C,D]} creates connections between all nodes
  const adj = new Map<string, Set<string>>();

  for (const he of hyperedges) {
    const allSlugs = [...(he.source_slugs || []), ...(he.target_slugs || [])];
    for (const s1 of allSlugs) {
      for (const s2 of allSlugs) {
        if (s1 !== s2) {
          if (!adj.has(s1)) adj.set(s1, new Set());
          if (!adj.has(s2)) adj.set(s2, new Set());
          adj.get(s1)!.add(s2);
          adj.get(s2)!.add(s1);
        }
      }
    }
  }

  // Find connected components (BFS)
  const visited = new Set<string>();
  const components: string[][] = [];

  for (const slug of adj.keys()) {
    if (visited.has(slug)) continue;
    const comp: string[] = [];
    const queue = [slug];
    visited.add(slug);
    while (queue.length > 0) {
      const curr = queue.shift()!;
      comp.push(curr);
      for (const neighbor of (adj.get(curr) || new Set())) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    if (comp.length > 2) components.push(comp);
  }

  // Calculate density for each component
  const clusters = components.map(comp => {
    let edgeCount = 0;
    const maxEdges = comp.length * (comp.length - 1) / 2;
    for (let i = 0; i < comp.length; i++) {
      for (let j = i + 1; j < comp.length; j++) {
        if (adj.get(comp[i])?.has(comp[j])) {
          edgeCount++;
        }
      }
    }
    return {
      nodes: comp,
      density: maxEdges > 0 ? edgeCount / maxEdges : 0,
      type: 'hypergraph_cluster',
    };
  });

  // Sort by density descending
  clusters.sort((a, b) => b.density - a.density);

  return clusters;
}

// ── Ghost Hyperedge 检测 ─────────────────────────────────────────────────────

export async function detectGhostHyperedges(): Promise<Array<{
  hyperedgeId: number;
  missingSlugs: string[];
  type: string;
}>> {
  const pool = getPool();

  const { rows: hyperedges } = await pool.query(
    'SELECT * FROM hyperedges ORDER BY id'
  );

  if (hyperedges.length === 0) {
    return [];
  }

  // Collect all referenced slugs from hyperedges
  const allReferenced = new Set<string>();
  for (const he of hyperedges) {
    for (const s of (he.source_slugs || [])) allReferenced.add(s);
    for (const t of (he.target_slugs || [])) allReferenced.add(t);
  }

  // Check which slugs exist in the pages table
  const { rows: existingPages } = await pool.query(
    'SELECT slug FROM pages WHERE slug = ANY($1::text[])',
    [Array.from(allReferenced)]
  );
  const existingSlugs = new Set(existingPages.map((p: any) => p.slug));

  // Find ghost hyperedges (referencing non-existent slugs)
  const ghosts: Array<{
    hyperedgeId: number;
    missingSlugs: string[];
    type: string;
  }> = [];

  for (const he of hyperedges) {
    const missing: string[] = [];
    for (const s of (he.source_slugs || [])) {
      if (!existingSlugs.has(s)) missing.push(s);
    }
    for (const t of (he.target_slugs || [])) {
      if (!existingSlugs.has(t)) missing.push(t);
    }
    if (missing.length > 0) {
      ghosts.push({
        hyperedgeId: he.id,
        missingSlugs: missing,
        type: he.type,
      });
    }
  }

  return ghosts;
}

// ── 主入口：运行超图聚类和 Ghost 检测 ───────────────────────────────────────

export async function runHypergraphEvolution(): Promise<{
  clusters: Array<{ nodes: string[]; density: number; type: string }>;
  ghosts: Array<{ hyperedgeId: number; missingSlugs: string[]; type: string }>;
  diffs: Array<{ type: string; tier?: string; title: string; description: string; data: any }>;
}> {
  logger.info('Running hypergraph evolution...');

  const clusters = await hypergraphCluster();
  const ghosts = await detectGhostHyperedges();

  const diffs: Array<{ type: string; tier?: string; title: string; description: string; data: any }> = [];

  // Generate diffs for significant clusters
  for (const cluster of clusters) {
    if (cluster.density > 0.5 && cluster.nodes.length >= 3) {
      diffs.push({
        type: 'hypergraph_cluster',
        tier: 'yellow',
        title: '发现紧密超边簇',
        description: `${cluster.nodes.length} 个节点通过超边紧密连接（密度: ${(cluster.density * 100).toFixed(0)}%），建议打包为一组`,
        data: cluster,
      });
    }
  }

  // Generate diffs for ghost hyperedges
  for (const ghost of ghosts) {
    diffs.push({
      type: 'ghost_hyperedge',
      tier: 'yellow',
      title: '检测到孤立超边引用',
      description: `超边 #${ghost.hyperedgeId} 引用了不存在的实体: ${ghost.missingSlugs.join(', ')}`,
      data: ghost,
    });
  }

  logger.info(`Hypergraph evolution complete: ${clusters.length} clusters, ${ghosts.length} ghosts, ${diffs.length} diffs`);

  return { clusters, ghosts, diffs };
}

export default {
  hypergraphCluster,
  detectGhostHyperedges,
  runHypergraphEvolution,
};