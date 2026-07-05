import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync
} from 'node:fs';
import { extname, join, relative } from 'node:path';
import logger from '../i18n/logger';

export class MarkdownStorage {
  private rootPath: string;
  private wikiPath: string;
  private rawPath: string;
  private summariesPath: string;
  private changelogPath: string;
  private libraryPath: string;

  constructor() {
    this.rootPath = process.cwd();
    this.wikiPath = join(this.rootPath, 'wiki');
    this.rawPath = join(this.rootPath, 'raw');
    this.summariesPath = join(this.rootPath, 'summaries');
    this.changelogPath = join(this.rootPath, 'changelog');
    this.libraryPath = join(this.rootPath, 'library', 'objects');

    this.ensureDirs();
  }

  private ensureDirs(): void {
    const dirs = [
      this.wikiPath,
      this.rawPath,
      this.summariesPath,
      this.changelogPath,
      this.libraryPath
    ];
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

  readFile(filePath: string): string {
    return readFileSync(filePath, 'utf-8');
  }

  writeFile(filePath: string, content: string): void {
    const dir = join(filePath, '..');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(filePath, content, 'utf-8');
  }

  atomicWrite(filePath: string, content: string): void {
    const backupPath = `${filePath}.bak`;
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
        writeFileSync(filePath, readFileSync(backupPath));
        unlinkSync(backupPath);
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
