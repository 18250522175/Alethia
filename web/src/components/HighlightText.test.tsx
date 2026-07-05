import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import HighlightText from './HighlightText';

describe('HighlightText', () => {
  it('renders plain text when no keyword provided', () => {
    render(<HighlightText text="hello world" keyword="" />);
    expect(screen.getByText('hello world')).toBeInTheDocument();
    expect(screen.queryByRole('mark')).not.toBeInTheDocument();
  });

  it('renders plain text when keyword is whitespace only', () => {
    render(<HighlightText text="hello world" keyword="   " />);
    expect(screen.getByText('hello world')).toBeInTheDocument();
    expect(screen.queryByRole('mark')).not.toBeInTheDocument();
  });

  it('renders single highlight match', () => {
    const { container } = render(
      <HighlightText text="hello world" keyword="world" />
    );
    const marks = container.querySelectorAll('mark');
    expect(marks).toHaveLength(1);
    expect(marks[0].textContent).toBe('world');
  });

  it('renders multiple highlight matches', () => {
    const { container } = render(
      <HighlightText text="the cat and the dog" keyword="the" />
    );
    const marks = container.querySelectorAll('mark');
    expect(marks).toHaveLength(2);
    expect(marks[0].textContent).toBe('the');
    expect(marks[1].textContent).toBe('the');
  });

  it('matches case-insensitively but preserves original case', () => {
    const { container } = render(
      <HighlightText text="Hello World" keyword="hello" />
    );
    const marks = container.querySelectorAll('mark');
    expect(marks).toHaveLength(1);
    expect(marks[0].textContent).toBe('Hello');
  });

  it('preserves surrounding non-matching text', () => {
    const { container } = render(
      <HighlightText text="prefix match suffix" keyword="match" />
    );
    const span = container.querySelector('span');
    expect(span?.textContent).toBe('prefix match suffix');
    const marks = container.querySelectorAll('mark');
    expect(marks).toHaveLength(1);
    expect(marks[0].textContent).toBe('match');
  });

  it('handles empty text gracefully', () => {
    const { container } = render(<HighlightText text="" keyword="kw" />);
    expect(container.querySelectorAll('mark')).toHaveLength(0);
  });

  it('handles keyword not found in text', () => {
    const { container } = render(
      <HighlightText text="hello world" keyword="missing" />
    );
    expect(container.querySelectorAll('mark')).toHaveLength(0);
    expect(screen.getByText('hello world')).toBeInTheDocument();
  });

  it('handles keyword at start of text', () => {
    const { container } = render(
      <HighlightText text="hello world hello" keyword="hello" />
    );
    const marks = container.querySelectorAll('mark');
    expect(marks).toHaveLength(2);
  });

  it('applies custom highlightClassName', () => {
    const { container } = render(
      <HighlightText
        text="hello"
        keyword="hello"
        highlightClassName="custom-highlight"
      />
    );
    const mark = container.querySelector('mark');
    expect(mark?.className).toContain('custom-highlight');
  });

  it('applies custom className to wrapper', () => {
    const { container } = render(
      <HighlightText text="hello" keyword="" className="wrapper-class" />
    );
    const wrapper = container.querySelector('span');
    expect(wrapper?.className).toContain('wrapper-class');
  });
});
