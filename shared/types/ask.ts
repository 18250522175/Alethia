import type { EvidenceSpan } from './evidence.js';

export interface AskRequest {
  question: string;
  conversationId?: string;
  mode?: 'concise' | 'detailed';
  maxReflections?: number;
  enableTranslation?: boolean;
  compressionThreshold?: number;
  causalContext?: string;
}

export interface EntityRef {
  slug: string;
  title: string;
}

export interface AskResponse {
  answer: string;
  sources: EvidenceSpan[];
  translatedSources?: EvidenceSpan[];
  confidence: number;
  relatedEntities: EntityRef[];
  conversationId: string;
  tokensUsed: number;
  estimatedCost: number;
  observationTriggered?: boolean;
  compressedHistory?: boolean;
}

export interface ConversationMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  ts: string;
  tokens: number;
  cost: number;
}

export interface Feedback {
  type: 'helpful' | 'wrong';
  span?: string;
  comment?: string;
}
