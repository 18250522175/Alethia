import { Hono } from 'hono';
import { brainAPI } from '../brainapi';
import loggerInstance from '../i18n/logger';
import { getErrorMessage } from '../i18n/errors.zh-CN';
import type { AskRequest, QueryParams } from '@shared/index';

const app = new Hono();

app.post('/api/ask', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { question, conversationId, mode, maxReflections, enableTranslation } = body as AskRequest;

    if (!question || typeof question !== 'string' || question.trim().length === 0) {
      return c.json({
        error: {
          code: 'VALIDATION_ERROR',
          message: '问题不能为空'
        }
      }, 400);
    }

    const request: AskRequest = {
      question: question.trim(),
      conversationId,
      mode,
      maxReflections,
      enableTranslation
    };

    const response = await brainAPI.askQuestion(request);
    return c.json(response);
  } catch (err) {
    loggerInstance.error({ err }, '处理问答请求失败');
    return c.json({
      error: {
        code: 'INTERNAL_ERROR',
        message: getErrorMessage('INTERNAL_ERROR')
      }
    }, 500);
  }
});

app.post('/api/query', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { query, intent, tier, contexts, topK, withGraph, withRerank } = body as QueryParams;

    if (!query || typeof query !== 'string') {
      return c.json({
        error: {
          code: 'VALIDATION_ERROR',
          message: '查询内容不能为空'
        }
      }, 400);
    }

    const params: QueryParams = {
      query,
      intent,
      tier,
      contexts,
      topK,
      withGraph,
      withRerank
    };

    const result = await brainAPI.query(params);
    return c.json(result);
  } catch (err) {
    loggerInstance.error({ err }, '处理检索请求失败');
    return c.json({
      error: {
        code: 'INTERNAL_ERROR',
        message: getErrorMessage('INTERNAL_ERROR')
      }
    }, 500);
  }
});

app.get('/api/graph', async (c) => {
  try {
    const data = await brainAPI.getGraphData();
    return c.json(data);
  } catch (err) {
    loggerInstance.error({ err }, '获取图谱数据失败');
    return c.json({
      error: {
        code: 'INTERNAL_ERROR',
        message: getErrorMessage('INTERNAL_ERROR')
      }
    }, 500);
  }
});

app.get('/api/diffs', async (c) => {
  try {
    const tier = c.req.query('tier');
    const diffs = await brainAPI.getPendingDiffs();
    const filtered = tier ? diffs.filter((d: any) => d.tier === tier) : diffs;
    return c.json({ items: filtered, total: filtered.length });
  } catch (err) {
    loggerInstance.error({ err }, '获取待审核变更失败');
    return c.json({
      error: {
        code: 'INTERNAL_ERROR',
        message: getErrorMessage('INTERNAL_ERROR')
      }
    }, 500);
  }
});

app.post('/api/diffs/:id/apply', async (c) => {
  try {
    const diffId = c.req.param('id');
    const result = await brainAPI.applyDiff(diffId, true);
    return c.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : getErrorMessage('INTERNAL_ERROR');
    loggerInstance.error({ err }, '应用变更失败');
    return c.json({
      error: {
        code: 'INTERNAL_ERROR',
        message
      }
    }, 500);
  }
});

app.post('/api/diffs/:id/reject', async (c) => {
  try {
    const diffId = c.req.param('id');
    const result = await brainAPI.applyDiff(diffId, false);
    return c.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : getErrorMessage('INTERNAL_ERROR');
    loggerInstance.error({ err }, '拒绝变更失败');
    return c.json({
      error: {
        code: 'INTERNAL_ERROR',
        message
      }
    }, 500);
  }
});

app.post('/api/rollback/:batchId', async (c) => {
  try {
    const batchId = c.req.param('batchId');
    const result = await brainAPI.rollbackAutoChange(batchId);
    return c.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : getErrorMessage('INTERNAL_ERROR');
    loggerInstance.error({ err }, '回滚失败');
    return c.json({
      error: {
        code: 'INTERNAL_ERROR',
        message
      }
    }, 500);
  }
});

app.get('/api/conversations/:id', async (c) => {
  try {
    const conversationId = c.req.param('id');
    const messages = await brainAPI.getConversation(conversationId);
    return c.json({ items: messages, total: messages.length });
  } catch (err) {
    loggerInstance.error({ err }, '获取对话记录失败');
    return c.json({
      error: {
        code: 'INTERNAL_ERROR',
        message: getErrorMessage('INTERNAL_ERROR')
      }
    }, 500);
  }
});

export default app;
