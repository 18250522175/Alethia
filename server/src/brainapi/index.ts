import { syncEngine } from '../storage/sync';
import { storage } from '../storage/markdown';
import { parser } from '../storage/parser';
import { executeQuery } from '../retrieval/router';
import { plan } from '../agents/planner';
import { retrieve } from '../agents/retriever';
import { grade } from '../agents/grader';
import { generate } from '../agents/generator';
import { Reflector } from '../agents/reflector';
import { submitFeedback as submitFeedbackAgent } from '../agents/feedback';
import { extractFacts } from '../agents/observe';
import { translateEvidence as translateEvidenceAgent } from '../agents/translate';
import { getPool } from '../db/pool';
import { llmRouter } from '../llm/router';
import { loadEnv } from '../config/loader';
import logger from '../i18n/logger';
import { getErrorMessage } from '../i18n/errors.zh-CN';
import { budgetManager } from '../evolution/budget';
import { randomUUID } from 'crypto';
import { join } from 'path';
import { existsSync, unlinkSync, readdirSync } from 'fs';
import { createHash } from 'crypto';
import { getSyntaxHelp } from '../retrieval/syntaxParser';
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

    let processed = 0;
    let pendingDiffsCreated = 0;
    const errors: { filePath: string; message: string }[] = [];

    // 扫描 library_files 中 status='new' 的文件并提取
    const libResult = await syncEngine.extractNewLibraryFiles();
    processed += libResult.extracted;
    pendingDiffsCreated += libResult.diffsCreated;
    for (const msg of libResult.errors) {
      const colonIdx = msg.indexOf(': ');
      errors.push({
        filePath: colonIdx > 0 ? msg.slice(0, colonIdx) : '',
        message: colonIdx > 0 ? msg.slice(colonIdx + 2) : msg
      });
    }

    logger.info({ processed, pendingDiffsCreated, errorCount: errors.length }, '待提取文件处理完成');
    return { processed, pendingDiffsCreated, errors };
  }

  async query(params: QueryParams): Promise<QueryResult> {
    return executeQuery(params);
  }

  async askQuestion(request: AskRequest): Promise<AskResponse> {
    const startTime = Date.now();
    const conversationId = request.conversationId || generateConversationId();

    logger.info({ question: request.question, conversationId }, '开始处理问答');

    const ref = new Reflector();
    ref.reset();

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

      const generationResult = await generate(request.question, retrievalResult, gradeResult, request.causalContext);
      finalAnswer = generationResult.answer;
      totalTokens += generationResult.tokensUsed;
      totalCost += generationResult.estimatedCost;

      ref.trackEntities(planResult.entities);
      ref.trackEvidence(retrievalResult.evidence.map(e => e.span_id));

      const reflection = await ref.reflect(
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
        } catch (err) {
          logger.warn({ err }, '获取图谱上下文实体信息失败');
        }
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
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO conversation_logs (conversation_id, role, content, tokens, cost)
         VALUES ($1, 'user', $2, 0, 0)`,
        [conversationId, question]
      );
      await client.query(
        `INSERT INTO conversation_logs (conversation_id, role, content, tokens, cost)
         VALUES ($1, 'assistant', $2, $3, $4)`,
        [conversationId, answer, tokens, cost]
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      logger.warn({ err }, '保存对话记录失败');
    } finally {
      client.release();
    }
  }

  async getHealth(): Promise<HealthDashboard> {
    try {
      const pool = getPool();

      const [nodesResult, edgesResult, pendingResult, ghostResult, versionsResult, observedResult,
             brokenResult, orphanedResult, trendResult, evalResult, contextResult, cacheResult] = await Promise.all([
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
        pool.query('SELECT COUNT(*) as count FROM observed_files'),
        pool.query('SELECT COUNT(*) as count FROM links WHERE orphaned = true'),
        pool.query(`SELECT COUNT(*) as count FROM pages p
                    WHERE NOT EXISTS (SELECT 1 FROM links WHERE source_slug = p.slug AND NOT orphaned)
                      AND NOT EXISTS (SELECT 1 FROM links WHERE target_slug = p.slug AND NOT orphaned)`),
        pool.query(`WITH dates AS (
                    SELECT generate_series(
                      CURRENT_DATE - INTERVAL '6 days',
                      CURRENT_DATE,
                      '1 day'::interval
                    )::date AS day
                  ),
                  page_counts AS (
                    SELECT DATE(created_at) as day, COUNT(*) as nodes
                    FROM pages
                    WHERE created_at <= CURRENT_DATE
                    GROUP BY DATE(created_at)
                  ),
                  link_counts AS (
                    SELECT DATE(created_at) as day, COUNT(*) as edges
                    FROM links
                    WHERE created_at <= CURRENT_DATE
                    GROUP BY DATE(created_at)
                  )
                  SELECT 
                    d.day,
                    COALESCE(SUM(pc.nodes) OVER (ORDER BY d.day), 0) as nodes,
                    COALESCE(SUM(lc.edges) OVER (ORDER BY d.day), 0) as edges
                  FROM dates d
                  LEFT JOIN page_counts pc ON pc.day = d.day
                  LEFT JOIN link_counts lc ON lc.day = d.day
                  ORDER BY d.day`),
        pool.query(`SELECT COUNT(*) FILTER (WHERE passed = true) as passed, COUNT(*) as total
                    FROM eval_results WHERE created_at > NOW() - INTERVAL '30 days'`),
        pool.query(`SELECT unnest(contexts) as context, COUNT(*) as activity
                    FROM pages
                    WHERE contexts IS NOT NULL AND array_length(contexts, 1) > 0
                    GROUP BY context
                    ORDER BY activity DESC
                    LIMIT 10`),
        pool.query(`SELECT
                      COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '1 hour') as cached,
                      COUNT(*) as total
                    FROM evidence_translations`)
      ]);

      const env = loadEnv();

      const snapshot = budgetManager.getSnapshot();
      const alerts = budgetManager.getAlerts();
      const budgetExceeded = alerts.some(a => a.metric === 'budget_exceeded');

      const evalPassed = parseInt(evalResult.rows[0]?.passed || '0');
      const evalTotal = parseInt(evalResult.rows[0]?.total || '0');

      return {
        scale: {
          nodes: parseInt(nodesResult.rows[0].count),
          edges: parseInt(edgesResult.rows[0].count),
          pages: parseInt(nodesResult.rows[0].count),
          trend: trendResult.rows.map((r: any) => ({ date: r.day, nodes: parseInt(r.nodes), edges: parseInt(r.edges) }))
        },
        contextHeatmap: contextResult.rows.map((r: any) => ({
          context: r.context,
          activity: parseInt(r.activity)
        })),
        reviewBacklog: {
          green: parseInt(pendingResult.rows[0].green || '0'),
          yellow: parseInt(pendingResult.rows[0].yellow || '0'),
          red: parseInt(pendingResult.rows[0].red || '0')
        },
        aiQuality: {
          correctness: evalTotal > 0 ? evalPassed / evalTotal : 0,
          trend: []
        },
        budget: {
          daily: { spent: snapshot.dailyUsed, limit: snapshot.dailyBudget, exceeded: snapshot.remaining.daily <= 0 },
          monthly: { spent: snapshot.monthlyUsed, limit: snapshot.monthlyBudget, exceeded: snapshot.remaining.monthly <= 0 },
          perQueryLimit: env.PER_QUERY_BUDGET
        },
        ghostRelations: parseInt(ghostResult.rows[0].count || '0'),
        archiveStatus: {
          activeVersions: parseInt(versionsResult.rows[0].active || '0'),
          archivedVersions: parseInt(versionsResult.rows[0].archived || '0')
        },
        cacheHitRate: (() => {
          const cached = parseInt(cacheResult.rows[0]?.cached || '0');
          const total = parseInt(cacheResult.rows[0]?.total || '0');
          return total > 0 ? cached / total : 0;
        })(),
        brokenEvidenceChains: parseInt(brokenResult.rows[0].count || '0'),
        orphanedFiles: parseInt(orphanedResult.rows[0].count || '0'),
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
    } catch (err) {
      logger.warn({ err }, '获取待审核变更失败');
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
    } catch (err) {
      logger.warn({ err }, '获取图谱数据失败');
      return { nodes: [], edges: [] };
    }
  }

  async applyDiff(diffId: string, approved: boolean): Promise<ApplyResult> {
    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const diffResult = await client.query(
        'SELECT * FROM pending_diffs WHERE id = $1 AND resolved = false',
        [diffId]
      );

      if (diffResult.rows.length === 0) {
        await client.query('ROLLBACK');
        throw new Error(`待审核变更 ${diffId} 不存在或已处理`);
      }

      const diff = diffResult.rows[0];
      await client.query(
        'UPDATE pending_diffs SET resolved = true, approved = $1, resolved_at = NOW() WHERE id = $2',
        [approved, diffId]
      );

      if (!approved) {
        await client.query('COMMIT');
        logger.info({ diffId }, '变更被拒绝');
        return {
          diffId,
          applied: false,
          newVersion: 0,
          modifiedFiles: []
        };
      }

      logger.info({ diffId, slug: diff.slug }, '变更已通过审核，正在应用');

      const wikiPath = storage.getWikiPath();
      const targetFile = join(wikiPath, `${diff.slug}.md`);
      const modifiedFiles: string[] = [];

      if (existsSync(targetFile)) {
        const currentContent = storage.readFile(targetFile);
        const payload = diff.payload || {};

        const newContent = applyContentChange(currentContent, payload, diff.type);
        if (newContent !== currentContent) {
          storage.atomicWrite(targetFile, newContent);
          modifiedFiles.push(`${diff.slug}.md`);

          const versionId = randomUUID();
          const maxVersionResult = await client.query(
            `SELECT COALESCE(MAX(version), 0)::bigint as max_version FROM knowledge_versions WHERE slug = $1`,
            [diff.slug]
          );
          const nextVersion = (maxVersionResult.rows[0]?.max_version || 0) + 1;
          // 防止 INTEGER 溢出（上限 2,147,483,647）
          if (nextVersion > 2147483647) {
            await client.query('ROLLBACK');
            throw new Error(`实体 ${diff.slug} 版本号已达 INTEGER 上限，请先执行归档操作`);
          }
          await client.query(
            `INSERT INTO knowledge_versions (id, slug, version, content, batch_id, created_at)
             VALUES ($1, $2, $3, $4, $5, NOW())`,
            [versionId, diff.slug, nextVersion, newContent.slice(0, 5000), `diff-${diffId}`]
          );
        }
      } else {
        const payload = diff.payload || {};
        let newContent = `---\nslug: ${diff.slug}\ntype: ${diff.type || 'concept'}\n---\n\n`;
        if (payload.content) {
          newContent += typeof payload.content === 'string' ? payload.content : JSON.stringify(payload.content, null, 2);
        }
        storage.writeFile(targetFile, newContent);
        modifiedFiles.push(`${diff.slug}.md`);
      }

      await client.query('COMMIT');
      logger.info({ diffId, modifiedFiles }, '变更已成功应用');

      // syncAll 必须在事务 COMMIT 后调用，避免跨连接死锁和事务隔离问题
      if (modifiedFiles.length > 0) {
        try {
          await syncEngine.syncAll();
        } catch (syncErr) {
          logger.error({ syncErr, diffId }, 'syncAll 失败（文件已写入，事务已提交）');
        }
      }

      return {
        diffId,
        applied: true,
        newVersion: nextVersion,
        modifiedFiles
      };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      logger.error({ err, diffId }, '应用变更失败');
      throw new Error(`应用变更失败: ${(err as Error).message}`);
    } finally {
      client.release();
    }
  }

  async rollbackAutoChange(batchId: string): Promise<RollbackResult> {
    const pool = getPool();

    const logResult = await pool.query(
      'SELECT * FROM auto_change_log WHERE batch_id = $1 ORDER BY id DESC',
      [batchId]
    );

    if (logResult.rows.length === 0) {
      throw new Error(`批次 ${batchId} 不存在`);
    }

    logger.info({ batchId, count: logResult.rows.length }, '执行回滚');

    const restoredFiles: string[] = [];

    try {
      const wikiPath = storage.getWikiPath();

      for (const logEntry of logResult.rows) {
        const slug = logEntry.slug;
        const targetFile = join(wikiPath, `${slug}.md`);

        // 查找变更前的版本
        const versionResult = await pool.query(
          `SELECT * FROM knowledge_versions
           WHERE slug = $1 AND created_at < $2
           ORDER BY created_at DESC LIMIT 1`,
          [slug, logEntry.created_at]
        );

        if (versionResult.rows.length > 0) {
          const prevVersion = versionResult.rows[0];
          storage.atomicWrite(targetFile, prevVersion.content);
          restoredFiles.push(`${slug}.md`);
        } else if (logEntry.op === 'create') {
          // 如果是创建操作且没有历史版本，删除文件
          if (existsSync(targetFile)) {
            unlinkSync(targetFile);
            restoredFiles.push(`${slug}.md (已删除)`);
          }
        }
      }

      // 循环结束后统一同步一次，避免 N 次全量同步
      if (restoredFiles.length > 0) {
        await syncEngine.syncAll();
      }

      return {
        batchId,
        restored: true,
        restoredFiles,
        rebuildTriggered: restoredFiles.length > 0
      };
    } catch (err) {
      logger.error({ err, batchId }, '回滚失败');
      throw new Error(`回滚失败: ${(err as Error).message}`);
    }
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
    try {
      const { archiveVersions: fullArchive } = await import('../evolution/archive');
      const result = await fullArchive(entitySlug);
      return { archived: result.archived };
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

  // Wiki 页面读取与编辑
  async getWikiPage(slug: string): Promise<{
    page: {
      slug: string;
      title: string;
      type: string;
      contexts: string[];
      aliases: string[];
      rawMd: string;
      contentMd: string;
      hash: string;
      updatedAt: string;
      version: number;
    };
    evidenceSpans: any[];
    links: { incoming: any[]; outgoing: any[] };
  }> {
    const wikiPath = storage.getWikiPath();
    let targetFile = join(wikiPath, `${slug}.md`);
    let resolvedSlug = slug;

    // 如果文件不存在，尝试通过别名查找
    if (!existsSync(targetFile)) {
      const pool = getPool();
      const aliasResult = await pool.query(
        `SELECT slug FROM pages
         WHERE slug = $1
            OR EXISTS (
              SELECT 1 FROM unnest(aliases) AS a
              WHERE LOWER(a) = LOWER($1)
            )
         LIMIT 1`,
        [slug]
      );
      if (aliasResult.rows.length > 0) {
        resolvedSlug = aliasResult.rows[0].slug;
        targetFile = join(wikiPath, `${resolvedSlug}.md`);
      }
    }

    if (!existsSync(targetFile)) {
      throw new Error(`页面 ${slug} 不存在`);
    }

    const rawMd = storage.readFile(targetFile);
    const parsed = await parser.parse(targetFile, rawMd);

    // 查询证据跨度
    const pool = getPool();
    const evidenceResult = await pool.query(
      'SELECT span_id, source_file_hash, span_text, source_type, confidence FROM evidence_spans WHERE slug = $1',
      [resolvedSlug]
    );

    // 查询关联链接
    const [incomingResult, outgoingResult] = await Promise.all([
      pool.query(
        `SELECT l.*, p.title as target_title FROM links l
         LEFT JOIN pages p ON p.slug = l.source_slug
         WHERE l.target_slug = $1`,
        [resolvedSlug]
      ),
      pool.query(
        `SELECT l.*, p.title as target_title FROM links l
         LEFT JOIN pages p ON p.slug = l.target_slug
         WHERE l.source_slug = $1`,
        [resolvedSlug]
      )
    ]);

    // 查询版本号和数据库中的别名
    const [versionResult, dbPageResult] = await Promise.all([
      pool.query(
        'SELECT MAX(version) as max_version FROM knowledge_versions WHERE slug = $1',
        [resolvedSlug]
      ),
      pool.query(
        'SELECT aliases FROM pages WHERE slug = $1',
        [resolvedSlug]
      )
    ]);
    const version = versionResult.rows[0]?.max_version || 1;
    const dbAliases = dbPageResult.rows[0]?.aliases || [];

    return {
      page: {
        slug: parsed.slug || resolvedSlug,
        title: parsed.title || resolvedSlug,
        type: parsed.type || 'concept',
        contexts: parsed.contexts || [],
        aliases: dbAliases.length > 0 ? dbAliases : (parsed.aliases || []),
        rawMd,
        contentMd: parsed.contentMd || '',
        hash: storage.getFileHash(targetFile),
        updatedAt: new Date(storage.getFileMtime(targetFile)).toISOString(),
        version
      },
      evidenceSpans: evidenceResult.rows,
      links: {
        incoming: incomingResult.rows,
        outgoing: outgoingResult.rows
      }
    };
  }

  async updateWikiPage(slug: string, content: string): Promise<{ success: boolean; hash: string }> {
    const wikiPath = storage.getWikiPath();
    const targetFile = join(wikiPath, `${slug}.md`);

    if (!existsSync(targetFile)) {
      throw new Error(`页面 ${slug} 不存在`);
    }

    storage.atomicWrite(targetFile, content);

    // 触发重新同步
    await syncEngine.syncAll();

    const hash = storage.getFileHash(targetFile);
    logger.info({ slug, hash }, 'Wiki 页面已更新');

    return { success: true, hash };
  }

  /**
   * 别名解析：将别名映射到规范 slug
   */
  async resolveAlias(alias: string): Promise<{ slug: string | null; aliases: string[] }> {
    const pool = getPool();
    const result = await pool.query(
      `SELECT slug, aliases FROM pages
       WHERE slug = $1
          OR EXISTS (
            SELECT 1 FROM unnest(aliases) AS a
            WHERE LOWER(a) = LOWER($1)
          )
       LIMIT 1`,
      [alias]
    );
    if (result.rows.length === 0) {
      return { slug: null, aliases: [] };
    }
    return { slug: result.rows[0].slug, aliases: result.rows[0].aliases || [] };
  }

  /**
   * 获取所有别名映射表（用于前端 wikilink 解析）
   */
  async getAllAliasMap(): Promise<Record<string, string>> {
    const pool = getPool();
    const result = await pool.query(
      `SELECT slug, aliases FROM pages
       WHERE aliases IS NOT NULL AND array_length(aliases, 1) > 0`
    );
    const map: Record<string, string> = {};
    for (const row of result.rows) {
      for (const alias of row.aliases || []) {
        const key = alias.toLowerCase();
        if (!map[key]) {
          map[key] = row.slug;
        }
      }
    }
    return map;
  }

  /**
   * 别名冲突检测：返回重复出现的别名及其关联的多个实体
   */
  async getAliasConflicts(): Promise<Array<{ alias: string; slugs: string[] }>> {
    const pool = getPool();
    const result = await pool.query(
      `SELECT LOWER(a) AS alias, array_agg(DISTINCT slug) AS slugs, COUNT(DISTINCT slug) AS cnt
       FROM pages, unnest(aliases) AS a
       WHERE aliases IS NOT NULL AND array_length(aliases, 1) > 0
       GROUP BY LOWER(a)
       HAVING COUNT(DISTINCT slug) > 1`
    );
    return result.rows.map((r: any) => ({
      alias: r.alias,
      slugs: r.slugs
    }));
  }

  async generateStaticSite(options?: any): Promise<any> {
    const { generateStaticSite } = await import('./static');
    return generateStaticSite(options);
  }

  async getChangeLog(params?: { limit?: number; op?: string }): Promise<{ batches: any[]; total: number }> {
    try {
      const pool = getPool();
      const limit = params?.limit || 100;
      const opFilter = params?.op;
      const sqlLimit = limit * 1000;

      // 使用两个独立查询避免动态参数索引混乱
      const subResult = opFilter
        ? await pool.query(
            `SELECT batch_id, op, target, created_at,
                    COUNT(*) OVER (PARTITION BY batch_id, op) as cnt
             FROM auto_change_log
             WHERE op = $1
             ORDER BY created_at DESC
             LIMIT $2`,
            [opFilter, sqlLimit]
          )
        : await pool.query(
            `SELECT batch_id, op, target, created_at,
                    COUNT(*) OVER (PARTITION BY batch_id, op) as cnt
             FROM auto_change_log
             ORDER BY created_at DESC
             LIMIT $1`,
            [sqlLimit]
          );

      // 构建 batch_id 列表用于外层查询
      const batchIds = [...new Set(subResult.rows.map((r: any) => r.batch_id))].slice(0, limit);
      const result = batchIds.length > 0
        ? await pool.query(
            `SELECT batch_id,
                    MIN(created_at) as batch_ts,
                    COUNT(*) as total_ops,
                    json_object_agg(op, cnt) as op_counts,
                    array_agg(DISTINCT target) as targets
             FROM (
               SELECT batch_id, op, target, created_at,
                      COUNT(*) OVER (PARTITION BY batch_id, op) as cnt
               FROM auto_change_log
               WHERE batch_id = ANY($1::text[])
             ) sub
             GROUP BY batch_id
             ORDER BY batch_ts DESC`,
            [batchIds]
          )
        : { rows: [] };

      const batches = result.rows.map(row => ({
        batchId: row.batch_id,
        ts: row.batch_ts,
        opCounts: row.op_counts || {},
        totalOps: parseInt(row.total_ops),
        targets: row.targets || []
      }));

      const totalResult = await pool.query(
        `SELECT COUNT(DISTINCT batch_id) as count FROM auto_change_log${opFilter ? ' WHERE op = $1' : ''}`,
        opFilter ? [opFilter] : []
      );

      return {
        batches: batches.slice(0, limit),
        total: parseInt(totalResult.rows[0]?.count || '0')
      };
    } catch (err) {
      logger.warn({ err }, '获取变更日志失败');
      return { batches: [], total: 0 };
    }
  }

  async getEvalReport(): Promise<{
    benchmarks: any[];
    anomalies: any[];
    summary: any;
    trend: any[];
  }> {
    try {
      const pool = getPool();

      const [benchResult, anomalyResult] = await Promise.all([
        pool.query('SELECT id, type, slug, source_text, expected_output, git_commit FROM shadow_benchmarks ORDER BY id DESC LIMIT 100'),
        pool.query('SELECT id, metric, threshold, actual, ts, message FROM eval_anomaly_flags ORDER BY ts DESC LIMIT 20')
      ]);

      const benchmarks = await Promise.all(benchResult.rows.map(async (row) => {
        let passed: boolean | null = null;
        let score: number | null = null;

        // 尝试评估：检查当前页面内容是否匹配预期输出
        try {
          if (row.slug && row.type === 'factual') {
            const wikiPath = storage.getWikiPath();
            const targetFile = join(wikiPath, `${row.slug}.md`);
            if (existsSync(targetFile)) {
              const currentContent = storage.readFile(targetFile);
              // 使用 CJK 感知的 Jaccard 相似度（中英文通用）
              const currentTokens = tokenizeForSimilarity(currentContent);
              const expectedTokens = tokenizeForSimilarity(row.expected_output);
              const intersection = new Set([...currentTokens].filter(t => expectedTokens.has(t)));
              const union = new Set([...currentTokens, ...expectedTokens]);
              const similarity = union.size > 0 ? intersection.size / union.size : 0;
              passed = similarity >= 0.3;
              score = similarity;
            }
          }
        } catch (err) {
          logger.warn({ err, slug: row.slug }, '基准评估失败');
        }

        return {
          id: row.id,
          type: row.type,
          slug: row.slug,
          sourceText: row.source_text,
          expectedOutput: row.expected_output,
          gitCommit: row.git_commit,
          passed,
          score
        };
      }));

      const anomalies = anomalyResult.rows.map(row => ({
        id: row.id,
        metric: row.metric,
        threshold: row.threshold,
        actual: row.actual,
        ts: row.ts,
        message: row.message
      }));

      const passed = benchmarks.filter((b: any) => b.passed === true).length;
      const total = benchmarks.length;

      return {
        benchmarks,
        anomalies,
        summary: {
          total,
          passed,
          accuracy: total > 0 ? passed / total : 0,
          reproductionRate: 0,
          newErrors: 0,
          lastRun: null
        },
        trend: []
      };
    } catch (err) {
      logger.warn({ err }, '获取评估报告失败');
      return {
        benchmarks: [],
        anomalies: [],
        summary: { total: 0, passed: 0, accuracy: 0, reproductionRate: 0, newErrors: 0 },
        trend: []
      };
    }
  }

  async runShadowEval(): Promise<{
    passed: boolean;
    accuracy: number;
    reproductionRate: number;
    newErrors: number;
    errors: string[];
  }> {
    try {
      const { runShadowEval } = await import('../evolution/shadow');
      return runShadowEval();
    } catch (err) {
      logger.error({ err }, '影子评估执行失败');
      return {
        passed: false,
        accuracy: 0,
        reproductionRate: 0,
        newErrors: 0,
        errors: [err instanceof Error ? err.message : '未知错误']
      };
    }
  }

  // Timeline
  async getTimeline(params?: { slug?: string; limit?: number; offset?: number }): Promise<{ items: any[]; total: number }> {
    try {
      const pool = getPool();
      const limit = params?.limit || 20;
      const offset = params?.offset || 0;

      let query = 'SELECT id, slug, type, payload, ts FROM timeline_entries';
      let countQuery = 'SELECT COUNT(*) as count FROM timeline_entries';
      const queryParams: any[] = [];

      if (params?.slug) {
        query += ' WHERE slug = $1';
        countQuery += ' WHERE slug = $1';
        queryParams.push(params.slug);
      }

      query += ' ORDER BY ts DESC LIMIT $' + (queryParams.length + 1) + ' OFFSET $' + (queryParams.length + 2);
      queryParams.push(limit, offset);

      const [result, countResult] = await Promise.all([
        pool.query(query, queryParams),
        pool.query(countQuery, params?.slug ? [params.slug] : [])
      ]);

      const items = result.rows.map((row: any) => ({
        id: row.id,
        slug: row.slug,
        type: row.type,
        payload: row.payload,
        ts: row.ts,
        title: row.payload?.title || '',
        description: row.payload?.description || ''
      }));

      return {
        items,
        total: parseInt(countResult.rows[0]?.count || '0')
      };
    } catch (err) {
      logger.warn({ err }, '获取时间线失败');
      return { items: [], total: 0 };
    }
  }

  // Search
  async search(query: string, offset: number = 0, limit: number = 50): Promise<{ pages: any[]; files: any[]; conversations: any[]; total: number; pagesTotal: number; filesTotal: number; conversationsTotal: number }> {
    try {
      const pool = getPool();
      const queryString = `%${query}%`;

      const [pageResult, fileResult, convResult, pageCount, fileCount, convCount] = await Promise.all([
        pool.query(
          `SELECT slug, title, type,
                  LEFT(content_md, 200) as snippet
           FROM pages
           WHERE title ILIKE $1 OR content_md ILIKE $1 OR slug ILIKE $1
           ORDER BY title
           OFFSET $2 LIMIT $3`,
          [queryString, offset, limit]
        ),
        pool.query(
          `SELECT hash, mime, original_name, size, status
           FROM library_files
           WHERE original_name ILIKE $1 OR hash ILIKE $1
           ORDER BY original_name
           OFFSET $2 LIMIT $3`,
          [queryString, offset, limit]
        ),
        pool.query(
          `SELECT conversation_id, content, created_at as ts, role
           FROM conversation_logs
           WHERE content ILIKE $1 AND role = 'user'
           ORDER BY created_at DESC
           OFFSET $2 LIMIT $3`,
          [queryString, offset, limit]
        ),
        pool.query(
          `SELECT COUNT(*) as count FROM pages WHERE title ILIKE $1 OR content_md ILIKE $1 OR slug ILIKE $1`,
          [queryString]
        ),
        pool.query(
          `SELECT COUNT(*) as count FROM library_files WHERE original_name ILIKE $1 OR hash ILIKE $1`,
          [queryString]
        ),
        pool.query(
          `SELECT COUNT(*) as count FROM conversation_logs WHERE content ILIKE $1 AND role = 'user'`,
          [queryString]
        )
      ]);

      const pages = pageResult.rows.map((r: any) => ({
        slug: r.slug, title: r.title, snippet: r.snippet, type: r.type
      }));
      const files = fileResult.rows.map((r: any) => ({
        hash: r.hash, originalName: r.original_name, mime: r.mime, size: r.size, status: r.status
      }));
      const conversations = convResult.rows.map((r: any) => ({
        id: r.conversation_id, question: r.content, answer: '', ts: r.ts
      }));

      const pagesTotal = parseInt(pageCount.rows[0]?.count || '0', 10);
      const filesTotal = parseInt(fileCount.rows[0]?.count || '0', 10);
      const conversationsTotal = parseInt(convCount.rows[0]?.count || '0', 10);

      return {
        pages, files, conversations,
        total: pages.length + files.length + conversations.length,
        pagesTotal, filesTotal, conversationsTotal
      };
    } catch (err) {
      logger.warn({ err }, '搜索失败');
      return { pages: [], files: [], conversations: [], total: 0, pagesTotal: 0, filesTotal: 0, conversationsTotal: 0 };
    }
  }

  // Library file
  async getLibraryFile(hash: string): Promise<any> {
    try {
      const pool = getPool();
      const fileResult = await pool.query(
        'SELECT hash, mime, original_name, size, status, ingested_at, tags FROM library_files WHERE hash = $1',
        [hash]
      );

      if (fileResult.rows.length === 0) {
        return null;
      }

      const file = fileResult.rows[0];

      const evidenceResult = await pool.query(
        `SELECT span_id, original_location, span_text, source_type
         FROM evidence_spans
         WHERE source_file_hash = $1
         LIMIT 50`,
        [hash]
      );

      return {
        file: {
          hash: file.hash,
          mime: file.mime,
          originalName: file.original_name,
          size: file.size,
          status: file.status,
          ingestedAt: file.ingested_at,
          tags: file.tags || []
        },
        evidenceSpans: evidenceResult.rows.map((r: any) => ({
          spanId: r.span_id,
          originalLocation: r.original_location,
          spanText: r.span_text,
          sourceType: r.source_type
        })),
        contentUrl: `/api/library-files/${hash}/content`
      };
    } catch (err) {
      logger.warn({ err }, '获取库文件失败');
      return null;
    }
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

  async setDailyBudget(amount: number): Promise<{ success: boolean; dailyBudget: number }> {
    try {
      budgetManager.setDailyBudget(amount);
      const snapshot = budgetManager.getSnapshot();
      return { success: true, dailyBudget: snapshot.dailyBudget };
    } catch (err) {
      logger.error({ err }, '设置日预算失败');
      return { success: false, dailyBudget: 0 };
    }
  }

  async setMonthlyBudget(amount: number): Promise<{ success: boolean; monthlyBudget: number }> {
    try {
      budgetManager.setMonthlyBudget(amount);
      const snapshot = budgetManager.getSnapshot();
      return { success: true, monthlyBudget: snapshot.monthlyBudget };
    } catch (err) {
      logger.error({ err }, '设置月预算失败');
      return { success: false, monthlyBudget: 0 };
    }
  }

  async getRemainingBudget(): Promise<{
    daily: number;
    monthly: number;
    dailyLimit: number;
    monthlyLimit: number;
    tripped: boolean;
  }> {
    const snapshot = budgetManager.getSnapshot();
    return {
      daily: snapshot.remaining.daily,
      monthly: snapshot.remaining.monthly,
      dailyLimit: snapshot.dailyBudget,
      monthlyLimit: snapshot.monthlyBudget,
      tripped: snapshot.tripped
    };
  }

  async getBudgetAlerts(): Promise<{ items: any[]; total: number }> {
    const alerts = budgetManager.getAlerts();
    return { items: alerts, total: alerts.length };
  }

  /**
   * 图谱焦点模式：获取节点的 N 度邻居
   */
  async getNodeNeighbors(slug: string, degrees: number = 2): Promise<{
    nodes: Array<{ slug: string; title: string; type: string; degree: number }>;
    edges: Array<{ source: string; target: string; relation: string; weight: number }>;
  }> {
    const pool = getPool();
    const degreeLimit = Math.min(Math.max(degrees, 1), 5);

    const nodeResult = await pool.query(
      `WITH RECURSIVE neighbors AS (
        SELECT target_slug AS slug, 1 AS degree
        FROM links
        WHERE source_slug = $1 AND NOT orphaned
        UNION
        SELECT l.target_slug, n.degree + 1
        FROM links l
        JOIN neighbors n ON l.source_slug = n.slug
        WHERE n.degree < $2 AND NOT l.orphaned
          AND l.target_slug NOT IN (SELECT slug FROM neighbors)
      )
      SELECT DISTINCT n.slug, n.degree, p.title, p.type
      FROM neighbors n
      LEFT JOIN pages p ON p.slug = n.slug
      UNION
      SELECT $1::varchar AS slug, 0 AS degree, p.title, p.type
      FROM pages p WHERE p.slug = $1`,
      [slug, degreeLimit]
    );

    const edgeResult = await pool.query(
      `SELECT source_slug, target_slug, relation, weight
       FROM links
       WHERE source_slug IN (
         SELECT target_slug FROM links WHERE source_slug = $1 AND NOT orphaned
       ) OR source_slug = $1
       AND NOT orphaned`,
      [slug]
    );

    return {
      nodes: nodeResult.rows.map((r: any) => ({
        slug: r.slug,
        title: r.title || r.slug,
        type: r.type || 'concept',
        degree: r.degree
      })),
      edges: edgeResult.rows.map((r: any) => ({
        source: r.source_slug,
        target: r.target_slug,
        relation: r.relation,
        weight: r.weight
      }))
    };
  }

  /**
   * 图谱路径高亮：查找两个节点之间的最短路径
   */
  async findShortestPaths(
    sourceSlug: string,
    targetSlug: string,
    maxPaths: number = 3,
    maxLength: number = 6
  ): Promise<Array<{
    nodes: string[];
    edges: Array<{ source: string; target: string; relation: string }>;
    length: number;
  }>> {
    const pool = getPool();

    const result = await pool.query(
      `WITH RECURSIVE paths AS (
        SELECT
          ARRAY[source_slug] AS node_path,
          ARRAY[source_slug || ':' || target_slug] AS edge_path,
          target_slug AS last_node,
          1 AS depth
        FROM links
        WHERE source_slug = $1 AND NOT orphaned
        UNION ALL
        SELECT
          p.node_path || l.target_slug,
          p.edge_path || (l.source_slug || ':' || l.target_slug),
          l.target_slug,
          p.depth + 1
        FROM paths p
        JOIN links l ON l.source_slug = p.last_node
        WHERE p.depth < $3
          AND l.target_slug <> ALL(p.node_path)
          AND NOT l.orphaned
      )
      SELECT node_path, edge_path, depth
      FROM paths
      WHERE last_node = $2
      ORDER BY depth ASC
      LIMIT $4`,
      [sourceSlug, targetSlug, maxLength, maxPaths]
    );

    if (result.rows.length === 0) {
      return [];
    }

    // 收集所有需要查询的边，批量查询避免 N+1
    const edgePairs: [string, string][] = [];
    const edgeIndexMap = new Map<string, number>(); // key: "s->t", value: edge index in batch
    for (const row of result.rows) {
      const nodePath: string[] = row.node_path;
      for (let i = 0; i < nodePath.length - 1; i++) {
        const key = `${nodePath[i]}->${nodePath[i + 1]}`;
        if (!edgeIndexMap.has(key)) {
          edgeIndexMap.set(key, edgePairs.length);
          edgePairs.push([nodePath[i], nodePath[i + 1]]);
        }
      }
    }

    // 批量查询所有边
    let edgeRelationMap = new Map<string, string>();
    if (edgePairs.length > 0) {
      const edgeParams = edgePairs.flatMap(([s, t]) => [s, t]);
      const edgePlaceholders = edgePairs.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(', ');
      const edgeRes = await pool.query(
        `SELECT source_slug, target_slug, relation FROM links
         WHERE (source_slug, target_slug) IN (${edgePlaceholders})`,
        edgeParams
      );
      for (const r of edgeRes.rows) {
        edgeRelationMap.set(`${r.source_slug}->${r.target_slug}`, r.relation);
      }
    }

    const paths = [];
    for (const row of result.rows) {
      const nodePath: string[] = row.node_path;
      const edges = [];
      for (let i = 0; i < nodePath.length - 1; i++) {
        const key = `${nodePath[i]}->${nodePath[i + 1]}`;
        edges.push({
          source: nodePath[i],
          target: nodePath[i + 1],
          relation: edgeRelationMap.get(key) || 'related'
        });
      }
      paths.push({
        nodes: nodePath,
        edges,
        length: row.depth
      });
    }

    return paths;
  }

  /**
   * 反向链接预览：查找引用当前实体的所有页面及上下文
   */
  async getBacklinks(
    slug: string,
    contextChars: number = 80
  ): Promise<Array<{
    sourceSlug: string;
    sourceTitle: string;
    context: string;
    relationType?: string;
  }>> {
    const pool = getPool();

    const [linkResult, aliasResult] = await Promise.all([
      pool.query(
        `SELECT l.source_slug, l.relation, p.title
         FROM links l
         LEFT JOIN pages p ON p.slug = l.source_slug
         WHERE l.target_slug = $1 AND NOT l.orphaned
         ORDER BY l.created_at DESC`,
        [slug]
      ),
      pool.query(
        `SELECT slug FROM pages WHERE slug = $1`,
        [slug]
      )
    ]);

    const sourceSlugs = linkResult.rows.map((r: any) => r.source_slug);
    if (sourceSlugs.length === 0) return [];

    const contentResult = await pool.query(
      `SELECT slug, LEFT(content_md, 300) as content_md FROM pages WHERE slug = ANY($1)`,
      [sourceSlugs]
    );
    const contentMap = new Map<string, string>();
    for (const r of contentResult.rows) {
      contentMap.set(r.slug, r.content_md || '');
    }

    return linkResult.rows.map((r: any) => {
      const content = contentMap.get(r.source_slug) || '';
      const wikilinkPattern = new RegExp(
        `\\[\\[([^\\]]*${slug.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}[^\\]]*)\\]\\]`,
        'i'
      );
      const match = content.match(wikilinkPattern);
      let context = '';
      if (match && match.index !== undefined) {
        const start = Math.max(0, match.index - contextChars);
        const end = Math.min(content.length, match.index + match[0].length + contextChars);
        context = content.slice(start, end).replace(/\n+/g, ' ').trim();
      } else {
        context = content.slice(0, contextChars * 2).replace(/\n+/g, ' ').trim();
      }
      return {
        sourceSlug: r.source_slug,
        sourceTitle: r.title || r.source_slug,
        context: context.length > contextChars * 2 + 50 ? context.slice(0, contextChars * 2 + 50) + '...' : context,
        relationType: r.relation
      };
    });
  }

  /**
   * 实体搜索自动补全：匹配规范名称、别名、拼音首字母
   */
  async searchEntities(
    query: string,
    limit: number = 10
  ): Promise<Array<{
    slug: string;
    title: string;
    aliases: string[];
    namespace: string;
    matchType: 'canonical' | 'alias' | 'fuzzy';
  }>> {
    const pool = getPool();
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];

    const [exactResult, aliasResult, fuzzyResult] = await Promise.all([
      pool.query(
        `SELECT slug, title, type, aliases, path
         FROM pages
         WHERE LOWER(title) = $1 OR LOWER(slug) = $1
         ORDER BY title ASC
         LIMIT $2`,
        [normalized, limit]
      ),
      pool.query(
        `SELECT slug, title, type, aliases, path
         FROM pages
         WHERE EXISTS (
           SELECT 1 FROM unnest(aliases) AS a
           WHERE LOWER(a) = $1
         )
         AND LOWER(title) <> $1
         ORDER BY title ASC
         LIMIT $2`,
        [normalized, limit]
      ),
      pool.query(
        `SELECT slug, title, type, aliases, path
         FROM pages
         WHERE title ILIKE $1 OR slug ILIKE $1
           OR EXISTS (
             SELECT 1 FROM unnest(aliases) AS a
             WHERE a ILIKE $1
           )
         ORDER BY title ASC
         LIMIT $2`,
        [`%${normalized}%`, limit]
      )
    ]);

    const seen = new Set<string>();
    const results: Array<{
      slug: string; title: string; aliases: string[];
      namespace: string; matchType: 'canonical' | 'alias' | 'fuzzy';
    }> = [];

    const addRow = (r: any, matchType: 'canonical' | 'alias' | 'fuzzy') => {
      if (seen.has(r.slug)) return;
      seen.add(r.slug);
      const pathParts = (r.path || '').split('/');
      const namespace = pathParts.length > 1 ? pathParts[pathParts.length - 2] : 'wiki';
      results.push({
        slug: r.slug,
        title: r.title || r.slug,
        aliases: r.aliases || [],
        namespace,
        matchType
      });
    };

    exactResult.rows.forEach((r: any) => addRow(r, 'canonical'));
    aliasResult.rows.forEach((r: any) => addRow(r, 'alias'));
    fuzzyResult.rows.forEach((r: any) => addRow(r, 'fuzzy'));

    return results.slice(0, limit);
  }

  /**
   * 获取实体预览数据（用于悬浮卡片）
   */
  async getEntityPreview(slug: string): Promise<{
    title: string;
    summary: string;
    lastModified: string;
    quality?: string;
    type: string;
    aliases: string[];
    backlinkCount: number;
    hasOpenThreads: boolean;
  }> {
    const pool = getPool();

    const [pageResult, backlinkResult] = await Promise.all([
      pool.query(
        `SELECT title, type, aliases, content_md, raw_md, updated_at, parsed_json
         FROM pages WHERE slug = $1`,
        [slug]
      ),
      pool.query(
        `SELECT COUNT(*) as cnt FROM links WHERE target_slug = $1 AND NOT orphaned`,
        [slug]
      )
    ]);

    if (pageResult.rows.length === 0) {
      throw new Error(`实体 ${slug} 不存在`);
    }

    const row = pageResult.rows[0];

    let summary = '';
    const content = row.content_md || '';
    const assessmentMatch = content.match(/^##\s+Assessment\s*\n([\s\S]*?)(?=\n##\s|$)/i);
    if (assessmentMatch) {
      summary = assessmentMatch[1].replace(/\n/g, ' ').trim();
      if (summary.length > 200) {
        const lastPeriod = summary.lastIndexOf('.', 200);
        const lastSpace = summary.lastIndexOf(' ', 200);
        const cutoff = lastPeriod > 100 ? lastPeriod + 1 : (lastSpace > 100 ? lastSpace : 200);
        summary = summary.slice(0, cutoff) + '...';
      }
    }

    const parsedJson = typeof row.parsed_json === 'string' ? JSON.parse(row.parsed_json) : row.parsed_json;
    const openThreads = parsedJson?.sections?.['Open Threads'] || '';
    const hasOpenThreads = openThreads.trim().length > 0;

    return {
      title: row.title || slug,
      summary,
      lastModified: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
      quality: parsedJson?.frontmatter?.quality,
      type: row.type || 'concept',
      aliases: row.aliases || [],
      backlinkCount: parseInt(backlinkResult.rows[0]?.cnt || '0'),
      hasOpenThreads
    };
  }

  /**
   * 摄入文件（拖拽上传）
   */
  async ingestFile(originalName: string, mime: string, content: Buffer, sha256: string): Promise<{
    libraryUrl: string;
    alreadyExists: boolean;
    extractionQueued: boolean;
  }> {
    const pool = getPool();

    const existingResult = await pool.query(
      'SELECT hash FROM library_files WHERE hash = $1',
      [sha256]
    );

    if (existingResult.rows.length > 0) {
      return {
        libraryUrl: `library://${sha256}`,
        alreadyExists: true,
        extractionQueued: false
      };
    }

    storage.saveLibraryFile(sha256, content);

    await pool.query(
      `INSERT INTO library_files (hash, mime, original_name, size, status, ingested_at)
       VALUES ($1, $2, $3, $4, 'new', NOW())`,
      [sha256, mime, originalName, content.length]
    );

    return {
      libraryUrl: `library://${sha256}`,
      alreadyExists: false,
      extractionQueued: true
    };
  }

  /**
   * 模板片段相关 API
   */
  async listSnippets(category?: string): Promise<Array<{
    name: string;
    trigger: string;
    description: string;
    category: string;
  }>> {
    const snippetsPath = join(storage.getSkillsPath(), 'snippets');
    const results: Array<{ name: string; trigger: string; description: string; category: string }> = [];

    if (!existsSync(snippetsPath)) return results;

    const files = await new Promise<string[]>((resolve) => {
      require('fs').readdir(snippetsPath, (err: any, files: string[]) => {
        resolve(err ? [] : files.filter(f => f.endsWith('.md')));
      });
    });

    for (const file of files) {
      try {
        const content = storage.readFile(join(snippetsPath, file));
        const parsed = require('gray-matter')(content);
        const name = file.replace('.md', '');
        if (!category || parsed.data.category === category) {
          results.push({
            name,
            trigger: parsed.data.trigger || name,
            description: parsed.data.description || '',
            category: parsed.data.category || '其他'
          });
        }
      } catch (err) {
        logger.warn({ err, file }, '解析片段 frontmatter 失败');
        continue;
      }
    }

    return results;
  }

  async getSnippet(name: string): Promise<{
    name: string;
    trigger: string;
    description: string;
    category: string;
    content: string;
  }> {
    const snippetsPath = join(storage.getSkillsPath(), 'snippets');
    const filePath = join(snippetsPath, `${name}.md`);

    if (!existsSync(filePath)) {
      throw new Error(`片段 ${name} 不存在`);
    }

    const content = storage.readFile(filePath);
    const parsed = require('gray-matter')(content);

    return {
      name,
      trigger: parsed.data.trigger || name,
      description: parsed.data.description || '',
      category: parsed.data.category || '其他',
      content: parsed.content || ''
    };
  }

  async saveSnippet(name: string, content: string): Promise<void> {
    const snippetsPath = join(storage.getSkillsPath(), 'snippets');
    if (!existsSync(snippetsPath)) {
      require('fs').mkdirSync(snippetsPath, { recursive: true });
    }

    storage.atomicWrite(join(snippetsPath, `${name}.md`), content);
  }

  async deleteSnippet(name: string): Promise<void> {
    const snippetsPath = join(storage.getSkillsPath(), 'snippets');
    const filePath = join(snippetsPath, `${name}.md`);

    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
  }

  /**
   * 获取高级搜索语法补全候选
   */
  async getSearchCompletions(prefix: string): Promise<{
    types: string[];
    namespaces: string[];
    tags: string[];
    contexts: string[];
    qualities: string[];
  }> {
    const pool = getPool();
    const [typeResult, nsResult, tagResult, ctxResult] = await Promise.all([
      pool.query(
        `SELECT type, COUNT(*) as cnt FROM pages GROUP BY type ORDER BY cnt DESC LIMIT 20`
      ),
      pool.query(
        `SELECT DISTINCT SPLIT_PART(path, '/', 1) AS ns FROM pages WHERE path LIKE '%/%' LIMIT 20`
      ),
      pool.query(
        `SELECT DISTINCT unnest(tags) AS tag FROM pages WHERE tags <> '{}' ORDER BY tag LIMIT 50`
      ),
      pool.query(
        `SELECT DISTINCT unnest(contexts) AS ctx FROM pages WHERE contexts <> '{}' ORDER BY ctx LIMIT 50`
      )
    ]);

    return {
      types: typeResult.rows.map((r: any) => r.type).filter(Boolean),
      namespaces: nsResult.rows.map((r: any) => r.ns).filter(Boolean),
      tags: tagResult.rows.map((r: any) => r.tag).filter(Boolean),
      contexts: ctxResult.rows.map((r: any) => r.ctx).filter(Boolean),
      qualities: ['A', 'B', 'C']
    };
  }

  /**
   * 获取语法帮助
   */
  getSyntaxDocumentation() {
    return getSyntaxHelp();
  }

  /**
   * 嵌入数据代理 API
   */
  async embedProxy(type: string, params: Record<string, string>, refresh: boolean = false): Promise<{
    data: any;
    cached: boolean;
    cachedAt?: string;
    expiresAt: string;
  }> {
    const pool = getPool();
    const paramsHash = createHash('sha256').update(JSON.stringify(params)).digest('hex');
    const cacheKey = `${type}:${paramsHash}`;

    const cacheDuration = {
      stock: 5 * 60 * 1000,
      weather: 30 * 60 * 1000,
      rss: 60 * 60 * 1000,
      crypto: 5 * 60 * 1000,
      json: 5 * 60 * 1000
    };

    if (!refresh) {
      const cacheResult = await pool.query(
        'SELECT data, cached_at FROM embed_cache WHERE key = $1 AND expires_at > NOW()',
        [cacheKey]
      );

      if (cacheResult.rows.length > 0) {
        return {
          data: JSON.parse(cacheResult.rows[0].data),
          cached: true,
          cachedAt: cacheResult.rows[0].cached_at?.toISOString(),
          expiresAt: new Date(Date.now() + (cacheDuration[type as keyof typeof cacheDuration] || 300000)).toISOString()
        };
      }
    }

    let data: any = null;

    try {
      switch (type) {
        case 'stock': {
          const symbol = params.symbol;
          const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;
          const response = await fetch(url, { timeout: 5000 });
          const json = await response.json();
          const meta = json.chart?.result?.[0]?.meta || {};
          data = {
            symbol,
            price: meta.regularMarketPrice,
            change: meta.regularMarketChange,
            changePercent: meta.regularMarketChangePercent,
            currency: meta.currency
          };
          break;
        }
        case 'weather': {
          const city = params.city;
          const apiKey = process.env.OPENWEATHERMAP_API_KEY;
          if (!apiKey) {
            data = { error: 'OpenWeatherMap API key not configured' };
            break;
          }
          const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${apiKey}&units=${params.units || 'metric'}`;
          const response = await fetch(url, { timeout: 5000 });
          const json = await response.json();
          data = {
            city: json.name,
            temp: json.main?.temp,
            feelsLike: json.main?.feels_like,
            humidity: json.main?.humidity,
            description: json.weather?.[0]?.description,
            icon: json.weather?.[0]?.icon,
            windSpeed: json.wind?.speed
          };
          break;
        }
        case 'rss': {
          const url = params.url;
          const response = await fetch(url, { timeout: 5000 });
          const xml = await response.text();
          const parser = new (require('xml2js').Parser)({ trim: true, explicitArray: false });
          const json = await new Promise((resolve) => parser.parseString(xml, (_, result) => resolve(result)));
          const items = json.rss?.channel?.item || [];
          const limit = parseInt(params.limit || '5');
          data = {
            title: json.rss?.channel?.title,
            items: Array.isArray(items) ? items.slice(0, limit).map((item: any) => ({
              title: item.title,
              link: item.link,
              pubDate: item.pubDate
            })) : []
          };
          break;
        }
        case 'crypto': {
          const symbol = params.symbol;
          const url = `https://api.coingecko.com/api/v3/simple/price?ids=${symbol}&vs_currencies=usd`;
          const response = await fetch(url, { timeout: 5000 });
          const json = await response.json();
          data = {
            symbol,
            price: json[symbol]?.usd
          };
          break;
        }
        case 'json': {
          const url = params.url;
          const response = await fetch(url, { timeout: 5000 });
          data = await response.json();
          break;
        }
        default:
          data = { error: `Unsupported embed type: ${type}` };
      }
    } catch (err) {
      logger.warn({ err, type, params }, '嵌入数据获取失败');
      data = { error: 'Failed to fetch data' };
    }

    const expiresAt = new Date(Date.now() + (cacheDuration[type as keyof typeof cacheDuration] || 300000));

    await pool.query(
      `INSERT INTO embed_cache (key, type, params, data, cached_at, expires_at)
       VALUES ($1, $2, $3, $4, NOW(), $5)
       ON CONFLICT (key) DO UPDATE SET
         data = EXCLUDED.data,
         cached_at = NOW(),
         expires_at = EXCLUDED.expires_at`,
      [cacheKey, type, JSON.stringify(params), JSON.stringify(data), expiresAt]
    );

    return {
      data,
      cached: false,
      cachedAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString()
    };
  }
}

/**
 * 将 diff payload 应用到 Markdown 内容上。
 * 支持三种操作模式：
 * 1. 替换正文（payload.content 存在时）
 * 2. 更新 frontmatter 字段（payload.frontmatter 存在时）
 * 3. 追加/更新章节（payload.sections 存在时）
 */
function applyContentChange(currentContent: string, payload: any, _type?: string): string {
  let result = currentContent;

  // 模式 1：替换整个正文
  if (payload.content && typeof payload.content === 'string') {
    const fmMatch = result.match(/^---\n([\s\S]*?)\n---\n*/);
    const frontmatter = fmMatch ? fmMatch[0] : '';
    result = frontmatter + payload.content;
  }

  // 模式 2：更新 frontmatter 字段
  if (payload.frontmatter && typeof payload.frontmatter === 'object') {
    const fmMatch = result.match(/^---\n([\s\S]*?)\n---\n*/);
    if (fmMatch) {
      let fm = fmMatch[1];
      for (const [key, value] of Object.entries(payload.frontmatter)) {
        const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const lineRegex = new RegExp(`^${escapedKey}:.*$`, 'm');
        const newLine = `${key}: ${value}`;
        if (lineRegex.test(fm)) {
          fm = fm.replace(lineRegex, newLine);
        } else {
          fm += `\n${newLine}`;
        }
      }
      result = `---\n${fm}\n---\n${result.replace(/^---\n[\s\S]*?\n---\n*/, '')}`;
    }
  }

  // 模式 3：追加/更新 Markdown 章节
  if (payload.sections && typeof payload.sections === 'object') {
    for (const [heading, sectionContent] of Object.entries(payload.sections)) {
      const sectionRegex = new RegExp(
        `(^#{1,4}\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n)([\\s\\S]*?)(?=\\n#{1,4}\\s|$)`,
        'm'
      );
      if (sectionRegex.test(result)) {
        result = result.replace(sectionRegex, `$1${sectionContent}\n`);
      } else {
        result += `\n## ${heading}\n${sectionContent}\n`;
      }
    }
  }

  return result;
}

function generateConversationId(): string {
  return `conv-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * CJK 感知的文本分词，用于 Jaccard 相似度计算。
 * 中文使用字符级 bigram，英文使用空格分词。
 */
function tokenizeForSimilarity(text: string): Set<string> {
  const lower = text.toLowerCase();
  const hasCJK = /[\u4e00-\u9fff\u3400-\u4dbf]/.test(lower);

  if (hasCJK) {
    const tokens = new Set<string>();
    const chars = lower.replace(/[^\u4e00-\u9fff\u3400-\u4dbf\p{L}\p{N}]+/gu, '').split('');
    for (let i = 0; i < chars.length - 1; i++) {
      tokens.add(chars[i] + chars[i + 1]);
    }
    for (const ch of chars) {
      tokens.add(ch);
    }
    return tokens;
  }

  return new Set(
    lower
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .split(' ')
      .filter((t) => t.length > 0)
  );
}

export const brainAPI = new BrainAPI();
