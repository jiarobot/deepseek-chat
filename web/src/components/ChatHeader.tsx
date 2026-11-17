import { useEffect, useRef, useState } from 'react';
import {
  BarChart3,
  Brain,
  Check,
  Download,
  FileJson,
  FileText,
  Globe2,
  Menu,
  Settings,
  X
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { api } from '../lib/api';
import { formatDateTime, formatNumber } from '../lib/utils';
import { navigate } from '../lib/router';

export function ChatHeader() {
  const session = useAppStore((s) => s.session);
  const renameSession = useAppStore((s) => s.renameSession);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);
  const settings = useAppStore((s) => s.settings);
  const toast = useAppStore((s) => s.toast);

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(session?.title || '');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTitle(session?.title || '');
    setEditing(false);
  }, [session?.id, session?.title]);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const commit = () => {
    if (!session) return;
    setEditing(false);
    if (title.trim() && title.trim() !== session.title) void renameSession(session.id, title);
  };

  const exportAs = async (format: 'md' | 'json') => {
    if (!session) return;
    setMenuOpen(false);
    try {
      await api.exportSession(session.id, format);
      toast(`已导出 ${format === 'md' ? 'Markdown' : 'JSON'} 文件`, 'success');
    } catch {
      toast('导出失败，请稍后重试', 'error');
    }
  };

  return (
    <header className="chat-header">
      <button className="icon-btn mobile-only" onClick={() => setSidebarOpen(true)} aria-label="打开侧栏">
        <Menu size={18} />
      </button>

      <div className="chat-title-wrap">
        {editing && session ? (
          <input
            className="chat-title-input"
            value={title}
            autoFocus
            onChange={(event) => setTitle(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commit();
              if (event.key === 'Escape') {
                setTitle(session.title);
                setEditing(false);
              }
            }}
          />
        ) : (
          <div
            className="chat-title"
            onClick={() => session && setEditing(true)}
            title={session ? '点击重命名' : ''}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{session?.title || '新的对话'}</span>
          </div>
        )}
        <div className="chat-sub">
          {session ? (
            <>
              <span className={`badge ${session.source === 'import' ? 'purple' : 'accent'}`}>
                {session.source === 'import' ? '历史导入' : '本地会话'}
              </span>
              <span>{session.messageCount} 条消息</span>
              <span>·</span>
              <span>{formatNumber(session.tokenTotal)} tokens</span>
              <span>·</span>
              <span>{formatDateTime(session.updatedAt)}</span>
            </>
          ) : (
            <span>NEXUS · READY</span>
          )}
        </div>
      </div>

      <div className="chat-actions">
        <span className="mode-chip" style={{ marginRight: 4 }}>
          {settings.thinking ? <Brain size={13} /> : <Check size={13} />}
          {settings.thinking ? '深度思考' : '通用对话'}
          {settings.search ? <Globe2 size={13} style={{ marginLeft: 6 }} /> : null}
        </span>

        {session ? (
          <div className="dropdown" ref={menuRef}>
            <button className="icon-btn" onClick={() => setMenuOpen((v) => !v)} title="导出会话">
              <Download size={17} />
            </button>
            {menuOpen ? (
              <div className="dropdown-menu">
                <button className="dropdown-item" onClick={() => void exportAs('md')}>
                  <FileText size={14} /> 导出 Markdown
                </button>
                <button className="dropdown-item" onClick={() => void exportAs('json')}>
                  <FileJson size={14} /> 导出 JSON
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        <button
          className="icon-btn"
          onClick={() => navigate('/stats')}
          title="数据中心"
        >
          <BarChart3 size={17} />
        </button>
        <button className="icon-btn" onClick={() => setSettingsOpen(true)} title="设置">
          <Settings size={17} />
        </button>
      </div>
    </header>
  );
}
