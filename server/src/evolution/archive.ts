import { existsSync } from 'fs';
import { join } from 'path';
import { getPool } from '../db/pool';
import { llmRouter } from '../llm/router';
import { storage } from '../storage/markdown';
import { syncEngine } from '../storage/sync';
import logger from '../i18n/logger';
import type { LLMMessage } from '@shared/index';

export interface ArchiveResult {
  archived: number;
  summaries: string[];
}

const ARCHIVE_THRESHOLD = 50;
const KEEP_RECENT = 20;

const ARCHIVE_SUMMARY_PROMPT = `你是版本归档摘要生成器。请将给定的多条版本变更记录归纳为 2-3 句中文摘要，概括该实体的主要演进脉络。直接输出摘要正文，不要附加任何前缀或列表标记。`;

interface VersionRow {
  id: number;
  slug: string;
  version: number;
  ts: Date;
  change_summary: string;
}

/**
 * 版本归档（Task 6.3）
 *
 * 扫描 knowledge_versions 中活跃记录超过 50 条的 slug，取最早 (count - 20) 条
 * 移入 changelog/<slug>.md，调用低成本模型生成 2-3 句摘要，在原 Markdown
 * 的 Version History 区段替换为归档链接，最后触发 rebuild-struct。
 */
export async function archiveVersions(entitySlug?: string): Promise<ArchiveResult> {
  const pool = getPool();
  const targets = entitySlug
    ? [{ slug: entitySlug }]
    : await findArchiveTargets(pool);

  let archived = 0;
  const summaries: string[] = [];

  for (const target of targets) {
    try {
      const count = await countActiveVersions(pool, target.slug);
      if (count <= ARCHIVE_THRESHOLD) {
        logger.debug({ slug: target.slug, count }, '版本数未达阈值，跳过');
        continue;
      }

      const toArchive = Math.max(0, count - KEEP_RECENT);
      if (toArchive === 0) continue;

      const records = await fetchEarliestActiveVersions(pool, target.slug, toArchive);
      if (records.length === 0) continue;

      const summary = await generateArchiveSummary(target.slug, records);
      const changelogPath = writeChangelog(target.slug, records, summary);

      await markArchived(pool, records, changelogPath);
      await replaceVersionHistoryInMarkdown(target.slug, changelogPath);

      archived += records.length;
      summaries.push(summary);
      logger.info({ slug: target.slug, archived: records.length }, '版本归档完成');
    } catch (err) {
      logger.warn({ err, slug: target.slug }, '版本归档失败，跳过该实体');
    }
  }

  try {
    await syncEngine.syncAll();
    logger.info({ archived }, '归档后已触发 rebuild-struct');
  } catch (err) {
    logger.warn({ err }, '归档后触发 rebuild-struct 失败');
  }

  return { archived, summaries };
}

async function findArchiveTargets(pool: ReturnType<typeof getPool>): Promise<{ slug: string }[]> {
  const result = await pool.query(
    `SELECT slug
     FROM knowledge_versions
     WHERE archived = false
     GROUP BY slug
     HAVING COUNT(*) > $1`,
    [ARCHIVE_THRESHOLD]
  );
  return result.rows.map((r: any) => ({ slug: r.slug }));
}

async function countActiveVersions(pool: ReturnType<typeof getPool>, slug: string): Promise<number> {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS cnt FROM knowledge_versions WHERE slug = $1 AND archived = false`,
    [slug]
  );
  return result.rows[0]?.cnt ?? 0;
}

async function fetchEarliestActiveVersions(
  pool: ReturnType<typeof getPool>,
  slug: string,
  limit: number
): Promise<VersionRow[]> {
  const result = await pool.query(
    `SELECT id, slug, version, created_at as ts, change_summary
     FROM knowledge_versions
     WHERE slug = $1 AND archived = false
     ORDER BY version ASC, created_at ASC
     LIMIT $2`,
    [slug, limit]
  );
  return result.rows.map((r: any) => ({
    id: r.id,
    slug: r.slug,
    version: r.version,
    ts: r.ts instanceof Date ? r.ts : new Date(r.ts),
    change_summary: r.change_summary || ''
  }));
}

async function generateArchiveSummary(slug: string, records: VersionRow[]): Promise<string> {
  const transcript = records
    .map((r) => `- v${r.version} · ${formatDate(r.ts)} · ${r.change_summary}`)
    .join('\n');

  const llmMessages: LLMMessage[] = [
    { role: 'system', content: ARCHIVE_SUMMARY_PROMPT },
    { role: 'user', content: `## 实体: ${slug}\n\n## 待归档版本记录 (${records.length} 条)\n${transcript}` }
  ];

  try {
    const adapter = llmRouter.route('archive_summary');
    const response = await adapter.chat({
      messages: llmMessages,
      temperature: 0.2,
      maxTokens: 200
    });
    const summary = response.content.trim();
    if (summary.length > 0) {
      return summary;
    }
  } catch (err) {
    logger.warn({ err, slug }, '归档摘要 LLM 调用失败，降级为拼接式摘要');
  }

  return buildFallbackSummary(slug, records);
}

function buildFallbackSummary(slug: string, records: VersionRow[]): string {
  if (records.length === 0) return `${slug} 无可归档版本记录。`;
  const first = records[0];
  const last = records[records.length - 1];
  return `${slug} 在 ${formatDate(first.ts)} 至 ${formatDate(last.ts)} 期间共归档 ${records.length} 个历史版本，涵盖多次状态与评估演进。完整明细见 changelog 文件。`;
}

function writeChangelog(slug: string, records: VersionRow[], summary: string): string {
  const changelogDir = storage.getChangelogPath();
  const filePath = join(changelogDir, `${slug}.md`);

  const lines: string[] = [];
  lines.push(`# Changelog: ${slug}`);
  lines.push('');
  lines.push(`> 本文件由版本归档器自动生成，记录已归档的历史版本。`);
  lines.push('');
  lines.push('## 摘要');
  lines.push('');
  lines.push(summary);
  lines.push('');
  lines.push(`## 历史版本 (${records.length} 条)`);
  lines.push('');
  for (const r of records) {
    lines.push(`- v${r.version} · ${formatDate(r.ts)} · ${r.change_summary}`);
  }
  lines.push('');

  storage.writeFile(filePath, lines.join('\n'));
  logger.debug({ slug, filePath }, '已写入 changelog 文件');
  return filePath;
}

async function markArchived(
  pool: ReturnType<typeof getPool>,
  records: VersionRow[],
  changelogPath: string
): Promise<void> {
  const relPath = relativeChangelogPath(changelogPath);
  const ids = records.map((r) => r.id);
  await pool.query(
    `UPDATE knowledge_versions
     SET archived = true, changelog_path = $1
     WHERE id = ANY($2::int[])`,
    [relPath, ids]
  );
}

async function replaceVersionHistoryInMarkdown(slug: string, changelogPath: string): Promise<void> {
  const wikiFile = findWikiFileForSlug(slug);
  if (!wikiFile) {
    logger.debug({ slug }, '未找到对应 wiki 文件，跳过 Markdown 替换');
    return;
  }

  let content = storage.readFile(wikiFile);
  const remaining = await fetchRemainingActiveVersions(getPool(), slug);
  const link = `../changelog/${slug}.md`;
  const newBody = buildVersionHistoryBody(remaining, link);

  content = replaceVersionHistorySection(content, newBody);
  storage.atomicWrite(wikiFile, content);
  logger.info({ slug, wikiFile }, '已替换原 Markdown 版本历史为归档链接');
}

async function fetchRemainingActiveVersions(
  pool: ReturnType<typeof getPool>,
  slug: string
): Promise<VersionRow[]> {
  const result = await pool.query(
    `SELECT id, slug, version, created_at as ts, change_summary
     FROM knowledge_versions
     WHERE slug = $1 AND archived = false
     ORDER BY version DESC, created_at DESC
     LIMIT $2`,
    [slug, KEEP_RECENT]
  );
  return result.rows.map((r: any) => ({
    id: r.id,
    slug: r.slug,
    version: r.version,
    ts: r.ts instanceof Date ? r.ts : new Date(r.ts),
    change_summary: r.change_summary || ''
  }));
}

function buildVersionHistoryBody(remaining: VersionRow[], link: string): string {
  const lines: string[] = [''];
  for (const r of remaining) {
    lines.push(`- v${r.version} · ${formatDate(r.ts)} · ${r.change_summary}`);
  }
  lines.push('');
  lines.push(`> 更早的历史版本已归档至 [changelog](${link})。`);
  lines.push('');
  return lines.join('\n');
}

function replaceVersionHistorySection(content: string, newBody: string): string {
  const lines = content.split('\n');
  const out: string[] = [];
  let inVersionSection = false;
  let replaced = false;

  for (const line of lines) {
    if (/^##\s+(Version History|版本历史)\s*$/.test(line)) {
      inVersionSection = true;
      replaced = true;
      out.push(line);
      out.push(newBody);
      continue;
    }
    if (inVersionSection) {
      if (/^##\s+/.test(line)) {
        inVersionSection = false;
        out.push(line);
      }
      continue;
    }
    out.push(line);
  }

  if (!replaced) {
    out.push('', '## Version History', newBody);
  }
  return out.join('\n');
}

function findWikiFileForSlug(slug: string): string | null {
  const wikiPath = storage.getWikiPath();
  const direct = join(wikiPath, `${slug}.md`);
  if (existsSync(direct)) return direct;

  for (const f of storage.listWikiFiles()) {
    const base = (f.split(/[/\\]/).pop() || '').replace(/\.md$/i, '');
    if (base === slug) return f;
  }
  return null;
}

function relativeChangelogPath(absPath: string): string {
  const root = process.cwd();
  if (absPath.startsWith(root)) {
    return absPath.slice(root.length).replace(/^[/\\]+/, '');
  }
  return absPath;
}

function formatDate(d: Date): string {
  const dt = d instanceof Date ? d : new Date(d);
  return dt.toISOString().slice(0, 10);
}
