import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { DEFAULT_SUGGESTED_QUESTIONS } from '../lib/constants';
import {
  PaperPlaneTilt,
  ThumbsUp,
  ThumbsDown,
  ArrowsClockwise,
  Brain,
  ChatCircleDots,
  Tag,
  Coins,
  Sparkle,
  Warning,
  List,
  X,
  Archive,
  ArrowsIn,
  ArrowsOut,
  Clock,
  Trash
} from '@phosphor-icons/react';
import api from '../lib/api';
import MarkdownRenderer from '../components/MarkdownRenderer';
import type { EvidenceSpan } from '@shared/evidence';

interface ChatMessage {
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
  compressed?: boolean;
}

interface Conversation {
  id: string;
  title: string;
  preview: string;
  updatedAt: number;
  compressed?: boolean;
}

interface Conversation {
  id: string;
  title: string;
  preview: string;
  updatedAt: number;
  compressed?: boolean;
}

type ViewMode = 'detailed' | 'concise';

export default function QAPanelPage() {
  const { t } = useTranslation();
  const { conversationId: urlConvId } = useParams<{ conversationId?: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [conversationId, setConversationId] = useState<string | undefined>(urlConvId);
  const [showSidebar, setShowSidebar] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('detailed');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [activeEvidence, setActiveEvidence] = useState<{ spanId: string; data?: any } | null>(null);
  const [feedbackStatus, setFeedbackStatus] = useState<Record<string, 'pending' | 'success' | 'error' | undefined>>({});

  const { data: conversationsData } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => api.getConversations(),
    staleTime: 60_000
  });

  const { data: aliasMap } = useQuery({
    queryKey: ['alias-map'],
    queryFn: () => api.getAliasMap(),
    staleTime: 300_000
  });

  const conversations = conversationsData?.items.map(c => ({
    id: c.id,
    title: c.title,
    preview: c.preview,
    updatedAt: new Date(c.updatedAt).getTime(),
    compressed: false
  })) || [];

  const conversationDetailQuery = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: () => api.getConversation(conversationId!),
    enabled: !!conversationId,
    staleTime: 60_000
  });

  useEffect(() => {
    if (conversationId && conversationDetailQuery.data?.items && conversationDetailQuery.data.items.length > 0) {
      const chatMessages: ChatMessage[] = conversationDetailQuery.data.items.map((msg: any) => ({
        id: msg.id || String(Math.random()),
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content || '',
        sources: msg.sources || [],
        confidence: msg.confidence,
        relatedEntities: msg.relatedEntities,
        tokensUsed: msg.tokensUsed,
        estimatedCost: msg.estimatedCost,
        conversationId: conversationId,
        ts: msg.createdAt ? new Date(msg.createdAt).getTime() : Date.now()
      }));
      setMessages(chatMessages);
    }
  }, [conversationDetailQuery.data, conversationId]);

  const feedbackMutation = useMutation({
    mutationFn: ({ messageId, helpful }: { messageId: string; helpful: boolean }) =>
      api.submitFeedback(messageId, helpful),
    onSuccess: (_data, variables) => {
      setFeedbackStatus(prev => ({ ...prev, [variables.messageId]: 'success' }));
      setTimeout(() => setFeedbackStatus(prev => ({ ...prev, [variables.messageId]: undefined })), 2000);
    },
    onError: (_err, variables) => {
      setFeedbackStatus(prev => ({ ...prev, [variables.messageId]: 'error' }));
      setTimeout(() => setFeedbackStatus(prev => ({ ...prev, [variables.messageId]: undefined })), 2000);
    }
  });

  const handleSubmitFeedback = (messageId: string, helpful: boolean) => {
    feedbackMutation.mutate({ messageId, helpful });
  };

  const handleEvidenceClick = useCallback((spanId: string) => {
    setActiveEvidence(prev => prev?.spanId === spanId ? null : { spanId });
  }, []);

  const askMutation = useMutation({
    mutationFn: ({ question, convId }: { question: string; convId?: string }) =>
      api.askQuestion(question, { conversationId: convId, maxReflections: 3 }),
    onSuccess: (data, variables) => {
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.answer,
        sources: data.sources,
        confidence: data.confidence,
        relatedEntities: data.relatedEntities,
        tokensUsed: data.tokensUsed,
        estimatedCost: data.estimatedCost,
        conversationId: data.conversationId,
        ts: Date.now()
      };
      setMessages(prev => [...prev, assistantMessage]);
      setConversationId(data.conversationId || variables.convId);
      if (data.conversationId) {
        navigate(`/qa/${data.conversationId}`, { replace: true });
      }
    },
    onError: (err: Error, variables) => {
      const errorMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `${t('qa.errorPrefix', '处理失败')}：${err.message}`,
        ts: Date.now()
      };
      setMessages(prev => [...prev, errorMessage]);
      void variables;
    }
  });

  useEffect(() => {
    if (urlConvId) {
      setConversationId(urlConvId);
    }
  }, [urlConvId]);

  const handleSend = (question?: string) => {
    const q = (question ?? input).trim();
    if (!q || askMutation.isPending) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: q,
      ts: Date.now()
    };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    askMutation.mutate({ question: q, convId: conversationId });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleNewChat = () => {
    setMessages([]);
    setConversationId(undefined);
    navigate('/qa');
  };

  const handleSelectConversation = (id: string) => {
    setConversationId(id);
    setMessages([]);
    navigate(`/qa/${id}`);
    setShowSidebar(false);
  };

  const deleteConversationMutation = useMutation({
    mutationFn: (id: string) => api.deleteConversation(id),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      if (conversationId === variables) {
        setConversationId(undefined);
        setMessages([]);
        navigate('/qa');
      }
    }
  });

  const handleDeleteConversation = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(t('qa.deleteConfirm', '确定删除此对话？'))) {
      deleteConversationMutation.mutate(id);
    }
  };

  const toggleCompressConversation = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    api.compressConversation(id)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
      })
      .catch((err) => {
        console.error('Failed to compress conversation:', err);
      });
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const formatConvTime = (ts: number): string => {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (mins < 1) return t('common.justNow', '刚刚');
    if (mins < 60) return t('common.minutesAgo', '{{count}} 分钟前', { count: mins });
    if (hours < 24) return t('common.hoursAgo', '{{count}} 小时前', { count: hours });
    if (days < 7) return t('common.daysAgo', '{{count}} 天前', { count: days });
    return new Date(ts).toLocaleDateString();
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4 animate-fade-in">
      <div className={`relative flex-shrink-0 transition-all duration-300 ${showSidebar ? 'w-64' : 'w-0'}`}>
        {showSidebar && (
          <div className="absolute inset-0 flex flex-col rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 p-3 dark:border-slate-700">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                <ChatCircleDots size={16} className="text-primary-500" />
                {t('qa.conversationHistory', '对话历史')}
              </div>
              <button
                onClick={handleNewChat}
                className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                title={t('qa.newChat', '新对话')}
              >
                <Sparkle size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {conversations.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center text-xs text-slate-400">
                  <Archive size={24} className="mb-2" />
                  {t('qa.noConversations', '暂无对话')}
                </div>
              ) : (
                <div className="space-y-1">
                  {conversations.map(conv => (
                    <button
                      key={conv.id}
                      onClick={() => handleSelectConversation(conv.id)}
                      className={`group flex w-full items-start gap-2 rounded-lg p-2.5 text-left transition-colors ${
                        conversationId === conv.id
                          ? 'bg-primary-50 dark:bg-primary-900/20'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={`truncate text-sm font-medium ${
                            conversationId === conv.id
                              ? 'text-primary-700 dark:text-primary-300'
                              : 'text-slate-700 dark:text-slate-200'
                          }`}>
                            {conv.title}
                          </span>
                          {conv.compressed && (
                            <span
                              className="flex-shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                              title={t('qa.compressed', '已压缩')}
                            >
                              <ArrowsIn size={10} className="inline" />
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                          {conv.preview}
                        </p>
                        <p className="mt-1 text-[10px] text-slate-400">
                          <Clock size={10} className="mr-1 inline" />
                          {formatConvTime(conv.updatedAt)}
                        </p>
                      </div>
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={(e) => toggleCompressConversation(conv.id, e)}
                          className="flex-shrink-0 rounded p-1 text-slate-400 opacity-0 transition-opacity hover:bg-slate-100 hover:text-amber-500 group-hover:opacity-100 dark:hover:bg-slate-700"
                          title={conv.compressed ? t('qa.expandChat', '展开对话') : t('qa.compressChat', '压缩对话')}
                        >
                          {conv.compressed ? <ArrowsOut size={12} /> : <ArrowsIn size={12} />}
                        </button>
                        <button
                          onClick={(e) => handleDeleteConversation(conv.id, e)}
                          className="flex-shrink-0 rounded p-1 text-slate-400 opacity-0 transition-opacity hover:bg-red-100 hover:text-red-500 group-hover:opacity-100 dark:hover:bg-red-900/30"
                          title={t('qa.deleteChat', '删除对话')}
                        >
                          <Trash size={12} />
                        </button>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col">
        <header className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className="btn btn-ghost p-2"
              title={showSidebar ? t('qa.hideSidebar', '隐藏侧边栏') : t('qa.showSidebar', '显示侧边栏')}
            >
              <List size={18} />
            </button>
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-bold">
                <Brain size={28} className="text-primary-500" />
                {t('qa.title')}
              </h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {t('qa.subtitle', '每个 AI 答案都附带可追溯的来源证据，最大 3 轮反思')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-1 dark:border-slate-700 dark:bg-slate-800">
              <button
                onClick={() => setViewMode('concise')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                  viewMode === 'concise'
                    ? 'bg-white text-primary-600 shadow-sm dark:bg-slate-700 dark:text-primary-300'
                    : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                <ArrowsIn size={12} className="mr-1 inline" />
                {t('qa.concise', '简洁')}
              </button>
              <button
                onClick={() => setViewMode('detailed')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                  viewMode === 'detailed'
                    ? 'bg-white text-primary-600 shadow-sm dark:bg-slate-700 dark:text-primary-300'
                    : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                <ArrowsOut size={12} className="mr-1 inline" />
                {t('qa.detailed', '详细')}
              </button>
            </div>
            <button onClick={handleNewChat} className="btn btn-secondary">
              <ArrowsClockwise size={16} className="mr-1.5" />
              {t('qa.newChat')}
            </button>
          </div>
        </header>

        <div className="flex flex-1 gap-4 overflow-hidden">
          <div className="flex-1 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/30">
                  <ChatCircleDots size={32} className="text-primary-500" />
                </div>
                <h2 className="mb-2 text-lg font-semibold">{t('qa.welcomeTitle', '向你的知识库提问')}</h2>
                <p className="mb-6 max-w-md text-sm text-slate-500 dark:text-slate-400">
                  {t('qa.welcomeSubtitle', 'AI 将基于知识库中已提取的内容进行多轮反思问答，并标注每条结论的来源。')}
                </p>
                <div className="grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
                  {DEFAULT_SUGGESTED_QUESTIONS.map((q, i) => (
                    <button
                      key={i}
                      onClick={() => handleSend(q)}
                      className="rounded-lg border border-slate-200 p-3 text-left text-sm transition-all hover:border-primary-300 hover:bg-primary-50 dark:border-slate-700 dark:hover:border-primary-600 dark:hover:bg-slate-700"
                    >
                      <Sparkle size={16} className="mb-1.5 text-primary-500" />
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {messages.map(msg => (
                  <MessageBubble key={msg.id} message={msg} viewMode={viewMode} onEvidenceClick={handleEvidenceClick} onFeedback={handleSubmitFeedback} navigate={navigate} aliasMap={aliasMap} />
                ))}
                {askMutation.isPending && (
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <Brain size={16} className="animate-pulse text-primary-500" />
                    {t('qa.thinking', 'AI 正在思考并多轮反思...')}
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {activeEvidence && (
            <div className="w-80 flex-shrink-0 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  {t('qa.evidenceDetail', '证据详情')}
                </h3>
                <button
                  onClick={() => setActiveEvidence(null)}
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="space-y-3">
                <div>
                  <div className="mb-1 text-xs text-slate-500 dark:text-slate-400">{t('qa.evidenceId', '证据 ID')}</div>
                  <div className="font-mono text-sm text-slate-700 dark:text-slate-300">{activeEvidence.spanId}</div>
                </div>
                {activeEvidence.data && (
                  <>
                    <div>
                      <div className="mb-1 text-xs text-slate-500 dark:text-slate-400">{t('qa.source', '来源')}</div>
                      <div className="text-sm text-slate-700 dark:text-slate-300">{activeEvidence.data.source || '-'}</div>
                    </div>
                    <div>
                      <div className="mb-1 text-xs text-slate-500 dark:text-slate-400">{t('qa.content', '内容')}</div>
                      <div className="rounded bg-slate-50 p-2 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {activeEvidence.data.text || '-'}</div>
                    </div>
                  </>
                )}
                <div className="border-t border-slate-200 pt-2 dark:border-slate-700">
                  <button
                    onClick={() => {
                      setActiveEvidence(null);
                    }}
                    className="w-full text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
                  >
                    {t('qa.closePanel', '关闭面板')}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 flex items-end gap-3 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('qa.inputPlaceholder')}
            rows={2}
            className="flex-1 resize-none border-0 bg-transparent p-2 text-sm focus:outline-none dark:text-slate-100"
            disabled={askMutation.isPending}
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || askMutation.isPending}
            className="btn btn-primary self-end"
          >
            <PaperPlaneTilt size={16} className="mr-1.5" />
            {t('qa.send')}
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message, viewMode, onEvidenceClick, onFeedback, navigate, aliasMap }: { message: ChatMessage; viewMode: ViewMode; onEvidenceClick?: (spanId: string) => void; onFeedback?: (messageId: string, helpful: boolean) => void; navigate?: (to: string) => void; aliasMap?: Record<string, string> }) {
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

  const showDetails = viewMode === 'detailed';

  const evidenceSpans: Partial<EvidenceSpan>[] = (message.sources || []).map((src: any, i: number) => ({
    span_id: src.span_id || String(i + 1),
    original_location: src.original_location || '',
    span_text: src.span_text || '',
    source_type: src.source_type || 'library_file'
  }));

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-3xl rounded-2xl px-5 py-3 ${
          isUser
            ? 'bg-primary-600 text-white'
            : 'bg-slate-50 text-slate-800 dark:bg-slate-700 dark:text-slate-100'
        }`}
      >
        {isUser ? (
          <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
            {message.content}
          </div>
        ) : (
          <MarkdownRenderer
            content={message.content}
            evidenceSpans={evidenceSpans}
            onEvidenceClick={onEvidenceClick}
            aliasMap={aliasMap}
          />
        )}

        {!isUser && showDetails && message.sources && message.sources.length > 0 && (
          <div className="mt-3 border-t border-slate-200 pt-2 dark:border-slate-600">
            <div className="mb-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
              📎 {t('qa.sourceEvidence', '{{count}} 条来源证据', { count: message.sources.length })}
            </div>
            <div className="space-y-1">
              {message.sources.slice(0, 3).map((src: any, i) => (
                <button
                  key={i}
                  onClick={() => {
                    if (src.fileHash) {
                      navigate?.(`/library/${src.fileHash}`);
                    } else if (onEvidenceClick) {
                      onEvidenceClick(src.span_id);
                    }
                  }}
                  className="flex w-full items-start gap-2 rounded bg-white/60 p-2 text-left text-xs transition-colors hover:bg-primary-50 dark:bg-slate-800/60 dark:hover:bg-primary-900/20"
                >
                  <span className="font-mono text-primary-600 dark:text-primary-400">
                    [^{src.span_id || i + 1}]
                  </span>
                  <span className="line-clamp-1 flex-1">{src.span_text || src.original_location}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {!isUser && showDetails && (message.confidence !== undefined || message.relatedEntities?.length || message.tokensUsed) && (
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
                  <button
                    key={i}
                    onClick={() => navigate?.(`/wiki/${e.slug}`)}
                    className="rounded bg-primary-100 px-1.5 py-0.5 text-xs font-medium text-primary-700 transition-colors hover:bg-primary-200 dark:bg-primary-900/30 dark:text-primary-300 dark:hover:bg-primary-800/30"
                    title={t('qa.goToEntity', '跳转到实体')}
                  >
                    {e.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {!isUser && (
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => onFeedback?.(message.id, true)}
              className="text-xs text-slate-400 hover:text-green-500 transition-colors"
            >
              <ThumbsUp size={14} className="mr-1 inline" />
              {t('qa.feedbackHelpful')}
            </button>
            <button
              onClick={() => onFeedback?.(message.id, false)}
              className="text-xs text-slate-400 hover:text-red-500 transition-colors"
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
