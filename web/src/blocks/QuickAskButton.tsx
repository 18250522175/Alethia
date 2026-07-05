import {
  ArrowSquareOut,
  Brain,
  Clock,
  Coins,
  PaperPlaneTilt,
  Sparkle,
  Tag,
  X
} from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';

interface QuickAnswer {
  answer: string;
  sources?: any[];
  confidence?: number;
  relatedEntities?: { slug: string; title: string }[];
  tokensUsed?: number;
  estimatedCost?: number;
  conversationId?: string;
}

const SUGGESTED_QUESTIONS = ['熵的概念是什么？', '什么是知识图谱？', '如何使用这个知识库？'];

export default function QuickAskButton() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [answer, setAnswer] = useState<QuickAnswer | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleAsk = async (question?: string) => {
    const q = (question ?? input).trim();
    if (!q || isLoading) return;

    setInput(q);
    setIsLoading(true);
    setAnswer(null);

    try {
      const data = await api.askQuestion(q, { maxReflections: 2 });
      setAnswer({
        answer: data.answer,
        sources: data.sources,
        confidence: data.confidence,
        relatedEntities: data.relatedEntities,
        tokensUsed: data.tokensUsed,
        estimatedCost: data.estimatedCost,
        conversationId: data.conversationId
      });
    } catch (err: any) {
      setAnswer({
        answer: `出错了：${err.message || '未知错误'}`,
        confidence: 0
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAsk();
    }
  };

  const handleOpenFull = () => {
    if (answer?.conversationId) {
      navigate(`/qa/${answer.conversationId}`);
    } else {
      navigate(`/qa?q=${encodeURIComponent(input)}`);
    }
  };

  const confidenceColor =
    answer?.confidence === undefined
      ? ''
      : answer.confidence >= 0.75
        ? 'text-green-600 dark:text-green-400'
        : answer.confidence >= 0.5
          ? 'text-yellow-600 dark:text-yellow-400'
          : 'text-red-600 dark:text-red-400';

  return (
    <>
      <button
        onClick={() => {
          setIsOpen(!isOpen);
          setAnswer(null);
          setInput('');
        }}
        aria-label={t('home.askAI')}
        className={`btn btn-primary fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all duration-300 hover:scale-110 hover:shadow-xl ${
          isOpen ? 'scale-0 opacity-0' : 'scale-100 opacity-100'
        }`}
      >
        <Brain size={26} />
      </button>

      {isOpen && (
        <div
          ref={panelRef}
          className="fixed bottom-6 right-6 z-50 w-[420px] max-w-[calc(100vw-3rem)] animate-fade-in"
        >
          <div
            className="card flex flex-col overflow-hidden shadow-2xl"
            style={{ maxHeight: '70vh' }}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-100 dark:bg-primary-900/30">
                  <Brain size={18} className="text-primary-500" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">快速提问</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    AI 即时回答，基于知识库
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="btn btn-ghost p-1.5"
                aria-label="关闭"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {!answer && !isLoading && (
                <div className="space-y-3">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    <Sparkle size={12} className="mr-1 inline" />
                    试试这些问题
                  </p>
                  <div className="space-y-2">
                    {SUGGESTED_QUESTIONS.map((q, i) => (
                      <button
                        key={i}
                        onClick={() => handleAsk(q)}
                        className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-700 transition-all hover:border-primary-300 hover:bg-primary-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-primary-600 dark:hover:bg-slate-700"
                      >
                        <span className="text-primary-500">→</span>
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {isLoading && (
                <div className="flex flex-col items-center justify-center py-8">
                  <Brain size={32} className="animate-pulse text-primary-500" />
                  <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                    AI 正在思考中...
                  </p>
                </div>
              )}

              {answer && !isLoading && (
                <div className="space-y-3">
                  <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-700/50">
                    <div className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                      你的问题
                    </div>
                    <p className="text-sm text-slate-900 dark:text-white">{input}</p>
                  </div>

                  <div className="rounded-xl border border-primary-200 bg-primary-50/50 p-3 dark:border-primary-800 dark:bg-primary-900/20">
                    <div className="mb-2 flex items-center gap-1 text-xs font-medium text-primary-600 dark:text-primary-400">
                      <Brain size={12} />
                      AI 回答
                    </div>
                    <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800 dark:text-slate-100">
                      {answer.answer}
                    </div>
                  </div>

                  {(answer.confidence !== undefined ||
                    answer.tokensUsed ||
                    answer.relatedEntities?.length) && (
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                      {answer.confidence !== undefined && (
                        <span className={`flex items-center gap-1 font-medium ${confidenceColor}`}>
                          置信度：
                          {Math.round(answer.confidence * 100)}%
                        </span>
                      )}
                      {answer.tokensUsed ? (
                        <span className="flex items-center gap-1">
                          <Coins size={10} />
                          {answer.tokensUsed} tokens
                        </span>
                      ) : null}
                      {answer.relatedEntities && answer.relatedEntities.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1">
                          <Tag size={10} />
                          {answer.relatedEntities.slice(0, 2).map((e, i) => (
                            <span
                              key={i}
                              className="rounded bg-primary-100 px-1.5 py-0.5 text-[10px] text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
                            >
                              {e.title}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {answer.sources && answer.sources.length > 0 && (
                    <div className="rounded-lg border border-slate-200 p-2 dark:border-slate-700">
                      <div className="mb-1 text-[10px] font-semibold uppercase text-slate-400">
                        📎 {answer.sources.length} 条来源
                      </div>
                      <div className="space-y-1">
                        {answer.sources.slice(0, 2).map((src: any, i) => (
                          <div
                            key={i}
                            className="truncate text-xs text-slate-600 dark:text-slate-400"
                          >
                            <span className="font-mono text-primary-600 dark:text-primary-400">
                              [{i + 1}]
                            </span>{' '}
                            {src.span_text || src.original_location}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="border-t border-slate-200 p-3 dark:border-slate-700">
              <div className="flex items-end gap-2 rounded-xl border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-800">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="输入你的问题..."
                  rows={1}
                  className="flex-1 resize-none border-0 bg-transparent p-1 text-sm focus:outline-none dark:text-slate-100"
                  disabled={isLoading}
                  style={{ minHeight: '36px', maxHeight: '120px' }}
                />
                <button
                  onClick={() => handleAsk()}
                  disabled={!input.trim() || isLoading}
                  className="btn btn-primary flex-shrink-0 px-3 py-1.5 text-sm"
                >
                  <PaperPlaneTilt size={14} className="mr-1" />
                  发送
                </button>
              </div>
              {answer && (
                <button
                  onClick={handleOpenFull}
                  className="mt-2 flex w-full items-center justify-center gap-1 text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
                >
                  <Clock size={12} />
                  在完整对话中继续
                  <ArrowSquareOut size={12} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
