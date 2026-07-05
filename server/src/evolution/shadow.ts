import type { LLMMessage } from '@shared/index';
import { randomUUID } from 'node:crypto';
import { getPool } from '../db/pool';
import logger from '../i18n/logger';
import { llmRouter } from '../llm/router';

export interface ShadowEvalResult {
  passed: boolean;
  accuracy: number;
  reproductionRate: number;
  newErrors: number;
  errors: string[];
}

interface BenchmarkRow {
  id: number;
  type: string;
  slug: string | null;
  source_text: string;
  expected_output: string;
  git_commit: string | null;
}

const ACCURACY_THRESHOLD = 0.7;
const FLUCTUATION_THRESHOLD = 0.15;
const REPRODUCTION_THRESHOLD = 0.6;
const BASELINE_SETTINGS_KEY = 'shadow_eval_last_accuracy';

const GRADER_PROMPT = `你是语义等价判断器。判断“模型输出”与“期望输出”在核心事实上是否语义一致。
仅回复 "yes" 或 "no"，不要附加任何解释。`;

const QA_PROMPT = `你是知识库问答器。请基于以下输入文本给出准确、简洁的中文回答。直接回答，不要复述问题。`;

/**
 * 影子评估 + 熔断（Task 6.5）
 *
 * 沙箱执行 shadow_benchmarks 全部正例/反例，计算正确率、复现率与新增错误数。
 * 当指标波动超过阈值时写入 eval_anomaly_flags、中止后续任务并告警。
 */
export async function runShadowEval(): Promise<ShadowEvalResult> {
  const pool = getPool();
  let benchmarks: BenchmarkRow[] = [];

  try {
    const result = await pool.query(
      `SELECT id, type, slug, source_text, expected_output, git_commit
       FROM shadow_benchmarks
       ORDER BY id ASC`
    );
    benchmarks = result.rows.map((r: any) => ({
      id: r.id,
      type: r.type,
      slug: r.slug,
      source_text: r.source_text || '',
      expected_output: r.expected_output || '',
      git_commit: r.git_commit
    }));
  } catch (err) {
    logger.error({ err }, '加载 shadow_benchmarks 失败');
    return {
      passed: false,
      accuracy: 0,
      reproductionRate: 0,
      newErrors: 0,
      errors: ['加载基准用例失败']
    };
  }

  if (benchmarks.length === 0) {
    logger.info('无 shadow_benchmarks 用例，跳过评估');
    return { passed: true, accuracy: 1, reproductionRate: 1, newErrors: 0, errors: [] };
  }

  let correct = 0;
  let reproduced = 0;
  let correctionsTotal = 0;
  let newErrors = 0;
  const errors: string[] = [];

  for (const bench of benchmarks) {
    const label = bench.slug || `bench#${bench.id}`;
    const isCorrection = bench.type === 'correction' || bench.type === 'negative';
    if (isCorrection) correctionsTotal++;

    try {
      const output = await runCase(bench.source_text);
      const matched = await gradeOutput(output, bench.expected_output);

      if (matched) {
        correct++;
        if (isCorrection) reproduced++;
      } else {
        newErrors++;
        errors.push(`${label}: ${isCorrection ? '反例未通过' : '正例未通过'}`);
      }
    } catch (err) {
      newErrors++;
      errors.push(`${label}: 执行异常 ${(err as Error).message}`);
    }
  }

  const total = benchmarks.length;
  const accuracy = correct / total;
  const reproductionRate = correctionsTotal > 0 ? reproduced / correctionsTotal : 1;

  logger.info(
    { total, correct, accuracy, reproduced, reproductionRate, newErrors },
    '影子评估完成'
  );

  const previousAccuracy = await loadBaselineAccuracy(pool);
  const anomaly = detectAnomaly(accuracy, reproductionRate, newErrors, total, previousAccuracy);

  if (anomaly) {
    await persistAnomaly(pool, anomaly);
    logger.error(
      { anomaly, accuracy, reproductionRate, newErrors },
      '影子评估指标波动超阈值，已写入异常标记并中止'
    );
    return {
      passed: false,
      accuracy,
      reproductionRate,
      newErrors,
      errors: [...errors, `异常: ${anomaly.message}`]
    };
  }

  await saveBaselineAccuracy(pool, accuracy);
  return { passed: true, accuracy, reproductionRate, newErrors, errors };
}

async function runCase(sourceText: string): Promise<string> {
  const llmMessages: LLMMessage[] = [
    { role: 'system', content: QA_PROMPT },
    { role: 'user', content: sourceText }
  ];

  try {
    const adapter = llmRouter.route('qa_gen');
    const response = await adapter.chat({
      messages: llmMessages,
      temperature: 0.1,
      maxTokens: 400
    });
    return response.content.trim();
  } catch (err) {
    logger.warn({ err }, '影子评估 QA 调用失败');
    throw err;
  }
}

async function gradeOutput(actual: string, expected: string): Promise<boolean> {
  if (!actual && !expected) return true;
  if (!actual || !expected) return false;

  // LLM 语义判定（失败时降级为词重叠相似度）
  try {
    const adapter = llmRouter.route('contradiction');
    const llmMessages: LLMMessage[] = [
      { role: 'system', content: GRADER_PROMPT },
      {
        role: 'user',
        content: `## 模型输出\n${actual}\n\n## 期望输出\n${expected}`
      }
    ];
    const response = await adapter.chat({
      messages: llmMessages,
      temperature: 0,
      maxTokens: 8
    });
    const verdict = response.content.trim().toLowerCase();
    if (verdict === 'yes') return true;
    if (verdict === 'no') return false;
  } catch (err) {
    logger.debug({ err }, 'LLM 评分降级为相似度匹配');
  }

  return jaccardSimilarity(actual, expected) >= 0.5;
}

function jaccardSimilarity(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.size === 0 && tb.size === 0) return 1;
  if (ta.size === 0 || tb.size === 0) return 0;

  let intersection = 0;
  for (const t of ta) {
    if (tb.has(t)) intersection++;
  }
  const union = ta.size + tb.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .split(' ')
      .filter((t) => t.length > 0)
  );
}

function detectAnomaly(
  accuracy: number,
  reproductionRate: number,
  newErrors: number,
  total: number,
  previousAccuracy: number | null
): { metric: string; threshold: number; actual: number; message: string } | null {
  if (accuracy < ACCURACY_THRESHOLD) {
    return {
      metric: 'shadow.accuracy',
      threshold: ACCURACY_THRESHOLD,
      actual: accuracy,
      message: `正确率 ${accuracy.toFixed(3)} 低于阈值 ${ACCURACY_THRESHOLD}`
    };
  }
  if (reproductionRate < REPRODUCTION_THRESHOLD) {
    return {
      metric: 'shadow.reproduction',
      threshold: REPRODUCTION_THRESHOLD,
      actual: reproductionRate,
      message: `复现率 ${reproductionRate.toFixed(3)} 低于阈值 ${REPRODUCTION_THRESHOLD}`
    };
  }
  if (previousAccuracy !== null && previousAccuracy - accuracy > FLUCTUATION_THRESHOLD) {
    return {
      metric: 'shadow.fluctuation',
      threshold: FLUCTUATION_THRESHOLD,
      actual: previousAccuracy - accuracy,
      message: `正确率波动 ${(previousAccuracy - accuracy).toFixed(3)} 超过阈值 ${FLUCTUATION_THRESHOLD}（前次 ${previousAccuracy.toFixed(3)} → 本次 ${accuracy.toFixed(3)}）`
    };
  }
  if (total > 0 && newErrors / total > 0.3) {
    return {
      metric: 'shadow.new_errors',
      threshold: 0.3,
      actual: newErrors / total,
      message: `新增错误占比 ${(newErrors / total).toFixed(3)} 过高（${newErrors}/${total}）`
    };
  }
  return null;
}

async function persistAnomaly(
  pool: ReturnType<typeof getPool>,
  anomaly: { metric: string; threshold: number; actual: number; message: string }
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO eval_anomaly_flags (id, metric, threshold, actual, ts, message)
       VALUES ($1, $2, $3, $4, NOW(), $5)`,
      [randomUUID(), anomaly.metric, anomaly.threshold, anomaly.actual, anomaly.message]
    );
  } catch (err) {
    logger.warn({ err }, '写入 eval_anomaly_flags 失败');
  }
}

async function loadBaselineAccuracy(pool: ReturnType<typeof getPool>): Promise<number | null> {
  try {
    const result = await pool.query(`SELECT value FROM settings WHERE key = $1`, [
      BASELINE_SETTINGS_KEY
    ]);
    if (result.rows.length === 0) return null;
    const value = result.rows[0].value;
    const num = typeof value === 'number' ? value : value?.accuracy;
    return typeof num === 'number' && Number.isFinite(num) ? num : null;
  } catch {
    return null;
  }
}

async function saveBaselineAccuracy(
  pool: ReturnType<typeof getPool>,
  accuracy: number
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO settings (key, value, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [BASELINE_SETTINGS_KEY, JSON.stringify({ accuracy })]
    );
  } catch (err) {
    logger.warn({ err }, '保存评估基线失败');
  }
}
