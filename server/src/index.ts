import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { HOST, PORT, WEB_DIST, apiKeySource, getApiKey } from './config';
import { db, ensureOwnerUser } from './db';
import { runImport } from './importer';
import { authRouter } from './routes/auth';
import { sessionsRouter } from './routes/sessions';
import { chatRouter } from './routes/chat';
import { filesRouter } from './routes/files';
import { statsRouter } from './routes/stats';
import { settingsRouter } from './routes/settings';
import { systemRouter } from './routes/system';

const app = express();
app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '4mb' }));

app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on('finish', () => {
    if (!req.path.startsWith('/api') || req.path === '/api/health') return;
    if (req.path === '/api/system/status') return;
    const ms = Date.now() - startedAt;
    console.log(`[api] ${req.method} ${req.originalUrl.split('?')[0]} ${res.statusCode} ${ms}ms`);
  });
  next();
});

app.use('/api/auth', authRouter);
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString(), port: PORT });
});
app.use('/api', sessionsRouter);
app.use('/api', chatRouter);
app.use('/api', filesRouter);
app.use('/api', statsRouter);
app.use('/api', settingsRouter);
app.use('/api', systemRouter);
app.use('/api', (_req, res) => {
  res.status(404).json({ error: '接口不存在', code: 'NOT_FOUND' });
});

if (fs.existsSync(WEB_DIST)) {
  app.use(express.static(WEB_DIST, { index: false, maxAge: '1h' }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      next();
      return;
    }
    res.sendFile(path.join(WEB_DIST, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => {
    res
      .status(200)
      .type('text/plain')
      .send('DeepSeek Nexus API 正在运行。前端尚未构建，请执行 npm run build 后刷新。');
  });
}

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[server] 未处理异常:', err);
  if (res.headersSent) return;
  res.status(500).json({ error: '服务器内部错误，请查看服务端日志' });
});

ensureOwnerUser();

const server = app.listen(PORT, HOST, () => {
  const key = getApiKey();
  console.log('');
  console.log('  ██████╗ ███╗   ██╗███████╗██╗  ██╗██╗   ██╗███████╗');
  console.log('  ██╔══██╗████╗  ██║██╔════╝╚██╗██╔╝██║   ██║██╔════╝');
  console.log('  ██║  ██║██╔██╗ ██║█████╗   ╚███╔╝ ██║   ██║███████╗');
  console.log('  ██║  ██║██║╚██╗██║██╔══╝   ██╔██╗ ██║   ██║╚════██║');
  console.log('  ██████╔╝██║ ╚████║███████╗██╔╝ ██╗╚██████╔╝███████║');
  console.log('  ╚═════╝ ╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝');
  console.log('');
  console.log(`  DeepSeek Nexus 运行于 http://${HOST}:${PORT}`);
  console.log(`  API Key：${key ? `已配置（来源 ${apiKeySource()}）` : '未配置（设置 DEEPSEEK_API_KEY 后可对话）'}`);
  console.log('');
  setTimeout(() => {
    void runImport().catch((err) => console.error('[import] 启动导入失败:', err));
  }, 500);
});

function shutdown(signal: string): void {
  console.log(`\n[server] 收到 ${signal}，正在关闭…`);
  server.close(() => {
    try {
      db.close();
    } catch {
      /* ignore */
    }
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 3000);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
