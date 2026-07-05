/**
 * KnowledgeVersionRepository · knowledge_versions 表的访问层
 *
 * 提供版本归档（超过 50 条活跃版本时归档最早 N-20 条）与版本号查询。
 */

import { eq, sql } from 'drizzle-orm';
import { knowledgeVersions } from '../schema';
import { BaseRepository } from './base';

export class KnowledgeVersionRepository extends BaseRepository {
  /** 查询某 slug 的最新版本号。 */
  async findMaxVersion(slug: string): Promise<number> {
    const rows = await this.db
      .select({ maxVersion: sql<number>`MAX(version)::int` })
      .from(knowledgeVersions)
      .where(eq(knowledgeVersions.slug, slug));
    return rows[0]?.maxVersion ?? 0;
  }

  /**
   * 归档活跃版本超过 50 条的 slug 最早 N-20 条记录。
   * 可选 entitySlug 限定单个 slug。
   * 返回实际归档的行数。
   */
  async archiveOversized(entitySlug?: string): Promise<number> {
    const candidates = entitySlug
      ? await this.db.execute(sql`
          SELECT slug, COUNT(*) as cnt
          FROM ${knowledgeVersions}
          WHERE slug = ${entitySlug} AND archived = false
          GROUP BY slug
          HAVING COUNT(*) > 50
        `)
      : await this.db.execute(sql`
          SELECT slug, COUNT(*) as cnt
          FROM ${knowledgeVersions}
          WHERE archived = false
          GROUP BY slug
          HAVING COUNT(*) > 50
        `);

    let archived = 0;
    for (const row of candidates.rows ?? []) {
      const slugValue = String(row.slug);
      const count = Number.parseInt(String(row.cnt), 10);
      const limit = Math.max(count - 20, 0);
      if (limit <= 0) continue;

      const result = await this.db.execute(sql`
        UPDATE knowledge_versions SET archived = true
        WHERE id IN (
          SELECT id FROM knowledge_versions
          WHERE slug = ${slugValue} AND archived = false
          ORDER BY ts ASC LIMIT ${limit}
        )
      `);
      archived += result.rowCount ?? 0;
    }
    return archived;
  }
}
