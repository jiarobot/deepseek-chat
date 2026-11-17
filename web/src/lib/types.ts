export interface User {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  createdAt: string;
}

export interface Settings {
  model: 'deepseek-chat' | 'deepseek-reasoner';
  thinking: boolean;
  search: boolean;
  temperature: number;
  systemPrompt: string;
  theme: 'dark' | 'light';
}

export interface SessionSummary {
  id: string;
  title: string;
  pinned: boolean;
  source: 'local' | 'import';
  messageCount: number;
  tokenTotal: number;
  createdAt: string;
  updatedAt: string;
}

export interface SessionView {
  session: SessionSummary;
  messages: ChatMessage[];
  total: number;
  startIndex: number;
  hasMore: boolean;
}

export interface Fragment {
  type: string;
  content?: string;
  elapsed_secs?: number;
  queries?: string[];
  results?: SearchResult[];
  files?: AttachmentFile[];
  status?: string;
  [key: string]: unknown;
}

export interface ChatMessage {
  id: number | string;
  parent_id: number | string | null;
  role: 'USER' | 'ASSISTANT';
  status: string;
  thinking_enabled?: boolean;
  search_enabled?: boolean;
  accumulated_token_usage?: number;
  inserted_at: string;
  fragments: Fragment[];
}

export interface SearchResult {
  url: string;
  title: string;
  snippet: string;
  siteName?: string;
  site_name?: string;
  site_icon?: string;
}

export interface AttachmentFile {
  id?: string;
  file_name?: string;
  name?: string;
  file_size?: number;
  size?: number;
  is_image?: boolean;
  export_path?: string | null;
  url?: string;
  extracted_text?: string;
  mime?: string;
}

export interface ModelInfo {
  id: 'deepseek-chat' | 'deepseek-reasoner';
  label: string;
  shortLabel: string;
  description: string;
  supportsThinking: boolean;
}

export interface ImportState {
  status: 'idle' | 'scanning' | 'running' | 'done' | 'error';
  total: number;
  done: number;
  imported: number;
  skipped: number;
  failed: number;
  startedAt: string | null;
  finishedAt: string | null;
  message: string;
  error?: string;
}

export interface SystemStatus {
  version: string;
  apiBase: string;
  apiKey: { configured: boolean; masked: string; source: 'env' | 'runtime' | 'none' };
  models: ModelInfo[];
  import: ImportState;
  importing: boolean;
  dbSize: number;
  uptime: number;
  node: string;
}

export interface AttachmentDto {
  id: string;
  name: string;
  size: number;
  mime: string;
  isImage: boolean;
  hasText: boolean;
  url: string;
}

export interface StatsResponse {
  totals: {
    sessions: number;
    messages: number;
    tokens: number;
    pinned: number;
    imported: number;
    local: number;
  };
  months: Array<{ month: string; count: number; messages: number }>;
  activity: Array<{ date: string; count: number }>;
  top: Array<{ id: string; title: string; messageCount: number; tokenTotal: number; updatedAt: string }>;
  range: { first: string | null; last: string | null };
}

export interface StreamEvent {
  type: string;
  [key: string]: unknown;
}
