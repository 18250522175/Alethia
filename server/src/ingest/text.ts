import { cleanText } from './clean';

export interface TextSection {
  title: string;
  content: string;
}

export interface ParseTextResult {
  text: string;
  sections: TextSection[];
}

/**
 * 解析纯文本内容。
 * - MD/TXT 直接通过
 * - CSV → Markdown 表格
 * - JSON → 格式化代码块
 */
export async function parseText(content: string, mime: string): Promise<ParseTextResult> {
  const cleaned = cleanText(content);
  let text = cleaned;
  const sections: TextSection[] = [];

  if (mime === 'text/csv' || mime === 'application/csv') {
    text = csvToMarkdownTable(cleaned);
    sections.push({ title: 'CSV 数据', content: text });
  } else if (mime === 'application/json' || mime === 'text/json') {
    text = jsonToCodeBlock(cleaned);
    sections.push({ title: 'JSON 数据', content: text });
  } else if (mime === 'text/markdown' || mime === 'text/x-markdown') {
    const parsed = extractMarkdownSections(cleaned);
    text = parsed.fullText;
    sections.push(...parsed.sections);
  } else {
    // TXT 与其他文本类型直接通过
    sections.push({ title: '正文', content: cleaned });
  }

  return { text, sections };
}

/**
 * CSV 转 Markdown 表格（支持引号包裹的字段）。
 */
function csvToMarkdownTable(csv: string): string {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return '';

  const rows = lines.map((l) => parseCsvLine(l));
  const header = rows[0];
  const body = rows.slice(1);

  const md = [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...body.map((r) => `| ${r.join(' | ')} |`)
  ];

  return md.join('\n');
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let inQuote = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuote = false;
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQuote = true;
      } else if (ch === ',') {
        cells.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
  }
  cells.push(cur);
  return cells;
}

/**
 * JSON → 格式化代码块。
 */
function jsonToCodeBlock(json: string): string {
  try {
    const obj = JSON.parse(json);
    return `\`\`\`json\n${JSON.stringify(obj, null, 2)}\n\`\`\``;
  } catch {
    return `\`\`\`json\n${json}\n\`\`\``;
  }
}

/**
 * 从 Markdown 提取章节（按 H1-H6 切分）。
 */
function extractMarkdownSections(md: string): { fullText: string; sections: TextSection[] } {
  const lines = md.split('\n');
  const sections: TextSection[] = [];
  let currentTitle = '前言';
  let currentLines: string[] = [];

  for (const line of lines) {
    const m = line.match(/^#{1,6}\s+(.+)$/);
    if (m) {
      if (currentLines.length > 0 || sections.length === 0) {
        sections.push({ title: currentTitle, content: currentLines.join('\n').trim() });
      }
      currentTitle = m[1].trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }
  if (currentLines.length > 0 || sections.length === 0) {
    sections.push({ title: currentTitle, content: currentLines.join('\n').trim() });
  }

  return { fullText: md, sections };
}
