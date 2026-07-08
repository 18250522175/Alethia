import { storage } from './markdown';
import { parser, type ParsedPage } from './parser';
import { syncSummaries } from './summary';
import { getPool } from '../db/pool';
import logger from '../i18n/logger';
import { createHash, randomUUID } from 'crypto';
import { llmRouter } from '../llm/router';

const EXTRACTABLE_MIME_PREFIXES = ['text/', 'application/json', 'application/xml'];
const LIBRARY_EXTRACTION_PROMPT = `请从以下文本中提取知识实体和关系，输出 JSON 格式：
{
  "entities": [{"slug": "实体名", "type": "概念/人物/事件", "summary": "简述"}],
  "relations": [{"source": "实体A", "target": "实体B", "relation": "关系类型"}]
}

要求：
1. 仅输出 JSON，不要附加任何解释性文本
2. 实体 slug 使用简洁的唯一标识
3. type 只能是 概念、人物、事件 之一
4. 没有明确实体或关系时返回空数组

文本内容：
`;

/**
 * 根据关系类型计算链接权重。
 * 语义紧密的关系（如 "is-a"、"定义"）权重较高，
 * 松散关联（如 "相关"、"参考"）权重较低。
 */
function calcLinkWeight(relation: string): number {
  const r = relation.toLowerCase();
  if (r.includes('is-a') || r.includes('定义') || r.includes('等价') || r.includes('实例')) return 0.9;
  if (r.includes('包含') || r.includes('依赖') || r.includes('继承') || r.includes('实现')) return 0.8;
  if (r.includes('关联') || r.includes('影响') || r.includes('导致') || r.includes('引用')) return 0.6;
  if (r.includes('相关') || r.includes('参考') || r.includes('参见')) return 0.4;
  return 0.5;
}

export class SyncEngine {
  async syncAll(): Promise<{ pages: number; links: number; timeline: number; versions: number; clusters: number }> {
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

      const summaryResult = await syncSummaries(client);
      return { pages: pageCount, links: linkCount, timeline: timelineCount, versions: versionCount, clusters: summaryResult.clusters };
    } finally {
      client.release();
    }
  }

  private async syncPage(client: any, parsed: ParsedPage): Promise<void> {
    const hash = createHash('sha256').update(parsed.rawMd).digest('hex');

    await client.query(`
      INSERT INTO pages (slug, path, title, type, contexts, aliases, raw_md, parsed_json, content_md, hash, updated_at)
      VALUES ($1, $2, $3, $4, $5::text[], $6::text[], $7, $8::jsonb, $9, $10, NOW())
      ON CONFLICT (slug) DO UPDATE SET
        path = EXCLUDED.path,
        title = EXCLUDED.title,
        type = EXCLUDED.type,
        contexts = EXCLUDED.contexts,
        aliases = EXCLUDED.aliases,
        raw_md = EXCLUDED.raw_md,
        parsed_json = EXCLUDED.parsed_json,
        content_md = EXCLUDED.content_md,
        hash = EXCLUDED.hash,
        updated_at = NOW()
    `, [
      parsed.slug,
      parsed.path,
      parsed.title || parsed.slug,
      parsed.type,
      parsed.contexts,
      parsed.aliases,
      parsed.rawMd,
      JSON.stringify(parsed.parsedJson),
      parsed.contentMd,
      hash
    ]);

    const pageResult = await client.query('SELECT id FROM pages WHERE slug = $1', [parsed.slug]);
    const pageId = pageResult.rows[0].id;

    const aliasText = (parsed.aliases && parsed.aliases.length > 0) ? parsed.aliases.join(' ') : '';
    const sourceText = `${parsed.title || ''}\n${parsed.state || ''}\n${parsed.assessment || ''}\n${parsed.contentMd || ''}\n${aliasText}`;
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
      const weight = calcLinkWeight(rel.relation);
      await client.query(`
        INSERT INTO links (source_slug, target_slug, relation, weight, orphaned, created_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
      `, [
        parsed.slug,
        rel.targetSlug,
        rel.relation,
        weight,
        false
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

  async extractNewLibraryFiles(): Promise<{
    scanned: number;
    extracted: number;
    diffsCreated: number;
    errors: string[];
  }> {
    const pool = getPool();
    const client = await pool.connect();

    try {
      const result = await client.query(
        `SELECT hash, mime, original_name FROM library_files WHERE status = 'new' LIMIT 50`
      );
      const rows = result.rows;
      const scanned = rows.length;
      let extracted = 0;
      let diffsCreated = 0;
      const errors: string[] = [];

      if (scanned === 0) {
        logger.info('无可提取的新文件');
        return { scanned, extracted, diffsCreated, errors };
      }

      logger.info({ scanned }, '开始扫描新文件提取知识');

      for (const row of rows) {
        const { hash, mime, original_name } = row;

        try {
          // 根据 MIME 类型判断是否可提取
          if (!EXTRACTABLE_MIME_PREFIXES.some(prefix => mime.startsWith(prefix))) {
            await client.query(
              `UPDATE library_files SET status = 'unsupported' WHERE hash = $1`,
              [hash]
            );
            logger.debug({ hash, mime }, '跳过不支持的 MIME 类型');
            continue;
          }

          // 读取文件内容
          const filePath = `${storage.getLibraryPath()}/${hash}`;
          const content = storage.readFile(filePath);

          if (!content || content.trim().length === 0) {
            await client.query(
              `UPDATE library_files SET status = 'error' WHERE hash = $1`,
              [hash]
            );
            errors.push(`${original_name}: 文件内容为空`);
            continue;
          }

          // 调用 LLM 提取知识
          if (!llmRouter.hasAnyConfigured()) {
            errors.push('无可用的 LLM 适配器');
            break;
          }

          const adapter = llmRouter.route('fact_extract');
          const response = await adapter.chat({
            messages: [{ role: 'user', content: LIBRARY_EXTRACTION_PROMPT + content }],
            jsonMode: true,
            temperature: 0.1,
            maxTokens: 2000
          });

          // 解析 LLM 返回的 JSON
          const parsed = this.parseExtractionResponse(response.content);

          // 为每个实体生成 PendingDiff
          for (const entity of parsed.entities) {
            try {
              const diffId = randomUUID();
              const slug = entity.slug || `lib:${hash.slice(0, 12)}`;
              const payload = {
                action: 'create',
                content: { type: entity.type, summary: entity.summary },
                source_file: hash,
                original_name
              };

              await client.query(
                `INSERT INTO pending_diffs (id, slug, type, payload, confidence, impact, tier, created_at, resolved)
                 VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, NOW(), false)`,
                [
                  diffId,
                  slug,
                  'library_extraction',
                  JSON.stringify(payload),
                  entity.confidence ?? 0.7,
                  'medium',
                  'yellow'
                ]
              );
              diffsCreated++;
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              logger.warn({ err, slug: entity.slug }, '写入实体 PendingDiff 失败');
              errors.push(`${original_name}: 写入实体 ${entity.slug} 失败 - ${msg}`);
            }
          }

          // 为每个关系生成 PendingDiff
          for (const rel of parsed.relations) {
            try {
              const diffId = randomUUID();
              const slug = rel.source || `lib:${hash.slice(0, 12)}`;
              const payload = {
                action: 'link',
                content: { target: rel.target, relation: rel.relation },
                source_file: hash,
                original_name
              };

              await client.query(
                `INSERT INTO pending_diffs (id, slug, type, payload, confidence, impact, tier, created_at, resolved)
                 VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, NOW(), false)`,
                [
                  diffId,
                  slug,
                  'library_extraction',
                  JSON.stringify(payload),
                  0.7,
                  'medium',
                  'yellow'
                ]
              );
              diffsCreated++;
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              logger.warn({ err, source: rel.source }, '写入关系 PendingDiff 失败');
              errors.push(`${original_name}: 写入关系 ${rel.source}->${rel.target} 失败 - ${msg}`);
            }
          }

          // 标记文件为已提取
          await client.query(
            `UPDATE library_files SET status = 'extracted' WHERE hash = $1`,
            [hash]
          );
          extracted++;

          logger.debug({ hash, original_name, diffs: parsed.entities.length + parsed.relations.length }, '文件提取完成');
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.warn({ err, hash, original_name }, '文件提取失败');

          try {
            await client.query(
              `UPDATE library_files SET status = 'error' WHERE hash = $1`,
              [hash]
            );
          } catch {
            // 状态更新失败不阻塞
          }

          errors.push(`${original_name}: ${msg}`);
        }
      }

      logger.info({ scanned, extracted, diffsCreated, errorCount: errors.length }, '新文件提取完成');
      return { scanned, extracted, diffsCreated, errors };
    } finally {
      client.release();
    }
  }

  private parseExtractionResponse(content: string): {
    entities: Array<{ slug: string; type: string; summary: string; confidence?: number }>;
    relations: Array<{ source: string; target: string; relation: string }>;
  } {
    try {
      const trimmed = content.trim();
      const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        logger.warn('LLM 返回内容无法匹配 JSON 对象');
        return { entities: [], relations: [] };
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const entities = Array.isArray(parsed.entities)
        ? parsed.entities.filter((e: any) => e.slug && e.type && e.summary)
        : [];
      const relations = Array.isArray(parsed.relations)
        ? parsed.relations.filter((r: any) => r.source && r.target && r.relation)
        : [];

      return { entities, relations };
    } catch (err) {
      logger.warn({ err }, '解析 LLM 提取响应失败');
      return { entities: [], relations: [] };
    }
  }

  async truncateCache(): Promise<void> {
    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
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
      await client.query('COMMIT');
      logger.info('所有缓存表已清空');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      logger.error({ err }, '清空缓存表失败，已回滚');
      throw err;
    } finally {
      client.release();
    }
  }
}

export const syncEngine = new SyncEngine();
