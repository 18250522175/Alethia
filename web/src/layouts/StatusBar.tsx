import { CheckCircle, Clock } from '@phosphor-icons/react';

export default function StatusBar() {
  return (
    <footer className="flex h-8 items-center justify-between border-t border-slate-200 bg-white px-4 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-green-500"></span>
          服务正常
        </span>
        <span className="flex items-center gap-1">
          <Clock size={12} />
          最后更新：10 分钟前
        </span>
      </div>
      <div className="flex items-center gap-4">
        <span>v5.0.0</span>
      </div>
    </footer>
  );
}
