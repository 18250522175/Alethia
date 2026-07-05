import { randomUUID } from 'node:crypto';
import { getPool } from '../db/pool';
import logger from '../i18n/logger';

export interface TopicClusterResult {
  clustersCreated: number;
  pagesAssigned: number;
  clusters: Array<{
    clusterId: string;
    name: string;
    memberCount: number;
  }>;
}

const MIN_CLUSTER_SIZE = 2;
const MAX_CLUSTERS = 20;
const SIMILARITY_THRESHOLD = 0.75;

interface PageEmbedding {
  pageId: number;
  slug: string;
  embedding: number[];
}

/**
 * 主题聚类：基于 page_embeddings 的 K-means 变体算法。
 *
 * 使用余弦相似度将语义相近的页面归入同一主题簇。
 * 自动确定簇数（基于相似度阈值而非固定 K），
 * 结果写入 clusters + cluster_members 表。
 * 这是 Dream Cycle Phase 5 的核心步骤——发现知识盲区与主题关联。
 */
export async function clusterTopics(): Promise<TopicClusterResult> {
  const pool = getPool();

  // 1. 查询所有页面嵌入向量
  const embResult = await pool.query(
    `SELECT pe.page_id, p.slug, pe.embedding::text as embedding_text
     FROM page_embeddings pe
     JOIN pages p ON p.id = pe.page_id`
  );

  if (embResult.rows.length === 0) {
    logger.info('主题聚类：无嵌入向量数据，跳过');
    return { clustersCreated: 0, pagesAssigned: 0, clusters: [] };
  }

  const pages: PageEmbedding[] = embResult.rows.map((row: any) => ({
    pageId: row.page_id,
    slug: row.slug,
    embedding: parseVector(row.embedding_text)
  }));

  // 2. 查询页面标题用于簇命名
  const titleResult = await pool.query(
    'SELECT slug, title FROM pages WHERE slug = ANY($1::text[])',
    [pages.map((p) => p.slug)]
  );
  const titleMap = new Map<string, string>();
  for (const row of titleResult.rows) {
    titleMap.set(row.slug, row.title || row.slug);
  }

  // 3. 贪心聚类：以相似度阈值分组
  const clusters: PageEmbedding[][] = [];
  const assigned = new Set<number>();

  // 按页面 ID 排序以保证确定性
  pages.sort((a, b) => a.pageId - b.pageId);

  for (const page of pages) {
    if (assigned.has(page.pageId)) continue;

    // 寻找最相似的已有簇
    let bestCluster = -1;
    let bestSimilarity = 0;

    for (let i = 0; i < clusters.length; i++) {
      const cluster = clusters[i];
      // 计算与簇中所有成员的平均相似度
      let totalSim = 0;
      for (const member of cluster) {
        totalSim += cosineSimilarity(page.embedding, member.embedding);
      }
      const avgSim = totalSim / cluster.length;

      if (avgSim > bestSimilarity && avgSim >= SIMILARITY_THRESHOLD) {
        bestSimilarity = avgSim;
        bestCluster = i;
      }
    }

    if (bestCluster >= 0) {
      clusters[bestCluster].push(page);
      assigned.add(page.pageId);
    } else {
      // 创建新簇（不超过上限）
      if (clusters.length < MAX_CLUSTERS) {
        clusters.push([page]);
        assigned.add(page.pageId);
      }
    }
  }

  // 4. 过滤掉太小的簇
  const validClusters = clusters.filter((c) => c.length >= MIN_CLUSTER_SIZE);

  // 5. 清空旧聚类数据，写入新结果
  await pool.query('TRUNCATE clusters RESTART IDENTITY CASCADE');

  const clusterReports: Array<{
    clusterId: string;
    name: string;
    memberCount: number;
  }> = [];

  for (const members of validClusters) {
    const clusterId = `cluster-${randomUUID().slice(0, 12)}`;
    // 用出现频率最高的上下文标签或首个成员标题作为簇名
    const titles = members.map((m) => titleMap.get(m.slug) || m.slug);
    const name = titles[0];

    await pool.query(
      `INSERT INTO clusters (cluster_id, name, lifecycle) VALUES ($1, $2, 'emerging')
       ON CONFLICT (cluster_id) DO NOTHING`,
      [clusterId, name]
    );

    // 写入成员关系
    for (const member of members) {
      await pool.query(
        `INSERT INTO cluster_members (cluster_id, slug) VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [clusterId, member.slug]
      );
    }

    clusterReports.push({
      clusterId,
      name,
      memberCount: members.length
    });
  }

  logger.info(
    { clusterCount: clusterReports.length, pagesAssigned: assigned.size },
    '主题聚类完成'
  );

  return {
    clustersCreated: clusterReports.length,
    pagesAssigned: assigned.size,
    clusters: clusterReports
  };
}

/**
 * 解析 PostgreSQL vector 类型文本表示 "[0.1,0.2,...]" 为 number[]
 */
function parseVector(text: string): number[] {
  const cleaned = text.replace(/^\[/, '').replace(/\]$/, '');
  return cleaned
    .split(',')
    .map((v) => Number.parseFloat(v.trim()))
    .filter((v) => !Number.isNaN(v));
}

/**
 * 计算两个向量的余弦相似度
 */
function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;

  return dot / denom;
}
