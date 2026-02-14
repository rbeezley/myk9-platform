import type { BaseConflictResolution, BaseConflict } from '@/types/conflict-types';
import type { Conflict } from '@/types/conflict-types';

export interface ConflictData {
  entityType: string;
  entityId: string;
  entityName: string;
  local: Record<string, unknown>;
  remote: Record<string, unknown>;
  conflictFields: string[];
  lastModified: {
    local: Date;
    remote: Date;
  };
  lastModifiedBy: {
    local: string;
    remote: string;
  };
  [key: string]: unknown;
}

export interface ExtendedConflict {
  id: string;
  conflictType: 'version_mismatch' | 'concurrent_edit' | 'data_mismatch';
  entityType: string;
  entityId: string;
  entityName?: string;
  localData: Record<string, unknown>;
  remoteData: Record<string, unknown>;
  fieldPath?: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  conflictFields: string[];
  createdAt: Date;
  detectedAt: Date;
  status: 'detected' | 'pending' | 'resolving' | 'resolved' | 'dismissed' | 'escalated' | 'expired';
  lastModified: {
    local: Date;
    remote: Date;
  };
  lastModifiedBy: {
    local: string;
    remote: string;
  };
}

export type ResolutionStrategy = 'local' | 'remote' | 'merge' | 'custom';

export interface ConflictResolution {
  conflictId: string;
  strategy: ResolutionStrategy;
  resolvedData: Record<string, unknown>;
  resolvedBy: string;
  resolvedAt: Date;
  metadata?: {
    mode?: string;
    confidence?: number;
    note?: string;
  };
}

export interface ConflictResolutionDialogProps {
  open?: boolean;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  onClose?: () => void;
  onCancel?: () => void;
  conflict: ConflictData | ExtendedConflict | Conflict | null;
  onResolve: (resolution: 'local' | 'remote' | 'merge', mergedData?: Record<string, unknown>) => void;
  isResolving?: boolean;
  onResolveAdvanced?: (resolution: ConflictResolution) => Promise<void>;
  onDismiss?: () => void;
  conflictResolver?: {
    getResolutionHistory?: (entityType: string, entityId: string) => Promise<BaseConflictResolution[]>;
    suggestResolution?: (conflict: ExtendedConflict | BaseConflict<Record<string, unknown>>) => { strategy: ResolutionStrategy; confidence: number } | null;
  };
}

export type ResolutionMode = 'quick' | 'detailed' | 'wizard' | 'history';

export interface ResolutionOption {
  strategy: ResolutionStrategy;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  confidence: number;
  recommended?: boolean;
}

export interface NormalizedConflict {
  entityType: string;
  entityId: string;
  entityName: string;
  local: Record<string, unknown>;
  remote: Record<string, unknown>;
  conflictFields: string[];
  lastModified: {
    local: Date;
    remote: Date;
  };
  lastModifiedBy: {
    local: string;
    remote: string;
  };
  [key: string]: unknown;
}
