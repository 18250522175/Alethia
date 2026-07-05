import logger from '../i18n/logger';
import { llmRouter } from '../llm/router';

export interface ImageProcessResult {
  text: string;
  description: string;
  warnings: string[];
}

/**
 * 图片处理：OCR (tesseract.js) + VLM 视觉模型描述。
 * 任一环节失败均降级为空文本并写入 warnings，不抛异常。
 */
export async function processImage(buffer: Buffer, mime: string): Promise<ImageProcessResult> {
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
  // 默认中英混合识别
  const result = await recognize(buffer, 'chi_sim+eng', { logger: () => {} });
  return (result?.data?.text || '').trim();
}

async function runVlm(buffer: Buffer, mime: string): Promise<string> {
  // 借用 narrate 任务路由到默认聊天模型（OpenAI 兼容 chat 接口）
  const adapter = llmRouter.route('narrate');
  const dataUrl = `data:${mime};base64,${buffer.toString('base64')}`;

  // OpenAI 视觉 API：content 为数组，含 image_url
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
          image_url: { url: dataUrl }
        }
      ]
    }
  ];

  const response = await adapter.chat({ messages } as any);
  return (response?.content || '').trim();
}
