/**
 * GhostRelationRepository · ghost_relations 表的访问层
 *
 * 提供幽灵关系的清理：删除已解决或 pending 超过 30 天的关系。
 */

import { sql } from 'drizzle-orm';
import { ghostRelations } from '../schema';
import { BaseRepository } from './base';

export class GhostRelationRepository extends BaseRepository {
  /** 清理已解决或 pending 超过 30 天的幽灵关系，返回删除条数。 */
  async cleanStale(): Promise<number> {
    const result = await this.db
      .delete(ghostRelations)
      .where(
        sql`status = 'resolved' OR (status = 'pending' AND discovered_at < NOW() - INTERVAL '30 days')`
      );
    return result.rowCount ?? 0;
  }

  /** 统计 pending 状态的幽灵关系数量。 */
  async countPending(): Promise<number> {
    const rows = await this.db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(ghostRelations)
      .where(sql`status = 'pending'`);
    return rows[0]?.count ?? 0;
  }
}
