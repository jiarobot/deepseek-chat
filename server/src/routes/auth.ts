import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { ALLOW_REGISTER } from '../config';
import { DEFAULT_SETTINGS, db, getUserById, getUserByUsername } from '../db';
import { requireAuth, signToken, toUserDto, type AuthedRequest } from '../middleware/auth';

export const authRouter = Router();

function normalizeUsername(input: unknown): string {
  return String(input || '').trim();
}

authRouter.post('/login', (req, res) => {
  const username = normalizeUsername(req.body?.username);
  const password = String(req.body?.password || '');
  if (!username || !password) {
    res.status(400).json({ error: '请输入账号和密码' });
    return;
  }
  const user = getUserByUsername(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    res.status(401).json({ error: '账号或密码不正确' });
    return;
  }
  res.json({ token: signToken(user.id, user.username), user: toUserDto(user) });
});

authRouter.post('/register', (req, res) => {
  if (!ALLOW_REGISTER) {
    res.status(403).json({ error: '当前实例已关闭注册，请使用已有账号登录' });
    return;
  }
  const username = normalizeUsername(req.body?.username);
  const password = String(req.body?.password || '');
  const displayName = String(req.body?.displayName || username).trim();

  if (!/^[A-Za-z0-9_\u4e00-\u9fa5-]{2,24}$/.test(username)) {
    res.status(400).json({ error: '账号需为 2-24 位中文、字母、数字、下划线或中划线' });
    return;
  }
  if (password.length < 6 || password.length > 64) {
    res.status(400).json({ error: '密码长度需在 6-64 位之间' });
    return;
  }
  if (getUserByUsername(username)) {
    res.status(409).json({ error: '该账号已存在' });
    return;
  }
  const now = new Date().toISOString();
  const id = `u_${crypto.randomUUID()}`;
  db.prepare(
    `INSERT INTO users (id, username, password_hash, display_name, avatar_url, created_at, settings)
     VALUES (?, ?, ?, ?, NULL, ?, ?)`
  ).run(id, username, bcrypt.hashSync(password, 10), displayName.slice(0, 40), now, JSON.stringify(DEFAULT_SETTINGS));
  const user = getUserById(id)!;
  res.status(201).json({ token: signToken(user.id, user.username), user: toUserDto(user) });
});

authRouter.get('/me', requireAuth, (req, res) => {
  const { userId } = (req as AuthedRequest).auth;
  const user = getUserById(userId);
  if (!user) {
    res.status(401).json({ error: '账号不存在' });
    return;
  }
  res.json({ user: toUserDto(user) });
});

authRouter.post('/password', requireAuth, (req, res) => {
  const { userId } = (req as AuthedRequest).auth;
  const user = getUserById(userId);
  if (!user) {
    res.status(404).json({ error: '账号不存在' });
    return;
  }
  const currentPassword = String(req.body?.currentPassword || '');
  const newPassword = String(req.body?.newPassword || '');
  if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
    res.status(400).json({ error: '当前密码不正确' });
    return;
  }
  if (newPassword.length < 6 || newPassword.length > 64) {
    res.status(400).json({ error: '新密码长度需在 6-64 位之间' });
    return;
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(newPassword, 10), userId);
  res.json({ ok: true });
});
