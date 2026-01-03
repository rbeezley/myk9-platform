// Minimal types for database connection and stores
export interface CompressedData {
  data: unknown;
  compressed: boolean;
  originalSize: number;
  compressedSize: number;
  timestamp: Date;
  algorithm: string;
  _isCompressed: true;
}

// Minimal types for database schema
export interface SyncMetadataRecord {
  id: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown>;
}

export interface SyncQueueRecord {
  id: string;
  entityType: string;
  entityId: string;
  operation: string;
  data: string;
  timestamp: Date;
  retryCount: number;
  status: string;
  error?: string;
  priority: number;
}

export interface ConflictRecord {
  id: string;
  entityType: string;
  entityId: string;
  localData: Record<string, unknown>;
  remoteData: Record<string, unknown>;
  conflicts: Array<Record<string, unknown>>;
  createdAt: Date;
  resolution?: Record<string, unknown>;
  status: string;
}

export interface SyncSessionRecord {
  id: string;
  startedAt: Date;
  endedAt?: Date;
  status: string;
  itemsProcessed: number;
  itemsFailed: number;
  conflictsFound: number;
  logs: string[];
}

// For store usage
export interface SyncQueueItem {
  id: string;
  entityType: string;
  entityId: string;
  operation: 'create' | 'update' | 'delete';
  data: Record<string, unknown>;
  priority: 'low' | 'medium' | 'high' | 'critical';
  attempts: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  timestamp: Date;
  retryCount: number;
}

export interface SyncEventMap {
  // Minimal event map
  [key: string]: unknown;
}