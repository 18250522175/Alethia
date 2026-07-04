const API_BASE = '/api';

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

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {})
  };

  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
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
    throw new ApiErrorClass('NETWORK_ERROR', '网络连接失败，请检查服务是否正常运行');
  }
}

export const api = {
  request,
  getToken,
  setToken,
  clearToken,
  isAuthenticated,

  login(apiKey: string) {
    return request<{ success: boolean; token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ apiKey })
    });
  },

  getSettings() {
    return request<{ settings: any }>('/settings');
  },

  updateSettings(settings: any) {
    return request<{ success: boolean; settings: any }>('/settings', {
      method: 'PUT',
      body: JSON.stringify({ settings })
    });
  },

  getLlmAdapters() {
    return request<{ adapters: any[] }>('/llm/adapters');
  },

  testLlmAdapter(adapterId: string) {
    return request<{ adapterId: string; ok: boolean; latencyMs: number; error?: string }>('/llm/test', {
      method: 'POST',
      body: JSON.stringify({ adapterId })
    });
  },

  rebuildStruct() {
    return request<any>('/rebuild-struct', {
      method: 'POST'
    });
  },

  getHealthDashboard() {
    return request<any>('/health-dashboard');
  },

  askQuestion(question: string, options?: { conversationId?: string; maxReflections?: number }) {
    return request<{
      answer: string;
      sources: any[];
      confidence: number;
      relatedEntities: { slug: string; title: string }[];
      conversationId: string;
      tokensUsed: number;
      estimatedCost: number;
    }>('/ask', {
      method: 'POST',
      body: JSON.stringify({ question, ...options })
    });
  },

  queryKnowledge(query: string, options?: { intent?: string; topK?: number; contexts?: string[] }) {
    return request<{
      items: Array<{ slug: string; title: string; snippet: string; score: number }>;
      intent: string;
      tier: string;
      durationMs: number;
    }>('/query', {
      method: 'POST',
      body: JSON.stringify({ query, ...options })
    });
  },

  getGraphData() {
    return request<{ nodes: any[]; edges: any[] }>('/graph');
  },

  getPendingDiffs(tier?: string) {
    const qs = tier ? `?tier=${tier}` : '';
    return request<{ items: any[]; total: number }>(`/diffs${qs}`);
  },

  applyDiff(diffId: string) {
    return request<{ diffId: string; applied: boolean; newVersion: number; modifiedFiles: string[] }>(
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
    return request<{ items: any[]; total: number }>(`/conversations/${conversationId}`);
  }
};

export default api;
