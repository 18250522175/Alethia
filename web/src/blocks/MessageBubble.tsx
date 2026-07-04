import { useTranslation } from 'react-i18next';
import { Brain, Tag, Coins, ThumbsUp, ThumbsDown } from '@phosphor-icons/react';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: any[];
  confidence?: number;
  relatedEntities?: { slug: string; title: string }[];
  tokensUsed?: number;
  estimatedCost?: number;
  conversationId?: string;
  ts: number;
}

interface MessageBubbleProps {
  message: ChatMessage;
  onFeedback?: (messageId: string, helpful: boolean) => void;
}

export default function MessageBubble({ message, onFeedback }: MessageBubbleProps) {
  const { t } = useTranslation();
  const isUser = message.role === 'user';
  const confidenceColor =
    message.confidence === undefined
      ? ''
      : message.confidence >= 0.75
        ? 'text-green-600 dark:text-green-400'
        : message.confidence >= 0.5
          ? 'text-yellow-600 dark:text-yellow-400'
          : 'text-red-600 dark:text-red-400';

  const handleFeedback = (helpful: boolean) => {
    if (onFeedback) {
      onFeedback(message.id, helpful);
    }
  };

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-3xl rounded-2xl px-5 py-3 ${
          isUser
            ? 'bg-primary-600 text-white'
            : 'bg-slate-50 text-slate-800 dark:bg-slate-700 dark:text-slate-100'
        }`}
      >
        <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
          {message.content}
        </div>

        {!isUser && message.sources && message.sources.length > 0 && (
          <div className="mt-3 border-t border-slate-200 pt-2 dark:border-slate-600">
            <div className="mb-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
              📎 {message.sources.length} 条来源证据
            </div>
            <div className="space-y-1">
              {message.sources.slice(0, 3).map((src: any, i) => (
                <div key={i} className="rounded bg-white/60 p-2 text-xs dark:bg-slate-800/60">
                  <span className="font-mono text-primary-600 dark:text-primary-400">
                    [^{src.span_id || i + 1}]
                  </span>{' '}
                  <span className="line-clamp-1">{src.span_text || src.original_location}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {!isUser &&
          (message.confidence !== undefined ||
            message.relatedEntities?.length ||
            message.tokensUsed) && (
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
              {message.confidence !== undefined && (
                <span className={`flex items-center gap-1 font-medium ${confidenceColor}`}>
                  <Brain size={12} />
                  {t('qa.confidence')}：{Math.round(message.confidence * 100)}%
                </span>
              )}
              {message.tokensUsed ? (
                <span className="flex items-center gap-1">
                  <Coins size={12} />
                  {message.tokensUsed} tokens · ${message.estimatedCost?.toFixed(4)}
                </span>
              ) : null}
              {message.relatedEntities && message.relatedEntities.length > 0 && (
                <div className="flex flex-wrap items-center gap-1">
                  <Tag size={12} />
                  {message.relatedEntities.slice(0, 3).map((e, i) => (
                    <span
                      key={i}
                      className="rounded bg-primary-100 px-1.5 py-0.5 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
                    >
                      {e.title}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

        {!isUser && (
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => handleFeedback(true)}
              className="text-xs text-slate-400 transition-colors hover:text-green-500"
            >
              <ThumbsUp size={14} className="mr-1 inline" />
              {t('qa.feedbackHelpful')}
            </button>
            <button
              onClick={() => handleFeedback(false)}
              className="text-xs text-slate-400 transition-colors hover:text-red-500"
            >
              <ThumbsDown size={14} className="mr-1 inline" />
              {t('qa.feedbackWrong')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
