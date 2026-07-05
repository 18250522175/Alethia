/**
 * ConversationRepository · conversation_logs 表的访问层
 *
 * 提供按 conversation_id 维度的查询与摘要聚合，
 * 支持分页列出对话、读取单条对话消息、追加新消息。
 */

import { asc, eq, sql } from 'drizzle-orm';
import { type ConversationLog, conversationLogs, type NewConversationLog } from '../schema';
import { BaseRepository } from './base';

export interface ConversationSummary {
  id: string;
  title: string;
  preview: string;
  updatedAt: string;
  messageCount: number;
  compressed: boolean;
}

export interface ListConversationsResult {
  items: ConversationSummary[];
  total: number;
  hasMore: boolean;
}

export class ConversationRepository extends BaseRepository {
  /** 读取单条对话的所有消息，按时间正序返回。 */
  async findByConversationId(conversationId: string): Promise<ConversationLog[]> {
    return this.db
      .select()
      .from(conversationLogs)
      .where(eq(conversationLogs.conversationId, conversationId))
      .orderBy(asc(conversationLogs.ts));
  }

  /** 统计不同 conversation_id 的总数。 */
  async countDistinctConversations(): Promise<number> {
    const rows = await this.db
      .select({ count: sql<number>`COUNT(DISTINCT conversation_id)::int` })
      .from(conversationLogs);
    return rows[0]?.count ?? 0;
  }

  /**
   * 列出对话历史（分页）。
   * 通过 ARRAY_AGG 聚合首尾消息，避免多次查询。
   */
  async listConversations(params: {
    limit: number;
    offset: number;
  }): Promise<ListConversationsResult> {
    const { limit, offset } = params;

    const rows = await this.db.execute(sql`
      SELECT
        conversation_id as id,
        COUNT(*) as message_count,
        MAX(ts) as updated_at,
        (ARRAY_AGG(content ORDER BY ts ASC))[1] as first_message,
        (ARRAY_AGG(content ORDER BY ts DESC))[1] as last_message
      FROM ${conversationLogs}
      GROUP BY conversation_id
      ORDER BY MAX(ts) DESC
      LIMIT ${limit} OFFSET ${offset}
    `);

    const total = await this.countDistinctConversations();
    const items: ConversationSummary[] = (rows.rows ?? []).map((row: any) => {
      const firstMessage = row.first_message ?? '';
      const lastMessage = row.last_message ?? '';
      const messageCount = Number.parseInt(row.message_count, 10);
      return {
        id: row.id,
        title: firstMessage.length > 50 ? `${firstMessage.slice(0, 50)}...` : firstMessage,
        preview: lastMessage.length > 100 ? `${lastMessage.slice(0, 100)}...` : lastMessage,
        updatedAt: row.updated_at,
        messageCount,
        compressed: messageCount > 10
      };
    });

    return {
      items,
      total,
      hasMore: offset + limit < total
    };
  }

  /** 追加一条消息到指定对话。 */
  async appendMessage(payload: NewConversationLog): Promise<ConversationLog | null> {
    const rows = await this.db.insert(conversationLogs).values(payload).returning();
    return rows[0] ?? null;
  }
}
