import { loadEnv } from '../config/loader';
import logger from '../i18n/logger';
import type { QueryResultItem } from '@shared/index';

const ZEROENTROPY_API_URL = 'https://api.zeroentropy.com/v1/rerank';
const RERANK_MODEL = 'rerank-2';

interface ZeroEntropyRerankResponse {
  results: Array<{ index: number; relevance_score: number }>;
}

export function isRerankerEnabled(): boolean {
  const env = loadEnv();
  return env.RERANKER_ENABLED && !!env.ZERANK_API_KEY;
}

export async function rerank(
  items: QueryResultItem[],
  query: string
): Promise<QueryResultItem[]> {
  if (!isRerankerEnabled() || items.length === 0) {
    return items;
  }

  const env = loadEnv();
  const documents = items.map(item => `${item.title}\n${item.snippet}`.trim());

  try {
    const response = await fetch(ZEROENTROPY_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.ZERANK_API_KEY}`
      },
      body: JSON.stringify({
        model: RERANK_MODEL,
        query,
        documents,
        top_n: items.length
      })
    });

    if (!response.ok) {
      logger.warn(
        { status: response.status, statusText: response.statusText },
        'ZeroEntropy rerank 调用失败，回退到原始排序'
      );
      return items;
    }

    const data = (await response.json()) as ZeroEntropyRerankResponse;
    if (!data.results || !Array.isArray(data.results)) {
      logger.warn('ZeroEntropy rerank 返回数据格式异常，回退到原始排序');
      return items;
    }

    const reranked = data.results
      .map(r => ({ item: items[r.index], score: r.relevance_score }))
      .filter(x => !!x.item)
      .sort((a, b) => b.score - a.score)
      .map(x => ({ ...x.item, score: x.score }));

    logger.info(
      { count: reranked.length, topScore: reranked[0]?.score },
      'ZeroEntropy rerank 完成'
    );

    return reranked;
  } catch (err) {
    logger.error({ err }, 'ZeroEntropy rerank 调用异常，回退到原始排序');
    return items;
  }
}
