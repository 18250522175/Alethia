import type { LLMMessage } from '@shared/index';
import logger from '../i18n/logger';
import { llmRouter } from '../llm/router';
import { loadPrompt, parseJSONResponse } from './utils';

export interface RetrievalPlan {
  keywords: string[];
  contexts: string[];
  depth: 'shallow' | 'medium' | 'deep';
  entities: string[];
}

const plannerPrompt = loadPrompt('planner.zh-CN.md');

export async function plan(question: string): Promise<RetrievalPlan> {
  const messages: LLMMessage[] = [
    { role: 'system', content: plannerPrompt },
    { role: 'user', content: question }
  ];

  try {
    const adapter = llmRouter.route('qa_gen');
    const response = await adapter.chat({ messages, jsonMode: true, temperature: 0.3 });

    const plan = parseJSONResponse<RetrievalPlan>(response.content, fallbackPlan(question));
    logger.info({ plan }, '检索计划生成完成');
    return plan;
  } catch (err) {
    logger.warn({ err }, 'LLM 规划失败，使用回退策略');
    return fallbackPlan(question);
  }
}

function fallbackPlan(question: string): RetrievalPlan {
  const keywords = question
    .replace(/[？?。.!！，,、的什么是在有哪些和与及]/g, ' ')
    .split(/\s+/)
    .filter((k) => k.length > 0)
    .slice(0, 5);

  return {
    keywords: keywords.length > 0 ? keywords : [question.slice(0, 10)],
    contexts: [],
    depth: 'medium',
    entities: []
  };
}
