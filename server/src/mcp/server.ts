/**
 * MCP (Model Context Protocol) Server
 *
 * 支持双模式接入：
 *   - stdio: 从 process.stdin 读取 JSON-RPC 消息，写入 process.stdout
 *   - http : 通过 Hono 挂载 /mcp 路由，接受 POST 请求
 *
 * 协议基于 JSON-RPC 2.0，不依赖外部 MCP SDK。
 *
 * 支持 methods:
 *   - initialize
 *   - notifications/initialized
 *   - tools/list
 *   - tools/call
 *   - ping
 */

import { Hono } from 'hono';
import { bearerAuth, getApiKeys } from '../auth/bearer';
import { brainAPI } from '../brainapi';
import { llmRouter } from '../llm/router';
import { ingestFile } from '../ingest/pipeline';
import { learnRule } from '../retrieval/entity';
import { defaultSettings } from '../config/defaults';
import { loadEnv } from '../config/loader';
import { getPool } from '../db/pool';
import logger from '../i18n/logger';
import * as path from 'path';

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_NAME = 'alethia-mcp';
const SERVER_VERSION = '5.0.0';

// JSON-RPC 2.0 标准错误码
const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;

interface JSONRPCRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: any;
}

interface JSONRPCError {
  code: number;
  message: string;
  data?: any;
}

interface JSONRPCResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: any;
  error?: JSONRPCError;
}

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

interface ToolContent {
  type: 'text';
  text: string;
}

interface ToolResult {
  content: ToolContent[];
  isError?: boolean;
}

type ToolHandler = (args: Record<string, any>) => Promise<ToolResult>;

interface ToolEntry {
  definition: ToolDefinition;
  handler: ToolHandler;
}

function textResult(text: string, isError = false): ToolResult {
  return { content: [{ type: 'text', text }], isError };
}

function jsonTextResult(data: any, isError = false): ToolResult {
  if (typeof data === 'string') return textResult(data, isError);
  try {
    return textResult(JSON.stringify(data, null, 2), isError);
  } catch {
    return textResult(String(data), isError);
  }
}

function errorResult(message: string): ToolResult {
  return textResult(message, true);
}

// ────────────────────────────────────────────────────────────────────────────
// 工具定义：所有工具经 BrainAPI 或后端核心模块调用
// ────────────────────────────────────────────────────────────────────────────

const TOOLS: ToolEntry[] = [
  // —— 问答 / 检索 ——
  {
    definition: {
      name: 'ask_question',
      description: '向知识库提问，获取基于知识库内容的智能回答（含反思迭代）',
      inputSchema: {
        type: 'object',
        properties: {
          question: { type: 'string', description: '要问的问题' },
          conversationId: { type: 'string', description: '会话 ID，用于追踪上下文' },
          mode: { type: 'string', description: '问答模式（如 factual / ai_qa）' },
          maxReflections: { type: 'number', description: '最大反思轮数（默认 3）' },
          enableTranslation: { type: 'boolean', description: '是否启用证据翻译' }
        },
        required: ['question']
      }
    },
    handler: async (args) => {
      const result = await brainAPI.askQuestion({
        question: String(args.question),
        conversationId: args.conversationId,
        mode: args.mode,
        maxReflections: args.maxReflections,
        enableTranslation: args.enableTranslation
      });
      return jsonTextResult(result);
    }
  },
  {
    definition: {
      name: 'query',
      description: '检索知识库（向量 + 全文混合检索 + RRF 融合）',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '检索关键词或语句' },
          intent: { type: 'string', description: '查询意图（factual / topic / cross_domain / file_search / ai_qa）' },
          tier: { type: 'string', description: '检索层级（T0 / T1 / T2）' },
          contexts: { type: 'array', items: { type: 'string' }, description: '上下文 slug 列表' },
          topK: { type: 'number', description: '返回结果数（默认 10）' },
          withGraph: { type: 'boolean', description: '是否图谱扩展' },
          withRerank: { type: 'boolean', description: '是否启用重排' }
        },
        required: ['query']
      }
    },
    handler: async (args) => {
      const result = await brainAPI.query({
        query: String(args.query),
        intent: args.intent,
        tier: args.tier,
        contexts: args.contexts,
        topK: args.topK,
        withGraph: args.withGraph,
        withRerank: args.withRerank
      });
      return jsonTextResult(result);
    }
  },
  {
    definition: {
      name: 'search',
      description: '搜索知识库（query 工具的别名，简化语义搜索入口）',
      inputSchema: {
        type: 'object',
        properties: {
          q: { type: 'string', description: '搜索关键词' },
          topK: { type: 'number', description: '返回结果数（默认 10）' }
        },
        required: ['q']
      }
    },
    handler: async (args) => {
      const result = await brainAPI.query({
        query: String(args.q),
        topK: args.topK
      });
      return jsonTextResult(result);
    }
  },
  {
    definition: {
      name: 'narrate',
      description: '叙述实体：以单轮问答方式给出实体/主题的定义、状态与关键信息（askQuestion 简化版）',
      inputSchema: {
        type: 'object',
        properties: {
          topic: { type: 'string', description: '要叙述的实体或主题名称' },
          slug: { type: 'string', description: '可选 slug，用于精确锁定页面' }
        },
        required: ['topic']
      }
    },
    handler: async (args) => {
      const topic = String(args.topic);
      const slug = args.slug ? `（slug: ${args.slug}）` : '';
      const result = await brainAPI.askQuestion({
        question: `请叙述实体「${topic}」${slug}的定义、当前状态、评估信息与关键关联。`,
        maxReflections: 1
      });
      return jsonTextResult(result);
    }
  },

  // —— 图谱 ——
  {
    definition: {
      name: 'get_graph',
      description: '获取知识图谱数据（节点与边）',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    handler: async () => {
      const data = await brainAPI.getGraphData();
      return jsonTextResult(data);
    }
  },

  // —— 待审核变更 ——
  {
    definition: {
      name: 'get_diffs',
      description: '获取待审核的自动变更列表',
      inputSchema: {
        type: 'object',
        properties: {
          tier: { type: 'string', description: '按风险层级过滤（green / yellow / red）' }
        }
      }
    },
    handler: async (args) => {
      const diffs = await brainAPI.getPendingDiffs();
      const filtered = args.tier ? diffs.filter((d: any) => d.tier === args.tier) : diffs;
      return jsonTextResult({ items: filtered, total: filtered.length });
    }
  },
  {
    definition: {
      name: 'apply_diff',
      description: '通过审核，应用指定的待审核变更',
      inputSchema: {
        type: 'object',
        properties: {
          diffId: { type: 'string', description: '待审核变更 ID' }
        },
        required: ['diffId']
      }
    },
    handler: async (args) => {
      const result = await brainAPI.applyDiff(String(args.diffId), true);
      return jsonTextResult(result);
    }
  },
  {
    definition: {
      name: 'reject_diff',
      description: '拒绝指定的待审核变更',
      inputSchema: {
        type: 'object',
        properties: {
          diffId: { type: 'string', description: '待审核变更 ID' }
        },
        required: ['diffId']
      }
    },
    handler: async (args) => {
      const result = await brainAPI.applyDiff(String(args.diffId), false);
      return jsonTextResult(result);
    }
  },
  {
    definition: {
      name: 'rollback',
      description: '回滚指定的自动变更批次',
      inputSchema: {
        type: 'object',
        properties: {
          batchId: { type: 'string', description: '自动变更批次 ID' }
        },
        required: ['batchId']
      }
    },
    handler: async (args) => {
      const result = await brainAPI.rollbackAutoChange(String(args.batchId));
      return jsonTextResult(result);
    }
  },

  // —— 对话 / 反馈 ——
  {
    definition: {
      name: 'get_conversation',
      description: '获取指定会话的对话记录',
      inputSchema: {
        type: 'object',
        properties: {
          conversationId: { type: 'string', description: '会话 ID' }
        },
        required: ['conversationId']
      }
    },
    handler: async (args) => {
      const messages = await brainAPI.getConversation(String(args.conversationId));
      return jsonTextResult({ items: messages, total: messages.length });
    }
  },
  {
    definition: {
      name: 'list_conversations',
      description: '列出最近的会话（按最近活动时间倒序）',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: '返回数量（默认 20）' }
        }
      }
    },
    handler: async (args) => {
      const limit = args.limit || 20;
      const pool = getPool();
      const result = await pool.query(
        `SELECT conversation_id,
                MIN(created_at) AS started_at,
                MAX(created_at) AS last_message_at,
                COUNT(*) AS message_count
         FROM conversation_logs
         GROUP BY conversation_id
         ORDER BY last_message_at DESC
         LIMIT $1`,
        [limit]
      );
      return jsonTextResult({ items: result.rows, total: result.rows.length });
    }
  },
  {
    definition: {
      name: 'submit_feedback',
      description: '对会话中的回答提交反馈（helpful / wrong）',
      inputSchema: {
        type: 'object',
        properties: {
          conversationId: { type: 'string', description: '会话 ID' },
          messageId: { type: 'string', description: '消息 ID' },
          feedback: { type: 'string', enum: ['helpful', 'wrong'], description: '反馈类型' },
          note: { type: 'string', description: '可选备注' }
        },
        required: ['conversationId', 'messageId', 'feedback']
      }
    },
    handler: async (args) => {
      const result = await brainAPI.submitFeedback({
        conversationId: String(args.conversationId),
        messageId: String(args.messageId),
        feedback: args.feedback,
        note: args.note
      });
      return jsonTextResult(result);
    }
  },

  // —— 观察文件 / 证据 ——
  {
    definition: {
      name: 'list_observed_files',
      description: '列出被知识库引用的观察文件清单',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    handler: async () => {
      const result = await brainAPI.listObservedFiles();
      return jsonTextResult(result);
    }
  },
  {
    definition: {
      name: 'trigger_extraction',
      description: '触发指定观察文件的事实抽取',
      inputSchema: {
        type: 'object',
        properties: {
          fileHash: { type: 'string', description: '观察文件的 SHA-256 哈希' }
        },
        required: ['fileHash']
      }
    },
    handler: async (args) => {
      const result = await brainAPI.triggerObservedExtraction(String(args.fileHash));
      return jsonTextResult(result);
    }
  },
  {
    definition: {
      name: 'translate_evidence',
      description: '翻译指定的证据片段',
      inputSchema: {
        type: 'object',
        properties: {
          spanIds: { type: 'array', items: { type: 'string' }, description: '证据片段 ID 列表' },
          targetLang: { type: 'string', description: '目标语言（如 zh-CN / en）' }
        },
        required: ['spanIds']
      }
    },
    handler: async (args) => {
      const spanIds: string[] = Array.isArray(args.spanIds)
        ? args.spanIds.map(String)
        : [String(args.spanIds)];
      const result = await brainAPI.translateEvidence(spanIds, args.targetLang);
      return jsonTextResult({ items: result, total: result.length });
    }
  },

  // —— 维护：归档 / 清理 ——
  {
    definition: {
      name: 'archive_versions',
      description: '归档活跃版本超过 50 条的 slug 最早若干条记录',
      inputSchema: {
        type: 'object',
        properties: {
          slug: { type: 'string', description: '可选 slug；为空则扫描全部' }
        }
      }
    },
    handler: async (args) => {
      const result = await brainAPI.archiveVersions(args.slug);
      return jsonTextResult(result);
    }
  },
  {
    definition: {
      name: 'clean_ghost_relations',
      description: '清理已解决或超期的幽灵关系',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    handler: async () => {
      const result = await brainAPI.cleanGhostRelations();
      return jsonTextResult(result);
    }
  },

  // —— 草稿 / 静态站点 ——
  {
    definition: {
      name: 'generate_draft',
      description: '生成 wiki 页面草稿（含 frontmatter 与标准段落骨架）',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '页面标题' },
          type: { type: 'string', description: '类型（如 concept，默认 concept）' },
          contexts: { type: 'array', items: { type: 'string' }, description: '上下文标签' },
          sources: { type: 'array', items: { type: 'string' }, description: '关联 slug 列表' }
        },
        required: ['title']
      }
    },
    handler: async (args) => {
      const result = await brainAPI.generateDraft({
        title: String(args.title),
        type: args.type,
        contexts: args.contexts,
        sources: args.sources
      });
      return jsonTextResult(result);
    }
  },
  {
    definition: {
      name: 'generate_static_site',
      description: '生成静态站点导出',
      inputSchema: {
        type: 'object',
        properties: {
          outputPath: { type: 'string', description: '输出目录' },
          includeMedia: { type: 'boolean', description: '是否包含媒体资源' },
          includeGraph: { type: 'boolean', description: '是否包含图谱数据' },
          theme: { type: 'string', description: '主题' }
        }
      }
    },
    handler: async (args) => {
      const options: any = {};
      if (args.outputPath !== undefined) options.outputPath = args.outputPath;
      if (args.includeMedia !== undefined) options.includeMedia = args.includeMedia;
      if (args.includeGraph !== undefined) options.includeGraph = args.includeGraph;
      if (args.theme !== undefined) options.theme = args.theme;
      const result = await brainAPI.generateStaticSite(options);
      return jsonTextResult(result);
    }
  },

  // —— 健康 / 重建 / 提取 ——
  {
    definition: {
      name: 'get_health',
      description: '获取健康仪表盘数据（规模、审核积压、预算、归档状态等）',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    handler: async () => {
      const result = await brainAPI.getHealth();
      return jsonTextResult(result);
    }
  },
  {
    definition: {
      name: 'rebuild_struct',
      description: '重建知识库结构（清空缓存并重新同步 wiki/summaries/changelog）',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    handler: async () => {
      const result = await brainAPI.rebuildStruct();
      return jsonTextResult(result);
    }
  },
  {
    definition: {
      name: 'extract_pending',
      description: '扫描并处理待提取文件',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    handler: async () => {
      const result = await brainAPI.extractPending();
      return jsonTextResult(result);
    }
  },

  // —— 变更日志 / 评估 ——
  {
    definition: {
      name: 'get_changelog',
      description: '获取自动变更日志（按批次聚合）',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: '返回批次数量（默认 100）' },
          op: { type: 'string', description: '按操作类型过滤' }
        }
      }
    },
    handler: async (args) => {
      const result = await brainAPI.getChangeLog({
        limit: args.limit,
        op: args.op
      });
      return jsonTextResult(result);
    }
  },
  {
    definition: {
      name: 'get_eval_report',
      description: '获取评估报告（基准、异常、汇总、趋势）',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    handler: async () => {
      const result = await brainAPI.getEvalReport();
      return jsonTextResult(result);
    }
  },
  {
    definition: {
      name: 'run_shadow_eval',
      description: '运行影子评估，返回准确率与异常',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    handler: async () => {
      const result = await brainAPI.runShadowEval();
      return jsonTextResult(result);
    }
  },

  // —— 实体规则学习 ——
  {
    definition: {
      name: 'rule_learn',
      description: '学习用户实体映射规则（pattern -> mapping），更新或新建 user_rules 记录',
      inputSchema: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: '原始实体名称（pattern）' },
          mapping: { type: 'string', description: '映射目标实体名称' }
        },
        required: ['pattern', 'mapping']
      }
    },
    handler: async (args) => {
      await learnRule(String(args.pattern), String(args.mapping));
      return jsonTextResult({ success: true, pattern: args.pattern, mapping: args.mapping });
    }
  },

  // —— LLM 适配器 ——
  {
    definition: {
      name: 'list_adapters',
      description: '列出所有 LLM 适配器及其配置状态',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    handler: async () => {
      const adapters = llmRouter.getAdapterStatuses();
      return jsonTextResult({ adapters, total: adapters.length });
    }
  },
  {
    definition: {
      name: 'test_adapter',
      description: '测试指定 LLM 适配器的连通性与延迟',
      inputSchema: {
        type: 'object',
        properties: {
          adapterId: { type: 'string', description: '适配器 ID（如 bailian / zhipu / deepseek 等）' }
        },
        required: ['adapterId']
      }
    },
    handler: async (args) => {
      const adapterId = String(args.adapterId);
      const adapter = llmRouter.getAdapter(adapterId);
      if (!adapter) {
        return errorResult(`未找到适配器: ${adapterId}`);
      }
      const probe = await adapter.probe();
      return jsonTextResult({ adapterId, ...probe });
    }
  },

  // —— 设置 ——
  {
    definition: {
      name: 'get_settings',
      description: '获取全局设置（外观 / 通用 / 预算 / 集成 / 隐私 等）',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    handler: async () => {
      try {
        const pool = getPool();
        const result = await pool.query('SELECT value FROM settings WHERE key = $1', ['global']);
        const settings = result.rows.length > 0
          ? JSON.parse(result.rows[0].value)
          : defaultSettings;
        settings.security.apiKey = getApiKeys().join(',') ?? '';
        return jsonTextResult({ settings });
      } catch (err) {
        logger.warn({ err }, 'MCP 获取设置失败，返回默认值');
        const settings = { ...defaultSettings };
        settings.security.apiKey = getApiKeys().join(',') ?? '';
        return jsonTextResult({ settings });
      }
    }
  },
  {
    definition: {
      name: 'update_settings',
      description: '更新全局设置（整体覆盖）',
      inputSchema: {
        type: 'object',
        properties: {
          settings: { type: 'object', description: '完整的设置对象' }
        },
        required: ['settings']
      }
    },
    handler: async (args) => {
      const settings = args.settings;
      if (!settings || typeof settings !== 'object') {
        return errorResult('settings 参数必须为对象');
      }

      // 基本结构校验：确保 settings 包含必要的顶层键
      const requiredKeys = ['appearance', 'general', 'language', 'budget', 'security', 'privacy', 'tasks', 'paths', 'integration', 'experimental'];
      const missingKeys = requiredKeys.filter(k => !(k in settings));
      if (missingKeys.length > 0) {
        return errorResult(`settings 缺少必要字段: ${missingKeys.join(', ')}`);
      }

      // API 密钥由环境变量 BRAIN_API_KEY 统一管理，避免与 settings 重复存储
      if (settings.security) {
        settings.security.apiKey = '';
      }

      const pool = getPool();
      await pool.query(
        `INSERT INTO settings (key, value, updated_at)
         VALUES ('global', $1::jsonb, NOW())
         ON CONFLICT (key) DO UPDATE SET
           value = EXCLUDED.value,
           updated_at = NOW()`,
        [JSON.stringify(settings)]
      );
      settings.security.apiKey = getApiKeys().join(',') ?? '';
      return jsonTextResult({ success: true, settings });
    }
  },

  // —— 时间线 ——
  {
    definition: {
      name: 'get_timeline',
      description: '获取知识版本时间线（按创建时间倒序）',
      inputSchema: {
        type: 'object',
        properties: {
          slug: { type: 'string', description: '可选 slug，限定单个实体' },
          limit: { type: 'number', description: '返回数量（默认 50）' }
        }
      }
    },
    handler: async (args) => {
      const limit = args.limit || 50;
      const pool = getPool();
      let result;
      if (args.slug) {
        result = await pool.query(
          'SELECT * FROM knowledge_versions WHERE slug = $1 ORDER BY created_at DESC LIMIT $2',
          [args.slug, limit]
        );
      } else {
        result = await pool.query(
          'SELECT * FROM knowledge_versions ORDER BY created_at DESC LIMIT $1',
          [limit]
        );
      }
      return jsonTextResult({ items: result.rows, total: result.rows.length });
    }
  },

  // —— 库文件 ——
  {
    definition: {
      name: 'get_library_file',
      description: '按哈希获取库文件元数据',
      inputSchema: {
        type: 'object',
        properties: {
          hash: { type: 'string', description: '文件 SHA-256 哈希' }
        },
        required: ['hash']
      }
    },
    handler: async (args) => {
      const hash = String(args.hash);
      const pool = getPool();
      const result = await pool.query('SELECT * FROM library_files WHERE hash = $1', [hash]);
      if (result.rows.length === 0) {
        return errorResult(`未找到库文件: ${hash}`);
      }
      return jsonTextResult(result.rows[0]);
    }
  },
  {
    definition: {
      name: 'ingest_file',
      description: '摄入文件到知识库（按 MIME 分发到对应模态处理器）',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: '本地文件路径或网页 URL' },
          mime: { type: 'string', description: '可选 MIME 类型，留空则按扩展名推断' }
        },
        required: ['filePath']
      }
    },
    handler: async (args) => {
      const filePath = String(args.filePath);
      const env = loadEnv();

      // 路径遍历保护: 仅允许 libraryPath 下的文件
      const libraryPath = env.LIBRARY_PATH || '/data/library';
      const resolvedPath = path.resolve(filePath);
      const resolvedLibrary = path.resolve(libraryPath);
      if (!resolvedPath.startsWith(resolvedLibrary + path.sep) && resolvedPath !== resolvedLibrary) {
        return errorResult(`路径遍历被拒绝: ${filePath}。仅允许 ${libraryPath} 目录下的文件。`);
      }

      const result = await ingestFile(filePath, args.mime);
      return jsonTextResult(result);
    }
  },

  // —— 基础工具 ——
  {
    definition: {
      name: 'ping',
      description: '健康检查，返回服务器基本信息与可用工具数量',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    handler: async () => {
      return jsonTextResult({
        ok: true,
        server: SERVER_NAME,
        version: SERVER_VERSION,
        protocolVersion: PROTOCOL_VERSION,
        tools: TOOLS.length
      });
    }
  }
];

// ────────────────────────────────────────────────────────────────────────────
// MCP Server
// ────────────────────────────────────────────────────────────────────────────

export class McpServer {
  private toolsByName: Map<string, ToolEntry> = new Map();

  constructor() {
    for (const tool of TOOLS) {
      this.toolsByName.set(tool.definition.name, tool);
    }
  }

  /**
   * 处理单条 JSON-RPC 请求，返回 JSON-RPC 响应。
   * 对于通知（无 id）也会返回响应对象，调用方可自行决定是否写出。
   */
  async handleRequest(request: JSONRPCRequest): Promise<JSONRPCResponse> {
    const id = request.id ?? null;

    if (request.jsonrpc !== '2.0' || !request.method) {
      return {
        jsonrpc: '2.0',
        id,
        error: { code: INVALID_REQUEST, message: '非法的 JSON-RPC 请求' }
      };
    }

    try {
      switch (request.method) {
        case 'initialize':
          return this.handleInitialize(id, request.params);
        case 'initialized':
        case 'notifications/initialized':
          return { jsonrpc: '2.0', id, result: {} };
        case 'tools/list':
          return this.handleToolsList(id);
        case 'tools/call':
          return await this.handleToolsCall(id, request.params);
        case 'ping':
          return { jsonrpc: '2.0', id, result: {} };
        default:
          return {
            jsonrpc: '2.0',
            id,
            error: {
              code: METHOD_NOT_FOUND,
              message: `Method not found: ${request.method}`
            }
          };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal error';
      logger.error({ err, method: request.method }, 'MCP 请求处理失败');
      return {
        jsonrpc: '2.0',
        id,
        error: { code: INTERNAL_ERROR, message }
      };
    }
  }

  getToolCount(): number {
    return TOOLS.length;
  }

  private handleInitialize(id: string | number | null, _params?: any): JSONRPCResponse {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {
          tools: { listChanged: false }
        },
        serverInfo: {
          name: SERVER_NAME,
          version: SERVER_VERSION
        }
      }
    };
  }

  private handleToolsList(id: string | number | null): JSONRPCResponse {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        tools: TOOLS.map((t) => t.definition)
      }
    };
  }

  private async handleToolsCall(
    id: string | number | null,
    params: any
  ): Promise<JSONRPCResponse> {
    const name = params?.name;
    const args = params?.arguments || {};

    if (!name || typeof name !== 'string') {
      return {
        jsonrpc: '2.0',
        id,
        error: { code: INVALID_PARAMS, message: '缺少工具名称（params.name）' }
      };
    }

    const tool = this.toolsByName.get(name);
    if (!tool) {
      return {
        jsonrpc: '2.0',
        id,
        error: { code: INVALID_PARAMS, message: `未找到工具: ${name}` }
      };
    }

    try {
      const result = await tool.handler(args);
      return { jsonrpc: '2.0', id, result };
    } catch (err) {
      const message = err instanceof Error ? err.message : '工具执行失败';
      logger.error({ err, tool: name }, 'MCP 工具执行失败');
      return {
        jsonrpc: '2.0',
        id,
        result: errorResult(message)
      };
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 启动入口
// ────────────────────────────────────────────────────────────────────────────

/**
 * 处理单行 JSON-RPC 文本，写出响应到 stdout。
 * 通知（无 id）静默忽略。
 */
async function processStdioLine(server: McpServer, line: string): Promise<void> {
  let request: JSONRPCRequest;
  try {
    request = JSON.parse(line) as JSONRPCRequest;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'JSON 解析失败';
    const response: JSONRPCResponse = {
      jsonrpc: '2.0',
      id: null,
      error: { code: PARSE_ERROR, message }
    };
    process.stdout.write(JSON.stringify(response) + '\n');
    return;
  }

  // 通知（无 id）：JSON-RPC 规范要求不返回响应
  if (request.id === undefined || request.id === null) {
    return;
  }

  const response = await server.handleRequest(request);
  process.stdout.write(JSON.stringify(response) + '\n');
}

async function startStdio(): Promise<void> {
  const server = new McpServer();
  let buffer = '';
  const decoder = new TextDecoder();

  logger.info({ tools: server.getToolCount() }, 'MCP Server 已在 stdio 模式启动');

  for await (const chunk of Bun.stdin.stream()) {
    buffer += decoder.decode(chunk);

    let newlineIdx: number;
    while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newlineIdx).trim();
      buffer = buffer.slice(newlineIdx + 1);
      if (!line) continue;
      await processStdioLine(server, line);
    }
  }

  logger.info('MCP stdio 输入结束，退出');
  process.exit(0);
}

async function startHttp(port: number): Promise<void> {
  const server = new McpServer();
  const app = new Hono();

  app.use('/mcp/*', bearerAuth);

  app.post('/mcp', async (c) => {
    let request: any;
    try {
      request = await c.req.json();
    } catch {
      const response: JSONRPCResponse = {
        jsonrpc: '2.0',
        id: null,
        error: { code: PARSE_ERROR, message: '请求体不是合法 JSON' }
      };
      return c.json(response, 400);
    }

    // 通知（无 id）：返回 202，不返回 JSON-RPC 响应体
    if (request?.id === undefined || request?.id === null) {
      return c.json({}, 202);
    }

    const response = await server.handleRequest(request);
    return c.json(response);
  });

  app.get('/mcp', (c) => {
    return c.json({
      server: SERVER_NAME,
      version: SERVER_VERSION,
      protocolVersion: PROTOCOL_VERSION,
      tools: server.getToolCount(),
      mode: 'http'
    });
  });

  Bun.serve({
    fetch: app.fetch,
    port,
    hostname: '0.0.0.0'
  });

  logger.info({ port, tools: server.getToolCount() }, 'MCP Server 已在 HTTP 模式启动');
}

/**
 * 启动 MCP Server。
 *
 * @param mode  'stdio' 从标准输入输出读写；'http' 挂载 /mcp 路由
 * @param port  HTTP 模式监听端口（默认 3100），stdio 模式忽略
 */
export function startMcpServer(mode: 'stdio' | 'http', port?: number): void {
  if (mode === 'stdio') {
    startStdio().catch((err) => {
      logger.fatal({ err }, 'MCP stdio 启动失败');
      process.exit(1);
    });
    return;
  }

  if (mode === 'http') {
    const httpPort = port || 3100;
    startHttp(httpPort).catch((err) => {
      logger.fatal({ err }, 'MCP HTTP 启动失败');
      process.exit(1);
    });
    return;
  }

  throw new Error(`不支持的 MCP 模式: ${mode}`);
}

export default { McpServer, startMcpServer };
