import { llmRouter } from '../llm/router';
import { getPool } from '../db/pool';
import logger from '../i18n/logger';
import type { LLMMessage, EvidenceTranslation } from '@shared/index';

const DEFAULT_TARGET_LANG = 'zh-CN';
const CACHE_TTL_DAYS = 90;
const CACHE_TTL_MS = CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;

export async function translateEvidence(
  spanIds: string[],
  targetLang: string = DEFAULT_TARGET_LANG
): Promise<EvidenceTranslation[]> {
  if (spanIds.length === 0) return [];

  const spans = await loadEvidenceSpans(spanIds);
  if (spans.length === 0) return [];

  const toTranslate = spans.filter(s => s.lang !== targetLang);
  const alreadyMatched = spans
    .filter(s => s.lang === targetLang)
    .map(s => ({
      spanId: s.span_id,
      sourceText: s.span_text,
      translatedText: s.span_text,
      lang: targetLang,
      model: 'passthrough',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + CACHE_TTL_MS).toISOString()
    }));

  if (toTranslate.length === 0) {
    return alreadyMatched;
  }

  const cached = await loadCachedTranslations(
    toTranslate.map(s => s.span_id),
    targetLang
  );
  const cachedBySpanId = new Map(cached.map(c => [c.spanId, c]));

  const pending = toTranslate.filter(s => !cachedBySpanId.has(s.span_id));
  const results: EvidenceTranslation[] = [...alreadyMatched, ...cached];

  if (pending.length === 0) {
    logger.info({ cached: cached.length }, '命中翻译缓存，无需调用 LLM');
    return results;
  }

  const llmTranslations = await callLlmTranslate(pending, targetLang);

  for (const span of pending) {
    const translated = llmTranslations.get(span.span_id);
    const translatedText = translated ?? buildFallbackTranslation(span, targetLang);
    const model = translated ? (llmTranslations.get(`${span.span_id}__model`) as string) || 'unknown' : 'fallback';

    const entry: EvidenceTranslation = {
      spanId: span.span_id,
      sourceText: span.span_text,
      translatedText,
      lang: targetLang,
      model,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + CACHE_TTL_MS).toISOString()
    };

    results.push(entry);
  }

  // 批量持久化所有翻译结果
  await persistTranslationsBatch(results.slice(-pending.length));

  logger.info(
    { requested: spanIds.length, translated: pending.length, cached: cached.length },
    '证据翻译完成'
  );

  return results;
}

export async function getTranslation(spanId: string): Promise<EvidenceTranslation | null> {
  if (!spanId) return null;

  try {
    const pool = getPool();
    const result = await pool.query(
      `SELECT span_id, source_text, translated_text, lang, model, created_at, expires_at
       FROM evidence_translations
       WHERE span_id = $1
         AND expires_at > NOW()
       ORDER BY created_at DESC
       LIMIT 1`,
      [spanId]
    );

    if (result.rows.length === 0) return null;
    return mapRow(result.rows[0]);
  } catch (err) {
    logger.warn({ err, spanId }, '查询翻译缓存失败');
    return null;
  }
}

interface EvidenceSpanRow {
  span_id: string;
  slug: string;
  span_text: string;
  lang: string;
}

async function loadEvidenceSpans(spanIds: string[]): Promise<EvidenceSpanRow[]> {
  try {
    const pool = getPool();
    const result = await pool.query(
      `SELECT span_id, slug, span_text, lang
       FROM evidence_spans
       WHERE span_id = ANY($1::text[])`,
      [spanIds]
    );

    return result.rows.map((row: any) => ({
      span_id: row.span_id,
      slug: row.slug,
      span_text: row.span_text,
      lang: row.lang || 'zh-CN'
    }));
  } catch (err) {
    logger.warn({ err, spanIds }, '加载证据片段失败');
    return [];
  }
}

async function loadCachedTranslations(
  spanIds: string[],
  targetLang: string
): Promise<EvidenceTranslation[]> {
  if (spanIds.length === 0) return [];

  try {
    const pool = getPool();
    const result = await pool.query(
      `SELECT span_id, source_text, translated_text, lang, model, created_at, expires_at
       FROM evidence_translations
       WHERE span_id = ANY($1::text[])
         AND lang = $2
         AND expires_at > NOW()
       ORDER BY created_at DESC`,
      [spanIds, targetLang]
    );

    const seen = new Set<string>();
    const translations: EvidenceTranslation[] = [];
    for (const row of result.rows) {
      if (seen.has(row.span_id)) continue;
      seen.add(row.span_id);
      translations.push(mapRow(row));
    }
    return translations;
  } catch (err) {
    logger.warn({ err, spanIds }, '加载翻译缓存失败');
    return [];
  }
}

async function callLlmTranslate(
  spans: EvidenceSpanRow[],
  targetLang: string
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  let model = 'unknown';

  const context = spans.map(s =>
    `### spanId=${s.span_id} | sourceLang=${s.lang}\n${s.span_text}`
  ).join('\n\n');

  const targetLangLabel = targetLang === 'zh-CN' ? '中文（zh-CN）' : targetLang === 'en' ? 'English (en)' : targetLang;
  const systemPrompt = `你是证据翻译器。请将给定的证据片段翻译为${targetLangLabel}，要求：
1. 保留专业术语的准确性，必要时在括号中保留原文
2. 保留原文中的数字、代码、引用标记（如 [^span_id]）
3. 仅输出翻译后的纯文本，不要附加任何解释

输出 JSON 数组，每个元素形如：
[{"spanId":"span-xxx","translatedText":"翻译内容"}]`;

  const llmMessages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `请将以下证据片段翻译为 ${targetLangLabel}：\n\n${context}` }
  ];

  try {
    const adapter = llmRouter.route('translate');
    const response = await adapter.chat({
      messages: llmMessages,
      jsonMode: true,
      temperature: 0.1
    });
    model = response.model || model;

    const parsed = parseTranslationArray(response.content);
    for (const item of parsed) {
      const id = String(item.spanId || '').trim();
      const text = String(item.translatedText || '').trim();
      if (id && text) {
        result.set(id, text);
        result.set(`${id}__model`, model);
      }
    }
  } catch (err) {
    logger.warn({ err, count: spans.length }, '翻译 LLM 调用失败，使用降级策略');
  }

  return result;
}

function parseTranslationArray(content: string): Array<{ spanId: string; translatedText: string }> {
  try {
    const trimmed = content.trim();
    const arrayMatch = trimmed.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      const parsed = JSON.parse(arrayMatch[0]);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((item: any) => item && typeof item === 'object')
          .map((item: any) => ({
            spanId: String(item.spanId ?? item.span_id ?? ''),
            translatedText: String(item.translatedText ?? item.translated_text ?? '')
          }));
      }
    }
  } catch {
    logger.warn('无法解析翻译响应为 JSON');
  }
  return [];
}

function buildFallbackTranslation(span: EvidenceSpanRow, _targetLang: string): string {
  return `[翻译降级] ${span.span_text.slice(0, 200)}`;
}

async function persistTranslation(entry: EvidenceTranslation): Promise<void> {
  await persistTranslationsBatch([entry]);
}

async function persistTranslationsBatch(entries: EvidenceTranslation[]): Promise<void> {
  if (entries.length === 0) return;

  const spanIds: string[] = [];
  const sourceTexts: string[] = [];
  const translatedTexts: string[] = [];
  const langs: string[] = [];
  const models: string[] = [];

  for (const e of entries) {
    spanIds.push(e.spanId);
    sourceTexts.push(e.sourceText);
    translatedTexts.push(e.translatedText);
    langs.push(e.lang);
    models.push(e.model);
  }

  try {
    const pool = getPool();
    await pool.query(
      `INSERT INTO evidence_translations (span_id, source_text, translated_text, lang, model, created_at, expires_at)
       SELECT * FROM UNNEST($1::text[], $2::text[], $3::text[], $4::text[], $5::text[])
       AS t(span_id, source_text, translated_text, lang, model)
       CROSS JOIN (VALUES (NOW(), NOW() + ($6::int || ' days')::interval)) AS ts(created_at, expires_at)`,
      [spanIds, sourceTexts, translatedTexts, langs, models, CACHE_TTL_DAYS]
    );
  } catch (err) {
    logger.warn({ err, count: entries.length }, '批量写入翻译缓存失败');
  }
}

function mapRow(row: any): EvidenceTranslation {
  return {
    spanId: row.span_id,
    sourceText: row.source_text,
    translatedText: row.translated_text,
    lang: row.lang,
    model: row.model,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    expiresAt: row.expires_at instanceof Date ? row.expires_at.toISOString() : String(row.expires_at)
  };
}
