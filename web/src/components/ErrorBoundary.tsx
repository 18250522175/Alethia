import { Component, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Warning, WarningCircle, ArrowLeft, House } from '@phosphor-icons/react';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

class ErrorBoundaryCore extends Component<{
  children: ReactNode;
  onNavigate: (path: string) => void;
}> {
  state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleGoHome = () => {
    this.handleReset();
    this.props.onNavigate('/');
  };

  handleGoBack = () => {
    this.handleReset();
    window.history.back();
  };

  render() {
    if (this.state.hasError) {
      return <ErrorFallbackUI
        error={this.state.error}
        onHome={this.handleGoHome}
        onBack={this.handleGoBack}
        onRetry={this.handleReset}
      />;
    }
    return this.props.children;
  }
}

function ErrorFallbackUI({ error, onHome, onBack, onRetry }: {
  error: Error | null;
  onHome: () => void;
  onBack: () => void;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="card mx-auto max-w-lg p-8 text-center">
        <div className="mb-4 inline-flex items-center justify-center rounded-full bg-red-100 p-3 dark:bg-red-900/30">
          <Warning size={32} className="text-red-500" />
        </div>
        <h2 className="mb-2 text-xl font-semibold text-slate-800 dark:text-slate-100">
          {t('errorBoundary.title', '页面发生错误')}
        </h2>
        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
          {t('errorBoundary.description', '应用遇到了一个意外错误，请尝试刷新页面或返回首页。')}
        </p>

        {error && (
          <details className="mb-4 text-left">
            <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300">
              <WarningCircle size={14} className="inline mr-1" />
              {t('errorBoundary.errorDetails', '错误详情')}
            </summary>
            <pre className="mt-2 max-h-32 overflow-auto rounded-lg bg-slate-100 p-3 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              {error.message}
              {error.stack}
            </pre>
          </details>
        )}

        <div className="flex items-center justify-center gap-3">
          <button onClick={onBack} className="btn btn-secondary">
            <ArrowLeft size={14} className="mr-1" />
            {t('errorBoundary.back', '返回上一页')}
          </button>
          <button onClick={onRetry} className="btn btn-primary">
            {t('errorBoundary.retry', '重试')}
          </button>
          <button onClick={onHome} className="btn btn-secondary">
            <House size={14} className="mr-1" />
            {t('errorBoundary.home', '返回首页')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ErrorBoundary({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  return <ErrorBoundaryCore onNavigate={navigate}>{children}</ErrorBoundaryCore>;
}