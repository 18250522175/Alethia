import { randomUUID } from 'node:crypto';
import { getPool } from '../db/pool';
import logger from '../i18n/logger';

export interface CommunityDetectResult {
  detected: number;
  marked: number;
  communities: Array<{
    communityId: string;
    label: string;
    memberCount: number;
  }>;
}

/**
 * 社区检测：基于 links 表的 Union-Find 连通分量算法。
 *
 * 将知识图谱中互相连通的页面归为同一社区，识别出知识簇。
 * 结果写入 communities 表，成员关系通过社区标签关联。
 * 这是 Dream Cycle Phase 2 的核心步骤——从"孤立页面"到"知识社区"。
 */
export async function detectCommunities(): Promise<CommunityDetectResult> {
  const pool = getPool();

  // 1. 查询所有非孤儿链接
  const linksResult = await pool.query(
    `SELECT DISTINCT source_slug, target_slug
     FROM links
     WHERE orphaned = false`
  );

  const links = linksResult.rows as Array<{
    source_slug: string;
    target_slug: string;
  }>;

  if (links.length === 0) {
    logger.info('社区检测：无可用链接，跳过');
    return { detected: 0, marked: 0, communities: [] };
  }

  // 2. Union-Find 数据结构
  const parent = new Map<string, string>();

  function find(slug: string): string {
    if (!parent.has(slug)) parent.set(slug, slug);
    let root = slug;
    while (parent.get(root) !== root) {
      root = parent.get(root)!;
    }
    // 路径压缩
    let current = slug;
    while (parent.get(current) !== root) {
      const next = parent.get(current)!;
      parent.set(current, root);
      current = next;
    }
    return root;
  }

  function union(a: string, b: string): void {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) {
      parent.set(rootA, rootB);
    }
  }

  // 3. 构建 Union-Find
  for (const link of links) {
    union(link.source_slug, link.target_slug);
  }

  // 4. 按 root 分组
  const groups = new Map<string, string[]>();
  for (const slug of parent.keys()) {
    const root = find(slug);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(slug);
  }

  // 仅保留成员数 >= 2 的社区（孤立节点不算社区）
  const validCommunities = [...groups.values()].filter((g) => g.length >= 2);

  // 5. 查询页面标题用于社区标签
  const allSlugs = validCommunities.flat();
  const titleMap = new Map<string, string>();
  if (allSlugs.length > 0) {
    const titleResult = await pool.query(
      'SELECT slug, title FROM pages WHERE slug = ANY($1::text[])',
      [allSlugs]
    );
    for (const row of titleResult.rows) {
      titleMap.set(row.slug, row.title || row.slug);
    }
  }

  // 6. 清空旧社区数据，写入新结果
  await pool.query('TRUNCATE communities RESTART IDENTITY CASCADE');

  const communityReports: Array<{
    communityId: string;
    label: string;
    memberCount: number;
  }> = [];

  for (const members of validCommunities) {
    const communityId = `comm-${randomUUID().slice(0, 12)}`;
    // 用成员数最多的页面标题作为社区标签
    const label = members.map((m) => titleMap.get(m) || m).sort((a, b) => b.length - a.length)[0];

    await pool.query(
      `INSERT INTO communities (community_id, label) VALUES ($1, $2)
       ON CONFLICT (community_id) DO NOTHING`,
      [communityId, label]
    );

    // 生成社区报告
    const memberList = members.map((m) => `- [[${m}]] ${titleMap.get(m) || ''}`).join('\n');
    const reportContent = `## 社区：${label}\n\n共 ${members.length} 个成员：\n\n${memberList}\n`;

    await pool.query(`INSERT INTO community_reports (community_id, content) VALUES ($1, $2)`, [
      communityId,
      reportContent
    ]);

    communityReports.push({
      communityId,
      label,
      memberCount: members.length
    });
  }

  logger.info(
    { communityCount: communityReports.length, totalMembers: allSlugs.length },
    '社区检测完成'
  );

  return {
    detected: validCommunities.length,
    marked: allSlugs.length,
    communities: communityReports
  };
}
