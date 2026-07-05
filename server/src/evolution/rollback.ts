import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { getPool } from '../db/pool';
import logger from '../i18n/logger';
import { storage } from '../storage/markdown';
import { syncEngine } from '../storage/sync';

export interface RollbackResult {
  restored: boolean;
  files: string[];
  rebuildTriggered: boolean;
}

interface ChangeLogEntry {
  id: number;
  batch_id: string;
  op: string;
  target: string;
  payload: any;
  ts: Date;
}

/**
 * 全自动回滚（Task 6.6）
 *
 * 从 auto_change_log 查询指定批次的变更记录，按逆序恢复文件
 * （create→delete, update→restore old, delete→recreate），最后触发 rebuild-struct。
 */
export async function rollbackBatch(batchId: string): Promise<RollbackResult> {
  const pool = getPool();
  let entries: ChangeLogEntry[] = [];

  try {
    const result = await pool.query(
      `SELECT id, batch_id, op, target, payload, ts
       FROM auto_change_log
       WHERE batch_id = $1
       ORDER BY ts DESC`,
      [batchId]
    );
    entries = result.rows.map((r: any) => ({
      id: r.id,
      batch_id: r.batch_id,
      op: r.op,
      target: r.target,
      payload: r.payload || {},
      ts: r.ts instanceof Date ? r.ts : new Date(r.ts)
    }));
  } catch (err) {
    logger.error({ err, batchId }, '查询批次变更日志失败');
    return { restored: false, files: [], rebuildTriggered: false };
  }

  if (entries.length === 0) {
    logger.warn({ batchId }, '未找到批次变更记录，无可回滚内容');
    return { restored: false, files: [], rebuildTriggered: false };
  }

  logger.info({ batchId, entries: entries.length }, '开始回滚批次');
  const restoredFiles: string[] = [];

  for (const entry of entries) {
    try {
      const restored = await revertOp(entry.op, entry.target, entry.payload);
      if (restored) restoredFiles.push(entry.target);
    } catch (err) {
      logger.error({ err, entry }, '回滚单条变更失败');
    }
  }

  let rebuildTriggered = false;
  try {
    await syncEngine.syncAll();
    rebuildTriggered = true;
    logger.info(
      { batchId, restoredFiles: restoredFiles.length, rebuildTriggered },
      '批次回滚完成并触发 rebuild-struct'
    );
  } catch (err) {
    logger.warn({ err, batchId }, '回滚后触发 rebuild-struct 失败');
  }

  return {
    restored: restoredFiles.length > 0,
    files: restoredFiles,
    rebuildTriggered
  };
}

async function revertOp(op: string, target: string, payload: any): Promise<boolean> {
  const filePath = resolveFilePath(target);
  switch (op) {
    case 'create':
      return revertCreate(filePath);
    case 'update':
      return revertUpdate(filePath, payload);
    case 'delete':
      return revertDelete(filePath, payload);
    default:
      logger.warn({ op, target }, '未知 op 类型，跳过回滚');
      return false;
  }
}

function revertCreate(filePath: string): boolean {
  if (!existsSync(filePath)) {
    logger.warn({ filePath }, '回滚 create: 文件不存在，跳过');
    return false;
  }
  try {
    unlinkSync(filePath);
    logger.info({ filePath }, '回滚 create: 已删除文件');
    return true;
  } catch (err) {
    logger.warn({ err, filePath }, '回滚 create: 删除文件失败');
    return false;
  }
}

function revertUpdate(filePath: string, payload: any): boolean {
  const oldValue = payload?.oldValue ?? payload?.old_content ?? payload?.oldContent;
  if (oldValue == null) {
    logger.warn({ filePath }, '回滚 update: 缺少 oldValue，跳过');
    return false;
  }
  ensureDirFor(filePath);
  writeFileSync(filePath, String(oldValue), 'utf-8');
  logger.info({ filePath }, '回滚 update: 已恢复旧内容');
  return true;
}

function revertDelete(filePath: string, payload: any): boolean {
  const oldValue =
    payload?.oldValue ?? payload?.old_content ?? payload?.oldContent ?? payload?.content;
  if (oldValue == null) {
    logger.warn({ filePath }, '回滚 delete: 缺少 oldValue，跳过');
    return false;
  }
  ensureDirFor(filePath);
  writeFileSync(filePath, String(oldValue), 'utf-8');
  logger.info({ filePath }, '回滚 delete: 已重建文件');
  return true;
}

function resolveFilePath(target: string): string {
  if (isAbsolute(target)) return target;
  const wikiPath = storage.getWikiPath();
  return join(wikiPath, target);
}

function ensureDirFor(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}
