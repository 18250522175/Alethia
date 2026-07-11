import { readFile, stat } from 'fs/promises';
import { basename, extname } from 'path';
import logger from '../i18n/logger';
import { cleanText, computeFileHash, registerLibraryFile } from './clean';
import {
  parsePdf,
  parseDocx,
  parseXlsx,
  parsePptx,
  rowsToHtml,
  formulaToLatex
} from './document';
import { processImage } from './image';
import { transcribeAudio } from './audio';
import { processVideo } from './video';
import { fetchWebContent, extractHtmlContent } from './web';
import { parseText } from './text';

export interface IngestResult {
  fileHash: string;
  mime: string;
  text: string;
  sections: { title: string; content: string; evidence?: string[] }[];
  errors: string[];
  warnings: string[];
}

export interface IngestOptions {
  maxFileSize?: number;
  progressCallback?: (progress: number, stage: string) => void;
  maxRetries?: number;
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

const DEFAULT_MAX_FILE_SIZE = 50 * 1024 * 1024;

export async function ingestFile(
  filePath: string,
  mime?: string,
  options: IngestOptions = {}
): Promise<IngestResult> {
  const {
    maxFileSize = DEFAULT_MAX_FILE_SIZE,
    progressCallback,
    maxRetries = 3
  } = options;

  const errors: string[] = [];
  const warnings: string[] = [];
  const sections: IngestResult['sections'] = [];

  progressCallback?.(5, '开始处理');

  const detectedMime = mime || detectMimeFromPath(filePath);

  let buffer: Buffer;
  let fileSize: number;
  try {
    const stats = await stat(filePath);
    fileSize = stats.size;
    
    if (fileSize > maxFileSize) {
      errors.push(`文件大小 ${(fileSize / 1024 / 1024).toFixed(1)} MB 超过限制 ${(maxFileSize / 1024 / 1024)} MB`);
      logger.warn({ filePath, fileSize, maxFileSize }, '文件超过大小限制');
      return {
        fileHash: '',
        mime: detectedMime,
        text: '',
        sections: [],
        errors,
        warnings
      };
    }

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

  progressCallback?.(10, '文件读取完成');

  const fileHash = computeFileHash(buffer);

  try {
    await registerLibraryFile({
      hash: fileHash,
      mime: detectedMime,
      originalName: basename(filePath),
      size: fileSize
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`注册库文件失败：${msg}`);
    logger.error({ err, fileHash }, '注册库文件失败，中止处理');
    return {
      fileHash,
      mime: detectedMime,
      text: `[注册失败] ${msg}`,
      sections: [],
      errors,
      warnings
    };
  }

  progressCallback?.(15, '库文件注册完成');

  let text = '';

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      if (detectedMime === 'application/pdf') {
        progressCallback?.(20, '解析 PDF');
        const result = await parsePdf(buffer);
        progressCallback?.(40, 'PDF 解析完成');
        text = result.text;
        result.pages.forEach((p, i) =>
          sections.push({ title: `第 ${i + 1} 页`, content: p })
        );
      } else if (
        detectedMime ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ) {
        progressCallback?.(20, '解析 DOCX');
        const result = await parseDocx(buffer);
        progressCallback?.(40, 'DOCX 解析完成');
        text = result.text;
        sections.push({
          title: '正文',
          content: result.text,
          evidence: [result.html]
        });
      } else if (
        detectedMime ===
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      ) {
        progressCallback?.(20, '解析 XLSX');
        const result = await parseXlsx(buffer);
        progressCallback?.(40, 'XLSX 解析完成');
        sections.push(
          ...result.sheets.map(s => ({
            title: s.name,
            content: rowsToHtml(s.rows)
          }))
        );
        text = sections.map(s => `### ${s.title}\n\n${s.content}`).join('\n\n');
      } else if (
        detectedMime ===
        'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      ) {
        progressCallback?.(20, '解析 PPTX');
        const result = await parsePptx(buffer);
        progressCallback?.(40, 'PPTX 解析完成');
        text = result.text;
        result.slides.forEach((s, i) =>
          sections.push({ title: `第 ${i + 1} 页`, content: s })
        );
      } else if (detectedMime.startsWith('image/')) {
        progressCallback?.(20, '处理图片');
        const result = await processImage(buffer, detectedMime);
        progressCallback?.(80, '图片处理完成');
        text = result.text;
        warnings.push(...result.warnings);
        sections.push({
          title: '图片描述',
          content: result.description,
          evidence: result.text ? [result.text] : undefined
        });
      } else if (detectedMime.startsWith('audio/')) {
        progressCallback?.(20, '转录音频');
        const result = await transcribeAudio(filePath);
        progressCallback?.(80, '音频转录完成');
        text = result.text;
        warnings.push(...result.warnings);
        sections.push({ title: '转录文本', content: result.text });
      } else if (detectedMime.startsWith('video/')) {
        progressCallback?.(20, '处理视频');
        const result = await processVideo(filePath);
        progressCallback?.(80, '视频处理完成');
        text = result.text;
        warnings.push(...result.warnings);
        sections.push({ title: '转录文本', content: result.text });
        if (result.frames && result.frames.length > 0) {
          sections.push({ title: '帧分析', content: result.frames.join('\n\n') });
        }
      } else if (detectedMime === 'text/html') {
        progressCallback?.(20, '处理 HTML');
        if (/^https?:\/\//i.test(filePath)) {
          const result = await fetchWebContent(filePath);
          progressCallback?.(40, '网页内容获取完成');
          text = result.text;
          warnings.push(...result.warnings);
          sections.push({ title: result.title || '网页内容', content: result.text });
        } else {
          const html = buffer.toString('utf-8');
          const { title, text: htmlText } = extractHtmlContent(html);
          progressCallback?.(40, 'HTML 内容提取完成');
          text = htmlText;
          sections.push({ title: title || '网页内容', content: htmlText });
        }
      } else {
        progressCallback?.(20, '解析文本');
        const content = buffer.toString('utf-8');
        const result = await parseText(content, detectedMime);
        progressCallback?.(40, '文本解析完成');
        text = result.text;
        sections.push(...result.sections);
      }
      
      break;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt <= maxRetries) {
        warnings.push(`处理第 ${attempt} 次尝试失败：${msg}（将重试）`);
        logger.warn({ err, filePath, attempt }, `处理第 ${attempt} 次尝试失败，将重试`);
        await new Promise(r => setTimeout(r, 1000 * attempt));
      } else {
        errors.push(`处理失败（已重试 ${maxRetries} 次）：${msg}`);
        text = `[处理失败] ${msg}`;
        logger.error({ err, filePath, mime: detectedMime }, '摄入处理失败');
      }
    }
  }

  progressCallback?.(90, '后处理');

  if (
    detectedMime === 'application/pdf' ||
    detectedMime.startsWith('text/') ||
    detectedMime === 'application/json'
  ) {
    text = formulaToLatex(text);
  }

  text = cleanText(text);
  for (const s of sections) {
    s.content = cleanText(s.content);
  }

  progressCallback?.(100, '完成');

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