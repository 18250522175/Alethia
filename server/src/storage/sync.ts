import { storage } from './markdown';
import { parser, type ParsedPage } from './parser';
import { getPool } from '../db/pool';
import logger from '../i18n/logger';
import { createHash } from 'crypto';

export class SyncEngine {
  async syncAll(): Promise<{ pages: number; links: number; timeline: number; versions: number }> {
    const wikiFiles = storage.listWikiFiles();
    let pageCount = 0;
    let linkCount = 0;
    let timelineCount = 0;
    let versionCount = 0;

    const pool = getPool();
    const client = await pool.connect();

    try {
      for (const filePath of wikiFiles) {
        try {
          const content = storage.readFile(filePath);
          const parsed = await parser.parse(filePath, content);
          await this.syncPage(client, parsed);
          pageCount++;

          const links = await this.syncLinks(client, parsed);
          linkCount += links;

          const timeline = await this.syncTimeline(client, parsed);
          timelineCount += timeline;

          const versions = await this.syncVersions(client, parsed);
          versionCount += versions;
        } catch (err) {
          logger.error({ err, filePath }, '同步文件失败');
        }
      }

      logger.info(`同步完成: ${pageCount} 页, ${linkCount} 链接, ${timelineCount} 时间线, ${versionCount} 版本`);
    } finally {
      client.release();
    }

    return { pages: pageCount, links: linkCount, timeline: timelineCount, versions: versionCount };
  }

  private async syncPage(client: any, parsed: ParsedPage): Promise<void> {
    const hash = createHash('sha256').update(parsed.rawMd).digest('hex');

    await client.query(`
      INSERT INTO pages (slug, path, type, contexts, raw_md, parsed_json, content_md, hash, updated_at)
      VALUES ($1, $2, $3, $4::text[], $5, $6::jsonb, $7, $8, NOW())
      ON CONFLICT (slug) DO UPDATE SET
        path = EXCLUDED.path,
        type = EXCLUDED.type,
        contexts = EXCLUDED.contexts,
        raw_md = EXCLUDED.raw_md,
        parsed_json = EXCLUDED.parsed_json,
        content_md = EXCLUDED.content_md,
        hash = EXCLUDED.hash,
        updated_at = NOW()
    `, [
      parsed.slug,
      parsed.path,
      parsed.type,
      parsed.contexts,
      parsed.rawMd,
      JSON.stringify(parsed.parsedJson),
      parsed.contentMd,
      hash
    ]);

    const pageResult = await client.query('SELECT id FROM pages WHERE slug = $1', [parsed.slug]);
    const pageId = pageResult.rows[0].id;

    const sourceText = `${parsed.title}\n${parsed.state}\n${parsed.assessment}\n${parsed.contentMd}`;
    await client.query(`
      INSERT INTO page_fts (page_id, tsv, source_text)
      VALUES ($1, to_tsvector('simple', $2), $2)
      ON CONFLICT (page_id) DO UPDATE SET
        tsv = to_tsvector('simple', EXCLUDED.source_text),
        source_text = EXCLUDED.source_text
    `, [pageId, sourceText]);

    logger.debug(`同步页面: ${parsed.slug}`);
  }

  private async syncLinks(client: any, parsed: ParsedPage): Promise<number> {
    if (parsed.relations.length === 0) return 0;

    await client.query('DELETE FROM links WHERE source_slug = $1', [parsed.slug]);

    for (const rel of parsed.relations) {
      await client.query(`
        INSERT INTO links (source_slug, target_slug, relation, weight, orphaned, created_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
      `, [
        parsed.slug,
        rel.targetSlug,
        rel.relation,
        1.0,
        true
      ]);
    }

    return parsed.relations.length;
  }

  private async syncTimeline(client: any, parsed: ParsedPage): Promise<number> {
    if (parsed.timeline.length === 0) return 0;

    await client.query('DELETE FROM timeline_entries WHERE slug = $1', [parsed.slug]);

    for (const entry of parsed.timeline) {
      await client.query(`
        INSERT INTO timeline_entries (slug, type, payload, ts)
        VALUES ($1, $2, $3::jsonb, $4::timestamptz)
      `, [
        parsed.slug,
        entry.type,
        JSON.stringify({ description: entry.description }),
        entry.date
      ]);
    }

    return parsed.timeline.length;
  }

  private async syncVersions(client: any, parsed: ParsedPage): Promise<number> {
    if (parsed.versionHistory.length === 0) return 0;

    for (let i = 0; i < parsed.versionHistory.length; i++) {
      const entry = parsed.versionHistory[i];
      const versionNum = parsed.versionHistory.length - i;

      await client.query(`
        INSERT INTO knowledge_versions (slug, version, ts, change_summary, archived)
        VALUES ($1, $2, $3::timestamptz, $4, false)
        ON CONFLICT ON CONSTRAINT idx_knowledge_versions_unique DO NOTHING
      `, [
        parsed.slug,
        versionNum,
        entry.date,
        entry.summary
      ]);
    }

    return parsed.versionHistory.length;
  }

  async rebuildGhostRelations(): Promise<number> {
    const pool = getPool();
    const client = await pool.connect();

    try {
      const result = await client.query(`
        UPDATE links
        SET orphaned = true
        WHERE target_slug NOT IN (SELECT slug FROM pages)
      `);

      logger.info(`标记幽灵链接: ${result.rowCount || 0} 条`);
      return result.rowCount || 0;
    } finally {
      client.release();
    }
  }

  async truncateCache(): Promise<void> {
    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query('TRUNCATE TABLE page_embeddings CASCADE');
      await client.query('TRUNCATE TABLE page_fts CASCADE');
      await client.query('TRUNCATE TABLE links CASCADE');
      await client.query('TRUNCATE TABLE timeline_entries CASCADE');
      await client.query('TRUNCATE TABLE knowledge_versions CASCADE');
      await client.query('TRUNCATE TABLE semantic_rings CASCADE');
      await client.query('TRUNCATE TABLE evidence_spans CASCADE');
      await client.query('TRUNCATE TABLE clusters CASCADE');
      await client.query('TRUNCATE TABLE cluster_members CASCADE');
      await client.query('TRUNCATE TABLE pages CASCADE');
      logger.info('所有缓存表已清空');
    } finally {
      client.release();
    }
  }
}

export const syncEngine = new SyncEngine();
