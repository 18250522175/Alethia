import { basename } from 'path';
import matter from 'gray-matter';
import { storage } from './markdown';
import { getPool } from '../db/pool';
import type { PoolClient } from 'pg';
import logger from '../i18n/logger';

export interface ParsedCluster {
  clusterId: string;
  name: string;
  members: string[];
  lifecycle: string;
  content: string;
}

// 不使用 g 标志，避免并发场景下 lastIndex 竞态
const WIKILINK_PATTERN = /\[\[([^\]|]+)/;

export function parseSummaryFile(filePath: string, content: string): ParsedCluster {
  const clusterId = basename(filePath, '.md');

  const { data, content: body } = matter(content);

  const name = data.name || clusterId;
  const lifecycle = data.lifecycle || 'emerging';

  const members: string[] = [];
  // 使用 matchAll 替代 exec 循环，避免 lastIndex 竞态
  const matches = body.matchAll(/\[\[([^\]|]+)/g);
  for (const match of matches) {
    const slug = match[1].trim();
    if (slug && !members.includes(slug)) {
      members.push(slug);
    }
  }

  return { clusterId, name, members, lifecycle, content: body.trim() };
}

export async function syncSummaries(existingClient?: PoolClient): Promise<{ clusters: number; members: number }> {
  const files = storage.listSummaryFiles();

  if (files.length === 0) {
    return { clusters: 0, members: 0 };
  }

  const pool = getPool();
  const client = existingClient || await pool.connect();
  let shouldRelease = !existingClient;

  let clusterCount = 0;
  let memberCount = 0;

  try {
    for (const filePath of files) {
      try {
        const raw = storage.readFile(filePath);
        const parsed = parseSummaryFile(filePath, raw);

        await client.query(`
          INSERT INTO clusters (cluster_id, name, lifecycle, generated_at)
          VALUES ($1, $2, $3, NOW())
          ON CONFLICT (cluster_id) DO UPDATE SET
            name = EXCLUDED.name,
            lifecycle = EXCLUDED.lifecycle,
            generated_at = NOW()
        `, [parsed.clusterId, parsed.name, parsed.lifecycle]);

        clusterCount++;

        if (parsed.members.length > 0) {
          await client.query('DELETE FROM cluster_members WHERE cluster_id = $1', [parsed.clusterId]);

          // 批量 INSERT 替代逐条 INSERT，减少数据库往返
          const clusterIds = parsed.members.map(() => parsed.clusterId);
          await client.query(
            `INSERT INTO cluster_members (cluster_id, slug)
             SELECT * FROM unnest($1::text[], $2::text[])`,
            [clusterIds, parsed.members]
          );
          memberCount += parsed.members.length;
        }
      } catch (err) {
        logger.error({ err, filePath }, '同步摘要文件失败');
      }
    }

    logger.info(`摘要同步完成: ${clusterCount} 集群, ${memberCount} 成员`);
  } finally {
    if (shouldRelease) {
      client.release();
    }
  }

  return { clusters: clusterCount, members: memberCount };
}
