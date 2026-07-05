/**
 * EvalService · 评估与版本归档服务
 *
 * 职责：返回影子评估报告、触发影子评估、对超过 50 条活跃版本的 slug 归档。
 *
 * 对应原 BrainAPI.getEvalReport / runShadowEval / archiveVersions。
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { getPool } from '../../db/pool';
import logger from '../../i18n/logger';
import { storage } from '../../storage/markdown';

export class EvalService {
  /** 返回评估报告：影子基准、异常标志、汇总指标与趋势。 */
  async getEvalReport(): Promise<{
    benchmarks: any[];
    anomalies: any[];
    summary: any;
    trend: any[];
  }> {
    try {
      const pool = getPool();

      const [benchResult, anomalyResult] = await Promise.all([
        pool.query(
          'SELECT id, type, slug, source_text, expected_output, git_commit FROM shadow_benchmarks ORDER BY id DESC LIMIT 100'
        ),
        pool.query(
          'SELECT id, metric, threshold, actual, ts, message FROM eval_anomaly_flags ORDER BY ts DESC LIMIT 20'
        )
      ]);

      const benchmarks = await Promise.all(
        benchResult.rows.map(async (row) => {
          let passed: boolean | null = null;
          let score: number | null = null;

          try {
            if (row.slug && row.type === 'factual') {
              const wikiPath = storage.getWikiPath();
              const targetFile = join(wikiPath, `${row.slug}.md`);
              if (existsSync(targetFile)) {
                const currentContent = storage.readFile(targetFile);
                const similarity =
                  currentContent.length > 0 && row.expected_output.length > 0
                    ? Math.min(currentContent.length, row.expected_output.length) /
                      Math.max(currentContent.length, row.expected_output.length)
                    : 0;
                passed = similarity >= 0.5;
                score = similarity;
              }
            }
          } catch {
            // 评估失败时保持 null
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
        })
      );

      const anomalies = anomalyResult.rows.map((row) => ({
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

  /** 触发影子评估，返回通过率与错误列表。 */
  async runShadowEval(): Promise<{
    passed: boolean;
    accuracy: number;
    reproductionRate: number;
    newErrors: number;
    errors: string[];
  }> {
    try {
      const { runShadowEval } = await import('../../evolution/shadow');
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

  /** 归档活跃版本超过 50 条的 slug 最早 N-20 条记录。 */
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
        const count = Number.parseInt(row.cnt, 10);
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
}
