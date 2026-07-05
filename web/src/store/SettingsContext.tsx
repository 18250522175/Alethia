import type { Settings } from '@shared/settings';
import type { ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext } from 'react';
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

  const mutation = useMutation({
    mutationFn: async (newSettings: Partial<Settings>) => {
      const result = await api.updateSettings(newSettings);
      return result.settings;
    },
    onSuccess: (newSettings) => {
      queryClient.setQueryData(['settings'], newSettings);
    }
  });

  const updateSettings = async (newSettings: Partial<Settings>) => {
    await mutation.mutateAsync(newSettings);
  };

  return (
    <SettingsContext.Provider
      value={{
        settings: data,
        isLoading,
        error: error as Error | null,
        updateSettings,
        refetch
      }}
    >
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
