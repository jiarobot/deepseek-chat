import { Router } from 'express';
import { requireAuth, type AuthedRequest } from '../middleware/auth';
import {
  clearAllSessions,
  createSession,
  deleteSession,
  exportSessionMarkdown,
  getSessionRow,
  getSessionView,
  listSessions,
  loadPayload,
  renameSession,
  savePayload,
  setPinned
} from '../sessionStore';

export const sessionsRouter = Router();

sessionsRouter.use(requireAuth);

sessionsRouter.get('/sessions', (req, res) => {
  const { userId } = (req as unknown as AuthedRequest).auth;
  const q = typeof req.query.q === 'string' ? req.query.q : '';
  const limit = Number(req.query.limit || 100);
  const offset = Number(req.query.offset || 0);
  res.json(listSessions(userId, { q, limit, offset }));
});

sessionsRouter.post('/sessions', (req, res) => {
  const { userId } = (req as unknown as AuthedRequest).auth;
  const title = typeof req.body?.title === 'string' ? req.body.title : '新的对话';
  const payload = createSession(userId, title);
  res.status(201).json({
    session: {
      id: payload.id,
      title: payload.title,
      pinned: false,
      source: 'local' as const,
      messageCount: 0,
      tokenTotal: 0,
      createdAt: payload.inserted_at,
      updatedAt: payload.updated_at
    }
  });
});

sessionsRouter.get('/sessions/:id', (req, res) => {
  const { userId } = (req as unknown as AuthedRequest).auth;
  const limit = Number(req.query.limit || 40);
  const before = typeof req.query.before === 'string' ? req.query.before : null;
  const view = getSessionView(userId, req.params.id, limit, before);
  if (!view) {
    res.status(404).json({ error: '会话不存在或已被删除' });
    return;
  }
  res.json(view);
});

sessionsRouter.patch('/sessions/:id', (req, res) => {
  const { userId } = (req as unknown as AuthedRequest).auth;
  const { id } = req.params;
  if (!getSessionRow(userId, id)) {
    res.status(404).json({ error: '会话不存在' });
    return;
  }
  if (typeof req.body?.title === 'string') renameSession(userId, id, req.body.title);
  if (typeof req.body?.pinned === 'boolean') setPinned(userId, id, req.body.pinned);
  const view = getSessionView(userId, id, 1);
  res.json({ ok: true, session: view?.session });
});

sessionsRouter.delete('/sessions/:id', (req, res) => {
  const { userId } = (req as unknown as AuthedRequest).auth;
  if (!deleteSession(userId, req.params.id)) {
    res.status(404).json({ error: '会话不存在' });
    return;
  }
  res.json({ ok: true });
});

sessionsRouter.delete('/sessions', (req, res) => {
  const { userId } = (req as unknown as AuthedRequest).auth;
  const count = clearAllSessions(userId);
  res.json({ ok: true, count });
});

sessionsRouter.post('/sessions/:id/messages/:messageId/edit', (req, res) => {
  const { userId } = (req as unknown as AuthedRequest).auth;
  const row = getSessionRow(userId, req.params.id);
  if (!row) {
    res.status(404).json({ error: '会话不存在' });
    return;
  }
  const payload = loadPayload(row.id);
  if (!payload) {
    res.status(404).json({ error: '会话数据缺失' });
    return;
  }
  const index = payload.messages.findIndex((m) => String(m.id) === String(req.params.messageId));
  if (index < 0) {
    res.status(404).json({ error: '消息不存在' });
    return;
  }
  const message = payload.messages[index];
  if (message.role !== 'USER') {
    res.status(400).json({ error: '仅支持编辑用户消息' });
    return;
  }
  const content = String(req.body?.content || '').trim();
  if (!content) {
    res.status(400).json({ error: '消息内容不能为空' });
    return;
  }
  message.fragments = message.fragments
    .filter((f) => f.type !== 'REQUEST')
    .concat([{ type: 'REQUEST', content }]);
  message.inserted_at = new Date().toISOString();
  payload.messages = payload.messages.slice(0, index + 1);
  payload.current_message_id = message.id;
  payload.updated_at = new Date().toISOString();
  savePayload(payload.id, payload);
  res.json({ ok: true, message, removedAfter: index });
});

sessionsRouter.get('/sessions/:id/export', (req, res) => {
  const { userId } = (req as unknown as AuthedRequest).auth;
  const row = getSessionRow(userId, req.params.id);
  if (!row) {
    res.status(404).json({ error: '会话不存在' });
    return;
  }
  const payload = loadPayload(row.id);
  if (!payload) {
    res.status(404).json({ error: '会话数据缺失' });
    return;
  }
  const format = String(req.query.format || 'md').toLowerCase();
  const safeName = payload.title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 60);
  if (format === 'json') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(`${safeName}.json`)}`
    );
    res.send(JSON.stringify(payload, null, 2));
    return;
  }
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename*=UTF-8''${encodeURIComponent(`${safeName}.md`)}`
  );
  res.send(exportSessionMarkdown(payload));
});
