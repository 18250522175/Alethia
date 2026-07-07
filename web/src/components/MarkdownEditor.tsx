import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  TextB,
  TextItalic,
  ListBullets,
  ListNumbers,
  Quotes,
  Code,
  Link as LinkIcon,
  Spinner
} from '@phosphor-icons/react';
import api from '../lib/api';
import HighlightText from './HighlightText';

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
}

interface SuggestionItem {
  slug: string;
  title: string;
  aliases: string[];
  namespace: string;
  matchType: 'canonical' | 'alias' | 'fuzzy';
}

function getCursorPixelPosition(textarea: HTMLTextAreaElement, pos: number) {
  const textBefore = textarea.value.slice(0, pos);
  const lines = textBefore.split('\n');
  const currentLine = lines[lines.length - 1];

  const style = window.getComputedStyle(textarea);
  const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;
  const paddingTop = parseFloat(style.paddingTop);
  const paddingLeft = parseFloat(style.paddingLeft);
  const borderTop = parseFloat(style.borderTopWidth);
  const borderLeft = parseFloat(style.borderLeftWidth);
  const font = style.font;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  let textWidth = 0;
  if (ctx) {
    ctx.font = font;
    textWidth = ctx.measureText(currentLine).width;
  }

  return {
    top: paddingTop + borderTop + (lines.length - 1) * lineHeight - textarea.scrollTop + lineHeight,
    left: paddingLeft + borderLeft + textWidth - textarea.scrollLeft,
    lineHeight
  };
}

export default function MarkdownEditor({ value, onChange }: MarkdownEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [triggerStart, setTriggerStart] = useState(-1);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, lineHeight: 0 });

  const { data: searchData, isFetching } = useQuery({
    queryKey: ['entity-search', query],
    queryFn: () => api.searchEntities(query, 8),
    enabled: isOpen,
    staleTime: 30_000
  });

  const suggestions: SuggestionItem[] = searchData?.items ?? [];

  const closeAutocomplete = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    setSelectedIndex(0);
    setTriggerStart(-1);
  }, []);

  const updateDropdownPosition = useCallback((textarea: HTMLTextAreaElement, cursorPos: number) => {
    setDropdownPos(getCursorPixelPosition(textarea, cursorPos));
  }, []);

  const insertSuggestion = useCallback((item: SuggestionItem) => {
    const textarea = textareaRef.current;
    if (!textarea || triggerStart < 0) return;

    const aliasBehavior = localStorage.getItem('brain_alias_behavior') || 'normalize';
    const insertText = aliasBehavior === 'keep' ? (query || item.title) : item.title;

    const before = value.slice(0, triggerStart);
    const after = value.slice(textarea.selectionStart);
    const newValue = `${before}[[${insertText}]]${after}`;

    onChange(newValue);
    closeAutocomplete();

    requestAnimationFrame(() => {
      const newCursorPos = triggerStart + 2 + insertText.length + 2;
      textarea.focus();
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    });
  }, [value, onChange, triggerStart, query, closeAutocomplete]);

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const cursorPos = e.target.selectionStart;
    onChange(newValue);

    if (isOpen && triggerStart >= 0) {
      if (newValue.slice(triggerStart, triggerStart + 2) !== '[[') {
        closeAutocomplete();
        return;
      }

      const textAfterTrigger = newValue.slice(triggerStart + 2, cursorPos);
      if (textAfterTrigger.includes(' ') || textAfterTrigger.includes(']]')) {
        closeAutocomplete();
        return;
      }

      setQuery(textAfterTrigger);
      setSelectedIndex(0);
      updateDropdownPosition(e.target, cursorPos);
      return;
    }

    if (cursorPos >= 2 && newValue.slice(cursorPos - 2, cursorPos) === '[[') {
      setIsOpen(true);
      setQuery('');
      setSelectedIndex(0);
      setTriggerStart(cursorPos - 2);
      updateDropdownPosition(e.target, cursorPos);
    }
  }, [isOpen, triggerStart, onChange, closeAutocomplete, updateDropdownPosition]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!isOpen) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (suggestions.length > 0 ? (prev + 1) % suggestions.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (suggestions.length > 0 ? (prev - 1 + suggestions.length) % suggestions.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (suggestions[selectedIndex]) {
        insertSuggestion(suggestions[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeAutocomplete();
    }
  }, [isOpen, suggestions, selectedIndex, insertSuggestion, closeAutocomplete]);

  const handleScroll = useCallback(() => {
    if (isOpen && textareaRef.current) {
      const cursorPos = textareaRef.current.selectionStart;
      updateDropdownPosition(textareaRef.current, cursorPos);
    }
  }, [isOpen, updateDropdownPosition]);

  const handleBlur = useCallback(() => {
    setTimeout(() => {
      closeAutocomplete();
    }, 150);
  }, [closeAutocomplete]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.addEventListener('scroll', handleScroll);
    return () => textarea.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // Toolbar helpers
  const wrapSelection = useCallback((before: string, after: string = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = value.slice(start, end);
    const newValue = value.slice(0, start) + before + selected + after + value.slice(end);
    onChange(newValue);
    requestAnimationFrame(() => {
      textarea.focus();
      const newPos = start + before.length + selected.length;
      textarea.setSelectionRange(newPos, newPos);
    });
  }, [value, onChange]);

  const insertAtCursor = useCallback((text: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const newValue = value.slice(0, start) + text + value.slice(start);
    onChange(newValue);
    requestAnimationFrame(() => {
      textarea.focus();
      const newPos = start + text.length;
      textarea.setSelectionRange(newPos, newPos);
    });
  }, [value, onChange]);

  const toolbarButtons = [
    { icon: TextB, label: 'Bold', action: () => wrapSelection('**', '**') },
    { icon: TextItalic, label: 'Italic', action: () => wrapSelection('*', '*') },
    { icon: ListBullets, label: 'Bullet list', action: () => insertAtCursor('\n- ') },
    { icon: ListNumbers, label: 'Numbered list', action: () => insertAtCursor('\n1. ') },
    { icon: Quotes, label: 'Quote', action: () => insertAtCursor('\n> ') },
    { icon: Code, label: 'Code', action: () => wrapSelection('`', '`') },
    { icon: LinkIcon, label: 'Link', action: () => wrapSelection('[', '](url)') }
  ];

  return (
    <div className="relative">
      {/* Toolbar */}
      <div className="mb-2 flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-800">
        {toolbarButtons.map(btn => {
          const Icon = btn.icon;
          return (
            <button
              key={btn.label}
              type="button"
              onClick={btn.action}
              title={btn.label}
              className="inline-flex items-center justify-center rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
            >
              <Icon size={16} />
            </button>
          );
        })}
      </div>

      {/* Textarea wrapper */}
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          className="input min-h-[60vh] w-full resize-y font-mono text-sm leading-6"
          spellCheck={false}
        />

        {/* Autocomplete dropdown */}
        {isOpen && (
          <div
            className="absolute z-50 w-80 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800"
            style={{
              top: dropdownPos.top,
              left: Math.min(dropdownPos.left, 300)
            }}
          >
            {isFetching && suggestions.length === 0 && (
              <div className="flex items-center gap-2 px-3 py-2.5 text-sm text-slate-500 dark:text-slate-400">
                <Spinner size={14} className="animate-spin" />
                搜索中…
              </div>
            )}

            {!isFetching && suggestions.length === 0 && query.length > 0 && (
              <div className="px-3 py-2.5 text-sm text-slate-500 dark:text-slate-400">
                无匹配结果
              </div>
            )}

            {suggestions.length > 0 && (
              <ul className="max-h-64 overflow-auto py-1">
                {suggestions.map((item, idx) => {
                  const isSelected = idx === selectedIndex;
                  return (
                    <li key={item.slug}>
                      <button
                        type="button"
                        onMouseDown={e => {
                          e.preventDefault();
                          insertSuggestion(item);
                        }}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        className={`flex w-full items-start gap-2 px-3 py-2 text-left transition-colors ${
                          isSelected
                            ? 'bg-primary-50 dark:bg-primary-900/30'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                              <HighlightText text={item.title} keyword={query} />
                            </span>
                            <span className={`badge text-[10px] ${getNamespaceBadgeClass(item.namespace)}`}>
                              {item.namespace}
                            </span>
                          </div>
                          {item.aliases.length > 0 && (
                            <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                              别名: {item.aliases.join(', ')}
                            </div>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function getNamespaceBadgeClass(namespace: string): string {
  switch (namespace) {
    case 'concept':
      return 'badge-blue';
    case 'person':
      return 'badge-green';
    case 'company':
      return 'badge-yellow';
    case 'meeting':
      return 'badge-red';
    default:
      return 'badge-blue';
  }
}
