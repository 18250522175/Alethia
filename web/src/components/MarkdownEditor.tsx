import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  TextB,
  TextItalic,
  ListBullets,
  ListNumbers,
  Quotes,
  Code,
  Link as LinkIcon,
  Spinner,
  Upload
} from '@phosphor-icons/react';
import api from '../lib/api';
import HighlightText from './HighlightText';
import CommandPalette from './CommandPalette';
import { useNotification } from '../contexts/NotificationContext';

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
}

interface WikilinkSuggestion {
  slug: string;
  title: string;
  type?: string;
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

const ALLOWED_FILE_TYPES: Record<string, string[]> = {
  image: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'],
  document: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  audio: ['audio/mpeg', 'audio/wav', 'audio/x-wav'],
  video: ['video/mp4'],
  text: ['text/markdown', 'text/plain', 'application/json', 'text/x-markdown']
};

const ALLOWED_EXTENSIONS: string[] = [
  'jpg', 'jpeg', 'png', 'webp', 'gif', 'svg',
  'pdf', 'docx',
  'mp3', 'wav',
  'mp4',
  'md', 'txt', 'json'
];

const ONTOLOGY_COLORS: Record<string, string> = {
  '人': '#f59e0b',
  '组织': '#3b82f6',
  '事件': '#ef4444',
  '指标': '#10b981',
  '决策': '#8b5cf6',
  '产品': '#ec4899',
  'default': '#94a3b8'
};

export default function MarkdownEditor({ value, onChange }: MarkdownEditorProps) {
  const { t } = useTranslation();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { addNotification } = useNotification();

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [triggerStart, setTriggerStart] = useState(-1);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, lineHeight: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [paletteTriggerStart, setPaletteTriggerStart] = useState(-1);
  const [ontologyFilter, setOntologyFilter] = useState<string | null>(null);

  const { data: pagesData, isFetching: isFetchingPages } = useQuery({
    queryKey: ['pages-list'],
    queryFn: () => api.getPages(),
    enabled: isOpen,
    staleTime: 60_000
  });

  const { data: ontologyData } = useQuery({
    queryKey: ['ontology-classes'],
    queryFn: () => api.getOntologyClasses(),
    staleTime: 300_000
  });

  const ontologyClasses: string[] = (() => {
    const classes = ontologyData?.classes?.map((c: any) => c.name) || [];
    // Also collect unique types from pages
    const pageTypes = new Set<string>();
    (pagesData?.items || []).forEach((p: any) => {
      if (p.type) pageTypes.add(p.type);
    });
    const merged = new Set([...classes, ...pageTypes]);
    return Array.from(merged).sort();
  })();

  const wikilinkSuggestions: WikilinkSuggestion[] = (() => {
    const pages = pagesData?.items ?? [];
    let items = pages.map(p => ({ slug: p.slug, title: p.title, type: p.type }));
    if (query) {
      const lowerQuery = query.toLowerCase();
      items = items.filter(p => p.slug.toLowerCase().includes(lowerQuery) || p.title.toLowerCase().includes(lowerQuery));
    }
    if (ontologyFilter) {
      items = items.filter(p => p.type === ontologyFilter);
    }
    return items;
  })();

  const calculateSHA256 = useCallback(async (file: File): Promise<string> => {
    const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const fileReader = new FileReader();
      fileReader.onload = () => resolve(fileReader.result as ArrayBuffer);
      fileReader.onerror = () => reject(fileReader.error);
      fileReader.readAsArrayBuffer(file);
    });
    
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }, []);

  const isValidFileType = useCallback((file: File): boolean => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext && ALLOWED_EXTENSIONS.includes(ext)) return true;
    
    const allowedMimeTypes = Object.values(ALLOWED_FILE_TYPES).flat();
    return allowedMimeTypes.includes(file.type);
  }, []);

  const isImageFile = useCallback((file: File): boolean => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext && ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'].includes(ext)) return true;
    return ALLOWED_FILE_TYPES.image.includes(file.type);
  }, []);

  const handleFileUpload = useCallback(async (file: File) => {
    if (!isValidFileType(file)) {
      alert(t('editor.unsupportedFileType'));
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      setUploadProgress(10);
      const sha256 = await calculateSHA256(file);
      setUploadProgress(30);

      const result = await api.ingestFile(file, sha256);
      setUploadProgress(100);

      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const fileName = file.name;
      const isImage = isImageFile(file);
      
      let insertText: string;
      let cursorOffset: number;
      
      if (isImage) {
        insertText = `![描述](library://sha256-${sha256})`;
        cursorOffset = start + 2;
      } else {
        insertText = `[${fileName}](library://sha256-${sha256})`;
        cursorOffset = start + fileName.length + 1;
      }

      const newValue = value.slice(0, start) + insertText + value.slice(start);
      onChange(newValue);

      requestAnimationFrame(() => {
        textarea.focus();
        if (isImage) {
          textarea.setSelectionRange(cursorOffset, cursorOffset + 2);
        } else {
          textarea.setSelectionRange(cursorOffset, cursorOffset);
        }
      });

      addNotification({
        type: 'system',
        title: t('editor.uploadSuccess'),
        description: t('editor.uploadSuccessDesc', { name: fileName })
      });
    } catch (error) {
      console.error('Upload failed:', error);
      addNotification({
        type: 'system',
        title: t('editor.uploadFailed'),
        description: t('editor.uploadFailedDesc')
      });
    } finally {
      setIsUploading(false);
      if (uploadTimerRef.current) clearTimeout(uploadTimerRef.current);
      uploadTimerRef.current = setTimeout(() => setUploadProgress(0), 500);
    }
  }, [calculateSHA256, isValidFileType, isImageFile, value, onChange, addNotification, t]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileUpload(files[0]);
    }
  }, [handleFileUpload]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          handleFileUpload(file);
          break;
        }
      }
    }
  }, [handleFileUpload]);

  const closeAutocomplete = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    setSelectedIndex(0);
    setTriggerStart(-1);
  }, []);

  const closePalette = useCallback(() => {
    setIsPaletteOpen(false);
    setPaletteTriggerStart(-1);
  }, []);

  const insertSnippetContent = useCallback((content: string) => {
    const textarea = textareaRef.current;
    if (!textarea || paletteTriggerStart < 0) return;

    const before = value.slice(0, paletteTriggerStart);
    const after = value.slice(textarea.selectionStart);
    const newValue = `${before}${content}${after}`;

    onChange(newValue);
    closePalette();

    requestAnimationFrame(() => {
      textarea.focus();
      const newCursorPos = paletteTriggerStart + content.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    });
  }, [value, onChange, paletteTriggerStart, closePalette]);

  const updateDropdownPosition = useCallback((textarea: HTMLTextAreaElement, cursorPos: number) => {
    setDropdownPos(getCursorPixelPosition(textarea, cursorPos));
  }, []);

  const insertWikilink = useCallback((item: WikilinkSuggestion) => {
    const textarea = textareaRef.current;
    if (!textarea || triggerStart < 0) return;

    const insertText = query ? item.slug : item.slug;

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

    if (isPaletteOpen && paletteTriggerStart >= 0) {
      if (newValue[paletteTriggerStart] !== '/') {
        closePalette();
        return;
      }
      return;
    }

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

    if (cursorPos >= 1 && newValue[cursorPos - 1] === '/') {
      const prevChar = cursorPos >= 2 ? newValue[cursorPos - 2] : '';
      if (prevChar === '' || prevChar === '\n' || prevChar === ' ' || prevChar === '\t') {
        setIsPaletteOpen(true);
        setPaletteTriggerStart(cursorPos - 1);
      }
    }
  }, [isOpen, triggerStart, isPaletteOpen, paletteTriggerStart, onChange, closeAutocomplete, closePalette, updateDropdownPosition]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (isPaletteOpen) {
      return;
    }

    if (!isOpen) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (wikilinkSuggestions.length > 0 ? (prev + 1) % wikilinkSuggestions.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (wikilinkSuggestions.length > 0 ? (prev - 1 + wikilinkSuggestions.length) % wikilinkSuggestions.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (wikilinkSuggestions[selectedIndex]) {
        insertWikilink(wikilinkSuggestions[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeAutocomplete();
    }
  }, [isOpen, isPaletteOpen, wikilinkSuggestions, selectedIndex, insertWikilink, closeAutocomplete]);

  const handleScroll = useCallback(() => {
    if (isOpen && textareaRef.current) {
      const cursorPos = textareaRef.current.selectionStart;
      updateDropdownPosition(textareaRef.current, cursorPos);
    }
  }, [isOpen, updateDropdownPosition]);

  const handleBlur = useCallback(() => {
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    blurTimerRef.current = setTimeout(() => {
      closeAutocomplete();
    }, 150);
  }, [closeAutocomplete]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.addEventListener('scroll', handleScroll);
    return () => textarea.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // 组件卸载时清理定时器
  useEffect(() => {
    return () => {
      if (uploadTimerRef.current) clearTimeout(uploadTimerRef.current);
      if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    };
  }, []);

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
    { icon: LinkIcon, label: 'Link', action: () => wrapSelection('[', '](url)') },
    { icon: Upload, label: 'Upload', action: () => fileInputRef.current?.click() }
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

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.pdf,.doc,.docx,.md,.txt,.json"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileUpload(file);
        }}
        className="hidden"
      />

      {/* Textarea wrapper */}
      <div 
        className={`relative rounded-lg border-2 transition-all duration-200 ${
          isDragging 
            ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' 
            : 'border-slate-200 dark:border-slate-700'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDragging && (
          <div className="absolute inset-0 flex items-center justify-center bg-primary-500/10 rounded-lg pointer-events-none z-10">
            <div className="flex flex-col items-center gap-2 text-primary-600 dark:text-primary-400">
              <Upload size={32} />
              <span className="font-medium">{t('editor.dropToUpload')}</span>
            </div>
          </div>
        )}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          onPaste={handlePaste}
          className="input min-h-[60vh] w-full resize-y font-mono text-sm leading-6 border-none rounded-lg"
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
            {isFetchingPages && wikilinkSuggestions.length === 0 && (
              <div className="flex items-center gap-2 px-3 py-2.5 text-sm text-slate-500 dark:text-slate-400">
                <Spinner size={14} className="animate-spin" />
                {t('editor.searching')}
              </div>
            )}

            {!isFetchingPages && wikilinkSuggestions.length === 0 && query.length > 0 && (
              <div className="px-3 py-2.5 text-sm text-slate-500 dark:text-slate-400">
                {t('editor.noMatch')}
              </div>
            )}

            {wikilinkSuggestions.length > 0 && (
              <ul className="max-h-64 overflow-auto py-1">
                {/* Ontology class filter */}
                {ontologyClasses.length > 0 && (
                  <li className="px-2 py-1 border-b border-slate-100 dark:border-slate-700">
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        onMouseDown={e => { e.preventDefault(); setOntologyFilter(null); }}
                        className={`px-1.5 py-0.5 text-xs rounded ${
                          ontologyFilter === null
                            ? 'bg-primary-100 text-primary-700 dark:bg-primary-800 dark:text-primary-200'
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-400'
                        }`}
                      >
                        全部
                      </button>
                      {ontologyClasses.map(cls => (
                        <button
                          key={cls}
                          type="button"
                          onMouseDown={e => { e.preventDefault(); setOntologyFilter(cls); }}
                          className={`px-1.5 py-0.5 text-xs rounded ${
                            ontologyFilter === cls
                              ? 'ring-1 ring-offset-0'
                              : 'opacity-60 hover:opacity-100'
                          }`}
                          style={{
                            backgroundColor: (ONTOLOGY_COLORS[cls] || ONTOLOGY_COLORS.default) + '20',
                            color: ONTOLOGY_COLORS[cls] || ONTOLOGY_COLORS.default,
                          }}
                        >
                          {cls}
                        </button>
                      ))}
                    </div>
                  </li>
                )}
                {wikilinkSuggestions.map((item, idx) => {
                  const isSelected = idx === selectedIndex;
                  const typeColor = ONTOLOGY_COLORS[item.type || ''] || ONTOLOGY_COLORS.default;
                  return (
                    <li key={item.slug}>
                      <button
                        type="button"
                        onMouseDown={e => {
                          e.preventDefault();
                          insertWikilink(item);
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
                            {item.type && (
                              <span
                                className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
                                style={{ backgroundColor: typeColor }}
                                title={item.type}
                              />
                            )}
                            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                              <HighlightText text={item.title} keyword={query} />
                            </span>
                            <span className="text-xs text-slate-400 font-mono">
                              {item.slug}
                            </span>
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {isUploading && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-200 dark:bg-slate-700 rounded-b-lg">
            <div 
              className="h-full bg-primary-500 transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        )}
      </div>

      <CommandPalette
        isOpen={isPaletteOpen}
        onClose={closePalette}
        onInsert={insertSnippetContent}
        triggerStart={paletteTriggerStart}
      />
    </div>
  );
}
