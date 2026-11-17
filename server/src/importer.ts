import fs from 'node:fs';
import path from 'node:path';
import { EXPORT_INDEX_PATH, EXPORT_SESSION_DIR } from './config';
import { db, ensureOwnerUser, kvSet } from './db';
import { upsertImportedSession } from './sessionStore';
import type { ChatMessage, ImportState, SessionPayload } from './types';

interface IndexItem {
  id: string;
  title?: string;
  pinned?: boolean;
  message_count?: number;
  inserted_at?: string;
  updated_at?: string;
}

const state: ImportState = {
  status: 'idle',
  total: 0,
  done: 0,
  imported: 0,
  skipped: 0,
  failed: 0,
  startedAt: null,
  finishedAt: null,
  message: '尚未开始'
};

let running = false;

export function getImportState(): ImportState {
  return { ...state };
}

function normalizePayload(raw: unknown, item: IndexItem, fileId: string): SessionPayload {
  const data = (raw || {}) as Partial<SessionPayload>;
  const messages = Array.isArray(data.messages) ? (data.messages as ChatMessage[]) : [];
  const now = new Date().toISOString();
  return {
    id: typeof data.id === 'string' && data.id ? data.id : fileId,
    title: (typeof data.title === 'string' && data.title.trim()) || item.title || '未命名对话',
    pinned: typeof data.pinned === 'boolean' ? data.pinned : !!item.pinned,
    current_message_id:
      data.current_message_id ?? (messages.length ? messages[messages.length - 1].id : null),
    inserted_at: data.inserted_at || item.inserted_at || now,
    updated_at: data.updated_at || item.updated_at || now,
    messages
  };
}

function parseIndex(): IndexItem[] {
  if (!fs.existsSync(EXPORT_INDEX_PATH)) return [];
  try {
    const raw = fs.readFileSync(EXPORT_INDEX_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as IndexItem[]) : [];
  } catch (err) {
    console.error('[import] 无法解析 chat_session_index.json:', err);
    return [];
  }
}

/**
 * 将导出的历史会话导入本地 SQLite。
 * - 默认增量：mtime 未变化则跳过
 * - force=true 时全量重写会话内容（已删除的会话不会被恢复）
 */
export async function runImport(force = false): Promise<ImportState> {
  if (running) return getImportState();
  running = true;

  Object.assign(state, {
    status: 'scanning',
    total: 0,
    done: 0,
    imported: 0,
    skipped: 0,
    failed: 0,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    message: '正在扫描导出数据…',
    error: undefined
  });

  try {
    const owner = ensureOwnerUser();
    const items = parseIndex();
    if (!items.length) {
      state.status = 'idle';
      state.message = fs.existsSync(EXPORT_INDEX_PATH)
        ? '索引文件为空，未发现可导入的会话'
        : '未找到 chat_session_index.json，跳过历史导入';
      state.finishedAt = new Date().toISOString();
      return getImportState();
    }

    state.total = items.length;
    state.status = 'running';

    const existingStmt = db.prepare('SELECT source_mtime FROM sessions WHERE id = ?');

    let batchOpen = false;
    const openBatch = () => {
      if (!batchOpen) {
        db.exec('BEGIN IMMEDIATE');
        batchOpen = true;
      }
    };
    const commitBatch = () => {
      if (batchOpen) {
        db.exec('COMMIT');
        batchOpen = false;
      }
    };

    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      const filePath = path.join(EXPORT_SESSION_DIR, `${item.id}.json`);
      try {
        if (!fs.existsSync(filePath)) {
          state.failed += 1;
          continue;
        }
        const stat = fs.statSync(filePath);
        const existing = existingStmt.get(item.id) as { source_mtime: number | null } | undefined;
        if (!force && existing && Number(existing.source_mtime) === stat.mtimeMs) {
          state.skipped += 1;
          continue;
        }

        const text = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(text) as unknown;
        const payload = normalizePayload(parsed, item, item.id);

        openBatch();
        upsertImportedSession({
          sessionId: item.id,
          userId: owner.id,
          payload,
          pinned: payload.pinned,
          sourceMtime: stat.mtimeMs
        });
        state.imported += 1;
      } catch (err) {
        state.failed += 1;
        if (state.failed <= 5) {
          console.warn(`[import] 会话 ${item.id} 导入失败:`, (err as Error).message);
        }
      } finally {
        state.done += 1;
      }

      if ((i + 1) % 100 === 0) {
        commitBatch();
        state.message = `已处理 ${i + 1} / ${items.length} 个会话`;
        await new Promise((resolve) => setImmediate(resolve));
      }
    }

    commitBatch();
    kvSet('import_completed_at', new Date().toISOString());
    state.status = 'done';
    state.message = `导入完成：新增/更新 ${state.imported} 个，跳过 ${state.skipped} 个，失败 ${state.failed} 个`;
    state.finishedAt = new Date().toISOString();
    console.log(`[import] ${state.message}`);
    return getImportState();
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      /* noop */
    }
    state.status = 'error';
    state.error = (err as Error).message;
    state.message = '历史数据导入失败';
    state.finishedAt = new Date().toISOString();
    console.error('[import] 失败:', err);
    return getImportState();
  } finally {
    running = false;
  }
}

export function isImportRunning(): boolean {
  return running;
}
