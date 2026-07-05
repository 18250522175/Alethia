export interface Page {
  id: number;
  slug: string;
  path: string;
  type: 'concept' | 'person' | 'company' | 'meeting' | 'atom' | 'portal' | 'category' | 'index';
  contexts: string[];
  rawMd: string;
  parsedJson: Record<string, unknown>;
  contentMd: string;
  hash: string;
  updatedAt: string;
}

export interface Link {
  id: number;
  sourceSlug: string;
  targetSlug: string;
  relation: string;
  weight: number;
  orphaned: boolean;
  createdAt: string;
}

export interface TimelineEntry {
  id: number;
  slug: string;
  type: string;
  payload: Record<string, unknown>;
  ts: string;
}

export interface KnowledgeVersion {
  id: number;
  slug: string;
  version: number;
  ts: string;
  changeSummary: string;
  archived: boolean;
  changelogPath?: string;
}

export interface SemanticRing {
  id: number;
  slug: string;
  ringVersion: number;
  period: string;
  summary: string;
}

export interface Cluster {
  id: number;
  clusterId: string;
  name: string;
  lifecycle: 'emerging' | 'stable' | 'decaying' | 'archived';
  generatedAt: string;
}

export interface ClusterMember {
  clusterId: string;
  slug: string;
}

export interface LibraryFile {
  hash: string;
  mime: string;
  originalName: string;
  size: number;
  status: 'new' | 'partially_extracted' | 'fully_extracted' | 'superseded';
  ingestedAt: string;
}

export interface ObservedFile {
  fileHash: string;
  referenceCount: number;
  firstReferencedAt: string;
  lastReferencedAt: string;
}

export interface GhostRelation {
  id: number;
  sourceSlug: string;
  targetName: string;
  discoveredAt: string;
  status: 'pending' | 'resolved';
}

export interface ConversationLog {
  id: number;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  ts: string;
  tokens: number;
  cost: number;
}

export interface EvidenceTranslation {
  spanId: string;
  sourceText: string;
  translatedText: string;
  lang: string;
  model: string;
  createdAt: string;
  expiresAt: string;
}

// Wiki 页面完整响应
export interface WikiPageResponse {
  page: {
    slug: string;
    title: string;
    type: string;
    contexts: string[];
    rawMd: string;
    contentMd: string;
    hash: string;
    updatedAt: string;
    version: number;
  };
  evidenceSpans: {
    span_id: string;
    source_file_hash: string;
    span_text: string;
    source_type: string;
    confidence: number;
  }[];
  links: {
    incoming: Link[];
    outgoing: Link[];
  };
}
