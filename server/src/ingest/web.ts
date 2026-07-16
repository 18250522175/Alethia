import { cleanText } from './clean';
import logger from '../i18n/logger';

export interface WebContentResult {
  title: string;
  text: string;
  warnings: string[];
}

/**
 * 抓取网页并提取正文：
 * - 去除 script/style/nav/header/footer 等噪声标签
 * - 保留 p / h1-h6 / ul / ol / table / code / pre 的内容
 * - 支持指数退避重试（最多 3 次）
 */
export async function fetchWebContent(url: string): Promise<WebContentResult> {
  const warnings: string[] = [];
  const maxRetries = 3;
  const timeoutMs = Number(process.env.WEB_FETCH_TIMEOUT_MS) || 15000;

  let html = '';
  let lastError: string = '';

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const resp = await fetch(url, {
        headers: {
          'User-Agent': 'AlethiaBot/5.0 (+https://github.com/alethia/kb)'
        },
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'follow'
      });
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }
      html = await resp.text();
      lastError = '';
      break;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 1000;
        warnings.push(`获取网页失败（第 ${attempt + 1} 次尝试）：${lastError}，${delay / 1000}s 后重试...`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  if (lastError) {
    warnings.push(`获取网页失败：${lastError}`);
    logger.warn({ url, lastError, attempts: maxRetries }, '获取网页内容失败');
    return { title: '', text: '', warnings };
  }

  try {
    const { title, text } = extractHtmlContent(html);
    return { title, text: cleanText(text), warnings };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warnings.push(`解析网页正文失败：${msg}`);
    logger.warn({ err, url }, '解析网页正文失败');
    return { title: '', text: '', warnings };
  }
}

/**
 * 从 HTML 字符串中提取标题与正文。
 * 简单实现：去标签 + 块级标签转 Markdown 风格。
 */
export function extractHtmlContent(html: string): { title: string; text: string } {
  // 提取标题
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeEntities(titleMatch[1].trim()) : '';

  // 去除 DOCTYPE 与注释
  let body = html
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  // 先移除噪声标签（script/style/nav 等），再截取 body，避免 body 外的噪声标签漏网
  body = body.replace(
    /<(script|style|nav|header|footer|aside|form|iframe|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi,
    ''
  );

  // 截取 body
  const bodyMatch = body.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) {
    body = bodyMatch[1];
  }

  // 标题 → Markdown
  body = body.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, level: string, content: string) => {
    return `\n\n${'#'.repeat(Number(level))} ${stripTags(content).trim()}\n\n`;
  });

  // 段落 / 列表项 / 预格式化 → 换行
  body = body.replace(/<\/(p|div|li|tr|ul|ol|pre|code)\s*>/gi, '\n');
  body = body.replace(/<br\s*\/?>/gi, '\n');

  // 列表项
  body = body.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, content: string) => `- ${stripTags(content).trim()}\n`);

  // 表格 → 简单文本行
  body = body.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (_, content: string) => {
    const rows = content.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
    const parsed = rows.map(r => {
      const cells = r.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) || [];
      return cells.map(c => stripTags(c).trim()).join(' | ');
    });
    return '\n\n' + parsed.join('\n') + '\n\n';
  });

  // 代码块保留
  body = body.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_, content: string) => {
    return `\n\n\`\`\`\n${stripTags(content).trim()}\n\`\`\`\n\n`;
  });

  // 移除所有剩余标签
  body = stripTags(body);

  // 解码 HTML 实体
  body = decodeEntities(body);

  return { title, text: body };
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '');
}

function decodeEntities(text: string): string {
  const entities: Record<string, string> = {
    '&nbsp;': ' ',
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&hellip;': '\u2026',
    '&mdash;': '\u2014',
    '&ndash;': '\u2013',
    '&laquo;': '\u00AB',
    '&raquo;': '\u00BB',
    '&ldquo;': '\u201C',
    '&rdquo;': '\u201D',
    '&lsquo;': '\u2018',
    '&rsquo;': '\u2019'
  };

  let out = text;
  for (const [entity, ch] of Object.entries(entities)) {
    out = out.split(entity).join(ch);
  }
  out = out.replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)));
  out = out.replace(/&#x([0-9a-fA-F]+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 16)));
  return out;
}
