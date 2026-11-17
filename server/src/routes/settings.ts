import { Router } from 'express';
import { getUserById, parseSettings, updateSettings } from '../db';
import { requireAuth, type AuthedRequest } from '../middleware/auth';

export const settingsRouter = Router();

settingsRouter.use(requireAuth);

settingsRouter.get('/settings', (req, res) => {
  const { userId } = (req as AuthedRequest).auth;
  const user = getUserById(userId);
  res.json({ settings: parseSettings(user?.settings || '{}') });
});

settingsRouter.put('/settings', (req, res) => {
  const { userId } = (req as AuthedRequest).auth;
  const body = (req.body || {}) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};

  if (body.model === 'deepseek-chat' || body.model === 'deepseek-reasoner') patch.model = body.model;
  if (typeof body.thinking === 'boolean') patch.thinking = body.thinking;
  if (typeof body.search === 'boolean') patch.search = body.search;
  if (typeof body.temperature === 'number' && Number.isFinite(body.temperature)) {
    patch.temperature = Math.min(2, Math.max(0, body.temperature));
  }
  if (typeof body.systemPrompt === 'string') patch.systemPrompt = body.systemPrompt.slice(0, 4000);
  if (body.theme === 'dark' || body.theme === 'light') patch.theme = body.theme;

  const next = updateSettings(userId, patch);
  res.json({ settings: next });
});
