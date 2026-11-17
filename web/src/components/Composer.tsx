import { useEffect, useRef, useState } from 'react';
import { Brain, Globe2, Loader2, Paperclip, Send, ShieldAlert, Square, X } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { api } from '../lib/api';
import { estimateTokens, formatBytes, formatNumber } from '../lib/utils';
import type { AttachmentDto } from '../lib/types';

export function Composer() {
  const send = useAppStore((s) => s.send);
  const stop = useAppStore((s) => s.stop);
  const streaming = useAppStore((s) => s.streaming);
  const settings = useAppStore((s) => s.settings);
  const saveSettings = useAppStore((s) => s.saveSettings);
  const system = useAppStore((s) => s.system);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);
  const toast = useAppStore((s) => s.toast);

  const [value, setValue] = useState('');
  const [attachments, setAttachments] = useState<AttachmentDto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [value]);

  useEffect(() => {
    if (!streaming) textareaRef.current?.focus();
  }, [streaming]);

  const doSend = () => {
    const text = value.trim();
    if (streaming || uploading) return;
    if (!text && !attachments.length) return;
    const ids = attachments.map((item) => item.id);
    setValue('');
    setAttachments([]);
    void send(text, ids);
  };

  const uploadFiles = async (files: FileList | File[]) => {
    const list = Array.from(files).slice(0, 8 - attachments.length);
    if (!list.length) return;
    setUploading(true);
    for (const file of list) {
      try {
        const dto = await api.uploadFile(file);
        setAttachments((prev) => [...prev, dto]);
      } catch (err) {
        toast((err as Error).message || '文件上传失败', 'error');
      }
    }
    setUploading(false);
  };

  const toggleThinking = () => {
    const next = !settings.thinking;
    void saveSettings({ thinking: next, model: next ? 'deepseek-reasoner' : 'deepseek-chat' });
  };

  const toggleSearch = () => {
    void saveSettings({ search: !settings.search });
  };

  const keyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      doSend();
    }
  };

  const apiReady = system?.apiKey.configured !== false;

  return (
    <div className="composer-wrap">
      <div className="composer-inner">
        <div
          className={`composer ${dragOver ? 'drag-over' : ''}`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(false);
            if (event.dataTransfer.files?.length) void uploadFiles(event.dataTransfer.files);
          }}
        >
          {attachments.length > 0 && (
            <div className="composer-attachments">
              {attachments.map((item) => (
                <div className="attach-item" key={item.id}>
                  {item.isImage ? <img src={api.fileUrl(item.id)} alt={item.name} /> : <Paperclip size={14} />}
                  <span className="name">{item.name}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>{formatBytes(item.size)}</span>
                  <button
                    className="attach-remove"
                    onClick={() => setAttachments((prev) => prev.filter((a) => a.id !== item.id))}
                    aria-label="移除附件"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="composer-input-row">
            <textarea
              ref={textareaRef}
              className="composer-input"
              rows={1}
              value={value}
              placeholder="输入你的问题，Enter 发送，Shift + Enter 换行…"
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={keyDown}
            />
            <button
              className="icon-btn"
              onClick={() => fileInputRef.current?.click()}
              title="上传文件（支持文本类文件内容解析）"
              disabled={uploading}
            >
              {uploading ? <Loader2 size={17} className="spin-icon" /> : <Paperclip size={17} />}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              onChange={(event) => {
                if (event.target.files) void uploadFiles(event.target.files);
                event.target.value = '';
              }}
            />
            {streaming ? (
              <button className="stop-btn" onClick={stop}>
                <Square size={12} fill="currentColor" /> 停止
              </button>
            ) : (
              <button className="send-btn" onClick={doSend} disabled={!value.trim() && !attachments.length} aria-label="发送">
                <Send size={16} />
              </button>
            )}
          </div>

          <div className="composer-toolbar">
            <div className="toolbar-left">
              <button className={`toggle-chip purple ${settings.thinking ? 'active' : ''}`} onClick={toggleThinking}>
                <Brain size={13} /> 深度思考
              </button>
              <button className={`toggle-chip ${settings.search ? 'active' : ''}`} onClick={toggleSearch}>
                <Globe2 size={13} /> 联网搜索
              </button>
              {!apiReady ? (
                <button
                  className="toggle-chip"
                  style={{ color: 'var(--warn)', borderColor: 'rgba(255,182,92,.35)' }}
                  onClick={() => setSettingsOpen(true)}
                >
                  <ShieldAlert size={13} /> 未配置 API Key
                </button>
              ) : null}
            </div>
            <div className="toolbar-right">
              <span className="token-hint">≈ {formatNumber(estimateTokens(value))} tokens</span>
            </div>
          </div>
        </div>
        <div className="composer-foot">
          <span>
            <span className="kbd">Enter</span> 发送
          </span>
          <span>
            <span className="kbd">Shift</span> + <span className="kbd">Enter</span> 换行
          </span>
          <span>· 内容由 AI 生成，请自行核实</span>
        </div>
      </div>
    </div>
  );
}
