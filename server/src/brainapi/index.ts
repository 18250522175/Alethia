import { syncEngine } from '../storage/sync';
import logger from '../i18n/logger';
import type { RebuildReport, ExtractReport } from '@shared/index';

class BrainAPI {
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

  async extractPending(): Promise<ExtractReport> {
    logger.info('扫描待提取文件...');

    return {
      processed: 0,
      pendingDiffsCreated: 0,
      errors: []
    };
  }

  async getHealth(): Promise<any> {
    return {
      scale: { nodes: 0, edges: 0, pages: 0, trend: [] },
      contextHeatmap: [],
      reviewBacklog: { green: 0, yellow: 0, red: 0 },
      aiQuality: { correctness: 0, trend: [] },
      budget: {
        daily: { spent: 0, limit: 0, exceeded: false },
        monthly: { spent: 0, limit: 0, exceeded: false },
        perQueryLimit: 0
      },
      ghostRelations: 0,
      archiveStatus: { activeVersions: 0, archivedVersions: 0 },
      cacheHitRate: 0,
      brokenEvidenceChains: 0,
      orphanedFiles: 0,
      observedFiles: 0,
      lastUpdated: new Date().toISOString()
    };
  }
}

export const brainAPI = new BrainAPI();
