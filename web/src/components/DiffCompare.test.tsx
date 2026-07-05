import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import DiffCompare from './DiffCompare';

// Mock react-i18next 的 useTranslation
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallbackOrOpts?: string | Record<string, unknown>) => {
      if (typeof fallbackOrOpts === 'string') return fallbackOrOpts;
      if (
        fallbackOrOpts &&
        typeof fallbackOrOpts === 'object' &&
        'defaultValue' in fallbackOrOpts
      ) {
        let s = fallbackOrOpts.defaultValue as string;
        for (const [k, v] of Object.entries(fallbackOrOpts)) {
          if (k === 'defaultValue') continue;
          s = s.replace(new RegExp(`{{\\s*${k}\\s*}}`, 'g'), String(v));
        }
        return s;
      }
      return _key;
    }
  })
}));

beforeEach(() => {
  // mock clipboard
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) }
  });
});

describe('diffCompare', () => {
  it('renders empty state when both values empty', () => {
    render(<DiffCompare oldValue="" newValue="" />);
    expect(screen.getByText('无内容可对比')).toBeInTheDocument();
  });

  it('renders identical hint when both values equal', () => {
    render(<DiffCompare oldValue="hello" newValue="hello" />);
    expect(screen.getByText('无变更')).toBeInTheDocument();
  });

  it('shows added line when content added', () => {
    const oldVal = 'line1';
    const newVal = 'line1\nline2';
    render(<DiffCompare oldValue={oldVal} newValue={newVal} />);
    // 摘要文本被切分到多个元素中，使用 getAllByText
    const matches = screen.getAllByText((_, node) => {
      if (!node) return false;
      return node.textContent?.includes('共 1 行新增') ?? false;
    });
    expect(matches.length).toBeGreaterThan(0);
  });

  it('shows removed line when content removed', () => {
    const oldVal = 'line1\nline2';
    const newVal = 'line1';
    render(<DiffCompare oldValue={oldVal} newValue={newVal} />);
    const matches = screen.getAllByText((_, node) => {
      if (!node) return false;
      return node.textContent?.includes('1 行删除') ?? false;
    });
    expect(matches.length).toBeGreaterThan(0);
  });

  it('shows modified line when line changed', () => {
    render(<DiffCompare oldValue="old" newValue="new" />);
    const matches = screen.getAllByText((_, node) => {
      if (!node) return false;
      return node.textContent?.includes('1 行修改') ?? false;
    });
    expect(matches.length).toBeGreaterThan(0);
  });

  it('renders old and new values in headers', () => {
    render(<DiffCompare oldValue="old" newValue="new" />);
    expect(screen.getByText('旧值')).toBeInTheDocument();
    expect(screen.getByText('新值')).toBeInTheDocument();
  });

  it('renders title when provided', () => {
    render(<DiffCompare oldValue="a" newValue="b" title="变更对比" language="md" />);
    expect(screen.getByText('变更对比')).toBeInTheDocument();
    expect(screen.getByText('md')).toBeInTheDocument();
  });

  it('collapses and expands on toggle click', () => {
    render(<DiffCompare oldValue="old" newValue="new" defaultCollapsed={false} />);
    const toggleBtn = screen.getByRole('button', { name: '折叠' });
    fireEvent.click(toggleBtn);
    // 折叠后显示摘要提示
    expect(screen.getByText(/修改 1 行/)).toBeInTheDocument();
    // 再次点击展开
    const expandBtn = screen.getByRole('button', { name: '展开' });
    fireEvent.click(expandBtn);
    expect(screen.getByText('旧值')).toBeInTheDocument();
  });

  it('shows truncation warning when content exceeds MAX_LCS_LINES', () => {
    const big = Array.from({ length: 1001 })
      .fill('line')
      .map((l, i) => `${l}${i}`)
      .join('\n');
    const bigger = Array.from({ length: 1001 })
      .fill('changed')
      .map((l, i) => `${l}${i}`)
      .join('\n');
    render(<DiffCompare oldValue={big} newValue={bigger} />);
    expect(screen.getByText(/已使用简化对比模式/)).toBeInTheDocument();
  });

  it('falls back to simple compare when content is large and produces rows', () => {
    const big = Array.from({ length: 1001 })
      .fill('a')
      .map((_, i) => `line${i}`)
      .join('\n');
    const bigger = Array.from({ length: 1001 })
      .fill('a')
      .map((_, i) => `modified${i}`)
      .join('\n');
    const { container } = render(<DiffCompare oldValue={big} newValue={bigger} />);
    // 至少应渲染若干行
    const rows = container.querySelectorAll('[class*="grid-cols-2"]');
    expect(rows.length).toBeGreaterThan(10);
  });

  it('copy button calls clipboard.writeText with newValue', () => {
    render(<DiffCompare oldValue="old" newValue="new content" />);
    // 按钮的可访问名称来自其文字内容 "复制"，title 为辅助提示
    const copyBtn = screen.getByTitle('复制新内容');
    fireEvent.click(copyBtn);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('new content');
  });

  it('copy button disabled when newValue empty', () => {
    render(<DiffCompare oldValue="old" newValue="" />);
    const copyBtn = screen.getByTitle('复制新内容');
    expect(copyBtn).toBeDisabled();
  });

  it('renders no-changes summary when identical', () => {
    render(<DiffCompare oldValue="same" newValue="same" />);
    expect(screen.getByText('新旧内容完全一致')).toBeInTheDocument();
  });
});
