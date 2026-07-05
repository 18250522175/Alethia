/**
 * BrainAPI · 服务门面（Facade）
 *
 * 本模块是 Alethia 后端所有业务能力的统一入口。
 * 自 P2-1 重构后，原本 1100+ 行的 BrainAPI 类被拆分为多个职责单一的 Service：
 *   - AskService         问答核心（Plan-Retrieve-Grade-Generate-Reflect 循环）
 *   - DiffService        变更审核与回滚、草稿生成
 *   - EvalService        评估报告与版本归档
 *   - DreamService       Dream Cycle 编排入口
 *   - IngestService      知识摄入（观察文件、抽取、翻译）
 *   - HealthService      健康仪表盘
 *   - WikiService        Wiki 页面读写与静态站点
 *   - ConversationService 对话历史与反馈
 *   - BudgetService      预算管理
 *   - QueryService       检索 / 图谱 / 时间线 / 搜索
 *   - ChangeLogService   变更日志聚合
 *
 * 设计原则：
 *   1. 保持单例 `brainAPI` 导出与原有方法签名完全不变，调用方零改动；
 *   2. BrainAPI 自身不持有业务逻辑，仅做转发，便于未来按需注入不同实现；
 *   3. 各 Service 可独立测试，单一职责。
 */

import type {
  ApplyResult,
  AskRequest,
  AskResponse,
  ExtractReport,
  HealthDashboard,
  QueryParams,
  QueryResult,
  RebuildReport,
  RollbackResult
} from '@shared/index';
import { AskService } from './services/ask';
import { BudgetService } from './services/budget';
import { ChangeLogService } from './services/changelog';
import { ConversationService } from './services/conversation';
import { DiffService } from './services/diff';
import { DreamService } from './services/dream';
import { EvalService } from './services/eval';
import { HealthService } from './services/health';
import { IngestService } from './services/ingest';
import { QueryService } from './services/query';
import { WikiService } from './services/wiki';

class BrainAPI {
  private askService = new AskService();
  private diffService = new DiffService();
  private evalService = new EvalService();
  private dreamService = new DreamService();
  private ingestService = new IngestService();
  private healthService = new HealthService();
  private wikiService = new WikiService();
  private conversationService = new ConversationService();
  private budgetService = new BudgetService();
  private queryService = new QueryService();
  private changeLogService = new ChangeLogService();

  // ===== Ask =====
  askQuestion(request: AskRequest): Promise<AskResponse> {
    return this.askService.askQuestion(request);
  }

  // ===== Query / Graph / Timeline / Search =====
  query(params: QueryParams): Promise<QueryResult> {
    return this.queryService.query(params);
  }

  getGraphData(): Promise<{ nodes: any[]; edges: any[] }> {
    return this.queryService.getGraphData();
  }

  getTimeline(params?: {
    slug?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ items: any[]; total: number }> {
    return this.queryService.getTimeline(params);
  }

  search(
    query: string
  ): Promise<{ pages: any[]; files: any[]; conversations: any[]; total: number }> {
    return this.queryService.search(query);
  }

  // ===== Diff =====
  getPendingDiffs(): Promise<any[]> {
    return this.diffService.getPendingDiffs();
  }

  applyDiff(diffId: string, approved: boolean): Promise<ApplyResult> {
    return this.diffService.applyDiff(diffId, approved);
  }

  rollbackAutoChange(batchId: string): Promise<RollbackResult> {
    return this.diffService.rollbackAutoChange(batchId);
  }

  generateDraft(params: {
    title: string;
    type?: string;
    contexts?: string[];
    sources?: string[];
  }): Promise<{ slug: string; content: string }> {
    return this.diffService.generateDraft(params);
  }

  // ===== Eval =====
  getEvalReport(): Promise<{ benchmarks: any[]; anomalies: any[]; summary: any; trend: any[] }> {
    return this.evalService.getEvalReport();
  }

  runShadowEval(): Promise<{
    passed: boolean;
    accuracy: number;
    reproductionRate: number;
    newErrors: number;
    errors: string[];
  }> {
    return this.evalService.runShadowEval();
  }

  archiveVersions(entitySlug?: string): Promise<{ archived: number }> {
    return this.evalService.archiveVersions(entitySlug);
  }

  // ===== Dream =====
  rebuildStruct(): Promise<RebuildReport> {
    return this.dreamService.rebuildStruct();
  }

  extractPending(): Promise<ExtractReport> {
    return this.dreamService.extractPending();
  }

  cleanGhostRelations(): Promise<{ cleaned: number }> {
    return this.dreamService.cleanGhostRelations();
  }

  // ===== Ingest =====
  listObservedFiles(): Promise<{ items: any[]; total: number }> {
    return this.ingestService.listObservedFiles();
  }

  triggerObservedExtraction(fileHash: string): Promise<{ diffsCreated: number }> {
    return this.ingestService.triggerObservedExtraction(fileHash);
  }

  translateEvidence(spanIds: string[], targetLang?: string): Promise<any[]> {
    return this.ingestService.translateEvidence(spanIds, targetLang);
  }

  getLibraryFile(hash: string): Promise<any> {
    return this.ingestService.getLibraryFile(hash);
  }

  // ===== Health =====
  getHealth(): Promise<HealthDashboard> {
    return this.healthService.getHealth();
  }

  // ===== Wiki =====
  getWikiPage(slug: string): Promise<any> {
    return this.wikiService.getWikiPage(slug);
  }

  updateWikiPage(slug: string, content: string): Promise<{ success: boolean; hash: string }> {
    return this.wikiService.updateWikiPage(slug, content);
  }

  generateStaticSite(options?: any): Promise<any> {
    return this.wikiService.generateStaticSite(options);
  }

  // ===== Conversation / Feedback =====
  getConversation(conversationId: string): Promise<any[]> {
    return this.conversationService.getConversation(conversationId);
  }

  listConversations(params?: { limit?: number; offset?: number }): Promise<{
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
    return this.conversationService.listConversations(params);
  }

  submitFeedback(params: {
    conversationId: string;
    messageId: string;
    feedback: 'helpful' | 'wrong';
    note?: string;
  }): Promise<{ success: boolean }> {
    return this.conversationService.submitFeedback(params);
  }

  // ===== Budget =====
  setDailyBudget(amount: number): Promise<{ success: boolean; dailyBudget: number }> {
    return this.budgetService.setDailyBudget(amount);
  }

  getRemainingBudget(): Promise<{
    daily: number;
    monthly: number;
    dailyLimit: number;
    monthlyLimit: number;
    tripped: boolean;
  }> {
    return this.budgetService.getRemainingBudget();
  }

  getBudgetAlerts(): Promise<{ items: any[]; total: number }> {
    return this.budgetService.getBudgetAlerts();
  }

  // ===== ChangeLog =====
  getChangeLog(params?: {
    limit?: number;
    op?: string;
  }): Promise<{ batches: any[]; total: number }> {
    return this.changeLogService.getChangeLog(params);
  }
}

export const brainAPI = new BrainAPI();
