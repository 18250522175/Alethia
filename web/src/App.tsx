import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import { NotificationProvider } from './contexts/NotificationContext';
import Shell from './layouts/Shell';
import { queryClient } from './lib/query';
import ChangelogPage from './routes/ChangelogPage';
import DashboardPage from './routes/DashboardPage';
import DiffReviewPage from './routes/DiffReviewPage';
import EvalReportPage from './routes/EvalReportPage';
import GraphFullPage from './routes/GraphFullPage';
import LibraryFilePage from './routes/LibraryFilePage';
import LoginPage from './routes/LoginPage';
import NotificationsPage from './routes/NotificationsPage';
import OnboardingPage from './routes/OnboardingPage';
import QAPanelPage from './routes/QAPanelPage';
import SearchResultPage from './routes/SearchResultPage';
import SettingsPage from './routes/SettingsPage';
import TimelineFullPage from './routes/TimelineFullPage';
import WikiEntryPage from './routes/WikiEntryPage';
import WikiHomePage from './routes/WikiHomePage';
import { AuthProvider, useAuth } from './store/AuthContext';
import { SettingsProvider } from './store/SettingsContext';
import { ThemeProvider } from './store/ThemeContext';

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
        <Route path="timeline" element={<TimelineFullPage />} />
        <Route path="search" element={<SearchResultPage />} />
        <Route path="library" element={<LibraryFilePage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <ErrorBoundary>
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
    </ErrorBoundary>
  );
}

export default App;
