/**
 * ConversationService · 对话历史与反馈服务
 *
 * 职责：列出对话（分页）、读取单条对话消息、提交反馈。
 * 本服务是 P2-2 Drizzle 迁移的示范：所有数据访问通过 ConversationRepository 完成，
 * 不再直接持有 pg.Pool。后续其他 Service 可按相同模式逐步迁移。
 *
 * 对应原 BrainAPI.getConversation / listConversations / submitFeedback。
 */

import { submitFeedback as submitFeedbackAgent } from '../../agents/feedback';
import { ConversationRepository } from '../../db/repositories';
import logger from '../../i18n/logger';

export class ConversationService {
  // 通过构造函数注入 Repository，便于测试时替换为 mock。
  constructor(private readonly conversationRepo = new ConversationRepository()) {}

  /** 读取单条对话的所有消息，按时间正序返回。 */
  async getConversation(conversationId: string): Promise<any[]> {
    try {
      return await this.conversationRepo.findByConversationId(conversationId);
    } catch (err) {
      logger.warn({ err }, '获取对话记录失败');
      return [];
    }
  }

  /**
   * 列出对话历史（分页）。
   * 按 conversation_id 分组，返回每个对话的摘要信息。
   */
  async listConversations(params?: { limit?: number; offset?: number }): Promise<{
    items: Array<{
      id: string;
      title: string;
      preview: string;
      updatedAt: string;
      messageCount: number;
      compressed?: boolean;
    }>;
    total: number;
    hasMore: boolean;
  }> {
    try {
      const limit = params?.limit || 20;
      const offset = params?.offset || 0;
      return await this.conversationRepo.listConversations({ limit, offset });
    } catch (err) {
      logger.warn({ err }, '获取对话列表失败');
      return { items: [], total: 0, hasMore: false };
    }
  }

  /** 提交用户反馈（helpful / wrong），用于离线评估与模型调优。 */
  async submitFeedback(params: {
    conversationId: string;
    messageId: string;
    feedback: 'helpful' | 'wrong';
    note?: string;
  }): Promise<{ success: boolean }> {
    try {
      await submitFeedbackAgent(params);
      return { success: true };
    } catch (err) {
      logger.error({ err }, '提交反馈失败');
      return { success: false };
    }
  }
}
