import type { EvidenceSpan } from '@shared/evidence';
import type { Link } from '@shared/entities';
import type { Settings } from '@shared/settings';
import type { HealthDashboard } from '@shared/health';
import type { PendingDiff, ApplyResult } from '@shared/diff';
import type { QueryResult } from '@shared/query';
import type { AskResponse, ConversationMessage } from '@shared/ask';

const API_BASE = '/api';
const DEFAULT_TIMEOUT = 30_000;

function getToken(): string | null {
  return localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token');
}

function setToken(token: string, remember: boolean = true): void {
  if (remember) {
    localStorage.setItem('auth_token', token);
  } else {
    sessionStorage.setItem('auth_token', token);
  }
}

function clearToken(): void {
  localStorage.removeItem('auth_token');
  sessionStorage.removeItem('auth_token');
}

function isAuthenticated(): boolean {
  return !!getToken();
}

interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

class ApiErrorClass extends Error {
  code: string;
  details?: Record<string, unknown>;
  isTimeout?: boolean;
  isAbort?: boolean;

  constructor(code: string, message: string, details?: Record<string, unknown>, isTimeout?: boolean, isAbort?: boolean) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
    this.isTimeout = isTimeout;
    this.isAbort = isAbort;
  }
}

async function request<T>(
  path: string,
  options: RequestInit & { timeout?: number; signal?: AbortSignal } = {}
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {})
  };

  // 仅对非 GET 请求设置 Content-Type
  if (options.method && options.method !== 'GET') {
    headers['Content-Type'] = 'application/json';
  }

  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  const controller = new AbortController();
  const userSignal = options.signal ?? undefined;

  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  if (timeout > 0) {
    timeoutId = setTimeout(() => controller.abort(), timeout);
  }

  if (userSignal) {
    if (userSignal.aborted) {
      controller.abort();
    } else {
      userSignal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      // 401 全局处理：清除 token 并通知认证状态变更
      if (response.status === 401) {
        clearToken();
        window.dispatchEvent(new CustomEvent('auth:expired'));
      }

      const error = data.error as ApiError || {
        code: 'INTERNAL_ERROR',
        message: '未知错误'
      };
      throw new ApiErrorClass(error.code, error.message, error.details);
    }

    return data as T;
  } catch (err) {
    if (err instanceof ApiErrorClass) {
      throw err;
    }
    if (err instanceof DOMException && err.name === 'AbortError') {
      if (userSignal?.aborted) {
        throw new ApiErrorClass('ABORTED', '请求已取消', undefined, false, true);
      }
      throw new ApiErrorClass('TIMEOUT', `请求超时（${timeout / 1000}s）`, undefined, true, false);
    }
    throw new ApiErrorClass('NETWORK_ERROR', '网络连接失败，请检查服务是否正常运行');
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

async function requestWithRetry<T>(
  path: string,
  options: RequestInit & { timeout?: number; retries?: number; retryDelay?: number; signal?: AbortSignal } = {}
): Promise<T> {
  const { retries = 0, retryDelay = 1000, ...requestOptions } = options;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await request<T>(path, requestOptions);
    } catch (err) {
      lastError = err as Error;
      if (attempt < retries) {
        const delay = retryDelay * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

export const api = {
  request,
  requestWithRetry,
  getToken,
  setToken,
  clearToken,
  isAuthenticated,
  ApiError: ApiErrorClass,

  login(apiKey: string) {
    return request<{ success: boolean; token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ apiKey })
    });
  },

  getSettings() {
    return request<{ settings: Settings }>('/settings');
  },

  updateSettings(settings: Partial<Settings>) {
    return request<{ success: boolean; settings: Settings }>('/settings', {
      method: 'PUT',
      body: JSON.stringify({ settings })
    });
  },

  getLlmAdapters() {
    return request<{ adapters: Array<{ id: string; name: string; enabled: boolean; models: string[] }> }>('/llm/adapters');
  },

  testLlmAdapter(adapterId: string) {
    return request<{ adapterId: string; ok: boolean; latencyMs: number; error?: string }>('/llm/test', {
      method: 'POST',
      body: JSON.stringify({ adapterId })
    });
  },

  rebuildStruct() {
    return request<{
      success: boolean;
      triggered: boolean;
      estimatedDurationMs: number;
      pages?: number;
      links?: number;
      ghostCount?: number;
      durationMs?: number;
    }>('/rebuild-struct', {
      method: 'POST'
    });
  },

  getHealth() {
    return request<{
      status: 'ok' | 'degraded' | 'error';
      version: string;
      lastSync?: string;
      uptimeMs: number;
      components: { name: string; status: 'ok' | 'degraded' | 'error'; latencyMs?: number }[];
    }>('/health');
  },

  getHealthDashboard() {
    return request<HealthDashboard>('/health-dashboard');
  },

  askQuestion(question: string, options?: { conversationId?: string; maxReflections?: number; signal?: AbortSignal }) {
    return request<AskResponse>('/ask', {
      method: 'POST',
      body: JSON.stringify({ question, ...options }),
      timeout: 120_000,
      signal: options?.signal
    });
  },

  queryKnowledge(query: string, options?: { intent?: string; topK?: number; contexts?: string[] }) {
    return request<QueryResult>('/query', {
      method: 'POST',
      body: JSON.stringify({ query, ...options })
    });
  },

  getGraphData() {
    return request<{
      nodes: Array<{
        id: string;
        label: string;
        title?: string;
        type: string;
        slug?: string;
        weight?: number;
        x?: number;
        y?: number;
      }>;
      edges: Array<{
        id: string;
        source: string;
        target: string;
        relation: string;
        weight: number;
      }>;
    }>('/graph');
  },

  getPendingDiffs(tier?: string) {
    const qs = tier ? `?tier=${tier}` : '';
    return request<{ items: PendingDiff[]; total: number }>(`/diffs${qs}`);
  },

  applyDiff(diffId: string) {
    return request<ApplyResult>(
      `/diffs/${diffId}/apply`,
      { method: 'POST' }
    );
  },

  rejectDiff(diffId: string) {
    return request<{ diffId: string; applied: boolean }>(
      `/diffs/${diffId}/reject`,
      { method: 'POST' }
    );
  },

  getConversation(conversationId: string) {
    return request<{ items: ConversationMessage[]; total: number }>(`/conversations/${conversationId}`);
  },

  getWikiPage(slug: string) {
    return request<{
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
      evidenceSpans: EvidenceSpan[];
      links: { incoming: Link[]; outgoing: Link[] };
    }>(`/pages/${slug}`);
  },

  updateWikiPage(slug: string, content: string) {
    return request<{ success: boolean; hash: string }>(`/pages/${slug}`, {
      method: 'PUT',
      body: JSON.stringify({ content })
    });
  },

  getChangeLog(params?: { limit?: number; op?: string }) {
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.op) query.set('op', params.op);
    return request<{
      batches: {
        batchId: string;
        ts: string;
        opCounts: Record<string, number>;
        totalOps: number;
        targets: string[];
      }[];
      total: number;
    }>(`/changelog?${query.toString()}`);
  },

  rollbackBatch(batchId: string) {
    return request<{ restored: boolean; restoredFiles: string[]; rebuildTriggered: boolean }>(
      `/rollback/${batchId}`,
      { method: 'POST' }
    );
  },

  getEvalReport() {
    return request<{
      benchmarks: {
        id: number;
        type: string;
        slug?: string;
        sourceText: string;
        expectedOutput: string;
        gitCommit?: string;
        passed?: boolean;
        score?: number;
      }[];
      anomalies: {
        id: string;
        metric: string;
        threshold: number;
        actual: number;
        ts: string;
        message: string;
      }[];
      summary: {
        total: number;
        passed: number;
        accuracy: number;
        reproductionRate: number;
        newErrors: number;
        lastRun?: string;
      };
      trend: { date: string; accuracy: number }[];
    }>('/eval-report');
  },

  runShadowEval() {
    return request<{
      passed: boolean;
      accuracy: number;
      reproductionRate: number;
      newErrors: number;
      errors: string[];
    }>('/shadow-eval', { method: 'POST' });
  },

  getTimeline(params?: { slug?: string; limit?: number; offset?: number }) {
    const query = new URLSearchParams();
    if (params?.slug) query.set('slug', params.slug);
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.offset) query.set('offset', String(params.offset));
    return request<{
      items: Array<{
        id: number;
        slug: string;
        type: string;
        payload: Record<string, unknown>;
        ts: string;
        title?: string;
        description?: string;
      }>;
      total: number;
    }>(`/timeline?${query.toString()}`);
  },

  search(query: string) {
    return request<{
      pages: { slug: string; title: string; snippet: string; type: string }[];
      files: { hash: string; originalName: string; mime: string; size: number; status: string }[];
      conversations: { id: string; question: string; answer: string; ts: string }[];
      total: number;
    }>(`/search?q=${encodeURIComponent(query)}`);
  },

  getLibraryFile(hash: string) {
    return request<{
      file: {
        hash: string;
        mime: string;
        originalName: string;
        size: number;
        status: string;
        ingestedAt: string;
      };
      evidenceSpans: {
        spanId: string;
        originalLocation: string;
        spanText: string;
        sourceType: string;
      }[];
      contentUrl: string;
    }>(`/library-files/${hash}`);
  },

  getLibraryFileContent(hash: string) {
    return request<{ content: string; format: string }>(`/library-files/${hash}/content`);
  },

  submitFeedback(messageId: string, helpful: boolean, comment?: string) {
    return request<{ success: boolean }>('/feedback', {
      method: 'POST',
      body: JSON.stringify({ messageId, helpful, comment })
    });
  },

  translateEvidence(spanId: string, targetLang: string) {
    return request<{ spanId: string; translatedText: string; targetLang: string }>(
      '/translate-evidence',
      {
        method: 'POST',
        body: JSON.stringify({ spanId, targetLang })
      }
    );
  },

  getObservedFiles() {
    return request<{
      items: Array<{
        hash: string;
        path: string;
        mtime: string;
        size: number;
        status: string;
      }>;
      total: number;
    }>('/observed-files');
  },

  extractObservedFile(hash: string) {
    return request<{ success: boolean; hash: string; triggered: boolean }>(
      `/observed-files/${hash}/extract`,
      { method: 'POST' }
    );
  },

  generateDraft(slug: string, prompt?: string) {
    return request<{
      slug: string;
      draftMd: string;
      sources: string[];
      tokensUsed: number;
    }>('/generate-draft', {
      method: 'POST',
      body: JSON.stringify({ slug, prompt }),
      timeout: 120_000
    });
  },

  generateStaticSite() {
    return request<{
      success: boolean;
      outputPath: string;
      pagesGenerated: number;
      durationMs: number;
    }>('/generate-static-site', { method: 'POST', timeout: 300_000 });
  },

  getExtractPending() {
    return request<{
      pending: number;
      items: Array<{
        hash: string;
        originalName: string;
        addedAt: string;
        priority: number;
      }>;
    }>('/extract-pending');
  },

  getArchiveVersions(slug: string) {
    return request<{
      versions: Array<{
        version: number;
        hash: string;
        updatedAt: string;
        changeSummary: string;
      }>;
    }>(`/archive-versions?slug=${encodeURIComponent(slug)}`);
  },

  cleanGhostRelations() {
    return request<{
      success: boolean;
      removed: number;
      details: string;
    }>('/clean-ghost-relations', { method: 'POST' });
  },

  getBudgetRemaining() {
    return request<{
      remaining: number;
      total: number;
      used: number;
      period: string;
      currency: string;
    }>('/budget/remaining');
  },

  getBudgetAlerts() {
    return request<{
      alerts: Array<{
        id: string;
        level: 'info' | 'warning' | 'critical';
        message: string;
        threshold: number;
        current: number;
        ts: string;
      }>;
    }>('/budget/alerts');
  },

  updateDailyBudget(amount: number) {
    return request<{ success: boolean; dailyBudget: number }>('/settings/daily-budget', {
      method: 'PUT',
      body: JSON.stringify({ dailyBudget: amount })
    });
  }
};

export default api;
