import { llmRouter } from '../llm/router';
import { loadPrompt, parseJSONResponse, withTimeout } from './utils';
import logger from '../i18n/logger';
import type { LLMMessage } from '@shared/index';

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
    const response = await withTimeout(
      adapter.chat({ messages, jsonMode: true, temperature: 0.3 }),
      5 * 60 * 1000,
      'plan'
    );

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
    .replace(/[？?。.!！，,、的什么是在是有哪些和与及the\s+is\s+are\s+was\s+were\s+be\s+been\s+being\s+have\s+has\s+had\s+do\s+does\s+did\s+will\s+would\s+shall\s+should\s+may\s+might\s+must\s+can\s+could\s+this\s+that\s+these\s+those\s+a\s+an\s+in\s+on\s+at\s+to\s+for\s+of\s+from\s+by\s+with\s+about\s+between\s+through\s+during\s+before\s+after\s+above\s+below\s+up\s+down\s+out\s+off\s+over\s+under\s+again\s+further\s+then\s+once\s+here\s+there\s+when\s+where\s+which\s+who\s+whom\s+whose\s+not\s+only\s+own\s+same\s+so\s+than\s+too\s+very\s+just\s+also\s+now\s+how\s+all\s+both\s+each\s+few\s+more\s+most\s+other\s+some\s+such\s+no\s+nor\s+and\s+but\s+or\s+if\s+while\s+as\s+until\s+unless\s+because\s+into\s+through\s+during\s+its\s+it\s+my\s+your\s+our\s+their\s+me\s+him\s+her\s+us\s+them\s+itself\s+himself\s+herself\s+yourself\s+myself\s+themselves\s+ourselves\s+what\s+which\s+who\s+whom\s+this\s+that\s+these\s+those\s+am\s+is\s+are\s+was\s+were\s+be\s+been\s+being\s+have\s+has\s+had\s+having\s+do\s+does\s+did\s+doing\s+would\s+should\s+could\s+ought\s+might\s+must\s+can\s+will\s+shall\s+may]/g, ' ')
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
