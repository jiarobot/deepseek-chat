import { Router } from 'express';
import { db } from '../db';
import { requireAuth, type AuthedRequest } from '../middleware/auth';
import type { SessionRow } from '../types';

export const statsRouter = Router();

statsRouter.use(requireAuth);

statsRouter.get('/stats', (req, res) => {
  const { userId } = (req as AuthedRequest).auth;

  const totals = db
    .prepare(
      `SELECT COUNT(*) AS sessions,
              COALESCE(SUM(message_count), 0) AS messages,
              COALESCE(SUM(token_total), 0) AS tokens,
              COALESCE(SUM(CASE WHEN pinned = 1 THEN 1 ELSE 0 END), 0) AS pinned,
              COALESCE(SUM(CASE WHEN source = 'import' THEN 1 ELSE 0 END), 0) AS imported,
              COALESCE(SUM(CASE WHEN source = 'local' THEN 1 ELSE 0 END), 0) AS local
       FROM sessions WHERE user_id = ? AND deleted_at IS NULL`
    )
    .get(userId) as Record<string, number>;

  const months = db
    .prepare(
      `SELECT substr(updated_at, 1, 7) AS month, COUNT(*) AS count, COALESCE(SUM(message_count), 0) AS messages
       FROM sessions WHERE user_id = ? AND deleted_at IS NULL
       GROUP BY month ORDER BY month DESC LIMIT 12`
    )
    .all(userId) as Array<{ month: string; count: number; messages: number }>;

  const activity = db
    .prepare(
      `SELECT substr(updated_at, 1, 10) AS date, COUNT(*) AS count
       FROM sessions WHERE user_id = ? AND deleted_at IS NULL
       GROUP BY date ORDER BY date DESC LIMIT 120`
    )
    .all(userId) as Array<{ date: string; count: number }>;

  const top = db
    .prepare(
      `SELECT * FROM sessions WHERE user_id = ? AND deleted_at IS NULL
       ORDER BY token_total DESC LIMIT 8`
    )
    .all(userId) as unknown as SessionRow[];

  const firstRow = db
    .prepare('SELECT MIN(created_at) AS first, MAX(updated_at) AS last FROM sessions WHERE user_id = ? AND deleted_at IS NULL')
    .get(userId) as { first: string | null; last: string | null };

  res.json({
    totals: {
      sessions: Number(totals.sessions || 0),
      messages: Number(totals.messages || 0),
      tokens: Number(totals.tokens || 0),
      pinned: Number(totals.pinned || 0),
      imported: Number(totals.imported || 0),
      local: Number(totals.local || 0)
    },
    months: months.reverse(),
    activity: activity.reverse(),
    top: top.map((row) => ({
      id: row.id,
      title: row.title,
      messageCount: row.message_count,
      tokenTotal: row.token_total,
      updatedAt: row.updated_at
    })),
    range: { first: firstRow.first, last: firstRow.last }
  });
});
