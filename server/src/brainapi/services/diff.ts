/**
 * DiffService · 变更审核与回滚服务
 *
 * 职责：列出待审核变更，应用 / 拒绝变更，按批次回滚自动变更，生成 Wiki 草稿。
 *
 * 对应原 BrainAPI.applyDiff / rollbackAutoChange / getPendingDiffs / generateDraft。
 */

import type { ApplyResult, RollbackResult } from '@shared/index';
import { randomUUID } from 'node:crypto';
import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { getPool } from '../../db/pool';
import logger from '../../i18n/logger';
import { storage } from '../../storage/markdown';
import { syncEngine } from '../../storage/sync';

export class DiffService {
  /** 列出所有未处理的待审核变更。 */
  async getPendingDiffs(): Promise<any[]> {
    try {
      const pool = getPool();
      const result = await pool.query(
        'SELECT * FROM pending_diffs WHERE resolved = false ORDER BY created_at DESC'
      );
      return result.rows;
    } catch {
      return [];
    }
  }

  /** 应用或拒绝一条待审核变更。 */
  async applyDiff(diffId: string, approved: boolean): Promise<ApplyResult> {
    const pool = getPool();

    const diffResult = await pool.query(
      'SELECT * FROM pending_diffs WHERE id = $1 AND resolved = false',
      [diffId]
    );

    if (diffResult.rows.length === 0) {
      throw new Error(`待审核变更 ${diffId} 不存在或已处理`);
    }

    const diff = diffResult.rows[0];
    await pool.query(
      'UPDATE pending_diffs SET resolved = true, approved = $1, resolved_at = NOW() WHERE id = $2',
      [approved, diffId]
    );

    if (!approved) {
      logger.info({ diffId }, '变更被拒绝');
      return {
        diffId,
        applied: false,
        newVersion: 0,
        modifiedFiles: []
      };
    }

    logger.info({ diffId, slug: diff.slug }, '变更已通过审核，正在应用');

    try {
      const wikiPath = storage.getWikiPath();
      const targetFile = join(wikiPath, `${diff.slug}.md`);
      const modifiedFiles: string[] = [];

      if (existsSync(targetFile)) {
        const currentContent = storage.readFile(targetFile);
        const payload = diff.payload || {};
        const newContent = applyContentChange(currentContent, payload, diff.type);
        if (newContent !== currentContent) {
          storage.atomicWrite(targetFile, newContent);
          modifiedFiles.push(`${diff.slug}.md`);

          const versionId = randomUUID();
          await pool.query(
            `INSERT INTO knowledge_versions (id, slug, version, content, batch_id, created_at)
             VALUES ($1, $2, $3, $4, $5, NOW())`,
            [versionId, diff.slug, 1, newContent.slice(0, 5000), `diff-${diffId}`]
          );

          await syncEngine.syncAll();
        }
      } else {
        // 页面不存在时，根据 payload 创建新页面
        const payload = diff.payload || {};
        let newContent = `---\nslug: ${diff.slug}\ntype: ${diff.type || 'concept'}\n---\n\n`;
        if (payload.content) {
          newContent +=
            typeof payload.content === 'string'
              ? payload.content
              : JSON.stringify(payload.content, null, 2);
        }
        storage.writeFile(targetFile, newContent);
        modifiedFiles.push(`${diff.slug}.md`);

        await syncEngine.syncAll();
      }

      logger.info({ diffId, modifiedFiles }, '变更已成功应用');
      return {
        diffId,
        applied: true,
        newVersion: 1,
        modifiedFiles
      };
    } catch (err) {
      logger.error({ err, diffId }, '应用变更失败');
      // 回滚 resolved 标记
      await pool.query(
        'UPDATE pending_diffs SET resolved = false, approved = NULL, resolved_at = NULL WHERE id = $1',
        [diffId]
      );
      throw new Error(`应用变更失败: ${(err as Error).message}`);
    }
  }

  /** 按批次回滚自动变更：恢复至变更前的最近版本或删除新建文件。 */
  async rollbackAutoChange(batchId: string): Promise<RollbackResult> {
    const pool = getPool();

    const logResult = await pool.query(
      'SELECT * FROM auto_change_log WHERE batch_id = $1 ORDER BY id DESC',
      [batchId]
    );

    if (logResult.rows.length === 0) {
      throw new Error(`批次 ${batchId} 不存在`);
    }

    logger.info({ batchId, count: logResult.rows.length }, '执行回滚');

    const restoredFiles: string[] = [];

    try {
      const wikiPath = storage.getWikiPath();

      for (const logEntry of logResult.rows) {
        const slug = logEntry.slug;
        const targetFile = join(wikiPath, `${slug}.md`);

        const versionResult = await pool.query(
          `SELECT * FROM knowledge_versions
           WHERE slug = $1 AND created_at < $2
           ORDER BY created_at DESC LIMIT 1`,
          [slug, logEntry.created_at]
        );

        if (versionResult.rows.length > 0) {
          const prevVersion = versionResult.rows[0];
          storage.atomicWrite(targetFile, prevVersion.content);
          restoredFiles.push(`${slug}.md`);
          await syncEngine.syncAll();
        } else if (logEntry.op === 'create') {
          if (existsSync(targetFile)) {
            unlinkSync(targetFile);
            restoredFiles.push(`${slug}.md (已删除)`);
          }
        }
      }

      return {
        batchId,
        restored: true,
        restoredFiles,
        rebuildTriggered: restoredFiles.length > 0
      };
    } catch (err) {
      logger.error({ err, batchId }, '回滚失败');
      throw new Error(`回滚失败: ${(err as Error).message}`);
    }
  }

  /** 生成 Wiki 页面草稿（带 frontmatter 与 Alethia 标准章节骨架）。 */
  async generateDraft(params: {
    title: string;
    type?: string;
    contexts?: string[];
    sources?: string[];
  }): Promise<{ slug: string; content: string }> {
    const slug = params.title
      .toLowerCase()
      .replace(/[^\w\u4E00-\u9FA5]+/g, '-')
      .replace(/^-|-$/g, '');
    const type = params.type || 'concept';
    const contexts = params.contexts || [];
    const sources = params.sources || [];
    const today = new Date().toISOString().split('T')[0];

    const relationsBlock = sources.length
      ? sources.map((s) => `- [[${s}]] 相关`).join('\n')
      : '（无）';

    const content = `---
title: ${params.title}
type: ${type}
contexts: [${contexts.join(', ')}]
---

# ${params.title}

## State
（待填写：当前状态描述）

## Assessment
（待填写：评估信息）

## Open Threads
- [ ] 需要补充核心定义
- [ ] 需要建立关联关系

## Relations
${relationsBlock}

## Timeline
- ${today} 创建草稿

## Version History
- v1 ${today} 初始创建

## Evidence
（无证据）

## Semantic Rings Archive
（无）
`;

    return { slug, content };
  }
}

/**
 * 将 diff payload 应用到 Markdown 内容上。
 * 支持三种操作模式：
 * 1. 替换正文（payload.content 存在时）
 * 2. 更新 frontmatter 字段（payload.frontmatter 存在时）
 * 3. 追加/更新章节（payload.sections 存在时）
 */
function applyContentChange(currentContent: string, payload: any, _type?: string): string {
  let result = currentContent;

  // 模式 1：替换整个正文
  if (payload.content && typeof payload.content === 'string') {
    const fmMatch = result.match(/^---\n([\s\S]*?)\n---\n*/);
    const frontmatter = fmMatch ? fmMatch[0] : '';
    result = frontmatter + payload.content;
  }

  // 模式 2：更新 frontmatter 字段
  if (payload.frontmatter && typeof payload.frontmatter === 'object') {
    const fmMatch = result.match(/^---\n([\s\S]*?)\n---\n*/);
    if (fmMatch) {
      let fm = fmMatch[1];
      for (const [key, value] of Object.entries(payload.frontmatter)) {
        const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const lineRegex = new RegExp(`^${escapedKey}:.*$`, 'm');
        const newLine = `${key}: ${value}`;
        if (lineRegex.test(fm)) {
          fm = fm.replace(lineRegex, newLine);
        } else {
          fm += `\n${newLine}`;
        }
      }
      result = `---\n${fm}\n---\n${result.replace(/^---\n[\s\S]*?\n---\n*/, '')}`;
    }
  }

  // 模式 3：追加/更新 Markdown 章节
  if (payload.sections && typeof payload.sections === 'object') {
    for (const [heading, sectionContent] of Object.entries(payload.sections)) {
      const sectionRegex = new RegExp(
        `(^#{1,4}\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n)([\\s\\S]*?)(?=\\n#{1,4}\\s|$)`,
        'm'
      );
      if (sectionRegex.test(result)) {
        result = result.replace(sectionRegex, `$1${sectionContent}\n`);
      } else {
        result += `\n## ${heading}\n${sectionContent}\n`;
      }
    }
  }

  return result;
}
