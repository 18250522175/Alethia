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
  causalEdges: ParsedCausalEdge[];
  causalCpt: ParsedCausalCPT | null;
  hyperRelations: ParsedHyperEdge[];
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

export interface ParsedCausalEdge {
  sourceSlug: string;
  targetSlug: string;
  relation: string;
  lag: string;
  weight: number;
  conf: number;
  evidence: string[];
}

export interface ParsedHyperEdge {
  id: string;
  sourceSlugs: string[];
  targetSlugs: string[];
  type: string;
  params: Record<string, any>;
}

export interface ParsedCausalCPT {
  variableSlug: string;
  parentVariables: string[];
  states: string[];
  table: Array<Record<string, string>>;
}

const SECTION_NAMES = [
  'State',
  'Assessment',
  'Open Threads',
  'Relations',
  'Timeline',
  'Version History',
  'Semantic Rings Archive',
  'Evidence',
  'Causal Model',
  'Causal CPT',
  'Hyper Relations'
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
    const causalResult = this.parseCausalEdges(this.getSectionByPrefix(sections, 'Causal Model'));
    const causalEdges = causalResult.edges;
    const causalCptKey = Object.keys(sections).find(k => k.startsWith('Causal CPT')) || '';
    const causalCpt = this.parseCausalCPT(sections[causalCptKey] || '', causalCptKey);
    const hyperRelations = [
      ...this.parseHyperRelations(sections['Hyper Relations'] || ''),
      ...causalResult.hyperEdges
    ];

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
      evidence,
      causalEdges,
      causalCpt,
      hyperRelations
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

  private getSectionByPrefix(sections: Record<string, string>, prefix: string): string {
    for (const key of Object.keys(sections)) {
      if (key === prefix || key.startsWith(prefix)) {
        return sections[key];
      }
    }
    return '';
  }

  private parseCausalEdges(text: string): { edges: ParsedCausalEdge[]; hyperEdges: ParsedHyperEdge[] } {
    const edges: ParsedCausalEdge[] = [];
    const hyperEdges: ParsedHyperEdge[] = [];
    const lines = text.split('\n').filter(l => l.trim().startsWith('-'));

    for (const line of lines) {
      // Try multi-source hyperedge regex first: supports [A], [B], [C] and optional HC1: prefix
      const multiMatch = line.match(/^\s*-\s*(?:([A-Za-z]+[A-Za-z0-9]*)\s*:\s*)?\[([^\]]+(?:\],\s*\[[^\]]+)*)\]\s*--(:[a-zA-Z]+(?:\([^)]*\))?)-->\s*\[([^\]]+(?:\],\s*\[[^\]]+)*)\]\s*(?:\(([^)]*)\))?\s*$/);
      if (multiMatch) {
        const edgeId = multiMatch[1] || '';
        const sourcesRaw = multiMatch[2].trim();
        const relation = multiMatch[3].replace(/^:/, '');
        const targetsRaw = multiMatch[4].trim();
        const paramsStr = multiMatch[5] || '';

        // Parse individual source/target names from comma-separated bracket format
        const sourceNames = sourcesRaw.split(/\],\s*\[/).map(s => s.trim()).filter(Boolean);
        const targetNames = targetsRaw.split(/\],\s*\[/).map(s => s.trim()).filter(Boolean);

        // Parse params
        let lag = '';
        let weight = 0;
        let conf = 0.5;
        const evidence: string[] = [];
        const params: Record<string, any> = {};

        if (paramsStr) {
          const parts = paramsStr.split(',').map(s => s.trim());
          for (const part of parts) {
            const kv = part.match(/^(\w+)\s*:\s*(.+)$/);
            if (kv) {
              const k = kv[1].trim();
              const v = kv[2].trim();
              switch (k) {
                case 'lag':
                  lag = v;
                  params[k] = v;
                  break;
                case 'weight':
                  weight = parseFloat(v) || 0;
                  params[k] = weight;
                  break;
                case 'conf':
                  conf = parseFloat(v) || 0.5;
                  params[k] = conf;
                  break;
                case 'evidence':
                  evidence.push(...v.split(',').map(s => s.trim()).filter(s => s.length > 0));
                  params[k] = evidence;
                  break;
                default:
                  params[k] = v;
                  break;
              }
            }
          }
        }

        const sourceSlugs = sourceNames.map(n => this.nameToSlug(n));
        const targetSlugs = targetNames.map(n => this.nameToSlug(n));

        // Create one ParsedCausalEdge per source-target pair
        for (const sourceName of sourceNames) {
          for (const targetName of targetNames) {
            edges.push({
              sourceSlug: this.nameToSlug(sourceName),
              targetSlug: this.nameToSlug(targetName),
              relation,
              lag,
              weight,
              conf,
              evidence
            });
          }
        }

        // If multiple sources, also create a ParsedHyperEdge
        if (sourceNames.length > 1 || targetNames.length > 1) {
          const hyperId = edgeId || `H${hyperEdges.length + 1}`;
          hyperEdges.push({
            id: hyperId,
            sourceSlugs,
            targetSlugs,
            type: relation,
            params: { ...params, conf, evidence }
          });
        }

        continue;
      }

      // Fallback: original single-source regex
      const match = line.match(/^\s*-\s*\[([^\]]+)\]\s*--(:[a-zA-Z]+(?:\([^)]*\))?)-->\s*\[([^\]]+)\]\s*(?:\(([^)]*)\))?\s*$/);
      if (match) {
        const sourceName = match[1].trim();
        const relation = match[2].replace(/^:/, '');
        const targetName = match[3].trim();
        const paramsStr = match[4] || '';

        const sourceSlug = this.nameToSlug(sourceName);
        const targetSlug = this.nameToSlug(targetName);

        let lag = '';
        let weight = 0;
        let conf = 0.5;
        const evidence: string[] = [];

        if (paramsStr) {
          const parts = paramsStr.split(',').map(s => s.trim());
          for (const part of parts) {
            const kv = part.match(/^(\w+)\s*:\s*(.+)$/);
            if (kv) {
              const k = kv[1].trim();
              const v = kv[2].trim();
              switch (k) {
                case 'lag':
                  lag = v;
                  break;
                case 'weight':
                  weight = parseFloat(v) || 0;
                  break;
                case 'conf':
                  conf = parseFloat(v) || 0.5;
                  break;
                case 'evidence':
                  evidence.push(...v.split(',').map(s => s.trim()).filter(s => s.length > 0));
                  break;
              }
            }
          }
        }

        edges.push({
          sourceSlug,
          targetSlug,
          relation,
          lag,
          weight,
          conf,
          evidence
        });
      }
    }

    return { edges, hyperEdges };
  }

  private parseCausalCPT(text: string, headingKey: string): ParsedCausalCPT | null {
    if (!text.trim()) return null;

    const lines = text.split('\n').filter(l => l.trim().length > 0);

    // 从 heading key 提取变量名 (格式: Causal CPT (变量名))
    const headingMatch = headingKey.match(/^Causal\s+CPT\s*\((.+)\)$/);
    const variableName = headingMatch ? headingMatch[1].trim() : '';
    const variableSlug = variableName ? this.nameToSlug(variableName) : '';

    // 找到表格行（以 | 开头和结尾的行）
    const tableLines = lines.filter(l => l.trim().startsWith('|') && l.trim().endsWith('|'));

    if (tableLines.length < 2) return null;

    // 解析表头
    const headerCells = tableLines[0].split('|').map(c => c.trim()).filter(c => c.length > 0);
    const separatorLine = tableLines[1];
    // 跳过分隔行（如 |---|---|），找到数据行
    const dataStartIndex = separatorLine.match(/^\|[\s\-:]+\|/) ? 2 : 1;

    // 表头第一个是变量名或状态列，其余是父变量
    const states: string[] = [];
    const parentVariables: string[] = [];
    let stateColIndex = -1;

    for (let i = 0; i < headerCells.length; i++) {
      const cell = headerCells[i];
      if (cell.toLowerCase() === 'state' || cell === '状态') {
        stateColIndex = i;
      } else {
        parentVariables.push(cell);
      }
    }

    const table: Array<Record<string, string>> = [];

    for (let i = dataStartIndex; i < tableLines.length; i++) {
      const cells = tableLines[i].split('|').map(c => c.trim()).filter(c => c.length > 0);
      if (cells.length < headerCells.length) continue;

      const row: Record<string, string> = {};

      for (let j = 0; j < headerCells.length; j++) {
        if (j === stateColIndex) {
          const state = cells[j];
          if (!states.includes(state)) {
            states.push(state);
          }
        }
        row[headerCells[j]] = cells[j] || '';
      }

      table.push(row);
    }

    return {
      variableSlug,
      parentVariables,
      states,
      table
    };
  }

  private parseHyperRelations(text: string): ParsedHyperEdge[] {
    const hyperEdges: ParsedHyperEdge[] = [];
    const lines = text.split('\n').filter(l => l.trim().startsWith('-'));

    for (const line of lines) {
      // Match format: - H1: [A], [B], [C] --:jointlyCause--> [D] (conf:0.9, evidence:span_12, context: 2026-07-09 会议)
      const match = line.match(/^\s*-\s*(?:([A-Za-z]+[A-Za-z0-9]*)\s*:\s*)?\[([^\]]+(?:\],\s*\[[^\]]+)*)\]\s*--(:[a-zA-Z]+(?:\([^)]*\))?)-->\s*\[([^\]]+(?:\],\s*\[[^\]]+)*)\]\s*(?:\(([^)]*)\))?\s*$/);
      if (!match) continue;

      const edgeId = match[1] || '';
      const sourcesRaw = match[2].trim();
      const relation = match[3].replace(/^:/, '');
      const targetsRaw = match[4].trim();
      const paramsStr = match[5] || '';

      const sourceNames = sourcesRaw.split(/\],\s*\[/).map(s => s.trim()).filter(Boolean);
      const targetNames = targetsRaw.split(/\],\s*\[/).map(s => s.trim()).filter(Boolean);

      const sourceSlugs = sourceNames.map(n => this.nameToSlug(n));
      const targetSlugs = targetNames.map(n => this.nameToSlug(n));

      const params: Record<string, any> = {};

      if (paramsStr) {
        // Parse params: conf:0.9, evidence:span_12, context: 2026-07-09 会议
        const parts = paramsStr.split(/,(?![^(]*\))/).map(s => s.trim());
        for (const part of parts) {
          const kv = part.match(/^(\w+)\s*:\s*(.+)$/);
          if (kv) {
            const k = kv[1].trim();
            const v = kv[2].trim();
            switch (k) {
              case 'conf':
                params[k] = parseFloat(v) || 0.5;
                break;
              case 'evidence':
                params[k] = v.split(',').map(s => s.trim()).filter(s => s.length > 0);
                break;
              default:
                params[k] = v;
                break;
            }
          }
        }
      }

      const hyperId = edgeId || `H${hyperEdges.length + 1}`;
      hyperEdges.push({
        id: hyperId,
        sourceSlugs,
        targetSlugs,
        type: relation,
        params
      });
    }

    return hyperEdges;
  }

  private nameToSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^\w\u4e00-\u9fa5-]/g, '');
  }
}

export const parser = new CompiledTruthParser();
