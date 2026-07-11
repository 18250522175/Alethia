import { useState, useMemo } from 'react';

interface CPTData {
  variableSlug: string;
  parentVariables: string[];
  states: string[];
  table: Array<Record<string, string>>;
}

interface CausalCPTWidgetProps {
  cpt: CPTData;
  onProbabilityChange?: (state: string, probability: number) => void;
}

export default function CausalCPTWidget({ cpt, onProbabilityChange }: CausalCPTWidgetProps) {
  const [parentStates, setParentStates] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const parent of cpt.parentVariables) {
      initial[parent] = 'low';
    }
    return initial;
  });

  // Compute probabilities for the current parent state combination
  const probabilities = useMemo(() => {
    const result: Record<string, number> = {};
    let total = 0;

    // Find matching row
    for (const row of cpt.table) {
      let match = true;
      for (const parent of cpt.parentVariables) {
        if (row[parent] !== parentStates[parent]) {
          match = false;
          break;
        }
      }
      if (match) {
        for (const state of cpt.states) {
          const prob = parseFloat(row[state] || row.probability || '0.5');
          result[state] = prob;
          total += prob;
        }
        break;
      }
    }

    // Normalize
    if (total > 0 && total !== 1) {
      for (const state of cpt.states) {
        result[state] = (result[state] || 0) / total;
      }
    }

    return result;
  }, [parentStates, cpt]);

  const handleParentChange = (parent: string, value: string) => {
    const newStates = { ...parentStates, [parent]: value };
    setParentStates(newStates);
  };

  const maxProb = Math.max(...Object.values(probabilities), 0.1);

  const readableName = (slug: string) => slug.replace(/_/g, ' ');

  return (
    <div className="cpt-widget bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
      <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
        {readableName(cpt.variableSlug)} · 条件概率表
      </h4>

      {/* Parent variable selectors */}
      {cpt.parentVariables.length > 0 && (
        <div className="mb-4 space-y-2">
          <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">选择条件:</div>
          {cpt.parentVariables.map((parent) => (
            <div key={parent} className="flex items-center gap-2">
              <label className="text-xs text-slate-600 dark:text-slate-400 w-24 truncate">
                {readableName(parent)}
              </label>
              <select
                value={parentStates[parent] || 'low'}
                onChange={(e) => handleParentChange(parent, e.target.value)}
                className="flex-1 px-2 py-1 text-xs border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-slate-300"
              >
                {cpt.states.map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}

      {/* Probability bar chart */}
      <div className="space-y-2">
        <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">概率分布:</div>
        {cpt.states.map((state) => {
          const prob = probabilities[state] || 0;
          const pct = (prob * 100).toFixed(0);
          const barWidth = maxProb > 0 ? (prob / maxProb) * 100 : 0;

          // Color based on probability
          const barColor = prob > 0.7 ? 'bg-green-500' : prob > 0.3 ? 'bg-yellow-500' : 'bg-red-500';

          return (
            <div key={state} className="flex items-center gap-2">
              <span className="text-xs text-slate-600 dark:text-slate-400 w-16 text-right">
                {state}
              </span>
              <div className="flex-1 h-5 bg-slate-100 dark:bg-slate-700 rounded overflow-hidden">
                <div
                  className={`h-full ${barColor} rounded transition-all duration-300`}
                  style={{ width: `${barWidth}%` }}
                />
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400 w-10 text-right">
                {pct}%
              </span>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-3 flex gap-3 text-xs text-slate-400">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded bg-green-500" /> 高概率
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded bg-yellow-500" /> 中等
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded bg-red-500" /> 低概率
        </div>
      </div>
    </div>
  );
}