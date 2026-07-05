import { readFile, stat } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import logger from '../i18n/logger';
import { transcribeAudio } from './audio';
import { cleanText, computeFileHash, registerLibraryFile } from './clean';
import { formulaToLatex, parseDocx, parsePdf, parsePptx, parseXlsx, rowsToHtml } from './document';
import { processImage } from './image';
import { parseText } from './text';
import { processVideo } from './video';
import { extractHtmlContent, fetchWebContent } from './web';

export interface IngestResult {
  fileHash: string;
  mime: string;
  text: string;
  sections: { title: string; content: string; evidence?: string[] }[];
  errors: string[];
  warnings: string[];
}

const EXT_MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.csv': 'text/csv',
  '.json': 'application/json',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm'
};

/**
 * BrainIngest 入口：根据 MIME 分发到对应模态处理器。
 * 缺失依赖时返回汉语错误并跳过（不抛异常）。
 */
export async function ingestFile(filePath: string, mime?: string): Promise<IngestResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const sections: IngestResult['sections'] = [];

  const detectedMime = mime || detectMimeFromPath(filePath);

  // 读取文件
  let buffer: Buffer;
  let fileSize: number;
  try {
    const stats = await stat(filePath);
    fileSize = stats.size;
    buffer = await readFile(filePath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`读取文件失败：${msg}`);
    return {
      fileHash: '',
      mime: detectedMime,
      text: '',
      sections: [],
      errors,
      warnings
    };
  }

  const fileHash = computeFileHash(buffer);

  // 注册库文件（状态: new）
  try {
    await registerLibraryFile({
      hash: fileHash,
      mime: detectedMime,
      originalName: basename(filePath),
      size: fileSize
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warnings.push(`注册库文件失败：${msg}`);
  }

  let text = '';

  try {
    if (detectedMime === 'application/pdf') {
      const result = await parsePdf(buffer);
      text = result.text;
      result.pages.forEach((p, i) => sections.push({ title: `第 ${i + 1} 页`, content: p }));
    } else if (
      detectedMime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      const result = await parseDocx(buffer);
      text = result.text;
      sections.push({
        title: '正文',
        content: result.text,
        evidence: [result.html]
      });
    } else if (
      detectedMime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ) {
      const result = await parseXlsx(buffer);
      sections.push(
        ...result.sheets.map((s) => ({
          title: s.name,
          content: rowsToHtml(s.rows)
        }))
      );
      text = sections.map((s) => `### ${s.title}\n\n${s.content}`).join('\n\n');
    } else if (
      detectedMime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ) {
      const result = await parsePptx(buffer);
      text = result.text;
      result.slides.forEach((s, i) => sections.push({ title: `第 ${i + 1} 页`, content: s }));
    } else if (detectedMime.startsWith('image/')) {
      const result = await processImage(buffer, detectedMime);
      text = result.text;
      warnings.push(...result.warnings);
      sections.push({
        title: '图片描述',
        content: result.description,
        evidence: result.text ? [result.text] : undefined
      });
    } else if (detectedMime.startsWith('audio/')) {
      const result = await transcribeAudio(filePath);
      text = result.text;
      warnings.push(...result.warnings);
      sections.push({ title: '转录文本', content: result.text });
    } else if (detectedMime.startsWith('video/')) {
      const result = await processVideo(filePath);
      text = result.text;
      warnings.push(...result.warnings);
      sections.push({ title: '转录文本', content: result.text });
    } else if (detectedMime === 'text/html') {
      if (/^https?:\/\//i.test(filePath)) {
        const result = await fetchWebContent(filePath);
        text = result.text;
        warnings.push(...result.warnings);
        sections.push({ title: result.title || '网页内容', content: result.text });
      } else {
        // 本地 HTML 文件
        const html = buffer.toString('utf-8');
        const { title, text: htmlText } = extractHtmlContent(html);
        text = htmlText;
        sections.push({ title: title || '网页内容', content: htmlText });
      }
    } else {
      // 默认文本处理（text/*, application/json, text/csv 等）
      const content = buffer.toString('utf-8');
      const result = await parseText(content, detectedMime);
      text = result.text;
      sections.push(...result.sections);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`处理失败：${msg}`);
    logger.error({ err, filePath, mime: detectedMime }, '摄入处理失败');
  }

  // 公式 → LaTeX（仅对文本类内容做整体替换，避免影响 HTML 标签）
  if (
    detectedMime === 'application/pdf' ||
    detectedMime.startsWith('text/') ||
    detectedMime === 'application/json'
  ) {
    text = formulaToLatex(text);
  }

  // 清洗最终文本与章节内容
  text = cleanText(text);
  for (const s of sections) {
    s.content = cleanText(s.content);
  }

  return {
    fileHash,
    mime: detectedMime,
    text,
    sections,
    errors,
    warnings
  };
}

function detectMimeFromPath(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  return EXT_MIME[ext] || 'application/octet-stream';
}
