import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/query';
import { AuthProvider, useAuth } from './store/AuthContext';
import { ThemeProvider } from './store/ThemeContext';
import { SettingsProvider } from './store/SettingsContext';
import { NotificationProvider } from './contexts/NotificationContext';
import Shell from './layouts/Shell';
import LoginPage from './routes/LoginPage';
import WikiHomePage from './routes/WikiHomePage';
import SettingsPage from './routes/SettingsPage';
import QAPanelPage from './routes/QAPanelPage';
import DiffReviewPage from './routes/DiffReviewPage';
import GraphFullPage from './routes/GraphFullPage';
import DashboardPage from './routes/DashboardPage';
import WikiEntryPage from './routes/WikiEntryPage';
import OnboardingPage from './routes/OnboardingPage';
import ChangelogPage from './routes/ChangelogPage';
import EvalReportPage from './routes/EvalReportPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  const onboarded = localStorage.getItem('onboarding_completed');
  if (!onboarded && window.location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/onboarding" element={<OnboardingPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Shell />
          </ProtectedRoute>
        }
      >
        <Route index element={<WikiHomePage />} />
        <Route path="wiki/:slug" element={<WikiEntryPage />} />
        <Route path="qa" element={<QAPanelPage />} />
        <Route path="qa/:conversationId" element={<QAPanelPage />} />
        <Route path="graph" element={<GraphFullPage />} />
        <Route path="review" element={<DiffReviewPage />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="settings/:section" element={<SettingsPage />} />
        <Route path="changelog" element={<ChangelogPage />} />
        <Route path="eval-report" element={<EvalReportPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <SettingsProvider>
            <NotificationProvider>
              <BrowserRouter>
                <AppRoutes />
              </BrowserRouter>
            </NotificationProvider>
          </SettingsProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
