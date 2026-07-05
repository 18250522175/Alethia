/**
 * ObservedFileRepository · observed_files 表的访问层
 *
 * 提供观察文件列表（带 library_files 左连接）、引用次数统计等。
 */

import { desc, eq, sql } from 'drizzle-orm';
import { libraryFiles, observedFiles } from '../schema';
import { BaseRepository } from './base';

export interface ObservedFileRow {
  fileHash: string;
  referenceCount: number;
  firstReferencedAt: string;
  lastReferencedAt: string;
  mime: string | null;
  originalName: string | null;
  size: number | null;
  status: string | null;
}

export class ObservedFileRepository extends BaseRepository {
  /** 列出所有观察文件，按引用次数倒序，左连接库文件元数据。 */
  async listWithLibraryInfo(): Promise<ObservedFileRow[]> {
    const rows = await this.db
      .select({
        fileHash: observedFiles.fileHash,
        referenceCount: observedFiles.referenceCount,
        firstReferencedAt: observedFiles.firstReferencedAt,
        lastReferencedAt: observedFiles.lastReferencedAt,
        mime: libraryFiles.mime,
        originalName: libraryFiles.originalName,
        size: libraryFiles.size,
        status: libraryFiles.status
      })
      .from(observedFiles)
      .leftJoin(libraryFiles, eq(libraryFiles.hash, observedFiles.fileHash))
      .orderBy(desc(observedFiles.referenceCount));

    return rows as unknown as ObservedFileRow[];
  }

  /** 统计观察文件总数。 */
  async count(): Promise<number> {
    const rows = await this.db.select({ count: sql<number>`COUNT(*)::int` }).from(observedFiles);
    return rows[0]?.count ?? 0;
  }
}
