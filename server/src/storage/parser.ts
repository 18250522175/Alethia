import matter from 'gray-matter';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkFrontmatter from 'remark-frontmatter';
import logger from '../i18n/logger';

export interface ParsedPage {
  slug: string;
  path: string;
  title: string;
  type: string;
  contexts: string[];
  aliases: string[];
  rawMd: string;
  contentMd: string;
  parsedJson: Record<string, unknown>;
  state: string;
  assessment: string;
  openThreads: string[];
  relations: ParsedRelation[];
  timeline: ParsedTimelineEntry[];
  versionHistory: ParsedVersionEntry[];
  semanticRings: string[];
  evidence: ParsedEvidence[];
}

export interface ParsedRelation {
  targetSlug: string;
  targetName: string;
  relation: string;
}

export interface ParsedTimelineEntry {
  date: string;
  type: string;
  description: string;
}

export interface ParsedVersionEntry {
  version: string;
  date: string;
  summary: string;
}

export interface ParsedEvidence {
  spanId: string;
  source: string;
  text: string;
}

const SECTION_NAMES = [
  'State',
  'Assessment',
  'Open Threads',
  'Relations',
  'Timeline',
  'Version History',
  'Semantic Rings Archive',
  'Evidence'
];

export class CompiledTruthParser {
  async parse(filePath: string, rawContent: string): Promise<ParsedPage> {
    const { data, content } = matter(rawContent);

    const sections = this.extractSections(content);

    const slug = data.canonical_slug || this.slugFromPath(filePath);
    const title = data.title || this.extractTitle(content) || slug;
    const type = data.type || 'concept';
    const contexts = Array.isArray(data.contexts) ? data.contexts : [];
    const aliases = Array.isArray(data.aliases) ? data.aliases : [];

    const relations = this.parseRelations(sections['Relations'] || '');
    const timeline = this.parseTimeline(sections['Timeline'] || '');
    const versionHistory = this.parseVersionHistory(sections['Version History'] || '');
    const openThreads = this.parseOpenThreads(sections['Open Threads'] || '');
    const evidence = this.parseEvidence(sections['Evidence'] || '');
    const semanticRings = this.parseSemanticRings(sections['Semantic Rings Archive'] || '');

    return {
      slug,
      path: filePath,
      title,
      type,
      contexts,
      aliases,
      rawMd: rawContent,
      contentMd: content,
      parsedJson: {
        frontmatter: data,
        sections
      },
      state: sections['State'] || '',
      assessment: sections['Assessment'] || '',
      openThreads,
      relations,
      timeline,
      versionHistory,
      semanticRings,
      evidence
    };
  }

  private extractSections(content: string): Record<string, string> {
    const sections: Record<string, string> = {};
    const lines = content.split('\n');

    let currentSection = 'Introduction';
    let currentLines: string[] = [];

    for (const line of lines) {
      const headingMatch = line.match(/^##\s+(.+)$/);
      if (headingMatch) {
        sections[currentSection] = currentLines.join('\n').trim();
        currentSection = headingMatch[1].trim();
        currentLines = [];
      } else {
        currentLines.push(line);
      }
    }

    sections[currentSection] = currentLines.join('\n').trim();
    return sections;
  }

  private extractTitle(content: string): string | null {
    const match = content.match(/^#\s+(.+)$/m);
    return match ? match[1].trim() : null;
  }

  private slugFromPath(filePath: string): string {
    const parts = filePath.split(/[/\\]/);
    let fileName = parts[parts.length - 1];
    fileName = fileName.replace(/\.md$/i, '');
    return fileName;
  }

  private parseRelations(text: string): ParsedRelation[] {
    const relations: ParsedRelation[] = [];
    const lines = text.split('\n').filter(l => l.trim().startsWith('-'));

    for (const line of lines) {
      const match = line.match(/-\s*\[\[([^\]]+)\]\]\s*[·•-]\s*(.+)/);
      if (match) {
        const targetName = match[1].trim();
        const relation = match[2].trim();
        const targetSlug = this.nameToSlug(targetName);
        relations.push({ targetSlug, targetName, relation });
      }
    }

    return relations;
  }

  private parseTimeline(text: string): ParsedTimelineEntry[] {
    const entries: ParsedTimelineEntry[] = [];
    const lines = text.split('\n').filter(l => l.trim().startsWith('-'));

    for (const line of lines) {
      const match = line.match(/-\s*([\d-]+)\s*[·•-]\s*([^·•-]+)[·•-]\s*(.+)/);
      if (match) {
        entries.push({
          date: match[1].trim(),
          type: match[2].trim(),
          description: match[3].trim()
        });
      }
    }

    return entries;
  }

  private parseVersionHistory(text: string): ParsedVersionEntry[] {
    const entries: ParsedVersionEntry[] = [];
    const lines = text.split('\n').filter(l => l.trim().startsWith('-'));

    for (const line of lines) {
      const match = line.match(/-\s*([^\s]+)\s*[·•-]\s*([\d-]+)\s*[·•-]\s*(.+)/);
      if (match) {
        entries.push({
          version: match[1].trim(),
          date: match[2].trim(),
          summary: match[3].trim()
        });
      }
    }

    return entries;
  }

  private parseOpenThreads(text: string): string[] {
    const threads: string[] = [];
    const lines = text.split('\n').filter(l => l.trim().startsWith('-'));

    for (const line of lines) {
      const match = line.match(/-\s*\[.\]\s*(.+)/);
      if (match) {
        threads.push(match[1].trim());
      }
    }

    return threads;
  }

  private parseEvidence(text: string): ParsedEvidence[] {
    const evidence: ParsedEvidence[] = [];
    const lines = text.split('\n').filter(l => l.trim().startsWith('[^'));

    for (const line of lines) {
      const match = line.match(/\[([^\]]+)\]:\s*(.+)/);
      if (match) {
        const spanId = match[1].trim();
        const rest = match[2].trim();
        const colonIdx = rest.indexOf('·');
        const source = colonIdx > 0 ? rest.substring(0, colonIdx).trim() : '';
        const textContent = colonIdx > 0 ? rest.substring(colonIdx + 1).trim() : rest;
        evidence.push({ spanId, source, text: textContent });
      }
    }

    return evidence;
  }

  private parseSemanticRings(text: string): string[] {
    const rings: string[] = [];
    const lines = text.split('\n').filter(l => l.trim().startsWith('-'));

    for (const line of lines) {
      rings.push(line.replace(/^-\s*/, '').trim());
    }

    return rings;
  }

  private nameToSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^\w\u4e00-\u9fa5-]/g, '');
  }
}

export const parser = new CompiledTruthParser();
