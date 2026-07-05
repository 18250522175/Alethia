import type { AdapterId } from './settings.js';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMRequest {
  model?: string;
  messages: LLMMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  jsonMode?: boolean;
}

export interface LLMResponse {
  content: string;
  model: string;
  tokensUsed: { prompt: number; completion: number; total: number };
  estimatedCost: number;
  finishReason: string;
}

export interface LLMAdapter {
  readonly id: AdapterId;
  readonly displayName: string;
  chat: (req: LLMRequest) => Promise<LLMResponse>;
  embed: (text: string) => Promise<number[]>;
  probe: () => Promise<{ ok: boolean; latencyMs: number; error?: string }>;
}

export interface AdapterStatus {
  id: AdapterId;
  displayName: string;
  enabled: boolean;
  apiKeyConfigured: boolean;
  defaultModel: string;
}

export interface ModelAssignmentConfig {
  adapterId: AdapterId;
  model: string;
}
