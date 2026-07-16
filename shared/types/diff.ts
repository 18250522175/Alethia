export type DiffTier = 'green' | 'yellow' | 'red';

export type DiffType = 'state' | 'assessment' | 'threads' | 'relations' | 'ghost_cleanup' | 'archive' | 'ontology_violation' | 'library_extraction';

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
    message?: string;
    severity?: string;
    source?: string;
    exception?: boolean;
    exception_reason?: string;
    source_file?: string;
    original_name?: string;
  };
  confidence: number;
  impact: 'low' | 'medium' | 'high';
  tier: DiffTier;
  priority?: string;
  tags?: string[];
  source?: string;
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
