import { getPool } from '../db/pool';
import logger from '../i18n/logger';

export interface FeedbackParams {
  conversationId: string;
  messageId: string;
  feedback: 'helpful' | 'wrong';
  note?: string;
}

const CITE_PATTERN = /\[\^([^\]]+)\]/g;

export async function submitFeedback(params: FeedbackParams): Promise<void> {
  const { conversationId, messageId, feedback, note } = params;

  try {
    const message = await loadMessage(conversationId, messageId);
    if (!message) {
      logger.warn({ conversationId, messageId }, '反馈对应的消息不存在');
      return;
    }

    if (feedback === 'helpful') {
      logger.info({ conversationId, messageId }, '收到正向反馈，无需进一步处理');
      return;
    }

    const citedSpanIds = extractCitedSpanIds(message.content);

    await Promise.all([
      writeShadowBenchmark(message, note),
      markSourceFilesPartiallyExtracted(citedSpanIds)
    ]);

    logger.info(
      { conversationId, messageId, citedSpanIds: citedSpanIds.length },
      '纠错反馈已记录并完成反哺'
    );
  } catch (err) {
    logger.error({ err, params }, '提交反馈失败');
  }
}

interface MessageRow {
  id: string;
  conversationId: string;
  role: string;
  content: string;
}

async function loadMessage(conversationId: string, messageId: string): Promise<MessageRow | null> {
  try {
    const pool = getPool();
    const numericId = Number(messageId);
    const result = await pool.query(
      `SELECT id, conversation_id, role, content
       FROM conversation_logs
       WHERE conversation_id = $1 AND id = $2`,
      [conversationId, numericId]
    );

    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      id: String(row.id),
      conversationId: row.conversation_id,
      role: row.role,
      content: row.content
    };
  } catch (err) {
    logger.warn({ err, conversationId, messageId }, '加载反馈消息失败');
    return null;
  }
}

function extractCitedSpanIds(content: string): string[] {
  const ids = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = CITE_PATTERN.exec(content)) !== null) {
    const id = match[1].trim();
    if (id) ids.add(id);
  }
  return [...ids];
}

async function writeShadowBenchmark(message: MessageRow, note?: string): Promise<void> {
  try {
    const pool = getPool();
    const expectedOutput = (note && note.trim().length > 0)
      ? note.trim()
      : '（用户未提供期望输出）';

    await pool.query(
      `INSERT INTO shadow_benchmarks (type, slug, source_text, expected_output, git_commit)
       VALUES ($1, $2, $3, $4, NULL)`,
      [
        'correction',
        `conv:${message.conversationId}`,
        message.content,
        expectedOutput
      ]
    );
  } catch (err) {
    logger.warn({ err, conversationId: message.conversationId }, '写入 shadow_benchmark 失败');
  }
}

async function markSourceFilesPartiallyExtracted(spanIds: string[]): Promise<void> {
  if (spanIds.length === 0) return;

  try {
    const pool = getPool();
    const result = await pool.query(
      `SELECT DISTINCT source_file_hash
       FROM evidence_spans
       WHERE span_id = ANY($1::text[])
         AND source_file_hash IS NOT NULL
         AND source_file_hash <> ''`,
      [spanIds]
    );

    const hashes: string[] = result.rows.map((r: any) => r.source_file_hash);
    if (hashes.length === 0) {
      logger.debug({ spanIds }, '未找到对应源文件 hash');
      return;
    }

    await pool.query(
      `UPDATE library_files
       SET status = 'partially_extracted'
       WHERE hash = ANY($1::text[])
         AND status NOT IN ('fully_extracted', 'superseded')`,
      [hashes]
    );

    logger.info({ hashes }, '已将相关源文件标记为 partially_extracted');
  } catch (err) {
    logger.warn({ err, spanIds }, '标记源文件状态失败');
  }
}
