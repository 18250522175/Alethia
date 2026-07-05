import { basename } from 'node:path';
import matter from 'gray-matter';
import { getPool } from '../db/pool';
import logger from '../i18n/logger';
import { storage } from './markdown';

export interface ParsedCluster {
  clusterId: string;
  name: string;
  members: string[];
  lifecycle: string;
  content: string;
}

const WIKILINK_REGEX = /\[\[([^\]|]+)/g;

export function parseSummaryFile(filePath: string, content: string): ParsedCluster {
  const clusterId = basename(filePath, '.md');

  const { data, content: body } = matter(content);

  const name = data.name || clusterId;
  const lifecycle = data.lifecycle || 'emerging';

  const members: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = WIKILINK_REGEX.exec(body)) !== null) {
    const slug = match[1].trim();
    if (slug && !members.includes(slug)) {
      members.push(slug);
    }
  }

  return { clusterId, name, members, lifecycle, content: body.trim() };
}

export async function syncSummaries(): Promise<{ clusters: number; members: number }> {
  const files = storage.listSummaryFiles();

  if (files.length === 0) {
    return { clusters: 0, members: 0 };
  }

  const pool = getPool();
  const client = await pool.connect();

  let clusterCount = 0;
  let memberCount = 0;

  try {
    for (const filePath of files) {
      try {
        const raw = storage.readFile(filePath);
        const parsed = parseSummaryFile(filePath, raw);

        await client.query(
          `
          INSERT INTO clusters (cluster_id, name, lifecycle, generated_at)
          VALUES ($1, $2, $3, NOW())
          ON CONFLICT (cluster_id) DO UPDATE SET
            name = EXCLUDED.name,
            lifecycle = EXCLUDED.lifecycle,
            generated_at = NOW()
        `,
          [parsed.clusterId, parsed.name, parsed.lifecycle]
        );

        clusterCount++;

        if (parsed.members.length > 0) {
          await client.query('DELETE FROM cluster_members WHERE cluster_id = $1', [
            parsed.clusterId
          ]);

          for (const slug of parsed.members) {
            await client.query('INSERT INTO cluster_members (cluster_id, slug) VALUES ($1, $2)', [
              parsed.clusterId,
              slug
            ]);
          }
          memberCount += parsed.members.length;
        }
      } catch (err) {
        logger.error({ err, filePath }, '同步摘要文件失败');
      }
    }

    logger.info(`摘要同步完成: ${clusterCount} 集群, ${memberCount} 成员`);
  } finally {
    client.release();
  }

  return { clusters: clusterCount, members: memberCount };
}
