import type { LLMAdapter, ModelTier, AdapterStatus, AdapterId } from '@shared/index';
import { BailianAdapter } from './adapters/bailian';
import { ZhipuAdapter } from './adapters/zhipu';
import { MoonshotAdapter } from './adapters/moonshot';
import { ErnieAdapter } from './adapters/ernie';
import { SparkAdapter } from './adapters/spark';
import { HunyuanAdapter } from './adapters/hunyuan';
import { MiniMaxAdapter } from './adapters/minimax';
import { DeepSeekAdapter } from './adapters/deepseek';
import { YiAdapter } from './adapters/yi';
import { BaichuanAdapter } from './adapters/baichuan';
import { RECOMMENDED_MODEL_ASSIGNMENT } from '@shared/index';
import logger from '../i18n/logger';
import { loadEnv } from '../config/loader';

class LLMRouter {
  private adapters: Map<string, LLMAdapter> = new Map();
  private modelAssignment: Record<string, { adapterId: string; model: string }> = {};

  constructor() {
    this.initializeAdapters();
    this.modelAssignment = { ...RECOMMENDED_MODEL_ASSIGNMENT };
  }

  private initializeAdapters(): void {
    const env = loadEnv();

    const adapterConfigs: Array<{ id: AdapterId; cls: any; apiKeyEnv: string; defaultModel: string }> = [
      { id: 'bailian', cls: BailianAdapter, apiKeyEnv: 'BAILIAN_API_KEY', defaultModel: 'qwen-turbo' },
      { id: 'zhipu', cls: ZhipuAdapter, apiKeyEnv: 'ZHIPU_API_KEY', defaultModel: 'glm-4-flash' },
      { id: 'moonshot', cls: MoonshotAdapter, apiKeyEnv: 'MOONSHOT_API_KEY', defaultModel: 'moonshot-v1-8k' },
      { id: 'ernie', cls: ErnieAdapter, apiKeyEnv: 'ERNIE_API_KEY', defaultModel: 'ernie-speed-128k' },
      { id: 'spark', cls: SparkAdapter, apiKeyEnv: 'SPARK_API_KEY', defaultModel: 'spark-lite' },
      { id: 'hunyuan', cls: HunyuanAdapter, apiKeyEnv: 'HUNYUAN_API_KEY', defaultModel: 'hunyuan-lite' },
      { id: 'minimax', cls: MiniMaxAdapter, apiKeyEnv: 'MINIMAX_API_KEY', defaultModel: 'abab6.5-chat' },
      { id: 'deepseek', cls: DeepSeekAdapter, apiKeyEnv: 'DEEPSEEK_API_KEY', defaultModel: 'deepseek-chat' },
      { id: 'yi', cls: YiAdapter, apiKeyEnv: 'YI_API_KEY', defaultModel: 'yi-large' },
      { id: 'baichuan', cls: BaichuanAdapter, apiKeyEnv: 'BAICHUAN_API_KEY', defaultModel: 'Baichuan2-Turbo' },
    ];

    for (const config of adapterConfigs) {
      const apiKey = (env as any)[config.apiKeyEnv] || '';
      const baseURLOverride = (env as any)[`${config.id.toUpperCase()}_BASE_URL`] || '';
      const adapter = new config.cls(apiKey, config.defaultModel, baseURLOverride || undefined);
      this.adapters.set(config.id, adapter);
    }

    const configured = this.getAdapterStatuses().filter(s => s.apiKeyConfigured).length;
    logger.info(`LLM 适配器初始化完成，共 ${this.adapters.size} 个，已配置 ${configured} 个`);
  }

  getAdapter(adapterId: string): LLMAdapter | undefined {
    return this.adapters.get(adapterId);
  }

  createTestAdapter(adapterId: string, apiKey: string, model: string, baseUrl?: string): LLMAdapter | undefined {
    const adapterConfigs: Record<string, { cls: any; defaultModel: string }> = {
      bailian: { cls: BailianAdapter, defaultModel: 'qwen-turbo' },
      zhipu: { cls: ZhipuAdapter, defaultModel: 'glm-4-flash' },
      moonshot: { cls: MoonshotAdapter, defaultModel: 'moonshot-v1-8k' },
      ernie: { cls: ErnieAdapter, defaultModel: 'ernie-speed-128k' },
      spark: { cls: SparkAdapter, defaultModel: 'spark-lite' },
      hunyuan: { cls: HunyuanAdapter, defaultModel: 'hunyuan-lite' },
      minimax: { cls: MiniMaxAdapter, defaultModel: 'abab6.5-chat' },
      deepseek: { cls: DeepSeekAdapter, defaultModel: 'deepseek-chat' },
      yi: { cls: YiAdapter, defaultModel: 'yi-large' },
      baichuan: { cls: BaichuanAdapter, defaultModel: 'Baichuan2-Turbo' },
    };

    const config = adapterConfigs[adapterId];
    if (!config) return undefined;

    return new config.cls(apiKey, model || config.defaultModel, baseUrl || undefined);
  }

  route(task: ModelTier | string): LLMAdapter {
    const assignment = this.modelAssignment[task];
    if (!assignment) {
      throw new Error(`未找到任务 ${task} 的模型分配配置`);
    }

    // 优先尝试分配的适配器
    const primaryAdapter = this.adapters.get(assignment.adapterId);
    if (primaryAdapter) {
      if (typeof (primaryAdapter as any).setDefaultModel === 'function') {
        (primaryAdapter as any).setDefaultModel(assignment.model);
      }
      return primaryAdapter;
    }

    // 降级：尝试任意可用适配器
    logger.warn({ adapterId: assignment.adapterId }, '主适配器不可用，尝试降级');
    const fallbackAdapter = this.adapters.values().next().value;
    if (fallbackAdapter) {
      logger.warn({ fallbackAdapterId: (fallbackAdapter as any).adapterId }, '使用降级适配器');
      return fallbackAdapter as LLMAdapter;
    }

    throw new Error(`未找到适配器 ${assignment.adapterId}，且无可用降级适配器`);
  }

  getModelForTask(task: ModelTier | string): { adapterId: string; model: string } | undefined {
    return this.modelAssignment[task];
  }

  setModelAssignment(assignment: Record<string, { adapterId: string; model: string }>): void {
    this.modelAssignment = { ...assignment };
    // 通知所有 adapter 更新 defaultModel
    for (const [task, { adapterId, model }] of Object.entries(this.modelAssignment)) {
      const adapter = this.adapters.get(adapterId);
      if (adapter && typeof (adapter as any).setDefaultModel === 'function') {
        (adapter as any).setDefaultModel(model);
      }
    }
  }

  /**
   * 重新初始化所有适配器（用于运行时更新 API Key 或端点）。
   * 重新读取环境变量，销毁旧适配器并创建新实例。
   */
  reinitializeAdapters(): void {
    logger.info('正在重新初始化所有 LLM 适配器...');
    this.adapters.clear();
    this.initializeAdapters();
    // 重新应用当前模型分配
    this.setModelAssignment(this.modelAssignment);
    logger.info('LLM 适配器重新初始化完成');
  }

  resetToRecommended(): void {
    this.modelAssignment = { ...RECOMMENDED_MODEL_ASSIGNMENT };
  }

  getAdapterStatuses(): AdapterStatus[] {
    const env = loadEnv();
    const statuses: AdapterStatus[] = [];

    for (const [id, adapter] of this.adapters.entries()) {
      const envKey = `${id.toUpperCase()}_API_KEY`;
      const apiKey = (env as any)[envKey] || '';
      const isConfigured = apiKey.trim().length > 0;

      statuses.push({
        id: id as AdapterId,
        displayName: adapter.displayName,
        enabled: isConfigured,
        apiKeyConfigured: isConfigured,
        defaultModel: (adapter as any).defaultModel || ''
      });
    }

    return statuses;
  }

  hasAnyConfigured(): boolean {
    return this.getAdapterStatuses().some(s => s.apiKeyConfigured);
  }
}

export const llmRouter = new LLMRouter();
