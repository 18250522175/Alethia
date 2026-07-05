/**
 * AskService · 问答核心服务
 *
 * 职责：编排 Plan-Retrieve-Grade-Generate-Reflect 循环，
 * 生成回答并持久化对话记录；未配置 LLM 时降级为检索摘要。
 *
 * 对应原 BrainAPI.askQuestion / fallbackAnswer / getRelatedEntities / saveConversation。
 */

import type { AskRequest, AskResponse, EntityRef, EvidenceSpan } from '@shared/index';
import { generate } from '../../agents/generator';
import { grade } from '../../agents/grader';
import { plan } from '../../agents/planner';
import { Reflector } from '../../agents/reflector';
import { retrieve } from '../../agents/retriever';
import { getPool } from '../../db/pool';
import logger from '../../i18n/logger';
import { llmRouter } from '../../llm/router';
import { executeQuery } from '../../retrieval/router';

export class AskService {
  /**
   * 主问答入口：执行最多 maxReflections 轮的反思循环，
   * 在每一轮对 LLM 输出进行评分并决定是否继续。
   */
  async askQuestion(request: AskRequest): Promise<AskResponse> {
    const startTime = Date.now();
    const conversationId = request.conversationId || generateConversationId();

    logger.info({ question: request.question, conversationId }, '开始处理问答');

    const ref = new Reflector();
    ref.reset();

    const hasLlm = llmRouter.hasAnyConfigured();
    if (!hasLlm) {
      const fallbackResult = await this.fallbackAnswer(request.question);
      return {
        ...fallbackResult,
        conversationId,
        relatedEntities: [],
        confidence: 0,
        tokensUsed: 0,
        estimatedCost: 0
      };
    }

    let finalAnswer = '';
    let totalTokens = 0;
    let totalCost = 0;
    let bestGrade: any = null;
    let evidence: EvidenceSpan[] = [];
    let relatedEntities: EntityRef[] = [];

    const maxReflections = request.maxReflections || 3;

    for (let round = 0; round < maxReflections; round++) {
      const planResult = await plan(request.question);
      const retrievalResult = await retrieve(planResult);

      if (round === 0) {
        evidence = retrievalResult.evidence;
        relatedEntities = await this.getRelatedEntities(retrievalResult);
      }

      const gradeResult = await grade(request.question, retrievalResult);
      bestGrade = gradeResult;

      const generationResult = await generate(request.question, retrievalResult, gradeResult);
      finalAnswer = generationResult.answer;
      totalTokens += generationResult.tokensUsed;
      totalCost += generationResult.estimatedCost;

      ref.trackEntities(planResult.entities);
      ref.trackEvidence(retrievalResult.evidence.map((e) => e.span_id));

      const reflection = await ref.reflect(
        gradeResult,
        planResult.entities,
        retrievalResult.evidence.map((e) => e.span_id)
      );

      if (!reflection.should_continue) {
        break;
      }
    }

    const durationMs = Date.now() - startTime;
    logger.info({ durationMs, tokensUsed: totalTokens, cost: totalCost }, '问答处理完成');

    await this.saveConversation(
      conversationId,
      request.question,
      finalAnswer,
      totalTokens,
      totalCost
    );

    return {
      answer: finalAnswer,
      sources: evidence,
      confidence: bestGrade?.overall || 0,
      relatedEntities,
      conversationId,
      tokensUsed: totalTokens,
      estimatedCost: totalCost
    };
  }

  /**
   * LLM 未配置时的降级回答：返回检索结果摘要并提示用户配置模型。
   */
  private async fallbackAnswer(
    question: string
  ): Promise<{ answer: string; sources: EvidenceSpan[] }> {
    const queryResult = await executeQuery({ query: question, topK: 5 });

    if (queryResult.items.length === 0) {
      return {
        answer: `抱歉，当前知识库中未找到与「${question}」相关的内容。请尝试上传相关文档或使用不同的关键词搜索。`,
        sources: []
      };
    }

    const summary = queryResult.items
      .map((item, i) => `### ${i + 1}. ${item.title}\n${item.snippet}`)
      .join('\n\n');

    return {
      answer: `关于「${question}」，在知识库中找到了以下相关内容：\n\n${summary}\n\n*注意：当前未配置大模型，以上为检索结果摘要。请在设置中配置大模型以启用智能问答。*`,
      sources: []
    };
  }

  /**
   * 从检索结果中提取相关实体（前 5 条命中 + 前 3 个图谱上下文）。
   */
  private async getRelatedEntities(retrievalResult: any): Promise<EntityRef[]> {
    const entities: EntityRef[] = [];
    const seen = new Set<string>();

    for (const item of retrievalResult.items.slice(0, 5)) {
      if (!seen.has(item.slug)) {
        entities.push({ slug: item.slug, title: item.title });
        seen.add(item.slug);
      }
    }

    for (const ctxSlug of retrievalResult.graphContext.slice(0, 3)) {
      if (!seen.has(ctxSlug)) {
        try {
          const pool = getPool();
          const result = await pool.query('SELECT slug, title FROM pages WHERE slug = $1', [
            ctxSlug
          ]);
          if (result.rows.length > 0) {
            entities.push({ slug: result.rows[0].slug, title: result.rows[0].title });
            seen.add(ctxSlug);
          }
        } catch {
          /* 忽略查询失败 */
        }
      }
    }

    return entities;
  }

  /**
   * 持久化对话记录：分别写入 user / assistant 两条消息。
   */
  private async saveConversation(
    conversationId: string,
    question: string,
    answer: string,
    tokens: number,
    cost: number
  ): Promise<void> {
    try {
      const pool = getPool();
      await pool.query(
        `INSERT INTO conversation_logs (conversation_id, role, content, tokens, cost)
         VALUES ($1, 'user', $2, 0, 0)`,
        [conversationId, question]
      );
      await pool.query(
        `INSERT INTO conversation_logs (conversation_id, role, content, tokens, cost)
         VALUES ($1, 'assistant', $2, $3, $4)`,
        [conversationId, answer, tokens, cost]
      );
    } catch (err) {
      logger.warn({ err }, '保存对话记录失败');
    }
  }
}

function generateConversationId(): string {
  return `conv-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}
