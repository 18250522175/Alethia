import { llmRouter } from '../llm/router';
import { loadPrompt, withTimeout } from './utils';
import logger from '../i18n/logger';
import type { LLMMessage, EvidenceSpan } from '@shared/index';
import type { RetrievalResult } from './retriever';
import type { GradeResult } from './grader';

export interface GenerationResult {
  answer: string;
  tokensUsed: number;
  estimatedCost: number;
}

const generatorPrompt = loadPrompt('generator.zh-CN.md');

export async function generate(
  question: string,
  retrievalResult: RetrievalResult,
  grade: GradeResult,
  causalContext?: string,
): Promise<GenerationResult> {
  const context = buildGenerationContext(question, retrievalResult, grade, causalContext);

  const messages: LLMMessage[] = [
    { role: 'system', content: generatorPrompt },
    { role: 'user', content: context }
  ];

  try {
    const adapter = llmRouter.route('qa_gen');
    const response = await withTimeout(
      adapter.chat({
        messages,
        temperature: 0.4,
        maxTokens: 2000
      }),
      5 * 60 * 1000,
      'generate'
    );

    return {
      answer: response.content,
      tokensUsed: response.tokensUsed.total,
      estimatedCost: response.estimatedCost
    };
  } catch (err) {
    logger.error({ err }, '生成回答失败');
    return {
      answer: buildFallbackAnswer(question, retrievalResult),
      tokensUsed: 0,
      estimatedCost: 0
    };
  }
}

function buildGenerationContext(
  question: string,
  result: RetrievalResult,
  grade: GradeResult,
  causalContext?: string,
): string {
  const itemsText = result.items
    .map((item, i) => `### 知识片段 ${i + 1}: ${item.title}\n${item.snippet}`)
    .join('\n\n');

  const evidenceText = result.evidence.length > 0
    ? '\n\n## 可用证据片段\n' +
      result.evidence.map(e =>
        `- [${e.span_id}] 来源: ${e.original_location}\n  文本: "${e.span_text}"\n  语言: ${e.lang}`
      ).join('\n')
    : '\n\n## 可用证据片段\n（无可用证据，请基于知识片段回答）';

  const gradeText = `\n\n## 检索质量评估\n- 事实准确度: ${grade.factual_accuracy}\n- 覆盖完整度: ${grade.coverage_completeness}\n- 评估说明: ${grade.reasoning}`;

  const causalText = causalContext ? `\n\n${causalContext}` : '';

  return `## 用户问题\n${question}\n\n## 检索到的知识片段 (${result.items.length} 条)\n${itemsText}${evidenceText}${gradeText}${causalText}\n\n请根据以上信息生成回答，使用 [^span_id] 格式引用证据。`;
}

function buildFallbackAnswer(question: string, result: RetrievalResult): string {
  if (result.items.length === 0) {
    return `抱歉，当前知识库中未找到与「${question}」相关的内容。\n\n请尝试：\n1. 换用不同的关键词搜索\n2. 上传相关文档以扩展知识库\n3. 直接向 AI 提问`;
  }

  const topResults = result.items.slice(0, 3);
  const summary = topResults
    .map(item => {
      const safeSnippet = [...item.snippet].slice(0, 150).join('');
      return `**${item.title}**\n${safeSnippet}...`;
    })
    .join('\n\n');

  return `关于「${question}」，在知识库中找到了以下相关内容：\n\n${summary}\n\n*注意：当前 AI 生成服务不可用，以上为检索结果摘要。*`;
}
