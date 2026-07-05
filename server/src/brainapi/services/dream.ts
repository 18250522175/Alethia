/**
 * DreamService · Dream Cycle 编排服务
 *
 * 职责：触发结构重建、扫描待提取文件、清理幽灵关系。
 * 完整 6 阶段 Dream Cycle 由 evolution/dream.ts 编排，本服务仅暴露手动入口。
 *
 * 对应原 BrainAPI.rebuildStruct / extractPending / cleanGhostRelations。
 */

import type { ExtractReport, RebuildReport } from '@shared/index';
import { getPool } from '../../db/pool';
import logger from '../../i18n/logger';
import { syncEngine } from '../../storage/sync';

export class DreamService {
  /** 重建知识库结构：清空缓存 → 全量同步 → 重建幽灵关系。 */
  async rebuildStruct(): Promise<RebuildReport> {
    const startTime = Date.now();
    logger.info('开始重建知识库结构...');

    await syncEngine.truncateCache();
    const result = await syncEngine.syncAll();
    const ghostCount = await syncEngine.rebuildGhostRelations();

    const durationMs = Date.now() - startTime;
    logger.info(`重建完成，耗时 ${durationMs}ms`);

    return {
      pages: result.pages,
      links: result.links,
      ghostCount,
      durationMs
    };
  }

  /** 扫描待提取的 library_files（status='new'），执行事实抽取并产生待审核 diff。 */
  async extractPending(): Promise<ExtractReport> {
    logger.info('扫描待提取文件...');

    let processed = 0;
    let pendingDiffsCreated = 0;
    const errors: { filePath: string; message: string }[] = [];

    const libResult = await syncEngine.extractNewLibraryFiles();
    processed += libResult.extracted;
    pendingDiffsCreated += libResult.diffsCreated;
    for (const msg of libResult.errors) {
      const colonIdx = msg.indexOf(': ');
      errors.push({
        filePath: colonIdx > 0 ? msg.slice(0, colonIdx) : '',
        message: colonIdx > 0 ? msg.slice(colonIdx + 2) : msg
      });
    }

    logger.info(
      { processed, pendingDiffsCreated, errorCount: errors.length },
      '待提取文件处理完成'
    );
    return { processed, pendingDiffsCreated, errors };
  }

  /** 清理已解决的幽灵关系或 pending 超过 30 天的关系。 */
  async cleanGhostRelations(): Promise<{ cleaned: number }> {
    const pool = getPool();
    try {
      const result = await pool.query(
        `DELETE FROM ghost_relations
         WHERE status = 'resolved'
            OR (status = 'pending' AND discovered_at < NOW() - INTERVAL '30 days')`
      );
      const cleaned = result.rowCount || 0;
      logger.info({ cleaned }, '幽灵关系清理完成');
      return { cleaned };
    } catch (err) {
      logger.error({ err }, '幽灵关系清理失败');
      return { cleaned: 0 };
    }
  }
}
