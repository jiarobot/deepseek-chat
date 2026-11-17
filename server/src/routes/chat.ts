import { Router } from 'express';
import type { Request, Response } from 'express';
import { db, getUserById, parseSettings } from '../db';
import { requireAuth, type AuthedRequest } from '../middleware/auth';
import {
  createSession,
  getSessionRow,
  getSessionSummary,
  loadPayload,
  nextMessageId,
  savePayload
} from '../sessionStore';
import { startSse, sseSend, streamAssistant } from '../services/chatService';
import type { ChatMessage, Fragment, SessionPayload } from '../types';

export const chatRouter = Router();

chatRouter.use(requireAuth);

function clampTemperature(value: unknown, fallback = 0.7): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(2, Math.max(0, n));
}

function makeTitle(content: string): string {
  const clean = content.replace(/\s+/g, ' ').replace(/[#>*`]/g, '').trim();
  if (!clean) return '新的对话';
  return clean.slice(0, 28) + (clean.length > 28 ? '…' : '');
}

interface AttachmentRow {
  id: string;
  name: string;
  mime: string;
  size: number;
  extracted_text: string | null;
}

function resolveAttachments(userId: string, ids: unknown, sessionId: string): Fragment | null {
  if (!Array.isArray(ids) || !ids.length) return null;
  const cleanIds = ids.filter((x): x is string => typeof x === 'string').slice(0, 8);
  if (!cleanIds.length) return null;
  const placeholders = cleanIds.map(() => '?').join(',');
  const rows = db
    .prepare(`SELECT id, name, mime, size, extracted_text FROM attachments WHERE id IN (${placeholders}) AND user_id = ?`)
    .all(...cleanIds, userId) as unknown as AttachmentRow[];
  if (!rows.length) return null;
  for (const row of rows) {
    db.prepare('UPDATE attachments SET session_id = ? WHERE id = ?').run(sessionId, row.id);
  }
  const files = rows.map((row) => ({
    id: row.id,
    file_name: row.name,
    file_size: row.size,
    is_image: row.mime.startsWith('image/'),
    mime: row.mime,
    token_usage: 0,
    inserted_at: new Date().toISOString(),
    export_path: null,
    url: `/api/files/${row.id}/raw`,
    extracted_text: row.extracted_text || undefined
  }));
  return { type: 'FILE', files };
}

function startGeneration(
  req: Request,
  res: Response,
  payload: SessionPayload,
  opts: {
    content: string;
    thinking: boolean;
    search: boolean;
    temperature: number;
    userMessage?: ChatMessage;
  }
): void {
  const { userId } = (req as unknown as AuthedRequest).auth;
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) controller.abort();
  });
  startSse(res);
  sseSend(res, {
    type: 'session',
    session: getSessionSummary(userId, payload.id),
    messageCount: payload.messages.length,
    userMessage: opts.userMessage
  });
  void streamAssistant({
    res,
    signal: controller.signal,
    userId,
    payload,
    thinking: opts.thinking,
    search: opts.search,
    temperature: opts.temperature,
    searchQuery: opts.content
  });
}

chatRouter.post('/chat', (req, res) => {
  const { userId } = (req as AuthedRequest).auth;
  const user = getUserById(userId);
  const settings = parseSettings(user?.settings || '{}');

  const content = String(req.body?.content || '').trim();
  const attachmentIds = req.body?.attachments;
  if (!content && !(Array.isArray(attachmentIds) && attachmentIds.length)) {
    res.status(400).json({ error: '消息内容不能为空' });
    return;
  }
  if (content.length > 60000) {
    res.status(400).json({ error: '单条消息过长（上限 60000 字符）' });
    return;
  }

  const thinking = req.body?.thinking !== false;
  const search = req.body?.search === true;
  const temperature = clampTemperature(req.body?.temperature, Number(settings.temperature ?? 0.7));

  let payload: SessionPayload | null = null;
  if (typeof req.body?.sessionId === 'string' && req.body.sessionId) {
    const row = getSessionRow(userId, req.body.sessionId);
    if (!row) {
      res.status(404).json({ error: '会话不存在或已被删除' });
      return;
    }
    payload = loadPayload(row.id);
    if (!payload) {
      res.status(500).json({ error: '会话数据损坏，无法继续对话' });
      return;
    }
  } else {
    payload = createSession(userId, makeTitle(content));
  }

  const fragments: Fragment[] = [{ type: 'REQUEST', content }];
  const fileFragment = resolveAttachments(userId, attachmentIds, payload.id);
  if (fileFragment) fragments.push(fileFragment);

  const userMessage: ChatMessage = {
    id: nextMessageId(payload.messages),
    parent_id: payload.current_message_id,
    role: 'USER',
    status: 'FINISHED',
    thinking_enabled: thinking,
    search_enabled: search,
    accumulated_token_usage: Math.max(1, Math.round(content.length / 1.6)),
    inserted_at: new Date().toISOString(),
    fragments
  };
  payload.messages.push(userMessage);
  payload.current_message_id = userMessage.id;
  payload.updated_at = new Date().toISOString();
  if (payload.title === '新的对话' || !payload.title) {
    payload.title = makeTitle(content);
  }
  savePayload(payload.id, payload);

  startGeneration(req, res, payload, { content, thinking, search, temperature, userMessage });
});

chatRouter.post('/sessions/:id/regenerate', (req, res) => {
  const { userId } = (req as unknown as AuthedRequest).auth;
  const row = getSessionRow(userId, req.params.id);
  if (!row) {
    res.status(404).json({ error: '会话不存在' });
    return;
  }
  const payload = loadPayload(row.id);
  if (!payload) {
    res.status(500).json({ error: '会话数据损坏' });
    return;
  }

  const user = getUserById(userId);
  const settings = parseSettings(user?.settings || '{}');
  const thinking = req.body?.thinking !== false;
  const search = req.body?.search === true;
  const temperature = clampTemperature(req.body?.temperature, Number(settings.temperature ?? 0.7));

  const last = payload.messages[payload.messages.length - 1];
  if (last && last.role === 'ASSISTANT') {
    payload.messages.pop();
    const previous = payload.messages[payload.messages.length - 1];
    payload.current_message_id = previous ? previous.id : null;
  }
  const lastUser = [...payload.messages].reverse().find((m) => m.role === 'USER');
  if (!lastUser) {
    res.status(400).json({ error: '没有可重新生成的用户消息' });
    return;
  }
  const requestText = lastUser.fragments
    .filter((f) => f.type === 'REQUEST')
    .map((f) => String(f.content || ''))
    .join('\n\n')
    .trim();

  payload.updated_at = new Date().toISOString();
  savePayload(payload.id, payload);

  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) controller.abort();
  });
  startSse(res);
  sseSend(res, {
    type: 'session',
    session: getSessionSummary(userId, payload.id),
    messageCount: payload.messages.length
  });
  void streamAssistant({
    res,
    signal: controller.signal,
    userId,
    payload,
    thinking,
    search,
    temperature,
    searchQuery: requestText
  });
});
