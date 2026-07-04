import { llmRouter } from '../llm/router';
import { readFileSync } from 'fs';
import { join } from 'path';
import logger from '../i18n/logger';
import type { LLMMessage } from '@shared/index';
import type { GradeResult } from './grader';

export interface ReflectionResult {
  should_continue: boolean;
  new_entities_count: number;
  new_evidence_count: number;
  completeness: number;
  gaps: string[];
  next_action: string;
}

const reflectorPrompt = loadPrompt('reflector.zh-CN.md');
const MAX_ROUNDS = 5;
const MAX_DURATION_MS = 3000;

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

export class Reflector {
  private roundCount = 0;
  private startTime = 0;
  private consecutiveNoGain = 0;
  private totalEntities = new Set<string>();
  private totalEvidence = new Set<string>();

  reset(): void {
    this.roundCount = 0;
    this.startTime = Date.now();
    this.consecutiveNoGain = 0;
    this.totalEntities.clear();
    this.totalEvidence.clear();
  }

  trackEntities(entities: string[]): void {
    entities.forEach(e => this.totalEntities.add(e));
  }

  trackEvidence(evidenceIds: string[]): void {
    evidenceIds.forEach(e => this.totalEvidence.add(e));
  }

  async reflect(grade: GradeResult, newEntities: string[], newEvidenceIds: string[]): Promise<ReflectionResult> {
    this.roundCount++;
    const elapsed = Date.now() - this.startTime;

    const prevEntityCount = this.totalEntities.size;
    const prevEvidenceCount = this.totalEvidence.size;

    newEntities.forEach(e => this.totalEntities.add(e));
    newEvidenceIds.forEach(e => this.totalEvidence.add(e));

    const newEntityCount = this.totalEntities.size - prevEntityCount;
    const newEvidenceCount = this.totalEvidence.size - prevEvidenceCount;

    const hasGain = newEntityCount > 0 || newEvidenceCount > 0;
    this.consecutiveNoGain = hasGain ? 0 : this.consecutiveNoGain + 1;

    const messages: LLMMessage[] = [
      { role: 'system', content: reflectorPrompt },
      {
        role: 'user',
        content: JSON.stringify({
          round: this.roundCount,
          grade,
          new_entities_count: newEntityCount,
          new_evidence_count: newEvidenceCount,
          total_entities: this.totalEntities.size,
          total_evidence: this.totalEvidence.size
        }, null, 2)
      }
    ];

    let reflection: ReflectionResult;

    try {
      const adapter = llmRouter.route('qa_gen');
      const response = await adapter.chat({ messages, jsonMode: true, temperature: 0.1 });
      reflection = parseReflectionResponse(response.content);
      reflection.new_entities_count = newEntityCount;
      reflection.new_evidence_count = newEvidenceCount;
    } catch (err) {
      logger.warn({ err }, '反思器 LLM 调用失败，使用规则判断');
      reflection = ruleBasedReflection(grade, newEntityCount, newEvidenceCount, this.consecutiveNoGain);
    }

    if (this.roundCount >= MAX_ROUNDS) {
      reflection.should_continue = false;
      reflection.next_action = `已达到 ${MAX_ROUNDS} 轮上限，停止检索`;
    }

    if (elapsed >= MAX_DURATION_MS) {
      reflection.should_continue = false;
      reflection.next_action = `已达到 ${MAX_DURATION_MS}ms 时间上限，停止检索`;
    }

    if (this.consecutiveNoGain >= 2) {
      reflection.should_continue = false;
      reflection.next_action = '连续两轮无信息增益，停止检索';
    }

    logger.info({
      round: this.roundCount,
      should_continue: reflection.should_continue,
      completeness: reflection.completeness,
      next_action: reflection.next_action
    }, '反思完成');

    return reflection;
  }
}

function parseReflectionResponse(content: string): ReflectionResult {
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        should_continue: parsed.should_continue ?? false,
        new_entities_count: parsed.new_entities_count ?? 0,
        new_evidence_count: parsed.new_evidence_count ?? 0,
        completeness: parsed.completeness ?? 0.5,
        gaps: parsed.gaps ?? [],
        next_action: parsed.next_action ?? '停止'
      };
    }
  } catch {
    logger.warn('无法解析反思器响应');
  }

  return {
    should_continue: false,
    new_entities_count: 0,
    new_evidence_count: 0,
    completeness: 0.5,
    gaps: [],
    next_action: '解析失败，停止'
  };
}

function ruleBasedReflection(
  grade: GradeResult,
  newEntityCount: number,
  newEvidenceCount: number,
  consecutiveNoGain: number
): ReflectionResult {
  const hasGain = newEntityCount > 0 || newEvidenceCount > 0;
  const shouldContinue = grade.overall < 0.8 && hasGain && consecutiveNoGain < 2;

  return {
    should_continue: shouldContinue,
    new_entities_count: newEntityCount,
    new_evidence_count: newEvidenceCount,
    completeness: grade.overall,
    gaps: grade.overall < 0.7 ? ['检索结果不够充分'] : [],
    next_action: shouldContinue ? '继续检索' : '停止检索'
  };
}

export const reflector = new Reflector();
