import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
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
  Compress,
  Expand,
  Clock
} from '@phosphor-icons/react';
import api from '../lib/api';

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

const SUGGESTED_QUESTIONS = [
  '熵的概念是什么？',
  '热力学第二定律如何应用于信息论？',
  '知识库中有哪些核心概念？',
  '什么是 Compiled Truth Markdown？'
];

const MOCK_CONVERSATIONS: Conversation[] = [
  { id: '1', title: '关于熵的讨论', preview: '熵的概念是什么？', updatedAt: Date.now() - 1000 * 60 * 30, compressed: false },
  { id: '2', title: '热力学第二定律', preview: '热力学第二定律的应用...', updatedAt: Date.now() - 1000 * 60 * 60 * 2, compressed: false },
  { id: '3', title: '知识库结构咨询', preview: '核心概念有哪些？', updatedAt: Date.now() - 1000 * 60 * 60 * 24, compressed: true },
  { id: '4', title: 'CTM 格式说明', preview: 'Compiled Truth Markdown...', updatedAt: Date.now() - 1000 * 60 * 60 * 24 * 3, compressed: true },
];

type ViewMode = 'detailed' | 'concise';

export default function QAPanelPage() {
  const { t } = useTranslation();
  const { conversationId: urlConvId } = useParams<{ conversationId?: string }>();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [conversationId, setConversationId] = useState<string | undefined>(urlConvId);
  const [conversations, setConversations] = useState<Conversation[]>(MOCK_CONVERSATIONS);
  const [showSidebar, setShowSidebar] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('detailed');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const askMutation = useMutation({
    mutationFn: ({ question, convId }: { question: string; convId?: string }) =>
      api.askQuestion(question, { conversationId: convId, maxReflections: 3 }),
    onSuccess: (data, variables) => {
      const assistantMessage: ChatMessage = {
        id: `msg-${Date.now()}`,
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
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: `处理失败：${err.message}`,
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
      id: `user-${Date.now()}`,
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
    navigate(`/qa/${id}`);
    const found = conversations.find(c => c.id === id);
    if (found) {
      setMessages([
        {
          id: '1',
          role: 'user',
          content: found.preview,
          ts: found.updatedAt
        },
        {
          id: '2',
          role: 'assistant',
          content: '这是一个示例回答，展示对话历史记录的功能。实际应用中会从服务器加载历史消息。',
          ts: found.updatedAt + 1000 * 60,
          confidence: 0.85,
          tokensUsed: 512,
          estimatedCost: 0.0023
        }
      ]);
    }
    setShowSidebar(false);
  };

  const toggleCompressConversation = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConversations(prev => prev.map(c =>
      c.id === id ? { ...c, compressed: !c.compressed } : c
    ));
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const formatConvTime = (ts: number): string => {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (mins < 1) return '刚刚';
    if (mins < 60) return `${mins} 分钟前`;
    if (hours < 24) return `${hours} 小时前`;
    if (days < 7) return `${days} 天前`;
    return new Date(ts).toLocaleDateString('zh-CN');
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4 animate-fade-in">
      <div className={`relative flex-shrink-0 transition-all duration-300 ${showSidebar ? 'w-64' : 'w-0'}`}>
        {showSidebar && (
          <div className="absolute inset-0 flex flex-col rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 p-3 dark:border-slate-700">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                <ChatCircleDots size={16} className="text-primary-500" />
                对话历史
              </div>
              <button
                onClick={handleNewChat}
                className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                title="新对话"
              >
                <Sparkle size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {conversations.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center text-xs text-slate-400">
                  <Archive size={24} className="mb-2" />
                  暂无对话
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
                              title="已压缩"
                            >
                              <Compress size={10} className="inline" />
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
                      <button
                        onClick={(e) => toggleCompressConversation(conv.id, e)}
                        className="flex-shrink-0 rounded p-1 text-slate-400 opacity-0 transition-opacity hover:bg-slate-100 hover:text-amber-500 group-hover:opacity-100 dark:hover:bg-slate-700"
                        title={conv.compressed ? '展开对话' : '压缩对话'}
                      >
                        {conv.compressed ? <Expand size={12} /> : <Compress size={12} />}
                      </button>
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
              title={showSidebar ? '隐藏侧边栏' : '显示侧边栏'}
            >
              <List size={18} />
            </button>
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-bold">
                <Brain size={28} className="text-primary-500" />
                {t('qa.title')}
              </h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                每个 AI 答案都附带可追溯的来源证据，最大 3 轮反思
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
                <Compress size={12} className="mr-1 inline" />
                简洁
              </button>
              <button
                onClick={() => setViewMode('detailed')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                  viewMode === 'detailed'
                    ? 'bg-white text-primary-600 shadow-sm dark:bg-slate-700 dark:text-primary-300'
                    : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                <Expand size={12} className="mr-1 inline" />
                详细
              </button>
            </div>
            <button onClick={handleNewChat} className="btn btn-secondary">
              <ArrowsClockwise size={16} className="mr-1.5" />
              {t('qa.newChat')}
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/30">
                <ChatCircleDots size={32} className="text-primary-500" />
              </div>
              <h2 className="mb-2 text-lg font-semibold">向你的知识库提问</h2>
              <p className="mb-6 max-w-md text-sm text-slate-500 dark:text-slate-400">
                AI 将基于知识库中已提取的内容进行多轮反思问答，并标注每条结论的来源。
              </p>
              <div className="grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
                {SUGGESTED_QUESTIONS.map((q, i) => (
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
                <MessageBubble key={msg.id} message={msg} viewMode={viewMode} />
              ))}
              {askMutation.isPending && (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Brain size={16} className="animate-pulse text-primary-500" />
                  AI 正在思考并多轮反思...
                </div>
              )}
              <div ref={messagesEndRef} />
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

function MessageBubble({ message, viewMode }: { message: ChatMessage; viewMode: ViewMode }) {
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

        {!isUser && showDetails && message.sources && message.sources.length > 0 && (
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
            <button className="text-xs text-slate-400 hover:text-green-500">
              <ThumbsUp size={14} className="mr-1 inline" />
              {t('qa.feedbackHelpful')}
            </button>
            <button className="text-xs text-slate-400 hover:text-red-500">
              <ThumbsDown size={14} className="mr-1 inline" />
              {t('qa.feedbackWrong')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
