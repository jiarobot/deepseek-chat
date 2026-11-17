export type Role = 'USER' | 'ASSISTANT';

export interface Fragment {
  type: string;
  content?: string;
  elapsed_secs?: number;
  [key: string]: unknown;
}

export interface ChatMessage {
  id: number | string;
  parent_id: number | string | null;
  role: Role;
  status: string;
  thinking_enabled?: boolean;
  search_enabled?: boolean;
  accumulated_token_usage?: number;
  inserted_at: string;
  fragments: Fragment[];
}

export interface SessionPayload {
  id: string;
  title: string;
  pinned: boolean;
  current_message_id: number | string | null;
  inserted_at: string;
  updated_at: string;
  messages: ChatMessage[];
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

export interface SessionRow {
  id: string;
  user_id: string;
  title: string;
  pinned: number;
  source: string;
  message_count: number;
  token_total: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  source_mtime: number | null;
  imported: number;
}

export interface AuthUser {
  userId: string;
  username: string;
}

export interface UserRecord {
  id: string;
  username: string;
  password_hash: string;
  display_name: string;
  avatar_url: string | null;
  created_at: string;
  settings: string;
}

export interface SearchResult {
  url: string;
  title: string;
  snippet: string;
  siteName?: string;
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
