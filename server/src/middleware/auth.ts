import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import { getAuthSecret, getUserById } from '../db';
import { JWT_TTL } from '../config';
import type { AuthUser, UserRecord } from '../types';

export interface AuthedRequest extends Request {
  auth: AuthUser;
}

export function signToken(userId: string, username: string): string {
  return jwt.sign({ sub: userId, username }, getAuthSecret(), { expiresIn: JWT_TTL });
}

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) return header.slice(7).trim();
  const queryToken = req.query.token;
  if (typeof queryToken === 'string' && queryToken.trim()) return queryToken.trim();
  return null;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: '未登录或登录已过期', code: 'UNAUTHORIZED' });
    return;
  }
  try {
    const payload = jwt.verify(token, getAuthSecret()) as { sub?: string; username?: string };
    const user = payload.sub ? getUserById(payload.sub) : undefined;
    if (!user) {
      res.status(401).json({ error: '账号不存在，请重新登录', code: 'UNAUTHORIZED' });
      return;
    }
    (req as AuthedRequest).auth = { userId: user.id, username: user.username };
    next();
  } catch {
    res.status(401).json({ error: '登录状态已失效，请重新登录', code: 'UNAUTHORIZED' });
  }
}

export interface UserDto {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  createdAt: string;
}

export function toUserDto(user: UserRecord): UserDto {
  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    avatarUrl: user.avatar_url,
    createdAt: user.created_at
  };
}
