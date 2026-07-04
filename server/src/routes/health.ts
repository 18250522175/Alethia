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

app.get('/api/health-dashboard', async (c) => {
  const dashboard = await brainAPI.getHealth();
  return c.json(dashboard);
});

export default app;
