import { Hono } from 'hono';
import { getPool } from '../db/pool';
import { budgetManager } from '../evolution/budget';
import { getErrorMessage } from '../i18n/errors.zh-CN';
import loggerInstance from '../i18n/logger';

const app = new Hono();

interface NotificationItem {
  id: string;
  type: 'review' | 'system' | 'extraction' | 'anomaly';
  title: string;
  description: string;
  ts: string;
  read: boolean;
  actionUrl?: string;
  actionLabel?: string;
}

/**
 * 从系统状态派生通知列表。
 *
 * 通知不是独立存储的，而是从待审核变更、幽灵关系、预算告警、
 * 观察文件、评估异常等系统状态中实时聚合。
 * 这符合"零配置"哲学——无需额外维护通知表。
 */
async function deriveNotifications(params?: {
  limit?: number;
  offset?: number;
  unreadOnly?: boolean;
}): Promise<{ items: NotificationItem[]; total: number }> {
  const pool = getPool();
  const limit = params?.limit || 50;
  const offset = params?.offset || 0;
  const notifications: NotificationItem[] = [];

  try {
    // 1. 审核通知：待审核变更
    const diffResult = await pool.query(
      `SELECT id, slug, type, tier, confidence, created_at
       FROM pending_diffs
       WHERE resolved = false
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );
    for (const row of diffResult.rows) {
      const tierLabel =
        row.tier === 'green' ? '🟢 低风险' : row.tier === 'yellow' ? '🟡 待确认' : '🔴 高风险';
      notifications.push({
        id: `diff-${row.id}`,
        type: 'review',
        title: `${tierLabel} 变更待审核：${row.slug}`,
        description: `类型：${row.type}，置信度：${(row.confidence * 100).toFixed(0)}%`,
        ts: row.created_at,
        read: false,
        actionUrl: '/review',
        actionLabel: '前往审核'
      });
    }

    // 2. 系统通知：幽灵关系
    const ghostResult = await pool.query(
      `SELECT source_slug, target_name, discovered_at
       FROM ghost_relations
       WHERE status = 'pending'
       ORDER BY discovered_at DESC
       LIMIT $1`,
      [limit]
    );
    for (const row of ghostResult.rows) {
      notifications.push({
        id: `ghost-${row.source_slug}-${row.target_name}`,
        type: 'system',
        title: `幽灵关系：${row.source_slug} → ${row.target_name}`,
        description: `页面 ${row.source_slug} 引用了不存在的目标 ${row.target_name}`,
        ts: row.discovered_at,
        read: false,
        actionUrl: '/graph',
        actionLabel: '查看图谱'
      });
    }

    // 3. 异常通知：预算告警
    const alerts = budgetManager.getAlerts();
    for (const alert of alerts) {
      notifications.push({
        id: `budget-${alert.metric}`,
        type: 'system',
        title: `预算告警：${alert.metric}`,
        description: alert.message,
        ts: alert.ts || new Date().toISOString(),
        read: false,
        actionUrl: '/dashboard',
        actionLabel: '查看仪表盘'
      });
    }

    // 4. 异常通知：评估异常
    const anomalyResult = await pool.query(
      `SELECT id, metric, threshold, actual, ts, message
       FROM eval_anomaly_flags
       ORDER BY ts DESC
       LIMIT $1`,
      [limit]
    );
    for (const row of anomalyResult.rows) {
      notifications.push({
        id: `anomaly-${row.id}`,
        type: 'anomaly',
        title: `评估异常：${row.metric}`,
        description: row.message || `阈值 ${row.threshold}，实际值 ${row.actual}`,
        ts: row.ts,
        read: false,
        actionUrl: '/eval',
        actionLabel: '查看评估报告'
      });
    }

    // 5. 提取通知：观察文件达到阈值
    const observedResult = await pool.query(
      `SELECT o.file_hash, o.reference_count, o.last_referenced_at,
              lf.original_name
       FROM observed_files o
       LEFT JOIN library_files lf ON o.file_hash = lf.hash
       WHERE o.reference_count >= 3
       ORDER BY o.reference_count DESC
       LIMIT $1`,
      [limit]
    );
    for (const row of observedResult.rows) {
      notifications.push({
        id: `observed-${row.file_hash}`,
        type: 'extraction',
        title: `文件待补提取：${row.original_name || row.file_hash.slice(0, 12)}`,
        description: `已被引用 ${row.reference_count} 次，建议触发事实提取`,
        ts: row.last_referenced_at,
        read: false,
        actionUrl: '/library',
        actionLabel: '查看文件'
      });
    }

    // 按时间倒序排序
    notifications.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

    const total = notifications.length;
    const paginated = notifications.slice(offset, offset + limit);

    return { items: paginated, total };
  } catch (err) {
    loggerInstance.error({ err }, '派生通知列表失败');
    return { items: [], total: 0 };
  }
}

app.get('/api/notifications', async (c) => {
  try {
    const limit = c.req.query('limit');
    const offset = c.req.query('offset');
    const unreadOnly = c.req.query('unreadOnly') === 'true';

    const result = await deriveNotifications({
      limit: limit ? Number.parseInt(limit) : undefined,
      offset: offset ? Number.parseInt(offset) : undefined,
      unreadOnly
    });

    return c.json(result);
  } catch (err) {
    loggerInstance.error({ err }, '获取通知列表失败');
    return c.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: getErrorMessage('INTERNAL_ERROR')
        }
      },
      500
    );
  }
});

app.post('/api/notifications/:id/read', async (c) => {
  // 通知是实时派生的，无持久化读状态。
  // 此端点返回成功，前端在本地标记已读。
  return c.json({ success: true });
});

app.post('/api/notifications/read-all', async (c) => {
  return c.json({ success: true });
});

export default app;
