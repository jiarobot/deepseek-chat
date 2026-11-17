import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import crypto from 'node:crypto';
import { MAX_UPLOAD_BYTES, UPLOAD_DIR } from '../config';

const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'json', 'jsonl', 'js', 'jsx', 'ts', 'tsx', 'py', 'java', 'c', 'h',
  'cpp', 'hpp', 'cs', 'go', 'rs', 'rb', 'php', 'sql', 'html', 'htm', 'css', 'scss', 'less',
  'yml', 'yaml', 'toml', 'ini', 'conf', 'log', 'csv', 'tsv', 'sh', 'bash', 'bat', 'ps1',
  'vue', 'svelte', 'kt', 'swift', 'm', 'mm', 'r', 'lua', 'dart', 'xml', 'tex', 'env'
]);

export function isTextFile(name: string, mime: string): boolean {
  if (mime.startsWith('text/')) return true;
  if (['application/json', 'application/xml', 'application/javascript', 'application/x-yaml'].includes(mime)) {
    return true;
  }
  const ext = path.extname(name).replace('.', '').toLowerCase();
  return TEXT_EXTENSIONS.has(ext);
}

export function extractText(name: string, mime: string, buffer: Buffer): string | null {
  if (!isTextFile(name, mime)) return null;
  if (buffer.length > 4 * 1024 * 1024) return null;
  try {
    return buffer.toString('utf8').replace(/\u0000/g, '').slice(0, 200000);
  } catch {
    return null;
  }
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).slice(0, 16);
    cb(null, `${crypto.randomUUID()}${ext}`);
  }
});

export const uploadMiddleware = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 8 }
}).single('file');

export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function removeStoredFile(storedPath: string): void {
  try {
    fs.unlinkSync(storedPath);
  } catch {
    /* ignore */
  }
}
