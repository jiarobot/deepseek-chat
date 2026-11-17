import { useEffect, useRef, useState } from 'react';
import { ArrowDown, Copy, Pencil, RotateCcw, Loader2 } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import type { ChatMessage } from '../lib/types';
import { formatClock, formatNumber } from '../lib/utils';
import { Markdown } from './Markdown';
import { FileList, RiskNote, SearchBlock, ThinkBlock, ToolTrace } from './Fragments';
import { LogoMark } from './Common';

function copyText(text: string): void {
  void navigator.clipboard
    .writeText(text)
    .then(() => useAppStore.getState().toast('已复制到剪贴板', 'success'))
    .catch(() => useAppStore.getState().toast('复制失败，请手动选择文本', 'error'));
}

function statusLabel(status: string): { text: string; tone: string } | null {
  if (status === 'TIMEOUT') return { text: '超时', tone: 'warn' };
  if (status === 'INCOMPLETE') return { text: '未完成', tone: 'warn' };
  if (status === 'CONTENT_FILTER') return { text: '内容受限制', tone: 'danger' };
  return null;
}

function messagePlainText(message: ChatMessage): string {
  return message.fragments
    .filter((f) => ['REQUEST', 'RESPONSE', 'TEMPLATE_RESPONSE'].includes(f.type))
    .map((f) => String(f.content || ''))
    .join('\n\n');
}

function UserMessage({ message, onEdit }: { message: ChatMessage; onEdit: () => void }) {
  const request = message.fragments.find((f) => f.type === 'REQUEST');
  const files = message.fragments.find((f) => f.type === 'FILE');
  return (
    <div className="message user">
      <div className="msg-avatar">YOU</div>
      <div className="msg-main">
        <div className="msg-head">
          <span className="msg-name">我</span>
          <span className="msg-time">{formatClock(message.inserted_at)}</span>
        </div>
        {files && Array.isArray(files.files) ? <FileList files={files.files} /> : null}
        <div className="user-bubble">{String(request?.content || '')}</div>
        <div className="msg-actions">
          <button className="msg-action" onClick={() => copyText(messagePlainText(message))}>
            <Copy size={12} /> 复制
          </button>
          <button className="msg-action" onClick={onEdit}>
            <Pencil size={12} /> 编辑
          </button>
        </div>
      </div>
    </div>
  );
}

function AssistantMessage({ message, canRegenerate }: { message: ChatMessage; canRegenerate: boolean }) {
  const regenerate = useAppStore((s) => s.regenerate);
  const streaming = useAppStore((s) => s.streaming);
  const badge = statusLabel(message.status);
  return (
    <div className="message assistant">
      <div className="msg-avatar ai">
        <LogoMark size={24} />
      </div>
      <div className="msg-main">
        <div className="msg-head">
          <span className="msg-name">DeepSeek</span>
          <span className="msg-time">{formatClock(message.inserted_at)}</span>
          {message.thinking_enabled ? <span className="msg-badge">深度思考</span> : null}
          {message.search_enabled ? <span className="msg-badge">联网</span> : null}
          {badge ? <span className={`msg-badge ${badge.tone}`}>{badge.text}</span> : null}
          {message.accumulated_token_usage ? (
            <span className="msg-time">{formatNumber(message.accumulated_token_usage)} tokens</span>
          ) : null}
        </div>
        <div className="assistant-body">
          {message.fragments.map((fragment, index) => {
            if (fragment.type === 'THINK') {
              return <ThinkBlock key={`think-${index}`} fragment={fragment} />;
            }
            if (fragment.type === 'TOOL_SEARCH') {
              return <SearchBlock key={`search-${index}`} fragment={fragment} />;
            }
            if (fragment.type === 'FILE' && Array.isArray(fragment.files)) {
              return <FileList key={`file-${index}`} files={fragment.files} />;
            }
            if (fragment.type === 'RESPONSE') {
              return <Markdown key={`response-${index}`} content={String(fragment.content || '')} />;
            }
            if (fragment.type === 'CONTENT_RISK') {
              return <RiskNote key={`risk-${index}`} text={String(fragment.content || '')} />;
            }
            return <ToolTrace key={`tool-${index}`} fragment={fragment} />;
          })}
          {!message.fragments.some((f) => f.type === 'RESPONSE' || f.type === 'TEMPLATE_RESPONSE') && message.status !== 'FINISHED' ? (
            <div className="status-tag">该回答未生成完整内容</div>
          ) : null}
        </div>
        <div className="msg-actions">
          <button className="msg-action" onClick={() => copyText(messagePlainText(message))}>
            <Copy size={12} /> 复制
          </button>
          {canRegenerate ? (
            <button className="msg-action" onClick={() => void regenerate()} disabled={streaming}>
              <RotateCcw size={12} /> 重新生成
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function StreamingMessage() {
  const reasoning = useAppStore((s) => s.streamReasoning);
  const content = useAppStore((s) => s.streamContent);
  const search = useAppStore((s) => s.streamSearch);
  const status = useAppStore((s) => s.streamStatus);

  return (
    <div className="message assistant">
      <div className="msg-avatar ai">
        <LogoMark size={24} />
      </div>
      <div className="msg-main">
        <div className="msg-head">
          <span className="msg-name">DeepSeek</span>
          <span className="msg-time">正在生成</span>
        </div>
        <div className="assistant-body">
          {search ? <SearchBlock fragment={search} /> : null}
          {reasoning ? (
            <ThinkBlock fragment={{ type: 'THINK', content: reasoning }} streaming={!content} />
          ) : null}
          {status && !content ? (
            <div className="stream-status">
              <span className="bar" />
              {status}
            </div>
          ) : null}
          {content ? (
            <>
              <Markdown content={content} />
              <span className="streaming-caret" />
            </>
          ) : !reasoning && !status ? (
            <div className="stream-status">
              <span className="bar" />
              正在连接…
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function MessageList() {
  const messages = useAppStore((s) => s.messages);
  const streaming = useAppStore((s) => s.streaming);
  const streamContent = useAppStore((s) => s.streamContent);
  const streamReasoning = useAppStore((s) => s.streamReasoning);
  const loadingMessages = useAppStore((s) => s.loadingMessages);
  const hasMore = useAppStore((s) => s.hasMoreMessages);
  const loadEarlier = useAppStore((s) => s.loadEarlier);
  const editAndResend = useAppStore((s) => s.editAndResend);
  const activeSessionId = useAppStore((s) => s.activeSessionId);

  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const [editingId, setEditingId] = useState<string | number | null>(null);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    stick.current = true;
    setShowJump(false);
    setEditingId(null);
    requestAnimationFrame(() => {
      const el = scroller.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, [activeSessionId]);

  useEffect(() => {
    if (!stick.current) return;
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, streamContent, streamReasoning, streaming]);

  const handleScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const near = distance < 100;
    stick.current = near;
    setShowJump(!near);
  };

  const jumpToBottom = () => {
    stick.current = true;
    setShowJump(false);
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  };

  const startEdit = (message: ChatMessage) => {
    const request = message.fragments.find((f) => f.type === 'REQUEST');
    setDraft(String(request?.content || ''));
    setEditingId(message.id);
  };

  const submitEdit = async (messageId: string | number) => {
    const text = draft.trim();
    if (!text) return;
    setEditingId(null);
    await editAndResend(messageId, text);
  };

  const lastAssistantId = (() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === 'ASSISTANT') return messages[i].id;
    }
    return null;
  })();

  return (
    <div className="messages" ref={scroller} onScroll={handleScroll}>
      <div className="messages-inner">
        {hasMore ? (
          <button className="load-earlier" onClick={() => void loadEarlier()} disabled={loadingMessages}>
            {loadingMessages ? <Loader2 size={12} className="spin-icon" /> : null}
            加载更早的消息
          </button>
        ) : null}

        {messages.map((message) => {
          if (message.role === 'USER' && editingId !== null && String(editingId) === String(message.id)) {
            return (
              <div className="message user" key={String(message.id)}>
                <div className="msg-avatar">YOU</div>
                <div className="msg-main" style={{ width: '100%' }}>
                  <div className="msg-head">
                    <span className="msg-name">编辑消息</span>
                  </div>
                  <div className="composer" style={{ padding: 12 }}>
                    <textarea
                      className="composer-input"
                      style={{ width: '100%' }}
                      value={draft}
                      autoFocus
                      rows={4}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                          void submitEdit(message.id);
                        }
                        if (event.key === 'Escape') setEditingId(null);
                      }}
                    />
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                      <button className="btn btn-ghost" onClick={() => setEditingId(null)}>
                        取消
                      </button>
                      <button className="btn btn-primary" onClick={() => void submitEdit(message.id)}>
                        保存并重新生成
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          }
          if (message.role === 'USER') {
            return <UserMessage key={String(message.id)} message={message} onEdit={() => startEdit(message)} />;
          }
          return (
            <AssistantMessage
              key={String(message.id)}
              message={message}
              canRegenerate={String(message.id) === String(lastAssistantId) && !streaming}
            />
          );
        })}

        {streaming ? <StreamingMessage /> : null}
        {loadingMessages && !messages.length ? (
          <div className="session-loading" style={{ padding: 40 }}>
            <div className="spinner" /> 正在载入会话…
          </div>
        ) : null}
      </div>
      {showJump ? (
        <button className="scroll-bottom" onClick={jumpToBottom} aria-label="回到底部">
          <ArrowDown size={16} />
        </button>
      ) : null}
    </div>
  );
}
