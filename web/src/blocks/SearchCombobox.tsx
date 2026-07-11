import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MagnifyingGlass, X, Command, FileText, Graph, ChatsCircle, Hash, Compass } from '@phosphor-icons/react';
import { Combobox, ComboboxInput, ComboboxOptions, ComboboxOption } from '@headlessui/react';
import api from '../lib/api';

interface SearchSuggestion {
  id: string;
  type: 'wiki' | 'qa' | 'graph' | 'file';
  title: string;
  description?: string;
  path: string;
  slug?: string;
}

function getTypeIcon(type: string) {
  switch (type) {
    case 'wiki':
      return <FileText size={16} className="text-blue-500" />;
    case 'qa':
      return <ChatsCircle size={16} className="text-purple-500" />;
    case 'graph':
      return <Graph size={16} className="text-indigo-500" />;
    case 'file':
      return <Hash size={16} className="text-cyan-500" />;
    default:
      return <MagnifyingGlass size={16} className="text-slate-400" />;
  }
}

export default function SearchCombobox() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchSuggestion[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const staticSuggestions = useMemo<SearchSuggestion[]>(() => [
    { id: 'graph', type: 'graph', title: t('search.graphTitle'), description: t('search.graphDesc'), path: '/graph' },
    { id: 'qa', type: 'qa', title: t('search.qaTitle'), description: t('search.qaDesc'), path: '/qa' },
    { id: 'review', type: 'file', title: t('search.reviewTitle'), description: t('search.reviewDesc'), path: '/review' },
    { id: 'dashboard', type: 'file', title: t('search.dashboardTitle'), description: t('search.dashboardDesc'), path: '/dashboard' },
  ], [t]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    
    if (query.trim().length >= 2) {
      debounceRef.current = setTimeout(async () => {
        try {
          const results = await api.searchEntities(query.trim(), 5);
          const suggestions: SearchSuggestion[] = (results.items || []).map((r: any) => ({
            id: r.id || r.slug || String(Math.random()),
            type: r.type === 'file' ? 'file' : 'wiki',
            title: r.title || r.name || '',
            description: r.snippet || r.description || '',
            path: r.type === 'file' ? `/library/${r.hash}` : `/wiki/${r.slug || r.id}`,
            slug: r.slug || r.id || '',
          }));
          setSearchResults(suggestions);
        } catch {
          setSearchResults([]);
        }
      }, 300);
    } else {
      setSearchResults([]);
    }
    
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  const filteredSuggestions = query === ''
    ? staticSuggestions
    : [...searchResults.slice(0, 5), ...staticSuggestions.filter(s =>
        s.title.toLowerCase().includes(query.toLowerCase()) ||
        s.description?.toLowerCase().includes(query.toLowerCase())
      )].slice(0, 8);

  const handleSelect = useCallback((suggestion: SearchSuggestion | null) => {
    if (suggestion) {
      navigate(suggestion.path);
      setQuery('');
      setOpen(false);
    } else if (query.trim()) {
      navigate(`/search?q=${encodeURIComponent(query.trim())}`);
      setQuery('');
      setOpen(false);
    }
  }, [navigate, query]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
      if (e.key === 'Escape') {
        setOpen(false);
        inputRef.current?.blur();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="relative w-full">
      <Combobox value={null} onChange={handleSelect} onClose={() => setOpen(false)}>
        <div className="relative">
          <MagnifyingGlass
            size={18}
            className="absolute left-3 top-1/2 z-10 -translate-y-1/2 text-slate-400"
          />
          <ComboboxInput
            ref={inputRef}
            value={query}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
              if (e.key === 'Enter' && !open) {
                setOpen(true);
              }
            }}
            placeholder={t('home.searchPlaceholder', '搜索知识、文档、问答记录...')}
            className="input w-full pl-10 pr-20"
          />
          <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  inputRef.current?.focus();
                }}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200"
              >
                <X size={14} />
              </button>
            )}
            <div className="flex items-center gap-0.5 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-400">
              <Command size={10} />
              <span>K</span>
            </div>
          </div>
        </div>

        {open && filteredSuggestions.length > 0 && (
          <ComboboxOptions
            hold
            static
            className="absolute left-0 right-0 z-50 mt-2 max-h-80 overflow-auto rounded-xl border border-slate-200 bg-white py-2 shadow-xl dark:border-slate-700 dark:bg-slate-800"
          >
            {filteredSuggestions.map((suggestion) => (
              <ComboboxOption
                key={suggestion.id}
                value={suggestion}
                className="group flex cursor-pointer items-center gap-3 px-3 py-2.5 data-[focus]:bg-slate-50 dark:data-[focus]:bg-slate-700/50"
              >
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-700">
                  {getTypeIcon(suggestion.type)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-slate-900 dark:text-white">
                    {suggestion.title}
                  </div>
                  {suggestion.description && (
                    <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                      {suggestion.description}
                    </div>
                  )}
                </div>
                {suggestion.slug && suggestion.type === 'wiki' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      navigate(`/cognitive-map?focus=${encodeURIComponent(suggestion.slug!)}`);
                      setQuery('');
                      setOpen(false);
                    }}
                    className="flex-shrink-0 rounded-md p-1.5 text-slate-400 opacity-0 group-hover:opacity-100 hover:bg-indigo-100 hover:text-indigo-600 dark:hover:bg-indigo-900/30 dark:hover:text-indigo-400 transition-all"
                    title="在认知地图中查看"
                  >
                    <Compass size={16} />
                  </button>
                )}
              </ComboboxOption>
            ))}
          </ComboboxOptions>
        )}
      </Combobox>
    </div>
  );
}
