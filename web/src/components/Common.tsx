import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { initials } from '../lib/utils';

export function LogoMark({ size = 34, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} className={className} aria-hidden="true">
      <defs>
        <linearGradient id="nexus-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#45d7ff" />
          <stop offset="55%" stopColor="#7de3ff" />
          <stop offset="100%" stopColor="#8a7bff" />
        </linearGradient>
      </defs>
      <path
        d="M24 2.6 43 13.4v21.2L24 45.4 5 34.6V13.4z"
        fill="rgba(69,215,255,0.07)"
        stroke="url(#nexus-mark)"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M16 15.5h7.2c6.1 0 10 3.5 10 8.5s-3.9 8.5-10 8.5H16z"
        fill="none"
        stroke="url(#nexus-mark)"
        strokeWidth="2.1"
        strokeLinejoin="round"
      />
      <path d="M20.4 20.5h2.4M20.4 24h4.4M20.4 27.5h2.4" stroke="url(#nexus-mark)" strokeWidth="1.5" strokeLinecap="round" opacity="0.85" />
      <circle cx="34.2" cy="15" r="2.1" fill="#45d7ff" />
    </svg>
  );
}

export function Avatar({ url, name, size = 33 }: { url?: string | null; name?: string; size?: number }) {
  return (
    <span className="avatar" style={{ width: size, height: size }}>
      {url ? <img src={url} alt={name || 'avatar'} referrerPolicy="no-referrer" /> : initials(name)}
    </span>
  );
}

export function BootScreen() {
  return (
    <div className="boot-screen">
      <LogoMark size={58} className="boot-logo" />
      <div>NEXUS · 正在接入本地数据节点</div>
      <div className="spinner" />
    </div>
  );
}

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  size?: 'sm' | 'md';
  children: ReactNode;
  footer?: ReactNode;
}

export function Modal({ open, onClose, title, subtitle, size = 'md', children, footer }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handler);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className={`modal ${size === 'sm' ? 'sm' : ''}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          <div>
            <div className="modal-title">{title}</div>
            {subtitle ? <div className="modal-sub">{subtitle}</div> : null}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="关闭">
            <X size={17} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

export function Toasts() {
  const toasts = useAppStore((state) => state.toasts);
  const dismiss = useAppStore((state) => state.dismissToast);
  if (!toasts.length) return null;
  return (
    <div className="toast-stack">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast ${toast.kind}`} onClick={() => dismiss(toast.id)}>
          <span className="bar" />
          {toast.kind === 'success' ? (
            <CheckCircle2 size={15} color="var(--accent-3)" />
          ) : toast.kind === 'error' ? (
            <AlertTriangle size={15} color="var(--danger)" />
          ) : (
            <Info size={15} color="var(--accent)" />
          )}
          <span>{toast.text}</span>
        </div>
      ))}
    </div>
  );
}

export function ConfirmDialog() {
  const state = useAppStore((s) => s.confirmState);
  const setState = useAppStore.setState;
  if (!state) return null;
  const close = (value: boolean) => {
    state.resolve(value);
    setState({ confirmState: null });
  };
  return (
    <Modal
      open
      onClose={() => close(false)}
      title={state.title}
      size="sm"
      footer={
        <>
          <button className="btn btn-ghost" onClick={() => close(false)}>
            取消
          </button>
          <button className={state.danger ? 'btn btn-danger' : 'btn btn-primary'} onClick={() => close(true)}>
            {state.confirmText || '确认'}
          </button>
        </>
      }
    >
      <div style={{ color: 'var(--text-dim)', fontSize: 13, lineHeight: 1.8 }}>{state.message}</div>
    </Modal>
  );
}
