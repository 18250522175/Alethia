/**
 * PageRepository · pages 表的访问层
 *
 * 提供 slug 维度的查询：按 slug 单条查询、按 slug 批量查询、按相似度匹配等。
 * 高级全文检索（tsvector）仍由专用模块处理，本仓库仅负责结构化数据访问。
 */

import { eq, inArray, sql } from 'drizzle-orm';
import { type NewPage, type Page, pages } from '../schema';
import { BaseRepository } from './base';

export class PageRepository extends BaseRepository {
  /** 按 slug 查询单条页面。 */
  async findBySlug(slug: string): Promise<Page | null> {
    const rows = await this.db.select().from(pages).where(eq(pages.slug, slug)).limit(1);
    return rows[0] ?? null;
  }

  /** 按 slug 列表批量查询。 */
  async findBySlugs(slugList: string[]): Promise<Page[]> {
    if (slugList.length === 0) return [];
    return this.db.select().from(pages).where(inArray(pages.slug, slugList));
  }

  /** 统计页面总数。 */
  async count(): Promise<number> {
    const rows = await this.db.select({ count: sql<number>`COUNT(*)::int` }).from(pages);
    return rows[0]?.count ?? 0;
  }

  /** 插入或按 slug 更新（payload 中需包含 slug）。 */
  async upsertBySlug(payload: NewPage): Promise<Page | null> {
    const rows = await this.db
      .insert(pages)
      .values(payload)
      .onConflictDoUpdate({
        target: pages.slug,
        set: {
          path: payload.path,
          type: payload.type,
          contexts: payload.contexts,
          rawMd: payload.rawMd,
          parsedJson: payload.parsedJson,
          contentMd: payload.contentMd,
          hash: payload.hash,
          updatedAt: new Date()
        }
      })
      .returning();
    return rows[0] ?? null;
  }
}
