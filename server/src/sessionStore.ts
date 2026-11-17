import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { db } from './db';
import type { ChatMessage, SessionPayload, SessionRow, SessionSummary } from './types';

export function rowToSummary(row: SessionRow): SessionSummary {
  return {
    id: row.id,
    title: row.title,
    pinned: !!row.pinned,
    source: row.source === 'import' ? 'import' : 'local',
    messageCount: row.message_count,
    tokenTotal: row.token_total,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (m) => `\\${m}`);
}

export interface ListOptions {
  q?: string;
  limit?: number;
  offset?: number;
}

export function listSessions(userId: string, opts: ListOptions = {}) {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  const offset = Math.max(opts.offset ?? 0, 0);
  const params: Array<string | number> = [userId];
  let where = 'user_id = ? AND deleted_at IS NULL';
  if (opts.q && opts.q.trim()) {
    where += " AND title LIKE ? ESCAPE '\\'";
    params.push(`%${escapeLike(opts.q.trim())}%`);
  }
  const totalRow = db.prepare(`SELECT COUNT(*) AS c FROM sessions WHERE ${where}`).get(...params) as {
    c: number;
  };
  const rows = db
    .prepare(
      `SELECT * FROM sessions WHERE ${where}
       ORDER BY pinned DESC, updated_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset) as unknown as SessionRow[];
  return {
    items: rows.map(rowToSummary),
    total: Number(totalRow.c),
    hasMore: offset + rows.length < Number(totalRow.c)
  };
}

export function getSessionRow(userId: string, sessionId: string): SessionRow | undefined {
  return db
    .prepare('SELECT * FROM sessions WHERE id = ? AND user_id = ? AND deleted_at IS NULL')
    .get(sessionId, userId) as SessionRow | undefined;
}

export function getSessionSummary(userId: string, sessionId: string): SessionSummary | null {
  const row = getSessionRow(userId, sessionId);
  return row ? rowToSummary(row) : null;
}

export function loadPayload(sessionId: string): SessionPayload | null {
  const row = db.prepare('SELECT data FROM payloads WHERE session_id = ?').get(sessionId) as
    | { data: Uint8Array }
    | undefined;
  if (!row) return null;
  try {
    const raw = zlib.gunzipSync(Buffer.from(row.data)).toString('utf8');
    return JSON.parse(raw) as SessionPayload;
  } catch {
    return null;
  }
}

function gzipPayload(payload: SessionPayload): Buffer {
  return zlib.gzipSync(Buffer.from(JSON.stringify(payload), 'utf8'), { level: 6 });
}

export function tokenTotal(messages: ChatMessage[]): number {
  return messages.reduce((sum, m) => sum + (Number(m.accumulated_token_usage) || 0), 0);
}

export function savePayload(sessionId: string, payload: SessionPayload, touch = true): void {
  if (touch) payload.updated_at = new Date().toISOString();
  const packed = gzipPayload(payload);
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(
      `INSERT INTO payloads (session_id, data, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(session_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
    ).run(sessionId, packed, payload.updated_at);
    db.prepare(
      `UPDATE sessions SET title = ?, pinned = ?, message_count = ?, token_total = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      payload.title,
      payload.pinned ? 1 : 0,
      payload.messages.length,
      tokenTotal(payload.messages),
      payload.updated_at,
      sessionId
    );
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function upsertImportedSession(input: {
  sessionId: string;
  userId: string;
  payload: SessionPayload;
  pinned: boolean;
  sourceMtime: number;
}): void {
  const { sessionId, userId, payload, pinned, sourceMtime } = input;
  const now = payload.updated_at || new Date().toISOString();
  const packed = gzipPayload(payload);
  db.prepare(
    `INSERT INTO sessions
      (id, user_id, title, pinned, source, message_count, token_total, created_at, updated_at, source_mtime, imported)
     VALUES (?, ?, ?, ?, 'import', ?, ?, ?, ?, ?, 1)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       pinned = excluded.pinned,
       source = 'import',
       message_count = excluded.message_count,
       token_total = excluded.token_total,
       updated_at = excluded.updated_at,
       source_mtime = excluded.source_mtime,
       imported = 1`
  ).run(
    sessionId,
    userId,
    payload.title,
    pinned ? 1 : 0,
    payload.messages.length,
    tokenTotal(payload.messages),
    payload.inserted_at || now,
    now,
    sourceMtime
  );
  db.prepare(
    `INSERT INTO payloads (session_id, data, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(session_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
  ).run(sessionId, packed, payload.updated_at || now);
}

export function createSession(userId: string, title = '新的对话'): SessionPayload {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const payload: SessionPayload = {
    id,
    title: title.trim() || '新的对话',
    pinned: false,
    current_message_id: null,
    inserted_at: now,
    updated_at: now,
    messages: []
  };
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(
      `INSERT INTO sessions (id, user_id, title, pinned, source, message_count, token_total, created_at, updated_at, imported)
       VALUES (?, ?, ?, 0, 'local', 0, 0, ?, ?, 0)`
    ).run(id, userId, payload.title, now, now);
    db.prepare('INSERT INTO payloads (session_id, data, updated_at) VALUES (?, ?, ?)').run(
      id,
      gzipPayload(payload),
      now
    );
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return payload;
}

export function renameSession(userId: string, sessionId: string, title: string): boolean {
  const row = getSessionRow(userId, sessionId);
  if (!row) return false;
  const clean = title.trim().slice(0, 120) || '未命名对话';
  const payload = loadPayload(sessionId);
  if (payload) {
    payload.title = clean;
    savePayload(sessionId, payload, false);
  } else {
    db.prepare('UPDATE sessions SET title = ? WHERE id = ?').run(clean, sessionId);
  }
  return true;
}

export function setPinned(userId: string, sessionId: string, pinned: boolean): boolean {
  const row = getSessionRow(userId, sessionId);
  if (!row) return false;
  const payload = loadPayload(sessionId);
  if (payload) {
    payload.pinned = pinned;
    savePayload(sessionId, payload, false);
  } else {
    db.prepare('UPDATE sessions SET pinned = ? WHERE id = ?').run(pinned ? 1 : 0, sessionId);
  }
  return true;
}

export function deleteSession(userId: string, sessionId: string): boolean {
  const row = getSessionRow(userId, sessionId);
  if (!row) return false;
  db.prepare('UPDATE sessions SET deleted_at = ? WHERE id = ?').run(new Date().toISOString(), sessionId);
  return true;
}

export function clearAllSessions(userId: string): number {
  const now = new Date().toISOString();
  const result = db
    .prepare('UPDATE sessions SET deleted_at = ? WHERE user_id = ? AND deleted_at IS NULL')
    .run(now, userId);
  return Number(result.changes || 0);
}

export interface SessionView {
  session: SessionSummary;
  messages: ChatMessage[];
  total: number;
  startIndex: number;
  hasMore: boolean;
}

export function getSessionView(
  userId: string,
  sessionId: string,
  limit = 40,
  before?: number | string | null
): SessionView | null {
  const row = getSessionRow(userId, sessionId);
  if (!row) return null;
  const payload = loadPayload(sessionId);
  if (!payload) return null;
  const all = payload.messages || [];
  const total = all.length;
  let end = total;
  if (before !== undefined && before !== null && before !== '') {
    const idx = all.findIndex((m) => String(m.id) === String(before));
    if (idx >= 0) end = idx;
  }
  const size = Math.max(1, Math.min(limit, 200));
  const start = Math.max(0, end - size);
  return {
    session: rowToSummary(row),
    messages: all.slice(start, end),
    total,
    startIndex: start,
    hasMore: start > 0
  };
}

export function nextMessageId(messages: ChatMessage[]): number {
  let max = 0;
  for (const m of messages) {
    const n = Number(m.id);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max + 1;
}

export function userContent(message: ChatMessage): string {
  return message.fragments
    .filter((f) => f.type === 'REQUEST')
    .map((f) => String(f.content || ''))
    .join('\n\n')
    .trim();
}

export function assistantContent(message: ChatMessage): string {
  return message.fragments
    .filter((f) => f.type === 'RESPONSE' || f.type === 'TEMPLATE_RESPONSE')
    .map((f) => String(f.content || ''))
    .join('\n\n')
    .trim();
}

export function exportSessionMarkdown(payload: SessionPayload): string {
  const lines: string[] = [
    `# ${payload.title}`,
    '',
    `> 导出时间：${new Date().toISOString()} · 消息数：${payload.messages.length}`,
    ''
  ];
  for (const m of payload.messages) {
    const isUser = m.role === 'USER';
    lines.push(`## ${isUser ? '我' : 'DeepSeek'} · ${m.inserted_at}`, '');
    for (const f of m.fragments) {
      if (f.type === 'THINK') {
        lines.push('<details><summary>思考过程</summary>', '', String(f.content || ''), '', '</details>', '');
      } else if (f.type === 'TOOL_SEARCH') {
        const queries = Array.isArray(f.queries) ? (f.queries as string[]) : [];
        lines.push(`> 联网检索：${queries.join(' / ')}`, '');
      } else if (typeof f.content === 'string' && f.content.trim()) {
        lines.push(f.content, '');
      }
    }
  }
  return lines.join('\n');
}
