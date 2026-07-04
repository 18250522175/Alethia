import { llmRouter } from '../llm/router';
import { getPool } from '../db/pool';
import logger from '../i18n/logger';
import type { LLMMessage } from '@shared/index';
import { randomUUID } from 'crypto';

const DEFAULT_OBSERVE_THRESHOLD = 3;

const FACT_EXTRACT_SYSTEM_PROMPT = `你是事实抽取器。请从给定的证据片段中识别尚未结构化的关键事实，并生成 pending_diff 候选项。

输出 JSON 数组，每个元素结构如下：
{
  "field": "字段名（如 title / state / threads / relations 等）",
  "newValue": "结构化的新值",
  "context": "上下文说明",
  "evidenceSpanId": "对应 evidence_spans 的 span_id",
  "confidence": 0.0-1.0,
  "impact": "low" | "medium" | "high",
  "tier": "green" | "yellow" | "red"
}

要求：
1. 仅输出确有信息增量的事实，避免重复已有结构化数据
2. 缺乏证据或置信度低时返回空数组 []
3. 不要附加任何解释性文本，仅输出 JSON`;

export async function observeFile(fileHash: string): Promise<void> {
  if (!fileHash) return;

  const pool = getPool();
  try {
    await pool.query(
      `INSERT INTO observed_files (file_hash, reference_count, first_referenced_at, last_referenced_at)
       VALUES ($1, 1, NOW(), NOW())
       ON CONFLICT (file_hash)
       DO UPDATE SET
         reference_count = observed_files.reference_count + 1,
         last_referenced_at = NOW()`,
      [fileHash]
    );

    logger.debug({ fileHash }, '已记录文件引用观察');
  } catch (err) {
    logger.warn({ err, fileHash }, '记录文件观察失败');
  }
}

export async function checkObservedThreshold(
  fileHash: string,
  threshold?: number
): Promise<boolean> {
  const limit = threshold ?? DEFAULT_OBSERVE_THRESHOLD;

  try {
    const pool = getPool();
    const result = await pool.query(
      `SELECT reference_count FROM observed_files WHERE file_hash = $1`,
      [fileHash]
    );

    if (result.rows.length === 0) return false;
    return (result.rows[0].reference_count ?? 0) >= limit;
  } catch (err) {
    logger.warn({ err, fileHash }, '检查观察阈值失败');
    return false;
  }
}

export async function extractFacts(fileHash: string): Promise<{ diffsCreated: number }> {
  const spans = await loadEvidenceSpans(fileHash);
  if (spans.length === 0) {
    logger.info({ fileHash }, '文件无证据片段，跳过事实抽取');
    return { diffsCreated: 0 };
  }

  const context = spans.map(s =>
    `### span_id=${s.span_id} | slug=${s.slug} | lang=${s.lang}\n${s.span_text}`
  ).join('\n\n');

  const llmMessages: LLMMessage[] = [
    { role: 'system', content: FACT_EXTRACT_SYSTEM_PROMPT },
    { role: 'user', content: `## 文件 hash: ${fileHash}\n\n## 证据片段 (${spans.length} 条)\n${context}` }
  ];

  let diffCandidates: any[] = [];
  try {
    const adapter = llmRouter.route('fact_extract');
    const response = await adapter.chat({
      messages: llmMessages,
      jsonMode: true,
      temperature: 0.1
    });
    diffCandidates = parseDiffArray(response.content);
  } catch (err) {
    logger.warn({ err, fileHash }, '事实抽取 LLM 调用失败，跳过本轮抽取');
    return { diffsCreated: 0 };
  }

  if (diffCandidates.length === 0) {
    await markFileStatus(fileHash, 'fully_extracted');
    logger.info({ fileHash }, '事实抽取未产生新 diff，标记为 fully_extracted');
    return { diffsCreated: 0 };
  }

  const inserted = await persistPendingDiffs(fileHash, diffCandidates);
  await markFileStatus(fileHash, 'partially_extracted');

  logger.info({ fileHash, inserted }, '事实抽取完成并写入 pending_diffs');
  return { diffsCreated: inserted };
}

interface EvidenceSpanRow {
  span_id: string;
  slug: string;
  span_text: string;
  lang: string;
}

async function loadEvidenceSpans(fileHash: string): Promise<EvidenceSpanRow[]> {
  try {
    const pool = getPool();
    const result = await pool.query(
      `SELECT span_id, slug, span_text, lang
       FROM evidence_spans
       WHERE source_file_hash = $1
       ORDER BY source_text_offset ASC`,
      [fileHash]
    );

    return result.rows.map((row: any) => ({
      span_id: row.span_id,
      slug: row.slug,
      span_text: row.span_text,
      lang: row.lang || 'zh-CN'
    }));
  } catch (err) {
    logger.warn({ err, fileHash }, '加载证据片段失败');
    return [];
  }
}

function parseDiffArray(content: string): any[] {
  try {
    const trimmed = content.trim();
    const arrayMatch = trimmed.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      const parsed = JSON.parse(arrayMatch[0]);
      return Array.isArray(parsed) ? parsed : [];
    }
    const objMatch = trimmed.match(/\{[\s\S]*\}/);
    if (objMatch) {
      const parsed = JSON.parse(objMatch[0]);
      return Array.isArray(parsed) ? parsed : [parsed];
    }
  } catch {
    logger.warn('无法解析事实抽取响应为 JSON');
  }
  return [];
}

async function persistPendingDiffs(fileHash: string, candidates: any[]): Promise<number> {
  const pool = getPool();
  let inserted = 0;

  for (const c of candidates) {
    const id = randomUUID();
    const slug = String(c.slug || deriveSlugFromSpans(fileHash));
    const type = String(c.type || 'state');
    const payload = {
      field: String(c.field || ''),
      newValue: c.newValue ?? '',
      oldValue: c.oldValue,
      context: c.context ?? '',
      evidenceSpanId: c.evidenceSpanId ?? ''
    };
    const confidence = Number(c.confidence) || 0;
    const impact = (c.impact === 'high' || c.impact === 'medium' || c.impact === 'low')
      ? c.impact : 'low';
    const tier = (c.tier === 'green' || c.tier === 'yellow' || c.tier === 'red')
      ? c.tier : 'yellow';

    try {
      await pool.query(
        `INSERT INTO pending_diffs (id, slug, type, payload, confidence, impact, tier, created_at, resolved)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), FALSE)`,
        [id, slug, type, JSON.stringify(payload), confidence, impact, tier]
      );
      inserted++;
    } catch (err) {
      logger.warn({ err, id, slug }, '写入 pending_diff 失败，跳过该项');
    }
  }

  return inserted;
}

function deriveSlugFromSpans(fileHash: string): string {
  return `observed:${fileHash.slice(0, 12)}`;
}

async function markFileStatus(fileHash: string, status: 'partially_extracted' | 'fully_extracted'): Promise<void> {
  try {
    const pool = getPool();
    await pool.query(
      `UPDATE library_files SET status = $1 WHERE hash = $2`,
      [status, fileHash]
    );
  } catch (err) {
    logger.warn({ err, fileHash, status }, '更新 library_files 状态失败');
  }
}
