import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash, Copy, Eye, Plus } from '@phosphor-icons/react';
import api from '../../lib/api';

interface ViewManagerProps {
  visible: boolean;
  onClose: () => void;
  onLoadView: (viewId: string) => void;
  onSaveView: (saveName: string) => void;
}

export default function ViewManager({ visible, onClose, onLoadView, onSaveView }: ViewManagerProps) {
  const [saveName, setSaveName] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['views'],
    queryFn: () => api.listViews(),
    enabled: visible,
  });

  const deleteMutation = useMutation({
    mutationFn: (viewId: string) => api.deleteView(viewId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['views'] }),
  });

  const handleSave = async () => {
    if (!saveName.trim()) return;
    onSaveView(saveName);
    setSaveName('');
    setShowSaveInput(false);
  };

  const handleCopyJSON = async (viewId: string) => {
    const view = await api.loadView(viewId);
    await navigator.clipboard.writeText(JSON.stringify(view, null, 2));
    alert('视图 JSON 已复制到剪贴板');
  };

  if (!visible) return null;

  return (
    <div className="absolute right-0 top-0 h-full w-80 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-700 shadow-lg z-30 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
        <h3 className="font-semibold text-slate-800 dark:text-slate-200">视图管理器</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
          ✕
        </button>
      </div>

      {/* Save section */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700">
        {showSaveInput ? (
          <div className="flex gap-2">
            <input
              type="text"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="视图名称..."
              className="flex-1 px-2 py-1 text-sm border rounded dark:bg-slate-800 dark:border-slate-600"
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            />
            <button
              onClick={handleSave}
              disabled={!saveName.trim()}
              className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
            >
              保存
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowSaveInput(true)}
            className="flex items-center gap-2 text-sm text-blue-500 hover:text-blue-600 dark:text-blue-400"
          >
            <Plus size={16} /> 保存当前视图
          </button>
        )}
      </div>

      {/* View list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="p-4 text-center text-slate-500 text-sm">加载中...</div>
        )}
        {error && (
          <div className="p-4 text-center text-red-500 text-sm">加载失败</div>
        )}
        {data?.views?.length === 0 && (
          <div className="p-4 text-center text-slate-400 text-sm">暂无保存的视图</div>
        )}
        {data?.views?.map((view: any) => (
          <div
            key={view.view_id}
            className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">
                  {view.user_label || view.view_id}
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  {view.node_count ?? 0} 个节点 · {new Date(view.updated_at || view.created_at).toLocaleDateString('zh-CN')}
                </div>
              </div>
              <div className="flex gap-1 ml-2">
                <button
                  onClick={() => onLoadView(view.view_id)}
                  className="p-1 text-slate-400 hover:text-blue-500"
                  title="加载视图"
                >
                  <Eye size={14} />
                </button>
                <button
                  onClick={() => handleCopyJSON(view.view_id)}
                  className="p-1 text-slate-400 hover:text-green-500"
                  title="复制 JSON"
                >
                  <Copy size={14} />
                </button>
                <button
                  onClick={() => deleteMutation.mutate(view.view_id)}
                  className="p-1 text-slate-400 hover:text-red-500"
                  title="删除"
                >
                  <Trash size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}