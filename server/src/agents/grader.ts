import { llmRouter } from '../llm/router';
import { readFileSync } from 'fs';
import { join } from 'path';
import logger from '../i18n/logger';
import type { LLMMessage, QueryResultItem, EvidenceSpan } from '@shared/index';
import type { RetrievalResult } from './retriever';

export interface GradeResult {
  factual_accuracy: number;
  coverage_completeness: number;
  source_clarity: number;
  evidence_coverage: number;
  overall: number;
  reasoning: string;
}

const graderPrompt = loadPrompt('grader.zh-CN.md');

function loadPrompt(name: string): string {
  try {
    return readFileSync(join(process.cwd(), 'skills/prompts', name), 'utf-8');
  } catch {
    try {
      return readFileSync(join(__dirname, '../../skills/prompts', name), 'utf-8');
    } catch {
      return '';
    }
  }
}

export async function grade(
  question: string,
  retrievalResult: RetrievalResult
): Promise<GradeResult> {
  const context = buildContext(question, retrievalResult);

  const messages: LLMMessage[] = [
    { role: 'system', content: graderPrompt },
    { role: 'user', content: context }
  ];

  try {
    const adapter = llmRouter.route('qa_gen');
    const response = await adapter.chat({ messages, jsonMode: true, temperature: 0.2 });
    return parseGradeResponse(response.content);
  } catch (err) {
    logger.warn({ err }, '评分失败，使用默认分数');
    return {
      factual_accuracy: 0.5,
      coverage_completeness: 0.5,
      source_clarity: 0.5,
      evidence_coverage: 0.5,
      overall: 0.5,
      reasoning: '评分服务不可用，使用默认分数'
    };
  }
}

function buildContext(question: string, result: RetrievalResult): string {
  const itemsText = result.items.map((item, i) =>
    `### 结果 ${i + 1}: ${item.title}\nslug: ${item.slug}\n摘要: ${item.snippet}\n分数: ${item.score}`
  ).join('\n\n');

  const evidenceText = result.evidence.length > 0
    ? `\n\n## 证据片段 (${result.evidence.length} 条)\n` +
      result.evidence.map(e => `- [${e.span_id}] ${e.span_text.substring(0, 80)}...`).join('\n')
    : '\n\n## 证据片段\n无可用证据';

  return `## 用户问题\n${question}\n\n## 检索结果 (${result.items.length} 条)\n${itemsText}${evidenceText}`;
}

function parseGradeResponse(content: string): GradeResult {
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        factual_accuracy: parsed.factual_accuracy || 0.5,
        coverage_completeness: parsed.coverage_completeness || 0.5,
        source_clarity: parsed.source_clarity || 0.5,
        evidence_coverage: parsed.evidence_coverage || 0.5,
        overall: parsed.overall || 0.5,
        reasoning: parsed.reasoning || ''
      };
    }
  } catch {
    logger.warn('无法解析评分响应');
  }

  return {
    factual_accuracy: 0.5,
    coverage_completeness: 0.5,
    source_clarity: 0.5,
    evidence_coverage: 0.5,
    overall: 0.5,
    reasoning: '解析失败'
  };
}
