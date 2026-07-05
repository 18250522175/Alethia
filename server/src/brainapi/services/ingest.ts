/**
 * IngestService · 知识摄入服务
 *
 * 职责：列出被引用但尚未入库的观察文件、触发事实抽取、翻译证据片段、读取库文件详情。
 *
 * 对应原 BrainAPI.listObservedFiles / triggerObservedExtraction / translateEvidence / getLibraryFile。
 */

import { extractFacts } from '../../agents/observe';
import { translateEvidence as translateEvidenceAgent } from '../../agents/translate';
import { getPool } from '../../db/pool';
import logger from '../../i18n/logger';

export class IngestService {
  /** 列出观察到的文件（被引用但可能尚未入库），按引用次数倒序。 */
  async listObservedFiles(): Promise<{ items: any[]; total: number }> {
    try {
      const pool = getPool();
      const result = await pool.query(
        `SELECT o.file_hash, o.reference_count, o.first_referenced_at, o.last_referenced_at,
                lf.mime, lf.original_name, lf.size, lf.status
         FROM observed_files o
         LEFT JOIN library_files lf ON o.file_hash = lf.hash
         ORDER BY o.reference_count DESC`
      );
      return { items: result.rows, total: result.rows.length };
    } catch (err) {
      logger.error({ err }, '查询观察文件列表失败');
      return { items: [], total: 0 };
    }
  }

  /** 触发观察文件的事实抽取，返回产生的待审核 diff 数量。 */
  async triggerObservedExtraction(fileHash: string): Promise<{ diffsCreated: number }> {
    return extractFacts(fileHash);
  }

  /** 翻译证据片段到目标语言。 */
  async translateEvidence(spanIds: string[], targetLang?: string): Promise<any[]> {
    return translateEvidenceAgent(spanIds, targetLang);
  }

  /** 读取库文件元数据及其抽取的证据片段。 */
  async getLibraryFile(hash: string): Promise<any> {
    try {
      const pool = getPool();
      const fileResult = await pool.query(
        'SELECT hash, mime, original_name, size, status, ingested_at FROM library_files WHERE hash = $1',
        [hash]
      );

      if (fileResult.rows.length === 0) {
        return null;
      }

      const file = fileResult.rows[0];

      const evidenceResult = await pool.query(
        `SELECT span_id, original_location, span_text, source_type
         FROM evidence_spans
         WHERE source_file_hash = $1
         LIMIT 50`,
        [hash]
      );

      return {
        file: {
          hash: file.hash,
          mime: file.mime,
          originalName: file.original_name,
          size: file.size,
          status: file.status,
          ingestedAt: file.ingested_at
        },
        evidenceSpans: evidenceResult.rows.map((r: any) => ({
          spanId: r.span_id,
          originalLocation: r.original_location,
          spanText: r.span_text,
          sourceType: r.source_type
        })),
        contentUrl: `/api/library-files/${hash}/content`
      };
    } catch (err) {
      logger.warn({ err }, '获取库文件失败');
      return null;
    }
  }
}
