/**
 * LibraryFileRepository · library_files 表的访问层
 *
 * 提供库文件元数据查询与对应证据片段的关联查询。
 */

import { eq } from 'drizzle-orm';
import { evidenceSpans, type LibraryFile, libraryFiles } from '../schema';
import { BaseRepository } from './base';

export class LibraryFileRepository extends BaseRepository {
  /** 按 hash 查询单条库文件。 */
  async findByHash(hash: string): Promise<LibraryFile | null> {
    const rows = await this.db
      .select()
      .from(libraryFiles)
      .where(eq(libraryFiles.hash, hash))
      .limit(1);
    return rows[0] ?? null;
  }

  /** 查询某文件下的证据片段（默认前 50 条）。 */
  async findEvidenceByHash(hash: string, limit: number = 50) {
    return this.db
      .select({
        spanId: evidenceSpans.spanId,
        originalLocation: evidenceSpans.originalLocation,
        spanText: evidenceSpans.spanText,
        sourceType: evidenceSpans.sourceType
      })
      .from(evidenceSpans)
      .where(eq(evidenceSpans.sourceFileHash, hash))
      .limit(limit);
  }
}
