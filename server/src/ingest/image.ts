import { llmRouter } from '../llm/router';
import logger from '../i18n/logger';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir, join } from 'os';

export interface ImageProcessResult {
  text: string;
  description: string;
  warnings: string[];
}

/**
 * 图片处理：OCR (tesseract.js) + VLM 视觉模型描述。
 * 任一环节失败均降级为空文本并写入 warnings，不抛异常。
 */
export async function processImage(
  buffer: Buffer,
  mime: string
): Promise<ImageProcessResult> {
  const warnings: string[] = [];
  let ocrText = '';
  let vlmDescription = '';

  // OCR via tesseract.js
  try {
    ocrText = await runOcr(buffer, mime);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warnings.push(`OCR 失败：${msg}（已降级为空文本）`);
    logger.warn({ err, mime }, '图片 OCR 失败，已降级');
  }

  // VLM via LLM router (传入 image_url)
  try {
    vlmDescription = await runVlm(buffer, mime);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warnings.push(`视觉模型描述失败：${msg}（已降级为空文本）`);
    logger.warn({ err, mime }, 'VLM 描述失败，已降级');
  }

  const text = [ocrText, vlmDescription].filter(Boolean).join('\n\n').trim();

  return { text, description: vlmDescription, warnings };
}

async function runOcr(buffer: Buffer, _mime: string): Promise<string> {
  const tesseract: any = await import('tesseract.js');
  const recognize = tesseract.recognize || (tesseract.default && tesseract.default.recognize);
  if (!recognize) {
    throw new Error('tesseract.js recognize 接口未找到');
  }
  
  try {
    const langData = await detectLanguage(buffer);
    const lang = langData || 'chi_sim+eng';
    const result = await recognize(buffer, lang, { logger: () => {} });
    return (result?.data?.text || '').trim();
  } catch (err) {
    logger.warn({ err }, 'OCR 语言检测失败，使用默认语言');
    const result = await recognize(buffer, 'chi_sim+eng', { logger: () => {} });
    return (result?.data?.text || '').trim();
  }
}

async function detectLanguage(buffer: Buffer): Promise<string | null> {
  try {
    const sharp: any = await import('sharp');
    const img = await sharp(buffer).resize(100, 100).toBuffer();
    const histogram = await sharp(img).stats();
    
    const hasChineseCharacteristics = 
      (histogram.channels[0].mean > 150) ||
      (histogram.channels[1].mean > 150);
    
    if (hasChineseCharacteristics) {
      return 'chi_sim+eng';
    }
    return 'eng';
  } catch (err) {
    logger.warn({ err }, '图像语言检测失败，使用默认语言');
    return 'chi_sim+eng';
  }
}

async function runVlm(buffer: Buffer, mime: string): Promise<string> {
  const adapter = llmRouter.route('narrate');
  
  let imageUrl: string;
  let cleanup: (() => void) | undefined;
  
  if (buffer.length > 2 * 1024 * 1024) {
    const tmpDir = mkdtempSync(join(tmpdir(), 'alethia-vlm-'));
    const filePath = join(tmpDir, `image.${mime.split('/')[1]}`);
    writeFileSync(filePath, buffer);
    imageUrl = filePath;
    cleanup = () => rmSync(tmpDir, { recursive: true, force: true });
  } else {
    imageUrl = `data:${mime};base64,${buffer.toString('base64')}`;
  }

  try {
    const messages: any = [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: '请用中文详细描述这张图片的内容，包括其中的文字、物体、场景、人物等关键信息。'
          },
          {
            type: 'image_url',
            image_url: { url: imageUrl }
          }
        ]
      }
    ];

    const response = await adapter.chat({ messages } as any);
    return (response?.content || '').trim();
  } finally {
    if (cleanup) {
      try { cleanup(); } catch (err) { logger.warn({ err }, 'VLM 临时文件清理失败'); }
    }
  }
}
