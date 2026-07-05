import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import logger from '../i18n/logger';
import { storage } from './markdown';

export interface FileDelta {
  path: string;
  status: 'added' | 'modified' | 'deleted';
  hash: string;
}

export interface ManifestEntry {
  hash: string;
  mtime: number;
}

export class ManifestTracker {
  private manifestPath: string;
  private manifest: Record<string, ManifestEntry> = {};

  constructor() {
    this.manifestPath = join(storage.getWikiPath(), '..', '.manifest.json');
    this.load();
  }

  private load(): void {
    if (existsSync(this.manifestPath)) {
      try {
        const content = readFileSync(this.manifestPath, 'utf-8');
        this.manifest = JSON.parse(content);
      } catch (err) {
        logger.warn({ err }, '加载 manifest 失败，将重新创建');
        this.manifest = {};
      }
    }
  }

  save(): void {
    const dir = join(this.manifestPath, '..');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(this.manifestPath, JSON.stringify(this.manifest, null, 2), 'utf-8');
  }

  detectDelta(): { wiki: FileDelta[]; summaries: FileDelta[]; changelog: FileDelta[] } {
    return {
      wiki: this.detectDeltaForDir(storage.getWikiPath()),
      summaries: this.detectDeltaForDir(storage.getSummariesPath()),
      changelog: this.detectDeltaForDir(storage.getChangelogPath())
    };
  }

  private detectDeltaForDir(dir: string): FileDelta[] {
    const deltas: FileDelta[] = [];
    const currentFiles = new Set<string>();

    try {
      const mdFiles = this.listAllMdFiles(dir);
      for (const filePath of mdFiles) {
        const hash = storage.getFileHash(filePath);
        const mtime = storage.getFileMtime(filePath);
        currentFiles.add(filePath);

        const oldEntry = this.manifest[filePath];
        if (!oldEntry) {
          deltas.push({ path: filePath, status: 'added', hash });
        } else if (oldEntry.hash !== hash) {
          deltas.push({ path: filePath, status: 'modified', hash });
        }

        this.manifest[filePath] = { hash, mtime };
      }

      for (const oldPath of Object.keys(this.manifest)) {
        if (!currentFiles.has(oldPath) && oldPath.startsWith(dir)) {
          deltas.push({ path: oldPath, status: 'deleted', hash: '' });
          delete this.manifest[oldPath];
        }
      }
    } catch (err) {
      logger.error({ err, dir }, '检测文件 delta 失败');
    }

    return deltas;
  }

  private listAllMdFiles(dir: string): string[] {
    const result: string[] = [];

    const walk = (current: string) => {
      if (!existsSync(current)) return;

      const entries = readdirSync(current, { withFileTypes: true });
      for (const entry of entries) {
        const full = join(current, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          result.push(full);
        }
      }
    };

    walk(dir);
    return result;
  }

  updateEntry(path: string, hash: string, mtime: number): void {
    this.manifest[path] = { hash, mtime };
  }

  removeEntry(path: string): void {
    delete this.manifest[path];
  }

  getEntry(path: string): ManifestEntry | undefined {
    return this.manifest[path];
  }

  computeHash(content: string | Buffer): string {
    return createHash('sha256').update(content).digest('hex');
  }
}

export const manifest = new ManifestTracker();
