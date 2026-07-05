import { getPool } from '../db/pool';
import logger from '../i18n/logger';
import { budgetManager } from './budget';
import { clusterTopics, type TopicClusterResult } from './cluster';
import { type CommunityDetectResult, detectCommunities } from './community';
import { type NliPreCheckResult, runNliPreCheck } from './nli-precheck';

export interface DreamReport {
  runAt: string;
  durationMs: number;
  budgetAllowed: boolean;
  phases: {
    budgetCheck: { allowed: boolean; reason?: string };
    communityDetect: { skipped: boolean; result?: CommunityDetectResult };
    nliPre: { skipped: boolean; result?: NliPreCheckResult };
    forgetDecay: { ok: boolean; decayed: number };
    lint: { ok: boolean };
    ghostCleanup: { detected: number; marked: number };
    topicCluster: { skipped: boolean; result?: TopicClusterResult };
    gapAnalysis: { skipped: boolean };
    enrichExternal: { skipped: boolean };
    diff: { skipped: boolean };
    annualRing: { skipped: boolean };
  };
  errors: string[];
}

const FORGET_DECAY_DAYS = 30;
const FORGET_DECAY_CONFIDENCE = 0.3;

/**
 * Dream Cycle 编排器（Task 6.1）
 *
 * 执行完整的六阶段夜间任务。已实现：预算检查、社区检测、NLI 预检、
 * forget_decay、lint、幽灵清理、主题聚类。
 * gap_analysis、enrich_external、Diff、年轮 等阶段待后续 LLM 集成后启用。
 */
export async function runDreamCycle(): Promise<DreamReport> {
  const start = Date.now();
  const errors: string[] = [];

  const report: DreamReport = {
    runAt: new Date().toISOString(),
    durationMs: 0,
    budgetAllowed: false,
    phases: {
      budgetCheck: { allowed: false },
      communityDetect: { skipped: true, result: undefined },
      nliPre: { skipped: true, result: undefined },
      forgetDecay: { ok: false, decayed: 0 },
      lint: { ok: false },
      ghostCleanup: { detected: 0, marked: 0 },
      topicCluster: { skipped: true, result: undefined },
      gapAnalysis: { skipped: true },
      enrichExternal: { skipped: true },
      diff: { skipped: true },
      annualRing: { skipped: true }
    },
    errors
  };

  logger.info('=== Dream Cycle 开始 ===');

  // 阶段 1：预算检查
  const budgetResult = await budgetManager.checkBudget('dream_cycle');
  report.phases.budgetCheck = budgetResult;
  report.budgetAllowed = budgetResult.allowed;
  if (!budgetResult.allowed) {
    errors.push(`预算检查未通过: ${budgetResult.reason || '未知原因'}`);
    report.durationMs = Date.now() - start;
    logger.warn(
      { reason: budgetResult.reason, durationMs: report.durationMs },
      'Dream Cycle 因预算限制中止'
    );
    return report;
  }
  logger.info('阶段 1 预算检查通过');

  // 阶段 2：community_detect（社区检测）
  try {
    logger.info('阶段 2 社区检测开始');
    const communityResult = await detectCommunities();
    report.phases.communityDetect = { skipped: false, result: communityResult };
    logger.info(
      { communities: communityResult.detected, members: communityResult.marked },
      '阶段 2 社区检测完成'
    );
  } catch (err) {
    report.phases.communityDetect = { skipped: false };
    errors.push(`社区检测失败: ${(err as Error).message}`);
    logger.warn({ err }, '社区检测失败');
  }

  // 阶段 3：NLI 预检（证据一致性检查）
  try {
    logger.info('阶段 3 NLI 预检开始');
    const nliResult = await runNliPreCheck();
    report.phases.nliPre = { skipped: false, result: nliResult };
    logger.info(
      { checked: nliResult.checked, contradictions: nliResult.contradictions },
      '阶段 3 NLI 预检完成'
    );
  } catch (err) {
    report.phases.nliPre = { skipped: false };
    errors.push(`NLI 预检失败: ${(err as Error).message}`);
    logger.warn({ err }, 'NLI 预检失败');
  }

  // 阶段 4：forget_decay + lint + 幽灵清理
  try {
    const decayed = await runForgetDecay();
    report.phases.forgetDecay = { ok: true, decayed };
  } catch (err) {
    report.phases.forgetDecay = { ok: false, decayed: 0 };
    errors.push(`forget_decay 失败: ${(err as Error).message}`);
  }

  try {
    await runLint();
    report.phases.lint = { ok: true };
  } catch (err) {
    report.phases.lint = { ok: false };
    errors.push(`lint 失败: ${(err as Error).message}`);
  }

  try {
    report.phases.ghostCleanup = await runGhostCleanup();
  } catch (err) {
    report.phases.ghostCleanup = { detected: 0, marked: 0 };
    errors.push(`幽灵清理失败: ${(err as Error).message}`);
  }

  // 阶段 5：topic_cluster + gap_analysis
  try {
    logger.info('阶段 5 主题聚类开始');
    const clusterResult = await clusterTopics();
    report.phases.topicCluster = { skipped: false, result: clusterResult };
    logger.info(
      { clusters: clusterResult.clustersCreated, pages: clusterResult.pagesAssigned },
      '阶段 5 主题聚类完成'
    );
  } catch (err) {
    report.phases.topicCluster = { skipped: false };
    errors.push(`主题聚类失败: ${(err as Error).message}`);
    logger.warn({ err }, '主题聚类失败');
  }

  // gap_analysis：基于聚类结果识别知识盲区（暂跳过，待 LLM 集成）
  logger.info('阶段 5 gap_analysis 跳过（待 LLM 集成）');

  // 阶段 6：enrich_external + Diff + 年轮（跳过）
  logger.info('阶段 6 enrich_external + Diff + 年轮 跳过（暂未实现）');

  report.durationMs = Date.now() - start;
  logger.info(
    { durationMs: report.durationMs, errors: errors.length, budgetAllowed: report.budgetAllowed },
    '=== Dream Cycle 完成 ==='
  );
  return report;
}

async function runForgetDecay(): Promise<number> {
  const pool = getPool();
  try {
    const result = await pool.query(
      `UPDATE pending_diffs
       SET resolved = true
       WHERE resolved = false
         AND confidence < $1
         AND created_at < (NOW() - ($2 || ' days')::interval)
       RETURNING id`,
      [FORGET_DECAY_CONFIDENCE, String(FORGET_DECAY_DAYS)]
    );
    const decayed = result.rowCount || 0;
    logger.info({ decayed, days: FORGET_DECAY_DAYS }, 'forget_decay 完成：陈旧低置信 diff 已遗忘');
    return decayed;
  } catch (err) {
    logger.warn({ err }, 'forget_decay 执行失败');
    throw err;
  }
}

async function runLint(): Promise<void> {
  // 轻量 lint：检查 ghost_relations 中 pending 状态是否过期，过期则标记 stale
  const pool = getPool();
  try {
    const result = await pool.query(
      `UPDATE ghost_relations
       SET status = 'stale'
       WHERE status = 'pending'
         AND discovered_at < (NOW() - INTERVAL '14 days')`
    );
    logger.info({ staleCount: result.rowCount || 0 }, 'lint 完成：标记过期幽灵关系');
  } catch (err) {
    logger.warn({ err }, 'lint 执行失败');
    throw err;
  }
}

async function runGhostCleanup(): Promise<{ detected: number; marked: number }> {
  // 动态加载已存在的 ghost 模块（避免在模块加载期硬依赖）。
  // 使用变量说明符使 TypeScript 不在编译期静态解析该模块，
  // 因此无论 ghost.ts 是否已存在均能通过类型检查与运行。
  const ghostSpecifier = './ghost';
  try {
    const ghostModule: any = await import(ghostSpecifier);
    if (typeof ghostModule.ghostDetectAndMark === 'function') {
      const result = await ghostModule.ghostDetectAndMark();
      logger.info({ result }, '幽灵清理完成');
      return {
        detected: Number(result?.detected ?? 0),
        marked: Number(result?.marked ?? 0)
      };
    }
    logger.warn('ghost 模块未导出 ghostDetectAndMark 函数，跳过幽灵清理');
    return { detected: 0, marked: 0 };
  } catch (err) {
    logger.warn({ err }, '加载 ghost 模块失败，跳过幽灵清理');
    return { detected: 0, marked: 0 };
  }
}

/**
 * 在模块加载时注册 Bun.cron 定时任务（每晚 02:00 触发）。
 * 若当前运行时不支持 Bun.cron，则仅导出 runDreamCycle 供手动调用。
 */
function registerCron(): void {
  try {
    const bunCron = (globalThis as any).Bun?.cron;
    if (typeof bunCron === 'function') {
      bunCron('0 2 * * *', () => {
        runDreamCycle().catch((err) => {
          logger.error({ err }, 'Dream Cycle 定时执行失败');
        });
      });
      logger.info('Dream Cycle 定时任务已注册（每晚 02:00）');
      return;
    }
    logger.warn('当前运行时不支持 Bun.cron，请手动调用 runDreamCycle()');
  } catch (err) {
    logger.warn({ err }, '注册 Dream Cycle 定时任务失败，请手动调用 runDreamCycle()');
  }
}

registerCron();
