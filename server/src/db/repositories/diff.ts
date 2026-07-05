/**
 * DiffRepository · pending_diffs 与 auto_change_log 的访问层
 *
 * 提供待审核变更的列出、状态更新（已应用/已拒绝）、自动变更批次查询。
 */

import { and, desc, eq } from 'drizzle-orm';
import {
  autoChangeLog,
  type AutoChangeLog,
  type NewPendingDiff,
  type PendingDiff,
  pendingDiffs
} from '../schema';
import { BaseRepository } from './base';

export class DiffRepository extends BaseRepository {
  /** 列出所有未处理的待审核变更，按创建时间倒序。 */
  async findPending(): Promise<PendingDiff[]> {
    return this.db
      .select()
      .from(pendingDiffs)
      .where(eq(pendingDiffs.resolved, false))
      .orderBy(desc(pendingDiffs.createdAt));
  }

  /** 按 id 查询未处理变更。 */
  async findPendingById(id: string): Promise<PendingDiff | null> {
    const rows = await this.db
      .select()
      .from(pendingDiffs)
      .where(and(eq(pendingDiffs.id, id), eq(pendingDiffs.resolved, false)))
      .limit(1);
    return rows[0] ?? null;
  }

  /** 标记变更状态（resolved=true，approved 由调用方决定）。 */
  async markResolved(id: string): Promise<void> {
    await this.db.update(pendingDiffs).set({ resolved: true }).where(eq(pendingDiffs.id, id));
  }

  /** 回滚 resolved 标记（应用变更失败时使用）。 */
  async unmarkResolved(id: string): Promise<void> {
    await this.db.update(pendingDiffs).set({ resolved: false }).where(eq(pendingDiffs.id, id));
  }

  /** 插入新的待审核变更。 */
  async insert(payload: NewPendingDiff): Promise<PendingDiff | null> {
    const rows = await this.db.insert(pendingDiffs).values(payload).returning();
    return rows[0] ?? null;
  }

  /** 按 batch_id 查询自动变更日志，按 id 倒序返回。 */
  async findAutoChangeLogByBatch(batchId: string): Promise<AutoChangeLog[]> {
    return this.db
      .select()
      .from(autoChangeLog)
      .where(eq(autoChangeLog.batchId, batchId))
      .orderBy(desc(autoChangeLog.id));
  }
}
