import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { db } from '../db';
import { EXPORT_DIR } from '../config';
import { requireAuth, type AuthedRequest } from '../middleware/auth';
import { extractText, removeStoredFile, uploadMiddleware } from '../services/attachments';

export const filesRouter = Router();

interface AttachmentRow {
  id: string;
  name: string;
  mime: string;
  size: number;
  stored_path: string;
  user_id: string;
}

filesRouter.use(requireAuth);

filesRouter.post('/files', (req, res, next) => {
  uploadMiddleware(req, res, (err: unknown) => {
    if (err) {
      res.status(400).json({ error: `文件上传失败：${(err as Error).message}` });
      return;
    }
    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (!file) {
      res.status(400).json({ error: '未接收到文件' });
      return;
    }
    try {
      const { userId } = (req as AuthedRequest).auth;
      const buffer = fs.readFileSync(file.path);
      const text = extractText(file.originalname, file.mimetype, buffer);
      const id = crypto.randomUUID();
      db.prepare(
        `INSERT INTO attachments (id, user_id, name, mime, size, stored_path, extracted_text, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        userId,
        file.originalname,
        file.mimetype || 'application/octet-stream',
        file.size,
        file.path,
        text,
        new Date().toISOString()
      );
      res.status(201).json({
        id,
        name: file.originalname,
        size: file.size,
        mime: file.mimetype,
        isImage: (file.mimetype || '').startsWith('image/'),
        hasText: !!text,
        url: `/api/files/${id}/raw`
      });
    } catch (error) {
      removeStoredFile(file.path);
      next(error);
    }
  });
});

filesRouter.delete('/files/:id', (req, res) => {
  const { userId } = (req as unknown as AuthedRequest).auth;
  const row = db
    .prepare('SELECT * FROM attachments WHERE id = ? AND user_id = ?')
    .get(req.params.id, userId) as AttachmentRow | undefined;
  if (!row) {
    res.status(404).json({ error: '文件不存在' });
    return;
  }
  removeStoredFile(row.stored_path);
  db.prepare('DELETE FROM attachments WHERE id = ?').run(row.id);
  res.json({ ok: true });
});

filesRouter.get('/files/:id/raw', (req, res) => {
  const { userId } = (req as unknown as AuthedRequest).auth;
  const row = db
    .prepare('SELECT * FROM attachments WHERE id = ? AND user_id = ?')
    .get(req.params.id, userId) as AttachmentRow | undefined;
  if (!row || !fs.existsSync(row.stored_path)) {
    res.status(404).json({ error: '文件不存在' });
    return;
  }
  res.setHeader('Content-Type', row.mime || 'application/octet-stream');
  res.setHeader('Cache-Control', 'private, max-age=86400');
  fs.createReadStream(row.stored_path).pipe(res);
});

/** 读取导出包中的历史附件（只允许访问导出目录内部的文件） */
filesRouter.get('/imported-file', (req, res) => {
  const rawPath = typeof req.query.path === 'string' ? req.query.path : '';
  if (!rawPath) {
    res.status(400).json({ error: '缺少 path 参数' });
    return;
  }
  const target = path.resolve(EXPORT_DIR, rawPath);
  const root = path.resolve(EXPORT_DIR);
  if (target !== root && !target.startsWith(root + path.sep)) {
    res.status(403).json({ error: '非法路径' });
    return;
  }
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
    res.status(404).json({ error: '文件不存在' });
    return;
  }
  res.setHeader('Cache-Control', 'private, max-age=604800');
  res.sendFile(target, (err) => {
    if (err && !res.headersSent) {
      res.status(500).json({ error: '读取文件失败' });
    }
  });
});

export function multerErrorHandler(err: Error, _req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    next(err);
    return;
  }
  res.status(400).json({ error: err.message });
}
