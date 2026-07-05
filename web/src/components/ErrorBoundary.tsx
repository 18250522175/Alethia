import { Component, ErrorInfo, ReactNode } from 'react';
import { Warning, ArrowClockwise, House } from '@phosphor-icons/react';
import { withTranslation, WithTranslation } from 'react-i18next';

interface Props extends WithTranslation {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const { t } = this.props;

      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 dark:bg-slate-900">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-lg dark:border-slate-700 dark:bg-slate-800">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
              <Warning size={32} className="text-red-500 dark:text-red-400" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              {t('errorBoundary.title', '页面出错了')}
            </h1>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              {t('errorBoundary.description', '很抱歉，页面在渲染时遇到了意外错误。你可以尝试刷新页面，或返回首页继续使用。')}
            </p>
            {this.state.error && (
              <div className="mt-4 rounded-lg bg-slate-100 p-3 text-left text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                <p className="font-mono">{this.state.error.message}</p>
              </div>
            )}
            <div className="mt-6 flex gap-3">
              <button
                onClick={this.handleReload}
                className="btn btn-primary flex-1"
              >
                <ArrowClockwise size={16} className="mr-1.5" />
                {t('errorBoundary.reload', '刷新页面')}
              </button>
              <button
                onClick={this.handleGoHome}
                className="btn btn-secondary flex-1"
              >
                <House size={16} className="mr-1.5" />
                {t('errorBoundary.goHome', '返回首页')}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default withTranslation()(ErrorBoundary);
