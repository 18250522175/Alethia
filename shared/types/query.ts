import type { EvidenceSpan } from './evidence.js';

export type QueryIntent = 'factual' | 'topic' | 'cross_domain' | 'file_search' | 'ai_qa';

export type QueryTier = 'T0' | 'T1' | 'T2';

export interface QueryParams {
  query: string;
  intent?: QueryIntent;
  tier?: QueryTier;
  contexts?: string[];
  topK?: number;
  withGraph?: boolean;
  withRerank?: boolean;
}

export interface QueryResult {
  items: QueryResultItem[];
  intent: QueryIntent;
  tier: QueryTier;
  durationMs: number;
}

export interface QueryResultItem {
  slug: string;
  title: string;
  snippet: string;
  score: number;
  sources?: EvidenceSpan[];
}
