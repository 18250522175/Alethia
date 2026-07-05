import { createHash } from 'node:crypto';
import { loadEnv } from '../config/loader';
import { getPool } from '../db/pool';
import logger from '../i18n/logger';

const HF_NLI_URL = 'https://api-inference.huggingface.co/models/roberta-large-mnli';
const LOCAL_NLI_MODEL = 'Xenova/roberta-large-mnli';

export type NliLabel = 'entailment' | 'contradiction' | 'neutral';

export interface NliResult {
  label: NliLabel;
  score: number;
}

interface NliCacheRow {
  label: string;
}

interface HfInferenceItem {
  label: string;
  score: number;
}

let localClassifier: any = null;

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function normalizeLabel(label: string): NliLabel {
  const lower = (label || '').toLowerCase();
  if (lower.startsWith('entail')) return 'entailment';
  if (lower.startsWith('contradict')) return 'contradiction';
  if (lower.startsWith('neutral')) return 'neutral';
  return 'neutral';
}

function pickTop(items: Array<{ label: string; score: number }>): { label: string; score: number } {
  return items.reduce((a, b) => (a.score > b.score ? a : b));
}

async function getCachedResult(premise: string, hypothesis: string): Promise<NliResult | null> {
  try {
    const pool = getPool();
    const hashA = sha256(premise);
    const hashB = sha256(hypothesis);
    const result = await pool.query<NliCacheRow>(
      'SELECT label FROM nli_cache WHERE hash_a = $1 AND hash_b = $2',
      [hashA, hashB]
    );
    if (result.rows.length > 0) {
      return { label: normalizeLabel(result.rows[0].label), score: 1.0 };
    }
  } catch (err) {
    logger.warn({ err }, 'NLI 缓存读取失败');
  }
  return null;
}

async function cacheResult(premise: string, hypothesis: string, label: NliLabel): Promise<void> {
  try {
    const pool = getPool();
    const hashA = sha256(premise);
    const hashB = sha256(hypothesis);
    await pool.query(
      `INSERT INTO nli_cache (hash_a, hash_b, label)
       VALUES ($1, $2, $3)
       ON CONFLICT (hash_a, hash_b) DO NOTHING`,
      [hashA, hashB, label]
    );
  } catch (err) {
    logger.warn({ err }, 'NLI 缓存写入失败');
  }
}

async function callHfInference(premise: string, hypothesis: string): Promise<NliResult> {
  const env = loadEnv();
  const response = await fetch(HF_NLI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.HF_API_KEY}`
    },
    body: JSON.stringify({
      inputs: `${premise}</s>${hypothesis}`
    })
  });

  if (!response.ok) {
    throw new Error(`HF Inference API 返回 ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as HfInferenceItem | HfInferenceItem[];
  const candidates = Array.isArray(data) ? data : [data];
  if (candidates.length === 0) {
    throw new Error('HF Inference API 返回数据为空');
  }

  const top = pickTop(candidates);
  return { label: normalizeLabel(top.label), score: top.score };
}

async function getLocalClassifier(): Promise<any> {
  if (!localClassifier) {
    try {
      const { pipeline } = await import('@xenova/transformers');
      localClassifier = await pipeline('text-classification', LOCAL_NLI_MODEL);
      logger.info('本地 NLI 模型加载完成: roberta-large-mnli');
    } catch (err) {
      logger.error({ err }, '本地 NLI 模型加载失败');
      throw new Error('NLI 模型不可用');
    }
  }
  return localClassifier;
}

async function callLocalNli(premise: string, hypothesis: string): Promise<NliResult> {
  const classifier = await getLocalClassifier();
  const output = await classifier(`${premise}</s>${hypothesis}`);
  const candidates: Array<{ label: string; score: number }> = Array.isArray(output)
    ? output
    : [output];
  if (candidates.length === 0) {
    throw new Error('本地 NLI 返回空结果');
  }
  const top = pickTop(candidates);
  return { label: normalizeLabel(top.label), score: top.score };
}

export async function nliCheck(premise: string, hypothesis: string): Promise<NliResult> {
  const cached = await getCachedResult(premise, hypothesis);
  if (cached) {
    return cached;
  }

  const env = loadEnv();
  let result: NliResult | null = null;

  // 优先调用 HF Inference API（需配置 NLI_PROVIDER=hf-inference 且持有 HF_API_KEY）
  if (env.NLI_PROVIDER === 'hf-inference' && env.HF_API_KEY) {
    try {
      result = await callHfInference(premise, hypothesis);
    } catch (err) {
      logger.warn({ err }, 'HF Inference NLI 调用失败，退化到本地 NLI');
    }
  }

  // 退化到本地 @xenova/transformers
  if (!result) {
    try {
      result = await callLocalNli(premise, hypothesis);
    } catch (err) {
      logger.error({ err }, '本地 NLI 调用失败，返回 neutral 默认值');
      return { label: 'neutral', score: 0.0 };
    }
  }

  await cacheResult(premise, hypothesis, result.label);
  return result;
}

export async function batchNli(
  pairs: Array<{ premise: string; hypothesis: string }>
): Promise<Array<{ label: string; score: number }>> {
  const results = await Promise.all(pairs.map((p) => nliCheck(p.premise, p.hypothesis)));
  return results.map((r) => ({ label: r.label, score: r.score }));
}
