import { Hono } from 'hono';
import { brainAPI } from '../brainapi';
import loggerInstance from '../i18n/logger';
import { getErrorMessage } from '../i18n/errors.zh-CN';
import { getPool } from '../db/pool';
import { storage } from '../storage/markdown';
import { join } from 'path';
import { existsSync, statSync } from 'fs';
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
          message: getErrorMessage('VALIDATION_ERROR')
        }
      }, 400);
    }

    // 限制问题长度，防止内存消耗
    const trimmed = question.trim();
    if (trimmed.length > 2000) {
      return c.json({
        error: {
          code: 'VALIDATION_ERROR',
          message: getErrorMessage('VALIDATION_ERROR')
        }
      }, 400);
    }

    const request: AskRequest = {
      question: trimmed,
      conversationId,
      mode,
      maxReflections: maxReflections && typeof maxReflections === 'number' && maxReflections > 0
        ? Math.min(maxReflections, 5)
        : undefined,
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

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return c.json({
        error: {
          code: 'VALIDATION_ERROR',
          message: getErrorMessage('VALIDATION_ERROR')
        }
      }, 400);
    }

    const trimmed = query.trim();
    if (trimmed.length > 2000) {
      return c.json({
        error: {
          code: 'VALIDATION_ERROR',
          message: getErrorMessage('VALIDATION_ERROR')
        }
      }, 400);
    }

    const params: QueryParams = {
      query: trimmed,
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

app.get('/api/conversations', async (c) => {
  try {
    const pool = getPool();
    const result = await pool.query(`
      SELECT conversation_id, 
             MAX(CASE WHEN role = 'user' THEN content END) as last_question,
             MAX(CASE WHEN role = 'assistant' THEN content END) as last_answer,
             MAX(ts) as updated_at,
             SUM(tokens) as total_tokens,
             SUM(cost) as total_cost
      FROM conversation_logs
      GROUP BY conversation_id
      ORDER BY updated_at DESC
      LIMIT 50
    `);
    const conversations = result.rows.map((r: any) => ({
      id: r.conversation_id,
      title: r.last_question?.slice(0, 50) || '对话',
      preview: r.last_question?.slice(0, 100) || '',
      updatedAt: r.updated_at,
      totalTokens: r.total_tokens,
      totalCost: r.total_cost
    }));
    return c.json({ items: conversations, total: conversations.length });
  } catch (err) {
    loggerInstance.error({ err }, '获取对话列表失败');
    return c.json({ error: { code: 'INTERNAL_ERROR', message: getErrorMessage('INTERNAL_ERROR') } }, 500);
  }
});

app.delete('/api/conversations/:id', async (c) => {
  try {
    const conversationId = c.req.param('id');
    const pool = getPool();
    await pool.query('DELETE FROM conversation_logs WHERE conversation_id = $1', [conversationId]);
    return c.json({ success: true });
  } catch (err) {
    loggerInstance.error({ err }, '删除对话失败');
    return c.json({ error: { code: 'INTERNAL_ERROR', message: getErrorMessage('INTERNAL_ERROR') } }, 500);
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
          message: getErrorMessage('VALIDATION_ERROR')
        }
      }, 400);
    }

    if (feedback !== 'helpful' && feedback !== 'wrong') {
      return c.json({
        error: {
          code: 'VALIDATION_ERROR',
          message: getErrorMessage('VALIDATION_ERROR')
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
          message: getErrorMessage('VALIDATION_ERROR')
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
          message: getErrorMessage('VALIDATION_ERROR')
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
          message: getErrorMessage('VALIDATION_ERROR')
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

// Wiki pages list
app.get('/api/pages', async (c) => {
  try {
    const pool = getPool();
    const result = await pool.query(
      'SELECT slug, title, type, contexts, aliases, updated_at FROM pages ORDER BY updated_at DESC LIMIT 100'
    );
    const pages = result.rows.map((r: any) => ({
      slug: r.slug,
      title: r.title,
      type: r.type,
      contexts: r.contexts,
      aliases: r.aliases || [],
      updatedAt: r.updated_at
    }));
    return c.json({ items: pages, total: pages.length });
  } catch (err) {
    loggerInstance.error({ err }, '获取页面列表失败');
    return c.json({ error: { code: 'INTERNAL_ERROR', message: getErrorMessage('INTERNAL_ERROR') } }, 500);
  }
});

// Create wiki page
app.post('/api/pages', async (c) => {
  try {
    const body = await c.req.json();
    const { title, type, contexts, aliases } = body;
    if (!title) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: getErrorMessage('VALIDATION_ERROR') } }, 400);
    }
    const slug = title.toLowerCase().replace(/[^\w\u4e00-\u9fa5]+/g, '-').replace(/^-|-$/g, '');
    const wikiPath = storage.getWikiPath();
    const targetFile = join(wikiPath, `${slug}.md`);
    
    if (existsSync(targetFile)) {
      return c.json({ error: { code: 'CONFLICT', message: '页面已存在' } }, 409);
    }
    
    const content = `---
title: ${title}
type: ${type || 'concept'}
contexts: ${contexts ? JSON.stringify(contexts) : '[]'}
aliases: ${aliases ? JSON.stringify(aliases) : '[]'}
---

# ${title}

## State
（待填写）

## Assessment
（待填写）

## Open Threads
- [ ] 需要补充核心定义

## Relations
（无）

## Evidence
（无）
`;
    
    storage.writeFile(targetFile, content);
    await syncEngine.syncAll();
    
    return c.json({ success: true, slug });
  } catch (err) {
    loggerInstance.error({ err }, '创建页面失败');
    return c.json({ error: { code: 'INTERNAL_ERROR', message: getErrorMessage('INTERNAL_ERROR') } }, 500);
  }
});

// Wiki 页面读取与编辑
app.get('/api/pages/:slug', async (c) => {
  try {
    const slug = c.req.param('slug');
    const result = await brainAPI.getWikiPage(slug);
    return c.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : getErrorMessage('INTERNAL_ERROR');
    const code = message.includes('不存在') ? 'NOT_FOUND' : 'INTERNAL_ERROR';
    loggerInstance.error({ err, slug: c.req.param('slug') }, '获取 Wiki 页面失败');
    return c.json({
      error: { code, message }
    }, code === 'NOT_FOUND' ? 404 : 500);
  }
});

// Wiki page versions
app.get('/api/pages/:slug/versions', async (c) => {
  try {
    const slug = c.req.param('slug');
    const pool = getPool();
    const result = await pool.query(
      'SELECT version, hash, created_at as updated_at, change_summary FROM knowledge_versions WHERE slug = $1 ORDER BY version DESC',
      [slug]
    );
    const versions = result.rows.map((r: any) => ({
      version: r.version,
      hash: r.hash,
      updatedAt: r.updated_at,
      changeSummary: r.change_summary || ''
    }));
    return c.json({ items: versions, total: versions.length });
  } catch (err) {
    loggerInstance.error({ err }, '获取版本历史失败');
    return c.json({ error: { code: 'INTERNAL_ERROR', message: getErrorMessage('INTERNAL_ERROR') } }, 500);
  }
});

app.get('/api/pages/:slug/versions/:version', async (c) => {
  try {
    const slug = c.req.param('slug');
    const version = parseInt(c.req.param('version'), 10);
    if (isNaN(version)) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: getErrorMessage('VALIDATION_ERROR') } }, 400);
    }
    const pool = getPool();
    const result = await pool.query(
      'SELECT content FROM knowledge_versions WHERE slug = $1 AND version = $2',
      [slug, version]
    );
    if (result.rows.length === 0) {
      return c.json({ error: { code: 'NOT_FOUND', message: getErrorMessage('NOT_FOUND') } }, 404);
    }
    return c.json({ content: result.rows[0].content });
  } catch (err) {
    loggerInstance.error({ err }, '获取特定版本失败');
    return c.json({ error: { code: 'INTERNAL_ERROR', message: getErrorMessage('INTERNAL_ERROR') } }, 500);
  }
});

app.put('/api/pages/:slug', async (c) => {
  try {
    const slug = c.req.param('slug');
    const body = await c.req.json().catch(() => ({}));
    const { content } = body;

    if (!content || typeof content !== 'string') {
      return c.json({
        error: { code: 'VALIDATION_ERROR', message: getErrorMessage('VALIDATION_ERROR') }
      }, 400);
    }

    const result = await brainAPI.updateWikiPage(slug, content);
    return c.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : getErrorMessage('INTERNAL_ERROR');
    const code = message.includes('不存在') ? 'NOT_FOUND' : 'INTERNAL_ERROR';
    loggerInstance.error({ err, slug: c.req.param('slug') }, '更新 Wiki 页面失败');
    return c.json({
      error: { code, message }
    }, code === 'NOT_FOUND' ? 404 : 500);
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

// Library files list
app.get('/api/library-files', async (c) => {
  try {
    const pool = getPool();
    const result = await pool.query(
      'SELECT hash, mime, original_name, size, status, ingested_at FROM library_files ORDER BY ingested_at DESC'
    );
    const files = result.rows.map((r: any) => ({
      hash: r.hash,
      mime: r.mime,
      originalName: r.original_name,
      size: r.size,
      status: r.status,
      ingestedAt: r.ingested_at
    }));
    return c.json({ items: files, total: files.length });
  } catch (err) {
    loggerInstance.error({ err }, '获取库文件列表失败');
    return c.json({ error: { code: 'INTERNAL_ERROR', message: getErrorMessage('INTERNAL_ERROR') } }, 500);
  }
});

// Delete library file
app.delete('/api/library-files/:hash', async (c) => {
  try {
    const hash = c.req.param('hash');
    const pool = getPool();
    await pool.query('DELETE FROM library_files WHERE hash = $1', [hash]);
    return c.json({ success: true });
  } catch (err) {
    loggerInstance.error({ err }, '删除库文件失败');
    return c.json({ error: { code: 'INTERNAL_ERROR', message: getErrorMessage('INTERNAL_ERROR') } }, 500);
  }
});

// Library file
app.get('/api/library-files/:hash', async (c) => {
  try {
    const hash = c.req.param('hash');
    const result = await brainAPI.getLibraryFile(hash);
    if (!result) {
      return c.json({ error: { code: 'NOT_FOUND', message: getErrorMessage('NOT_FOUND') } }, 404);
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
      return c.json({ error: { code: 'NOT_FOUND', message: getErrorMessage('NOT_FOUND') } }, 404);
    }
    const mime = result.rows[0].mime;
    const filePath = join(storage.getLibraryPath(), hash);

    if (!existsSync(filePath)) {
      return c.json({ error: { code: 'NOT_FOUND', message: getErrorMessage('NOT_FOUND') } }, 404);
    }

    const totalSize = statSync(filePath).size;
    const rangeHeader = c.req.header('range');

    if (!rangeHeader) {
      const file = Bun.file(filePath);
      return new Response(file, {
        status: 200,
        headers: {
          'Accept-Ranges': 'bytes',
          'Content-Type': mime || 'application/octet-stream',
          'Content-Length': totalSize.toString()
        }
      });
    }

    const rangeMatch = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
    if (!rangeMatch) {
      return new Response(null, {
        status: 416,
        headers: {
          'Accept-Ranges': 'bytes',
          'Content-Type': mime || 'application/octet-stream',
          'Content-Range': `bytes */${totalSize}`
        }
      });
    }

    const startStr = rangeMatch[1];
    const endStr = rangeMatch[2];

    if (startStr === '' && endStr === '') {
      return new Response(null, {
        status: 416,
        headers: {
          'Accept-Ranges': 'bytes',
          'Content-Type': mime || 'application/octet-stream',
          'Content-Range': `bytes */${totalSize}`
        }
      });
    }

    let start: number;
    let end: number;

    if (startStr === '') {
      const suffixLength = parseInt(endStr, 10);
      if (isNaN(suffixLength) || suffixLength <= 0) {
        return new Response(null, {
          status: 416,
          headers: {
            'Accept-Ranges': 'bytes',
            'Content-Type': mime || 'application/octet-stream',
            'Content-Range': `bytes */${totalSize}`
          }
        });
      }
      start = Math.max(0, totalSize - suffixLength);
      end = totalSize - 1;
    } else {
      start = parseInt(startStr, 10);
      if (isNaN(start) || start < 0 || start >= totalSize) {
        return new Response(null, {
          status: 416,
          headers: {
            'Accept-Ranges': 'bytes',
            'Content-Type': mime || 'application/octet-stream',
            'Content-Range': `bytes */${totalSize}`
          }
        });
      }
      if (endStr === '') {
        end = totalSize - 1;
      } else {
        end = parseInt(endStr, 10);
        if (isNaN(end) || end < start || end >= totalSize) {
          end = totalSize - 1;
        }
      }
    }

    const contentLength = end - start + 1;
    const file = Bun.file(filePath);
    const sliced = file.slice(start, end + 1);

    return new Response(sliced, {
      status: 206,
      headers: {
        'Accept-Ranges': 'bytes',
        'Content-Type': mime || 'application/octet-stream',
        'Content-Length': contentLength.toString(),
        'Content-Range': `bytes ${start}-${end}/${totalSize}`
      }
    });
  } catch (err) {
    loggerInstance.error({ err }, '获取库文件内容失败');
    return c.json({ error: { code: 'INTERNAL_ERROR', message: getErrorMessage('INTERNAL_ERROR') } }, 500);
  }
});

// Budget: 设置日预算
app.post('/api/settings/daily-budget', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { amount } = body;

    if (amount === undefined || typeof amount !== 'number' || amount < 0) {
      return c.json({
        error: {
          code: 'VALIDATION_ERROR',
          message: getErrorMessage('VALIDATION_ERROR')
        }
      }, 400);
    }

    const result = await brainAPI.setDailyBudget(amount);
    return c.json(result);
  } catch (err) {
    loggerInstance.error({ err }, '设置日预算失败');
    return c.json({
      error: {
        code: 'INTERNAL_ERROR',
        message: getErrorMessage('INTERNAL_ERROR')
      }
    }, 500);
  }
});

// Budget: 获取剩余预算
app.get('/api/budget/remaining', async (c) => {
  try {
    const result = await brainAPI.getRemainingBudget();
    return c.json(result);
  } catch (err) {
    loggerInstance.error({ err }, '获取剩余预算失败');
    return c.json({
      error: {
        code: 'INTERNAL_ERROR',
        message: getErrorMessage('INTERNAL_ERROR')
      }
    }, 500);
  }
});

// Budget: 获取预算告警列表
app.get('/api/budget/alerts', async (c) => {
  try {
    const result = await brainAPI.getBudgetAlerts();
    return c.json(result);
  } catch (err) {
    loggerInstance.error({ err }, '获取预算告警失败');
    return c.json({
      error: {
        code: 'INTERNAL_ERROR',
        message: getErrorMessage('INTERNAL_ERROR')
      }
    }, 500);
  }
});

// Aliases
app.get('/api/aliases/map', async (c) => {
  try {
    const result = await brainAPI.getAllAliasMap();
    return c.json(result);
  } catch (err) {
    loggerInstance.error({ err }, '获取别名映射失败');
    return c.json({ error: { code: 'INTERNAL_ERROR', message: getErrorMessage('INTERNAL_ERROR') } }, 500);
  }
});

app.get('/api/aliases/conflicts', async (c) => {
  try {
    const result = await brainAPI.getAliasConflicts();
    return c.json({ conflicts: result });
  } catch (err) {
    loggerInstance.error({ err }, '获取别名冲突失败');
    return c.json({ error: { code: 'INTERNAL_ERROR', message: getErrorMessage('INTERNAL_ERROR') } }, 500);
  }
});

app.get('/api/aliases/resolve/:alias', async (c) => {
  try {
    const alias = c.req.param('alias');
    const result = await brainAPI.resolveAlias(alias);
    return c.json(result);
  } catch (err) {
    loggerInstance.error({ err }, '别名解析失败');
    return c.json({ error: { code: 'INTERNAL_ERROR', message: getErrorMessage('INTERNAL_ERROR') } }, 500);
  }
});

// Graph focus mode
app.get('/api/graph/neighbors/:slug', async (c) => {
  try {
    const slug = c.req.param('slug');
    const degrees = parseInt(c.req.query('degrees') || '2', 10);
    const result = await brainAPI.getNodeNeighbors(slug, degrees);
    return c.json(result);
  } catch (err) {
    loggerInstance.error({ err }, '获取节点邻居失败');
    return c.json({ error: { code: 'INTERNAL_ERROR', message: getErrorMessage('INTERNAL_ERROR') } }, 500);
  }
});

// Graph path highlighting
app.post('/api/graph/paths', async (c) => {
  try {
    const body = await c.req.json();
    const { sourceSlug, targetSlug, maxPaths, maxLength } = body;
    if (!sourceSlug || !targetSlug) {
      return c.json({ error: { code: 'BAD_REQUEST', message: '缺少 sourceSlug 或 targetSlug' } }, 400);
    }
    const result = await brainAPI.findShortestPaths(
      sourceSlug, targetSlug,
      maxPaths ? parseInt(maxPaths, 10) : 3,
      maxLength ? parseInt(maxLength, 10) : 6
    );
    return c.json({ paths: result });
  } catch (err) {
    loggerInstance.error({ err }, '查找最短路径失败');
    return c.json({ error: { code: 'INTERNAL_ERROR', message: getErrorMessage('INTERNAL_ERROR') } }, 500);
  }
});

// Backlinks
app.get('/api/pages/:slug/backlinks', async (c) => {
  try {
    const slug = c.req.param('slug');
    const contextChars = parseInt(c.req.query('contextChars') || '80', 10);
    const result = await brainAPI.getBacklinks(slug, contextChars);
    return c.json({ backlinks: result });
  } catch (err) {
    loggerInstance.error({ err }, '获取反向链接失败');
    return c.json({ error: { code: 'INTERNAL_ERROR', message: getErrorMessage('INTERNAL_ERROR') } }, 500);
  }
});

// Entity search autocomplete
app.get('/api/entities/search', async (c) => {
  try {
    const q = c.req.query('q') || '';
    const limit = parseInt(c.req.query('limit') || '10', 10);
    if (!q.trim()) {
      return c.json({ items: [] });
    }
    const result = await brainAPI.searchEntities(q.trim(), limit);
    return c.json({ items: result });
  } catch (err) {
    loggerInstance.error({ err }, '实体搜索失败');
    return c.json({ error: { code: 'INTERNAL_ERROR', message: getErrorMessage('INTERNAL_ERROR') } }, 500);
  }
});

// Entity preview
app.get('/api/preview/:slug', async (c) => {
  try {
    const slug = c.req.param('slug');
    const result = await brainAPI.getEntityPreview(slug);
    c.header('Cache-Control', 'public, max-age=300');
    return c.json(result);
  } catch (err) {
    loggerInstance.error({ err }, '获取实体预览失败');
    return c.json({ error: { code: 'INTERNAL_ERROR', message: getErrorMessage('INTERNAL_ERROR') } }, 500);
  }
});

// Ingest file upload
app.post('/api/ingest/upload', async (c) => {
  try {
    const body = await c.req.formData();
    const file = body.get('file') as File;
    const sha256 = body.get('sha256') as string;
    
    if (!file || !sha256) {
      return c.json({ error: { code: 'BAD_REQUEST', message: '缺少文件或哈希值' } }, 400);
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const result = await brainAPI.ingestFile(file.name, file.type, buffer, sha256);
    return c.json(result);
  } catch (err) {
    loggerInstance.error({ err }, '文件摄入失败');
    return c.json({ error: { code: 'INTERNAL_ERROR', message: getErrorMessage('INTERNAL_ERROR') } }, 500);
  }
});

// Snippets
app.get('/api/snippets', async (c) => {
  try {
    const category = c.req.query('category') || undefined;
    const result = await brainAPI.listSnippets(category);
    return c.json({ items: result });
  } catch (err) {
    loggerInstance.error({ err }, '获取片段列表失败');
    return c.json({ error: { code: 'INTERNAL_ERROR', message: getErrorMessage('INTERNAL_ERROR') } }, 500);
  }
});

app.get('/api/snippets/:name', async (c) => {
  try {
    const name = c.req.param('name');
    const result = await brainAPI.getSnippet(name);
    return c.json(result);
  } catch (err) {
    loggerInstance.error({ err }, '获取片段失败');
    return c.json({ error: { code: 'NOT_FOUND', message: '片段不存在' } }, 404);
  }
});

app.put('/api/snippets/:name', async (c) => {
  try {
    const name = c.req.param('name');
    const body = await c.req.json();
    await brainAPI.saveSnippet(name, body.content);
    return c.json({ success: true });
  } catch (err) {
    loggerInstance.error({ err }, '保存片段失败');
    return c.json({ error: { code: 'INTERNAL_ERROR', message: getErrorMessage('INTERNAL_ERROR') } }, 500);
  }
});

app.delete('/api/snippets/:name', async (c) => {
  try {
    const name = c.req.param('name');
    await brainAPI.deleteSnippet(name);
    return c.json({ success: true });
  } catch (err) {
    loggerInstance.error({ err }, '删除片段失败');
    return c.json({ error: { code: 'INTERNAL_ERROR', message: getErrorMessage('INTERNAL_ERROR') } }, 500);
  }
});

// Embed proxy
app.get('/api/embed-proxy', async (c) => {
  try {
    const type = c.req.query('type') || '';
    const refresh = c.req.query('refresh') === 'true';

    const params: Record<string, string> = {};
    for (const [key, value] of c.req.query.entries()) {
      if (key !== 'type' && key !== 'refresh') {
        params[key] = value;
      }
    }

    if (!type) {
      return c.json({ error: { code: 'BAD_REQUEST', message: '缺少 type 参数' } }, 400);
    }

    const result = await brainAPI.embedProxy(type, params, refresh);
    c.header('Cache-Control', 'public, max-age=300');
    return c.json(result);
  } catch (err) {
    loggerInstance.error({ err }, '嵌入数据代理失败');
    return c.json({ error: { code: 'INTERNAL_ERROR', message: getErrorMessage('INTERNAL_ERROR') } }, 500);
  }
});

// Search syntax completions
app.get('/api/search/completions', async (c) => {
  try {
    const prefix = c.req.query('prefix') || '';
    const result = await brainAPI.getSearchCompletions(prefix);
    return c.json(result);
  } catch (err) {
    loggerInstance.error({ err }, '获取搜索补全失败');
    return c.json({ error: { code: 'INTERNAL_ERROR', message: getErrorMessage('INTERNAL_ERROR') } }, 500);
  }
});

// Search syntax help
app.get('/api/search/syntax-help', async (c) => {
  try {
    const result = brainAPI.getSyntaxDocumentation();
    return c.json({ items: result });
  } catch (err) {
    loggerInstance.error({ err }, '获取语法帮助失败');
    return c.json({ error: { code: 'INTERNAL_ERROR', message: getErrorMessage('INTERNAL_ERROR') } }, 500);
  }
});

// Notifications
app.get('/api/notifications', async (c) => {
  try {
    const pool = getPool();
    const result = await pool.query(
      'SELECT id, type, title, message, read, metadata, created_at FROM notifications ORDER BY created_at DESC'
    );
    return c.json({ items: result.rows, total: result.rows.length });
  } catch (err) {
    loggerInstance.error({ err }, '获取通知列表失败');
    return c.json({ error: { code: 'INTERNAL_ERROR', message: getErrorMessage('INTERNAL_ERROR') } }, 500);
  }
});

app.post('/api/notifications/:id/read', async (c) => {
  try {
    const id = parseInt(c.req.param('id'), 10);
    if (isNaN(id)) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: getErrorMessage('VALIDATION_ERROR') } }, 400);
    }
    const pool = getPool();
    await pool.query('UPDATE notifications SET read = true WHERE id = $1', [id]);
    return c.json({ success: true });
  } catch (err) {
    loggerInstance.error({ err }, '标记通知已读失败');
    return c.json({ error: { code: 'INTERNAL_ERROR', message: getErrorMessage('INTERNAL_ERROR') } }, 500);
  }
});

app.post('/api/notifications/read-all', async (c) => {
  try {
    const pool = getPool();
    await pool.query('UPDATE notifications SET read = true');
    return c.json({ success: true });
  } catch (err) {
    loggerInstance.error({ err }, '全部标为已读失败');
    return c.json({ error: { code: 'INTERNAL_ERROR', message: getErrorMessage('INTERNAL_ERROR') } }, 500);
  }
});

app.delete('/api/notifications/all', async (c) => {
  try {
    const pool = getPool();
    await pool.query('DELETE FROM notifications');
    return c.json({ success: true });
  } catch (err) {
    loggerInstance.error({ err }, '清空通知失败');
    return c.json({ error: { code: 'INTERNAL_ERROR', message: getErrorMessage('INTERNAL_ERROR') } }, 500);
  }
});

// Save search
app.post('/api/saved-searches', async (c) => {
  try {
    const body = await c.req.json();
    const { name, query, description } = body;
    if (!name || !query) {
      return c.json({ error: { code: 'BAD_REQUEST', message: '缺少 name 或 query' } }, 400);
    }
    const pool = getPool();
    await pool.query(
      `INSERT INTO saved_searches (name, query, description, created_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (name) DO UPDATE SET
         query = EXCLUDED.query,
         description = EXCLUDED.description,
         updated_at = NOW()`,
      [name, query, description || '']
    );
    return c.json({ success: true });
  } catch (err) {
    loggerInstance.error({ err }, '保存搜索失败');
    return c.json({ error: { code: 'INTERNAL_ERROR', message: getErrorMessage('INTERNAL_ERROR') } }, 500);
  }
});

app.get('/api/saved-searches', async (c) => {
  try {
    const pool = getPool();
    const result = await pool.query(
      'SELECT name, query, description, created_at, updated_at FROM saved_searches ORDER BY updated_at DESC'
    );
    return c.json({ items: result.rows });
  } catch (err) {
    loggerInstance.error({ err }, '获取已保存搜索失败');
    return c.json({ error: { code: 'INTERNAL_ERROR', message: getErrorMessage('INTERNAL_ERROR') } }, 500);
  }
});

app.delete('/api/saved-searches/:name', async (c) => {
  try {
    const name = c.req.param('name');
    const pool = getPool();
    await pool.query('DELETE FROM saved_searches WHERE name = $1', [name]);
    return c.json({ success: true });
  } catch (err) {
    loggerInstance.error({ err }, '删除已保存搜索失败');
    return c.json({ error: { code: 'INTERNAL_ERROR', message: getErrorMessage('INTERNAL_ERROR') } }, 500);
  }
});

export default app;
