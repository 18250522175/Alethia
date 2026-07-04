import { createHash } from 'crypto';
import { getPool } from '../db/pool';
import logger from '../i18n/logger';

/**
 * 内容清洗：去除多余空白、修复编码、标准化换行。
 */
export function cleanText(text: string): string {
  if (!text) return '';

  return text
    // 去除 BOM
    .replace(/\uFEFF/g, '')
    // 标准化换行符（CRLF / CR -> LF）
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // 去除零宽字符
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    // 合并行尾空白
    .replace(/[ \t]+\n/g, '\n')
    // 合并行内连续空格（保留缩进）
    .replace(/(\S)[ \t]{2,}/g, '$1 ')
    // 合并连续空行（3+ -> 2）
    .replace(/\n{3,}/g, '\n\n')
    // 去除首尾空白
    .trim();
}

/**
 * 计算文件 SHA-256 哈希（用于原始归档与去重）。
 */
export function computeFileHash(buffer: Buffer | string): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * 注册库文件，状态初始化为 `new`，并写入 library_files 表。
 * 同时通过 observed_files 建立证据双向映射（text → source_file_hash）。
 */
export async function registerLibraryFile(params: {
  hash: string;
  mime: string;
  originalName: string;
  size: number;
}): Promise<void> {
  const pool = getPool();

  try {
    await pool.query(
      `INSERT INTO library_files (hash, mime, original_name, size, status)
       VALUES ($1, $2, $3, $4, 'new')
       ON CONFLICT (hash) DO NOTHING`,
      [params.hash, params.mime, params.originalName, params.size]
    );

    // 建立证据双向映射：text → source_file_hash
    await pool.query(
      `INSERT INTO observed_files (file_hash, reference_count, first_referenced_at, last_referenced_at)
       VALUES ($1, 1, NOW(), NOW())
       ON CONFLICT (file_hash)
       DO UPDATE SET
         reference_count = observed_files.reference_count + 1,
         last_referenced_at = NOW()`,
      [params.hash]
    );

    logger.info(
      { hash: params.hash, mime: params.mime, name: params.originalName, size: params.size },
      '库文件已注册（状态: new）'
    );
  } catch (err) {
    logger.error({ err, hash: params.hash }, '注册库文件失败');
    throw err;
  }
}
