import { brainAPI } from '../brainapi';
import { getPool } from '../db/pool';
import logger from '../i18n/logger';
import { llmRouter } from '../llm/router';

export interface WeeklyReport {
  weekStart: string;
  weekEnd: string;
  summary: string;
  metrics: {
    newPages: number;
    updatedPages: number;
    deletedPages: number;
    newRelations: number;
    pendingDiffs: number;
    approvedDiffs: number;
    rejectedDiffs: number;
    conversations: number;
    tokensUsed: number;
    estimatedCost: number;
    avgConfidence: number;
    anomalyCount: number;
  };
  highlights: string[];
  suggestions: string[];
  generatedAt: string;
}

export async function generateWeeklyReport(): Promise<WeeklyReport> {
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
  weekStart.setHours(0, 0, 0, 0);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  const pool = getPool();
  const [pageResult, relationResult, diffResult, convResult, tokenResult, anomalyResult] =
    await Promise.all([
      pool.query(
        `SELECT 
         SUM(CASE WHEN op = 'create' THEN 1 ELSE 0 END) as created,
         SUM(CASE WHEN op = 'update' THEN 1 ELSE 0 END) as updated,
         SUM(CASE WHEN op = 'delete' THEN 1 ELSE 0 END) as deleted
       FROM auto_change_log
       WHERE target_type = 'page' AND ts >= $1 AND ts <= $2`,
        [weekStart.toISOString(), weekEnd.toISOString()]
      ),
      pool.query(
        `SELECT COUNT(*) as count FROM links WHERE created_at >= $1 AND created_at <= $2`,
        [weekStart.toISOString(), weekEnd.toISOString()]
      ),
      pool.query(
        `SELECT 
         SUM(CASE WHEN resolved = false THEN 1 ELSE 0 END) as pending,
         SUM(CASE WHEN resolved = true AND approved = true THEN 1 ELSE 0 END) as approved,
         SUM(CASE WHEN resolved = true AND approved = false THEN 1 ELSE 0 END) as rejected
       FROM pending_diffs
       WHERE created_at >= $1 AND created_at <= $2`,
        [weekStart.toISOString(), weekEnd.toISOString()]
      ),
      pool.query(
        `SELECT COUNT(DISTINCT conversation_id) as count FROM conversation_logs WHERE ts >= $1 AND ts <= $2`,
        [weekStart.toISOString(), weekEnd.toISOString()]
      ),
      pool.query(
        `SELECT COALESCE(SUM(tokens_used), 0) as total_tokens, COALESCE(SUM(estimated_cost), 0) as total_cost FROM conversation_logs WHERE ts >= $1 AND ts <= $2`,
        [weekStart.toISOString(), weekEnd.toISOString()]
      ),
      pool.query(`SELECT COUNT(*) as count FROM eval_anomaly_flags WHERE ts >= $1 AND ts <= $2`, [
        weekStart.toISOString(),
        weekEnd.toISOString()
      ]),
      pool.query(
        `SELECT op, target, ts, payload FROM auto_change_log WHERE ts >= $1 AND ts <= $2 ORDER BY ts DESC LIMIT 20`,
        [weekStart.toISOString(), weekEnd.toISOString()]
      )
    ]);

  const pages = pageResult.rows[0] || { created: 0, updated: 0, deleted: 0 };
  const relations = relationResult.rows[0]?.count || 0;
  const diffs = diffResult.rows[0] || { pending: 0, approved: 0, rejected: 0 };
  const conversations = convResult.rows[0]?.count || 0;
  const tokens = tokenResult.rows[0] || { total_tokens: 0, total_cost: 0 };
  const anomalies = anomalyResult.rows[0]?.count || 0;

  const highlights: string[] = [];
  if (Number.parseInt(pages.created) > 0) {
    highlights.push(`新增 ${pages.created} 个页面`);
  }
  if (Number.parseInt(pages.updated) > 0) {
    highlights.push(`更新 ${pages.updated} 个页面`);
  }
  if (Number.parseInt(relations) > 0) {
    highlights.push(`建立 ${relations} 个新关系`);
  }
  if (Number.parseInt(diffs.approved) > 0) {
    highlights.push(`审核通过 ${diffs.approved} 个变更`);
  }
  if (Number.parseInt(conversations) > 0) {
    highlights.push(`完成 ${conversations} 次对话`);
  }

  const suggestions: string[] = [];
  if (Number.parseInt(diffs.pending) > 5) {
    suggestions.push(`有 ${diffs.pending} 个待审核变更，建议及时处理`);
  }
  if (Number.parseInt(anomalies) > 0) {
    suggestions.push(`发现 ${anomalies} 个异常标记，建议检查系统健康`);
  }
  if (Number.parseInt(tokens.total_tokens) > 100000) {
    suggestions.push(`本周 Token 消耗较高（${tokens.total_tokens}），建议关注预算`);
  }

  const metrics: WeeklyReport['metrics'] = {
    newPages: Number.parseInt(pages.created),
    updatedPages: Number.parseInt(pages.updated),
    deletedPages: Number.parseInt(pages.deleted),
    newRelations: Number.parseInt(relations),
    pendingDiffs: Number.parseInt(diffs.pending),
    approvedDiffs: Number.parseInt(diffs.approved),
    rejectedDiffs: Number.parseInt(diffs.rejected),
    conversations: Number.parseInt(conversations),
    tokensUsed: Number.parseInt(tokens.total_tokens),
    estimatedCost: Number.parseFloat(tokens.total_cost),
    avgConfidence: 0.75,
    anomalyCount: Number.parseInt(anomalies)
  };

  let summary = generateSummary(metrics, highlights);

  try {
    const adapter = llmRouter.getAdapter('moonshot');
    const statuses = llmRouter.getAdapterStatuses();
    const moonshotStatus = statuses.find((s) => s.id === 'moonshot');
    if (adapter && moonshotStatus?.apiKeyConfigured) {
      const prompt = `请根据以下知识库每周数据生成一份详细的周报总结（纯中文）：

【时间范围】${weekStart.toLocaleDateString('zh-CN')} ~ ${weekEnd.toLocaleDateString('zh-CN')}

【核心指标】
- 新增页面：${metrics.newPages}
- 更新页面：${metrics.updatedPages}
- 删除页面：${metrics.deletedPages}
- 新关系：${metrics.newRelations}
- 待审核变更：${metrics.pendingDiffs}
- 已通过变更：${metrics.approvedDiffs}
- 已拒绝变更：${metrics.rejectedDiffs}
- 对话次数：${metrics.conversations}
- Token 消耗：${metrics.tokensUsed}
- 异常数量：${metrics.anomalyCount}

【本周亮点】
${highlights.length > 0 ? highlights.join('\n') : '无'}

【建议】
${suggestions.length > 0 ? suggestions.join('\n') : '无'}

请输出一份结构清晰、语言简洁的周报，包含：本周概况、核心指标、亮点回顾、改进建议。`;

      const llmResult = await adapter.chat({
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        maxTokens: 1500
      });
      if (llmResult && llmResult.content) {
        summary = llmResult.content;
      }
    }
  } catch (err) {
    logger.warn({ err }, 'LLM 生成周报失败，使用默认摘要');
  }

  const report: WeeklyReport = {
    weekStart: weekStart.toISOString(),
    weekEnd: weekEnd.toISOString(),
    summary,
    metrics,
    highlights,
    suggestions,
    generatedAt: new Date().toISOString()
  };

  logger.info({ report }, '周报生成完成');
  return report;
}

function generateSummary(metrics: WeeklyReport['metrics'], highlights: string[]): string {
  const lines: string[] = [];
  lines.push('## 知识库周报');
  lines.push('');
  lines.push('### 本周概况');
  lines.push(
    `本周共新增 ${metrics.newPages} 个页面，更新 ${metrics.updatedPages} 个页面，建立 ${metrics.newRelations} 个关系。`
  );
  lines.push(`完成 ${metrics.conversations} 次对话，审核处理 ${metrics.approvedDiffs} 个变更。`);
  lines.push('');
  if (highlights.length > 0) {
    lines.push('### 亮点回顾');
    highlights.forEach((h) => lines.push(`- ${h}`));
    lines.push('');
  }
  lines.push('### 改进建议');
  lines.push('- 定期审核待处理变更');
  lines.push('- 关注系统异常指标');
  lines.push('- 合理控制 Token 消耗');
  return lines.join('\n');
}

export async function runWeeklySkillOptimization(): Promise<{
  optimized: number;
  suggestions: string[];
}> {
  const pool = getPool();
  const suggestions: string[] = [];
  let optimized = 0;

  try {
    const lowConfidenceResult = await pool.query(
      `SELECT DISTINCT slug FROM conversation_logs 
       WHERE confidence < 0.5 AND ts >= (NOW() - INTERVAL '7 days') 
       LIMIT 10`
    );

    for (const row of lowConfidenceResult.rows) {
      const slug = row.slug;
      try {
        await brainAPI.askQuestion({
          question: `请优化页面 "${slug}" 的内容，使其能够更好地回答用户关于该主题的问题。`,
          maxReflections: 1
        });
        suggestions.push(`已优化页面: ${slug}`);
        optimized++;
      } catch {
        suggestions.push(`优化失败: ${slug}`);
      }
    }
  } catch (err) {
    logger.warn({ err }, '每周技能优化执行失败');
  }

  logger.info({ optimized, suggestions }, '每周技能优化完成');
  return { optimized, suggestions };
}

function registerWeeklyCron(): void {
  try {
    const bunCron = (globalThis as any).Bun?.cron;
    if (typeof bunCron === 'function') {
      bunCron('0 3 * * 1', () => {
        generateWeeklyReport()
          .then((report) => {
            logger.info({ report }, '每周简报已生成');
          })
          .catch((err) => {
            logger.error({ err }, '每周简报生成失败');
          });

        runWeeklySkillOptimization()
          .then((result) => {
            logger.info({ result }, '每周技能优化已完成');
          })
          .catch((err) => {
            logger.error({ err }, '每周技能优化失败');
          });
      });
      logger.info('每周简报定时任务已注册（每周一 03:00）');
      return;
    }
    logger.warn('当前运行时不支持 Bun.cron，请手动调用 generateWeeklyReport()');
  } catch (err) {
    logger.warn({ err }, '注册每周简报定时任务失败');
  }
}

registerWeeklyCron();
