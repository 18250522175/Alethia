import { randomUUID } from 'node:crypto';
import { getPool } from '../db/pool';
import logger from '../i18n/logger';
import { nliCheck } from '../retrieval/nli';

export interface NliPreCheckResult {
  checked: number;
  contradictions: number;
  flagged: number;
}

const MAX_PAIRS_PER_SLUG = 10;
const CONTRADICTION_THRESHOLD = 0.7;

/**
 * NLI 预检：对同一 slug 下的证据片段进行自然语言推理一致性检查。
 *
 * 检测证据间是否存在矛盾（contradiction），将矛盾对标记为待审核。
 * 这是 Dream Cycle Phase 3 的核心步骤——确保知识库内部一致性。
 *
 * 策略：对每个 slug 下最近的证据片段两两配对，调用 NLI 模型判定关系。
 * 若判定为 contradiction 且置信度超过阈值，则写入 eval_anomaly_flags。
 */
export async function runNliPreCheck(): Promise<NliPreCheckResult> {
  const pool = getPool();

  // 1. 查询有多个证据片段的 slug
  const slugResult = await pool.query(
    `SELECT slug, COUNT(*) as cnt
     FROM evidence_spans
     GROUP BY slug
     HAVING COUNT(*) >= 2
     ORDER BY cnt DESC
     LIMIT 50`
  );

  if (slugResult.rows.length === 0) {
    logger.info('NLI 预检：无多证据页面，跳过');
    return { checked: 0, contradictions: 0, flagged: 0 };
  }

  let totalChecked = 0;
  let totalContradictions = 0;
  let totalFlagged = 0;

  // 2. 对每个 slug 的证据片段进行两两 NLI 检查
  for (const slugRow of slugResult.rows) {
    const slug = slugRow.slug;

    const evidenceResult = await pool.query(
      `SELECT span_id, span_text
       FROM evidence_spans
       WHERE slug = $1
       ORDER BY id DESC
       LIMIT $2`,
      [slug, MAX_PAIRS_PER_SLUG]
    );

    const evidences = evidenceResult.rows as Array<{
      span_id: string;
      span_text: string;
    }>;

    // 两两配对检查
    for (let i = 0; i < evidences.length; i++) {
      for (let j = i + 1; j < evidences.length; j++) {
        const premise = evidences[i].span_text;
        const hypothesis = evidences[j].span_text;

        // 跳过过短的文本（无足够语义信息）
        if (premise.length < 10 || hypothesis.length < 10) continue;

        try {
          const result = await nliCheck(premise, hypothesis);
          totalChecked++;

          if (result.label === 'contradiction' && result.score >= CONTRADICTION_THRESHOLD) {
            totalContradictions++;

            // 写入异常标记
            const flagId = randomUUID();
            const message = `证据矛盾：页面 ${slug} 中证据 [${evidences[i].span_id}] 与 [${evidences[j].span_id}] 存在冲突（置信度 ${(result.score * 100).toFixed(0)}%）`;

            await pool.query(
              `INSERT INTO eval_anomaly_flags (id, metric, threshold, actual, message)
               VALUES ($1, $2, $3, $4, $5)
               ON CONFLICT DO NOTHING`,
              [flagId, 'nli_contradiction', CONTRADICTION_THRESHOLD, result.score, message]
            );

            totalFlagged++;
            logger.warn(
              {
                slug,
                spanA: evidences[i].span_id,
                spanB: evidences[j].span_id,
                score: result.score
              },
              'NLI 预检发现证据矛盾'
            );
          }
        } catch (err) {
          // NLI 检查失败时跳过该对，不中断整体流程
          logger.debug({ err, slug }, 'NLI 检查单对失败，跳过');
        }
      }
    }
  }

  logger.info(
    { checked: totalChecked, contradictions: totalContradictions, flagged: totalFlagged },
    'NLI 预检完成'
  );

  return {
    checked: totalChecked,
    contradictions: totalContradictions,
    flagged: totalFlagged
  };
}
