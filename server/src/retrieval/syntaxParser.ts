/**
 * 高级搜索语法解析器
 * 支持 type:、tag:、date:、has: 等多种前缀语法
 */

export interface ParsedQuery {
  /** 移除语法后的纯文本搜索词 */
  text: string;
  /** 过滤条件列表 */
  filters: QueryFilter[];
  /** 排除条件列表 */
  exclusions: QueryFilter[];
  /** 精确短语列表 */
  phrases: string[];
  /** 是否包含语法（用于决定走高级解析模式） */
  hasSyntax: boolean;
}

export interface QueryFilter {
  /** 语法键（如 type, tag, quality, date, has, is, cv, context, namespace, source, after, before） */
  key: string;
  /** 操作符（=, >=, <=, >, <） */
  op: string;
  /** 过滤值 */
  value: string;
}

/** 语法关键字列表 */
export const SYNTAX_KEYS = [
  'type',
  'namespace',
  'tag',
  'quality',
  'date',
  'after',
  'before',
  'has',
  'context',
  'source',
  'cv',
  'is'
] as const;

/** 语法正则：捕获键、值（含引号短语） */
const SYNTAX_REGEX = /(?<![\w-])([a-zA-Z]+):("([^"]*)"|([^\s"]+))/g;

/** 短语正则：双引号包裹 */
const PHRASE_REGEX = /"([^"]+)"/g;

/**
 * 解析搜索查询字符串
 */
export function parseSearchQuery(input: string): ParsedQuery {
  const filters: QueryFilter[] = [];
  const exclusions: QueryFilter[] = [];

  let text = input.trim();
  let hasSyntax = false;

  // 提取所有短语
  const phrases: string[] = [];
  let workingText = text.replace(PHRASE_REGEX, (match, phrase) => {
    phrases.push(phrase);
    return ' ';
  });

  // 提取所有语法条件
  workingText = workingText.replace(SYNTAX_REGEX, (match, key, _fullValue, quotedValue, plainValue) => {
    const keyLower = key.toLowerCase();

    if (!SYNTAX_KEYS.includes(keyLower as any)) {
      return match;
    }

    hasSyntax = true;

    const value = quotedValue !== undefined ? quotedValue : plainValue;
    const isExclusion = value.startsWith('-');
    const cleanValue = isExclusion ? value.slice(1) : value;

    let op = '=';
    let finalValue = cleanValue;

    const opMatch = cleanValue.match(/^(>=|<=|>|<|=)(.+)$/);
    if (opMatch) {
      op = opMatch[1];
      finalValue = opMatch[2];
    }

    const filter: QueryFilter = { key: keyLower, op, value: finalValue };
    if (isExclusion) {
      exclusions.push(filter);
    } else {
      filters.push(filter);
    }

    return ' ';
  });

  // 剩余的纯文本作为关键词
  const textQuery = workingText.replace(/\s+/g, ' ').trim();

  return {
    text: textQuery,
    filters,
    exclusions,
    phrases,
    hasSyntax
  };
}

/**
 * 将解析后的过滤条件转换为 SQL WHERE 子句
 */
export interface SqlCondition {
  clause: string;
  params: any[];
}

export function filtersToSql(filters: QueryFilter[]): SqlCondition {
  const conditions: string[] = [];
  const params: any[] = [];

  for (const filter of filters) {
    const { key, op, value } = filter;
    switch (key) {
      case 'type':
        conditions.push(`pages.type ${op} $${params.length + 1}`);
        params.push(value);
        break;
      case 'namespace':
        conditions.push(`pages.path LIKE $${params.length + 1}`);
        params.push(`${value}/%`);
        break;
      case 'tag':
        conditions.push(`pages.tags @> ARRAY[$${params.length + 1}]::text[]`);
        params.push(value);
        break;
      case 'context':
        conditions.push(`pages.contexts @> ARRAY[$${params.length + 1}]::text[]`);
        params.push(value);
        break;
      case 'quality': {
        // 质量等级比较：A=1, B=2, C=3，值越小越好
        const qualityMap: Record<string, number> = { A: 1, B: 2, C: 3 };
        const compareMap: Record<string, string> = {
          '>=': '<=',
          '<=': '>=',
          '>': '<',
          '<': '>',
          '=': '='
        };
        const mappedOp = compareMap[op] || '=';
        const num = qualityMap[value.toUpperCase()] || 2;
        const reverseNumMap: Record<number, number> = { 1: 1, 2: 2, 3: 3 };
        conditions.push(
          `CASE UPPER(pages.quality) WHEN 'A' THEN 1 WHEN 'B' THEN 2 WHEN 'C' THEN 3 ELSE 2 END ${mappedOp} $${params.length + 1}`
        );
        params.push(num);
        break;
      }
      case 'date': {
        // 解析 date 字符串（YYYY / YYYY-MM / YYYY-MM-DD）
        const dateRange = parseDateRange(value);
        if (dateRange) {
          conditions.push(
            `(pages.created_at >= $${params.length + 1} AND pages.created_at < $${params.length + 2})`
          );
          params.push(dateRange.start);
          params.push(dateRange.end);
        }
        break;
      }
      case 'after': {
        const afterDate = parseDateRange(value);
        if (afterDate) {
          conditions.push(`pages.created_at >= $${params.length + 1}`);
          params.push(afterDate.start);
        }
        break;
      }
      case 'before': {
        const beforeDate = parseDateRange(value);
        if (beforeDate) {
          conditions.push(`pages.created_at < $${params.length + 1}`);
          params.push(beforeDate.end);
        }
        break;
      }
      case 'has': {
        const v = value.toLowerCase();
        if (v === 'link') {
          conditions.push(
            `(EXISTS (SELECT 1 FROM links WHERE source_slug = pages.slug AND NOT orphaned) OR EXISTS (SELECT 1 FROM links WHERE target_slug = pages.slug AND NOT orphaned))`
          );
        } else if (v === 'image') {
          conditions.push(`pages.content_md ~* '!\\[[^\\]]*\\]\\([^)]+\\)'`);
        } else if (v === 'thread') {
          conditions.push(`pages.parsed_json->'sections'->>'Open Threads' IS NOT NULL AND pages.parsed_json->'sections'->>'Open Threads' <> ''`);
        } else if (v === 'evidence') {
          conditions.push(
            `EXISTS (SELECT 1 FROM evidence_spans WHERE slug = pages.slug)`
          );
        } else if (v === 'alias') {
          conditions.push(`array_length(pages.aliases, 1) > 0`);
        } else if (v === 'tag') {
          conditions.push(`array_length(pages.tags, 1) > 0`);
        } else if (v === 'context') {
          conditions.push(`array_length(pages.contexts, 1) > 0`);
        }
        break;
      }
      case 'is': {
        const v = value.toLowerCase();
        if (v === 'orphan') {
          conditions.push(
            `(NOT EXISTS (SELECT 1 FROM links WHERE source_slug = pages.slug AND NOT orphaned) AND NOT EXISTS (SELECT 1 FROM links WHERE target_slug = pages.slug AND NOT orphaned))`
          );
        } else if (v === 'stub') {
          conditions.push(`pages.is_stub = TRUE`);
        } else if (v === 'featured') {
          conditions.push(`pages.is_featured = TRUE`);
        } else if (v === 'merged') {
          conditions.push(`pages.is_merged = TRUE`);
        }
        break;
      }
      case 'cv': {
        conditions.push(`pages.cv_score ${op} $${params.length + 1}`);
        params.push(parseFloat(value));
        break;
      }
      case 'source': {
        conditions.push(
          `EXISTS (SELECT 1 FROM evidence_spans es WHERE es.slug = pages.slug AND es.source_file_hash = $${params.length + 1})`
        );
        const hash = value.startsWith('library://') ? value.replace('library://', '') : value;
        params.push(hash);
        break;
      }
    }
  }

  return {
    clause: conditions.join(' AND '),
    params
  };
}

/**
 * 将排除条件转换为 NOT WHERE 子句
 */
export function exclusionsToSql(exclusions: QueryFilter[]): SqlCondition {
  const { clause, params } = filtersToSql(exclusions);
  if (!clause) {
    return { clause: '', params: [] };
  }
  return {
    clause: `NOT (${clause})`,
    params
  };
}

/**
 * 解析 date 字符串为日期范围
 */
function parseDateRange(value: string): { start: Date; end: Date } | null {
  // YYYY-MM-DD
  const fullMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (fullMatch) {
    const start = new Date(`${fullMatch[1]}-${fullMatch[2]}-${fullMatch[3]}T00:00:00Z`);
    const end = new Date(`${fullMatch[1]}-${fullMatch[2]}-${fullMatch[3]}T23:59:59Z`);
    return { start, end };
  }

  // YYYY-MM
  const monthMatch = value.match(/^(\d{4})-(\d{2})$/);
  if (monthMatch) {
    const start = new Date(`${monthMatch[1]}-${monthMatch[2]}-01T00:00:00Z`);
    const end = new Date(
      new Date(start).setUTCMonth(new Date(start).getUTCMonth() + 1)
    );
    return { start, end };
  }

  // YYYY
  const yearMatch = value.match(/^(\d{4})$/);
  if (yearMatch) {
    const start = new Date(`${yearMatch[1]}-01-01T00:00:00Z`);
    const end = new Date(`${parseInt(yearMatch[1]) + 1}-01-01T00:00:00Z`);
    return { start, end };
  }

  return null;
}

/**
 * 获取语法帮助信息
 */
export function getSyntaxHelp(): Array<{ key: string; description: string; example: string }> {
  return [
    { key: 'type:', description: '按实体类型过滤', example: 'type:concept' },
    { key: 'namespace:', description: '按命名空间过滤', example: 'namespace:concepts' },
    { key: 'tag:', description: '按标签过滤', example: 'tag:深度学习' },
    { key: 'context:', description: '按语境标签过滤', example: 'context:物理学' },
    { key: 'quality:', description: '按质量评级过滤（A/B/C）', example: 'quality:>=B' },
    { key: 'date:', description: '按日期过滤（YYYY / YYYY-MM / YYYY-MM-DD）', example: 'date:2026-07' },
    { key: 'after: / before:', description: '按日期范围过滤', example: 'after:2026-07-01' },
    { key: 'has:', description: '按内容特征过滤（link/image/thread/evidence/alias）', example: 'has:thread' },
    { key: 'is:', description: '按特殊状态过滤（orphan/stub/featured/merged）', example: 'is:stub' },
    { key: 'cv:', description: '按交叉验证分数过滤', example: 'cv:>=0.8' },
    { key: '-tag:', description: '排除包含该标签的实体', example: '-tag:数学' },
    { key: '" "', description: '精确短语匹配', example: '"系统无序度"' },
    { key: '*', description: '通配符模糊匹配', example: '信息*' }
  ];
}
