import { loadEnv } from '../config/loader';
import logger from '../i18n/logger';
import { llmRouter } from './router';
import { budgetManager } from '../evolution/budget';

let localEmbedder: any = null;
let embedDimension: number = 384;
let embedProvider: string = 'local';
let embedModel: string = 'all-MiniLM-L6-v2';

// 各厂商嵌入模型定价（美元 / 1K tokens）
const EMBEDDING_PRICING: Record<string, number> = {
  'text-embedding-v1': 0.0005,
  'text-embedding-v2': 0.0005,
  'embedding-2': 0.0005,
};

// 估算 token 数：中文约 1.5 字/token，英文约 1.3 token/词（GPT 系 tokenizer 均值），其余字符按 1 token/字符
function estimateTokens(text: string): number {
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const englishWords = text.replace(/[\u4e00-\u9fa5]/g, ' ').trim().split(/\s+/).filter(Boolean).length;
  return Math.ceil(chineseChars / 1.5 + englishWords * 1.3);
}

function estimateEmbeddingCost(model: string, tokens: number): number {
  const pricePerK = EMBEDDING_PRICING[model] ?? 0.0005;
  return (tokens / 1000) * pricePerK;
}

export async function getEmbedding(text: string): Promise<number[]> {
  const env = loadEnv();

  if (env.EMBEDDING_PROVIDER && env.EMBEDDING_PROVIDER !== 'local') {
    try {
      const assignment = llmRouter.getModelForTask('embed');
      if (assignment) {
        const adapter = llmRouter.getAdapter(assignment.adapterId);
        if (adapter) {
          const embedding = await adapter.embed(text);
          if (embedding.length > 0) {
            embedProvider = assignment.adapterId;
            embedModel = assignment.model;
            embedDimension = embedding.length;
            const tokens = estimateTokens(text);
            const cost = estimateEmbeddingCost(assignment.model, tokens);
            if (cost > 0) {
              budgetManager.recordUsage(tokens, cost, 'embedding');
            }
            return embedding;
          }
        }
      }
    } catch (err) {
      logger.warn({ err }, '厂商嵌入调用失败，回退到本地嵌入');
    }
  }

  return getLocalEmbedding(text);
}

async function getLocalEmbedding(text: string): Promise<number[]> {
  if (!localEmbedder) {
    try {
      const { pipeline } = await import('@xenova/transformers');
      localEmbedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
      logger.info('本地嵌入模型加载完成: all-MiniLM-L6-v2 (384 维)');
    } catch (err) {
      logger.error({ err }, '本地嵌入模型加载失败');
      throw new Error('嵌入模型不可用');
    }
  }

  const output = await localEmbedder(text, { pooling: 'mean', normalize: true });
  const embedding = Array.from(output.data) as number[];
  embedDimension = embedding.length;
  return embedding;
}

export function getEmbedDimension(): number {
  return embedDimension;
}

export function getEmbedProvider(): string {
  return embedProvider;
}

export function getEmbedModel(): string {
  return embedModel;
}

// ensureEmbeddingDimension 的实际实现在 ../db/dimension.ts，启动时由 index.ts 调用
