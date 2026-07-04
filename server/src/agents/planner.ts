import { llmRouter } from '../llm/router';
import { readFileSync } from 'fs';
import { join } from 'path';
import logger from '../i18n/logger';
import type { LLMMessage } from '@shared/index';

export interface RetrievalPlan {
  keywords: string[];
  contexts: string[];
  depth: 'shallow' | 'medium' | 'deep';
  entities: string[];
}

const plannerPrompt = loadPrompt('planner.zh-CN.md');

function loadPrompt(name: string): string {
  try {
    return readFileSync(join(process.cwd(), 'skills/prompts', name), 'utf-8');
  } catch {
    try {
      return readFileSync(join(__dirname, '../../skills/prompts', name), 'utf-8');
    } catch {
      logger.warn({ name }, '提示词文件加载失败，使用空提示词');
      return '';
    }
  }
}

export async function plan(question: string): Promise<RetrievalPlan> {
  const messages: LLMMessage[] = [
    { role: 'system', content: plannerPrompt },
    { role: 'user', content: question }
  ];

  try {
    const adapter = llmRouter.route('qa_gen');
    const response = await adapter.chat({ messages, jsonMode: true, temperature: 0.3 });

    const plan = parsePlanResponse(response.content);
    logger.info({ plan }, '检索计划生成完成');
    return plan;
  } catch (err) {
    logger.warn({ err }, 'LLM 规划失败，使用回退策略');
    return fallbackPlan(question);
  }
}

function parsePlanResponse(content: string): RetrievalPlan {
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        keywords: parsed.keywords || [],
        contexts: parsed.contexts || [],
        depth: parsed.depth || 'medium',
        entities: parsed.entities || []
      };
    }
  } catch {
    logger.warn('无法解析规划器响应为 JSON');
  }
  return fallbackPlan(content);
}

function fallbackPlan(question: string): RetrievalPlan {
  const keywords = question
    .replace(/[？?。.!！，,、的什么是在是有哪些和与及]/g, ' ')
    .split(/\s+/)
    .filter(k => k.length > 0)
    .slice(0, 5);

  return {
    keywords: keywords.length > 0 ? keywords : [question.slice(0, 10)],
    contexts: [],
    depth: 'medium',
    entities: []
  };
}
