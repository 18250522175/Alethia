import { useState, useCallback } from 'react';
import { ArrowRight, Spinner } from '@phosphor-icons/react';
import api from '../../lib/api';

interface IntentBarProps {
  onOperations: (operations: Array<{
    type: string;
    target: string[];
    params?: Record<string, any>;
  }>) => void;
  allNodes: string[];
  selectedNodes: string[];
}

export default function IntentBar({ onOperations, allNodes, selectedNodes }: IntentBarProps) {
  const [command, setCommand] = useState('');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  const handleSubmit = useCallback(async () => {
    if (!command.trim() || loading) return;

    setLoading(true);
    setFeedback(null);

    try {
      const result = await api.postNlCommand(command, {
        nodes: allNodes,
        selectedNodes,
      });

      if (result.operations && result.operations.length > 0) {
        onOperations(result.operations);
        setFeedback({ text: result.explanation || '操作已执行', type: 'success' });
      } else {
        setFeedback({ text: result.explanation || '未能识别有效操作', type: 'info' });
      }

      setCommand('');
    } catch (err) {
      setFeedback({
        text: '意图解析失败，请尝试更具体的描述',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }

    // Clear feedback after 5 seconds
    setTimeout(() => setFeedback(null), 5000);
  }, [command, loading, allNodes, selectedNodes, onOperations]);

  const examples = [
    '把A和B打包成"风险模块"',
    '展开运营效率',
    '透视客户满意度',
    '只显示因果边',
  ];

  return (
    <div className="absolute bottom-4 left-4 right-4 z-20">
      {/* Feedback toast */}
      {feedback && (
        <div
          className={`mb-2 px-4 py-2 rounded-lg text-sm ${
            feedback.type === 'success'
              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
              : feedback.type === 'error'
              ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
              : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* Command input */}
      <div className="flex items-center gap-2 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 p-2">
        <input
          type="text"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder="输入自然语言指令操控视图..."
          disabled={loading}
          className="flex-1 px-3 py-2 text-sm bg-transparent border-none outline-none text-slate-700 dark:text-slate-300 placeholder-slate-400"
        />
        <button
          onClick={handleSubmit}
          disabled={loading || !command.trim()}
          className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? <Spinner size={16} className="animate-spin" /> : <ArrowRight size={16} />}
        </button>
      </div>

      {/* Examples */}
      <div className="flex gap-2 mt-2 flex-wrap">
        {examples.map((example, i) => (
          <button
            key={i}
            onClick={() => setCommand(example)}
            className="px-2 py-1 text-xs bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded hover:bg-slate-200 dark:hover:bg-slate-700"
          >
            {example}
          </button>
        ))}
        <span className="text-xs text-slate-400 self-center ml-auto">
          Enter 提交 · Shift+Enter 换行
        </span>
      </div>
    </div>
  );
}