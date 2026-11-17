import { useEffect, useRef, useState } from 'react';
import {
  BarChart3,
  Database,
  LogOut,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Settings,
  Trash2,
  X
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { Avatar, LogoMark } from './Common';
import { formatNumber, groupLabel, timeAgo } from '../lib/utils';
import { navigate } from '../lib/router';
import type { SessionSummary } from '../lib/types';

export function Sidebar() {
  const sessions = useAppStore((s) => s.sessions);
  const sessionTotal = useAppStore((s) => s.sessionTotal);
  const sessionsHasMore = useAppStore((s) => s.sessionsHasMore);
  const sessionsLoading = useAppStore((s) => s.sessionsLoading);
  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const loadSessions = useAppStore((s) => s.loadSessions);
  const loadSession = useAppStore((s) => s.loadSession);
  const startNewChat = useAppStore((s) => s.startNewChat);
  const renameSession = useAppStore((s) => s.renameSession);
  const togglePin = useAppStore((s) => s.togglePin);
  const deleteSession = useAppStore((s) => s.deleteSession);
  const confirm = useAppStore((s) => s.confirm);
  const user = useAppStore((s) => s.user);
  const system = useAppStore((s) => s.system);
  const logout = useAppStore((s) => s.logout);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);
  const sessionQuery = useAppStore((s) => s.sessionQuery);
  const setSessionQuery = useAppStore((s) => s.setSessionQuery);

  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const firstSearch = useRef(true);

  useEffect(() => {
    if (firstSearch.current) {
      firstSearch.current = false;
      return;
    }
    const timer = setTimeout(() => {
      void loadSessions({ q: sessionQuery });
    }, 280);
    return () => clearTimeout(timer);
  }, [sessionQuery, loadSessions]);

  const pinned = sessions.filter((item) => item.pinned);
  const normal = sessions.filter((item) => !item.pinned);
  const groups: Array<{ label: string; items: SessionSummary[] }> = [];
  for (const item of normal) {
    const label = groupLabel(item.updatedAt);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }

  const openSession = (id: string) => {
    void loadSession(id);
    if (window.innerWidth < 900) setSidebarOpen(false);
  };

  const startRename = (item: SessionSummary) => {
    setRenameId(item.id);
    setRenameValue(item.title);
  };

  const commitRename = () => {
    if (renameId && renameValue.trim()) void renameSession(renameId, renameValue);
    setRenameId(null);
  };

  const askDelete = async (item: SessionSummary) => {
    const ok = await confirm('删除会话', `确定要删除「${item.title}」吗？该操作不可撤销。`, true, '删除');
    if (ok) void deleteSession(item.id);
  };

  const importState = system?.import;
  const importing = system?.importing && importState?.status !== 'done';
  const percent =
    importState && importState.total > 0
      ? Math.min(100, Math.round((importState.done / importState.total) * 100))
      : 0;

  const renderItem = (item: SessionSummary) => (
    <div
      key={item.id}
      className={`session-item ${item.id === activeSessionId ? 'active' : ''}`}
      onClick={() => openSession(item.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => event.key === 'Enter' && openSession(item.id)}
    >
      <div className="session-main">
        {renameId === item.id ? (
          <input
            className="rename-input"
            value={renameValue}
            autoFocus
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => setRenameValue(event.target.value)}
            onBlur={commitRename}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commitRename();
              if (event.key === 'Escape') setRenameId(null);
            }}
          />
        ) : (
          <>
            <div className="session-title">
              {item.pinned ? <Pin size={11} /> : null}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</span>
            </div>
            <div className="session-meta">
              <span>{timeAgo(item.updatedAt)}</span>
              <span>·</span>
              <span>{formatNumber(item.messageCount)} 条</span>
            </div>
          </>
        )}
      </div>
      <div className="session-actions" onClick={(event) => event.stopPropagation()}>
        <button
          className="icon-btn small"
          title={item.pinned ? '取消置顶' : '置顶'}
          onClick={() => void togglePin(item.id, !item.pinned)}
        >
          {item.pinned ? <PinOff size={12} /> : <Pin size={12} />}
        </button>
        <button className="icon-btn small" title="重命名" onClick={() => startRename(item)}>
          <Pencil size={12} />
        </button>
        <button className="icon-btn small" title="删除" onClick={() => void askDelete(item)}>
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );

  return (
    <>
      {sidebarOpen ? <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} /> : null}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-head">
          <div className="brand">
            <LogoMark size={34} className="brand-mark" />
            <div className="brand-text">
              <div className="brand-name">DEEPSEEK NEXUS</div>
              <div className="brand-sub">local intelligence</div>
            </div>
          </div>
          <button className="icon-btn mobile-only" style={{ marginLeft: 'auto' }} onClick={() => setSidebarOpen(false)}>
            <X size={16} />
          </button>
        </div>

        <div className="sidebar-actions">
          <button className="btn-new" onClick={startNewChat}>
            <Plus size={17} /> 新建对话
            <kbd>⌘ K</kbd>
          </button>
          <div className="search-box">
            <Search size={14} />
            <input
              value={sessionQuery}
              placeholder="搜索历史会话标题…"
              onChange={(event) => setSessionQuery(event.target.value)}
            />
            {sessionQuery ? (
              <button className="search-clear" onClick={() => setSessionQuery('')} aria-label="清空搜索">
                <X size={13} />
              </button>
            ) : null}
          </div>
        </div>

        <div className="session-scroll">
          {pinned.length > 0 ? (
            <div className="session-group">
              <div className="group-label">置顶</div>
              {pinned.map(renderItem)}
            </div>
          ) : null}

          {groups.map((group) => (
            <div className="session-group" key={group.label}>
              <div className="group-label">{group.label}</div>
              {group.items.map(renderItem)}
            </div>
          ))}

          {!sessions.length && !sessionsLoading ? (
            <div className="session-empty">
              {sessionQuery ? (
                <>
                  没有匹配「{sessionQuery}」的会话
                  <br />
                  可以尝试更短的关键词
                </>
              ) : (
                <>
                  暂无历史会话
                  <br />
                  点击「新建对话」开始第一次提问
                </>
              )}
            </div>
          ) : null}

          {sessionsLoading ? (
            <div className="session-loading">
              <div className="spinner" /> 加载中…
            </div>
          ) : null}

          {sessionsHasMore && !sessionsLoading ? (
            <button
              className="load-earlier"
              style={{ width: '100%', marginTop: 10, justifyContent: 'center' }}
              onClick={() => void loadSessions({ q: sessionQuery, append: true })}
            >
              加载更多（共 {formatNumber(sessionTotal)} 个）
            </button>
          ) : null}
        </div>

        <div className="sidebar-foot">
          {importing ? (
            <div className="import-pill">
              <div className="row">
                <Database size={12} />
                <span>正在导入历史数据…</span>
                <span style={{ marginLeft: 'auto' }}>{percent}%</span>
              </div>
              <div className="progress-track">
                <div className="progress-bar" style={{ width: `${percent}%` }} />
              </div>
            </div>
          ) : null}
          <div className="user-chip">
            <Avatar url={user?.avatarUrl} name={user?.displayName || user?.username} />
            <div className="user-info">
              <div className="user-name">{user?.displayName || '本地用户'}</div>
              <div className="user-status">
                <span className={`dot ${system?.apiKey.configured ? 'ok' : 'warn'}`} />
                {system?.apiKey.configured ? '模型通道在线' : '未配置 API Key'}
              </div>
            </div>
            <button className="icon-btn" title="数据中心" onClick={() => navigate('/stats')}>
              <BarChart3 size={16} />
            </button>
            <button className="icon-btn" title="设置" onClick={() => setSettingsOpen(true)}>
              <Settings size={16} />
            </button>
            <button className="icon-btn" title="退出登录" onClick={logout}>
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
