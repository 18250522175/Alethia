export interface HealthDashboard {
  scale: { nodes: number; edges: number; pages: number; trend: number[] };
  contextHeatmap: { context: string; activity: number }[];
  reviewBacklog: { green: number; yellow: number; red: number };
  aiQuality: { correctness: number; trend: number[] };
  budget: {
    daily: { spent: number; limit: number; exceeded: boolean };
    monthly: { spent: number; limit: number; exceeded: boolean };
    perQueryLimit: number;
  };
  ghostRelations: number;
  archiveStatus: { activeVersions: number; archivedVersions: number };
  cacheHitRate: number;
  brokenEvidenceChains: number;
  orphanedFiles: number;
  observedFiles: number;
  lastUpdated: string;
}
