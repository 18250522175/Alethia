import type { LLMMessage } from '@shared/index';
import type { GradeResult } from './grader';
import logger from '../i18n/logger';
import { llmRouter } from '../llm/router';
import { loadPrompt, parseJSONResponse } from './utils';

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
    entities.forEach((e) => this.totalEntities.add(e));
  }

  trackEvidence(evidenceIds: string[]): void {
    evidenceIds.forEach((e) => this.totalEvidence.add(e));
  }

  async reflect(
    grade: GradeResult,
    newEntities: string[],
    newEvidenceIds: string[]
  ): Promise<ReflectionResult> {
    this.roundCount++;
    const elapsed = Date.now() - this.startTime;

    const prevEntityCount = this.totalEntities.size;
    const prevEvidenceCount = this.totalEvidence.size;

    newEntities.forEach((e) => this.totalEntities.add(e));
    newEvidenceIds.forEach((e) => this.totalEvidence.add(e));

    const newEntityCount = this.totalEntities.size - prevEntityCount;
    const newEvidenceCount = this.totalEvidence.size - prevEvidenceCount;

    const hasGain = newEntityCount > 0 || newEvidenceCount > 0;
    this.consecutiveNoGain = hasGain ? 0 : this.consecutiveNoGain + 1;

    const messages: LLMMessage[] = [
      { role: 'system', content: reflectorPrompt },
      {
        role: 'user',
        content: JSON.stringify(
          {
            round: this.roundCount,
            grade,
            new_entities_count: newEntityCount,
            new_evidence_count: newEvidenceCount,
            total_entities: this.totalEntities.size,
            total_evidence: this.totalEvidence.size
          },
          null,
          2
        )
      }
    ];

    let reflection: ReflectionResult;

    try {
      const adapter = llmRouter.route('qa_gen');
      const response = await adapter.chat({ messages, jsonMode: true, temperature: 0.1 });
      reflection = parseJSONResponse<ReflectionResult>(
        response.content,
        ruleBasedReflection(grade, newEntityCount, newEvidenceCount, this.consecutiveNoGain)
      );
      reflection.new_entities_count = newEntityCount;
      reflection.new_evidence_count = newEvidenceCount;
    } catch (err) {
      logger.warn({ err }, '反思器 LLM 调用失败，使用规则判断');
      reflection = ruleBasedReflection(
        grade,
        newEntityCount,
        newEvidenceCount,
        this.consecutiveNoGain
      );
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

    logger.info(
      {
        round: this.roundCount,
        should_continue: reflection.should_continue,
        completeness: reflection.completeness,
        next_action: reflection.next_action
      },
      '反思完成'
    );

    return reflection;
  }
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

// Reflector 应作为请求级实例使用，见 BrainAPI.askQuestion()
