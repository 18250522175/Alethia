import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Copy,
  Check,
  CaretDown,
  CaretRight,
  Plus,
  Minus,
  PencilSimple,
  FileText,
  Empty,
  Warning,
} from '@phosphor-icons/react';

type DiffRowType = 'added' | 'removed' | 'modified' | 'unchanged';

interface DiffRow {
  type: DiffRowType;
  leftContent: string;
  rightContent: string;
  leftLineNo: number | null;
  rightLineNo: number | null;
}

export interface DiffCompareProps {
  oldValue: string;
  newValue: string;
  language?: string;
  title?: string;
  defaultCollapsed?: boolean;
}

const MAX_LCS_LINES = 1000;

/**
 * 基于 LCS（最长公共子序列）的逐行差异计算。
 * 无外部依赖，纯 DP 实现，适合知识库字段级别的文本对比。
 * 超过 MAX_LCS_LINES 行时降级为简单逐行对比，避免 UI 冻结。
 */
function computeDiff(oldStr: string, newStr: string): { rows: DiffRow[]; truncated: boolean } {
  const oldLines = oldStr.length ? oldStr.split('\n') : [];
  const newLines = newStr.length ? newStr.split('\n') : [];
  const m = oldLines.length;
  const n = newLines.length;

  if (m > MAX_LCS_LINES || n > MAX_LCS_LINES) {
    const rows: DiffRow[] = [];
    const maxLines = Math.max(m, n);
    for (let i = 0; i < maxLines; i++) {
      const oldLine = i < m ? oldLines[i] : '';
      const newLine = i < n ? newLines[i] : '';
      if (i >= m) {
        rows.push({
          type: 'added',
          leftContent: '',
          rightContent: newLine,
          leftLineNo: null,
          rightLineNo: i + 1,
        });
      } else if (i >= n) {
        rows.push({
          type: 'removed',
          leftContent: oldLine,
          rightContent: '',
          leftLineNo: i + 1,
          rightLineNo: null,
        });
      } else if (oldLine === newLine) {
        rows.push({
          type: 'unchanged',
          leftContent: oldLine,
          rightContent: newLine,
          leftLineNo: i + 1,
          rightLineNo: i + 1,
        });
      } else {
        rows.push({
          type: 'modified',
          leftContent: oldLine,
          rightContent: newLine,
          leftLineNo: i + 1,
          rightLineNo: i + 1,
        });
      }
    }
    return { rows, truncated: true };
  }

  // 构建 LCS DP 表
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0)
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // 回溯得到操作序列
  type Op = { type: 'same' | 'add' | 'del'; oldIdx?: number; newIdx?: number };
  const ops: Op[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      ops.unshift({ type: 'same', oldIdx: i - 1, newIdx: j - 1 });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.unshift({ type: 'add', newIdx: j - 1 });
      j--;
    } else {
      ops.unshift({ type: 'del', oldIdx: i - 1 });
      i--;
    }
  }

  // 将连续的 del + add 配对成 modified 行，构造并排展示所需的行数据
  const rows: DiffRow[] = [];
  let k = 0;
  while (k < ops.length) {
    const op = ops[k];
    if (op.type === 'same') {
      rows.push({
        type: 'unchanged',
        leftContent: oldLines[op.oldIdx!],
        rightContent: newLines[op.newIdx!],
        leftLineNo: op.oldIdx! + 1,
        rightLineNo: op.newIdx! + 1,
      });
      k++;
      continue;
    }
    const dels: number[] = [];
    const adds: number[] = [];
    while (k < ops.length && ops[k].type !== 'same') {
      if (ops[k].type === 'del') dels.push(ops[k].oldIdx!);
      else adds.push(ops[k].newIdx!);
      k++;
    }
    const pairs = Math.min(dels.length, adds.length);
    let p = 0;
    for (; p < pairs; p++) {
      rows.push({
        type: 'modified',
        leftContent: oldLines[dels[p]],
        rightContent: newLines[adds[p]],
        leftLineNo: dels[p] + 1,
        rightLineNo: adds[p] + 1,
      });
    }
    for (; p < dels.length; p++) {
      rows.push({
        type: 'removed',
        leftContent: oldLines[dels[p]],
        rightContent: '',
        leftLineNo: dels[p] + 1,
        rightLineNo: null,
      });
    }
    for (; p < adds.length; p++) {
      rows.push({
        type: 'added',
        leftContent: '',
        rightContent: newLines[adds[p]],
        leftLineNo: null,
        rightLineNo: adds[p] + 1,
      });
    }
  }
  return { rows, truncated: false };
}

interface RowStyle {
  leftBg: string;
  rightBg: string;
  leftText: string;
  rightText: string;
  leftStrike: boolean;
  rightHighlight: boolean;
  sign: string;
  signColor: string;
}

const ROW_STYLE: Record<DiffRowType, RowStyle> = {
  added: {
    leftBg: '',
    rightBg: 'bg-knowledge-50 dark:bg-knowledge-900/25',
    leftText: 'text-slate-400 dark:text-slate-600',
    rightText: 'text-knowledge-800 dark:text-knowledge-200 font-medium',
    leftStrike: false,
    rightHighlight: true,
    sign: '+',
    signColor: 'text-knowledge-600 dark:text-knowledge-400',
  },
  removed: {
    leftBg: 'bg-red-50 dark:bg-red-900/25',
    rightBg: '',
    leftText: 'text-red-800 dark:text-red-200',
    rightText: 'text-slate-400 dark:text-slate-600',
    leftStrike: true,
    rightHighlight: false,
    sign: '-',
    signColor: 'text-red-600 dark:text-red-400',
  },
  modified: {
    leftBg: 'bg-parchment-50 dark:bg-parchment-900/25',
    rightBg: 'bg-parchment-50 dark:bg-parchment-900/25',
    leftText: 'text-slate-700 dark:text-slate-300',
    rightText: 'text-slate-800 dark:text-slate-100 font-medium',
    leftStrike: true,
    rightHighlight: true,
    sign: '~',
    signColor: 'text-parchment-600 dark:text-parchment-400',
  },
  unchanged: {
    leftBg: '',
    rightBg: '',
    leftText: 'text-slate-600 dark:text-slate-400',
    rightText: 'text-slate-600 dark:text-slate-400',
    leftStrike: false,
    rightHighlight: false,
    sign: ' ',
    signColor: 'text-transparent',
  },
};

export default function DiffCompare({
  oldValue,
  newValue,
  language,
  title,
  defaultCollapsed = false,
}: DiffCompareProps) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [copied, setCopied] = useState(false);

  const { rows, truncated } = useMemo(
    () => computeDiff(oldValue ?? '', newValue ?? ''),
    [oldValue, newValue]
  );

  const stats = useMemo(() => {
    let added = 0;
    let removed = 0;
    let modified = 0;
    for (const r of rows) {
      if (r.type === 'added') added++;
      else if (r.type === 'removed') removed++;
      else if (r.type === 'modified') modified++;
    }
    return { added, removed, modified };
  }, [rows]);

  const isEmpty = !oldValue && !newValue;
  const hasChanges = stats.added > 0 || stats.removed > 0 || stats.modified > 0;

  const handleCopy = async () => {
    if (!newValue) return;
    try {
      await navigator.clipboard.writeText(newValue);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 剪贴板不可用（如非 HTTPS 环境），静默忽略
    }
  };

  const collapseLabel = collapsed
    ? t('diffCompare.expand', '展开')
    : t('diffCompare.collapse', '折叠');

  return (
    <div className="card overflow-hidden animate-fade-in">
      {/* 头部：标题 / 语言标签 / 摘要 / 复制 / 折叠 */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setCollapsed(c => !c)}
            className="btn btn-ghost -ml-1.5 px-1.5 py-1"
            aria-label={collapseLabel}
            title={collapseLabel}
            aria-expanded={!collapsed}
          >
            {collapsed ? <CaretRight size={16} /> : <CaretDown size={16} />}
          </button>
          {title ? (
            <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
              <FileText size={16} className="flex-shrink-0 text-primary-500" />
              <span className="truncate">{title}</span>
            </h3>
          ) : null}
          {language ? (
            <span className="badge badge-blue font-mono uppercase text-[10px]">
              {language}
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          {/* 变更摘要 */}
          <div className="flex items-center gap-1.5 text-xs">
            {hasChanges ? (
              <>
                {stats.added > 0 && (
                  <span className="badge bg-knowledge-100 text-knowledge-800 dark:bg-knowledge-900/40 dark:text-knowledge-300">
                    <Plus size={12} weight="bold" className="mr-0.5" />
                    {stats.added}
                  </span>
                )}
                {stats.removed > 0 && (
                  <span className="badge bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">
                    <Minus size={12} weight="bold" className="mr-0.5" />
                    {stats.removed}
                  </span>
                )}
                {stats.modified > 0 && (
                  <span className="badge bg-parchment-100 text-parchment-800 dark:bg-parchment-900/40 dark:text-parchment-300">
                    <PencilSimple size={12} className="mr-0.5" />
                    {stats.modified}
                  </span>
                )}
              </>
            ) : (
              !isEmpty && (
                <span className="text-slate-400 dark:text-slate-500">
                  {t('diffCompare.noChanges', '无变更')}
                </span>
              )
            )}
          </div>

          {/* 复制新内容 */}
          <button
            type="button"
            onClick={handleCopy}
            disabled={!newValue}
            className="btn btn-ghost px-2 py-1 text-xs"
            title={t('diffCompare.copyNew', '复制新内容')}
          >
            {copied ? (
              <>
                <Check size={14} className="mr-1 text-knowledge-500" />
                {t('diffCompare.copied', '已复制')}
              </>
            ) : (
              <>
                <Copy size={14} className="mr-1" />
                {t('diffCompare.copy', '复制')}
              </>
            )}
          </button>
        </div>
      </div>

      {/* 折叠态：仅展示摘要提示 */}
      {collapsed ? (
        !isEmpty && (
          <div className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
            {hasChanges
              ? t('diffCompare.collapsedHint', {
                  defaultValue:
                    '新增 {{added}} 行 · 删除 {{removed}} 行 · 修改 {{modified}} 行',
                  added: stats.added,
                  removed: stats.removed,
                  modified: stats.modified,
                })
              : t('diffCompare.identical', '新旧内容完全一致')}
          </div>
        )
      ) : (
        <div className="animate-fade-in">
          {isEmpty ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Empty size={36} className="mb-2 text-slate-300 dark:text-slate-600" />
              <p className="text-sm text-slate-400 dark:text-slate-500">
                {t('diffCompare.empty', '无内容可对比')}
              </p>
            </div>
          ) : (
            <>
              {truncated && (
                <div className="flex items-center gap-2 border-b border-yellow-200 bg-yellow-50 px-4 py-2 text-xs text-yellow-700 dark:border-yellow-800/30 dark:bg-yellow-900/20 dark:text-yellow-300">
                  <Warning size={14} weight="bold" />
                  <span>
                  {t('diffCompare.truncatedWarning', { limit: MAX_LCS_LINES })}
                </span>
                </div>
              )}
              {/* 摘要条 */}
              <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs text-slate-500 dark:border-slate-700/50 dark:bg-slate-900/30 dark:text-slate-400">
                {hasChanges
                  ? t('diffCompare.summary', {
                      defaultValue:
                        '共 {{added}} 行新增，{{removed}} 行删除，{{modified}} 行修改',
                      added: stats.added,
                      removed: stats.removed,
                      modified: stats.modified,
                    })
                  : t('diffCompare.identical', '新旧内容完全一致')}
              </div>

              {/* 列头 */}
              <div className="grid grid-cols-2 border-b border-slate-200 text-xs font-semibold text-slate-500 dark:border-slate-700 dark:text-slate-400">
                <div className="flex items-center gap-2 border-r border-slate-200 px-3 py-2 dark:border-slate-700">
                  <span className="h-2 w-2 rounded-full bg-red-400" />
                  {t('diffCompare.oldValue', '旧值')}
                </div>
                <div className="flex items-center gap-2 px-3 py-2">
                  <span className="h-2 w-2 rounded-full bg-knowledge-400" />
                  {t('diffCompare.newValue', '新值')}
                </div>
              </div>

              {/* 并排差异内容 */}
              <div className="max-h-[480px] overflow-auto font-mono text-xs leading-relaxed">
                {rows.map((row, idx) => {
                  const s = ROW_STYLE[row.type];
                  return (
                    <div
                      key={idx}
                      className="grid grid-cols-2 border-b border-slate-100 last:border-b-0 dark:border-slate-800/60"
                    >
                      {/* 左侧：旧值 */}
                      <div
                        className={`flex min-h-[24px] items-start border-r border-slate-100 dark:border-slate-800/60 ${s.leftBg}`}
                      >
                        <span
                          className={`w-5 flex-shrink-0 select-none px-1 text-center ${s.signColor}`}
                        >
                          {row.type === 'removed' || row.type === 'modified'
                            ? s.sign
                            : ''}
                        </span>
                        <span className="w-8 flex-shrink-0 select-none px-1 text-right text-slate-300 dark:text-slate-600">
                          {row.leftLineNo ?? ''}
                        </span>
                        <span
                          className={`flex-1 whitespace-pre-wrap break-words px-2 py-0.5 ${s.leftText} ${
                            s.leftStrike ? 'line-through opacity-70' : ''
                          }`}
                        >
                          {row.leftContent || '\u00A0'}
                        </span>
                      </div>

                      {/* 右侧：新值 */}
                      <div
                        className={`flex min-h-[24px] items-start ${s.rightBg}`}
                      >
                        <span
                          className={`w-5 flex-shrink-0 select-none px-1 text-center ${s.signColor}`}
                        >
                          {row.type === 'added' || row.type === 'modified'
                            ? s.sign
                            : ''}
                        </span>
                        <span className="w-8 flex-shrink-0 select-none px-1 text-right text-slate-300 dark:text-slate-600">
                          {row.rightLineNo ?? ''}
                        </span>
                        <span
                          className={`flex-1 whitespace-pre-wrap break-words px-2 py-0.5 ${s.rightText} ${
                            s.rightHighlight && row.type !== 'unchanged'
                              ? 'rounded-sm ring-1 ring-inset ring-knowledge-300/40 dark:ring-knowledge-400/30'
                              : ''
                          }`}
                        >
                          {row.rightContent || '\u00A0'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
