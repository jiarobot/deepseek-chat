import type { ChatMessage, SearchResult, SessionPayload } from '../types';
import type { ApiMessage } from './deepseek';

const BASE_SYSTEM_PROMPT = [
  '你是 DeepSeek Nexus 中的 AI 助手，由 DeepSeek 模型驱动。',
  '请使用简体中文回答（除非用户使用其他语言）。',
  '回答需要准确、结构清晰；涉及代码时使用带语言标注的 Markdown 代码块；涉及公式时使用 LaTeX。',
  '不确定的信息请明确说明，不要编造引用。'
].join('\n');

export const MAX_CONTEXT_CHARS = 120000;

export function buildSystemPrompt(userPrompt: string | undefined, results: SearchResult[]): string {
  const parts = [BASE_SYSTEM_PROMPT];
  if (userPrompt && userPrompt.trim()) {
    parts.push(`## 用户自定义指令\n${userPrompt.trim().slice(0, 4000)}`);
  }
  if (results.length) {
    const lines = results.map(
      (r, i) =>
        `[${i + 1}] ${r.title}\nURL: ${r.url}\n站点: ${r.siteName || ''}\n摘要: ${r.snippet || '（无摘要）'}`
    );
    parts.push(
      [
        '## 联网检索结果（实时抓取，可能存在噪声）',
        ...lines,
        '',
        '回答时请优先依据以上资料，并在使用处用 [编号] 标注来源；若资料不足，请说明。'
      ].join('\n')
    );
  } else {
    parts.push(
      '## 联网检索\n本轮未获得可用的实时检索结果。如问题依赖最新信息，请说明你无法核实实时数据。'
    );
  }
  return parts.join('\n\n');
}

export function formatFileBlock(files: unknown): string {
  if (!Array.isArray(files) || !files.length) return '';
  const lines: string[] = ['【用户上传的文件】'];
  for (const raw of files) {
    const file = raw as Record<string, unknown>;
    const name = String(file.file_name || file.name || '未命名文件');
    const size = Number(file.file_size || file.size || 0);
    const isImage = Boolean(file.is_image);
    lines.push(`- ${name}（${isImage ? '图片' : '文档'}，${Math.round(size / 1024)} KB）`);
    const text = typeof file.extracted_text === 'string' ? file.extracted_text : '';
    if (text.trim()) {
      lines.push('```text', text.slice(0, 20000), '```');
    } else if (isImage) {
      lines.push('  （当前模型无法直接解析图片内容，请向用户说明这一点）');
    }
  }
  return lines.join('\n');
}

function messageText(message: ChatMessage): string {
  const isUser = message.role === 'USER';
  const allowed = isUser ? ['REQUEST'] : ['RESPONSE', 'TEMPLATE_RESPONSE'];
  const chunks: string[] = [];
  for (const fragment of message.fragments || []) {
    if (!allowed.includes(fragment.type)) continue;
    const text = String(fragment.content || '').trim();
    if (text) chunks.push(text);
  }
  if (isUser) {
    for (const fragment of message.fragments || []) {
      if (fragment.type !== 'FILE') continue;
      const block = formatFileBlock(fragment.files);
      if (block) chunks.push(block);
    }
  }
  return chunks.join('\n\n').trim();
}

/** 依据会话历史构造发往模型的上下文（按字符预算截断，保证角色交替） */
export function buildApiMessages(payload: SessionPayload, systemPrompt: string): ApiMessage[] {
  const raw: ApiMessage[] = [];
  for (const message of payload.messages || []) {
    const text = messageText(message);
    if (!text) continue;
    if (message.status === 'TIMEOUT' || message.status === 'CONTENT_FILTER') continue;
    raw.push({ role: message.role === 'USER' ? 'user' : 'assistant', content: text });
  }

  const picked: ApiMessage[] = [];
  let chars = 0;
  for (let i = raw.length - 1; i >= 0; i -= 1) {
    const item = raw[i];
    if (picked.length && chars + item.content.length > MAX_CONTEXT_CHARS) break;
    picked.unshift(item);
    chars += item.content.length;
  }

  while (picked.length && picked[0].role !== 'user') picked.shift();

  const merged: ApiMessage[] = [];
  for (const item of picked) {
    const last = merged[merged.length - 1];
    if (last && last.role === item.role) {
      last.content = `${last.content}\n\n${item.content}`;
    } else {
      merged.push({ ...item });
    }
  }

  return [{ role: 'system', content: systemPrompt }, ...merged];
}

export function lastUserText(payload: SessionPayload): string {
  for (let i = payload.messages.length - 1; i >= 0; i -= 1) {
    const message = payload.messages[i];
    if (message.role !== 'USER') continue;
    const text = messageText(message);
    if (text) return text;
  }
  return '';
}
