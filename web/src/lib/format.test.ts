import { describe, it, expect } from 'vitest';
import {
  formatFileSize,
  formatDateTime,
  formatRelativeTime,
  formatDuration,
  truncateText,
  slugToTitle,
} from './format';

describe('formatFileSize', () => {
  it('formats bytes correctly', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(500)).toBe('500 B');
  });

  it('formats KB correctly', () => {
    expect(formatFileSize(1024)).toBe('1 KB');
    expect(formatFileSize(1536)).toBe('1.5 KB');
  });

  it('formats MB correctly', () => {
    expect(formatFileSize(1048576)).toBe('1 MB');
  });

  it('formats GB correctly', () => {
    expect(formatFileSize(1073741824)).toBe('1 GB');
  });

  it('handles zero input', () => {
    expect(formatFileSize(0)).toBe('0 B');
  });
});

describe('formatDateTime', () => {
  it('formats valid date string', () => {
    const result = formatDateTime('2024-01-15T10:30:00');
    expect(result).toMatch(/2024-01-15 10:30/);
  });

  it('returns dash for invalid date', () => {
    expect(formatDateTime('invalid')).toBe('—');
  });

  it('handles Date object', () => {
    const date = new Date(2024, 0, 15, 10, 30);
    const result = formatDateTime(date);
    expect(result).toMatch(/2024-01-15 10:30/);
  });
});

describe('formatRelativeTime', () => {
  it('returns 刚刚 for recent time', () => {
    const now = new Date();
    expect(formatRelativeTime(now.toISOString())).toBe('刚刚');
  });

  it('returns minutes ago', () => {
    const past = new Date(Date.now() - 5 * 60 * 1000);
    expect(formatRelativeTime(past.toISOString())).toBe('5 分钟前');
  });

  it('returns hours ago', () => {
    const past = new Date(Date.now() - 3 * 60 * 60 * 1000);
    expect(formatRelativeTime(past.toISOString())).toBe('3 小时前');
  });

  it('returns days ago', () => {
    const past = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    expect(formatRelativeTime(past.toISOString())).toBe('2 天前');
  });

  it('returns dash for invalid date', () => {
    expect(formatRelativeTime('invalid')).toBe('—');
  });
});

describe('formatDuration', () => {
  it('formats milliseconds', () => {
    expect(formatDuration(500)).toBe('500ms');
    expect(formatDuration(0)).toBe('0ms');
    expect(formatDuration(-1)).toBe('0ms');
  });

  it('formats seconds', () => {
    expect(formatDuration(1500)).toBe('1.5s');
  });

  it('formats minutes', () => {
    expect(formatDuration(65000)).toBe('1m 5s');
  });
});

describe('truncateText', () => {
  it('returns text as-is when shorter than maxLen', () => {
    expect(truncateText('hello', 10)).toBe('hello');
  });

  it('truncates with ellipsis when longer', () => {
    const long = 'a'.repeat(150);
    const result = truncateText(long, 100);
    expect(result.length).toBe(101);
    expect(result.endsWith('…')).toBe(true);
  });

  it('handles empty string', () => {
    expect(truncateText('', 10)).toBe('');
  });
});

describe('slugToTitle', () => {
  it('converts slug to title case', () => {
    expect(slugToTitle('hello-world')).toBe('Hello World');
    expect(slugToTitle('test_slug')).toBe('Test Slug');
  });

  it('handles empty string', () => {
    expect(slugToTitle('')).toBe('');
  });
});
