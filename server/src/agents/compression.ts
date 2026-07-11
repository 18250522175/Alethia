import { llmRouter } from '../llm/router';
import { getPool } from '../db/pool';
import logger from '../i18n/logger';
import type { LLMMessage, ConversationMessage } from '@shared/index';

const DEFAULT_COMPRESSION_THRESHOLD = 5;

const COMPRESSION_SYSTEM_PROMPT = `你是对话历史压缩器。请将给定的多轮对话历史压缩为简洁的中文摘要，要求：
1. 保留关键事实、用户意图与已确认的结论
2. 丢弃寒暄、重复与无效信息
3. 摘要应便于下一轮 Planner 继续追问
4. 直接输出摘要正文，不要附加任何解释性前缀

输出格式：
[历史摘要]
<压缩后的摘要>

[下一轮追问建议]
<1-2 个可继续追问的方向>`;

export function shouldCompress(messageCount: number, threshold?: number): boolean {
  const limit = threshold ?? DEFAULT_COMPRESSION_THRESHOLD;
  return messageCount > limit;
}

export async function compressHistory(messages: ConversationMessage[]): Promise<string> {
  if (messages.length === 0) return '';

  const ordered = [...messages].sort((a, b) => {
    const ta = new Date(a.ts).getTime();
    const tb = new Date(b.ts).getTime();
    return ta - tb;
  });

  const transcript = ordered
    .map(m => `${m.role}: ${m.content}`)
    .join('\n');

  const llmMessages: LLMMessage[] = [
    { role: 'system', content: COMPRESSION_SYSTEM_PROMPT },
    { role: 'user', content: `## 待压缩对话历史 (${ordered.length} 条)\n${transcript}` }
  ];

  try {
    const adapter = llmRouter.route('compress');
    const response = await adapter.chat({
      messages: llmMessages,
      temperature: 0.2,
      maxTokens: 800
    });

    const summary = response.content.trim();
    logger.info({
      originalCount: ordered.length,
      summaryLength: summary.length,
      tokensUsed: response.tokensUsed.total
    }, '对话历史压缩完成');

    return injectIntoPlannerPrompt(summary);
  } catch (err) {
    logger.warn({ err }, '对话历史压缩失败，使用截断式摘要降级');
    return injectIntoPlannerPrompt(buildTruncatedSummary(ordered));
  }
}

function injectIntoPlannerPrompt(summary: string): string {
  return [
    '## 压缩后的对话历史（注入 Planner 提示）',
    summary,
    '',
    '## 指令',
    '请基于上述历史摘要继续规划下一轮检索，避免重复已确认的信息，聚焦未解决的关键问题。'
  ].join('\n');
}

function buildTruncatedSummary(messages: ConversationMessage[]): string {
  const userTurns = messages.filter(m => m.role === 'user');
  const assistantTurns = messages.filter(m => m.role === 'assistant');

  const lastUser = userTurns[userTurns.length - 1];
  const lastAssistant = assistantTurns[assistantTurns.length - 1];

  const parts: string[] = [];
  parts.push(`[历史摘要]`);
  parts.push(`- 历史轮次: ${userTurns.length} 轮用户提问`);
  if (lastUser) parts.push(`- 最近用户问题: ${truncate(lastUser.content, 200)}`);
  if (lastAssistant) parts.push(`- 最近回答要点: ${truncate(lastAssistant.content, 300)}`);
  parts.push('');
  parts.push('[下一轮追问建议]');
  parts.push('- 针对最近回答中未明确的细节继续追问');

  return parts.join('\n');
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + '...';
}

export async function loadConversationMessages(conversationId: string): Promise<ConversationMessage[]> {
  try {
    const pool = getPool();
    const result = await pool.query(
      `SELECT id, conversation_id, role, content, created_at as ts, tokens, cost
       FROM conversation_logs
       WHERE conversation_id = $1
       ORDER BY created_at ASC`,
      [conversationId]
    );

    return result.rows.map((row: any) => ({
      id: String(row.id),
      conversationId: row.conversation_id,
      role: row.role,
      content: row.content,
      ts: row.ts instanceof Date ? row.ts.toISOString() : String(row.ts),
      tokens: row.tokens ?? 0,
      cost: row.cost ?? 0
    }));
  } catch (err) {
    logger.warn({ err, conversationId }, '加载对话历史失败');
    return [];
  }
}
