import api from '../../lib/api';

interface CausalContextMenuProps {
  visible: boolean;
  x: number;
  y: number;
  isVirtualNode: boolean;
  multiSelected: boolean;
  viewId?: string;
  hyperNodeId?: string;
  onPackIntoNode: () => void;
  onUnpack: () => void;
  onTogglePerspective: () => void;
  onExpandKnowledgeGraph: () => void;
  onAddOntologyEntity?: () => void;
}

export default function CausalContextMenu({
  visible,
  x,
  y,
  isVirtualNode,
  multiSelected,
  viewId,
  hyperNodeId,
  onPackIntoNode,
  onUnpack,
  onTogglePerspective,
  onExpandKnowledgeGraph,
  onAddOntologyEntity,
}: CausalContextMenuProps) {
  if (!visible) return null;

  const menuWidth = 180;
  const menuHeight = isVirtualNode ? 200 : (multiSelected ? 140 : 100);
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const style: React.CSSProperties = {
    left: Math.max(0, Math.min(x, vw - menuWidth - 10)),
    top: Math.max(0, Math.min(y, vh - menuHeight - 10)),
  };

  return (
    <div
      className="absolute z-50 min-w-[180px] rounded-lg border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-slate-800 animate-fade-in"
      style={style}
      onClick={(e) => e.stopPropagation()}
    >
      {multiSelected && (
        <button
          onClick={onPackIntoNode}
          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          <span className="text-primary-500">📦</span>
          打包成新节点
        </button>
      )}

      {isVirtualNode && (
        <>
          <button
            onClick={onUnpack}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <span className="text-primary-500">📤</span>
            解包
          </button>
          {viewId && hyperNodeId && (
            <button
              onClick={() => {
                api.solidifyView(viewId, hyperNodeId).then((result) => {
                  alert(result.message);
                });
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <span className="text-primary-500">💾</span>
              保存为知识超边
            </button>
          )}
        </>
      )}

      <button
        onClick={onTogglePerspective}
        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
      >
        <span className="text-primary-500">🔍</span>
        透视此节点
      </button>

      <button
        onClick={onExpandKnowledgeGraph}
        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
      >
        <span className="text-primary-500">📖</span>
        展开知识图谱
      </button>

      {onAddOntologyEntity && (
        <button
          onClick={onAddOntologyEntity}
          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          <span className="text-primary-500">➕</span>
          添加符合本体的新实体
        </button>
      )}
    </div>
  );
}