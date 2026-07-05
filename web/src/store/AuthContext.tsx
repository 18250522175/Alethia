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

  // 监听 Token 过期事件（后端返回 401 时触发）
  useEffect(() => {
    const handleAuthExpired = () => {
      setTokenState(null);
      setIsAuthenticated(false);
    };
    window.addEventListener('auth:expired', handleAuthExpired);
    return () => window.removeEventListener('auth:expired', handleAuthExpired);
  }, []);

  const login = async (apiKey: string, remember: boolean = true) => {
    const result = await api.login(apiKey);
    if (result.success && result.token) {
      api.setToken(result.token, remember);
      setTokenState(result.token);
      setIsAuthenticated(true);
    } else {
      throw new Error('登录失败：API 密钥无效');
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
