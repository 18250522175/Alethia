import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, FloppyDisk, Pencil, Eye, CaretRight, Sparkle } from '@phosphor-icons/react';
import api from '../lib/api';

interface PromptFile {
  name: string;
  title: string;
  description: string;
}

export default function PromptsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [selectedPrompt, setSelectedPrompt] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  const { data: prompts } = useQuery({
    queryKey: ['prompts'],
    queryFn: () => api.getPrompts(),
    staleTime: 60_000
  });

  const { data: content, isLoading } = useQuery({
    queryKey: ['prompt-content', selectedPrompt],
    queryFn: () => selectedPrompt ? api.getPrompt(selectedPrompt) : null,
    enabled: !!selectedPrompt
  });

  const saveMutation = useMutation({
    mutationFn: ({ name, content }: { name: string; content: string }) => api.savePrompt(name, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prompt-content'] });
      setIsEditing(false);
    }
  });

  const handleSelectPrompt = (name: string) => {
    setSelectedPrompt(name);
    setIsEditing(false);
    setEditContent('');
  };

  const handleStartEdit = () => {
    setEditContent(content || '');
    setIsEditing(true);
  };

  const handleSave = () => {
    if (selectedPrompt) {
      saveMutation.mutate({ name: selectedPrompt, content: editContent });
    }
  };

  const promptInfo: Record<string, { title: string; description: string }> = {
    'generator': { title: t('prompts.generator', '生成器'), description: t('prompts.generatorDesc', '知识问答生成器，根据检索到的知识片段生成准确回答') },
    'grader': { title: t('prompts.grader', '评分器'), description: t('prompts.graderDesc', '检索质量评估器，评估检索结果的准确性和完整性') },
    'planner': { title: t('prompts.planner', '规划器'), description: t('prompts.plannerDesc', '知识检索规划器，根据问题生成检索计划') },
    'reflector': { title: t('prompts.reflector', '反思器'), description: t('prompts.reflectorDesc', '检索反思器，评估检索结果是否需要继续检索') },
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] gap-0">
      <aside className="w-64 border-r border-slate-200 dark:border-slate-700 overflow-y-auto bg-slate-50 dark:bg-slate-800/50 p-4">
        <div className="flex items-center gap-2 mb-4">
          <Sparkle size={20} className="text-primary-500" />
          <h2 className="font-semibold">{t('prompts.title', '提示词管理')}</h2>
        </div>
        <div className="space-y-1">
          {(prompts?.items || []).map((prompt: PromptFile) => (
            <button
              key={prompt.name}
              onClick={() => handleSelectPrompt(prompt.name)}
              className={`w-full flex items-center gap-2 rounded px-3 py-2.5 text-left transition-colors ${
                selectedPrompt === prompt.name
                  ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700'
              }`}
            >
              <FileText size={16} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{promptInfo[prompt.name]?.title || prompt.name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-500 truncate">{promptInfo[prompt.name]?.description || ''}</p>
              </div>
              <CaretRight size={16} className="flex-shrink-0" />
            </button>
          ))}
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        {selectedPrompt ? (
          <div className="h-full flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 px-6 py-4">
              <div>
                <h1 className="text-lg font-semibold">{promptInfo[selectedPrompt]?.title || selectedPrompt}</h1>
                <p className="text-sm text-slate-500">{promptInfo[selectedPrompt]?.description || ''}</p>
              </div>
              <div className="flex items-center gap-2">
                {isEditing ? (
                  <>
                    <button onClick={() => setIsEditing(false)} className="btn btn-secondary text-sm">
                      {t('common.cancel')}
                    </button>
                    <button onClick={handleSave} disabled={saveMutation.isPending} className="btn btn-primary text-sm">
                      <FloppyDisk size={14} className="mr-1" />
                      {t('common.save')}
                    </button>
                  </>
                ) : (
                  <button onClick={handleStartEdit} className="btn btn-primary text-sm">
                    <Pencil size={14} className="mr-1" />
                    {t('common.edit')}
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 p-6 overflow-y-auto">
              {isLoading && (
                <div className="flex items-center justify-center h-full text-slate-400">
                  {t('common.loading')}
                </div>
              )}
              {!isLoading && isEditing ? (
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full h-full min-h-[600px] rounded-lg border border-slate-200 bg-white p-4 font-mono text-sm dark:border-slate-700 dark:bg-slate-800"
                  placeholder={t('prompts.editPlaceholder', '编辑提示词内容...')}
                />
              ) : (
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <pre className="whitespace-pre-wrap font-mono text-sm bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
                    {content || t('prompts.noContent', '暂无内容')}
                  </pre>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center text-slate-400">
            <div className="text-center">
              <Sparkle size={48} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">{t('prompts.selectHint', '选择一个提示词查看或编辑')}</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}