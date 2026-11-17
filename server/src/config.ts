import path from 'node:path';

/** 项目根目录（e:\deepseek-chat） */
export const ROOT_DIR = path.resolve(__dirname, '..', '..');
export const SERVER_DIR = path.resolve(ROOT_DIR, 'server');
export const WEB_DIST = path.join(ROOT_DIR, 'web', 'dist');

/** 运行时数据目录（数据库、上传文件），已被 .gitignore 忽略 */
export const DATA_DIR = process.env.NEXUS_DATA_DIR
  ? path.resolve(process.env.NEXUS_DATA_DIR)
  : path.join(SERVER_DIR, 'data');
export const DB_PATH = path.join(DATA_DIR, 'nexus.db');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
export const MAX_UPLOAD_BYTES = 32 * 1024 * 1024;

/** 导出数据所在目录（包含 chat_session_index.json 与 chat_sessions/） */
export const EXPORT_DIR = process.env.NEXUS_EXPORT_DIR
  ? path.resolve(process.env.NEXUS_EXPORT_DIR)
  : ROOT_DIR;
export const EXPORT_SESSION_DIR = path.join(EXPORT_DIR, 'chat_sessions');
export const EXPORT_INDEX_PATH = path.join(EXPORT_DIR, 'chat_session_index.json');

export const PORT = Number(process.env.PORT || 8787);
export const HOST = process.env.HOST || '127.0.0.1';

export const DEEPSEEK_API_BASE = (process.env.DEEPSEEK_API_BASE || 'https://api.deepseek.com').replace(/\/+$/, '');
export const DEFAULT_MODEL = process.env.NEXUS_DEFAULT_MODEL || 'deepseek-chat';
export const ALLOW_REGISTER = process.env.NEXUS_ALLOW_REGISTER !== '0';
export const MOCK_LLM = process.env.NEXUS_MOCK_LLM === '1';
export const JWT_TTL = '30d';

/** 运行期内存中的 API Key（不落盘、不写入任何配置文件） */
let runtimeApiKey = '';

export function getApiKey(): string {
  return (process.env.DEEPSEEK_API_KEY || runtimeApiKey || '').trim();
}

export function setRuntimeApiKey(key: string): void {
  runtimeApiKey = key.trim();
}

export function clearRuntimeApiKey(): void {
  runtimeApiKey = '';
}

export function apiKeySource(): 'env' | 'runtime' | 'none' {
  if ((process.env.DEEPSEEK_API_KEY || '').trim()) return 'env';
  if (runtimeApiKey) return 'runtime';
  return 'none';
}

/** 打码展示，永远不输出完整 Key */
export function maskApiKey(key: string): string {
  if (!key) return '';
  if (key.length <= 10) return key[0] + '****';
  return `${key.slice(0, 3)}****${key.slice(-4)}`;
}

export const MODELS = [
  {
    id: 'deepseek-chat',
    label: 'DeepSeek 通用对话',
    shortLabel: 'deepseek-chat',
    description: '响应快速，适合日常问答、写作与代码',
    supportsThinking: false
  },
  {
    id: 'deepseek-reasoner',
    label: 'DeepSeek 深度思考',
    shortLabel: 'deepseek-reasoner',
    description: '先思考再回答，适合复杂推理与数学',
    supportsThinking: true
  }
] as const;

export const OWNER_USERNAME = process.env.NEXUS_OWNER_USERNAME || 'owner';
export const OWNER_PASSWORD = process.env.NEXUS_OWNER_PASSWORD || 'owner123';
export const OWNER_DISPLAY_NAME = process.env.NEXUS_OWNER_NAME || 'Nexus 主人';
