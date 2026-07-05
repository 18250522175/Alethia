import { readFileSync } from 'fs';
import { join } from 'path';
import logger from '../i18n/logger';

/**
 * 加载提示词文件（从 skills/prompts 目录）
 */
export function loadPrompt(name: string): string {
  try {
    return readFileSync(join(process.cwd(), 'skills/prompts', name), 'utf-8');
  } catch {
    try {
      return readFileSync(join(__dirname, '../../skills/prompts', name), 'utf-8');
    } catch {
      logger.warn({ name }, '提示词文件加载失败，使用空提示词');
      return '';
    }
  }
}

/**
 * 从 LLM 响应中解析 JSON 对象
 * 支持 markdown 代码块和纯文本 JSON
 */
export function parseJSONResponse<T>(content: string, fallback: T): T {
  try {
    // 尝试提取 markdown 代码块中的 JSON
    const codeBlock = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = codeBlock ? codeBlock[1] : content.match(/\{[\s\S]*\}/)?.[0];
    if (jsonStr) {
      return JSON.parse(jsonStr.trim()) as T;
    }
    logger.warn({ content: content.slice(0, 200) }, '无法从 LLM 响应中提取 JSON，使用 fallback');
    return fallback;
  } catch (err) {
    logger.warn({ err, content: content.slice(0, 200) }, 'LLM 响应 JSON 解析失败，使用 fallback');
    return fallback;
  }
}