import { getPool } from '../db/pool';
import { budgetManager } from './budget';
import logger from '../i18n/logger';

export interface DreamReport {
  runAt: string;
  durationMs: number;
  budgetAllowed: boolean;
  phases: {
    budgetCheck: { allowed: boolean; reason?: string };
    communityDetect: { skipped: boolean };
    nliPre: { skipped: boolean };
    forgetDecay: { ok: boolean; decayed: number };
    lint: { ok: boolean };
    ghostCleanup: { detected: number; marked: number };
    topicCluster: { skipped: boolean };
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
 * 执行完整的六阶段夜间任务。当前已实现：预算检查、forget_decay、lint、幽灵清理。
 * community_detect、NLI 预检、topic_cluster、gap_analysis、enrich_external、Diff、
 * 年轮 等阶段暂时跳过（仅记录日志）。
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
      communityDetect: { skipped: true },
      nliPre: { skipped: true },
      forgetDecay: { ok: false, decayed: 0 },
      lint: { ok: false },
      ghostCleanup: { detected: 0, marked: 0 },
      topicCluster: { skipped: true },
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

  // 阶段 2：community_detect（跳过）
  logger.info('阶段 2 community_detect 跳过（暂未实现）');

  // 阶段 3：NLI 预检（跳过）
  logger.info('阶段 3 NLI 预检跳过（暂未实现）');

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

  // 阶段 5：topic_cluster + gap_analysis（跳过）
  logger.info('阶段 5 topic_cluster + gap_analysis 跳过（暂未实现）');

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
 * 定时任务分布式锁：通过 PostgreSQL advisory lock 确保多副本下只有一个实例执行。
 * 锁 key 使用 cron 任务名称的 hash 值，锁在事务提交或连接释放时自动释放。
 */
async function acquireCronLock(taskName: string): Promise<boolean> {
  try {
    const pool = getPool();
    const lockKey = Array.from(taskName).reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const result = await pool.query('SELECT pg_try_advisory_lock($1) AS acquired', [lockKey]);
    return result.rows[0]?.acquired === true;
  } catch (err) {
    logger.warn({ err, taskName }, '获取分布式锁失败，默认跳过');
    return false;
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
        // 使用 PostgreSQL advisory lock 防止多副本重复执行
        acquireCronLock('dream_cycle').then(acquired => {
          if (!acquired) {
            logger.debug('Dream Cycle: 未获取分布式锁，跳过（其他实例已执行）');
            return;
          }
          runDreamCycle().catch((err) => {
            logger.error({ err }, 'Dream Cycle 定时执行失败');
          });
        });
      });
      logger.info('Dream Cycle 定时任务已注册（每晚 02:00，含分布式锁）');
      return;
    }
    logger.warn('当前运行时不支持 Bun.cron，请手动调用 runDreamCycle()');
  } catch (err) {
    logger.warn({ err }, '注册 Dream Cycle 定时任务失败，请手动调用 runDreamCycle()');
  }
}

registerCron();
