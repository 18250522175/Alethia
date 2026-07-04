import { loadEnv } from '../config/loader';
import logger from '../i18n/logger';
import { llmRouter } from './router';

let localEmbedder: any = null;
let embedDimension: number = 384;
let embedProvider: string = 'local';
let embedModel: string = 'all-MiniLM-L6-v2';

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

export async function ensureEmbeddingDimension(targetDim: number): Promise<void> {
  if (embedDimension === targetDim) return;

  logger.warn(`嵌入维度不一致: 当前 ${embedDimension}维，目标 ${targetDim}维，需要执行迁移`);
}
