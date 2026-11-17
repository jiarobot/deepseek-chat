import { create } from 'zustand';
import { api, ApiError, clearToken, getToken, setToken } from '../lib/api';
import { navigate } from '../lib/router';
import type {
  ChatMessage,
  Fragment,
  ModelInfo,
  SessionSummary,
  Settings,
  StreamEvent,
  SystemStatus,
  User
} from '../lib/types';

export type ToastKind = 'info' | 'success' | 'error';

export interface ToastItem {
  id: number;
  text: string;
  kind: ToastKind;
}

interface ConfirmState {
  title: string;
  message: string;
  danger?: boolean;
  confirmText?: string;
  resolve: (value: boolean) => void;
}

export interface AppState {
  token: string | null;
  user: User | null;
  booting: boolean;
  system: SystemStatus | null;
  models: ModelInfo[];
  settings: Settings;
  sessions: SessionSummary[];
  sessionTotal: number;
  sessionsHasMore: boolean;
  sessionQuery: string;
  sessionsLoading: boolean;
  activeSessionId: string | null;
  session: SessionSummary | null;
  messages: ChatMessage[];
  messageTotal: number;
  hasMoreMessages: boolean;
  loadingMessages: boolean;
  streaming: boolean;
  streamReasoning: string;
  streamContent: string;
  streamSearch: Fragment | null;
  streamStatus: string | null;
  streamError: string | null;
  abortController: AbortController | null;
  settingsOpen: boolean;
  sidebarOpen: boolean;
  toasts: ToastItem[];
  confirmState: ConfirmState | null;

  bootstrap: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, displayName: string) => Promise<void>;
  logout: () => void;
  refreshSystem: () => Promise<void>;
  loadSessions: (opts?: { q?: string; append?: boolean }) => Promise<void>;
  setSessionQuery: (q: string) => void;
  loadSession: (id: string) => Promise<void>;
  startNewChat: () => void;
  send: (content: string, attachmentIds?: string[]) => Promise<void>;
  stop: () => void;
  regenerate: () => Promise<void>;
  editAndResend: (messageId: string | number, content: string) => Promise<void>;
  loadEarlier: () => Promise<void>;
  renameSession: (id: string, title: string) => Promise<void>;
  togglePin: (id: string, pinned: boolean) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  clearSessions: () => Promise<void>;
  saveSettings: (patch: Partial<Settings>) => Promise<void>;
  setApiKey: (key: string) => Promise<void>;
  clearApiKey: () => Promise<void>;
  triggerImport: (force?: boolean) => Promise<void>;
  setSettingsOpen: (open: boolean) => void;
  setSidebarOpen: (open: boolean) => void;
  toast: (text: string, kind?: ToastKind) => void;
  dismissToast: (id: number) => void;
  confirm: (title: string, message: string, danger?: boolean, confirmText?: string) => Promise<boolean>;
}

const DEFAULT_SETTINGS: Settings = {
  model: 'deepseek-chat',
  thinking: false,
  search: false,
  temperature: 0.7,
  systemPrompt: '',
  theme: 'dark'
};

let toastSeq = 0;

function applyTheme(theme: string): void {
  document.documentElement.dataset.theme = theme === 'light' ? 'light' : 'dark';
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return '操作失败，请稍后重试';
}

const initialState = {
  token: getToken(),
  user: null as User | null,
  booting: true,
  system: null as SystemStatus | null,
  models: [] as ModelInfo[],
  settings: DEFAULT_SETTINGS,
  sessions: [] as SessionSummary[],
  sessionTotal: 0,
  sessionsHasMore: false,
  sessionQuery: '',
  sessionsLoading: false,
  activeSessionId: null as string | null,
  session: null as SessionSummary | null,
  messages: [] as ChatMessage[],
  messageTotal: 0,
  hasMoreMessages: false,
  loadingMessages: false,
  streaming: false,
  streamReasoning: '',
  streamContent: '',
  streamSearch: null as Fragment | null,
  streamStatus: null as string | null,
  streamError: null as string | null,
  abortController: null as AbortController | null,
  settingsOpen: false,
  sidebarOpen: false,
  toasts: [] as ToastItem[],
  confirmState: null as ConfirmState | null
};

export const useAppStore = create<AppState>((set, get) => {
  const resetStream = () => ({
    streaming: false,
    streamReasoning: '',
    streamContent: '',
    streamSearch: null,
    streamStatus: null,
    abortController: null
  });

  const handleEvent = (event: StreamEvent): void => {
    switch (event.type) {
      case 'session': {
        const session = event.session as SessionSummary | undefined;
        const userMessage = event.userMessage as ChatMessage | undefined;
        if (!session) break;
        set((state) => {
          const exists = userMessage
            ? state.messages.some((m) => String(m.id) === String(userMessage.id))
            : true;
          return {
            activeSessionId: session.id,
            session,
            messageTotal: Number(event.messageCount ?? state.messageTotal),
            messages: userMessage && !exists ? [...state.messages, userMessage] : state.messages
          };
        });
        if (window.location.pathname !== `/c/${session.id}`) {
          navigate(`/c/${session.id}`, true);
        }
        break;
      }
      case 'reasoning':
        set((state) => ({ streamReasoning: state.streamReasoning + String(event.delta || '') }));
        break;
      case 'content':
        set((state) => ({ streamContent: state.streamContent + String(event.delta || '') }));
        break;
      case 'search':
        set({ streamSearch: (event.fragment as Fragment) || null });
        break;
      case 'status':
        set({ streamStatus: String(event.message || '') });
        break;
      case 'done': {
        const message = event.message as ChatMessage | undefined;
        set((state) => ({
          streaming: false,
          streamStatus: null,
          abortController: null,
          session: (event.session as SessionSummary | undefined) || state.session,
          messages: message ? [...state.messages, message] : state.messages,
          messageTotal: state.messageTotal + (message ? 1 : 0),
          streamReasoning: '',
          streamContent: '',
          streamSearch: null
        }));
        void get().refreshSystem();
        void get().loadSessions();
        break;
      }
      case 'error': {
        const sessionId = get().activeSessionId;
        set({ streaming: false, streamStatus: null, abortController: null });
        get().toast(String(event.message || '生成失败'), 'error');
        if (sessionId) {
          setTimeout(() => {
            if (get().activeSessionId === sessionId) void get().loadSession(sessionId);
          }, 400);
        }
        break;
      }
      default:
        break;
    }
  };

  const runStream = async (
    path: string,
    body: Record<string, unknown>,
    onAbortMessage = '已停止生成'
  ): Promise<void> => {
    const controller = new AbortController();
    set({
      streaming: true,
      streamReasoning: '',
      streamContent: '',
      streamSearch: null,
      streamStatus: '正在连接模型…',
      streamError: null,
      abortController: controller
    });
    try {
      await api.streamChat(path, body, handleEvent, controller.signal);
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        get().toast(onAbortMessage, 'info');
      } else {
        const message = errorMessage(err);
        set({ streamError: message });
        get().toast(message, 'error');
      }
    } finally {
      if (get().abortController === controller) {
        set({ streaming: false, streamStatus: null, abortController: null });
      }
      const activeId = get().activeSessionId;
      if (activeId && get().messages.length === 0) {
        void get().loadSession(activeId);
      }
    }
  };

  return {
    ...initialState,

    async bootstrap() {
      const token = getToken();
      if (!token) {
        set({ booting: false });
        return;
      }
      try {
        const [{ user }, { settings }, system] = await Promise.all([
          api.me(),
          api.settings(),
          api.systemStatus()
        ]);
        applyTheme(settings.theme);
        set({ token, user, settings, system, models: system.models, booting: false });
        await get().loadSessions();
      } catch {
        clearToken();
        set({ token: null, user: null, booting: false });
      }
    },

    async login(username, password) {
      const { token, user } = await api.login(username, password);
      setToken(token);
      set({ token, user });
      const [{ settings }, system] = await Promise.all([api.settings(), api.systemStatus()]);
      applyTheme(settings.theme);
      set({ settings, system, models: system.models });
      navigate('/', true);
      await get().loadSessions();
      get().toast(`欢迎回来，${user.displayName}`, 'success');
    },

    async register(username, password, displayName) {
      const { token, user } = await api.register(username, password, displayName);
      setToken(token);
      set({ token, user });
      const [{ settings }, system] = await Promise.all([api.settings(), api.systemStatus()]);
      applyTheme(settings.theme);
      set({ settings, system, models: system.models });
      navigate('/', true);
      await get().loadSessions();
      get().toast('账号创建成功，历史会话仅归属于初始账号', 'success');
    },

    logout() {
      clearToken();
      set({
        token: null,
        user: null,
        sessions: [],
        sessionTotal: 0,
        activeSessionId: null,
        session: null,
        messages: [],
        streaming: false,
        abortController: null,
        settingsOpen: false,
        sidebarOpen: false,
        settings: DEFAULT_SETTINGS
      });
      navigate('/', true);
    },

    async refreshSystem() {
      try {
        const system = await api.systemStatus();
        set({ system, models: system.models });
      } catch {
        /* 忽略轮询失败 */
      }
    },

    async loadSessions(opts) {
      const q = opts?.q !== undefined ? opts.q : get().sessionQuery;
      set({ sessionsLoading: true, sessionQuery: q });
      try {
        if (opts?.append) {
          const current = get().sessions;
          const res = await api.sessions({ q, limit: 80, offset: current.length });
          set({
            sessions: [...current, ...res.items],
            sessionTotal: res.total,
            sessionsHasMore: res.hasMore,
            sessionsLoading: false
          });
        } else {
          const res = await api.sessions({ q, limit: 80 });
          set({
            sessions: res.items,
            sessionTotal: res.total,
            sessionsHasMore: res.hasMore,
            sessionsLoading: false
          });
        }
      } catch (err) {
        set({ sessionsLoading: false });
        if (!(err instanceof ApiError && err.status === 401)) {
          get().toast(errorMessage(err), 'error');
        }
      }
    },

    setSessionQuery(q) {
      set({ sessionQuery: q });
    },

    async loadSession(id) {
      if (get().abortController && get().activeSessionId !== id) {
        get().abortController?.abort();
      }
      set({ loadingMessages: true, activeSessionId: id });
      try {
        const view = await api.session(id, undefined, 40);
        if (get().activeSessionId !== id) return;
        set({
          session: view.session,
          messages: view.messages,
          messageTotal: view.total,
          hasMoreMessages: view.hasMore,
          loadingMessages: false
        });
      } catch (err) {
        set({ loadingMessages: false });
        if (err instanceof ApiError && err.status === 404) {
          get().toast('会话不存在或已被删除', 'error');
          get().startNewChat();
        } else if (!(err instanceof ApiError && err.status === 401)) {
          get().toast(errorMessage(err), 'error');
        }
      }
    },

    startNewChat() {
      set({
        activeSessionId: null,
        session: null,
        messages: [],
        messageTotal: 0,
        hasMoreMessages: false,
        streamError: null,
        sessionQuery: '',
        ...resetStream()
      });
      navigate('/');
      void get().loadSessions({ q: '' });
      if (window.innerWidth < 900) set({ sidebarOpen: false });
    },

    async send(content, attachmentIds = []) {
      const state = get();
      if (state.streaming) return;
      const { settings } = state;
      await runStream('/api/chat', {
        sessionId: state.activeSessionId || undefined,
        content,
        attachments: attachmentIds,
        thinking: settings.thinking,
        search: settings.search,
        temperature: settings.temperature,
        model: settings.thinking ? 'deepseek-reasoner' : 'deepseek-chat'
      });
    },

    stop() {
      get().abortController?.abort();
      const id = get().activeSessionId;
      if (id) {
        setTimeout(() => {
          if (!get().streaming && get().activeSessionId === id) void get().loadSession(id);
        }, 400);
      }
    },

    async regenerate() {
      const { activeSessionId, streaming, messages } = get();
      if (!activeSessionId || streaming) return;
      const trimmed = [...messages];
      while (trimmed.length && trimmed[trimmed.length - 1].role === 'ASSISTANT') trimmed.pop();
      set({ messages: trimmed });
      const { settings } = get();
      await runStream(`/api/sessions/${encodeURIComponent(activeSessionId)}/regenerate`, {
        thinking: settings.thinking,
        search: settings.search,
        temperature: settings.temperature,
        model: settings.thinking ? 'deepseek-reasoner' : 'deepseek-chat'
      });
    },

    async editAndResend(messageId, content) {
      const { activeSessionId, streaming } = get();
      if (!activeSessionId || streaming) return;
      try {
        await api.editMessage(activeSessionId, messageId, content);
        await get().loadSession(activeSessionId);
        await get().regenerate();
      } catch (err) {
        get().toast(errorMessage(err), 'error');
      }
    },

    async loadEarlier() {
      const { activeSessionId, messages, hasMoreMessages, loadingMessages } = get();
      if (!activeSessionId || !hasMoreMessages || loadingMessages || !messages.length) return;
      set({ loadingMessages: true });
      try {
        const view = await api.session(activeSessionId, messages[0].id, 30);
        set((state) => ({
          messages: [...view.messages, ...state.messages],
          hasMoreMessages: view.hasMore,
          loadingMessages: false
        }));
      } catch (err) {
        set({ loadingMessages: false });
        get().toast(errorMessage(err), 'error');
      }
    },

    async renameSession(id, title) {
      const clean = title.trim();
      if (!clean) return;
      try {
        await api.patchSession(id, { title: clean });
        set((state) => ({
          sessions: state.sessions.map((s) => (s.id === id ? { ...s, title: clean } : s)),
          session: state.session && state.session.id === id ? { ...state.session, title: clean } : state.session
        }));
      } catch (err) {
        get().toast(errorMessage(err), 'error');
      }
    },

    async togglePin(id, pinned) {
      try {
        await api.patchSession(id, { pinned });
        set((state) => ({
          sessions: state.sessions.map((s) => (s.id === id ? { ...s, pinned } : s)),
          session: state.session && state.session.id === id ? { ...state.session, pinned } : state.session
        }));
        get().toast(pinned ? '已置顶' : '已取消置顶', 'success');
      } catch (err) {
        get().toast(errorMessage(err), 'error');
      }
    },

    async deleteSession(id) {
      try {
        await api.deleteSession(id);
        set((state) => ({
          sessions: state.sessions.filter((s) => s.id !== id),
          sessionTotal: Math.max(0, state.sessionTotal - 1)
        }));
        if (get().activeSessionId === id) get().startNewChat();
        get().toast('会话已删除', 'success');
      } catch (err) {
        get().toast(errorMessage(err), 'error');
      }
    },

    async clearSessions() {
      try {
        const res = await api.clearSessions();
        set({ sessions: [], sessionTotal: 0, sessionsHasMore: false });
        get().startNewChat();
        get().toast(`已清空 ${res.count} 个会话`, 'success');
        await get().refreshSystem();
      } catch (err) {
        get().toast(errorMessage(err), 'error');
      }
    },

    async saveSettings(patch) {
      const previous = get().settings;
      const next = { ...previous, ...patch };
      set({ settings: next });
      if (patch.theme) applyTheme(patch.theme);
      try {
        const res = await api.updateSettings(patch);
        set({ settings: res.settings });
      } catch (err) {
        set({ settings: previous });
        applyTheme(previous.theme);
        get().toast(errorMessage(err), 'error');
      }
    },

    async setApiKey(key) {
      try {
        await api.setApiKey(key);
        await get().refreshSystem();
        get().toast('API Key 已写入本次运行的内存，重启后失效', 'success');
      } catch (err) {
        get().toast(errorMessage(err), 'error');
        throw err;
      }
    },

    async clearApiKey() {
      try {
        await api.clearApiKey();
        await get().refreshSystem();
        get().toast('已清除运行期 API Key', 'info');
      } catch (err) {
        get().toast(errorMessage(err), 'error');
      }
    },

    async triggerImport(force = false) {
      try {
        await api.runImport(force);
        await get().refreshSystem();
        get().toast(force ? '已启动全量重建导入' : '已启动增量导入', 'success');
      } catch (err) {
        get().toast(errorMessage(err), 'error');
      }
    },

    setSettingsOpen(open) {
      set({ settingsOpen: open });
    },

    setSidebarOpen(open) {
      set({ sidebarOpen: open });
    },

    toast(text, kind = 'info') {
      const id = ++toastSeq;
      set((state) => ({ toasts: [...state.toasts, { id, text, kind }] }));
      setTimeout(() => {
        set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
      }, 4200);
    },

    dismissToast(id) {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    },

    confirm(title, message, danger = false, confirmText = '确认') {
      return new Promise((resolve) => {
        set({ confirmState: { title, message, danger, confirmText, resolve } });
      });
    }
  };
});
