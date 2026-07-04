import { Hono } from 'hono';
import { brainAPI } from '../brainapi';
import loggerInstance from '../i18n/logger';
import { getErrorMessage } from '../i18n/errors.zh-CN';
import { getPool } from '../db/pool';
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

// Task 7.6: 提交反馈
app.post('/api/feedback', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { conversationId, messageId, feedback, note } = body;

    if (!conversationId || !messageId || !feedback) {
      return c.json({
        error: {
          code: 'VALIDATION_ERROR',
          message: '缺少必要参数'
        }
      }, 400);
    }

    if (feedback !== 'helpful' && feedback !== 'wrong') {
      return c.json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'feedback 取值必须为 helpful 或 wrong'
        }
      }, 400);
    }

    const result = await brainAPI.submitFeedback({ conversationId, messageId, feedback, note });
    return c.json(result);
  } catch (err) {
    loggerInstance.error({ err }, '提交反馈失败');
    return c.json({
      error: {
        code: 'INTERNAL_ERROR',
        message: getErrorMessage('INTERNAL_ERROR')
      }
    }, 500);
  }
});

// Task 7.6: 列出观察到的文件
app.get('/api/observed-files', async (c) => {
  try {
    const result = await brainAPI.listObservedFiles();
    return c.json(result);
  } catch (err) {
    loggerInstance.error({ err }, '获取观察文件列表失败');
    return c.json({
      error: {
        code: 'INTERNAL_ERROR',
        message: getErrorMessage('INTERNAL_ERROR')
      }
    }, 500);
  }
});

// Task 7.6: 触发观察文件的事实抽取
app.post('/api/observed-files/:hash/extract', async (c) => {
  try {
    const fileHash = c.req.param('hash');
    if (!fileHash) {
      return c.json({
        error: {
          code: 'VALIDATION_ERROR',
          message: '文件 hash 不能为空'
        }
      }, 400);
    }
    const result = await brainAPI.triggerObservedExtraction(fileHash);
    return c.json(result);
  } catch (err) {
    loggerInstance.error({ err }, '触发事实抽取失败');
    return c.json({
      error: {
        code: 'INTERNAL_ERROR',
        message: getErrorMessage('INTERNAL_ERROR')
      }
    }, 500);
  }
});

// Task 7.7: 翻译证据片段
app.post('/api/translate-evidence', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { spanIds, targetLang } = body;

    if (!spanIds || !Array.isArray(spanIds) || spanIds.length === 0) {
      return c.json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'spanIds 不能为空'
        }
      }, 400);
    }

    const result = await brainAPI.translateEvidence(spanIds, targetLang);
    return c.json({ items: result, total: result.length });
  } catch (err) {
    loggerInstance.error({ err }, '翻译证据失败');
    return c.json({
      error: {
        code: 'INTERNAL_ERROR',
        message: getErrorMessage('INTERNAL_ERROR')
      }
    }, 500);
  }
});

// Task 7.8: 归档知识版本
app.post('/api/archive-versions', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { slug } = body;
    const result = await brainAPI.archiveVersions(slug);
    return c.json(result);
  } catch (err) {
    loggerInstance.error({ err }, '归档版本失败');
    return c.json({
      error: {
        code: 'INTERNAL_ERROR',
        message: getErrorMessage('INTERNAL_ERROR')
      }
    }, 500);
  }
});

// Task 7.8: 清理幽灵关系
app.post('/api/clean-ghost-relations', async (c) => {
  try {
    const result = await brainAPI.cleanGhostRelations();
    return c.json(result);
  } catch (err) {
    loggerInstance.error({ err }, '清理幽灵关系失败');
    return c.json({
      error: {
        code: 'INTERNAL_ERROR',
        message: getErrorMessage('INTERNAL_ERROR')
      }
    }, 500);
  }
});

// Task 7.10: 生成 wiki 页面草稿
app.post('/api/generate-draft', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { title, type, contexts, sources } = body;

    if (!title || typeof title !== 'string') {
      return c.json({
        error: {
          code: 'VALIDATION_ERROR',
          message: '标题不能为空'
        }
      }, 400);
    }

    const result = await brainAPI.generateDraft({ title, type, contexts, sources });
    return c.json(result);
  } catch (err) {
    loggerInstance.error({ err }, '生成草稿失败');
    return c.json({
      error: {
        code: 'INTERNAL_ERROR',
        message: getErrorMessage('INTERNAL_ERROR')
      }
    }, 500);
  }
});

// Task 7.9: 生成静态站点
app.post('/api/generate-static-site', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { outputPath, includeMedia, includeGraph, theme } = body;

    const options: any = {};
    if (outputPath !== undefined) options.outputPath = outputPath;
    if (includeMedia !== undefined) options.includeMedia = includeMedia;
    if (includeGraph !== undefined) options.includeGraph = includeGraph;
    if (theme !== undefined) options.theme = theme;

    const result = await brainAPI.generateStaticSite(options);
    return c.json(result);
  } catch (err) {
    loggerInstance.error({ err }, '生成静态站点失败');
    const message = err instanceof Error ? err.message : getErrorMessage('INTERNAL_ERROR');
    return c.json({
      error: {
        code: 'INTERNAL_ERROR',
        message
      }
    }, 500);
  }
});

// Changelog
app.get('/api/changelog', async (c) => {
  try {
    const limit = c.req.query('limit');
    const op = c.req.query('op');
    const result = await brainAPI.getChangeLog({
      limit: limit ? parseInt(limit) : undefined,
      op: op || undefined
    });
    return c.json(result);
  } catch (err) {
    loggerInstance.error({ err }, '获取变更日志失败');
    return c.json({
      error: {
        code: 'INTERNAL_ERROR',
        message: getErrorMessage('INTERNAL_ERROR')
      }
    }, 500);
  }
});

// Eval report
app.get('/api/eval-report', async (c) => {
  try {
    const result = await brainAPI.getEvalReport();
    return c.json(result);
  } catch (err) {
    loggerInstance.error({ err }, '获取评估报告失败');
    return c.json({
      error: {
        code: 'INTERNAL_ERROR',
        message: getErrorMessage('INTERNAL_ERROR')
      }
    }, 500);
  }
});

// Shadow eval
app.post('/api/shadow-eval', async (c) => {
  try {
    const result = await brainAPI.runShadowEval();
    return c.json(result);
  } catch (err) {
    loggerInstance.error({ err }, '执行影子评估失败');
    return c.json({
      error: {
        code: 'INTERNAL_ERROR',
        message: getErrorMessage('INTERNAL_ERROR')
      }
    }, 500);
  }
});

// Timeline
app.get('/api/timeline', async (c) => {
  try {
    const slug = c.req.query('slug');
    const limit = c.req.query('limit');
    const offset = c.req.query('offset');
    const result = await brainAPI.getTimeline({
      slug: slug || undefined,
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined
    });
    return c.json(result);
  } catch (err) {
    loggerInstance.error({ err }, '获取时间线失败');
    return c.json({ error: { code: 'INTERNAL_ERROR', message: getErrorMessage('INTERNAL_ERROR') } }, 500);
  }
});

// Search
app.get('/api/search', async (c) => {
  try {
    const q = c.req.query('q') || '';
    if (!q.trim()) {
      return c.json({ pages: [], files: [], conversations: [], total: 0 });
    }
    const result = await brainAPI.search(q.trim());
    return c.json(result);
  } catch (err) {
    loggerInstance.error({ err }, '搜索失败');
    return c.json({ error: { code: 'INTERNAL_ERROR', message: getErrorMessage('INTERNAL_ERROR') } }, 500);
  }
});

// Library file
app.get('/api/library-files/:hash', async (c) => {
  try {
    const hash = c.req.param('hash');
    const result = await brainAPI.getLibraryFile(hash);
    if (!result) {
      return c.json({ error: { code: 'NOT_FOUND', message: '文件不存在' } }, 404);
    }
    return c.json(result);
  } catch (err) {
    loggerInstance.error({ err }, '获取库文件失败');
    return c.json({ error: { code: 'INTERNAL_ERROR', message: getErrorMessage('INTERNAL_ERROR') } }, 500);
  }
});

// Library file content (media streaming)
app.get('/api/library-files/:hash/content', async (c) => {
  try {
    const hash = c.req.param('hash');
    const pool = getPool();
    const result = await pool.query('SELECT mime FROM library_files WHERE hash = $1', [hash]);
    if (result.rows.length === 0) {
      return c.json({ error: { code: 'NOT_FOUND', message: '文件不存在' } }, 404);
    }
    // 返回重定向到实际文件路径（简化实现）
    return c.json({ error: { code: 'NOT_IMPLEMENTED', message: '媒体流服务尚未实现，请直接访问文件系统' } }, 501);
  } catch (err) {
    return c.json({ error: { code: 'INTERNAL_ERROR', message: getErrorMessage('INTERNAL_ERROR') } }, 500);
  }
});

export default app;
