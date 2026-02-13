/**
 * Shared types for OfflineDataManager sub-components
 */

export interface StorageQuota {
  used: number; // bytes
  available: number; // bytes
  total: number; // bytes
  usagePercentage: number;
}

export interface BackupInfo {
  id: string;
  name: string;
  type: 'auto' | 'manual';
  createdAt: Date;
  size: number;
  entities: string[];
  compressed: boolean;
  metadata: {
    version: string;
    deviceId: string;
    entryCount: number;
  };
}

export interface ExportOptions {
  format: 'json' | 'csv' | 'xlsx';
  entities: string[];
  dateRange?: {
    start: Date;
    end: Date;
  };
  includeDeleted: boolean;
  compressed: boolean;
}

export interface EntityInfo {
  id: string;
  label: string;
  icon: string;
  count: number;
}

export interface StorageBreakdownItem {
  entity: string;
  size: number;
  percentage: number;
}
