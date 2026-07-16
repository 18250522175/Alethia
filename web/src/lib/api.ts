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
  const token = localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token');
  if (!token) return null;
  const expiry = localStorage.getItem('auth_token_expiry') || sessionStorage.getItem('auth_token_expiry');
  if (expiry && Date.now() > parseInt(expiry, 10)) {
    clearToken();
    return null;
  }
  return token;
}

function setToken(token: string, remember: boolean = true): void {
  if (remember) {
    localStorage.setItem('auth_token', token);
    localStorage.setItem('auth_token_expiry', String(Date.now() + 7 * 24 * 60 * 60 * 1000));
  } else {
    sessionStorage.setItem('auth_token', token);
    sessionStorage.setItem('auth_token_expiry', String(Date.now() + 7 * 24 * 60 * 60 * 1000));
  }
}

function clearToken(): void {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('auth_token_expiry');
  sessionStorage.removeItem('auth_token');
  sessionStorage.removeItem('auth_token_expiry');
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
  options: RequestInit & { timeout?: number; signal?: AbortSignal; params?: Record<string, any> } = {}
): Promise<T> {
  let url = `${API_BASE}${path}`;

  // 处理 params 参数
  if (options.params) {
    const queryString = new URLSearchParams();
    for (const [key, value] of Object.entries(options.params)) {
      if (value !== undefined && value !== null) {
        queryString.set(key, String(value));
      }
    }
    if (queryString.toString()) {
      url += (url.includes('?') ? '&' : '?') + queryString.toString();
    }
  }

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {})
  };

  // 仅对非 GET 请求设置 Content-Type（FormData 除外）
  if (options.method && options.method !== 'GET' && !(options.body instanceof FormData)) {
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
    return request<{ adapters: Array<{ id: string; displayName: string; enabled: boolean; apiKeyConfigured: boolean; defaultModel: string }> }>('/llm/adapters');
  },

  testLlmAdapter(adapterId: string) {
    return request<{ adapterId: string; ok: boolean; latencyMs: number; error?: string }>('/llm/test', {
      method: 'POST',
      body: JSON.stringify({ adapterId })
    });
  },

  testLlmConnection(adapterId: string, apiKey: string, model: string) {
    return request<{ success: boolean; latency?: number; error?: string }>('/llm/test-connection', {
      method: 'POST',
      body: JSON.stringify({ adapterId, apiKey, model })
    });
  },

  rebuildStruct() {
    return request<{
      pages: number;
      links: number;
      ghostCount: number;
      durationMs: number;
    }>('/rebuild-struct', {
      method: 'POST'
    });
  },

  getHealth() {
    return request<HealthDashboard>('/health-dashboard');
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

  queryKnowledge(query: string, options?: { intent?: string; topK?: number; contexts?: string[]; withRerank?: boolean }) {
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
        aliases: string[];
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

  getAliasMap() {
    return request<Record<string, string>>('/aliases/map');
  },

  getAliasConflicts() {
    return request<{ conflicts: Array<{ alias: string; slugs: string[] }> }>('/aliases/conflicts');
  },

  resolveAlias(alias: string) {
    return request<{ slug: string | null; aliases: string[] }>(`/aliases/resolve/${encodeURIComponent(alias)}`);
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

  getTimeline(params?: { slug?: string; limit?: number; offset?: number; range?: string }) {
    const query = new URLSearchParams();
    if (params?.slug) query.set('slug', params.slug);
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.offset) query.set('offset', String(params.offset));
    if (params?.range && params.range !== 'all') query.set('range', params.range);
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

  search(query: string, offset: number = 0, limit: number = 50) {
    return request<{
      pages: { slug: string; title: string; snippet: string; type: string }[];
      files: { hash: string; originalName: string; mime: string; size: number; status: string }[];
      conversations: { id: string; question: string; answer: string; ts: string }[];
      total: number;
      pagesTotal: number;
      filesTotal: number;
      conversationsTotal: number;
    }>(`/search?q=${encodeURIComponent(query)}&offset=${offset}&limit=${limit}`);
  },

  searchEntities(query: string, limit?: number) {
    return request<{
      items: Array<{
        slug: string;
        title: string;
        aliases: string[];
        namespace: string;
        matchType: 'canonical' | 'alias' | 'fuzzy';
      }>;
    }>('/entities/search', { params: { q: query, limit: limit || 10 } });
  },

  getNodeNeighbors(slug: string, degrees?: number) {
    return request<{
      nodes: Array<{ slug: string; title: string; type: string; degree: number }>;
      edges: Array<{ source: string; target: string; relation: string; weight: number }>;
    }>(`/graph/neighbors/${encodeURIComponent(slug)}`, { params: { degrees: degrees || 2 } });
  },

  findShortestPaths(sourceSlug: string, targetSlug: string, maxPaths?: number, maxLength?: number) {
    return request<{
      paths: Array<{
        nodes: string[];
        edges: Array<{ source: string; target: string; relation: string }>;
        length: number;
      }>;
    }>('/graph/paths', {
      method: 'POST',
      body: JSON.stringify({ sourceSlug, targetSlug, maxPaths, maxLength })
    });
  },

  getBacklinks(slug: string, contextChars?: number) {
    return request<{
      backlinks: Array<{
        sourceSlug: string;
        sourceTitle: string;
        context: string;
        relationType?: string;
      }>;
    }>(`/pages/${encodeURIComponent(slug)}/backlinks`, { params: { contextChars: contextChars || 80 } });
  },

  getEntityPreview(slug: string) {
    return request<{
      title: string;
      summary: string;
      lastModified: string;
      quality?: string;
      type: string;
      aliases: string[];
      backlinkCount: number;
      hasOpenThreads: boolean;
    }>(`/preview/${encodeURIComponent(slug)}`);
  },

  ingestFile(file: File, sha256: string) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('sha256', sha256);
    return request<{
      libraryUrl: string;
      alreadyExists: boolean;
      extractionQueued: boolean;
    }>('/ingest/upload', {
      method: 'POST',
      body: formData
    });
  },

  listSnippets(category?: string) {
    return request<{
      items: Array<{
        name: string;
        trigger: string;
        description: string;
        category: string;
      }>;
    }>('/snippets', { params: category ? { category } : {} });
  },

  getSnippet(name: string) {
    return request<{
      name: string;
      trigger: string;
      description: string;
      category: string;
      content: string;
    }>(`/snippets/${encodeURIComponent(name)}`);
  },

  saveSnippet(name: string, content: string) {
    return request<{ success: boolean }>(`/snippets/${encodeURIComponent(name)}`, {
      method: 'PUT',
      body: JSON.stringify({ content })
    });
  },

  deleteSnippet(name: string) {
    return request<{ success: boolean }>(`/snippets/${encodeURIComponent(name)}`, {
      method: 'DELETE'
    });
  },

  embedProxy(type: string, params: Record<string, string>, refresh?: boolean) {
    const query = new URLSearchParams({ type, ...params });
    if (refresh) query.set('refresh', 'true');
    return request<{
      data: any;
      cached: boolean;
      cachedAt?: string;
      expiresAt: string;
    }>(`/embed-proxy?${query.toString()}`);
  },

  getSearchCompletions(prefix?: string) {
    return request<{
      types: string[];
      namespaces: string[];
      tags: string[];
      contexts: string[];
      qualities: string[];
    }>('/search/completions', { params: prefix ? { prefix } : {} });
  },

  getSyntaxHelp() {
    return request<{
      items: Array<{ key: string; description: string; example: string }>;
    }>('/search/syntax-help');
  },

  saveSearch(name: string, query: string, description?: string) {
    return request<{ success: boolean }>('/saved-searches', {
      method: 'POST',
      body: JSON.stringify({ name, query, description })
    });
  },

  getSavedSearches() {
    return request<{
      items: Array<{
        name: string;
        query: string;
        description: string;
        created_at: string;
        updated_at: string;
      }>;
    }>('/saved-searches');
  },

  deleteSavedSearch(name: string) {
    return request<{ success: boolean }>(`/saved-searches/${encodeURIComponent(name)}`, {
      method: 'DELETE'
    });
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
        tags: string[];
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
    return request<{ items: Array<{ spanId: string; translatedText: string; targetLang: string }>; total: number }>(
      '/translate-evidence',
      {
        method: 'POST',
        body: JSON.stringify({ spanIds: [spanId], targetLang })
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

  generateDraft(title: string, type?: string, contexts?: string[]) {
    return request<{
      slug: string;
      content: string;
    }>('/generate-draft', {
      method: 'POST',
      body: JSON.stringify({ title, type, contexts }),
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
      processed: number;
      pendingDiffsCreated: number;
      errors: Array<{
        filePath: string;
        message: string;
      }>;
    }>('/extract-pending', { method: 'POST' });
  },

  getArchiveVersions(slug: string) {
    return request<{
      items: Array<{
        version: number;
        hash: string;
        updatedAt: string;
        changeSummary: string;
        author?: string;
      }>;
      total: number;
    }>(`/pages/${encodeURIComponent(slug)}/versions`);
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
      daily: number;
      monthly: number;
      dailyLimit: number;
      monthlyLimit: number;
      tripped: boolean;
    }>('/budget/remaining');
  },

  getBudgetAlerts() {
    return request<{
      items: Array<{
        metric: string;
        threshold: number;
        actual: number;
        message: string;
        ts: string;
      }>;
      total: number;
    }>('/budget/alerts');
  },

  getConversations() {
    return request<{
      items: Array<{
        id: string;
        title: string;
        preview: string;
        updatedAt: string;
        compressed?: boolean;
        totalTokens?: number;
        totalCost?: number;
      }>;
      total: number;
    }>('/conversations');
  },

  compressConversation(conversationId: string) {
    return request(`/conversations/${conversationId}/compress`, { method: 'POST' });
  },

  deleteConversation(conversationId: string) {
    return request<{ success: boolean }>(`/conversations/${conversationId}`, { method: 'DELETE' });
  },

  getLibraryFiles() {
    return request<{
      items: Array<{
        hash: string;
        mime: string;
        originalName: string;
        size: number;
        status: string;
        ingestedAt: string;
        tags: string[];
      }>;
      total: number;
    }>('/library-files');
  },

  deleteLibraryFile(hash: string) {
    return request<{ success: boolean }>(`/library-files/${hash}`, { method: 'DELETE' });
  },

  updateLibraryFileTags(hash: string, tags: string[]) {
    return request<{ success: boolean; hash: string; tags: string[] }>(`/library-files/${hash}/tags`, {
      method: 'PUT',
      body: JSON.stringify({ tags })
    });
  },

  getLibraryFileTags() {
    return request<{ tags: string[] }>('/library-files/tags');
  },

  getPages() {
    return request<{
      items: Array<{
        slug: string;
        title: string;
        type: string;
        contexts: string[];
        aliases: string[];
        updatedAt: string;
      }>;
      total: number;
    }>('/pages');
  },

  createPage(title: string, type?: string, contexts?: string[], aliases?: string[]) {
    return request<{ success: boolean; slug: string }>('/pages', {
      method: 'POST',
      body: JSON.stringify({ title, type, contexts, aliases })
    });
  },

  getPageVersions(slug: string) {
    return request<{
      items: Array<{
        version: number;
        hash: string;
        updatedAt: string;
        changeSummary: string;
      }>;
      total: number;
    }>(`/pages/${encodeURIComponent(slug)}/versions`);
  },

  getPageVersion(slug: string, version: number) {
    return request<{ content: string }>(`/pages/${encodeURIComponent(slug)}/versions/${version}`);
  },

  getNotifications() {
    return request<{
      items: Array<{
        id: number;
        type: string;
        title: string;
        message: string;
        read: boolean;
        metadata: Record<string, unknown>;
        created_at: string;
      }>;
      total: number;
    }>('/notifications');
  },

  markNotificationRead(id: number) {
    return request<{ success: boolean }>(`/notifications/${id}/read`, { method: 'POST' });
  },

  markAllNotificationsRead() {
    return request<{ success: boolean }>('/notifications/read-all', { method: 'POST' });
  },

  clearAllNotifications() {
    return request<{ success: boolean }>('/notifications/all', { method: 'DELETE' });
  },

  updateDailyBudget(amount: number) {
    return request<{ success: boolean; dailyBudget: number }>('/settings/daily-budget', {
      method: 'POST',
      body: JSON.stringify({ amount })
    });
  },

  // Notes API
  listNotes() {
    return request<{ items: Array<{ path: string; name: string; folder: string; status: string; updatedAt: string }> }>('/notes');
  },
  getNote(path: string) {
    return request<{ content: string; status: string; updatedAt: string }>(`/notes/${encodeURIComponent(path)}`);
  },
  createNote(folder: string) {
    return request<{ success: boolean; path: string }>('/notes', {
      method: 'POST',
      body: JSON.stringify({ folder })
    });
  },
  saveNote(path: string, content: string) {
    return request<{ success: boolean }>(`/notes/${encodeURIComponent(path)}`, {
      method: 'PUT',
      body: JSON.stringify({ content })
    });
  },
  deleteNote(path: string) {
    return request<{ success: boolean }>(`/notes/${encodeURIComponent(path)}`, {
      method: 'DELETE'
    });
  },
  updateNoteStatus(path: string, status: string) {
    return request<{ success: boolean }>(`/notes/${encodeURIComponent(path)}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status })
    });
  },
  extractNote(path: string) {
    return request<{ success: boolean; diffs?: any[] }>(`/notes/${encodeURIComponent(path)}/extract`, {
      method: 'POST'
    });
  },
  getNoteTags() {
    return request<{ tags: string[] }>('/notes/tags');
  },
  updateNoteTags(path: string, tags: string[]) {
    return request<{ success: boolean; tags: string[] }>(`/notes/${encodeURIComponent(path)}/tags`, {
      method: 'PUT',
      body: JSON.stringify({ tags })
    });
  },

  getPrompts() {
    return request<{ items: Array<{ name: string; title: string; description: string }> }>('/prompts');
  },
  getPrompt(name: string) {
    return request<string>(`/prompts/${encodeURIComponent(name)}`);
  },
  savePrompt(name: string, content: string) {
    return request<{ success: boolean }>(`/prompts/${encodeURIComponent(name)}`, {
      method: 'PUT',
      body: JSON.stringify({ content })
    });
  },

  // Hypergraph API
  getHypergraph() {
    return request<{
      hyperedges: Array<{
        id: number;
        source_slugs: string[];
        target_slugs: string[];
        type: string;
        params: any;
      }>;
      causalHyperedges: Array<any>;
      cpts: Array<any>;
    }>('/hypergraph');
  },

  updateHyperedge(id: number, body: { type?: string; params?: { weight?: number; conf?: number }; source_slugs?: string[]; target_slugs?: string[] }) {
    return request<{ hyperedge: any }>(`/hyperedge/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body)
    });
  },

  deleteHyperedge(id: number) {
    return request<{ success: boolean }>(`/hyperedge/${id}`, { method: 'DELETE' });
  },

  getOntologyClasses: () => request<any>('/ontology/classes'),
  getOntologyEntitiesByClass: (className: string) => request<any>(`/ontology/entities-by-class/${encodeURIComponent(className)}`),

  // Causal Cognitive Map
  getCausalGraph() {
    return request<{
      edges: Array<{
        id: string;
        source_slug: string;
        target_slug: string;
        relation: string;
        lag: string;
        weight: number;
        conf: number;
        evidence: unknown;
      }>;
      cpts: Array<{
        id: string;
        variable_slug: string;
        conditions: Record<string, unknown>;
        probabilities: unknown;
      }>;
    }>('/causal/graph');
  },

  getCausalNode(slug: string) {
    return request<{
      slug: string;
      title: string;
      incoming: Array<{
        id: string;
        source_slug: string;
        relation: string;
        weight: number;
        conf: number;
      }>;
      outgoing: Array<{
        id: string;
        target_slug: string;
        relation: string;
        weight: number;
        conf: number;
      }>;
      cpt: {
        id: string;
        variable_slug: string;
        conditions: Record<string, unknown>;
        probabilities: unknown;
      } | null;
    }>(`/causal/node/${encodeURIComponent(slug)}`);
  },

  postNlCommand(command: string, currentView: { nodes: string[]; selectedNodes: string[] }) {
    return request<{
      operations: Array<{
        type: 'select' | 'pack' | 'unpack' | 'filter' | 'perspective' | 'expand' | 'layout';
        target: string[];
        params?: Record<string, any>;
      }>;
      explanation: string;
    }>('/causal/nl-command', {
      method: 'POST',
      body: JSON.stringify({ command, currentView })
    });
  },

  getCausalSuggestions(nodes?: string[], limit?: number) {
    return request<{
      suggestions: Array<{
        type: string;
        title: string;
        description: string;
        nodes?: string[];
        node?: string;
        action: string;
        confidence: number;
        moduleType?: string;
      }>;
    }>('/causal/suggestions', {
      params: {
        nodes: nodes?.join(','),
        limit: limit || 5
      }
    });
  },

  // Causal Reasoning API
  postCausalReason(body: {
    target: string;
    intervention: { variable: string; fromState?: string; toState: string };
    background?: Record<string, string>;
  }) {
    return request<{
      baselineProbability: number;
      interventionProbability: number;
      delta: number;
      confidenceInterval: [number, number];
      method: 'cpt' | 'heuristic';
      assumptions: string[];
      evidence: Array<{ source: string; text: string }>;
    }>('/causal/reason', { method: 'POST', body: JSON.stringify(body) });
  },

  postCausalCounterfactual(body: {
    observed: Record<string, string>;
    hypothetical: {
      target: string;
      intervention: { variable: string; fromState?: string; toState: string };
      background?: Record<string, string>;
    };
  }) {
    return request<{
      baselineProbability: number;
      interventionProbability: number;
      delta: number;
      confidenceInterval: [number, number];
      method: 'cpt' | 'heuristic';
      assumptions: string[];
      evidence: Array<{ source: string; text: string }>;
    }>('/causal/counterfactual', { method: 'POST', body: JSON.stringify(body) });
  },

  postCausalBackward(body: {
    target: string;
    desiredState: string;
  }) {
    return request<{
      candidates: Array<{
        variable: string;
        effect: number;
        confidence: number;
      }>;
    }>('/causal/backward', { method: 'POST', body: JSON.stringify(body) });
  },

  postCausalTimePulse(body: {
    target: string;
    intervention: { variable: string; fromState?: string; toState: string };
    steps?: number;
  }) {
    return request<{
      pulses: Array<{
        step: number;
        probability: number;
        confidence: [number, number];
      }>;
    }>('/causal/time-pulse', { method: 'POST', body: JSON.stringify(body) });
  },

  getCausalEvidence(edgeId: number) {
    return request<{
      edge: {
        id: number;
        sourceSlug: string;
        targetSlug: string;
        relation: string;
        lag: string;
        weight: number;
        conf: number;
        evidence: string[];
      };
      evidenceSpans: Array<{
        spanId: string;
        source: string;
        text: string;
      }>;
    }>(`/causal/evidence/${edgeId}`);
  },

  updateCausalEdge(edgeId: number, body: { weight?: number; conf?: number; relation?: string }) {
    return request<{
      edge: {
        id: number;
        source_slug: string;
        target_slug: string;
        relation: string;
        weight: number;
        conf: number;
      };
    }>(`/causal/edge/${edgeId}`, { method: 'PUT', body: JSON.stringify(body) });
  },

  deleteCausalEdge(edgeId: number) {
    return request<{ success: boolean }>(`/causal/edge/${edgeId}`, { method: 'DELETE' });
  },

  getCausalEvalCheck() {
    return request<{
      warnings: string[];
      cycleNodes: string[];
      isolatedNodes: string[];
    }>('/causal/eval-check');
  },

  // Causal Model Versioning
  saveCausalVersion(comment: string) {
    return request<{
      version_id: string;
      comment: string;
      edges_count: number;
      cpts_count: number;
      created_at: string;
      is_active: boolean;
    }>('/causal/version/save', { method: 'POST', body: JSON.stringify({ comment }) });
  },

  listCausalVersions() {
    return request<{
      versions: Array<{
        version_id: string;
        comment: string;
        is_active: boolean;
        created_at: string;
      }>;
    }>('/causal/version/list');
  },

  switchCausalVersion(versionId: string) {
    return request<{
      success: boolean;
      version_id: string;
      edges_count: number;
      cpts_count: number;
    }>('/causal/version/switch', { method: 'POST', body: JSON.stringify({ versionId }) });
  },

  compareCausalVersions(v1: string, v2: string) {
    return request<{
      added: Array<{
        source_slug: string;
        target_slug: string;
        relation: string;
        weight: number;
        conf: number;
        lag: string;
      }>;
      removed: Array<{
        source_slug: string;
        target_slug: string;
        relation: string;
        weight: number;
        conf: number;
        lag: string;
      }>;
      modified: Array<{
        source: string;
        target: string;
        relation: string;
        changes: Array<{ field: string; old: unknown; new: unknown }>;
      }>;
    }>('/causal/version/compare', { params: { v1, v2 } });
  },

  // Causal Alert API
  createCausalAlert(body: { edgeId: number; threshold: { condition: string; value: number }; enabled: boolean }) {
    return request<{
      alert: {
        id: number;
        edge_id: number;
        threshold: { condition: string; value: number };
        enabled: boolean;
        last_triggered_at: string | null;
        created_at: string;
      };
    }>('/causal/alert/create', { method: 'POST', body: JSON.stringify(body) });
  },

  listCausalAlerts() {
    return request<{
      alerts: Array<{
        id: number;
        edge_id: number;
        source_slug: string;
        target_slug: string;
        relation: string;
        threshold: { condition: string; value: number };
        enabled: boolean;
        last_triggered_at: string | null;
        created_at: string;
      }>;
    }>('/causal/alert/list');
  },

  updateCausalAlert(id: number, body: { threshold?: { condition: string; value: number }; enabled?: boolean }) {
    return request<{
      alert: {
        id: number;
        edge_id: number;
        threshold: { condition: string; value: number };
        enabled: boolean;
        last_triggered_at: string | null;
        created_at: string;
      };
    }>(`/causal/alert/${id}`, { method: 'PUT', body: JSON.stringify(body) });
  },

  deleteCausalAlert(id: number) {
    return request<{ success: boolean }>(`/causal/alert/${id}`, { method: 'DELETE' });
  },

  checkCausalAlerts() {
    return request<{
      triggered: Array<{
        alertId: number;
        edgeId: number;
        sourceSlug: string;
        targetSlug: string;
        message: string;
      }>;
    }>('/causal/alert/check', { method: 'POST' });
  },

  // Views API
  saveView(viewId: string, userLabel: string, snapshot: any) {
    return request<{ viewId: string; message: string }>('/views/save', {
      method: 'POST',
      body: JSON.stringify({ viewId, userLabel, snapshot })
    });
  },

  listViews() {
    return request<{
      views: Array<{
        view_id: string;
        user_label: string;
        created_at: string;
        updated_at: string;
        node_count: number;
      }>;
    }>('/views/list');
  },

  loadView(viewId: string) {
    return request<{
      viewId: string;
      userLabel: string;
      snapshot: any;
      createdAt: string;
      updatedAt: string;
    }>(`/views/${encodeURIComponent(viewId)}`);
  },

  deleteView(viewId: string) {
    return request<{ message: string }>(`/views/${encodeURIComponent(viewId)}`, {
      method: 'DELETE'
    });
  },

  suggestViews() {
    return request<{
      suggestions: Array<{
        type: string;
        title: string;
        description: string;
        nodes: string[];
        action: string;
      }>;
    }>('/views/suggest', { method: 'POST' });
  },

  solidifyView(viewId: string, hyperNodeId: string) {
    return request<{ diff: any; message: string }>('/views/solidify', {
      method: 'POST',
      body: JSON.stringify({ viewId, hyperNodeId }),
    });
  },
};

export default api;
