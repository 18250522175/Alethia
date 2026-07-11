import { cleanText } from './clean';
import { processImage } from './image';
import logger from '../i18n/logger';

export interface PdfResult {
  text: string;
  pages: string[];
}

export interface DocxResult {
  text: string;
  html: string;
}

export interface XlsxResult {
  sheets: { name: string; rows: string[][] }[];
}

export interface PptxResult {
  text: string;
  slides: string[];
}

export async function parsePdf(buffer: Buffer): Promise<PdfResult> {
  let pdfParse: any;
  try {
    const moduleName = 'pdf-parse';
    const mod: any = await import(moduleName);
    pdfParse = mod.default || mod;
  } catch (err) {
    logger.warn({ err }, 'pdf-parse 模块加载失败');
    throw new Error('pdf-parse 依赖缺失，无法解析 PDF');
  }

  const data = await pdfParse(buffer);
  const rawText: string = data?.text || '';
  
  let text = cleanText(formulaToLatex(rawText));
  const pages = rawText
    .split('\f')
    .map(p => cleanText(formulaToLatex(p)))
    .filter(Boolean);

  const ocrResult = await processPdfWithOcr(buffer);
  if (ocrResult && ocrResult.text) {
    if (!text || text.trim().length < 100) {
      text = ocrResult.text;
    } else {
      text = [text, ocrResult.text].filter(Boolean).join('\n\n');
    }
    ocrResult.pages.forEach((p: string, i: number) => {
      if (pages[i]) {
        pages[i] = [pages[i], p].filter(Boolean).join('\n\n');
      } else {
        pages.push(p);
      }
    });
  }

  return { text, pages };
}

async function processPdfWithOcr(buffer: Buffer): Promise<{ text: string; pages: string[] } | null> {
  try {
    // @ts-ignore
    const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.js');
    
    const pdf = await pdfjs.getDocument({
      data: buffer,
      disableWorker: true
    }).promise;
    
    const pages: string[] = [];
    let fullText = '';
    
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2.0 });
      // @ts-ignore
      const canvas = await import('canvas');
      const { createCanvas, loadImage } = canvas.default || canvas;
      
      const cvs = createCanvas(viewport.width, viewport.height);
      const ctx = cvs.getContext('2d');
      
      const renderTask = page.render({
        canvasContext: ctx,
        viewport
      });
      
      await renderTask.promise;
      
      const imageBuffer = cvs.toBuffer('image/jpeg');
      const result = await processImage(imageBuffer, 'image/jpeg');
      
      if (result.text) {
        const pageText = `[第 ${i} 页 OCR] ${result.text}`;
        pages.push(pageText);
        fullText += pageText + '\n\n';
      }
    }
    
    return { text: fullText.trim(), pages };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`PDF OCR 处理失败（可能缺少依赖）：${msg}`);
    return null;
  }
}

export async function parseDocx(buffer: Buffer): Promise<DocxResult> {
  let mammoth: any;
  try {
    mammoth = await import('mammoth');
  } catch (err) {
    logger.warn({ err }, 'mammoth 模块加载失败');
    throw new Error('mammoth 依赖缺失，无法解析 DOCX');
  }

  const [raw, html] = await Promise.all([
    mammoth.extractRawText({ buffer }),
    mammoth.convertToHtml({ buffer })
  ]);

  const text = cleanText(formulaToLatex(raw?.value || ''));
  return { text, html: html?.value || '' };
}

export async function parseXlsx(buffer: Buffer): Promise<XlsxResult> {
  let XLSX: any;
  try {
    XLSX = await import('xlsx');
  } catch (err) {
    logger.warn({ err }, 'xlsx 模块加载失败');
    throw new Error('xlsx 依赖缺失，无法解析 XLSX');
  }

  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheets = (wb.SheetNames || []).map((name: string) => {
    const ws = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' }) as any[][];
    return {
      name,
      rows: rows.map(r => (r || []).map(c => String(c ?? '')))
    };
  });

  return { sheets };
}

export async function parsePptx(buffer: Buffer): Promise<PptxResult> {
  let pptxtojson: any;
  try {
    const moduleName = 'pptxtojson';
    pptxtojson = await import(moduleName);
  } catch (err) {
    logger.warn({ err }, 'pptxtojson 模块加载失败');
    throw new Error('pptxtojson 依赖缺失，无法解析 PPTX');
  }

  const result = await pptxtojson.toJSON(buffer);
  const slides: string[] = (result?.slides || []).map((slide: any, i: number) => {
    const texts = (slide?.elements || [])
      .filter((el: any) => el?.type === 'text' && el.content)
      .map((el: any) => el.content);
    return `## 第 ${i + 1} 页\n\n${texts.join('\n\n')}`;
  });

  return {
    text: cleanText(slides.join('\n\n---\n\n')),
    slides
  };
}

export function rowsToHtml(rows: string[][]): string {
  if (!rows || rows.length === 0) return '';
  const [header, ...body] = rows;
  const thead = `<thead><tr>${header.map(c => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead>`;
  const tbody = `<tbody>${body
    .map(r => `<tr>${(r || []).map(c => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`)
    .join('')}</tbody>`;
  return `<table>${thead}${tbody}</table>`;
}

export function formulaToLatex(text: string): string {
  const map: Record<string, string> = {
    '×': '\\times',
    '÷': '\\div',
    '±': '\\pm',
    '≤': '\\leq',
    '≥': '\\geq',
    '≠': '\\neq',
    '≈': '\\approx',
    '∞': '\\infty',
    '∑': '\\sum',
    '∏': '\\prod',
    '√': '\\sqrt',
    '∂': '\\partial',
    '∫': '\\int',
    'α': '\\alpha',
    'β': '\\beta',
    'γ': '\\gamma',
    'δ': '\\delta',
    'ε': '\\epsilon',
    'θ': '\\theta',
    'λ': '\\lambda',
    'μ': '\\mu',
    'ν': '\\nu',
    'ξ': '\\xi',
    'π': '\\pi',
    'ρ': '\\rho',
    'σ': '\\sigma',
    'τ': '\\tau',
    'φ': '\\phi',
    'ψ': '\\psi',
    'ω': '\\omega',
    'Γ': '\\Gamma',
    'Δ': '\\Delta',
    'Θ': '\\Theta',
    'Λ': '\\Lambda',
    'Σ': '\\Sigma',
    'Φ': '\\Phi',
    'Ψ': '\\Psi',
    'Ω': '\\Omega',
    '∈': '\\in',
    '∉': '\\notin',
    '∩': '\\cap',
    '∪': '\\cup',
    '⊂': '\\subset',
    '⊃': '\\supset',
    '⊆': '\\subseteq',
    '⊇': '\\supseteq',
    '∀': '\\forall',
    '∃': '\\exists',
    '→': '\\to',
    '←': '\\leftarrow',
    '↔': '\\leftrightarrow',
    '⇒': '\\Rightarrow',
    '⇐': '\\Leftarrow',
    '⇔': '\\Leftrightarrow',
    '·': '\\cdot'
  };

  let out = text;
  for (const [sym, latex] of Object.entries(map)) {
    out = out.split(sym).join(latex);
  }
  return out;
}

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}