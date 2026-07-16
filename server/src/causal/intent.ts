// ============================================================================
// IntentResolver — 自然语言意图解析器
// 支持远程 LLM / 本地 Ollama / 模板匹配三种回退策略
// ============================================================================

import { llmRouter } from '../llm/router';
import logger from '../i18n/logger';

// ── 环境变量 ─────────────────────────────────────────────────────────────────

const INTENT_MODE = (process.env.INTENT_RESOLVER_MODE || 'hybrid') as 'remote' | 'local' | 'hybrid' | 'ollama';
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3';

// ── 类型定义 ─────────────────────────────────────────────────────────────────

export interface ViewState {
  nodes: string[];
  selectedNodes: string[];
  filters?: {
    visibleEdgeTypes?: string[];
    hiddenSlugs?: string[];
  };
  layout?: string;
}

export interface GraphOperation {
  type: 'select' | 'pack' | 'unpack' | 'filter' | 'perspective' | 'expand' | 'layout' | 'groupBy' | 'queryCausal';
  target: string[];
  params?: Record<string, any>;
}

export interface IntentResult {
  operations: GraphOperation[];
  explanation: string;
}

// ── IntentResolver 接口 ──────────────────────────────────────────────────────

export interface IntentResolver {
  resolve(text: string, viewState: ViewState): Promise<IntentResult>;
}

// ── RemoteLLMResolver — 远程 LLM 意图解析 ────────────────────────────────────

export class RemoteLLMResolver implements IntentResolver {
  async resolve(text: string, viewState: ViewState): Promise<IntentResult> {
    try {
      const adapter = llmRouter.route('nl_command');
      const result = await adapter.chat({
        messages: [
          {
            role: 'system',
            content: buildSystemPrompt(viewState),
          },
          {
            role: 'user',
            content: text,
          },
        ],
        jsonMode: true,
      });

      const parsed = JSON.parse(result.content || '{}');
      return {
        operations: parsed.operations || [],
        explanation: parsed.explanation || '操作已执行',
      };
    } catch (error) {
      logger.warn({ err: String(error) }, 'Remote LLM intent resolution failed, falling back to template');
      throw error;
    }
  }
}

// ── TemplateResolver — 关键词模板匹配（无需模型） ─────────────────────────────

export class TemplateResolver implements IntentResolver {
  private templates: Array<{ keywords: string[]; operation: GraphOperation; explanation: string }>;

  constructor() {
    this.templates = [
      {
        keywords: ['打包', '组合', '包成', '打包成', '合并'],
        operation: { type: 'pack', target: [] },
        explanation: '已打包选中的节点',
      },
      {
        keywords: ['展开', '打开', '解包', '展开内部'],
        operation: { type: 'expand', target: [] },
        explanation: '已展开节点',
      },
      {
        keywords: ['透视', '查看', '看看', '影响'],
        operation: { type: 'perspective', target: [] },
        explanation: '已显示透视视图',
      },
      {
        keywords: ['过滤', '只显示', '隐藏', '只保留'],
        operation: { type: 'filter', target: [] },
        explanation: '已应用过滤条件',
      },
      {
        keywords: ['聚合', '按部门', '按分类', '重组'],
        operation: { type: 'groupBy', target: [] },
        explanation: '已按条件聚合节点',
      },
      {
        keywords: ['因果', '如果', '会怎样', '干预', '提高', '降低', '概率'],
        operation: { type: 'queryCausal', target: [] },
        explanation: '已触发因果推理',
      },
    ];
  }

  async resolve(text: string, viewState: ViewState): Promise<IntentResult> {
    // Find matching templates
    const matches = this.templates.filter(t =>
      t.keywords.some(kw => text.includes(kw))
    );

    if (matches.length === 0) {
      return {
        operations: [],
        explanation: '未能理解指令，请尝试更具体的描述。支持的操作：打包、展开、透视、过滤、聚合、因果查询。',
      };
    }

    const bestMatch = matches[0];
    const operation = { ...bestMatch.operation };

    // Extract target nodes from text
    // Simple heuristic: find nodes that appear in both text and viewState
    const targetNodes = viewState.nodes.filter(node =>
      text.includes(node) || text.includes(node.replace(/_/g, ''))
    );

    if (targetNodes.length > 0) {
      operation.target = targetNodes;
    } else if (viewState.selectedNodes.length > 0) {
      operation.target = viewState.selectedNodes;
    }

    // Extract label parameter for pack operations
    if (operation.type === 'pack') {
      const labelMatch = text.match(/叫[「「"]([^」」"]+)[」」"]/);
      if (labelMatch) {
        operation.params = { label: labelMatch[1] };
      }
    }

    // Extract filter parameters
    if (operation.type === 'filter') {
      if (text.includes('因果') || text.includes('causal')) {
        operation.params = { edgeTypes: [':causesIncrease', ':causesDecrease', ':inhibits', ':jointlyCause'] };
      }
      if (text.includes('知识') || text.includes('knowledge')) {
        operation.params = { edgeTypes: [':relatesTo', ':dependsOn'] };
      }
    }

    return {
      operations: [operation],
      explanation: bestMatch.explanation,
    };
  }
}

// ── OllamaResolver — 本地 Ollama 意图解析 ────────────────────────────────────

export class OllamaResolver implements IntentResolver {
  private baseUrl: string;
  private model: string;

  constructor(baseUrl: string = 'http://localhost:11434', model: string = 'llama3') {
    this.baseUrl = baseUrl;
    this.model = model;
  }

  async resolve(text: string, viewState: ViewState): Promise<IntentResult> {
    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'system',
              content: buildOllamaPrompt(viewState),
            },
            {
              role: 'user',
              content: text,
            },
          ],
          stream: false,
          options: {
            temperature: 0.1,
            num_predict: 500,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.message?.content || '';

      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          operations: parsed.operations || [],
          explanation: parsed.explanation || '操作已执行',
        };
      }

      throw new Error('No JSON found in Ollama response');
    } catch (error) {
      logger.warn({ err: String(error) }, 'Ollama intent resolution failed');
      throw error;
    }
  }
}

function buildOllamaPrompt(viewState: ViewState): string {
  return `你是一个图操作助手。解析用户的自然语言指令并返回JSON操作序列。

当前视图有这些节点: ${viewState.nodes.join(', ') || '空'}
已选中的节点: ${viewState.selectedNodes.join(', ') || '无'}

可用操作: pack(打包), unpack(解包), expand(展开), filter(过滤), perspective(透视), layout(布局), groupBy(聚合), queryCausal(因果查询)

返回格式: {"operations": [{"type": "操作名", "target": ["节点名"], "params": {}}], "explanation": "操作说明"}

只返回JSON，不要其他内容。`;
}

// ── IntentResolverChain — 链式回退 ───────────────────────────────────────────

export class IntentResolverChain implements IntentResolver {
  private resolvers: IntentResolver[];

  constructor(resolvers: IntentResolver[]) {
    this.resolvers = resolvers;
  }

  async resolve(text: string, viewState: ViewState): Promise<IntentResult> {
    for (const resolver of this.resolvers) {
      try {
        return await resolver.resolve(text, viewState);
      } catch (error) {
        logger.warn(`IntentResolver ${resolver.constructor.name} failed, trying next`);
        continue;
      }
    }
    return {
      operations: [],
      explanation: '所有意图解析器均不可用，请检查配置。',
    };
  }
}

// ── 工厂函数 ─────────────────────────────────────────────────────────────────

export function createResolver(mode: 'remote' | 'local' | 'hybrid' | 'ollama' = 'hybrid'): IntentResolver {
  const resolvers: IntentResolver[] = [];

  if (mode === 'ollama') {
    // Use Ollama only, with Template as fallback
    resolvers.push(new OllamaResolver());
    resolvers.push(new TemplateResolver());
    return new IntentResolverChain(resolvers);
  }

  if (mode === 'remote' || mode === 'hybrid') {
    resolvers.push(new RemoteLLMResolver());
  }
  if (mode === 'local' || mode === 'hybrid') {
    resolvers.push(new TemplateResolver());
  }

  if (resolvers.length === 1) {
    return resolvers[0];
  }
  return new IntentResolverChain(resolvers);
}

// ── 辅助函数 ─────────────────────────────────────────────────────────────────

function buildSystemPrompt(viewState: ViewState): string {
  return `你是一个图操作意图解析器。根据用户的自然语言指令，生成图操作序列。

当前视图状态：
- 所有节点: ${viewState.nodes.join(', ') || '(空)'}
- 已选中节点: ${viewState.selectedNodes.join(', ') || '(无)'}

可用操作：
1. select — 选择节点。参数: { type: "select", target: ["slug1", "slug2"] }
2. pack — 打包选中节点为超节点。参数: { type: "pack", target: ["slug1", "slug2"], params: { label: "名称" } }
3. unpack — 展开超节点。参数: { type: "unpack", target: ["虚拟节点名"] }
4. filter — 过滤边类型。参数: { type: "filter", target: [], params: { edgeTypes: [":causesIncrease", ":jointlyCause"] } }
5. perspective — 透视节点。参数: { type: "perspective", target: ["slug1"] }
6. expand — 展开知识图谱。参数: { type: "expand", target: ["slug1"] }
7. layout — 改变布局。参数: { type: "layout", target: [], params: { layout: "cose" } }
8. groupBy — 按属性聚合。参数: { type: "groupBy", target: [], params: { attribute: "department" } }
9. queryCausal — 因果推理。参数: { type: "queryCausal", target: [], params: { question: "问句" } }

请返回JSON格式: { "operations": [...], "explanation": "操作说明" }`;
}

// ── 导出 ─────────────────────────────────────────────────────────────────────

export default {
  RemoteLLMResolver,
  TemplateResolver,
  OllamaResolver,
  IntentResolverChain,
  createResolver,
};