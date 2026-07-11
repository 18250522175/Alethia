// ============================================================================
// InferNet — 轻量级贝叶斯推理库（纯 TypeScript，无外部依赖）
// 用于静态站点导出时的交互式 CPT 控件
// ============================================================================

export interface CompactCausalGraph {
  variables: string[];
  edges: Array<{
    source: string;
    target: string;
    relation: string;
    weight: number;
    conf: number;
    lag: string;
  }>;
  hyperedges?: Array<{
    sources: string[];
    targets: string[];
    type: string;
    weight: number;
    conf: number;
  }>;
  cpts: Record<string, CompactCPT>;
}

export interface CompactCPT {
  parents: string[];
  states: string[];
  table: Array<Record<string, any>>;
}

// ── 编译因果图为紧凑 JSON ──────────────────────────────────────────────────

export function compileCausalGraph(
  edges: Array<{
    source_slug: string;
    target_slug: string;
    relation: string;
    weight: number;
    conf: number;
    lag: string;
  }>,
  hyperedges: Array<{
    source_slugs: string[];
    target_slugs: string[];
    type: string;
    params: Record<string, any>;
  }>,
  cpts: Array<{
    variable_slug: string;
    conditions: Record<string, any>;
    probabilities: Record<string, any>;
  }>,
): CompactCausalGraph {
  const variables = new Set<string>();

  const compactEdges = edges.map(e => {
    variables.add(e.source_slug);
    variables.add(e.target_slug);
    return {
      source: e.source_slug,
      target: e.target_slug,
      relation: e.relation,
      weight: e.weight,
      conf: e.conf,
      lag: e.lag,
    };
  });

  const compactHyperedges = hyperedges.map(he => {
    for (const s of he.source_slugs) variables.add(s);
    for (const t of he.target_slugs) variables.add(t);
    return {
      sources: he.source_slugs,
      targets: he.target_slugs,
      type: he.type,
      weight: he.params?.weight || 0.5,
      conf: he.params?.conf || 0.5,
    };
  });

  const compactCpts: Record<string, CompactCPT> = {};
  for (const cpt of cpts) {
    variables.add(cpt.variable_slug);
    const parentVars: string[] = cpt.conditions?.parents || cpt.conditions?.parentVariables || [];
    const states: string[] = cpt.conditions?.states || ['low', 'high'];
    const table: Array<Record<string, any>> = cpt.probabilities?.table || cpt.probabilities?.rows || [];

    compactCpts[cpt.variable_slug] = {
      parents: parentVars as string[],
      states: states as string[],
      table,
    };
  }

  return {
    variables: Array.from(variables),
    edges: compactEdges,
    hyperedges: compactHyperedges.length > 0 ? compactHyperedges : undefined,
    cpts: compactCpts,
  };
}

// ── 简单推理（纯前端可用） ──────────────────────────────────────────────────

export function inferProbability(
  graph: CompactCausalGraph,
  target: string,
  evidence: Record<string, string>,
): Record<string, number> {
  const cpt = graph.cpts[target];
  if (!cpt) {
    return { 'high': 0.5, 'low': 0.5 };
  }

  const states = cpt.states;
  const result: Record<string, number> = {};
  let totalProb = 0;

  for (const state of states) {
    // Find matching row in CPT
    let prob = 0.5; // default
    for (const row of cpt.table) {
      let match = true;
      for (const parent of cpt.parents) {
        if (evidence[parent] && row[parent] !== evidence[parent]) {
          match = false;
          break;
        }
      }
      if (match) {
        // Get the probability for this state
        const stateKey = state;
        const probKey = stateKey === states[0] ? 'probability' : `prob_${stateKey}`;
        const probValue = parseFloat(row[probKey] || row[stateKey] || '0.5');
        prob = probValue;
        break;
      }
    }
    result[state] = prob;
    totalProb += prob;
  }

  // Normalize
  if (totalProb > 0 && totalProb !== 1) {
    for (const state of states) {
      result[state] = result[state] / totalProb;
    }
  }

  return result;
}

// ── 生成可嵌入的 JS 代码 ────────────────────────────────────────────────────

export function generateInferNetJS(): string {
  return `
// InferNet — Alethia 贝叶斯推理引擎（嵌入式版本）
(function() {
  window.InferNet = {
    inferProbability: function(graph, target, evidence) {
      var cpt = graph.cpts[target];
      if (!cpt) return { high: 0.5, low: 0.5 };
      
      var result = {};
      var total = 0;
      
      for (var i = 0; i < cpt.states.length; i++) {
        var state = cpt.states[i];
        var prob = 0.5;
        
        for (var j = 0; j < cpt.table.length; j++) {
          var row = cpt.table[j];
          var match = true;
          for (var k = 0; k < cpt.parents.length; k++) {
            var parent = cpt.parents[k];
            if (evidence[parent] && row[parent] !== evidence[parent]) {
              match = false;
              break;
            }
          }
          if (match) {
            prob = parseFloat(row[state] || row.probability || '0.5');
            break;
          }
        }
        result[state] = prob;
        total += prob;
      }
      
      if (total > 0 && total !== 1) {
        for (var s in result) result[s] = result[s] / total;
      }
      
      return result;
    }
  };
})();
`.trim();
}

export default {
  compileCausalGraph,
  inferProbability,
  generateInferNetJS,
};