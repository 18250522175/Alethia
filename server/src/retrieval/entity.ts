import { getPool } from '../db/pool';
import logger from '../i18n/logger';

const WIKILINK_REGEX = /\[\[([^\[\]]+)\]\]/g;
// 英文显式命名实体（连续大写开头词），例如 "Apple Inc"、"Barack Obama"
const EXPLICIT_ENTITY_REGEX = /[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*/g;
// 中文命名实体：连续的中文字符（2-8 个）作为候选实体
const CHINESE_ENTITY_REGEX = /[\u4e00-\u9fff]{2,8}/g;

interface UserRuleRow {
  pattern: string;
  mapping: string;
}

export function extractEntities(text: string): string[] {
  if (!text) return [];

  const entities = new Set<string>();

  let match: RegExpExecArray | null;
  while ((match = WIKILINK_REGEX.exec(text)) !== null) {
    const raw = match[1].trim();
    if (!raw) continue;
    // 处理 [[Target|Display]] 与 [[Target#Section]] 语法
    const displayName = raw.split('|')[0].split('#')[0].trim();
    if (displayName) {
      entities.add(displayName);
    }
  }
  WIKILINK_REGEX.lastIndex = 0;

  while ((match = EXPLICIT_ENTITY_REGEX.exec(text)) !== null) {
    const name = match[0].trim();
    if (name && name.length > 1) {
      entities.add(name);
    }
  }
  EXPLICIT_ENTITY_REGEX.lastIndex = 0;

  // 中文命名实体提取（连续中文字符）
  while ((match = CHINESE_ENTITY_REGEX.exec(text)) !== null) {
    const name = match[0].trim();
    // 过滤常见停用词/虚词
    const stopWords = new Set(['这是', '一个', '可以', '我们', '他们', '你们', '这个', '那个', '什么', '怎么', '如果', '因为', '所以', '但是', '而且', '或者', '已经', '没有', '不是', '就是', '还是', '只是', '不过', '然后', '虽然', '因此', '于是', '并且', '以及', '关于', '对于', '按照', '通过', '为了', '作为', '由于', '根据', '其中', '所有', '这些', '那些', '哪些', '一些', '这样', '那样', '如何', '为什么', '是否', '能否', '可以', '能够', '需要', '应该', '必须', '可能', '一定', '非常', '比较', '特别', '很多', '很少', '更多', '更少', '之前', '之后', '以后', '以前', '目前', '现在', '今天', '昨天', '明天', '今年', '去年', '明年']);
    if (name.length >= 2 && !stopWords.has(name)) {
      entities.add(name);
    }
  }
  CHINESE_ENTITY_REGEX.lastIndex = 0;

  return Array.from(entities);
}

export async function applyUserRules(entities: string[]): Promise<string[]> {
  if (entities.length === 0) return entities;

  try {
    const pool = getPool();
    const result = await pool.query<UserRuleRow>(
      'SELECT pattern, mapping FROM user_rules'
    );
    const rules = result.rows;

    if (rules.length === 0) return entities;

    const lowerPatternIndex = new Map<string, UserRuleRow>();
    for (const rule of rules) {
      lowerPatternIndex.set(rule.pattern.toLowerCase(), rule);
    }

    const matchedPatterns = new Set<string>();
    const mapped = entities.map(entity => {
      const rule = lowerPatternIndex.get(entity.toLowerCase());
      if (rule) {
        matchedPatterns.add(rule.pattern);
        return rule.mapping;
      }
      return entity;
    });

    // 异步累加命中次数（best-effort，不影响主流程）
    if (matchedPatterns.size > 0) {
      const patterns = Array.from(matchedPatterns);
      const placeholders = patterns.map((_, i) => `$${i + 1}`).join(',');
      pool
        .query(
          `UPDATE user_rules SET hits = hits + 1 WHERE pattern IN (${placeholders})`,
          patterns
        )
        .catch(err => logger.warn({ err }, '更新 user_rules hits 失败'));
    }

    return Array.from(new Set(mapped));
  } catch (err) {
    logger.error({ err }, '应用用户规则失败');
    return entities;
  }
}

export async function learnRule(pattern: string, mapping: string): Promise<void> {
  if (!pattern || !mapping) {
    throw new Error('pattern 与 mapping 均不能为空');
  }

  try {
    const pool = getPool();
    // user_rules 表 pattern 列无唯一约束，使用 UPDATE-OR-INSERT 模式
    const updateResult = await pool.query<{ id: number }>(
      'UPDATE user_rules SET mapping = $2 WHERE pattern = $1 RETURNING id',
      [pattern, mapping]
    );

    if (updateResult.rows.length === 0) {
      await pool.query(
        'INSERT INTO user_rules (pattern, mapping) VALUES ($1, $2)',
        [pattern, mapping]
      );
      logger.info({ pattern, mapping }, '已学习新规则');
    } else {
      logger.info({ pattern, mapping }, '已更新规则映射');
    }
  } catch (err) {
    logger.error({ err, pattern, mapping }, '学习用户规则失败');
    throw err;
  }
}
