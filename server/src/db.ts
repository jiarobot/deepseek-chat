import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { DatabaseSync } from 'node:sqlite';
import {
  DATA_DIR,
  DB_PATH,
  EXPORT_DIR,
  OWNER_DISPLAY_NAME,
  OWNER_PASSWORD,
  OWNER_USERNAME,
  UPLOAD_DIR
} from './config';
import type { UserRecord } from './types';

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 8000;

  CREATE TABLE IF NOT EXISTS kv (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    avatar_url TEXT,
    created_at TEXT NOT NULL,
    settings TEXT NOT NULL DEFAULT '{}'
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    pinned INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'local',
    message_count INTEGER NOT NULL DEFAULT 0,
    token_total INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    source_mtime INTEGER,
    imported INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_user_updated
    ON sessions (user_id, deleted_at, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_sessions_user_title
    ON sessions (user_id, title);

  CREATE TABLE IF NOT EXISTS payloads (
    session_id TEXT PRIMARY KEY,
    data BLOB NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    session_id TEXT,
    name TEXT NOT NULL,
    mime TEXT NOT NULL,
    size INTEGER NOT NULL,
    stored_path TEXT NOT NULL,
    extracted_text TEXT,
    created_at TEXT NOT NULL
  );
`);

export const DEFAULT_SETTINGS = {
  model: 'deepseek-chat',
  thinking: false,
  search: false,
  temperature: 0.7,
  systemPrompt: '',
  theme: 'dark'
};

export function kvGet(key: string): string | null {
  const row = db.prepare('SELECT value FROM kv WHERE key = ?').get(key) as { value: string } | undefined;
  return row ? row.value : null;
}

export function kvSet(key: string, value: string): void {
  db.prepare(
    'INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, value);
}

let cachedSecret: string | null = null;

/** JWT 密钥在首次启动时随机生成并保存在本地数据库中，不写入任何配置文件 */
export function getAuthSecret(): string {
  if (cachedSecret) return cachedSecret;
  let secret = kvGet('auth_secret');
  if (!secret) {
    secret = crypto.randomBytes(48).toString('hex');
    kvSet('auth_secret', secret);
  }
  cachedSecret = secret;
  return secret;
}

function readExportedProfile(): { name?: string; picture?: string } {
  try {
    const raw = fs.readFileSync(path.join(EXPORT_DIR, 'user.json'), 'utf8');
    const data = JSON.parse(raw) as { oauth_profiles?: Array<{ profile_json?: string }> };
    const profileRaw = data.oauth_profiles?.[0]?.profile_json;
    if (!profileRaw) return {};
    const profile = JSON.parse(profileRaw) as { name?: string; picture?: string };
    return { name: profile.name, picture: profile.picture };
  } catch {
    return {};
  }
}

/** 首次启动时创建默认账号，并把导出的历史记录归属到该账号 */
export function ensureOwnerUser(): UserRecord {
  const existing = db.prepare('SELECT * FROM users WHERE username = ?').get(OWNER_USERNAME) as
    | UserRecord
    | undefined;
  if (existing) return existing;

  const profile = readExportedProfile();
  const id = `u_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const record: UserRecord = {
    id,
    username: OWNER_USERNAME,
    password_hash: bcrypt.hashSync(OWNER_PASSWORD, 10),
    display_name: profile.name || OWNER_DISPLAY_NAME,
    avatar_url: profile.picture || null,
    created_at: now,
    settings: JSON.stringify(DEFAULT_SETTINGS)
  };
  db.prepare(
    `INSERT INTO users (id, username, password_hash, display_name, avatar_url, created_at, settings)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    record.id,
    record.username,
    record.password_hash,
    record.display_name,
    record.avatar_url,
    record.created_at,
    record.settings
  );
  return record;
}

export function getUserById(id: string): UserRecord | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRecord | undefined;
}

export function getUserByUsername(username: string): UserRecord | undefined {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username) as UserRecord | undefined;
}

export function parseSettings(raw: string): typeof DEFAULT_SETTINGS {
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as object) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function updateSettings(userId: string, patch: Record<string, unknown>): typeof DEFAULT_SETTINGS {
  const user = getUserById(userId);
  const current = parseSettings(user?.settings || '{}');
  const next = { ...current, ...patch };
  db.prepare('UPDATE users SET settings = ? WHERE id = ?').run(JSON.stringify(next), userId);
  return next;
}

export function dbSizeBytes(): number {
  try {
    const wal = `${DB_PATH}-wal`;
    return (
      fs.statSync(DB_PATH).size + (fs.existsSync(wal) ? fs.statSync(wal).size : 0)
    );
  } catch {
    return 0;
  }
}
