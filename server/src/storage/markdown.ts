import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join, relative, extname } from 'path';
import { createHash } from 'crypto';
import logger from '../i18n/logger';
import { loadEnv } from '../config/loader';

export class MarkdownStorage {
  private rootPath: string;
  private wikiPath: string;
  private rawPath: string;
  private summariesPath: string;
  private changelogPath: string;
  private libraryPath: string;

  constructor() {
    const env = loadEnv();
    this.rootPath = env.LIBRARY_PATH ? env.LIBRARY_PATH.replace(/\/library\/?.*$/, '') : process.cwd();
    this.wikiPath = env.WIKI_PATH || join(this.rootPath, 'wiki');
    this.rawPath = env.RAW_PATH || join(this.rootPath, 'raw');
    this.summariesPath = env.SUMMARIES_PATH || join(this.rootPath, 'summaries');
    this.changelogPath = env.CHANGELOG_PATH || join(this.rootPath, 'changelog');
    this.libraryPath = env.LIBRARY_PATH || join(this.rootPath, 'library', 'objects');

    this.ensureDirs();
  }

  private ensureDirs(): void {
    const dirs = [this.wikiPath, this.rawPath, this.summariesPath, this.changelogPath, this.libraryPath];
    for (const dir of dirs) {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
        logger.debug(`创建目录: ${dir}`);
      }
    }
  }

  getWikiPath(): string {
    return this.wikiPath;
  }

  getRawPath(): string {
    return this.rawPath;
  }

  getSummariesPath(): string {
    return this.summariesPath;
  }

  getChangelogPath(): string {
    return this.changelogPath;
  }

  getLibraryPath(): string {
    return this.libraryPath;
  }

  getSkillsPath(): string {
    return join(this.rootPath, 'skills');
  }

  saveLibraryFile(hash: string, content: Buffer): void {
    const filePath = join(this.libraryPath, hash);
    this.writeFile(filePath, content);
  }

  readFile(filePath: string): string {
    return readFileSync(filePath, 'utf-8');
  }

  writeFile(filePath: string, content: string | Buffer): void {
    const dir = join(filePath, '..');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(filePath, content);
  }

  atomicWrite(filePath: string, content: string): void {
    const backupPath = filePath + '.bak';
    if (existsSync(filePath)) {
      writeFileSync(backupPath, readFileSync(filePath));
    }
    try {
      writeFileSync(filePath, content, 'utf-8');
      if (existsSync(backupPath)) {
        unlinkSync(backupPath);
      }
    } catch (err) {
      if (existsSync(backupPath)) {
        try {
          writeFileSync(filePath, readFileSync(backupPath));
        } catch (_) {
          // 恢复备份失败，确保备份文件被清理
        }
        try {
          unlinkSync(backupPath);
        } catch (_) {
          // 清理备份文件失败，继续抛出原始错误
        }
      }
      throw err;
    }
  }

  listWikiFiles(): string[] {
    return this.listMdFiles(this.wikiPath);
  }

  listSummaryFiles(): string[] {
    return this.listMdFiles(this.summariesPath);
  }

  listChangelogFiles(): string[] {
    return this.listMdFiles(this.changelogPath);
  }

  private listMdFiles(dir: string): string[] {
    const result: string[] = [];
    if (!existsSync(dir)) return result;

    const walk = (currentDir: string) => {
      const entries = readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(currentDir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile() && extname(entry.name).toLowerCase() === '.md') {
          result.push(fullPath);
        }
      }
    };

    walk(dir);
    return result;
  }

  getFileHash(filePath: string): string {
    const content = readFileSync(filePath);
    return createHash('sha256').update(content).digest('hex');
  }

  getFileMtime(filePath: string): number {
    return statSync(filePath).mtimeMs;
  }

  getRelativePath(filePath: string, baseDir: string): string {
    return relative(baseDir, filePath);
  }
}

export const storage = new MarkdownStorage();
