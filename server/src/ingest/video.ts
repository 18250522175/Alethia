import { execSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { basename, join } from 'path';
import { transcribeAudio } from './audio';
import logger from '../i18n/logger';

export interface VideoProcessResult {
  text: string;
  segments: any[];
  warnings: string[];
}

/**
 * 检查 ffmpeg 可执行文件是否存在。
 */
function findFfmpeg(): string | null {
  try {
    const bunWhich = (globalThis as any).Bun?.which;
    if (typeof bunWhich === 'function') {
      const p = bunWhich('ffmpeg');
      if (p) return p;
    }
  } catch {
    /* ignore */
  }
  try {
    const out = execSync('command -v ffmpeg 2>/dev/null', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    return out || null;
  } catch {
    return null;
  }
}

/**
 * 视频处理：FFmpeg 提取音轨，再调用 transcribeAudio 转录。
 */
export async function processVideo(filePath: string): Promise<VideoProcessResult> {
  const warnings: string[] = [];
  const ffmpeg = findFfmpeg();

  if (!ffmpeg) {
    warnings.push('未找到 ffmpeg 可执行文件，无法提取音轨，视频转录已跳过');
    logger.warn({ filePath }, 'ffmpeg 不可用，视频转录已跳过');
    return { text: '', segments: [], warnings };
  }

  const tmpDir = mkdtempSync(join(tmpdir(), 'alethia-video-'));
  const audioPath = join(tmpDir, `${basename(filePath)}.wav`);

  try {
    execSync(
      `"${ffmpeg}" -i "${filePath}" -vn -acodec pcm_s16le -ar 16000 -ac 1 "${audioPath}" -y`,
      {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 100 * 1024 * 1024
      }
    );

    const result = await transcribeAudio(audioPath);
    return {
      text: result.text,
      segments: result.segments,
      warnings: [...warnings, ...result.warnings]
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warnings.push(`视频处理失败：${msg}`);
    logger.error({ err, filePath }, '视频处理失败');
    return { text: '', segments: [], warnings };
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}
