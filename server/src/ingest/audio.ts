import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import logger from '../i18n/logger';

const execAsync = promisify(exec);

export interface AudioSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscribeResult {
  text: string;
  segments: AudioSegment[];
  warnings: string[];
}

/**
 * 检查 whisper-cli 可执行文件是否存在。
 * 优先使用 Bun.which，回退到 `command -v`。
 */
function findWhisper(): string | null {
  try {
    const bunWhich = (globalThis as any).Bun?.which;
    if (typeof bunWhich === 'function') {
      const p = bunWhich('whisper-cli') || bunWhich('whisper');
      if (p) return p;
    }
  } catch {
    /* Bun.which 不可用 */
  }
  try {
    const out = execSync('command -v whisper-cli 2>/dev/null || command -v whisper 2>/dev/null', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    return out || null;
  } catch (err) {
    logger.warn({ err }, 'whisper 可执行文件检测失败');
    return null;
  }
}

/**
 * 转录音频文件，输出带时间码的转录文本：`[00:00:00] 文本`。
 * 缺失 whisper 时返回警告 + 空结果。
 */
export async function transcribeAudio(filePath: string, maxRetries: number = 2): Promise<TranscribeResult> {
  const warnings: string[] = [];
  const whisperBin = findWhisper();

  if (!whisperBin) {
    warnings.push('未找到 whisper-cli 可执行文件，音频转录已跳过（返回空结果）');
    logger.warn({ filePath }, 'whisper-cli 不可用，音频转录已跳过');
    return { text: '', segments: [], warnings };
  }

  const tmpDir = mkdtempSync(join(tmpdir(), 'alethia-whisper-'));

  try {
    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try {
        const baseName = join(tmpDir, 'out');
        await execAsync(
          `"${whisperBin}" "${filePath}" --output_format json -of "${baseName}"`,
          {
            maxBuffer: 100 * 1024 * 1024,
          }
        );

        const outputFile = baseName + '.json';
        if (!existsSync(outputFile)) {
          throw new Error('whisper 未生成 JSON 输出文件');
        }

        const data = JSON.parse(readFileSync(outputFile, 'utf-8'));
        const segments: AudioSegment[] = (data.segments || []).map((s: any) => ({
          start: typeof s.start === 'number' ? s.start : 0,
          end: typeof s.end === 'number' ? s.end : 0,
          text: String(s.text || '').trim()
        }));

        const text = segments
          .map(s => `[${formatTimecode(s.start)}] ${s.text}`)
          .join('\n');

        return { text, segments, warnings };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (attempt <= maxRetries) {
          warnings.push(`音频转录第 ${attempt} 次尝试失败：${msg}（将重试）`);
          logger.warn({ err, filePath, attempt }, `音频转录第 ${attempt} 次尝试失败，将重试`);
          await new Promise(r => setTimeout(r, 1000 * attempt));
        } else {
          warnings.push(`音频转录失败（已重试 ${maxRetries} 次）：${msg}`);
          logger.error({ err, filePath }, '音频转录失败');
          return { text: '', segments: [], warnings };
        }
      }
    }
    return { text: '', segments: [], warnings };
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

function formatTimecode(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
}
