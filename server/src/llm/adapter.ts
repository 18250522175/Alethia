import type { LLMRequest, LLMResponse, LLMAdapter, AdapterId } from '@shared/index';
import logger from '../i18n/logger';

const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;

export abstract class BaseLLMAdapter implements LLMAdapter {
  abstract readonly id: AdapterId;
  abstract readonly displayName: string;

  abstract chat(req: LLMRequest): Promise<LLMResponse>;
  abstract embed(text: string): Promise<number[]>;
  abstract probe(): Promise<{ ok: boolean; latencyMs: number; error?: string }>;

  protected estimateCost(model: string, promptTokens: number, completionTokens: number): number {
    const pricing: Record<string, { prompt: number; completion: number }> = {
      'qwen-turbo': { prompt: 0.0008, completion: 0.002 },
      'qwen-plus': { prompt: 0.002, completion: 0.006 },
      'glm-4-flash': { prompt: 0.0001, completion: 0.0001 },
      'glm-4-plus': { prompt: 0.05, completion: 0.05 },
      'moonshot-v1-8k': { prompt: 0.012, completion: 0.012 },
      'moonshot-v1-32k': { prompt: 0.024, completion: 0.024 },
      'ernie-speed-128k': { prompt: 0.0008, completion: 0.002 },
      'spark-lite': { prompt: 0, completion: 0 },
      'hunyuan-lite': { prompt: 0, completion: 0 },
      'abab6.5-chat': { prompt: 0.005, completion: 0.005 },
      'deepseek-chat': { prompt: 0.0014, completion: 0.0028 },
      'deepseek-reasoner': { prompt: 0.002, completion: 0.008 },
      'yi-large': { prompt: 0.02, completion: 0.02 },
      'Baichuan2-Turbo': { prompt: 0.008, completion: 0.008 },
      'text-embedding-v1': { prompt: 0.0005, completion: 0 },
    };

    const price = pricing[model] || { prompt: 0.001, completion: 0.002 };
    return (promptTokens / 1000) * price.prompt + (completionTokens / 1000) * price.completion;
  }
}

export class BaseOpenAICompatibleAdapter extends BaseLLMAdapter {
  readonly id: AdapterId;
  readonly displayName: string;
  private baseURL: string;
  private apiKey: string;
  private defaultModel: string;

  constructor(
    id: AdapterId,
    displayName: string,
    baseURL: string,
    apiKey: string,
    defaultModel: string
  ) {
    super();
    this.id = id;
    this.displayName = displayName;
    this.baseURL = baseURL;
    this.apiKey = apiKey;
    this.defaultModel = defaultModel;
  }

  async chat(req: LLMRequest): Promise<LLMResponse> {
    const startTime = Date.now();
    const model = req.model || this.defaultModel;

    try {
      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: req.messages,
          temperature: req.temperature,
          max_tokens: req.maxTokens,
          stream: false,
          ...(req.jsonMode ? { response_format: { type: 'json_object' } } : {})
        }),
        signal: AbortSignal.timeout(DEFAULT_REQUEST_TIMEOUT_MS)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API 请求失败 (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      const promptTokens = data.usage?.prompt_tokens || 0;
      const completionTokens = data.usage?.completion_tokens || 0;
      const totalTokens = data.usage?.total_tokens || promptTokens + completionTokens;
      const finishReason = data.choices?.[0]?.finish_reason || 'stop';

      const estimatedCost = this.estimateCost(model, promptTokens, completionTokens);

      return {
        content,
        model,
        tokensUsed: { prompt: promptTokens, completion: completionTokens, total: totalTokens },
        estimatedCost,
        finishReason
      };
    } catch (err) {
      logger.error({ err, adapter: this.id, model }, 'LLM chat 调用失败');
      throw err;
    }
  }

  async embed(text: string): Promise<number[]> {
    try {
      const response = await fetch(`${this.baseURL}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.defaultModel,
          input: text
        }),
        signal: AbortSignal.timeout(DEFAULT_REQUEST_TIMEOUT_MS)
      });

      if (!response.ok) {
        throw new Error(`Embedding API 请求失败 (${response.status})`);
      }

      const data = await response.json();
      return data.data?.[0]?.embedding || [];
    } catch (err) {
      logger.error({ err, adapter: this.id }, 'LLM embed 调用失败');
      throw err;
    }
  }

  async probe(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const startTime = Date.now();
    try {
      if (!this.apiKey) {
        return { ok: false, latencyMs: 0, error: '未配置 API Key' };
      }

      const response = await fetch(`${this.baseURL}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        },
        signal: AbortSignal.timeout(10000)
      });

      const latencyMs = Date.now() - startTime;
      if (response.ok) {
        return { ok: true, latencyMs };
      } else {
        return { ok: false, latencyMs, error: `HTTP ${response.status}` };
      }
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      return { ok: false, latencyMs, error: err.message };
    }
  }
}
