import { cleanText } from './clean';

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

/**
 * PDF 解析（动态加载 pdf-parse）。
 */
export async function parsePdf(buffer: Buffer): Promise<PdfResult> {
  let pdfParse: any;
  try {
    const moduleName = 'pdf-parse';
    const mod: any = await import(moduleName);
    pdfParse = mod.default || mod;
  } catch {
    throw new Error('pdf-parse 依赖缺失，无法解析 PDF');
  }

  const data = await pdfParse(buffer);
  const rawText: string = data?.text || '';
  const text = cleanText(formulaToLatex(rawText));
  // pdf-parse 不分页，按 form feed (\f) 切分
  const pages = rawText
    .split('\f')
    .map((p) => cleanText(formulaToLatex(p)))
    .filter(Boolean);

  return { text, pages };
}

/**
 * DOCX 解析（动态加载 mammoth）。
 * 表格由 mammoth 自动转换为 HTML。
 */
export async function parseDocx(buffer: Buffer): Promise<DocxResult> {
  let mammoth: any;
  try {
    mammoth = await import('mammoth');
  } catch {
    throw new Error('mammoth 依赖缺失，无法解析 DOCX');
  }

  const [raw, html] = await Promise.all([
    mammoth.extractRawText({ buffer }),
    mammoth.convertToHtml({ buffer })
  ]);

  const text = cleanText(formulaToLatex(raw?.value || ''));
  return { text, html: html?.value || '' };
}

/**
 * XLSX 解析（动态加载 xlsx）。
 * 表格数据以行数组返回，可通过 rowsToHtml 转 HTML。
 */
export async function parseXlsx(buffer: Buffer): Promise<XlsxResult> {
  let XLSX: any;
  try {
    XLSX = await import('xlsx');
  } catch {
    throw new Error('xlsx 依赖缺失，无法解析 XLSX');
  }

  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheets = (wb.SheetNames || []).map((name: string) => {
    const ws = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' }) as any[][];
    return {
      name,
      rows: rows.map((r) => (r || []).map((c) => String(c ?? '')))
    };
  });

  return { sheets };
}

/**
 * PPTX 解析（动态加载 pptxtojson）。
 */
export async function parsePptx(buffer: Buffer): Promise<PptxResult> {
  let pptxtojson: any;
  try {
    const moduleName = 'pptxtojson';
    pptxtojson = await import(moduleName);
  } catch {
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

/**
 * 表格行 → HTML 表格。
 */
export function rowsToHtml(rows: string[][]): string {
  if (!rows || rows.length === 0) return '';
  const [header, ...body] = rows;
  const thead = `<thead><tr>${header.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead>`;
  const tbody = `<tbody>${body
    .map((r) => `<tr>${(r || []).map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`)
    .join('')}</tbody>`;
  return `<table>${thead}${tbody}</table>`;
}

/**
 * 简单公式 → LaTeX（替换常见数学符号）。
 */
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
    α: '\\alpha',
    β: '\\beta',
    γ: '\\gamma',
    δ: '\\delta',
    ε: '\\epsilon',
    θ: '\\theta',
    λ: '\\lambda',
    μ: '\\mu',
    ν: '\\nu',
    ξ: '\\xi',
    π: '\\pi',
    ρ: '\\rho',
    σ: '\\sigma',
    τ: '\\tau',
    φ: '\\phi',
    ψ: '\\psi',
    ω: '\\omega',
    Γ: '\\Gamma',
    Δ: '\\Delta',
    Θ: '\\Theta',
    Λ: '\\Lambda',
    Σ: '\\Sigma',
    Φ: '\\Phi',
    Ψ: '\\Psi',
    Ω: '\\Omega',
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
