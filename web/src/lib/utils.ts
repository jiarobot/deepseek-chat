import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/zh-cn';

dayjs.extend(relativeTime);
dayjs.locale('zh-cn');

export function formatNumber(value: number | undefined | null): string {
  const n = Number(value || 0);
  if (n >= 100000000) return `${(n / 100000000).toFixed(1)}亿`;
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  return n.toLocaleString('zh-CN');
}

export function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function formatClock(iso: string | undefined | null): string {
  if (!iso) return '';
  return dayjs(iso).format('HH:mm');
}

export function formatDate(iso: string | undefined | null): string {
  if (!iso) return '';
  return dayjs(iso).format('YYYY-MM-DD');
}

export function formatDateTime(iso: string | undefined | null): string {
  if (!iso) return '';
  return dayjs(iso).format('YYYY-MM-DD HH:mm');
}

export function timeAgo(iso: string | undefined | null): string {
  if (!iso) return '';
  const d = dayjs(iso);
  const now = dayjs();
  if (now.diff(d, 'minute') < 1) return '刚刚';
  if (now.diff(d, 'day') < 1) return d.format('HH:mm');
  if (now.diff(d, 'day') < 7) return d.fromNow();
  if (d.year() === now.year()) return d.format('M月D日');
  return d.format('YYYY/M/D');
}

export function groupLabel(iso: string): string {
  const d = dayjs(iso);
  const now = dayjs();
  const diffDays = now.startOf('day').diff(d.startOf('day'), 'day');
  if (diffDays <= 0) return '今天';
  if (diffDays === 1) return '昨天';
  if (diffDays <= 7) return '最近 7 天';
  if (diffDays <= 30) return '最近 30 天';
  return d.format('YYYY 年 M 月');
}

export function estimateTokens(text: string): number {
  return Math.max(0, Math.round(text.length / 1.6));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export function initials(name: string | undefined): string {
  if (!name) return 'N';
  const clean = name.replace(/[^\p{L}\p{N}]/gu, '');
  return clean.slice(0, 2).toUpperCase() || 'N';
}

export function extractText(node: unknown): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (typeof node === 'object' && 'props' in (node as Record<string, unknown>)) {
    const props = (node as { props?: { children?: unknown } }).props;
    return extractText(props?.children);
  }
  return '';
}
