import { DEEPSEEK_API_BASE, getApiKey, MOCK_LLM } from '../config';

export interface ApiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface TokenUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  prompt_cache_hit_tokens?: number;
  prompt_cache_miss_tokens?: number;
}

export interface StreamResult {
  content: string;
  reasoning: string;
  usage: TokenUsage | null;
  finishReason: string;
  model: string;
}

export class LlmError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 500) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const ERROR_MAP: Record<number, string> = {
  400: '请求参数有误，模型拒绝了本次请求',
  401: 'API Key 无效或已过期，请在「设置 → 模型」中更新',
  402: '账户余额不足，请前往 DeepSeek 开放平台充值',
  422: '请求参数错误（模型或消息格式不受支持）',
  429: '请求过于频繁，已被服务端限流，请稍后重试',
  500: 'DeepSeek 服务器内部错误，请稍后重试',
  502: 'DeepSeek 网关异常，请稍后重试',
  503: 'DeepSeek 服务繁忙，请稍后重试',
  504: 'DeepSeek 请求超时，请稍后重试'
};

function friendlyError(status: number, fallback: string): string {
  return ERROR_MAP[status] || fallback || `DeepSeek 接口调用失败（HTTP ${status}）`;
}

export interface StreamOptions {
  messages: ApiMessage[];
  model: string;
  temperature?: number;
  maxTokens?: number;
  signal: AbortSignal;
  onReasoning?: (delta: string) => void;
  onContent?: (delta: string) => void;
  onUsage?: (usage: TokenUsage) => void;
}

export async function streamDeepSeek(opts: StreamOptions): Promise<StreamResult> {
  const apiKey = getApiKey();
  if (!apiKey) {
    if (MOCK_LLM) return mockStream(opts);
    throw new LlmError(
      'NO_API_KEY',
      '尚未配置 DeepSeek API Key。请设置环境变量 DEEPSEEK_API_KEY 后重启，或在右上角「设置 → 模型」中填入本次运行临时密钥。',
      400
    );
  }

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  opts.signal.addEventListener('abort', onAbort, { once: true });

  let response: Response;
  try {
    response = await fetch(`${DEEPSEEK_API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream'
      },
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages,
        stream: true,
        stream_options: { include_usage: true },
        ...(opts.model === 'deepseek-reasoner' ? {} : { temperature: opts.temperature ?? 0.7 }),
        ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {})
      }),
      signal: controller.signal
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw new LlmError('ABORTED', '已停止生成', 499);
    throw new LlmError('NETWORK', `无法连接 DeepSeek 接口：${(err as Error).message}`, 502);
  } finally {
    opts.signal.removeEventListener('abort', onAbort);
  }

  if (!response.ok || !response.body) {
    let detail = '';
    try {
      const text = await response.text();
      const parsed = JSON.parse(text) as { error?: { message?: string } };
      detail = parsed.error?.message || text.slice(0, 300);
    } catch {
      /* ignore */
    }
    const status = response.status;
    const code = status === 401 ? 'INVALID_KEY' : status === 402 ? 'NO_BALANCE' : status === 429 ? 'RATE_LIMIT' : 'UPSTREAM';
    throw new LlmError(code, friendlyError(status, detail), status);
  }

  const result: StreamResult = {
    content: '',
    reasoning: '',
    usage: null,
    finishReason: 'stop',
    model: opts.model
  };

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    let chunk: { done: boolean; value?: Uint8Array };
    try {
      chunk = await reader.read();
    } catch (err) {
      if ((err as Error).name === 'AbortError') break;
      throw new LlmError('STREAM', `响应流异常中断：${(err as Error).message}`, 502);
    }
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true }).replace(/\r\n/g, '\n');

    let sepIndex = buffer.indexOf('\n\n');
    while (sepIndex !== -1) {
      const block = buffer.slice(0, sepIndex);
      buffer = buffer.slice(sepIndex + 2);
      sepIndex = buffer.indexOf('\n\n');
      for (const line of block.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        try {
          const json = JSON.parse(data) as {
            model?: string;
            choices?: Array<{
              delta?: { content?: string | null; reasoning_content?: string | null };
              finish_reason?: string | null;
            }>;
            usage?: TokenUsage | null;
          };
          if (json.model) result.model = json.model;
          const choice = json.choices?.[0];
          const reasoning = choice?.delta?.reasoning_content;
          if (reasoning) {
            result.reasoning += reasoning;
            opts.onReasoning?.(reasoning);
          }
          const content = choice?.delta?.content;
          if (content) {
            result.content += content;
            opts.onContent?.(content);
          }
          if (choice?.finish_reason) result.finishReason = choice.finish_reason;
          if (json.usage) {
            result.usage = json.usage;
            opts.onUsage?.(json.usage);
          }
        } catch {
          /* 忽略无法解析的心跳行 */
        }
      }
    }
  }

  return result;
}

async function mockStream(opts: StreamOptions): Promise<StreamResult> {
  const question = [...opts.messages].reverse().find((m) => m.role === 'user')?.content || '';
  const reasoning =
    '当前处于演示模式（NEXUS_MOCK_LLM=1）。我会先复述你的问题，然后给出一个结构化的示例回答。';
  const content = [
    `已收到你的提问：**${question.slice(0, 60) || '（空）'}**`,
    '',
    '### 演示模式说明',
    '',
    '- 本回答由本地模拟器生成，未调用真实模型接口；',
    '- 在环境变量中配置 `DEEPSEEK_API_KEY` 后重新启动，即可获得真实的流式回答；',
    '- 你也可以在「设置 → 模型」中临时填入密钥（仅保存在服务进程内存中）。',
    '',
    '```python',
    'print("DeepSeek Nexus is ready.")',
    '```'
  ].join('\n');

  const result: StreamResult = { content: '', reasoning: '', usage: null, finishReason: 'stop', model: 'mock' };
  for (const ch of reasoning) {
    if (opts.signal.aborted) break;
    result.reasoning += ch;
    opts.onReasoning?.(ch);
    await new Promise((r) => setTimeout(r, 4));
  }
  for (const ch of content) {
    if (opts.signal.aborted) break;
    result.content += ch;
    opts.onContent?.(ch);
    await new Promise((r) => setTimeout(r, 3));
  }
  result.usage = { prompt_tokens: 80, completion_tokens: result.content.length, total_tokens: 80 + result.content.length };
  opts.onUsage?.(result.usage);
  return result;
}
