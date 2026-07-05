import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// 每个测试后自动清理 DOM
afterEach(() => {
  cleanup();
});

// Mock matchMedia（jsdom 不支持）
if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

// Mock IntersectionObserver
class MockIntersectionObserver {
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds = [];
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords = vi.fn().mockReturnValue([]);
}

if (!window.IntersectionObserver) {
  Object.defineProperty(window, 'IntersectionObserver', {
    writable: true,
    configurable: true,
    value: MockIntersectionObserver,
  });
}

// Mock ResizeObserver
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

if (!window.ResizeObserver) {
  Object.defineProperty(window, 'ResizeObserver', {
    writable: true,
    configurable: true,
    value: MockResizeObserver,
  });
}

// Mock scrollTo（jsdom 不支持平滑滚动）
window.scrollTo = vi.fn().mockImplementation(() => {});

// Mock crypto.randomUUID
if (!crypto.randomUUID) {
  Object.defineProperty(crypto, 'randomUUID', {
    writable: true,
    configurable: true,
    value: vi.fn().mockReturnValue('test-uuid-' + Math.random().toString(36).slice(2, 11)),
  });
}
