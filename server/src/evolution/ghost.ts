import { randomUUID } from 'crypto';
import { join } from 'path';
import { existsSync } from 'fs';
import { getPool } from '../db/pool';
import { storage } from '../storage/markdown';
import logger from '../i18n/logger';

interface OrphanLinkRow {
  id: number;
  source_slug: string;
  target_slug: string;
  relation: string;
}

export async function ghostDetectAndMark(): Promise<{
  detected: number;
  marked: number;
  diffsCreated: number;
  sourcesUpdated: number;
}> {
  const pool = getPool();
  let detected = 0;
  let diffsCreated = 0;
  let sourcesUpdated = 0;

  const orphanLinks = await fetchOrphanLinksNotInGhostRelations(pool);
  detected = orphanLinks.length;

  if (detected === 0) {
    logger.info('未发现新的幽灵链接');
    return { detected: 0, marked: 0, diffsCreated: 0, sourcesUpdated: 0 };
  }

  logger.info({ count: detected }, '发现新的幽灵链接，开始处理');

  // 按 source_slug 分组，批处理同一源文件的 wiki 更新
  const bySource = new Map<string, OrphanLinkRow[]>();
  for (const link of orphanLinks) {
    const group = bySource.get(link.source_slug) || [];
    group.push(link);
    bySource.set(link.source_slug, group);
  }

  for (const [sourceSlug, links] of bySource.entries()) {
    // 先写入所有 ghost_relations 和 pending_diffs
    for (const link of links) {
      try {
        await insertGhostRelation(pool, link);
        const diffCreated = await insertPendingDiff(pool, link);
        if (diffCreated) diffsCreated++;
      } catch (err) {
        logger.warn(
          { err, source: link.source_slug, target: link.target_slug },
          '处理幽灵链接失败，跳过'
        );
      }
    }

    // 批量更新 wiki 文件（同一源文件只读写一次）
    const targetSlugs = links.map(l => l.target_slug);
    const updated = await appendOpenThreadsToWiki(sourceSlug, targetSlugs);
    if (updated) sourcesUpdated++;

    logger.debug(
      { source: sourceSlug, targets: targetSlugs },
      '幽灵链接批处理完成'
    );
  }

  logger.info(
    { detected, diffsCreated, sourcesUpdated },
    '幽灵链接检测与标记完成'
  );

  return { detected, marked: detected, diffsCreated, sourcesUpdated };
}

async function fetchOrphanLinksNotInGhostRelations(
  pool: ReturnType<typeof getPool>
): Promise<OrphanLinkRow[]> {
  const result = await pool.query(
    `SELECT l.id, l.source_slug, l.target_slug, l.relation
     FROM links l
     LEFT JOIN ghost_relations gr
       ON l.source_slug = gr.source_slug
       AND l.target_slug = gr.target_name
     WHERE l.orphaned = true
       AND gr.id IS NULL
     ORDER BY l.id ASC`,
    []
  );
  return result.rows.map((r: any) => ({
    id: r.id,
    source_slug: r.source_slug,
    target_slug: r.target_slug,
    relation: r.relation || 'related'
  }));
}

async function insertGhostRelation(
  pool: ReturnType<typeof getPool>,
  link: OrphanLinkRow
): Promise<void> {
  await pool.query(
    `INSERT INTO ghost_relations (source_slug, target_name, discovered_at, status)
     VALUES ($1, $2, NOW(), 'pending')
     ON CONFLICT DO NOTHING`,
    [link.source_slug, link.target_slug]
  );
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

async function appendOpenThreadsToWiki(
  sourceSlug: string,
  targetSlugs: string[]
): Promise<boolean> {
  const wikiFile = findWikiFileForSlug(sourceSlug);
  if (!wikiFile) {
    logger.debug({ slug: sourceSlug }, '未找到源 wiki 文件，跳过 Open Threads 追加');
    return false;
  }

  let content = storage.readFile(wikiFile);
  let anyAdded = false;

  for (const targetSlug of targetSlugs) {
    const taskLine = `- [ ] 调查指向 [[${targetSlug}]] 的悬空链接`;
    if (content.includes(taskLine)) {
      continue;
    }
    content = appendToOpenThreadsSection(content, taskLine);
    anyAdded = true;
  }

  if (anyAdded) {
    storage.atomicWrite(wikiFile, content);
    logger.debug({ slug: sourceSlug, targets: targetSlugs }, '已追加 Open Threads 任务');
  }
  return anyAdded;
}

function appendToOpenThreadsSection(content: string, line: string): string {
  const lines = content.split('\n');
  const out: string[] = [];
  let inOpenThreads = false;
  let appended = false;
  let lastContentLineInSection = -1;

  for (let i = 0; i < lines.length; i++) {
    const current = lines[i];

    if (/^##\s+Open Threads\s*$/.test(current)) {
      inOpenThreads = true;
      appended = false;
      lastContentLineInSection = -1;
      out.push(current);
      continue;
    }

    if (inOpenThreads) {
      if (/^##\s+/.test(current)) {
        if (!appended) {
          if (lastContentLineInSection >= 0 && out[out.length - 1] !== '') {
            out.push('');
          }
          out.push(line);
          appended = true;
        }
        inOpenThreads = false;
        out.push(current);
        continue;
      }
      if (current.trim() !== '') {
        lastContentLineInSection = i;
      }
      out.push(current);
      continue;
    }

    out.push(current);
  }

  if (inOpenThreads && !appended) {
    if (out.length > 0 && out[out.length - 1] !== '') {
      out.push('');
    }
    out.push(line);
    appended = true;
  }

  if (!appended) {
    if (out.length > 0 && out[out.length - 1] !== '') {
      out.push('');
    }
    out.push('## Open Threads');
    out.push('');
    out.push(line);
    out.push('');
  }

  return out.join('\n');
}

async function insertPendingDiff(
  pool: ReturnType<typeof getPool>,
  link: OrphanLinkRow
): Promise<boolean> {
  const id = randomUUID();
  const payload = {
    source_slug: link.source_slug,
    target_slug: link.target_slug,
    relation: link.relation
  };

  try {
    await pool.query(
      `INSERT INTO pending_diffs (id, slug, type, payload, confidence, impact, tier, created_at, resolved)
       VALUES ($1, $2, 'ghost_relation', $3, 0.9, 'low', 'green', NOW(), FALSE)`,
      [id, link.source_slug, JSON.stringify(payload)]
    );
    return true;
  } catch (err) {
    logger.warn({ err, id, slug: link.source_slug }, '写入 ghost_relation pending_diff 失败');
    return false;
  }
}
