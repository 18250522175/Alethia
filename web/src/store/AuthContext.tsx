import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import api from '../lib/api';

interface AuthContextType {
  isAuthenticated: boolean;
  token: string | null;
  login: (apiKey: string, remember?: boolean) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(() => api.isAuthenticated());
  const [token, setTokenState] = useState<string | null>(() => api.getToken());

  const login = async (apiKey: string, remember: boolean = true) => {
    const result = await api.login(apiKey);
    if (result.success) {
      api.setToken(apiKey, remember);
      setTokenState(apiKey);
      setIsAuthenticated(true);
    }
  };

  const logout = () => {
    api.clearToken();
    setTokenState(null);
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
