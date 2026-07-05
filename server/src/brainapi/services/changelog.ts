/**
 * ChangeLogService · 变更日志服务
 *
 * 聚合 auto_change_log 表中的批次信息：每批次的时间戳、操作计数、目标列表。
 *
 * 对应原 BrainAPI.getChangeLog。
 */

import { getPool } from '../../db/pool';
import logger from '../../i18n/logger';

export class ChangeLogService {
  /** 返回变更日志批次列表，可按 op 类型过滤、按 limit 截断。 */
  async getChangeLog(params?: {
    limit?: number;
    op?: string;
  }): Promise<{ batches: any[]; total: number }> {
    try {
      const pool = getPool();
      const limit = params?.limit || 100;
      const opFilter = params?.op;

      // 使用两个独立查询避免动态参数索引混乱
      const subResult = opFilter
        ? await pool.query(
            `SELECT batch_id, op, target, ts,
                    COUNT(*) OVER (PARTITION BY batch_id, op) as cnt
             FROM auto_change_log
             WHERE op = $1
             ORDER BY ts DESC
             LIMIT $2 * 1000`,
            [opFilter, limit]
          )
        : await pool.query(
            `SELECT batch_id, op, target, ts,
                    COUNT(*) OVER (PARTITION BY batch_id, op) as cnt
             FROM auto_change_log
             ORDER BY ts DESC
             LIMIT $1 * 1000`,
            [limit]
          );

      // 构建 batch_id 列表用于外层查询
      const batchIds = [...new Set(subResult.rows.map((r: any) => r.batch_id))].slice(0, limit);
      const result =
        batchIds.length > 0
          ? await pool.query(
              `SELECT batch_id,
                    MIN(ts) as batch_ts,
                    COUNT(*) as total_ops,
                    json_object_agg(op, cnt) as op_counts,
                    array_agg(DISTINCT target) as targets
             FROM (
               SELECT batch_id, op, target, ts,
                      COUNT(*) OVER (PARTITION BY batch_id, op) as cnt
               FROM auto_change_log
               WHERE batch_id = ANY($1::text[])
             ) sub
             GROUP BY batch_id
             ORDER BY batch_ts DESC`,
              [batchIds]
            )
          : { rows: [] };

      const batches = result.rows.map((row) => ({
        batchId: row.batch_id,
        ts: row.batch_ts,
        opCounts: row.op_counts || {},
        totalOps: Number.parseInt(row.total_ops),
        targets: row.targets || []
      }));

      const totalResult = await pool.query(
        `SELECT COUNT(DISTINCT batch_id) as count FROM auto_change_log${opFilter ? ' WHERE op = $1' : ''}`,
        opFilter ? [opFilter] : []
      );

      return {
        batches: batches.slice(0, limit),
        total: Number.parseInt(totalResult.rows[0]?.count || '0')
      };
    } catch (err) {
      logger.warn({ err }, '获取变更日志失败');
      return { batches: [], total: 0 };
    }
  }
}
