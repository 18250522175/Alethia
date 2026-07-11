import { Hono } from 'hono';
import crypto from 'crypto';
import { getPool } from '../db/pool';
import logger from '../i18n/logger';
import { llmRouter } from '../llm/router';
import {
  doCalculus,
  doCalculusOnHypergraph,
  jointCausalInference,
  counterfactualInference,
  backwardReasoning,
  timePulseResponse,
  buildGraphFromDB,
  type InterventionQuery,
  type CausalGraph,
} from '../causal/reasoner';
import { createResolver } from '../causal/intent';
import { runCausalDiscovery } from '../causal/discovery';

const app = new Hono();

// ── Precomputation cache ────────────────────────────────────────────────────
const precomputeCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 3600000; // 1 hour

function getCached<T>(key: string): T | null {
  const entry = precomputeCache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
    return entry.data as T;
  }
  return null;
}

function setCache(key: string, data: any): void {
  precomputeCache.set(key, { data, timestamp: Date.now() });
}

let lastPrecomputedAt: number | null = null;
let lastPrecomputedNodeCount = 0;
let lastPrecomputedEdgeCount = 0;

// GET /api/causal/graph — 返回完整因果图数据
app.get('/api/causal/graph', async (c) => {
  const pool = getPool();
  const { rows: edges } = await pool.query(
    'SELECT * FROM causal_edges ORDER BY id'
  );
  const { rows: cpts } = await pool.query(
    'SELECT * FROM causal_cpt ORDER BY id'
  );
  return c.json({ edges, cpts });
});

// GET /api/causal/node/:slug — 返回单个节点的因果上下文
app.get('/api/causal/node/:slug', async (c) => {
  const slug = c.req.param('slug');
  const pool = getPool();

  const { rows: incoming } = await pool.query(
    'SELECT * FROM causal_edges WHERE target_slug = $1', [slug]
  );
  const { rows: outgoing } = await pool.query(
    'SELECT * FROM causal_edges WHERE source_slug = $1', [slug]
  );
  const { rows: cptRows } = await pool.query(
    'SELECT * FROM causal_cpt WHERE variable_slug = $1', [slug]
  );

  return c.json({
    slug,
    incoming,
    outgoing,
    cpt: cptRows[0] || null
  });
});

// POST /api/causal/nl-command — 自然语言图操作（使用 IntentResolver）
app.post('/api/causal/nl-command', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body.command !== 'string' || !body.command.trim()) {
    return c.json({ error: true, message: '请提供 command 字段' }, 400);
  }

  const { command, currentView } = body as {
    command: string;
    currentView?: { nodes?: string[]; selectedNodes?: string[] };
  };

  const nodes = currentView?.nodes || [];
  const selectedNodes = currentView?.selectedNodes || [];

  try {
    const resolver = createResolver('hybrid');
    const result = await resolver.resolve(command, {
      nodes,
      selectedNodes,
    });
    return c.json(result);
  } catch (err: any) {
    logger.error({ err }, 'NL command 意图解析失败');
    return c.json({
      error: true,
      message: '自然语言命令处理失败: ' + (err.message || '未知错误')
    }, 500);
  }
});

// POST /api/causal/precompute — 预计算社区检测和桥接节点结果
app.post('/api/causal/precompute', async (c) => {
  try {
    const pool = getPool();
    const { rows: edges } = await pool.query(
      'SELECT source_slug, target_slug, relation, weight, conf FROM causal_edges ORDER BY id'
    );

    // Build adjacency list
    const adj = new Map<string, Set<string>>();
    for (const edge of edges) {
      if (!adj.has(edge.source_slug)) adj.set(edge.source_slug, new Set());
      if (!adj.has(edge.target_slug)) adj.set(edge.target_slug, new Set());
      adj.get(edge.source_slug)!.add(edge.target_slug);
      adj.get(edge.target_slug)!.add(edge.source_slug);
    }

    // Community detection: connected components
    const visited = new Set<string>();
    const components: string[][] = [];
    for (const node of adj.keys()) {
      if (visited.has(node)) continue;
      const component: string[] = [];
      const queue = [node];
      visited.add(node);
      while (queue.length > 0) {
        const current = queue.shift()!;
        component.push(current);
        for (const neighbor of adj.get(current) || []) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push(neighbor);
          }
        }
      }
      if (component.length > 3) {
        components.push(component);
      }
    }
    components.sort((a, b) => b.length - a.length);

    // Bridge detection: articulation points via Tarjan's algorithm
    const allNodes = Array.from(adj.keys());
    let time = 0;
    const disc = new Map<string, number>();
    const low = new Map<string, number>();
    const parent = new Map<string, string | null>();
    const ap = new Set<string>();
    const apVisited = new Set<string>();

    function dfsBridge(u: string) {
      apVisited.add(u);
      time++;
      disc.set(u, time);
      low.set(u, time);
      let children = 0;
      for (const v of adj.get(u) || []) {
        if (!apVisited.has(v)) {
          children++;
          parent.set(v, u);
          dfsBridge(v);
          low.set(u, Math.min(low.get(u)!, low.get(v)!));
          if (parent.get(u) === null && children > 1) ap.add(u);
          if (parent.get(u) !== null && low.get(v)! >= disc.get(u)!) ap.add(u);
        } else if (v !== parent.get(u)) {
          low.set(u, Math.min(low.get(u)!, disc.get(v)!));
        }
      }
    }

    for (const node of allNodes) {
      if (!apVisited.has(node)) {
        parent.set(node, null);
        dfsBridge(node);
      }
    }

    // Hub detection: high out-degree
    const outDegrees: Array<{ node: string; degree: number }> = [];
    for (const [node] of adj.entries()) {
      let outDegree = 0;
      for (const edge of edges) {
        if (edge.source_slug === node) outDegree++;
      }
      outDegrees.push({ node, degree: outDegree });
    }
    outDegrees.sort((a, b) => b.degree - a.degree);

    const result = {
      components: components.slice(0, 10),
      bridgeNodes: Array.from(ap),
      hubNodes: outDegrees.filter(h => h.degree >= 2).map(h => h.node),
      computedAt: Date.now(),
    };

    setCache('suggestions', result);

    const nodeSet = new Set<string>();
    for (const edge of edges) {
      nodeSet.add(edge.source_slug);
      nodeSet.add(edge.target_slug);
    }
    lastPrecomputedAt = Date.now();
    lastPrecomputedNodeCount = nodeSet.size;
    lastPrecomputedEdgeCount = edges.length;

    return c.json({
      ...result,
      nodeCount: nodeSet.size,
      edgeCount: edges.length,
    });
  } catch (err) {
    logger.error({ err }, '预计算失败');
    return c.json({ error: true, message: '预计算失败' }, 500);
  }
});

// GET /api/causal/precompute-status — 返回预计算状态
app.get('/api/causal/precompute-status', async (c) => {
  const cached = getCached('suggestions');
  return c.json({
    lastComputed: lastPrecomputedAt,
    cached: cached !== null,
    nodeCount: lastPrecomputedNodeCount,
    edgeCount: lastPrecomputedEdgeCount,
  });
});

// GET /api/causal/suggestions — AI 智能建议
app.get('/api/causal/suggestions', async (c) => {
  const nodesParam = c.req.query('nodes') || '';
  const limit = parseInt(c.req.query('limit') || '5', 10);

  // Check precomputed cache first
  const cached = getCached<{
    components: string[][];
    bridgeNodes: string[];
    hubNodes: string[];
  }>('suggestions');

  const pool = getPool();
  const { rows: edges } = await pool.query(
    'SELECT source_slug, target_slug, relation, weight, conf FROM causal_edges ORDER BY id'
  );

  const suggestions: Array<{
    type: string;
    title: string;
    description: string;
    nodes?: string[];
    node?: string;
    action: string;
    confidence: number;
  }> = [];

  // Build adjacency list (undirected)
  const adj = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (!adj.has(edge.source_slug)) adj.set(edge.source_slug, new Set());
    if (!adj.has(edge.target_slug)) adj.set(edge.target_slug, new Set());
    adj.get(edge.source_slug)!.add(edge.target_slug);
    adj.get(edge.target_slug)!.add(edge.source_slug);
  }

  // Filter by nodes param if provided
  const filterNodes = nodesParam ? nodesParam.split(',').filter(Boolean) : null;

  // Use cached community detection results if available
  if (cached) {
    for (const comp of cached.components.slice(0, limit)) {
      if (filterNodes && !comp.some(n => filterNodes.includes(n))) continue;
      suggestions.push({
        type: 'cluster',
        title: '发现紧密连接的节点簇',
        description: `有 ${comp.length} 个节点紧密互连，可能是同一个风险模块`,
        nodes: comp,
        action: 'pack',
        confidence: Math.min(0.85, 0.5 + comp.length * 0.05)
      });
    }

    // Use cached hub nodes
    if (suggestions.length < limit) {
      for (const hubNode of cached.hubNodes.slice(0, 3)) {
        if (suggestions.length >= limit) break;
        if (filterNodes && !filterNodes.includes(hubNode)) continue;
        const degree = adj.get(hubNode)?.size || 0;
        suggestions.push({
          type: 'hub',
          title: '关键影响节点',
          description: `节点 ${hubNode} 影响 ${degree} 个其他节点，是关键驱动因素`,
          node: hubNode,
          action: 'perspective',
          confidence: Math.min(0.95, 0.6 + degree * 0.08)
        });
      }
    }

    // Use cached bridge nodes
    if (suggestions.length < limit) {
      const filteredBridges = cached.bridgeNodes.filter(n => {
        if (filterNodes && !filterNodes.includes(n)) return false;
        return true;
      });
      filteredBridges.sort((a, b) => (adj.get(b)?.size || 0) - (adj.get(a)?.size || 0));

      for (const bridge of filteredBridges.slice(0, 3)) {
        if (suggestions.length >= limit) break;
        const degree = adj.get(bridge)?.size || 0;
        suggestions.push({
          type: 'bridge',
          title: '桥接节点',
          description: `节点 ${bridge} 连接两个独立的因果子图（度: ${degree}），是关键枢纽`,
          node: bridge,
          action: 'highlight',
          confidence: Math.min(0.85, 0.5 + degree * 0.05)
        });
      }
    }

    return c.json({ suggestions: suggestions.slice(0, limit) });
  }

  // Fallback: compute on the fly (no cache)
  // --- 1. Community detection: connected components via BFS ---
  const visited = new Set<string>();
  const components: string[][] = [];

  for (const node of adj.keys()) {
    if (visited.has(node)) continue;
    if (filterNodes && !filterNodes.includes(node)) continue;

    const component: string[] = [];
    const queue = [node];
    visited.add(node);

    while (queue.length > 0) {
      const current = queue.shift()!;
      component.push(current);
      for (const neighbor of adj.get(current) || []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    if (component.length > 3) {
      components.push(component);
    }
  }

  // Sort components by size descending, suggest largest
  components.sort((a, b) => b.length - a.length);
  for (const comp of components.slice(0, limit)) {
    suggestions.push({
      type: 'cluster',
      title: '发现紧密连接的节点簇',
      description: `有 ${comp.length} 个节点紧密互连，可能是同一个风险模块`,
      nodes: comp,
      action: 'pack',
      confidence: Math.min(0.85, 0.5 + comp.length * 0.05)
    });
  }

  // --- 2. Hub detection: high out-degree ---
  if (suggestions.length < limit) {
    const outDegrees: Array<{ node: string; degree: number }> = [];
    for (const [node, neighbors] of adj.entries()) {
      let outDegree = 0;
      for (const edge of edges) {
        if (edge.source_slug === node) outDegree++;
      }
      outDegrees.push({ node, degree: outDegree });
    }
    outDegrees.sort((a, b) => b.degree - a.degree);

    const topHubs = outDegrees.slice(0, 3).filter(h => h.degree >= 2);
    for (const hub of topHubs) {
      if (suggestions.length >= limit) break;
      if (filterNodes && !filterNodes.includes(hub.node)) continue;
      suggestions.push({
        type: 'hub',
        title: '关键影响节点',
        description: `节点 ${hub.node} 影响 ${hub.degree} 个其他节点，是关键驱动因素`,
        node: hub.node,
        action: 'perspective',
        confidence: Math.min(0.95, 0.6 + hub.degree * 0.08)
      });
    }
  }

  // --- 3. Bridge detection: articulation points via DFS ---
  if (suggestions.length < limit) {
    const allNodes = Array.from(adj.keys());
    let time = 0;

    // Use Tarjan's algorithm for articulation points
    const disc = new Map<string, number>();
    const low = new Map<string, number>();
    const parent = new Map<string, string | null>();
    const ap = new Set<string>();
    const apVisited = new Set<string>();

    function dfsBridge(u: string) {
      apVisited.add(u);
      time++;
      disc.set(u, time);
      low.set(u, time);
      let children = 0;

      for (const v of adj.get(u) || []) {
        if (!apVisited.has(v)) {
          children++;
          parent.set(v, u);
          dfsBridge(v);
          low.set(u, Math.min(low.get(u)!, low.get(v)!));
          if (parent.get(u) === null && children > 1) {
            ap.add(u);
          }
          if (parent.get(u) !== null && low.get(v)! >= disc.get(u)!) {
            ap.add(u);
          }
        } else if (v !== parent.get(u)) {
          low.set(u, Math.min(low.get(u)!, disc.get(v)!));
        }
      }
    }

    for (const node of allNodes) {
      if (!apVisited.has(node)) {
        parent.set(node, null);
        dfsBridge(node);
      }
    }

    const bridgeNodes = Array.from(ap).filter(n => {
      if (filterNodes && !filterNodes.includes(n)) return false;
      return true;
    });

    bridgeNodes.sort((a, b) => (adj.get(b)?.size || 0) - (adj.get(a)?.size || 0));

    for (const bridge of bridgeNodes.slice(0, 3)) {
      if (suggestions.length >= limit) break;
      const degree = adj.get(bridge)?.size || 0;
      suggestions.push({
        type: 'bridge',
        title: '桥接节点',
        description: `节点 ${bridge} 连接两个独立的因果子图（度: ${degree}），是关键枢纽`,
        node: bridge,
        action: 'highlight',
        confidence: Math.min(0.85, 0.5 + degree * 0.05)
      });
    }
  }

  return c.json({ suggestions: suggestions.slice(0, limit) });
});

// ── 11a: 因果推理 API ────────────────────────────────────────────────────────

/** 从数据库加载因果图 */
async function loadCausalGraph(): Promise<ReturnType<typeof buildGraphFromDB> | null> {
  try {
    const pool = getPool();
    const { rows: edges } = await pool.query(
      'SELECT source_slug, target_slug, relation, weight, conf, lag, evidence FROM causal_edges ORDER BY id'
    );
    const { rows: cpts } = await pool.query(
      'SELECT variable_slug, conditions, probabilities FROM causal_cpt ORDER BY id'
    );
    return buildGraphFromDB(edges, cpts);
  } catch (err) {
    logger.error({ err }, '加载因果图失败');
    return null;
  }
}

// POST /api/causal/reason — 因果推理 (do-calculus)
app.post('/api/causal/reason', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { target, intervention, background } = body;

    if (!target || !intervention?.variable || !intervention?.toState) {
      return c.json({
        error: { code: 'VALIDATION_ERROR', message: '缺少 target 或 intervention 参数' }
      }, 400);
    }

    const graph = await loadCausalGraph();
    if (!graph) {
      return c.json({
        error: { code: 'INTERNAL_ERROR', message: '无法加载因果图' }
      }, 500);
    }

    const query: InterventionQuery = {
      target,
      intervention: {
        variable: intervention.variable,
        fromState: intervention.fromState || 'low',
        toState: intervention.toState,
      },
      background,
    };

    const result = doCalculus(graph, query);
    return c.json(result);
  } catch (err) {
    logger.error({ err }, '因果推理失败');
    return c.json({
      error: { code: 'INTERNAL_ERROR', message: '因果推理执行失败' }
    }, 500);
  }
});

// POST /api/causal/counterfactual — 反事实推理
app.post('/api/causal/counterfactual', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { observed, hypothetical } = body;

    if (!observed || !hypothetical?.target || !hypothetical?.intervention?.variable) {
      return c.json({
        error: { code: 'VALIDATION_ERROR', message: '缺少 observed 或 hypothetical 参数' }
      }, 400);
    }

    const graph = await loadCausalGraph();
    if (!graph) {
      return c.json({
        error: { code: 'INTERNAL_ERROR', message: '无法加载因果图' }
      }, 500);
    }

    const result = counterfactualInference(graph, {
      observed,
      hypothetical: {
        target: hypothetical.target,
        intervention: {
          variable: hypothetical.intervention.variable,
          fromState: hypothetical.intervention.fromState || 'low',
          toState: hypothetical.intervention.toState,
        },
        background: hypothetical.background,
      },
    });
    return c.json(result);
  } catch (err) {
    logger.error({ err }, '反事实推理失败');
    return c.json({
      error: { code: 'INTERNAL_ERROR', message: '反事实推理执行失败' }
    }, 500);
  }
});

// POST /api/causal/backward — 回溯推理 (干预候选排序)
app.post('/api/causal/backward', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { target, desiredState } = body;

    if (!target || !desiredState) {
      return c.json({
        error: { code: 'VALIDATION_ERROR', message: '缺少 target 或 desiredState 参数' }
      }, 400);
    }

    const graph = await loadCausalGraph();
    if (!graph) {
      return c.json({
        error: { code: 'INTERNAL_ERROR', message: '无法加载因果图' }
      }, 500);
    }

    const candidates = backwardReasoning(graph, target, desiredState);
    return c.json({ candidates });
  } catch (err) {
    logger.error({ err }, '回溯推理失败');
    return c.json({
      error: { code: 'INTERNAL_ERROR', message: '回溯推理执行失败' }
    }, 500);
  }
});

// ── 12b: 证据分辨率端点 ──────────────────────────────────────────────────────

// GET /api/causal/evidence/:edgeId — 解析因果边的证据跨度
app.get('/api/causal/evidence/:edgeId', async (c) => {
  const edgeId = parseInt(c.req.param('edgeId'), 10);
  if (isNaN(edgeId)) {
    return c.json({ error: { code: 'VALIDATION_ERROR', message: '无效的 edgeId' } }, 400);
  }

  const pool = getPool();
  const { rows: edgeRows } = await pool.query(
    'SELECT * FROM causal_edges WHERE id = $1', [edgeId]
  );

  if (edgeRows.length === 0) {
    return c.json({ error: { code: 'NOT_FOUND', message: '边不存在' } }, 404);
  }

  const edge = edgeRows[0];
  const evidenceSpanIds: string[] = edge.evidence || [];

  const evidenceSpans: Array<{ spanId: string; source: string; text: string }> = [];

  if (evidenceSpanIds.length > 0) {
    const { rows: spanRows } = await pool.query(
      'SELECT span_id, original_location, span_text FROM evidence_spans WHERE span_id = ANY($1)',
      [evidenceSpanIds]
    );
    for (const span of spanRows) {
      evidenceSpans.push({
        spanId: span.span_id,
        source: span.original_location || '',
        text: span.span_text || '',
      });
    }
  }

  return c.json({
    edge: {
      id: edge.id,
      sourceSlug: edge.source_slug,
      targetSlug: edge.target_slug,
      relation: edge.relation,
      lag: edge.lag,
      weight: edge.weight,
      conf: edge.conf,
      evidence: evidenceSpanIds,
    },
    evidenceSpans,
  });
});

// ── 12f: 影子评估端点 ────────────────────────────────────────────────────────

// GET /api/causal/eval-check — 因果模型自检
app.get('/api/causal/eval-check', async (c) => {
  const pool = getPool();
  const { rows: edges } = await pool.query(
    'SELECT * FROM causal_edges ORDER BY id'
  );
  const { rows: cpts } = await pool.query(
    'SELECT variable_slug FROM causal_cpt ORDER BY id'
  );

  const warnings: string[] = [];
  const cycleNodes: string[] = [];
  const isolatedNodes: string[] = [];

  // Build adjacency
  const adj = new Map<string, string[]>();
  const allNodes = new Set<string>();

  for (const edge of edges) {
    allNodes.add(edge.source_slug);
    allNodes.add(edge.target_slug);
    if (!adj.has(edge.source_slug)) adj.set(edge.source_slug, []);
    adj.get(edge.source_slug)!.push(edge.target_slug);
  }

  // 1. Cycle detection via DFS
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  for (const node of allNodes) color.set(node, WHITE);

  function dfsCycle(u: string): boolean {
    color.set(u, GRAY);
    for (const v of adj.get(u) || []) {
      if (color.get(v) === GRAY) {
        cycleNodes.push(u);
        cycleNodes.push(v);
        return true;
      }
      if (color.get(v) === WHITE && dfsCycle(v)) {
        return true;
      }
    }
    color.set(u, BLACK);
    return false;
  }

  for (const node of allNodes) {
    if (color.get(node) === WHITE) {
      dfsCycle(node);
    }
  }

  if (cycleNodes.length > 0) {
    warnings.push('检测到潜在反馈回路（循环依赖），可能影响因果推断的稳定性');
  }

  // 2. Isolated nodes (no connections)
  for (const node of allNodes) {
    const neighbors = adj.get(node) || [];
    const hasIncoming = Array.from(adj.entries()).some(
      ([, targets]) => targets.includes(node)
    );
    if (neighbors.length === 0 && !hasIncoming) {
      isolatedNodes.push(node);
    }
  }

  if (isolatedNodes.length > 0) {
    warnings.push(`发现 ${isolatedNodes.length} 个孤立节点（无因果连接）`);
  }

  // 3. Low confidence edges
  const lowConfEdges = edges.filter((e: any) => e.conf < 0.3);
  if (lowConfEdges.length > 0) {
    warnings.push(`${lowConfEdges.length} 条边的置信度低于 0.3，建议复核或标注不确定性`);
  }

  // 4. High in-degree nodes missing CPT
  const cptSlugs = new Set(cpts.map((c: any) => c.variable_slug));
  const inDegree = new Map<string, number>();
  for (const edge of edges) {
    inDegree.set(edge.target_slug, (inDegree.get(edge.target_slug) || 0) + 1);
  }
  const highInDegreeNoCpt: string[] = [];
  for (const [node, deg] of inDegree) {
    if (deg >= 3 && !cptSlugs.has(node)) {
      highInDegreeNoCpt.push(node);
    }
  }
  if (highInDegreeNoCpt.length > 0) {
    warnings.push(`${highInDegreeNoCpt.length} 个高入度节点缺少 CPT 数据，将使用启发式推理`);
  }

  return c.json({
    warnings,
    cycleNodes: [...new Set(cycleNodes)],
    isolatedNodes,
  });
});

// POST /api/causal/time-pulse — 时间脉冲响应
app.post('/api/causal/time-pulse', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { target, intervention, steps } = body;

    if (!target || !intervention?.variable || !intervention?.toState) {
      return c.json({
        error: { code: 'VALIDATION_ERROR', message: '缺少 target 或 intervention 参数' }
      }, 400);
    }

    const graph = await loadCausalGraph();
    if (!graph) {
      return c.json({
        error: { code: 'INTERNAL_ERROR', message: '无法加载因果图' }
      }, 500);
    }

    const query: InterventionQuery = {
      target,
      intervention: {
        variable: intervention.variable,
        fromState: intervention.fromState || 'low',
        toState: intervention.toState,
      },
    };

    const result = timePulseResponse(graph, query, steps || 5);
    return c.json({ pulses: result });
  } catch (err) {
    logger.error({ err }, '时间脉冲响应失败');
    return c.json({
      error: { code: 'INTERNAL_ERROR', message: '时间脉冲响应执行失败' }
    }, 500);
  }
});

// ── 13a: 因果模型版本化 ──────────────────────────────────────────────────────

// POST /api/causal/version/save
app.post('/api/causal/version/save', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const comment = (body.comment ?? '').slice(0, 500);

    const pool = getPool();

    const { rows: edges } = await pool.query(
      'SELECT * FROM causal_edges ORDER BY id'
    );
    const { rows: cpts } = await pool.query(
      'SELECT * FROM causal_cpt ORDER BY id'
    );

    const versionId = `v_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const snapshot = {
      edges,
      cpts,
      timestamp: new Date().toISOString(),
      comment,
    };

    await pool.query('UPDATE causal_versions SET is_active = false WHERE is_active = true');
    await pool.query(
      'INSERT INTO causal_versions (version_id, snapshot, comment, is_active) VALUES ($1, $2, $3, true)',
      [versionId, JSON.stringify(snapshot), comment]
    );

    return c.json({
      version_id: versionId,
      comment,
      edges_count: edges.length,
      cpts_count: cpts.length,
      created_at: snapshot.timestamp,
      is_active: true,
    });
  } catch (err) {
    logger.error({ err }, '保存因果模型版本失败');
    return c.json({ error: { code: 'INTERNAL_ERROR', message: '保存版本失败' } }, 500);
  }
});

// GET /api/causal/version/list
app.get('/api/causal/version/list', async (c) => {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      'SELECT version_id, comment, is_active, created_at FROM causal_versions ORDER BY created_at DESC'
    );
    return c.json({ versions: rows });
  } catch (err) {
    logger.error({ err }, '获取因果模型版本列表失败');
    return c.json({ error: { code: 'INTERNAL_ERROR', message: '获取版本列表失败' } }, 500);
  }
});

// POST /api/causal/version/switch
app.post('/api/causal/version/switch', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { versionId } = body;

    if (!versionId) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: '缺少 versionId 参数' } }, 400);
    }

    const pool = getPool();

    const { rows: versions } = await pool.query(
      'SELECT * FROM causal_versions WHERE version_id = $1',
      [versionId]
    );

    if (versions.length === 0) {
      return c.json({ error: { code: 'NOT_FOUND', message: `版本 ${versionId} 不存在` } }, 404);
    }

    const snapshot = versions[0].snapshot;
    const edges: any[] = snapshot.edges || [];
    const cpts: any[] = snapshot.cpts || [];

    await pool.query('DELETE FROM causal_edges');
    await pool.query('DELETE FROM causal_cpt');

    for (const edge of edges) {
      await pool.query(
        'INSERT INTO causal_edges (source_slug, target_slug, relation, lag, weight, conf, evidence) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [edge.source_slug, edge.target_slug, edge.relation, edge.lag || '', edge.weight || 0, edge.conf || 0.5, edge.evidence || []]
      );
    }

    for (const cpt of cpts) {
      await pool.query(
        'INSERT INTO causal_cpt (variable_slug, conditions, probabilities) VALUES ($1, $2, $3)',
        [cpt.variable_slug, JSON.stringify(cpt.conditions || {}), JSON.stringify(cpt.probabilities || {})]
      );
    }

    await pool.query('UPDATE causal_versions SET is_active = false');
    await pool.query(
      'UPDATE causal_versions SET is_active = true WHERE version_id = $1',
      [versionId]
    );

    return c.json({ success: true, version_id: versionId, edges_count: edges.length, cpts_count: cpts.length });
  } catch (err) {
    logger.error({ err }, '切换因果模型版本失败');
    return c.json({ error: { code: 'INTERNAL_ERROR', message: '切换版本失败' } }, 500);
  }
});

// GET /api/causal/version/compare
app.get('/api/causal/version/compare', async (c) => {
  try {
    const v1 = c.req.query('v1');
    const v2 = c.req.query('v2');

    if (!v1 || !v2) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: '缺少 v1 或 v2 查询参数' } }, 400);
    }

    const pool = getPool();

    const { rows: rows1 } = await pool.query(
      'SELECT * FROM causal_versions WHERE version_id = $1',
      [v1]
    );
    const { rows: rows2 } = await pool.query(
      'SELECT * FROM causal_versions WHERE version_id = $2',
      [v2]
    );

    if (rows1.length === 0) {
      return c.json({ error: { code: 'NOT_FOUND', message: `版本 ${v1} 不存在` } }, 404);
    }
    if (rows2.length === 0) {
      return c.json({ error: { code: 'NOT_FOUND', message: `版本 ${v2} 不存在` } }, 404);
    }

    const edges1: any[] = (rows1[0].snapshot as any).edges || [];
    const edges2: any[] = (rows2[0].snapshot as any).edges || [];

    const edgeKey = (e: any) => `${e.source_slug}||${e.target_slug}||${e.relation}`;
    const map1 = new Map<string, any>();
    const map2 = new Map<string, any>();

    for (const e of edges1) map1.set(edgeKey(e), e);
    for (const e of edges2) map2.set(edgeKey(e), e);

    const added: any[] = [];
    const removed: any[] = [];
    const modified: any[] = [];

    for (const [key, e2] of map2) {
      if (!map1.has(key)) {
        added.push(e2);
      }
    }

    for (const [key, e1] of map1) {
      if (!map2.has(key)) {
        removed.push(e1);
      }
    }

    for (const [key, e1] of map1) {
      const e2 = map2.get(key);
      if (!e2) continue;
      const changes: Array<{ field: string; old: any; new: any }> = [];
      const comparableFields = ['weight', 'conf', 'lag'];
      for (const field of comparableFields) {
        if (e1[field] !== e2[field]) {
          changes.push({ field, old: e1[field], new: e2[field] });
        }
      }
      if (changes.length > 0) {
        modified.push({
          source: e1.source_slug || e1.source,
          target: e1.target_slug || e1.target,
          relation: e1.relation,
          changes,
        });
      }
    }

    return c.json({ added, removed, modified });
  } catch (err) {
    logger.error({ err }, '对比因果模型版本失败');
    return c.json({ error: { code: 'INTERNAL_ERROR', message: '对比版本失败' } }, 500);
  }
});

// ── 14a: 实时预警系统 API ──────────────────────────────────────────────────

// POST /api/causal/alert/create — 创建阈值预警
app.post('/api/causal/alert/create', async (c) => {
  try {
    const body = await c.req.json().catch(() => null);
    if (!body || !body.edgeId || !body.threshold) {
      return c.json({ error: true, message: '缺少 edgeId 或 threshold 参数' }, 400);
    }

    const { edgeId, threshold, enabled = true } = body;
    const { condition, value } = threshold;

    if (!condition || value === undefined || value === null) {
      return c.json({ error: true, message: 'threshold 必须包含 condition 和 value' }, 400);
    }

    const validConditions = ['gt', 'lt', 'gte', 'lte'];
    if (!validConditions.includes(condition)) {
      return c.json({ error: true, message: `condition 必须是以下之一: ${validConditions.join(', ')}` }, 400);
    }

    const pool = getPool();
    // Verify edge exists
    const { rows: edgeCheck } = await pool.query('SELECT id FROM causal_edges WHERE id = $1', [edgeId]);
    if (edgeCheck.length === 0) {
      return c.json({ error: true, message: '因果边不存在' }, 404);
    }

    const { rows } = await pool.query(
      `INSERT INTO causal_alerts (edge_id, threshold, enabled)
       VALUES ($1, $2, $3)
       RETURNING id, edge_id, threshold, enabled, last_triggered_at, created_at`,
      [edgeId, JSON.stringify(threshold), enabled]
    );

    return c.json({ alert: rows[0] });
  } catch (err) {
    logger.error({ err }, '创建预警失败');
    return c.json({ error: true, message: '创建预警失败' }, 500);
  }
});

// GET /api/causal/alert/list — 列出所有预警
app.get('/api/causal/alert/list', async (c) => {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT
         a.id, a.edge_id, a.threshold, a.enabled, a.last_triggered_at, a.created_at,
         e.source_slug, e.target_slug, e.relation
       FROM causal_alerts a
       JOIN causal_edges e ON a.edge_id = e.id
       ORDER BY a.id`
    );

    const alerts = rows.map((row: any) => ({
      id: row.id,
      edge_id: row.edge_id,
      source_slug: row.source_slug,
      target_slug: row.target_slug,
      relation: row.relation,
      threshold: typeof row.threshold === 'string' ? JSON.parse(row.threshold) : row.threshold,
      enabled: row.enabled,
      last_triggered_at: row.last_triggered_at,
      created_at: row.created_at,
    }));

    return c.json({ alerts });
  } catch (err) {
    logger.error({ err }, '获取预警列表失败');
    return c.json({ error: true, message: '获取预警列表失败' }, 500);
  }
});

// PUT /api/causal/alert/:id — 更新预警
app.put('/api/causal/alert/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'), 10);
    if (isNaN(id)) {
      return c.json({ error: true, message: '无效的预警 ID' }, 400);
    }

    const body = await c.req.json().catch(() => null);
    if (!body) {
      return c.json({ error: true, message: '请求体为空' }, 400);
    }

    const pool = getPool();
    const { rows: existing } = await pool.query('SELECT id FROM causal_alerts WHERE id = $1', [id]);
    if (existing.length === 0) {
      return c.json({ error: true, message: '预警不存在' }, 404);
    }

    const updates: string[] = [];
    const values: any[] = [];
    let paramIdx = 1;

    if (body.threshold !== undefined) {
      const { condition, value } = body.threshold;
      if (condition && value !== undefined && value !== null) {
        updates.push(`threshold = $${paramIdx++}`);
        values.push(JSON.stringify({ condition, value }));
      }
    }

    if (body.enabled !== undefined) {
      updates.push(`enabled = $${paramIdx++}`);
      values.push(body.enabled);
    }

    if (updates.length === 0) {
      return c.json({ error: true, message: '没有需要更新的字段' }, 400);
    }

    values.push(id);
    const { rows } = await pool.query(
      `UPDATE causal_alerts SET ${updates.join(', ')} WHERE id = $${paramIdx}
       RETURNING id, edge_id, threshold, enabled, last_triggered_at, created_at`,
      values
    );

    return c.json({ alert: rows[0] });
  } catch (err) {
    logger.error({ err }, '更新预警失败');
    return c.json({ error: true, message: '更新预警失败' }, 500);
  }
});

// DELETE /api/causal/alert/:id — 删除预警
app.delete('/api/causal/alert/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'), 10);
    if (isNaN(id)) {
      return c.json({ error: true, message: '无效的预警 ID' }, 400);
    }

    const pool = getPool();
    const { rowCount } = await pool.query('DELETE FROM causal_alerts WHERE id = $1', [id]);
    if (rowCount === 0) {
      return c.json({ error: true, message: '预警不存在' }, 404);
    }

    return c.json({ success: true });
  } catch (err) {
    logger.error({ err }, '删除预警失败');
    return c.json({ error: true, message: '删除预警失败' }, 500);
  }
});

// ── 14b: 获取当前值用于阈值检查 ────────────────────────────────────────────

const COOLDOWN_MS = 60 * 60 * 1000; // 1 小时冷却期

/** 尝试从 pages 表获取节点的当前数值 */
async function getNodeValue(pool: ReturnType<typeof getPool>, slug: string): Promise<{ value: number; estimated: boolean }> {
  try {
    // 尝试从 pages 表查找对应实体
    const { rows } = await pool.query(
      'SELECT state, parsed_json FROM pages WHERE slug = $1 LIMIT 1',
      [slug]
    );

    if (rows.length === 0) {
      return { value: 0.5, estimated: true };
    }

    const row = rows[0];
    const parsedJson = typeof row.parsed_json === 'string' ? JSON.parse(row.parsed_json) : row.parsed_json;

    // 尝试从 parsed_json 中提取数值
    if (parsedJson && typeof parsedJson === 'object') {
      const numericKeys = ['value', 'score', 'probability', 'confidence', 'level', 'count', 'rate'];
      for (const key of numericKeys) {
        if (typeof parsedJson[key] === 'number') {
          return { value: parsedJson[key], estimated: false };
        }
      }
      // 尝试查找任何数值字段
      for (const val of Object.values(parsedJson)) {
        if (typeof val === 'number') {
          return { value: val, estimated: false };
        }
      }
    }

    // 尝试从 state 字段推断
    if (row.state) {
      const stateMap: Record<string, number> = { active: 0.8, degraded: 0.4, failed: 0.1, pending: 0.5, archived: 0.2 };
      if (stateMap[row.state] !== undefined) {
        return { value: stateMap[row.state], estimated: true };
      }
    }

    return { value: 0.5, estimated: true };
  } catch {
    return { value: 0.5, estimated: true };
  }
}

// POST /api/causal/alert/check — 手动触发预警检查
app.post('/api/causal/alert/check', async (c) => {
  try {
    const pool = getPool();

    // 1. 获取所有启用的预警
    const { rows: alerts } = await pool.query(
      `SELECT
         a.id, a.edge_id, a.threshold, a.last_triggered_at,
         e.source_slug, e.target_slug, e.relation
       FROM causal_alerts a
       JOIN causal_edges e ON a.edge_id = e.id
       WHERE a.enabled = true`
    );

    const now = Date.now();
    const triggered: Array<{ alertId: number; edgeId: number; sourceSlug: string; targetSlug: string; message: string }> = [];

    for (const alert of alerts) {
      const threshold = typeof alert.threshold === 'string' ? JSON.parse(alert.threshold) : alert.threshold;
      const { condition, value: thresholdValue } = threshold;

      // 2. 获取父节点当前值
      const { value: currentValue, estimated } = await getNodeValue(pool, alert.source_slug);

      // 3. 检查是否超过阈值
      let crossed = false;
      switch (condition) {
        case 'gt': crossed = currentValue > thresholdValue; break;
        case 'lt': crossed = currentValue < thresholdValue; break;
        case 'gte': crossed = currentValue >= thresholdValue; break;
        case 'lte': crossed = currentValue <= thresholdValue; break;
      }

      if (!crossed) continue;

      // 4. 检查冷却期
      const lastTriggered = alert.last_triggered_at ? new Date(alert.last_triggered_at).getTime() : 0;
      if (now - lastTriggered < COOLDOWN_MS) continue;

      // 更新 last_triggered_at
      await pool.query('UPDATE causal_alerts SET last_triggered_at = NOW() WHERE id = $1', [alert.id]);

      const relationLabel = (() => {
        const map: Record<string, string> = {
          ':causesIncrease': '正向影响',
          ':causesDecrease': '负向影响',
          ':inhibits': '抑制',
          ':feedbackLoop': '反馈回路',
        };
        return map[alert.relation] || alert.relation;
      })();

      const direction = condition.startsWith('gt') ? '超过' : '低于';
      const message = `【因果预警】${alert.source_slug} ${relationLabel} ${alert.target_slug} — 当前值 ${currentValue.toFixed(2)} 已${direction}阈值 ${thresholdValue}`;

      triggered.push({
        alertId: alert.id,
        edgeId: alert.edge_id,
        sourceSlug: alert.source_slug,
        targetSlug: alert.target_slug,
        message,
      });
    }

    return c.json({ triggered });
  } catch (err) {
    logger.error({ err }, '预警检查失败');
    return c.json({ error: true, message: '预警检查失败' }, 500);
  }
});

// ── Hypergraph API ──────────────────────────────────────────────────────────

// GET /api/hypergraph — 返回完整超图数据
app.get('/api/hypergraph', async (c) => {
  const pool = getPool();
  const { rows: hyperedges } = await pool.query('SELECT * FROM hyperedges ORDER BY id');
  const { rows: causalHyperedges } = await pool.query(
    'SELECT ch.*, h.source_slugs, h.target_slugs, h.type FROM causal_hyperedges ch JOIN hyperedges h ON ch.hyperedge_id = h.id ORDER BY ch.id'
  );
  const { rows: cpts } = await pool.query('SELECT * FROM causal_cpt ORDER BY id');
  return c.json({ hyperedges, causalHyperedges, cpts });
});

// GET /api/hypergraph/subgraph — 按需返回子图
app.get('/api/hypergraph/subgraph', async (c) => {
  const slugs = (c.req.query('slugs') || '').split(',').filter(Boolean);
  if (slugs.length === 0) {
    return c.json({ hyperedges: [], causalHyperedges: [], cpts: [] });
  }
  const pool = getPool();
  const { rows: hyperedges } = await pool.query(
    'SELECT * FROM hyperedges WHERE source_slugs && $1::text[] OR target_slugs && $1::text[] ORDER BY id',
    [slugs]
  );
  const { rows: causalHyperedges } = await pool.query(
    'SELECT ch.*, h.source_slugs, h.target_slugs, h.type FROM causal_hyperedges ch JOIN hyperedges h ON ch.hyperedge_id = h.id WHERE h.source_slugs && $1::text[] OR h.target_slugs && $1::text[] ORDER BY ch.id',
    [slugs]
  );
  const { rows: cpts } = await pool.query(
    'SELECT * FROM causal_cpt WHERE variable_slug = ANY($1::text[]) ORDER BY id',
    [slugs]
  );
  return c.json({ hyperedges, causalHyperedges, cpts });
});

// POST /api/causal/query — 综合因果推理
app.post('/api/causal/query', async (c) => {
  const pool = getPool();
  const body = await c.req.json();
  const { question, scopeSlugs, maxResults } = body;

  if (!question) {
    return c.json({ error: 'question is required' }, 400);
  }

  // 1. Check cache
  const queryHash = crypto.createHash('sha256').update(question + JSON.stringify(scopeSlugs || [])).digest('hex').slice(0, 64);
  const { rows: cachedRows } = await pool.query(
    'SELECT result FROM causal_inference_cache WHERE query_hash = $1 AND expires_at > NOW()',
    [queryHash]
  );
  if (cachedRows.length > 0) {
    return c.json({ ...cachedRows[0].result, cached: true });
  }

  // 2. Build causal graph from DB
  let edgeQuery = 'SELECT * FROM causal_edges';
  let cptQuery = 'SELECT * FROM causal_cpt';
  const params: any[] = [];

  if (scopeSlugs && scopeSlugs.length > 0) {
    edgeQuery = `SELECT * FROM causal_edges WHERE source_slug = ANY($1) OR target_slug = ANY($1)`;
    cptQuery = `SELECT * FROM causal_cpt WHERE variable_slug = ANY($1)`;
    params.push(scopeSlugs);
  }

  const { rows: edgeRows } = await pool.query(edgeQuery, params);
  const { rows: cptRows } = await pool.query(cptQuery, params);

  // Also fetch hyperedges
  const { rows: hyperedgeRows } = await pool.query(
    'SELECT h.*, ch.lag, ch.weight, ch.conf, ch.evidence_spans FROM hyperedges h LEFT JOIN causal_hyperedges ch ON h.id = ch.hyperedge_id WHERE h.type = $1',
    [':jointlyCause']
  );

  const graph: CausalGraph = buildGraphFromDB(edgeRows, cptRows, hyperedgeRows);

  // 3. Extract target variable and intervention intent from question
  // Simple heuristic: look for "提高" or "降低" keywords
  const targetMatch = question.match(/(\S+)\s*(?:变|成为|的|概率|怎么样|如何)/);
  const interventionMatch = question.match(/(?:如果|把|将|让)\s*(\S+)\s*(?:从|提高|降低|变为|变成)\s*(\S+)/);

  // 4. Find relevant nodes in graph
  const allNodeSlugs = new Set<string>();
  for (const e of edgeRows) {
    allNodeSlugs.add(e.source_slug);
    allNodeSlugs.add(e.target_slug);
  }

  let targetSlug = '';
  let interventionSlug = '';
  let toState = 'high';

  // Try to match slugs from the question
  for (const slug of allNodeSlugs) {
    const readable = slug.replace(/_/g, '');
    if (question.includes(readable) || question.includes(slug)) {
      if (!targetSlug) {
        targetSlug = slug;
      } else if (!interventionSlug && slug !== targetSlug) {
        interventionSlug = slug;
      }
    }
  }

  // 5. Run reasoning
  let result;
  if (interventionSlug && targetSlug) {
    // Detect direction: "提高" means make it high, "降低" means make it low
    if (question.includes('降低') || question.includes('减少') || question.includes('抑制')) {
      toState = 'low';
    }

    // Check if there are hyperedges for joint inference
    const relevantHyperedges = graph.hyperedges?.filter(he =>
      he.targets.includes(targetSlug)
    );

    if (relevantHyperedges && relevantHyperedges.length > 0) {
      const jointInterventions = relevantHyperedges[0].sources.map(s => ({
        variable: s,
        toState: toState,
      }));
      result = jointCausalInference(graph, {
        target: targetSlug,
        interventions: jointInterventions,
        desiredState: toState,
      });
    } else {
      result = doCalculusOnHypergraph(graph, {
        target: targetSlug,
        intervention: { variable: interventionSlug, fromState: 'low', toState },
      });
    }
  } else {
    // No specific intervention found, return graph summary
    result = {
      baselineProbability: 0.5,
      interventionProbability: 0.5,
      delta: 0,
      confidenceInterval: [0.3, 0.7] as [number, number],
      method: 'heuristic' as const,
      assumptions: ['未能从问题中提取明确的干预变量和目标变量'],
      evidence: [],
      explanation: `因果图包含 ${allNodeSlugs.size} 个变量，${edgeRows.length} 条因果边。请提供更具体的问题，例如："如果提高X，Y会如何变化？"`,
    };
  }

  // 6. Build natural language report
  const report = buildCausalReport(question, result, targetSlug, interventionSlug, toState);

  // 7. Cache result
  await pool.query(
    `INSERT INTO causal_inference_cache (query_hash, result, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '1 hour')
     ON CONFLICT (query_hash) DO UPDATE SET result = $2, expires_at = NOW() + INTERVAL '1 hour'`,
    [queryHash, JSON.stringify({ ...result, report })]
  );

  return c.json({ ...result, report, cached: false });
});

// Helper: build natural language causal report
function buildCausalReport(
  question: string,
  result: any,
  targetSlug: string,
  interventionSlug: string,
  toState: string,
): string {
  if (!interventionSlug || !targetSlug) {
    return '未能识别具体的干预变量和目标变量。请提供更具体的问题。';
  }

  const targetName = targetSlug.replace(/_/g, '');
  const interventionName = interventionSlug.replace(/_/g, '');
  const direction = toState === 'high' ? '提高' : '降低';
  const effectDirection = result.delta > 0 ? '上升' : '下降';
  const effectMagnitude = Math.abs(result.delta) > 0.2 ? '显著' : Math.abs(result.delta) > 0.05 ? '中等' : '轻微';
  const confidence = result.method === 'cpt' ? '高' : '中等';
  const ciText = `95% 置信区间: [${(result.confidenceInterval[0] * 100).toFixed(0)}%, ${(result.confidenceInterval[1] * 100).toFixed(0)}%]`;

  let report = `## 因果推理报告\n\n`;
  report += `**问题**: ${question}\n\n`;
  report += `**分析**: 若将「${interventionName}」${direction}，则「${targetName}」变高的概率从 ${(result.baselineProbability * 100).toFixed(0)}% ${effectDirection}为 ${(result.interventionProbability * 100).toFixed(0)}%，变化幅度为 ${effectDirection} ${Math.abs(result.delta * 100).toFixed(0)} 个百分点。\n\n`;
  report += `**效应强度**: ${effectMagnitude}\n`;
  report += `**置信度**: ${confidence}（${result.method === 'cpt' ? '基于贝叶斯网络精确推理' : '基于启发式权重传播'}）\n`;
  report += `**置信区间**: ${ciText}\n\n`;

  if (result.assumptions && result.assumptions.length > 0) {
    report += `**假设前提**:\n`;
    for (const a of result.assumptions) {
      report += `- ${a}\n`;
    }
    report += '\n';
  }

  if (result.evidence && result.evidence.length > 0) {
    report += `**证据来源**:\n`;
    for (const e of result.evidence) {
      report += `- ${e.source}: ${e.text}\n`;
    }
  }

  return report;
}

// POST /api/causal/discovery — 运行因果发现
app.post('/api/causal/discovery', async (c) => {
  const result = await runCausalDiscovery();
  return c.json(result);
});

// POST /api/causal/apply-diff — 人工确认超边/因果边，设置 conf=1.0
app.post('/api/causal/apply-diff', async (c) => {
  try {
    const pool = getPool();
    const body = await c.req.json();
    const { diffId, type } = body;

    // If the diff is for a causal hyperedge and is being confirmed by a human,
    // set conf to 1.0 (or user-specified value)
    if (type === 'causal_hyperedge' || type === 'hyper_relation_add') {
      const conf = body.conf || 1.0; // Human-reviewed edges default to 1.0
      await pool.query(
        'UPDATE causal_hyperedges SET conf = $1 WHERE id = $2',
        [conf, diffId]
      );
    }

    return c.json({ message: 'Diff applied successfully' });
  } catch (err) {
    logger.error({ err }, 'apply-diff 失败');
    return c.json({ error: true, message: 'apply-diff 失败' }, 500);
  }
});

export default app;