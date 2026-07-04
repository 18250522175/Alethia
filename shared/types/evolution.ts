export interface RebuildReport {
  pages: number;
  links: number;
  ghostCount: number;
  durationMs: number;
}

export interface ExtractReport {
  processed: number;
  pendingDiffsCreated: number;
  errors: { filePath: string; message: string }[];
}

export interface EvalReport {
  totalBenchmarks: number;
  correctness: number;
  reproducedErrors: number;
  newErrors: number;
  anomalyFlagged: boolean;
  gitCommit?: string;
  trend: number[];
  runAt: string;
}

export interface ArchiveReport {
  slug?: string;
  archivedCount: number;
  summary: string;
  changelogPath: string;
}

export interface GhostReport {
  detected: number;
  marked: number;
  generatedDiffs: number;
}

export interface GenerateReport {
  outputPath: string;
  renderedPages: number;
  copiedMedia: number;
  durationMs: number;
}

export interface StaticSiteOptions {
  includeMedia?: boolean;
  includeGraph?: boolean;
  theme?: 'light' | 'dark';
}

export interface EvalAnomalyFlag {
  id: string;
  metric: string;
  threshold: number;
  actual: number;
  ts: string;
  message: string;
}
