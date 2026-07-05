/**
 * WikiService · Wiki 页面与静态站点服务
 *
 * 职责：读取/编辑 Wiki 页面、生成静态站点。
 * 草稿生成（generateDraft）放在 DiffService 中，因为草稿随后会作为待审核 diff 入库。
 *
 * 对应原 BrainAPI.getWikiPage / updateWikiPage / generateStaticSite。
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { getPool } from '../../db/pool';
import logger from '../../i18n/logger';
import { storage } from '../../storage/markdown';
import { parser } from '../../storage/parser';
import { syncEngine } from '../../storage/sync';

export class WikiService {
  /** 读取 Wiki 页面：返回正文、frontmatter、证据跨度、出入边链接、版本号。 */
  async getWikiPage(slug: string): Promise<{
    page: {
      slug: string;
      title: string;
      type: string;
      contexts: string[];
      rawMd: string;
      contentMd: string;
      hash: string;
      updatedAt: string;
      version: number;
    };
    evidenceSpans: any[];
    links: { incoming: any[]; outgoing: any[] };
  }> {
    const wikiPath = storage.getWikiPath();
    const targetFile = join(wikiPath, `${slug}.md`);

    if (!existsSync(targetFile)) {
      throw new Error(`页面 ${slug} 不存在`);
    }

    const rawMd = storage.readFile(targetFile);
    const parsed = await parser.parse(targetFile, rawMd);

    const pool = getPool();
    const evidenceResult = await pool.query(
      'SELECT span_id, source_file_hash, span_text, source_type, confidence FROM evidence_spans WHERE slug = $1',
      [slug]
    );

    const [incomingResult, outgoingResult] = await Promise.all([
      pool.query(
        `SELECT l.*, p.title as target_title FROM links l
         LEFT JOIN pages p ON p.slug = l.source_slug
         WHERE l.target_slug = $1`,
        [slug]
      ),
      pool.query(
        `SELECT l.*, p.title as target_title FROM links l
         LEFT JOIN pages p ON p.slug = l.target_slug
         WHERE l.source_slug = $1`,
        [slug]
      )
    ]);

    const versionResult = await pool.query(
      'SELECT MAX(version) as max_version FROM knowledge_versions WHERE slug = $1',
      [slug]
    );
    const version = versionResult.rows[0]?.max_version || 1;

    return {
      page: {
        slug: parsed.slug || slug,
        title: parsed.title || slug,
        type: parsed.type || 'concept',
        contexts: parsed.contexts || [],
        rawMd,
        contentMd: parsed.contentMd || '',
        hash: storage.getFileHash(targetFile),
        updatedAt: new Date(storage.getFileMtime(targetFile)).toISOString(),
        version
      },
      evidenceSpans: evidenceResult.rows,
      links: {
        incoming: incomingResult.rows,
        outgoing: outgoingResult.rows
      }
    };
  }

  /** 编辑 Wiki 页面：原子写入并触发重新同步。 */
  async updateWikiPage(slug: string, content: string): Promise<{ success: boolean; hash: string }> {
    const wikiPath = storage.getWikiPath();
    const targetFile = join(wikiPath, `${slug}.md`);

    if (!existsSync(targetFile)) {
      throw new Error(`页面 ${slug} 不存在`);
    }

    storage.atomicWrite(targetFile, content);
    await syncEngine.syncAll();

    const hash = storage.getFileHash(targetFile);
    logger.info({ slug, hash }, 'Wiki 页面已更新');

    return { success: true, hash };
  }

  /** 生成静态站点，委托给 brainapi/static 模块。 */
  async generateStaticSite(options?: any): Promise<any> {
    const { generateStaticSite } = await import('../static');
    return generateStaticSite(options);
  }
}
