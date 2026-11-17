import type {
  AttachmentDto,
  SessionSummary,
  SessionView,
  Settings,
  StatsResponse,
  StreamEvent,
  SystemStatus,
  User
} from './types';

const TOKEN_KEY = 'nexus_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');

  const res = await fetch(path, { ...init, headers });
  if (!res.ok) {
    let message = `请求失败（HTTP ${res.status}）`;
    let code: string | undefined;
    try {
      const data = (await res.json()) as { error?: string; code?: string };
      if (data?.error) message = data.error;
      code = data?.code;
    } catch {
      /* ignore */
    }
    if (res.status === 401) {
      clearToken();
      window.dispatchEvent(new Event('nexus:unauthorized'));
    }
    throw new ApiError(message, res.status, code);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  async login(username: string, password: string): Promise<{ token: string; user: User }> {
    return request('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
  },
  async register(username: string, password: string, displayName: string): Promise<{ token: string; user: User }> {
    return request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password, displayName })
    });
  },
  async me(): Promise<{ user: User }> {
    return request('/api/auth/me');
  },
  async changePassword(currentPassword: string, newPassword: string): Promise<{ ok: boolean }> {
    return request('/api/auth/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword })
    });
  },

  async sessions(params: { q?: string; limit?: number; offset?: number } = {}): Promise<{
    items: SessionSummary[];
    total: number;
    hasMore: boolean;
  }> {
    const query = new URLSearchParams();
    if (params.q) query.set('q', params.q);
    query.set('limit', String(params.limit ?? 100));
    query.set('offset', String(params.offset ?? 0));
    return request(`/api/sessions?${query.toString()}`);
  },
  async session(id: string, before?: string | number, limit = 40): Promise<SessionView> {
    const query = new URLSearchParams();
    query.set('limit', String(limit));
    if (before !== undefined && before !== null) query.set('before', String(before));
    return request(`/api/sessions/${encodeURIComponent(id)}?${query.toString()}`);
  },
  async createSession(title?: string): Promise<{ session: SessionSummary }> {
    return request('/api/sessions', { method: 'POST', body: JSON.stringify({ title }) });
  },
  async patchSession(id: string, patch: { title?: string; pinned?: boolean }): Promise<{ ok: boolean; session?: SessionSummary }> {
    return request(`/api/sessions/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch)
    });
  },
  async deleteSession(id: string): Promise<{ ok: boolean }> {
    return request(`/api/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
  async clearSessions(): Promise<{ ok: boolean; count: number }> {
    return request('/api/sessions', { method: 'DELETE' });
  },
  async editMessage(sessionId: string, messageId: string | number, content: string): Promise<{ ok: boolean }> {
    return request(`/api/sessions/${encodeURIComponent(sessionId)}/messages/${encodeURIComponent(String(messageId))}/edit`, {
      method: 'POST',
      body: JSON.stringify({ content })
    });
  },
  async exportSession(id: string, format: 'md' | 'json'): Promise<void> {
    const token = getToken();
    const res = await fetch(`/api/sessions/${encodeURIComponent(id)}/export?format=${format}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    if (!res.ok) throw new ApiError('导出失败', res.status);
    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition') || '';
    const match = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
    const filename = match ? decodeURIComponent(match[1]) : `session.${format}`;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  },

  async uploadFile(file: File, onProgress?: (percent: number) => void): Promise<AttachmentDto> {
    return new Promise((resolve, reject) => {
      const form = new FormData();
      form.append('file', file);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/files');
      const token = getToken();
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      };
      xhr.onload = () => {
        try {
          const json = JSON.parse(xhr.responseText || '{}');
          if (xhr.status >= 200 && xhr.status < 300) resolve(json as AttachmentDto);
          else reject(new ApiError(json.error || '上传失败', xhr.status));
        } catch {
          reject(new ApiError('上传失败', xhr.status));
        }
      };
      xhr.onerror = () => reject(new ApiError('网络异常，上传失败', 0));
      xhr.send(form);
    });
  },
  async deleteFile(id: string): Promise<void> {
    await request(`/api/files/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
  fileUrl(id: string): string {
    return `/api/files/${encodeURIComponent(id)}/raw?token=${encodeURIComponent(getToken() || '')}`;
  },
  importedFileUrl(pathValue: string): string {
    return `/api/imported-file?path=${encodeURIComponent(pathValue)}&token=${encodeURIComponent(getToken() || '')}`;
  },

  async settings(): Promise<{ settings: Settings }> {
    return request('/api/settings');
  },
  async updateSettings(patch: Partial<Settings>): Promise<{ settings: Settings }> {
    return request('/api/settings', { method: 'PUT', body: JSON.stringify(patch) });
  },

  async systemStatus(): Promise<SystemStatus> {
    return request('/api/system/status');
  },
  async setApiKey(key: string): Promise<{ ok: boolean }> {
    return request('/api/system/api-key', { method: 'POST', body: JSON.stringify({ key }) });
  },
  async clearApiKey(): Promise<{ ok: boolean }> {
    return request('/api/system/api-key', { method: 'DELETE' });
  },
  async runImport(force = false): Promise<{ ok: boolean }> {
    return request('/api/system/import', { method: 'POST', body: JSON.stringify({ force }) });
  },

  async stats(): Promise<StatsResponse> {
    return request('/api/stats');
  },

  async streamChat(
    path: string,
    body: Record<string, unknown>,
    onEvent: (event: StreamEvent) => void,
    signal: AbortSignal
  ): Promise<void> {
    const token = getToken();
    const res = await fetch(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(body),
      signal
    });
    if (!res.ok || !res.body) {
      let message = `请求失败（HTTP ${res.status}）`;
      let code: string | undefined;
      try {
        const data = (await res.json()) as { error?: string; code?: string };
        if (data?.error) message = data.error;
        code = data?.code;
      } catch {
        /* ignore */
      }
      if (res.status === 401) {
        clearToken();
        window.dispatchEvent(new Event('nexus:unauthorized'));
      }
      throw new ApiError(message, res.status, code);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      let index = buffer.indexOf('\n\n');
      while (index >= 0) {
        const block = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        index = buffer.indexOf('\n\n');
        for (const line of block.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const raw = line.slice(5).trim();
          if (!raw) continue;
          try {
            onEvent(JSON.parse(raw) as StreamEvent);
          } catch {
            /* 忽略无法解析的事件 */
          }
        }
      }
    }
  }
};
