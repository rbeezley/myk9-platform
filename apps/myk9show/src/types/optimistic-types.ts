export type OperationStatus = 
  | 'pending'
  | 'confirmed'
  | 'failed'
  | 'retrying'
  | 'rolling_back'
  | 'rolled_back'
  | 'rollback_failed';

export type OperationType = 'create' | 'update' | 'delete' | 'batch';

export interface OptimisticOperation {
  id: string;
  type: OperationType;
  entityType: string;
  entityId: string;
  timestamp: number;
  status: OperationStatus;
  payload: unknown;
  rollbackStrategy: string;
  retryCount: number;
  maxRetries: number;
  result?: unknown;
  error?: unknown;
}

export interface OptimisticUpdate<T = unknown> {
  type: OperationType;
  entityType: string;
  entityId: string;
  payload: T;
  rollbackStrategy?: string;
  maxRetries?: number;
  execute: () => Promise<unknown>;
  onSuccess?: (result: unknown) => void;
  onError?: (error: unknown) => void;
  onRollback?: () => void;
}

export interface OptimisticState {
  isOptimistic: boolean;
  operationId?: string;
  timestamp?: number;
  originalData?: unknown;
}

export interface RollbackStrategy {
  name: string;
  rollback: (snapshot: unknown, operation: OptimisticOperation) => Promise<void>;
}

export type ConflictResolutionStrategy = 
  | 'local_wins' 
  | 'server_wins' 
  | 'merge' 
  | 'user_choice';

export interface ConflictResolution {
  strategy: ConflictResolutionStrategy;
  mergedData?: unknown;
  userMessage?: string;
}

export interface OptimisticUIConfig {
  defaultRetries: number;
  rollbackDelay: number;
  confirmationTimeout: number;
  enableUndo: boolean;
  showProgressIndicators: boolean;
}

export interface PendingOperationSummary {
  total: number;
  byStatus: Record<OperationStatus, number>;
  byEntityType: Record<string, number>;
  oldestOperation?: OptimisticOperation;
}

export interface OptimisticUIEvent {
  type: 'optimisticUpdate' | 'operationConfirmed' | 'rollbackStarted' | 'rollbackCompleted' | 'conflictDetected';
  operationId: string;
  data?: unknown;
}

// Specific entity optimistic states
export interface OptimisticDog {
  id: string;
  name: string;
  breed: string;
  _optimistic?: OptimisticState;
}

export interface OptimisticEntry {
  id: string;
  dogId: string;
  showId: string;
  classId: string;
  status: 'pending' | 'confirmed' | 'withdrawn';
  _optimistic?: OptimisticState;
}

export interface OptimisticScore {
  id: string;
  entryId: string;
  judgeId: string;
  score: number;
  placement?: number;
  _optimistic?: OptimisticState;
}

// UI Component Props
export interface OptimisticUpdateIndicatorProps {
  operationId?: string;
  showCount?: boolean;
  size?: 'sm' | 'md' | 'lg';
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
}

export interface SuccessConfirmationProps {
  message: string;
  showUndo?: boolean;
  undoAction?: () => void;
  duration?: number;
}

export interface RollbackNotificationProps {
  operationId: string;
  error?: unknown;
  retryAction?: () => void;
  dismissAction?: () => void;
}

export interface ProgressOverlayProps {
  operations: OptimisticOperation[];
  showDetails?: boolean;
  allowCancel?: boolean;
  onCancel?: (operationId: string) => void;
}

export interface UndoToastProps {
  operationId: string;
  message: string;
  undoAction: () => void;
  timeout?: number;
}