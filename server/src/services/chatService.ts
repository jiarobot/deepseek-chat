import type { Response } from 'express';
import { getSessionSummary, nextMessageId, savePayload } from '../sessionStore';
import { parseSettings, getUserById } from '../db';
import { buildApiMessages, buildSystemPrompt } from './prompts';
import { LlmError, streamDeepSeek, type TokenUsage } from './deepseek';
import { searchWeb, buildSearchQuery } from './search';
import type { ChatMessage, Fragment, SearchResult, SessionPayload } from '../types';

export interface StreamAssistantOptions {
  res: Response;
  signal: AbortSignal;
  userId: string;
  payload: SessionPayload;
  thinking: boolean;
  search: boolean;
  temperature: number;
  searchQuery: string;
}

export function startSse(res: Response): void {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof (res as unknown as { flushHeaders?: () => void }).flushHeaders === 'function') {
    (res as unknown as { flushHeaders: () => void }).flushHeaders();
  }
}

export function sseSend(res: Response, payload: Record<string, unknown>): void {
  if (res.writableEnded) return;
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function estimateTokens(assistant: ChatMessage): number {
  let chars = 0;
  for (const fragment of assistant.fragments) {
    chars += String(fragment.content || '').length;
  }
  return Math.max(1, Math.round(chars / 1.6));
}

/** 流式生成助手回复，并通过 SSE 把增量推送给前端 */
export async function streamAssistant(opts: StreamAssistantOptions): Promise<void> {
  const { res, payload, signal } = opts;
  const owner = getUserById(opts.userId);
  const settings = parseSettings(owner?.settings || '{}');

  const heartbeat = setInterval(() => {
    sseSend(res, { type: 'ping', t: Date.now() });
  }, 15000);

  let reasoning = '';
  let content = '';
  let searchResults: SearchResult[] = [];
  const effectiveQuery = opts.search ? buildSearchQuery(opts.searchQuery) : '';
  let usage: TokenUsage | null = null;
  let modelUsed = opts.thinking ? 'deepseek-reasoner' : 'deepseek-chat';
  let finishReason = 'stop';
  let firstReasonAt = 0;
  let firstContentAt = 0;
  let persisted = false;
  const startedAt = Date.now();

  const persist = (status: string): ChatMessage | null => {
    if (persisted) return null;
    if (!content && !reasoning && !searchResults.length) return null;
    persisted = true;
    const fragments: Fragment[] = [];
    if (searchResults.length || opts.search) {
      fragments.push({
        type: 'TOOL_SEARCH',
        status: 'FINISHED',
        queries: effectiveQuery ? [effectiveQuery] : [],
        results: searchResults
      });
    }
    if (reasoning) {
      fragments.push({
        type: 'THINK',
        content: reasoning,
        elapsed_secs: firstReasonAt && firstContentAt ? Math.max(0.1, (firstContentAt - firstReasonAt) / 1000) : undefined
      });
    }
    if (content) {
      fragments.push({ type: 'RESPONSE', content });
    }
    if (content) {
      fragments.push({ type: 'CONTENT_RISK', content: '本回答由 AI 生成，请自行核实关键信息。' });
    }
    const message: ChatMessage = {
      id: nextMessageId(payload.messages),
      parent_id: payload.current_message_id,
      role: 'ASSISTANT',
      status,
      thinking_enabled: opts.thinking,
      search_enabled: opts.search,
      accumulated_token_usage: usage?.completion_tokens ?? Math.max(1, Math.round((content.length + reasoning.length) / 1.6)),
      inserted_at: new Date().toISOString(),
      fragments
    };
    payload.messages.push(message);
    payload.current_message_id = message.id;
    payload.updated_at = new Date().toISOString();
    savePayload(payload.id, payload);
    return message;
  };

  try {
    if (opts.search) {
      sseSend(res, { type: 'status', status: 'searching', message: '正在联网检索实时资料…' });
      searchResults = await searchWeb(effectiveQuery, signal);
      if (signal.aborted) return;
      sseSend(res, {
        type: 'search',
        fragment: {
          type: 'TOOL_SEARCH',
          status: 'FINISHED',
          queries: effectiveQuery ? [effectiveQuery] : [],
          results: searchResults
        }
      });
      sseSend(res, {
        type: 'status',
        status: 'generating',
        message: searchResults.length
          ? `已获取 ${searchResults.length} 条资料，正在生成回答…`
          : '未获取到实时资料，正在基于模型知识生成…'
      });
    }

    const systemPrompt = buildSystemPrompt(settings.systemPrompt, searchResults);
    const apiMessages = buildApiMessages(payload, systemPrompt);

    const result = await streamDeepSeek({
      messages: apiMessages,
      model: opts.thinking ? 'deepseek-reasoner' : 'deepseek-chat',
      temperature: opts.temperature,
      maxTokens: 8192,
      signal,
      onReasoning: (delta) => {
        if (!firstReasonAt) firstReasonAt = Date.now();
        sseSend(res, { type: 'reasoning', delta });
      },
      onContent: (delta) => {
        if (!firstContentAt) firstContentAt = Date.now();
        sseSend(res, { type: 'content', delta });
      },
      onUsage: (value) => {
        usage = value;
        sseSend(res, { type: 'usage', usage: value });
      }
    });

    reasoning = result.reasoning;
    content = result.content;
    modelUsed = result.model;
    finishReason = result.finishReason;

    if (signal.aborted) {
      persist('INCOMPLETE');
      return;
    }

    const status = result.finishReason === 'length' ? 'INCOMPLETE' : 'FINISHED';
    const assistant = persist(status);
    if (assistant) {
      sseSend(res, {
        type: 'done',
        message: assistant,
        session: getSessionSummary(opts.userId, payload.id),
        usage,
        model: modelUsed,
        durationMs: Date.now() - startedAt
      });
    }
  } catch (err) {
    const error = err as LlmError;
    if (signal.aborted) {
      persist('INCOMPLETE');
      return;
    }
    if (content || reasoning) persist('INCOMPLETE');
    sseSend(res, {
      type: 'error',
      code: error.code || 'ERROR',
      message: error.message || '生成失败，请稍后重试',
      detail: finishReason
    });
    console.warn('[chat] 生成失败:', error.code, error.message);
  } finally {
    clearInterval(heartbeat);
    if (!res.writableEnded) res.end();
  }
}
