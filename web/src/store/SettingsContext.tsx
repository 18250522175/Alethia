import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Settings } from '@shared/settings';
import api from '../lib/api';

interface SettingsContextType {
  settings: Settings | undefined;
  isLoading: boolean;
  error: Error | null;
  updateSettings: (settings: Partial<Settings>) => Promise<void>;
  refetch: () => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const result = await api.getSettings();
      return result.settings;
    },
    staleTime: 5 * 60 * 1000
  });

  useEffect(() => {
    if (!data) return;
    const root = document.documentElement;
    const fontSize = data.appearance?.fontSize || 'medium';
    const density = data.appearance?.density || 'comfortable';
    const accentColor = data.appearance?.accentColor || 'blue';

    const fontSizeMap: Record<string, string> = {
      small: '0.9rem',
      medium: '1rem',
      large: '1.1rem'
    };

    const densityMap: Record<string, string> = {
      compact: '0.875',
      comfortable: '1',
      spacious: '1.125'
    };

    const accentColorMap: Record<string, string> = {
      blue: '#6366f1',
      purple: '#a855f7',
      green: '#22c55e',
      orange: '#f97316',
      pink: '#ec4899'
    };

    root.style.setProperty('--font-size-base', fontSizeMap[fontSize]);
    root.style.setProperty('--density', densityMap[density]);
    root.style.setProperty('--accent-color', accentColorMap[accentColor]);
  }, [data]);

  const mutation = useMutation({
    mutationFn: async (newSettings: Partial<Settings>) => {
      const result = await api.updateSettings(newSettings);
      return result.settings;
    },
    onSuccess: (newSettings) => {
      queryClient.setQueryData(['settings'], newSettings);
      queryClient.invalidateQueries({ queryKey: ['budget'], exact: false });
    }
  });

  const updateSettings = async (newSettings: Partial<Settings>) => {
    await mutation.mutateAsync(newSettings);
  };

  return (
    <SettingsContext.Provider value={{
      settings: data,
      isLoading,
      error: error as Error | null,
      updateSettings,
      refetch
    }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
