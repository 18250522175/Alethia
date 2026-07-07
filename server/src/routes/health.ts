import { Hono } from 'hono';
import { brainAPI } from '../brainapi';

const app = new Hono();

app.post('/api/rebuild-struct', async (c) => {
  const report = await brainAPI.rebuildStruct();
  return c.json(report);
});

app.post('/api/extract-pending', async (c) => {
  const report = await brainAPI.extractPending();
  return c.json(report);
});

// 完整健康仪表盘：返回详细指标（规模、预算、AI 质量、待审核等），用于 DashboardPage
// 轻量级存活检查见 index.ts 的 /health 端点
app.get('/api/health-dashboard', async (c) => {
  const dashboard = await brainAPI.getHealth();
  return c.json(dashboard);
});

export default app;
