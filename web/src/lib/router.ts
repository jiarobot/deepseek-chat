import { useEffect, useState } from 'react';

const NAV_EVENT = 'nexus:navigate';

export function navigate(path: string, replace = false): void {
  if (window.location.pathname + window.location.search === path) return;
  if (replace) window.history.replaceState({}, '', path);
  else window.history.pushState({}, '', path);
  window.dispatchEvent(new Event(NAV_EVENT));
}

export function usePath(): string {
  const [path, setPath] = useState(`${window.location.pathname}${window.location.search}`);
  useEffect(() => {
    const handler = () => setPath(`${window.location.pathname}${window.location.search}`);
    window.addEventListener('popstate', handler);
    window.addEventListener(NAV_EVENT, handler);
    return () => {
      window.removeEventListener('popstate', handler);
      window.removeEventListener(NAV_EVENT, handler);
    };
  }, []);
  return path;
}

export function sessionIdFromPath(path: string): string | null {
  const match = /\/c\/([^/?#]+)/.exec(path);
  return match ? decodeURIComponent(match[1]) : null;
}
