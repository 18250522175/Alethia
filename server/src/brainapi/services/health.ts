/**
 * HealthService · 健康仪表盘服务
 *
 * 聚合知识库规模、待审核变更、预算状态、幽灵关系、归档状态等核心健康指标，
 * 用于首页 / 健康面板展示。
 *
 * 对应原 BrainAPI.getHealth。
 */

import type { HealthDashboard } from '@shared/index';
import { loadEnv } from '../../config/loader';
import { getPool } from '../../db/pool';
import { budgetManager } from '../../evolution/budget';
import logger from '../../i18n/logger';

export class HealthService {
  /** 返回健康仪表盘快照；查询失败时返回零值快照保证前端可用。 */
  async getHealth(): Promise<HealthDashboard> {
    try {
      const pool = getPool();

      const [nodesResult, edgesResult, pendingResult, ghostResult, versionsResult, observedResult] =
        await Promise.all([
          pool.query('SELECT COUNT(*) as count FROM pages'),
          pool.query('SELECT COUNT(*) as count FROM links'),
          pool.query(`SELECT
                        COUNT(*) FILTER (WHERE tier = 'green') as green,
                        COUNT(*) FILTER (WHERE tier = 'yellow') as yellow,
                        COUNT(*) FILTER (WHERE tier = 'red') as red
                      FROM pending_diffs WHERE resolved = false`),
          pool.query("SELECT COUNT(*) as count FROM ghost_relations WHERE status = 'pending'"),
          pool.query(`SELECT
                        COUNT(*) FILTER (WHERE archived = false) as active,
                        COUNT(*) FILTER (WHERE archived = true) as archived
                      FROM knowledge_versions`),
          pool.query('SELECT COUNT(*) as count FROM observed_files')
        ]);

      const env = loadEnv();
      const snapshot = budgetManager.getSnapshot();

      return {
        scale: {
          nodes: Number.parseInt(nodesResult.rows[0].count),
          edges: Number.parseInt(edgesResult.rows[0].count),
          pages: Number.parseInt(nodesResult.rows[0].count),
          trend: []
        },
        contextHeatmap: [],
        reviewBacklog: {
          green: Number.parseInt(pendingResult.rows[0].green || '0'),
          yellow: Number.parseInt(pendingResult.rows[0].yellow || '0'),
          red: Number.parseInt(pendingResult.rows[0].red || '0')
        },
        aiQuality: { correctness: 0, trend: [] },
        budget: {
          daily: {
            spent: snapshot.dailyUsed,
            limit: snapshot.dailyBudget,
            exceeded: snapshot.remaining.daily <= 0
          },
          monthly: {
            spent: snapshot.monthlyUsed,
            limit: snapshot.monthlyBudget,
            exceeded: snapshot.remaining.monthly <= 0
          },
          perQueryLimit: env.PER_QUERY_BUDGET
        },
        ghostRelations: Number.parseInt(ghostResult.rows[0].count || '0'),
        archiveStatus: {
          activeVersions: Number.parseInt(versionsResult.rows[0].active || '0'),
          archivedVersions: Number.parseInt(versionsResult.rows[0].archived || '0')
        },
        cacheHitRate: 0,
        brokenEvidenceChains: 0,
        orphanedFiles: 0,
        observedFiles: Number.parseInt(observedResult.rows[0].count || '0'),
        lastUpdated: new Date().toISOString()
      };
    } catch (err) {
      logger.error({ err }, '获取健康仪表盘数据失败');
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
}
