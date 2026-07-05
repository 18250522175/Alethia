import { useMemo } from 'react';

interface HighlightTextProps {
  text: string;
  keyword: string;
  className?: string;
  highlightClassName?: string;
}

export default function HighlightText({
  text,
  keyword,
  className = '',
  highlightClassName = 'bg-yellow-200 dark:bg-yellow-800/50 text-yellow-900 dark:text-yellow-200 rounded px-0.5'
}: HighlightTextProps) {
  const parts = useMemo(() => {
    if (!keyword || !keyword.trim()) {
      return [{ text, highlight: false }];
    }

    const kw = keyword.trim();
    if (!text || !kw) {
      return [{ text, highlight: false }];
    }

    const result: { text: string; highlight: boolean }[] = [];
    const lowerText = text.toLowerCase();
    const lowerKw = kw.toLowerCase();
    let lastIndex = 0;
    let idx = lowerText.indexOf(lowerKw);

    while (idx !== -1) {
      if (idx > lastIndex) {
        result.push({ text: text.slice(lastIndex, idx), highlight: false });
      }
      result.push({ text: text.slice(idx, idx + kw.length), highlight: true });
      lastIndex = idx + kw.length;
      idx = lowerText.indexOf(lowerKw, lastIndex);
    }

    if (lastIndex < text.length) {
      result.push({ text: text.slice(lastIndex), highlight: false });
    }

    return result.length > 0 ? result : [{ text, highlight: false }];
  }, [text, keyword]);

  return (
    <span className={className}>
      {parts.map((part, i) =>
        part.highlight ? (
          <mark key={i} className={highlightClassName}>
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </span>
  );
}
