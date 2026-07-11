import { Hono } from 'hono';
import { getPool } from '../db/pool';
import logger from '../i18n/logger';
import * as fs from 'node:fs';
import * as path from 'node:path';

const app = new Hono();

const VIEWS_DIR = path.join(process.cwd(), '.brain', 'views');

// Ensure views directory exists
function ensureViewsDir() {
  if (!fs.existsSync(VIEWS_DIR)) {
    fs.mkdirSync(VIEWS_DIR, { recursive: true });
  }
}

// POST /api/views/save — 保存当前视图为 JSON 文件
app.post('/api/views/save', async (c) => {
  ensureViewsDir();
  const body = await c.req.json();
  const { userLabel, snapshot } = body;

  if (!snapshot) {
    return c.json({ error: 'viewId and snapshot are required' }, 400);
  }

  const viewId = body.viewId || `view_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const filePath = path.join(VIEWS_DIR, `${viewId}.json`);

  const viewData = {
    viewId,
    userLabel: userLabel || '',
    snapshot,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(filePath, JSON.stringify(viewData, null, 2), 'utf-8');

  // Also store in DB
  const pool = getPool();
  await pool.query(
    `INSERT INTO view_states (view_id, user_label, snapshot)
     VALUES ($1, $2, $3)
     ON CONFLICT (view_id) DO UPDATE SET user_label = $2, snapshot = $3, updated_at = NOW()`,
    [viewId, userLabel || '', JSON.stringify(snapshot)]
  );

  return c.json({ viewId, message: '视图已保存' });
});

// GET /api/views/list — 列出所有已保存视图
app.get('/api/views/list', async (c) => {
  ensureViewsDir();
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT view_id, user_label, created_at, updated_at, jsonb_array_length(snapshot->'hyperNodes') as node_count FROM view_states ORDER BY updated_at DESC"
  );
  return c.json({ views: rows });
});

// GET /api/views/:id — 加载指定视图
app.get('/api/views/:id', async (c) => {
  const viewId = c.req.param('id');
  const filePath = path.join(VIEWS_DIR, `${viewId}.json`);

  if (fs.existsSync(filePath)) {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return c.json(data);
  }

  // Fallback to DB
  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT * FROM view_states WHERE view_id = $1', [viewId]
  );

  if (rows.length === 0) {
    return c.json({ error: '视图未找到' }, 404);
  }

  return c.json({
    viewId: rows[0].view_id,
    userLabel: rows[0].user_label,
    snapshot: rows[0].snapshot,
    createdAt: rows[0].created_at,
    updatedAt: rows[0].updated_at,
  });
});

// DELETE /api/views/:id — 删除视图
app.delete('/api/views/:id', async (c) => {
  const viewId = c.req.param('id');
  const filePath = path.join(VIEWS_DIR, `${viewId}.json`);

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  const pool = getPool();
  await pool.query('DELETE FROM view_states WHERE view_id = $1', [viewId]);

  return c.json({ message: '视图已删除' });
});

// POST /api/views/suggest — 基于超图聚类主动建议打包/展开
app.post('/api/views/suggest', async (c) => {
  const pool = getPool();

  // Get current hyperedges to find clusters
  const { rows: hyperedges } = await pool.query(
    'SELECT * FROM hyperedges ORDER BY id'
  );

  const suggestions: Array<{ type: string; title: string; description: string; nodes: string[]; action: string }> = [];

  // Build adjacency for clustering
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

  // Find connected components
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

  for (const comp of components) {
    suggestions.push({
      type: 'cluster',
      title: '发现紧密超边簇',
      description: `${comp.length} 个节点通过超边紧密连接，建议打包为一组`,
      nodes: comp,
      action: 'pack',
    });
  }

  return c.json({ suggestions });
});

// POST /api/views/solidify — 将临时聚合固化为知识超边
app.post('/api/views/solidify', async (c) => {
  const pool = getPool();
  const body = await c.req.json();
  const { viewId, hyperNodeId } = body;

  if (!viewId || !hyperNodeId) {
    return c.json({ error: 'viewId and hyperNodeId are required' }, 400);
  }

  // Load the view
  const filePath = path.join(VIEWS_DIR, `${viewId}.json`);
  if (!fs.existsSync(filePath)) {
    return c.json({ error: '视图未找到' }, 404);
  }

  const viewData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const hyperNodes = viewData.snapshot?.hyperNodes || [];
  const hyperNode = hyperNodes.find((n: any) => n.id === hyperNodeId);

  if (!hyperNode) {
    return c.json({ error: '超节点未找到' }, 404);
  }

  // Generate a suggested Hyper Relations entry
  const memberSlugs = hyperNode.memberSlugs || [];
  const label = hyperNode.label || hyperNodeId;
  const externalEdges = hyperNode.externalEdges || [];

  // Build the suggested Markdown entry
  const targets = externalEdges.flatMap((e: any) => e.to || []);
  const relationType = externalEdges[0]?.type || ':jointlyCause';
  const conf = externalEdges[0]?.inheritedFrom ? '0.85' : '0.8';

  const sourceList = memberSlugs.map((s: string) => `[${s}]`).join(', ');
  const targetList = targets.map((t: string) => `[${t}]`).join(', ');
  const hyperId = `H_${Date.now().toString(36)}`;

  const suggestedEntry = `- ${hyperId}: ${sourceList} --:${relationType}--> ${targetList} (conf:${conf}, context: ${label} 聚合)`;

  // Find a suitable entity page to suggest the entry
  // Use the first member slug as the suggested page
  const suggestedPage = memberSlugs[0] || targets[0];

  // Return the diff suggestion
  return c.json({
    diff: {
      id: `solidify_${hyperNodeId}`,
      type: 'hyper_relation_add',
      page: suggestedPage,
      section: '## Hyper Relations',
      content: suggestedEntry,
      status: 'yellow', // 🟡 pending review
      reason: `将视图「${viewId}」中的超节点「${label}」固化为知识超边`,
      evidence: `成员节点: ${memberSlugs.join(', ')}`,
    },
    message: `已生成 🟡 预览区 Diff，建议在实体「${suggestedPage}」的页面中添加 ## Hyper Relations 条目。`,
  });
});

export default app;