import { Plus, Minus, ArrowsOutSimple, MagnifyingGlass, Download, Funnel, X, Graph, Brain, Path } from '@phosphor-icons/react';
import { useState, useRef, useEffect } from 'react';

export type LayoutType = 'cose' | 'breadthfirst' | 'circle' | 'grid';

interface CausalToolbarProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  layout: LayoutType;
  onLayoutChange: (layout: LayoutType) => void;
  onExportPng: () => void;
  onExportJson: () => void;
  showFeedbackLoops: boolean;
  onToggleFeedbackLoops: () => void;
  showLowConfidence: boolean;
  onToggleLowConfidence: () => void;
  showKnowledgeEdges: boolean;
  onToggleKnowledgeEdges: () => void;
  showCausalEdges: boolean;
  onToggleCausalEdges: () => void;
  onSearch: (query: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  pathMode: boolean;
  pathInstruction: string;
  onPathModeToggle: () => void;
  onPathModeCancel: () => void;
}

const LAYOUTS: { id: LayoutType; label: string }[] = [
  { id: 'cose', label: '力导向' },
  { id: 'breadthfirst', label: '树形' },
  { id: 'circle', label: '同心圆' },
  { id: 'grid', label: '网格' },
];

export default function CausalToolbar({
  onZoomIn,
  onZoomOut,
  onFit,
  layout,
  onLayoutChange,
  onExportPng,
  onExportJson,
  showFeedbackLoops,
  onToggleFeedbackLoops,
  showLowConfidence,
  onToggleLowConfidence,
  showKnowledgeEdges,
  onToggleKnowledgeEdges,
  showCausalEdges,
  onToggleCausalEdges,
  onSearch,
  searchQuery,
  onSearchChange,
  pathMode,
  pathInstruction,
  onPathModeToggle,
  onPathModeCancel,
}: CausalToolbarProps) {
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setShowFilterMenu(false);
      }
    }
    if (showFilterMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showFilterMenu]);

  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white/95 px-2 py-1.5 shadow-sm dark:border-slate-700 dark:bg-slate-800/95">
      {/* Zoom controls */}
      <button
        onClick={onZoomIn}
        className="rounded p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
        title="放大"
      >
        <Plus size={16} />
      </button>
      <button
        onClick={onZoomOut}
        className="rounded p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
        title="缩小"
      >
        <Minus size={16} />
      </button>
      <button
        onClick={onFit}
        className="rounded p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
        title="适应视图"
      >
        <ArrowsOutSimple size={16} />
      </button>

      <div className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" />

      {/* Layout selector */}
      <div className="flex gap-0.5 rounded border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-700 dark:bg-slate-900">
        {LAYOUTS.map(l => (
          <button
            key={l.id}
            onClick={() => onLayoutChange(l.id)}
            className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
              layout === l.id
                ? 'bg-primary-600 text-white'
                : 'text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700'
            }`}
          >
            {l.label}
          </button>
        ))}
      </div>

      <div className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" />

      {/* Filter toggle */}
      <div className="relative" ref={filterRef}>
        <button
          onClick={() => setShowFilterMenu(!showFilterMenu)}
          className={`rounded p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700 ${
            !showFeedbackLoops || !showLowConfidence ? 'text-primary-600 dark:text-primary-400' : ''
          }`}
          title="筛选"
        >
          <Funnel size={16} />
        </button>
        {showFilterMenu && (
          <div className="absolute left-0 top-full z-50 mt-1 w-48 rounded-lg border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-slate-800">
            <label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700">
              <input
                type="checkbox"
                checked={showFeedbackLoops}
                onChange={onToggleFeedbackLoops}
                className="h-4 w-4 rounded accent-primary-600"
              />
              显示反馈回路
            </label>
            <label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700">
              <input
                type="checkbox"
                checked={showLowConfidence}
                onChange={onToggleLowConfidence}
                className="h-4 w-4 rounded accent-primary-600"
              />
              显示低置信度边
            </label>
          </div>
        )}
      </div>

      {/* Knowledge edge toggle */}
      <button
        onClick={onToggleKnowledgeEdges}
        className={`flex items-center gap-1 px-2 py-1 text-xs rounded ${
          showKnowledgeEdges
            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
            : 'bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500'
        }`}
        title="知识图谱边"
      >
        <Graph size={14} /> 知识边
      </button>

      {/* Causal edge toggle */}
      <button
        onClick={onToggleCausalEdges}
        className={`flex items-center gap-1 px-2 py-1 text-xs rounded ${
          showCausalEdges
            ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
            : 'bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500'
        }`}
        title="认知地图边"
      >
        <Brain size={14} /> 因果边
      </button>

      {/* Search */}
      <div className="flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 dark:border-slate-700 dark:bg-slate-900">
        <MagnifyingGlass size={14} className="text-slate-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => {
            onSearchChange(e.target.value);
            onSearch(e.target.value);
          }}
          onKeyDown={e => e.key === 'Enter' && onSearch(searchQuery)}
          placeholder="搜索节点..."
          className="w-32 border-0 bg-transparent py-1 text-xs text-slate-700 placeholder-slate-400 focus:outline-none dark:text-slate-200"
        />
        {searchQuery && (
          <button
            onClick={() => {
              onSearchChange('');
              onSearch('');
            }}
            className="rounded p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X size={12} />
          </button>
        )}
      </div>

      <div className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" />

      {/* Path finding */}
      {pathMode ? (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-amber-600 dark:text-amber-400 whitespace-nowrap animate-pulse">
            {pathInstruction}
          </span>
          <button
            onClick={onPathModeCancel}
            className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30"
            title="取消路径查找"
          >
            取消
          </button>
        </div>
      ) : (
        <button
          onClick={onPathModeToggle}
          className="rounded p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
          title="路径查找"
        >
          <Path size={16} />
        </button>
      )}

      <div className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" />

      {/* Export */}
      <button
        onClick={onExportPng}
        className="rounded p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
        title="导出为 PNG"
      >
        <Download size={16} />
      </button>
      <button
        onClick={onExportJson}
        className="rounded p-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
        title="导出为 JSON"
      >
        JSON
      </button>
    </div>
  );
}