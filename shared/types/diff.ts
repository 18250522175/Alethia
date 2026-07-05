export type DiffTier = 'green' | 'yellow' | 'red';

export type DiffType =
  'state' | 'assessment' | 'threads' | 'relations' | 'ghost_cleanup' | 'archive';

export interface PendingDiff {
  id: string;
  slug: string;
  type: DiffType;
  payload: {
    field: string;
    oldValue?: string;
    newValue: string;
    context?: string;
    evidenceSpanId?: string;
  };
  confidence: number;
  impact: 'low' | 'medium' | 'high';
  tier: DiffTier;
  createdAt: string;
  resolved: boolean;
}

export interface ApplyResult {
  diffId: string;
  applied: boolean;
  newVersion: number;
  modifiedFiles: string[];
}

export interface RollbackResult {
  batchId: string;
  restored: boolean;
  restoredFiles: string[];
  rebuildTriggered: boolean;
}
