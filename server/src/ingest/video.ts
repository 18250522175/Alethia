import { exec } from 'child_process';
import { promisify } from 'util';
import { mkdtempSync, rmSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, join } from 'path';
import { transcribeAudio } from './audio';
import { processImage } from './image';
import logger from '../i18n/logger';

const execAsync = promisify(exec);

export interface VideoProcessResult {
  text: string;
  segments: any[];
  warnings: string[];
  frames: string[];
}

async function findFfmpeg(): Promise<string | null> {
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
    const { stdout } = await execAsync('command -v ffmpeg 2>/dev/null');
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

export async function processVideo(filePath: string): Promise<VideoProcessResult> {
  const warnings: string[] = [];
  const ffmpeg = await findFfmpeg();

  if (!ffmpeg) {
    warnings.push('未找到 ffmpeg 可执行文件，无法提取音轨，视频转录已跳过');
    logger.warn({ filePath }, 'ffmpeg 不可用，视频转录已跳过');
    return { text: '', segments: [], warnings };
  }

  const tmpDir = mkdtempSync(join(tmpdir(), 'alethia-video-'));
  const audioPath = join(tmpDir, `${basename(filePath)}.wav`);

  try {
    await execAsync(
      `"${ffmpeg}" -i "${filePath}" -vn -acodec pcm_s16le -ar 16000 -ac 1 "${audioPath}" -y`,
      { maxBuffer: 100 * 1024 * 1024 }
    );

    const audioResult = await transcribeAudio(audioPath);
    
    const frameDescriptions = await extractFramesAndAnalyze(filePath, ffmpeg, tmpDir);

    const videoText = [audioResult.text, ...frameDescriptions].filter(Boolean).join('\n\n');

    return {
      text: videoText,
      segments: audioResult.segments,
      warnings: [...warnings, ...audioResult.warnings],
      frames: frameDescriptions
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

async function extractFramesAndAnalyze(filePath: string, ffmpeg: string, tmpDir: string): Promise<string[]> {
  const descriptions: string[] = [];
  
  try {
    const frameDir = join(tmpDir, 'frames');
    await execAsync(`mkdir -p "${frameDir}"`);
    
    await execAsync(
      `"${ffmpeg}" -i "${filePath}" -vf "fps=1" -q:v 2 "${frameDir}/frame_%03d.jpg" -y`,
      { maxBuffer: 50 * 1024 * 1024 }
    );

    const frames = (await import('fs')).default.readdirSync(frameDir).filter(f => f.endsWith('.jpg'));
    
    for (const frameFile of frames.slice(0, 10)) {
      const framePath = join(frameDir, frameFile);
      const buffer = readFileSync(framePath);
      try {
        const result = await processImage(buffer, 'image/jpeg');
        if (result.description) {
          descriptions.push(`[画面 ${frameFile}] ${result.description}`);
        }
      } catch (err) {
        logger.warn({ err, framePath }, '帧分析失败，跳过');
      }
    }
  } catch (err) {
    logger.warn({ err, filePath }, '帧提取失败，仅使用音频转录');
  }
  
  return descriptions;
}