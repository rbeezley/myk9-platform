import type { ResolutionStrategy } from '../../types/sync-types';

export interface ConflictResolverConfig {
  defaultStrategy: ResolutionStrategy;
  autoResolveThreshold: number; // 0-1, confidence threshold for auto-resolution
  maxConflictAge: number; // ms, how long to keep unresolved conflicts
  enableSmartMerging: boolean;
  enableFieldLevelResolution: boolean;
  enableUserPreferences: boolean;
}

export interface ConflictMetrics {
  totalConflicts: number;
  resolvedConflicts: number;
  autoResolvedConflicts: number;
  manualResolvedConflicts: number;
  conflictsByStrategy: Record<ResolutionStrategy, number>;
  averageResolutionTime: number;
  conflictsByEntity: Record<string, number>;
}

export interface FieldConflict {
  fieldName: string;
  localValue: unknown;
  remoteValue: unknown;
  baseValue?: unknown; // For three-way merge
  suggestion: ResolutionStrategy;
  confidence: number;
  reason: string;
}

export interface MergeResult {
  success: boolean;
  mergedData: Record<string, unknown>;
  conflicts: FieldConflict[];
  warnings: string[];
  confidence: number;
}
