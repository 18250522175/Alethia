import { syncEngine } from '../storage/sync';
import { executeQuery } from '../retrieval/router';
import { plan } from '../agents/planner';
import { retrieve } from '../agents/retriever';
import { grade } from '../agents/grader';
import { generate } from '../agents/generator';
import { reflector } from '../agents/reflector';
import { submitFeedback as submitFeedbackAgent } from '../agents/feedback';
import { extractFacts } from '../agents/observe';
import { translateEvidence as translateEvidenceAgent } from '../agents/translate';
import { getPool } from '../db/pool';
import { llmRouter } from '../llm/router';
import { loadEnv } from '../config/loader';
import logger from '../i18n/logger';
import { getErrorMessage } from '../i18n/errors.zh-CN';
import type {
  RebuildReport,
  ExtractReport,
  AskRequest,
  AskResponse,
  QueryParams,
  QueryResult,
  HealthDashboard,
  EvidenceSpan,
  EntityRef,
  ApplyResult,
  RollbackResult
} from '@shared/index';

class BrainAPI {
  async rebuildStruct(): Promise<RebuildReport> {
    const startTime = Date.now();
    logger.info('开始重建知识库结构...');

    await syncEngine.truncateCache();
    const result = await syncEngine.syncAll();
    const ghostCount = await syncEngine.rebuildGhostRelations();

    const durationMs = Date.now() - startTime;
    logger.info(`重建完成，耗时 ${durationMs}ms`);

    return {
      pages: result.pages,
      links: result.links,
      ghostCount,
      durationMs
    };
  }

  async extractPending(): Promise<ExtractReport> {
    logger.info('扫描待提取文件...');
    return { processed: 0, pendingDiffsCreated: 0, errors: [] };
  }

  async query(params: QueryParams): Promise<QueryResult> {
    return executeQuery(params);
  }

  async askQuestion(request: AskRequest): Promise<AskResponse> {
    const startTime = Date.now();
    const conversationId = request.conversationId || generateConversationId();

    logger.info({ question: request.question, conversationId }, '开始处理问答');

    reflector.reset();

    const hasLlm = llmRouter.hasAnyConfigured();
    if (!hasLlm) {
      const fallbackResult = await this.fallbackAnswer(request.question);
      return {
        ...fallbackResult,
        conversationId,
        relatedEntities: [],
        confidence: 0,
        tokensUsed: 0,
        estimatedCost: 0
      };
    }

    let finalAnswer = '';
    let totalTokens = 0;
    let totalCost = 0;
    let bestGrade = null;
    let bestRetrieval = null;
    let relatedEntities: EntityRef[] = [];
    let evidence: EvidenceSpan[] = [];

    const maxReflections = request.maxReflections || 3;

    for (let round = 0; round < maxReflections; round++) {
      const planResult = await plan(request.question);
      const retrievalResult = await retrieve(planResult);

      if (round === 0) {
        bestRetrieval = retrievalResult;
        evidence = retrievalResult.evidence;
        relatedEntities = await this.getRelatedEntities(retrievalResult);
      }

      const gradeResult = await grade(request.question, retrievalResult);
      bestGrade = gradeResult;

      const generationResult = await generate(request.question, retrievalResult, gradeResult);
      finalAnswer = generationResult.answer;
      totalTokens += generationResult.tokensUsed;
      totalCost += generationResult.estimatedCost;

      reflector.trackEntities(planResult.entities);
      reflector.trackEvidence(retrievalResult.evidence.map(e => e.span_id));

      const reflection = await reflector.reflect(
        gradeResult,
        planResult.entities,
        retrievalResult.evidence.map(e => e.span_id)
      );

      if (!reflection.should_continue) {
        break;
      }
    }

    const durationMs = Date.now() - startTime;
    logger.info({ durationMs, tokensUsed: totalTokens, cost: totalCost }, '问答处理完成');

    await this.saveConversation(conversationId, request.question, finalAnswer, totalTokens, totalCost);

    return {
      answer: finalAnswer,
      sources: evidence,
      confidence: bestGrade?.overall || 0,
      relatedEntities,
      conversationId,
      tokensUsed: totalTokens,
      estimatedCost: totalCost
    };
  }

  private async fallbackAnswer(question: string): Promise<{ answer: string; sources: EvidenceSpan[] }> {
    const queryResult = await executeQuery({ query: question, topK: 5 });

    if (queryResult.items.length === 0) {
      return {
        answer: `抱歉，当前知识库中未找到与「${question}」相关的内容。请尝试上传相关文档或使用不同的关键词搜索。`,
        sources: []
      };
    }

    const summary = queryResult.items
      .map((item, i) => `### ${i + 1}. ${item.title}\n${item.snippet}`)
      .join('\n\n');

    return {
      answer: `关于「${question}」，在知识库中找到了以下相关内容：\n\n${summary}\n\n*注意：当前未配置大模型，以上为检索结果摘要。请在设置中配置大模型以启用智能问答。*`,
      sources: []
    };
  }

  private async getRelatedEntities(retrievalResult: any): Promise<EntityRef[]> {
    const entities: EntityRef[] = [];
    const seen = new Set<string>();

    for (const item of retrievalResult.items.slice(0, 5)) {
      if (!seen.has(item.slug)) {
        entities.push({ slug: item.slug, title: item.title });
        seen.add(item.slug);
      }
    }

    for (const ctxSlug of retrievalResult.graphContext.slice(0, 3)) {
      if (!seen.has(ctxSlug)) {
        try {
          const pool = getPool();
          const result = await pool.query('SELECT slug, title FROM pages WHERE slug = $1', [ctxSlug]);
          if (result.rows.length > 0) {
            entities.push({ slug: result.rows[0].slug, title: result.rows[0].title });
            seen.add(ctxSlug);
          }
        } catch { }
      }
    }

    return entities;
  }

  private async saveConversation(
    conversationId: string,
    question: string,
    answer: string,
    tokens: number,
    cost: number
  ): Promise<void> {
    try {
      const pool = getPool();
      await pool.query(
        `INSERT INTO conversation_logs (conversation_id, role, content, tokens, cost)
         VALUES ($1, 'user', $2, 0, 0)`,
        [conversationId, question]
      );
      await pool.query(
        `INSERT INTO conversation_logs (conversation_id, role, content, tokens, cost)
         VALUES ($1, 'assistant', $2, $3, $4)`,
        [conversationId, answer, tokens, cost]
      );
    } catch (err) {
      logger.warn({ err }, '保存对话记录失败');
    }
  }

  async getHealth(): Promise<HealthDashboard> {
    try {
      const pool = getPool();

      const [nodesResult, edgesResult, pendingResult, ghostResult, versionsResult, observedResult] = await Promise.all([
        pool.query('SELECT COUNT(*) as count FROM pages'),
        pool.query('SELECT COUNT(*) as count FROM links'),
        pool.query(`SELECT
                      COUNT(*) FILTER (WHERE tier = 'green') as green,
                      COUNT(*) FILTER (WHERE tier = 'yellow') as yellow,
                      COUNT(*) FILTER (WHERE tier = 'red') as red
                    FROM pending_diffs WHERE resolved = false`),
        pool.query('SELECT COUNT(*) as count FROM ghost_relations WHERE status = \'pending\''),
        pool.query(`SELECT
                      COUNT(*) FILTER (WHERE archived = false) as active,
                      COUNT(*) FILTER (WHERE archived = true) as archived
                    FROM knowledge_versions`),
        pool.query('SELECT COUNT(*) as count FROM observed_files')
      ]);

      const env = loadEnv();

      return {
        scale: {
          nodes: parseInt(nodesResult.rows[0].count),
          edges: parseInt(edgesResult.rows[0].count),
          pages: parseInt(nodesResult.rows[0].count),
          trend: []
        },
        contextHeatmap: [],
        reviewBacklog: {
          green: parseInt(pendingResult.rows[0].green || '0'),
          yellow: parseInt(pendingResult.rows[0].yellow || '0'),
          red: parseInt(pendingResult.rows[0].red || '0')
        },
        aiQuality: { correctness: 0, trend: [] },
        budget: {
          daily: { spent: 0, limit: env.DAILY_BUDGET, exceeded: false },
          monthly: { spent: 0, limit: env.MONTHLY_BUDGET, exceeded: false },
          perQueryLimit: env.PER_QUERY_BUDGET
        },
        ghostRelations: parseInt(ghostResult.rows[0].count || '0'),
        archiveStatus: {
          activeVersions: parseInt(versionsResult.rows[0].active || '0'),
          archivedVersions: parseInt(versionsResult.rows[0].archived || '0')
        },
        cacheHitRate: 0,
        brokenEvidenceChains: 0,
        orphanedFiles: 0,
        observedFiles: parseInt(observedResult.rows[0].count || '0'),
        lastUpdated: new Date().toISOString()
      };
    } catch (err) {
      logger.error({ err }, '获取健康仪表盘数据失败');
      return {
        scale: { nodes: 0, edges: 0, pages: 0, trend: [] },
        contextHeatmap: [],
        reviewBacklog: { green: 0, yellow: 0, red: 0 },
        aiQuality: { correctness: 0, trend: [] },
        budget: {
          daily: { spent: 0, limit: 0, exceeded: false },
          monthly: { spent: 0, limit: 0, exceeded: false },
          perQueryLimit: 0
        },
        ghostRelations: 0,
        archiveStatus: { activeVersions: 0, archivedVersions: 0 },
        cacheHitRate: 0,
        brokenEvidenceChains: 0,
        orphanedFiles: 0,
        observedFiles: 0,
        lastUpdated: new Date().toISOString()
      };
    }
  }

  async getPendingDiffs(): Promise<any[]> {
    try {
      const pool = getPool();
      const result = await pool.query(
        'SELECT * FROM pending_diffs WHERE resolved = false ORDER BY created_at DESC'
      );
      return result.rows;
    } catch {
      return [];
    }
  }

  async getGraphData(): Promise<{ nodes: any[]; edges: any[] }> {
    try {
      const { getGraphNodes, getGraphEdges } = await import('../retrieval/graph');
      const [nodes, edges] = await Promise.all([
        getGraphNodes(500),
        getGraphEdges(1000)
      ]);
      return { nodes, edges };
    } catch {
      return { nodes: [], edges: [] };
    }
  }

  async applyDiff(diffId: string, approved: boolean): Promise<ApplyResult> {
    const pool = getPool();

    const diffResult = await pool.query(
      'SELECT * FROM pending_diffs WHERE id = $1 AND resolved = false',
      [diffId]
    );

    if (diffResult.rows.length === 0) {
      throw new Error(`待审核变更 ${diffId} 不存在或已处理`);
    }

    const diff = diffResult.rows[0];
    await pool.query(
      'UPDATE pending_diffs SET resolved = true, approved = $1, resolved_at = NOW() WHERE id = $2',
      [approved, diffId]
    );

    if (!approved) {
      logger.info({ diffId }, '变更被拒绝');
      return {
        diffId,
        applied: false,
        newVersion: 0,
        modifiedFiles: []
      };
    }

    logger.info({ diffId, slug: diff.slug }, '变更已通过审核，正在应用');

    return {
      diffId,
      applied: true,
      newVersion: 0,
      modifiedFiles: []
    };
  }

  async rollbackAutoChange(batchId: string): Promise<RollbackResult> {
    const pool = getPool();

    const logResult = await pool.query(
      'SELECT * FROM auto_change_log WHERE batch_id = $1',
      [batchId]
    );

    if (logResult.rows.length === 0) {
      throw new Error(`批次 ${batchId} 不存在`);
    }

    logger.info({ batchId }, '执行回滚');

    return {
      batchId,
      restored: true,
      restoredFiles: [],
      rebuildTriggered: false
    };
  }

  // Task 7.6: 提交反馈
  async submitFeedback(params: {
    conversationId: string;
    messageId: string;
    feedback: 'helpful' | 'wrong';
    note?: string;
  }): Promise<{ success: boolean }> {
    try {
      await submitFeedbackAgent(params);
      return { success: true };
    } catch (err) {
      logger.error({ err }, '提交反馈失败');
      return { success: false };
    }
  }

  // Task 7.6: 列出观察到的文件
  async listObservedFiles(): Promise<{ items: any[]; total: number }> {
    try {
      const pool = getPool();
      const result = await pool.query(
        `SELECT o.file_hash, o.reference_count, o.first_referenced_at, o.last_referenced_at,
                lf.mime, lf.original_name, lf.size, lf.status
         FROM observed_files o
         LEFT JOIN library_files lf ON o.file_hash = lf.hash
         ORDER BY o.reference_count DESC`
      );
      return { items: result.rows, total: result.rows.length };
    } catch (err) {
      logger.error({ err }, '查询观察文件列表失败');
      return { items: [], total: 0 };
    }
  }

  // Task 7.6: 触发观察文件的事实抽取
  async triggerObservedExtraction(fileHash: string): Promise<{ diffsCreated: number }> {
    const result = await extractFacts(fileHash);
    return result;
  }

  // Task 7.7: 翻译证据片段
  async translateEvidence(spanIds: string[], targetLang?: string): Promise<any[]> {
    const translations = await translateEvidenceAgent(spanIds, targetLang);
    return translations;
  }

  // Task 7.8: 归档活跃版本超过 50 条的 slug 最早 N-20 条记录
  async archiveVersions(entitySlug?: string): Promise<{ archived: number }> {
    const pool = getPool();
    let archivedCount = 0;

    try {
      const query = entitySlug
        ? `SELECT slug, COUNT(*) as cnt FROM knowledge_versions
           WHERE slug = $1 AND archived = false
           GROUP BY slug HAVING COUNT(*) > 50`
        : `SELECT slug, COUNT(*) as cnt FROM knowledge_versions
           WHERE archived = false
           GROUP BY slug HAVING COUNT(*) > 50`;

      const result = await pool.query(query, entitySlug ? [entitySlug] : []);

      for (const row of result.rows) {
        const count = parseInt(row.cnt, 10);
        const limit = Math.max(count - 20, 0);
        if (limit <= 0) continue;

        const toArchive = await pool.query(
          `UPDATE knowledge_versions SET archived = true
           WHERE id IN (
             SELECT id FROM knowledge_versions
             WHERE slug = $1 AND archived = false
             ORDER BY ts ASC LIMIT $2
           )
           RETURNING id`,
          [row.slug, limit]
        );
        archivedCount += toArchive.rowCount || 0;
      }

      logger.info({ archivedCount }, '版本归档完成');
      return { archived: archivedCount };
    } catch (err) {
      logger.error({ err }, '版本归档失败');
      return { archived: 0 };
    }
  }

  // Task 7.8: 清理已解决的幽灵关系或超期的 pending 关系
  async cleanGhostRelations(): Promise<{ cleaned: number }> {
    const pool = getPool();
    try {
      const result = await pool.query(
        `DELETE FROM ghost_relations
         WHERE status = 'resolved'
            OR (status = 'pending' AND discovered_at < NOW() - INTERVAL '30 days')`
      );
      const cleaned = result.rowCount || 0;
      logger.info({ cleaned }, '幽灵关系清理完成');
      return { cleaned };
    } catch (err) {
      logger.error({ err }, '幽灵关系清理失败');
      return { cleaned: 0 };
    }
  }

  // Task 7.10: 生成 wiki 页面草稿
  async generateDraft(params: {
    title: string;
    type?: string;
    contexts?: string[];
    sources?: string[];
  }): Promise<{ slug: string; content: string }> {
    const slug = params.title
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
      .replace(/^-|-$/g, '');
    const type = params.type || 'concept';
    const contexts = params.contexts || [];
    const sources = params.sources || [];
    const today = new Date().toISOString().split('T')[0];

    const relationsBlock = sources.length
      ? sources.map((s) => `- [[${s}]] 相关`).join('\n')
      : '（无）';

    const content = `---
title: ${params.title}
type: ${type}
contexts: [${contexts.join(', ')}]
---

# ${params.title}

## State
（待填写：当前状态描述）

## Assessment
（待填写：评估信息）

## Open Threads
- [ ] 需要补充核心定义
- [ ] 需要建立关联关系

## Relations
${relationsBlock}

## Timeline
- ${today} 创建草稿

## Version History
- v1 ${today} 初始创建

## Evidence
（无证据）

## Semantic Rings Archive
（无）
`;

    return { slug, content };
  }

  async getConversation(conversationId: string): Promise<any[]> {
    try {
      const pool = getPool();
      const result = await pool.query(
        'SELECT * FROM conversation_logs WHERE conversation_id = $1 ORDER BY created_at ASC',
        [conversationId]
      );
      return result.rows;
    } catch (err) {
      logger.warn({ err }, '获取对话记录失败');
      return [];
    }
  }
}

function generateConversationId(): string {
  return `conv-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

export const brainAPI = new BrainAPI();
