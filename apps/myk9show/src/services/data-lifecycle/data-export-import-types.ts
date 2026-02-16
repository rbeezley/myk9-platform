/** Base interface for any exportable/importable record */
export interface ExportableRecord {
  id?: string;
  createdAt?: string | Date;
  date?: string | Date;
  [key: string]: unknown;
}

/** Type alias for a dataset containing multiple record types */
export type ExportDataSet = Record<string, unknown[]>;

/** Type guard to check if an object has an id property */
export function hasId(obj: unknown): obj is { id: string } {
  return typeof obj === 'object' && obj !== null && 'id' in obj && typeof (obj as { id: unknown }).id === 'string';
}

/** Type guard to check if an object has date properties */
export function hasDateProps(obj: unknown): obj is { createdAt?: string | Date; date?: string | Date } {
  return typeof obj === 'object' && obj !== null;
}

export type ExportFormat = 'json' | 'csv' | 'excel' | 'zip';

export interface ExportOptions {
  format: ExportFormat;
  includeMetadata: boolean;
  compress: boolean;
  encryption?: {
    enabled: boolean;
    password?: string | undefined;
  } | undefined;
  filters?: {
    dateRange?: { start: Date; end: Date } | undefined;
    types?: string[] | undefined;
    ids?: string[] | undefined;
  } | undefined;
}

export interface ExportResult {
  success: boolean;
  filename: string;
  sizeBytes: number;
  recordCount: number;
  exportedAt: Date;
  error?: string | undefined;
}

export interface ImportOptions {
  validateData: boolean;
  mergeStrategy: 'replace' | 'merge' | 'skip';
  dryRun: boolean;
  transformers?: Record<string, (data: unknown) => unknown> | undefined;
}

export interface ImportResult {
  success: boolean;
  recordsImported: number;
  recordsSkipped: number;
  recordsFailed: number;
  errors: string[];
  warnings: string[];
}

export interface ExportManifest {
  version: string;
  exportedAt: string;
  exportedBy: string;
  dataTypes: string[];
  recordCounts: Record<string, number>;
  checksum?: string | undefined;
  compression?: string | undefined;
  encryption?: string | undefined;
}
