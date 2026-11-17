import { useEffect, useRef } from 'react';
import { useAppStore } from './store/useAppStore';
import { usePath, sessionIdFromPath } from './lib/router';
import { BootScreen, ConfirmDialog, Toasts } from './components/Common';
import { Sidebar } from './components/Sidebar';
import { SettingsModal } from './components/SettingsModal';
import { LoginPage } from './pages/LoginPage';
import { ChatPage } from './pages/ChatPage';
import { StatsPage } from './pages/StatsPage';

export default function App() {
  const path = usePath();
  const booting = useAppStore((s) => s.booting);
  const token = useAppStore((s) => s.token);
  const bootstrap = useAppStore((s) => s.bootstrap);
  const refreshSystem = useAppStore((s) => s.refreshSystem);
  const loadSessions = useAppStore((s) => s.loadSessions);
  const startNewChat = useAppStore((s) => s.startNewChat);
  const importing = useAppStore((s) => s.system?.importing || false);
  const importStatus = useAppStore((s) => s.system?.import.status);
  const previousImporting = useRef(false);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    const handler = () => useAppStore.getState().logout();
    window.addEventListener('nexus:unauthorized', handler);
    return () => window.removeEventListener('nexus:unauthorized', handler);
  }, []);

  useEffect(() => {
    if (!token) return;
    if (!importing) {
      if (previousImporting.current) {
        void loadSessions();
        void refreshSystem();
      }
      previousImporting.current = false;
      return;
    }
    previousImporting.current = true;
    const timer = setInterval(() => {
      void refreshSystem();
    }, 3000);
    return () => clearInterval(timer);
  }, [importing, importStatus, token, refreshSystem, loadSessions]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        startNewChat();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [startNewChat]);

  if (booting) {
    return (
      <>
        <BootScreen />
        <Toasts />
      </>
    );
  }

  if (!token) {
    return (
      <>
        <LoginPage />
        <Toasts />
      </>
    );
  }

  const sessionId = sessionIdFromPath(path);

  return (
    <>
      <div className="app-shell">
        <Sidebar />
        <main className="main-view">
          {path.startsWith('/stats') ? <StatsPage /> : <ChatPage sessionId={sessionId} />}
        </main>
      </div>
      <SettingsModal />
      <ConfirmDialog />
      <Toasts />
    </>
  );
}
