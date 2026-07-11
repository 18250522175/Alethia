// ============================================================================
// 因果推理引擎 — 贝叶斯网络推理、反事实推演、回溯分析
// 纯 TypeScript 实现，无外部依赖
// ============================================================================

// ── 核心类型 ────────────────────────────────────────────────────────────────

export interface CausalGraph {
  edges: Array<{
    source: string;
    target: string;
    relation: string;
    weight: number;
    conf: number;
    lag: string;
    evidence?: string[];
  }>;
  cpts: Map<string, CausalCPT>;
}

export interface CausalCPT {
  variableSlug: string;
  parentVariables: string[];
  states: string[];
  table: Array<Record<string, string>>;
}

export interface InterventionQuery {
  target: string;
  intervention: {
    variable: string;
    fromState: string;
    toState: string;
  };
  background?: Record<string, string>;
}

export interface CausalReasoningResult {
  baselineProbability: number;
  interventionProbability: number;
  delta: number;
  confidenceInterval: [number, number];
  method: 'cpt' | 'heuristic';
  assumptions: string[];
  evidence: Array<{ source: string; text: string }>;
}

// ── 内部类型 ─────────────────────────────────────────────────────────────────

interface FactorTable {
  variables: string[];
  rows: Map<string, number>; // key 是状态组合的字符串，value 是概率
}

interface NetworkNode {
  slug: string;
  parents: string[];
  children: string[];
  cpt: CausalCPT | null;
  states: string[];
}

// ── 辅助函数 ─────────────────────────────────────────────────────────────────

/** 简单的伪随机数生成器 (LCG, 固定种子) */
function createRNG(seed: number = 42) {
  let state = seed;
  return {
    next(): number {
      state = (state * 1664525 + 1013904223) & 0xFFFFFFFF;
      return (state >>> 0) / 0xFFFFFFFF;
    },
    pick<T>(arr: T[]): T {
      return arr[Math.floor(this.next() * arr.length)];
    },
    weightedPick<T>(items: T[], weights: number[]): T {
      const total = weights.reduce((a, b) => a + b, 0);
      let r = this.next() * total;
      for (let i = 0; i < items.length; i++) {
        r -= weights[i];
        if (r <= 0) return items[i];
      }
      return items[items.length - 1];
    },
  };
}

/** 解析 lag 字段为时间步数 (1 step ≈ 1 week) */
function parseLagToSteps(lag: string): number {
  if (!lag || lag === '') return 0;
  const match = lag.match(/^(\d+(?:\.\d+)?)\s*(d|w|m|q|y)?$/i);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  const unit = (match[2] || 'w').toLowerCase();
  switch (unit) {
    case 'd': return Math.round(num / 7);
    case 'w': return Math.round(num);
    case 'm': return Math.round(num * 4);
    case 'q': return Math.round(num * 12);
    case 'y': return Math.round(num * 52);
    default: return Math.round(num);
  }
}

/** 解析关系类型为符号 */
function relationSign(relation: string): number {
  if (relation.includes('causesIncrease') || relation.includes('increases')) return 1;
  if (relation.includes('causesDecrease') || relation.includes('decreases')) return -1;
  if (relation.includes('inhibits')) return -1;
  if (relation.includes('feedbackLoop')) return 0;
  return 0;
}

/** 解析关系类型为中文标签 */
function relationLabel(relation: string): string {
  if (relation.includes('causesIncrease')) return '正向因果';
  if (relation.includes('causesDecrease')) return '负向因果';
  if (relation.includes('inhibits')) return '抑制';
  if (relation.includes('feedbackLoop')) return '反馈回路';
  return relation;
}

/** 构建网络拓扑 */
function buildNetwork(graph: CausalGraph): Map<string, NetworkNode> {
  const nodes = new Map<string, NetworkNode>();

  for (const edge of graph.edges) {
    if (!nodes.has(edge.source)) {
      nodes.set(edge.source, {
        slug: edge.source,
        parents: [],
        children: [],
        cpt: null,
        states: ['low', 'high'],
      });
    }
    if (!nodes.has(edge.target)) {
      nodes.set(edge.target, {
        slug: edge.target,
        parents: [],
        children: [],
        cpt: null,
        states: ['low', 'high'],
      });
    }
    const target = nodes.get(edge.target)!;
    const source = nodes.get(edge.source)!;
    target.parents.push(edge.source);
    source.children.push(edge.target);
  }

  // 附加 CPT 数据
  for (const [slug, cpt] of graph.cpts) {
    const node = nodes.get(slug);
    if (node) {
      node.cpt = cpt;
      node.states = cpt.states.length > 0 ? cpt.states : ['low', 'high'];
    }
  }

  return nodes;
}

/** 获取节点的马尔可夫毯 */
function getMarkovBlanket(nodes: Map<string, NetworkNode>, slug: string): string[] {
  const node = nodes.get(slug);
  if (!node) return [];
  const blanket = new Set<string>();
  // 父节点
  for (const p of node.parents) blanket.add(p);
  // 子节点
  for (const c of node.children) blanket.add(c);
  // 子节点的其他父节点 (配偶)
  for (const c of node.children) {
    const child = nodes.get(c);
    if (child) {
      for (const p of child.parents) {
        if (p !== slug) blanket.add(p);
      }
    }
  }
  return Array.from(blanket);
}

/** 计算加权平均置信度 */
function averageConf(values: number[]): number {
  if (values.length === 0) return 0.5;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// ── 因子操作 ─────────────────────────────────────────────────────────────────

/** 从 CPT 构建因子 */
function buildFactorFromCPT(cpt: CausalCPT): FactorTable {
  const rows = new Map<string, number>();
  for (const row of cpt.table) {
    // 构建键: parent1=state1|parent2=state2|...|variable=state
    const parts: string[] = [];
    for (const p of cpt.parentVariables) {
      parts.push(`${p}=${row[p] || 'low'}`);
    }
    const prob = parseFloat(row['probability'] || row['prob'] || '0.5');
    for (const state of cpt.states) {
      const key = [...parts, `${cpt.variableSlug}=${state}`].join('|');
      rows.set(key, state === (row['state'] || row['outcome'] || 'high') ? prob : 1 - prob);
    }
  }
  return {
    variables: [...cpt.parentVariables, cpt.variableSlug],
    rows,
  };
}

/** 从边构建启发式因子 (无 CPT 时使用) */
function buildHeuristicFactor(
  targetSlug: string,
  parentSlugs: string[],
  edges: CausalGraph['edges'],
): FactorTable {
  const rows = new Map<string, number>();
  const states = ['low', 'high'];

  // 对每个父节点状态组合，计算目标为 high 的概率
  const generateCombinations = (
    remaining: string[],
    current: Record<string, string>,
  ): void => {
    if (remaining.length === 0) {
      // 计算加权和
      let weightedSum = 0;
      let totalWeight = 0;
      for (const p of parentSlugs) {
        const parentEdges = edges.filter(e => e.source === p && e.target === targetSlug);
        for (const edge of parentEdges) {
          const sign = relationSign(edge.relation);
          const parentState = current[p] || 'low';
          const parentEffect = parentState === 'high' ? 1 : -1;
          weightedSum += sign * parentEffect * edge.weight * edge.conf;
          totalWeight += Math.abs(edge.weight * edge.conf);
        }
      }
      // Sigmoid 映射到概率
      const logit = totalWeight > 0 ? weightedSum / totalWeight : 0;
      const probHigh = 1 / (1 + Math.exp(-logit * 2)); // 缩放系数

      const parts = parentSlugs.map(p => `${p}=${current[p] || 'low'}`).join('|');
      rows.set(`${parts}|${targetSlug}=high`, probHigh);
      rows.set(`${parts}|${targetSlug}=low`, 1 - probHigh);
      return;
    }
    const [head, ...tail] = remaining;
    for (const state of states) {
      generateCombinations(tail, { ...current, [head]: state });
    }
  };

  generateCombinations(parentSlugs, {});
  return {
    variables: [...parentSlugs, targetSlug],
    rows,
  };
}

/** 因子乘法 */
function factorMultiply(a: FactorTable, b: FactorTable): FactorTable {
  const allVars = [...new Set([...a.variables, ...b.variables])];
  const rows = new Map<string, number>();

  for (const [keyA, valA] of a.rows) {
    const mapA = parseKey(keyA);
    for (const [keyB, valB] of b.rows) {
      const mapB = parseKey(keyB);
      // 检查共享变量是否一致
      let consistent = true;
      for (const v of a.variables) {
        if (b.variables.includes(v) && mapA[v] !== mapB[v]) {
          consistent = false;
          break;
        }
      }
      if (!consistent) continue;
      const merged = { ...mapA, ...mapB };
      const newKey = allVars.map(v => `${v}=${merged[v]}`).join('|');
      rows.set(newKey, (rows.get(newKey) || 0) + valA * valB);
    }
  }

  return { variables: allVars, rows };
}

/** 因子边缘化 (对变量求和) */
function factorSumOut(factor: FactorTable, variable: string): FactorTable {
  const remainingVars = factor.variables.filter(v => v !== variable);
  const rows = new Map<string, number>();

  for (const [key, val] of factor.rows) {
    const map = parseKey(key);
    const newKey = remainingVars.map(v => `${v}=${map[v]}`).join('|');
    rows.set(newKey, (rows.get(newKey) || 0) + val);
  }

  return { variables: remainingVars, rows };
}

/** 因子归一化 */
function factorNormalize(factor: FactorTable): FactorTable {
  const total = Array.from(factor.rows.values()).reduce((a, b) => a + b, 0);
  if (total === 0) return factor;
  const rows = new Map<string, number>();
  for (const [key, val] of factor.rows) {
    rows.set(key, val / total);
  }
  return { ...factor, rows };
}

/** 解析键字符串 */
function parseKey(key: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const part of key.split('|')) {
    const [k, v] = part.split('=');
    if (k && v) map[k] = v;
  }
  return map;
}

// ── 变量消除算法 ─────────────────────────────────────────────────────────────

function variableElimination(
  graph: CausalGraph,
  query: InterventionQuery,
): { probHigh: number; evidence: Array<{ source: string; text: string }> } {
  const nodes = buildNetwork(graph);
  const targetNode = nodes.get(query.target);
  if (!targetNode) {
    return { probHigh: 0.5, evidence: [] };
  }

  // 收集所有相关变量
  const relevantVars = new Set<string>();
  const collectVars = (slug: string, visited: Set<string>) => {
    if (visited.has(slug)) return;
    visited.add(slug);
    relevantVars.add(slug);
    const node = nodes.get(slug);
    if (node) {
      for (const p of node.parents) collectVars(p, visited);
      for (const c of node.children) collectVars(c, visited);
    }
  };
  collectVars(query.target, new Set<string>());
  collectVars(query.intervention.variable, new Set<string>());

  // 构建因子列表
  const factors: FactorTable[] = [];

  for (const slug of relevantVars) {
    const node = nodes.get(slug);
    if (!node) continue;

    if (slug === query.intervention.variable) {
      // do-operator: 移除入边，固定为干预状态
      continue;
    }

    if (node.cpt) {
      factors.push(buildFactorFromCPT(node.cpt));
    } else if (node.parents.length > 0) {
      // 使用启发式因子
      const relevantParents = node.parents.filter(p => relevantVars.has(p));
      if (relevantParents.length > 0) {
        factors.push(buildHeuristicFactor(slug, relevantParents, graph.edges));
      }
    }
  }

  // 如果没有因子，返回启发式估计
  if (factors.length === 0) {
    return heuristicEstimate(graph, query);
  }

  // 变量消除顺序：先消除非查询变量
  const allFactorVars = new Set<string>();
  for (const f of factors) {
    for (const v of f.variables) allFactorVars.add(v);
  }

  const queryVars = new Set<string>([query.target]);
  if (query.background) {
    for (const v of Object.keys(query.background)) queryVars.add(v);
  }

  const eliminationOrder: string[] = [];
  for (const v of allFactorVars) {
    if (!queryVars.has(v)) {
      eliminationOrder.push(v);
    }
  }

  // 执行消除
  let currentFactors = factors;
  for (const v of eliminationOrder) {
    // 找到包含该变量的因子
    const relevantFactors = currentFactors.filter(f => f.variables.includes(v));
    const otherFactors = currentFactors.filter(f => !f.variables.includes(v));

    if (relevantFactors.length === 0) {
      currentFactors = otherFactors;
      continue;
    }

    // 乘所有相关因子
    let product = relevantFactors[0];
    for (let i = 1; i < relevantFactors.length; i++) {
      product = factorMultiply(product, relevantFactors[i]);
    }

    // 对 v 求和
    product = factorSumOut(product, v);

    currentFactors = [...otherFactors, product];
  }

  // 乘所有剩余因子
  let finalFactor: FactorTable = currentFactors[0] || { variables: [], rows: new Map() };
  for (let i = 1; i < currentFactors.length; i++) {
    finalFactor = factorMultiply(finalFactor, currentFactors[i]);
  }
  finalFactor = factorNormalize(finalFactor);

  // 在干预条件下查询
  let probHigh = 0.5;
  const interventionState = query.intervention.toState;

  for (const [key, val] of finalFactor.rows) {
    const map = parseKey(key);
    const targetState = map[query.target];
    const ivState = map[query.intervention.variable];

    if (ivState && ivState !== interventionState) continue;

    // 检查背景条件
    if (query.background) {
      let match = true;
      for (const [bgVar, bgState] of Object.entries(query.background)) {
        if (map[bgVar] && map[bgVar] !== bgState) {
          match = false;
          break;
        }
      }
      if (!match) continue;
    }

    if (targetState === 'high') {
      probHigh = val;
      break;
    }
  }

  // 收集证据
  const evidence = collectEvidence(graph, query);

  return { probHigh, evidence };
}

// ── 启发式估计 ───────────────────────────────────────────────────────────────

function heuristicEstimate(
  graph: CausalGraph,
  query: InterventionQuery,
): { probHigh: number; evidence: Array<{ source: string; text: string }> } {
  const nodes = buildNetwork(graph);
  const targetNode = nodes.get(query.target);
  const ivNode = nodes.get(query.intervention.variable);

  if (!targetNode) {
    return { probHigh: 0.5, evidence: [] };
  }

  // 找干预变量到目标变量的路径
  const paths = findAllPaths(nodes, query.intervention.variable, query.target, 5);

  // 计算每条路径的影响
  let totalEffect = 0;
  let totalWeight = 0;

  for (const path of paths) {
    let pathEffect = 1;
    let pathWeight = 1;
    for (let i = 0; i < path.length - 1; i++) {
      const edge = graph.edges.find(
        e => e.source === path[i] && e.target === path[i + 1],
      );
      if (edge) {
        pathEffect *= relationSign(edge.relation);
        pathWeight *= edge.weight * edge.conf;
      }
    }
    totalEffect += pathEffect * pathWeight;
    totalWeight += Math.abs(pathWeight);
  }

  // 基线概率 (基于父节点估计)
  let baselineProb = 0.5;
  if (targetNode.parents.length > 0) {
    let parentSum = 0;
    let parentWeight = 0;
    for (const parentSlug of targetNode.parents) {
      const edges = graph.edges.filter(e => e.source === parentSlug && e.target === query.target);
      for (const edge of edges) {
        const sign = relationSign(edge.relation);
        parentSum += sign * edge.weight * edge.conf;
        parentWeight += Math.abs(edge.weight * edge.conf);
      }
    }
    if (parentWeight > 0) {
      const logit = parentSum / parentWeight;
      baselineProb = 1 / (1 + Math.exp(-logit * 2));
    }
  }

  // 干预后概率
  const effectMagnitude = totalWeight > 0 ? totalEffect / totalWeight : 0;
  const logitBase = Math.log(baselineProb / (1 - baselineProb));
  const logitIntervention = logitBase + effectMagnitude * 2;
  const probHigh = 1 / (1 + Math.exp(-logitIntervention));

  const evidence = collectEvidence(graph, query);

  return { probHigh: Math.max(0.01, Math.min(0.99, probHigh)), evidence };
}

/** 查找两个节点之间的所有简单路径 (BFS) */
function findAllPaths(
  nodes: Map<string, NetworkNode>,
  source: string,
  target: string,
  maxLength: number,
): string[][] {
  const paths: string[][] = [];
  const queue: Array<{ path: string[]; visited: Set<string> }> = [
    { path: [source], visited: new Set([source]) },
  ];

  while (queue.length > 0) {
    const { path, visited } = queue.shift()!;
    const current = path[path.length - 1];

    if (path.length > maxLength) continue;

    if (current === target && path.length > 1) {
      paths.push([...path]);
      continue;
    }

    const node = nodes.get(current);
    if (!node) continue;

    for (const child of node.children) {
      if (!visited.has(child)) {
        const newVisited = new Set(visited);
        newVisited.add(child);
        queue.push({ path: [...path, child], visited: newVisited });
      }
    }
  }

  return paths;
}

/** 收集证据链 */
function collectEvidence(
  graph: CausalGraph,
  query: InterventionQuery,
): Array<{ source: string; text: string }> {
  const evidence: Array<{ source: string; text: string }> = [];
  const nodes = buildNetwork(graph);

  // 收集从干预到目标的路径上的边证据
  const paths = findAllPaths(nodes, query.intervention.variable, query.target, 5);
  const seenEdges = new Set<string>();

  for (const path of paths) {
    for (let i = 0; i < path.length - 1; i++) {
      const edgeKey = `${path[i]}->${path[i + 1]}`;
      if (seenEdges.has(edgeKey)) continue;
      seenEdges.add(edgeKey);

      const edge = graph.edges.find(
        e => e.source === path[i] && e.target === path[i + 1],
      );
      if (edge && edge.evidence && edge.evidence.length > 0) {
        for (const ev of edge.evidence) {
          evidence.push({
            source: `${edge.source} → ${edge.target}`,
            text: ev,
          });
        }
      }
    }
  }

  return evidence;
}

// ── 9c: Gibbs 采样 ───────────────────────────────────────────────────────────

export function gibbsSampling(
  graph: CausalGraph,
  query: InterventionQuery,
  samples: number = 10000,
): CausalReasoningResult {
  const nodes = buildNetwork(graph);
  const allSlugs = Array.from(nodes.keys());
  const rng = createRNG(42);

  if (allSlugs.length === 0) {
    return {
      baselineProbability: 0.5,
      interventionProbability: 0.5,
      delta: 0,
      confidenceInterval: [0.5, 0.5],
      method: 'heuristic',
      assumptions: ['空图，返回默认概率'],
      evidence: [],
    };
  }

  // 初始化状态
  const state: Record<string, string> = {};
  for (const slug of allSlugs) {
    const node = nodes.get(slug)!;
    state[slug] = rng.pick(node.states);
  }

  // 从 CPT 或边获取条件概率
  function getConditionalProb(
    slug: string,
    targetState: string,
    currentState: Record<string, string>,
    graph: CausalGraph,
    nodes: Map<string, NetworkNode>,
  ): number {
    const node = nodes.get(slug);
    if (!node) return 0.5;

    if (node.cpt && node.cpt.table.length > 0) {
      // 使用 CPT
      const parentAssignments = node.cpt.parentVariables.map(p => currentState[p] || 'low');
      for (const row of node.cpt.table) {
        let match = true;
        for (const p of node.cpt.parentVariables) {
          if (row[p] !== currentState[p]) {
            match = false;
            break;
          }
        }
        if (match) {
          const rowState = row['state'] || row['outcome'] || 'high';
          const prob = parseFloat(row['probability'] || row['prob'] || '0.5');
          return targetState === rowState ? prob : 1 - prob;
        }
      }
      return 0.5;
    }

    // 启发式: 基于父节点加权
    if (node.parents.length === 0) return 0.5;

    let weightedSum = 0;
    let totalWeight = 0;
    for (const p of node.parents) {
      const edges = graph.edges.filter(e => e.source === p && e.target === slug);
      for (const edge of edges) {
        const sign = relationSign(edge.relation);
        const parentEffect = (currentState[p] || 'low') === 'high' ? 1 : -1;
        weightedSum += sign * parentEffect * edge.weight * edge.conf;
        totalWeight += Math.abs(edge.weight * edge.conf);
      }
    }

    const logit = totalWeight > 0 ? weightedSum / totalWeight : 0;
    const probHigh = 1 / (1 + Math.exp(-logit * 2));
    return targetState === 'high' ? probHigh : 1 - probHigh;
  }

  // 基线采样 (无干预)
  let baselineHighCount = 0;
  const burnIn = Math.min(1000, Math.floor(samples * 0.1));

  for (let iter = 0; iter < samples; iter++) {
    for (const slug of allSlugs) {
      const probHigh = getConditionalProb(slug, 'high', state, graph, nodes);
      state[slug] = rng.next() < probHigh ? 'high' : 'low';
    }
    if (iter >= burnIn) {
      if (state[query.target] === 'high') baselineHighCount++;
    }
  }

  const baselineProb = baselineHighCount / (samples - burnIn);

  // 干预采样 (do-operator)
  let interventionHighCount = 0;
  const ivState: Record<string, string> = {};
  for (const slug of allSlugs) {
    ivState[slug] = rng.pick(nodes.get(slug)!.states);
  }

  for (let iter = 0; iter < samples; iter++) {
    // 干预变量固定
    ivState[query.intervention.variable] = query.intervention.toState;

    for (const slug of allSlugs) {
      if (slug === query.intervention.variable) continue; // 固定
      const probHigh = getConditionalProb(slug, 'high', ivState, graph, nodes);
      ivState[slug] = rng.next() < probHigh ? 'high' : 'low';
    }
    if (iter >= burnIn) {
      if (ivState[query.target] === 'high') interventionHighCount++;
    }
  }

  const interventionProb = interventionHighCount / (samples - burnIn);
  const delta = interventionProb - baselineProb;

  // 置信区间 (基于二项分布的正态近似)
  const se = Math.sqrt((interventionProb * (1 - interventionProb)) / (samples - burnIn));
  const ci: [number, number] = [
    Math.max(0, interventionProb - 1.96 * se),
    Math.min(1, interventionProb + 1.96 * se),
  ];

  const evidence = collectEvidence(graph, query);

  return {
    baselineProbability: baselineProb,
    interventionProbability: interventionProb,
    delta,
    confidenceInterval: ci,
    method: 'heuristic',
    assumptions: [
      '使用 Gibbs 采样近似推理',
      `采样数: ${samples}, 烧入: ${burnIn}`,
      '马尔可夫链已达稳态',
    ],
    evidence,
  };
}

// ── 9b: do-calculus 主入口 ───────────────────────────────────────────────────

export function doCalculus(
  graph: CausalGraph,
  query: InterventionQuery,
): CausalReasoningResult {
  // 空图处理
  if (!graph.edges || graph.edges.length === 0) {
    return {
      baselineProbability: 0.5,
      interventionProbability: 0.5,
      delta: 0,
      confidenceInterval: [0.5, 0.5],
      method: 'heuristic',
      assumptions: ['因果图为空，无法进行推理'],
      evidence: [],
    };
  }

  const nodes = buildNetwork(graph);

  // 检查是否有 CPT 数据
  const hasCPTs = graph.cpts && graph.cpts.size > 0;

  // 网络规模判断
  if (nodes.size > 10) {
    return gibbsSampling(graph, query);
  }

  if (hasCPTs) {
    // 使用变量消除
    const { probHigh, evidence } = variableElimination(graph, query);

    // 基线概率 (无干预)
    const baselineQuery: InterventionQuery = {
      ...query,
      intervention: {
        ...query.intervention,
        toState: query.intervention.fromState,
      },
    };
    const { probHigh: baselineProb } = variableElimination(graph, baselineQuery);

    const delta = probHigh - baselineProb;
    const ci = computeConfidenceInterval(graph, query);

    return {
      baselineProbability: baselineProb,
      interventionProbability: probHigh,
      delta,
      confidenceInterval: ci,
      method: 'cpt',
      assumptions: [
        '使用变量消除算法进行精确推理',
        'CPT 数据来源于知识库提取',
        '假设因果充分性（无未观测混杂因子）',
      ],
      evidence,
    };
  }

  // 无 CPT: 使用启发式
  const { probHigh, evidence } = heuristicEstimate(graph, query);

  const baselineQuery: InterventionQuery = {
    ...query,
    intervention: {
      ...query.intervention,
      toState: query.intervention.fromState,
    },
  };
  const { probHigh: baselineProb } = heuristicEstimate(graph, baselineQuery);

  const delta = probHigh - baselineProb;
  const ci = computeConfidenceInterval(graph, query);

  return {
    baselineProbability: baselineProb,
    interventionProbability: probHigh,
    delta,
    confidenceInterval: ci,
    method: 'heuristic',
    assumptions: [
      '无 CPT 数据，使用启发式权重传播',
      '假设边权重可靠反映因果强度',
      '假设线性可加效应',
      '假设因果充分性（无未观测混杂因子）',
    ],
    evidence,
  };
}

/** 计算置信区间 */
function computeConfidenceInterval(
  graph: CausalGraph,
  query: InterventionQuery,
): [number, number] {
  // 基于边置信度的平均估计
  const nodes = buildNetwork(graph);
  const paths = findAllPaths(nodes, query.intervention.variable, query.target, 5);

  if (paths.length === 0) return [0.4, 0.6];

  let totalConf = 0;
  let edgeCount = 0;
  for (const path of paths) {
    for (let i = 0; i < path.length - 1; i++) {
      const edge = graph.edges.find(
        e => e.source === path[i] && e.target === path[i + 1],
      );
      if (edge) {
        totalConf += edge.conf;
        edgeCount++;
      }
    }
  }

  const avgConf = edgeCount > 0 ? totalConf / edgeCount : 0.5;
  const halfWidth = (1 - avgConf) * 0.2 + 0.02;
  return [Math.max(0, 0.5 - halfWidth), Math.min(1, 0.5 + halfWidth)];
}

// ── 9d: 时间脉冲响应 ─────────────────────────────────────────────────────────

export function timePulseResponse(
  graph: CausalGraph,
  intervention: InterventionQuery,
  steps: number = 5,
): Array<{ step: number; probability: number; confidence: [number, number] }> {
  const nodes = buildNetwork(graph);
  const results: Array<{ step: number; probability: number; confidence: [number, number] }> = [];

  if (!nodes.has(intervention.target) || !nodes.has(intervention.intervention.variable)) {
    return results;
  }

  // 初始化所有节点状态为 'low'
  const state: Record<string, string> = {};
  for (const slug of nodes.keys()) {
    state[slug] = 'low';
  }

  // 干预发生
  state[intervention.intervention.variable] = intervention.intervention.toState;

  // 构建延迟映射: slug -> { stepOffset, sourceSlug, effect }
  const delayMap = new Map<string, Array<{ step: number; source: string; effect: number }>>();
  for (const edge of graph.edges) {
    const lagSteps = parseLagToSteps(edge.lag);
    if (!delayMap.has(edge.target)) {
      delayMap.set(edge.target, []);
    }
    delayMap.get(edge.target)!.push({
      step: lagSteps,
      source: edge.source,
      effect: relationSign(edge.relation) * edge.weight * edge.conf,
    });
  }

  // 计算初始概率
  const initialProb = state[intervention.target] === 'high' ? 1 : 0;

  // 模拟时间步
  const changedNodes = new Set<string>([intervention.intervention.variable]);
  const prevChanged = new Set<string>();

  for (let step = 0; step <= steps; step++) {
    if (step === 0) {
      results.push({
        step: 0,
        probability: initialProb,
        confidence: [initialProb - 0.05, initialProb + 0.05],
      });
      continue;
    }

    // 传播: 检查本步应该更新的节点
    const newChanged = new Set<string>();
    const newState = { ...state };

    for (const [targetSlug, delays] of delayMap) {
      for (const delay of delays) {
        if (delay.step === step - 1 && changedNodes.has(delay.source) && !prevChanged.has(delay.source)) {
          // 这个延迟信号的源节点在上一轮发生了变化
          // 计算累积效应
          let totalEffect = 0;
          let totalWeight = 0;
          for (const d of delays) {
            if (d.step <= step - 1) {
              const sourceState = state[d.source] || 'low';
              const sourceEffect = sourceState === 'high' ? d.effect : -d.effect;
              totalEffect += sourceEffect;
              totalWeight += Math.abs(d.effect);
            }
          }
          if (totalWeight > 0) {
            const logit = totalEffect / totalWeight;
            const probHigh = 1 / (1 + Math.exp(-logit * 2));
            newState[targetSlug] = probHigh > 0.5 ? 'high' : 'low';
            newChanged.add(targetSlug);
          }
        }
      }
    }

    // 应用状态变化
    for (const slug of newChanged) {
      state[slug] = newState[slug];
    }

    // 更新目标概率
    const targetState = state[intervention.target] || 'low';
    const prob = targetState === 'high' ? 0.8 : 0.2;

    results.push({
      step,
      probability: prob,
      confidence: [Math.max(0, prob - 0.1), Math.min(1, prob + 0.1)],
    });

    prevChanged.clear();
    for (const s of changedNodes) prevChanged.add(s);
    changedNodes.clear();
    for (const s of newChanged) changedNodes.add(s);
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Task 10: 反事实推理与回溯推演
// ═══════════════════════════════════════════════════════════════════════════════

// ── 10a: 反事实推理 ──────────────────────────────────────────────────────────

export function counterfactualInference(
  graph: CausalGraph,
  query: {
    observed: Record<string, string>;
    hypothetical: InterventionQuery;
  },
): CausalReasoningResult {
  const nodes = buildNetwork(graph);

  if (nodes.size === 0) {
    return {
      baselineProbability: 0.5,
      interventionProbability: 0.5,
      delta: 0,
      confidenceInterval: [0.5, 0.5],
      method: 'heuristic',
      assumptions: ['空图，无法进行反事实推理'],
      evidence: [],
    };
  }

  // Step 1: Abduction — 根据观测推断外生变量的后验分布
  // 简化: 用观测状态更新基线估计
  const actualQuery: InterventionQuery = {
    target: query.hypothetical.target,
    intervention: {
      variable: query.hypothetical.intervention.variable,
      fromState: query.hypothetical.intervention.fromState,
      toState: query.hypothetical.intervention.fromState, // 实际未干预
    },
    background: query.observed,
  };

  let actualResult: CausalReasoningResult;
  if (nodes.size > 10) {
    actualResult = gibbsSampling(graph, actualQuery);
  } else {
    actualResult = doCalculus(graph, actualQuery);
  }

  // Step 2: Action — 应用假设干预 (do-operator)
  const counterfactualResult = doCalculus(graph, {
    ...query.hypothetical,
    background: query.observed,
  });

  // Step 3: Prediction — 计算反事实概率
  const delta = counterfactualResult.interventionProbability - actualResult.baselineProbability;

  return {
    baselineProbability: actualResult.baselineProbability,
    interventionProbability: counterfactualResult.interventionProbability,
    delta,
    confidenceInterval: counterfactualResult.confidenceInterval,
    method: actualResult.method,
    assumptions: [
      '反事实推理: 外展 → 行动 → 预测',
      `观测变量: ${Object.keys(query.observed).join(', ')}`,
      '假设因果模型结构正确',
      '假设无未建模的混淆因子',
    ],
    evidence: counterfactualResult.evidence,
  };
}

// ── 10b: 回溯推理 ────────────────────────────────────────────────────────────

export function backwardReasoning(
  graph: CausalGraph,
  target: string,
  desiredState: string,
): Array<{ variable: string; effect: number; confidence: number }> {
  const nodes = buildNetwork(graph);
  const targetNode = nodes.get(target);

  if (!targetNode || targetNode.parents.length === 0) {
    return [];
  }

  const candidates: Array<{ variable: string; effect: number; confidence: number }> = [];

  for (const parentSlug of targetNode.parents) {
    const parentNode = nodes.get(parentSlug);
    if (!parentNode) continue;

    // 计算该父节点对目标的影响
    const edges = graph.edges.filter(e => e.source === parentSlug && e.target === target);

    let totalEffect = 0;
    let totalWeight = 0;

    for (const edge of edges) {
      const sign = relationSign(edge.relation);
      const effect = sign * edge.weight * edge.conf;
      totalEffect += effect;
      totalWeight += Math.abs(edge.weight * edge.conf);
    }

    // 归一化效应
    const normalizedEffect = totalWeight > 0 ? totalEffect / totalWeight : 0;

    // 置信度: 边置信度的平均
    const avgConf = edges.length > 0
      ? edges.reduce((sum, e) => sum + e.conf, 0) / edges.length
      : 0.5;

    // 如果期望状态是 high，正向效应是好的；如果期望状态是 low，负向效应是好的
    const adjustedEffect = desiredState === 'high' ? normalizedEffect : -normalizedEffect;

    // 也考虑二阶效应 (父节点的父节点)
    let secondOrderEffect = 0;
    let secondOrderConf = 0;
    for (const grandParent of parentNode.parents) {
      const gpEdges = graph.edges.filter(e => e.source === grandParent && e.target === parentSlug);
      for (const gpEdge of gpEdges) {
        const gpSign = relationSign(gpEdge.relation);
        secondOrderEffect += gpSign * gpEdge.weight * gpEdge.conf * normalizedEffect * 0.5;
        secondOrderConf += gpEdge.conf;
      }
    }

    const totalAdjustedEffect = adjustedEffect + secondOrderEffect * 0.3;
    const combinedConf = avgConf * 0.7 + (secondOrderConf > 0 ? secondOrderConf / parentNode.parents.length : 0) * 0.3;

    candidates.push({
      variable: parentSlug,
      effect: Math.round(totalAdjustedEffect * 1000) / 1000,
      confidence: Math.round(combinedConf * 1000) / 1000,
    });
  }

  // 按效应绝对值降序排列
  candidates.sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect));

  return candidates;
}

// ── 10c: 证据链追踪 ──────────────────────────────────────────────────────────

export function traceEvidence(
  graph: CausalGraph,
  result: CausalReasoningResult,
): Array<{ edge: { source: string; target: string }; evidence: string[]; conf: number }> {
  const chains: Array<{ edge: { source: string; target: string }; evidence: string[]; conf: number }> = [];

  // 从 result.evidence 中提取边信息
  const seenEdges = new Set<string>();

  for (const ev of result.evidence) {
    // evidence.source 格式: "sourceSlug → targetSlug"
    const parts = ev.source.split(' → ');
    if (parts.length === 2) {
      const [source, target] = parts;
      const edgeKey = `${source}->${target}`;
      if (seenEdges.has(edgeKey)) {
        // 追加到已有边
        const existing = chains.find(c => c.edge.source === source && c.edge.target === target);
        if (existing) {
          existing.evidence.push(ev.text);
        }
        continue;
      }
      seenEdges.add(edgeKey);

      const edge = graph.edges.find(e => e.source === source && e.target === target);
      chains.push({
        edge: { source, target },
        evidence: [ev.text],
        conf: edge ? edge.conf : 0.5,
      });
    }
  }

  // 如果 result.evidence 为空，尝试从图中直接提取
  if (chains.length === 0) {
    for (const edge of graph.edges) {
      if (edge.evidence && edge.evidence.length > 0) {
        chains.push({
          edge: { source: edge.source, target: edge.target },
          evidence: edge.evidence,
          conf: edge.conf,
        });
      }
    }
  }

  // 按置信度排序
  chains.sort((a, b) => b.conf - a.conf);

  return chains;
}

// ── 从 DB 行构建 CausalGraph ─────────────────────────────────────────────────

export function buildGraphFromDB(
  edges: Array<{
    source_slug: string;
    target_slug: string;
    relation: string;
    weight: number;
    conf: number;
    lag: string;
    evidence?: string[];
  }>,
  cpts: Array<{
    variable_slug: string;
    conditions: Record<string, unknown>;
    probabilities: Record<string, unknown>;
  }>,
): CausalGraph {
  const cptMap = new Map<string, CausalCPT>();

  for (const cptRow of cpts) {
    const conditions = cptRow.conditions || {};
    const probabilities = cptRow.probabilities || {};

    // 从 conditions 中提取父变量
    const parentVariables: string[] = [];
    if (Array.isArray(conditions['parents'])) {
      parentVariables.push(...(conditions['parents'] as string[]));
    } else if (Array.isArray(conditions['parentVariables'])) {
      parentVariables.push(...(conditions['parentVariables'] as string[]));
    }

    // 从 conditions 中提取状态
    const states: string[] = [];
    if (Array.isArray(conditions['states'])) {
      states.push(...(conditions['states'] as string[]));
    } else {
      states.push('low', 'high');
    }

    // 从 probabilities 中提取表
    const table: Array<Record<string, string>> = [];
    if (Array.isArray(probabilities['table'])) {
      table.push(...(probabilities['table'] as Array<Record<string, string>>));
    } else if (Array.isArray(probabilities['rows'])) {
      table.push(...(probabilities['rows'] as Array<Record<string, string>>));
    }

    cptMap.set(cptRow.variable_slug, {
      variableSlug: cptRow.variable_slug,
      parentVariables,
      states,
      table,
    });
  }

  return {
    edges: edges.map(e => ({
      source: e.source_slug,
      target: e.target_slug,
      relation: e.relation,
      weight: e.weight,
      conf: e.conf,
      lag: e.lag || '',
      evidence: e.evidence,
    })),
    cpts: cptMap,
  };
}

// ── 导出所有公共 API ─────────────────────────────────────────────────────────

export default {
  doCalculus,
  gibbsSampling,
  timePulseResponse,
  counterfactualInference,
  backwardReasoning,
  traceEvidence,
  buildGraphFromDB,
};