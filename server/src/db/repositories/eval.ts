/**
 * EvalRepository · shadow_benchmarks + eval_anomaly_flags 的访问层
 *
 * 提供影子评估基准与异常标志的查询。
 */

import { desc } from 'drizzle-orm';
import { evalAnomalyFlags, shadowBenchmarks } from '../schema';
import { BaseRepository } from './base';

export class EvalRepository extends BaseRepository {
  /** 列出最近的影子基准（默认前 100 条）。 */
  async listBenchmarks(limit: number = 100) {
    return this.db.select().from(shadowBenchmarks).orderBy(desc(shadowBenchmarks.id)).limit(limit);
  }

  /** 列出最近的异常标志（默认前 20 条）。 */
  async listAnomalies(limit: number = 20) {
    return this.db.select().from(evalAnomalyFlags).orderBy(desc(evalAnomalyFlags.ts)).limit(limit);
  }
}
