export function formatFileSize(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export function formatDateTime(ts: string | number | Date): string {
  const date = typeof ts === 'string' || typeof ts === 'number' ? new Date(ts) : ts;
  if (isNaN(date.getTime())) return '—';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d} ${h}:${min}`;
}

export function formatRelativeTime(ts: string | number | Date): string {
  const date = typeof ts === 'string' || typeof ts === 'number' ? new Date(ts) : ts;
  if (isNaN(date.getTime())) return '—';
  const diff = Date.now() - date.getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return '刚刚';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天前`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks} 周前`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} 个月前`;
  const years = Math.floor(days / 365);
  return `${years} 年前`;
}

export function formatRelativeTimeShort(ts: string | number | Date): string {
  const date = typeof ts === 'string' || typeof ts === 'number' ? new Date(ts) : ts;
  if (isNaN(date.getTime())) return '—';
  const diff = Date.now() - date.getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return '刚刚';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  const years = Math.floor(days / 365);
  return `${years}y`;
}

export function formatNumber(num: number): string {
  if (num === undefined || num === null) return '—';
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return String(num);
}

export function formatCurrency(amount: number, currency: string = 'USD'): string {
  if (amount === undefined || amount === null) return '—';
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 4
  }).format(amount);
}

export function formatDuration(ms: number): string {
  if (!ms || ms < 0) return '0ms';
  if (ms < 1000) return `${ms}ms`;
  const secs = ms / 1000;
  if (secs < 60) return `${secs.toFixed(1)}s`;
  const mins = Math.floor(secs / 60);
  const remainingSecs = Math.floor(secs % 60);
  return `${mins}m ${remainingSecs}s`;
}

export function truncateText(text: string, maxLen: number = 100): string {
  if (!text) return '';
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + '…';
}

export function slugToTitle(slug: string): string {
  return slug
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}
