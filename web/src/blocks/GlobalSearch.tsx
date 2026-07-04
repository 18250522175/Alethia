import { useState, KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { MagnifyingGlass, X } from '@phosphor-icons/react';

interface GlobalSearchProps {
  onSearch: (query: string) => void;
  placeholder?: string;
}

export default function GlobalSearch({ onSearch, placeholder }: GlobalSearchProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && value.trim()) {
      onSearch(value.trim());
    }
  };

  const handleClear = () => {
    setValue('');
    onSearch('');
  };

  return (
    <div className="relative w-full">
      <MagnifyingGlass
        size={18}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
      />
      <input
        type="text"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder ?? t('home.searchPlaceholder')}
        className="input pl-10 pr-9"
      />
      {value && (
        <button
          onClick={handleClear}
          aria-label={t('common.close')}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
