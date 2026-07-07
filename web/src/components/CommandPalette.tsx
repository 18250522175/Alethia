import { useState, useEffect, useCallback, useRef } from 'react';
import { MagnifyingGlass, X, ArrowRight, Calendar, FileText } from '@phosphor-icons/react';
import api from '../lib/api';
import HighlightText from './HighlightText';

interface Snippet {
  name: string;
  trigger: string;
  description: string;
  category: string;
  content?: string;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (content: string) => void;
  triggerStart: number;
}

function fuzzyMatch(text: string, query: string): boolean {
  if (!query) return true;
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  let queryIndex = 0;
  for (let i = 0; i < lowerText.length && queryIndex < lowerQuery.length; i++) {
    if (lowerText[i] === lowerQuery[queryIndex]) {
      queryIndex++;
    }
  }
  return queryIndex === lowerQuery.length;
}

function groupByCategory(snippets: Snippet[]): Record<string, Snippet[]> {
  return snippets.reduce((acc, snippet) => {
    const category = snippet.category || '未分类';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(snippet);
    return acc;
  }, {} as Record<string, Snippet[]>);
}

function extractVariables(content: string): string[] {
  const regex = /\{\{(\w+)\}\}/g;
  const variables: string[] = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    if (!variables.includes(match[1])) {
      variables.push(match[1]);
    }
  }
  return variables;
}

function replaceVariables(content: string, variables: Record<string, string>): string {
  let result = content;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return result;
}

export default function CommandPalette({ isOpen, onClose, onInsert, triggerStart }: CommandPaletteProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedSnippet, setSelectedSnippet] = useState<Snippet | null>(null);
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [variableInputs, setVariableInputs] = useState<Record<string, HTMLInputElement | null>>({});
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      api.listSnippets().then(data => {
        setSnippets(data.items);
      }).catch(() => {
        setSnippets([]);
      });
      setSearchQuery('');
      setSelectedIndex(0);
      setSelectedSnippet(null);
      setVariables({});
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  const filteredSnippets = snippets.filter(snippet =>
    fuzzyMatch(snippet.name, searchQuery) ||
    fuzzyMatch(snippet.description, searchQuery) ||
    fuzzyMatch(snippet.trigger, searchQuery)
  );

  const groupedSnippets = groupByCategory(filteredSnippets);
  const flatList = filteredSnippets;

  const handleSelectSnippet = useCallback(async (snippet: Snippet) => {
    try {
      const data = await api.getSnippet(snippet.name);
      const vars = extractVariables(data.content);
      
      if (vars.length === 0) {
        onInsert(data.content);
        onClose();
        return;
      }

      const initialVariables: Record<string, string> = {};
      vars.forEach(v => {
        if (v === 'date') {
          initialVariables[v] = new Date().toISOString().split('T')[0];
        } else {
          initialVariables[v] = '';
        }
      });

      setSelectedSnippet({ ...data });
      setVariables(initialVariables);
      setSelectedIndex(0);
    } catch {
      onClose();
    }
  }, [onInsert, onClose]);

  const handleInsert = useCallback(() => {
    if (!selectedSnippet?.content) return;
    const finalContent = replaceVariables(selectedSnippet.content, variables);
    onInsert(finalContent);
    onClose();
  }, [selectedSnippet, variables, onInsert, onClose]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isOpen) return;

    if (selectedSnippet) {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleInsert();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setSelectedSnippet(null);
        setSelectedIndex(0);
        searchInputRef.current?.focus();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        const varKeys = Object.keys(variables);
        const currentIndex = varKeys.findIndex(key => 
          variableInputs[key] === document.activeElement
        );
        const nextIndex = (currentIndex + 1) % varKeys.length;
        variableInputs[varKeys[nextIndex]]?.focus();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => 
        flatList.length > 0 ? (prev + 1) % flatList.length : 0
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => 
        flatList.length > 0 ? (prev - 1 + flatList.length) % flatList.length : 0
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (flatList[selectedIndex]) {
        handleSelectSnippet(flatList[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }, [isOpen, selectedSnippet, flatList, selectedIndex, handleSelectSnippet, handleInsert, onClose, variables, variableInputs]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-start justify-center pt-24"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      
      <div 
        className="relative w-full max-w-xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-800"
        onClick={e => e.stopPropagation()}
      >
        {!selectedSnippet ? (
          <>
            <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
              <MagnifyingGlass className="text-slate-400" size={20} />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={e => {
                  setSearchQuery(e.target.value);
                  setSelectedIndex(0);
                }}
                placeholder="搜索模板片段..."
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400 dark:text-slate-100"
              />
              <button
                onClick={onClose}
                className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
              >
                <X size={18} />
              </button>
            </div>

            <div className="max-h-[50vh] overflow-auto">
              {flatList.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-500 dark:text-slate-400">
                  <FileText size={48} className="mb-3 opacity-50" />
                  <div className="text-sm">无匹配的模板片段</div>
                  <div className="mt-1 text-xs">尝试其他关键词</div>
                </div>
              ) : (
                Object.entries(groupedSnippets).map(([category, items]) => (
                  <div key={category}>
                    <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      {category}
                    </div>
                    <ul>
                      {items.map((snippet, idx) => {
                        const globalIdx = flatList.indexOf(snippet);
                        const isSelected = globalIdx === selectedIndex;
                        return (
                          <li key={snippet.name}>
                            <button
                              type="button"
                              onClick={() => handleSelectSnippet(snippet)}
                              className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                                isSelected
                                  ? 'bg-primary-50 dark:bg-primary-900/30'
                                  : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'
                              }`}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-slate-800 dark:text-slate-100">
                                  <HighlightText text={snippet.name} keyword={searchQuery} />
                                </div>
                                {snippet.description && (
                                  <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 truncate">
                                    {snippet.description}
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-400">/{snippet.trigger}</span>
                                <ArrowRight size={16} className="text-slate-300" />
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))
              )}
            </div>

            <div className="border-t border-slate-200 px-4 py-2 text-xs text-slate-400 dark:border-slate-700">
              <span className="mr-4">↑↓ 选择</span>
              <span className="mr-4">↵ 确认</span>
              <span>Esc 关闭</span>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
              <button
                onClick={() => {
                  setSelectedSnippet(null);
                  setSelectedIndex(0);
                  searchInputRef.current?.focus();
                }}
                className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
              >
                <X size={18} />
              </button>
              <div className="flex-1">
                <div className="text-sm font-medium text-slate-800 dark:text-slate-100">
                  {selectedSnippet.name}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {selectedSnippet.category}
                </div>
              </div>
              <button
                onClick={handleInsert}
                className="rounded-md bg-primary-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-700"
              >
                插入
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
                  模板预览
                </div>
                <pre className="text-xs font-mono text-slate-600 dark:text-slate-300 whitespace-pre-wrap max-h-32 overflow-auto">
                  {replaceVariables(selectedSnippet.content || '', variables)}
                </pre>
              </div>

              <div className="space-y-3">
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  变量设置
                </div>
                {Object.keys(variables).map((key, idx) => (
                  <div key={key}>
                    <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">
                      {key}
                      {key === 'date' && (
                        <span className="ml-1.5 flex items-center gap-0.5 text-slate-400">
                          <Calendar size={10} />
                          自动填充
                        </span>
                      )}
                    </label>
                    <input
                      ref={el => {
                        const inputs = { ...variableInputs };
                        inputs[key] = el;
                        setVariableInputs(inputs);
                      }}
                      type="text"
                      value={variables[key]}
                      onChange={e => {
                        setVariables(prev => ({
                          ...prev,
                          [key]: e.target.value
                        }));
                      }}
                      autoFocus={idx === 0}
                      className="input w-full text-sm"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-slate-200 px-4 py-2 text-xs text-slate-400 dark:border-slate-700">
              <span className="mr-4">Tab 切换输入</span>
              <span className="mr-4">↵ 确认插入</span>
              <span>Esc 返回列表</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

