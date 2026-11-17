import { useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { ChatHeader } from '../components/ChatHeader';
import { MessageList } from '../components/MessageList';
import { Composer } from '../components/Composer';
import { WelcomeScreen } from '../components/WelcomeScreen';

export function ChatPage({ sessionId }: { sessionId: string | null }) {
  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const messages = useAppStore((s) => s.messages);
  const streaming = useAppStore((s) => s.streaming);
  const loadSession = useAppStore((s) => s.loadSession);
  const startNewChat = useAppStore((s) => s.startNewChat);
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);

  useEffect(() => {
    if (sessionId) {
      if (sessionId !== activeSessionId) void loadSession(sessionId);
      if (window.innerWidth < 900) setSidebarOpen(false);
    } else if (activeSessionId && !streaming) {
      startNewChat();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const hasConversation = !!sessionId || !!activeSessionId || messages.length > 0 || streaming;

  return (
    <div className="chat-view">
      <ChatHeader />
      {hasConversation ? <MessageList /> : <WelcomeScreen />}
      <Composer />
    </div>
  );
}
