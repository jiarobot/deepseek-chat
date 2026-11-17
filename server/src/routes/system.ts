import { Router } from 'express';
import { dbSizeBytes } from '../db';
import {
  MODELS,
  DEEPSEEK_API_BASE,
  apiKeySource,
  getApiKey,
  maskApiKey,
  setRuntimeApiKey,
  clearRuntimeApiKey
} from '../config';
import { requireAuth } from '../middleware/auth';
import { getImportState, isImportRunning, runImport } from '../importer';

export const systemRouter = Router();

systemRouter.use(requireAuth);

systemRouter.get('/models', (_req, res) => {
  res.json({ models: MODELS });
});

systemRouter.get('/system/status', (_req, res) => {
  const key = getApiKey();
  res.json({
    version: '1.0.0',
    apiBase: DEEPSEEK_API_BASE,
    apiKey: {
      configured: !!key,
      masked: maskApiKey(key),
      source: apiKeySource()
    },
    models: MODELS,
    import: getImportState(),
    importing: isImportRunning(),
    dbSize: dbSizeBytes(),
    uptime: process.uptime(),
    node: process.version
  });
});

systemRouter.post('/system/import', async (req, res) => {
  if (isImportRunning()) {
    res.status(409).json({ error: '导入任务正在运行中', import: getImportState() });
    return;
  }
  const force = req.body?.force === true;
  void runImport(force).catch((err) => console.error('[import] 任务异常:', err));
  res.json({ ok: true, import: getImportState() });
});

systemRouter.post('/system/api-key', (req, res) => {
  const key = String(req.body?.key || '').trim();
  if (!key || key.length < 16 || !key.startsWith('sk-')) {
    res.status(400).json({ error: 'API Key 格式不正确，应以 sk- 开头' });
    return;
  }
  setRuntimeApiKey(key);
  res.json({ ok: true, apiKey: { configured: true, masked: maskApiKey(key), source: 'runtime' } });
});

systemRouter.delete('/system/api-key', (_req, res) => {
  clearRuntimeApiKey();
  const key = getApiKey();
  res.json({
    ok: true,
    apiKey: { configured: !!key, masked: maskApiKey(key), source: apiKeySource() }
  });
});
