/**
 * Core Types for MyK9Show Application
 * 
 * This file contains fundamental types that are used across multiple domains
 * in the application. It serves as the foundation for the type system.
 */

// ============================================================================
// Core Entity Types
// ============================================================================

/**
 * Base entity interface that all entities should extend
 */
export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  updatedBy?: string;
}

/**
 * Soft delete support for entities
 */
export interface SoftDeletable {
  deletedAt?: Date;
  deletedBy?: string;
  isDeleted?: boolean;
}

/**
 * Audit trail for entity changes
 */
export interface Auditable {
  version: number;
  auditTrail?: AuditEntry[];
}

export interface AuditEntry {
  version: number;
  action: 'created' | 'updated' | 'deleted' | 'restored';
  timestamp: Date;
  userId: string;
  changes?: FieldChange[];
  reason?: string;
}

export interface FieldChange {
  field: string;
  oldValue: unknown;
  newValue: unknown;
  timestamp: Date;
  userId: string;
}

// ============================================================================
// Sync and Offline Support
// ============================================================================

/**
 * Unified sync metadata for all syncable entities
 */
export interface SyncMetadata {
  // Core sync fields
  _version: number;
  _lastModified: string;
  _lastModifiedBy: string;
  _syncStatus: SyncStatus;
  
  // Offline support
  _localOnly?: boolean;
  _lastSyncedAt?: Date;
  _lastSyncedVersion?: number;
  _pendingChanges?: FieldChange[];
  
  // Conflict resolution
  _conflictVersion?: number;
  _conflictMarkers?: ConflictMarker[];
}

export type SyncStatus = 
  | 'synced'       // Up to date with server
  | 'pending'      // Has local changes waiting to sync
  | 'syncing'      // Currently synchronizing
  | 'conflict'     // Has unresolved conflicts
  | 'error'        // Sync failed
  | 'offline';     // Offline, sync queued

export interface ConflictMarker {
  field: string;
  conflictType: string;
  detectedAt: Date;
  resolvedAt?: Date;
}

/**
 * Syncable entity combines base entity with sync metadata
 */
export interface SyncableEntity extends BaseEntity {
  _sync?: SyncMetadata;
}

// ============================================================================
// Common Status Types
// ============================================================================

export type EntityStatus = 
  | 'draft'        // Being created/edited
  | 'pending'      // Awaiting approval/processing
  | 'active'       // Currently active/published
  | 'inactive'     // Temporarily disabled
  | 'archived'     // Completed but preserved
  | 'deleted';     // Soft deleted

export type ProcessingStatus = 
  | 'not_started'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'on_hold';

export type ApprovalStatus = 
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'requires_changes'
  | 'withdrawn';

// ============================================================================
// Common Data Types
// ============================================================================

export interface Address {
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

export interface ContactInfo {
  email?: string;
  phone?: string;
  mobile?: string;
  website?: string;
  address?: Address;
}

export interface PersonName {
  first: string;
  middle?: string;
  last: string;
  suffix?: string;
  preferred?: string;
}

export interface DateRange {
  start: Date;
  end: Date;
}

export interface TimeSlot {
  start: Date;
  end: Date;
  duration?: number; // milliseconds
}

// ============================================================================
// Pagination and Query Types
// ============================================================================

export interface PaginationParams {
  page: number;
  limit: number;
  offset?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export interface SortOptions {
  field: string;
  direction: 'asc' | 'desc';
}

export interface FilterOptions {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'like' | 'between';
  value: unknown;
}

export interface QueryOptions {
  sort?: SortOptions[];
  filters?: FilterOptions[];
  search?: string;
  include?: string[];
  fields?: string[];
}

// ============================================================================
// Result and Error Types
// ============================================================================

export interface Success<T = void> {
  success: true;
  data: T;
  message?: string;
}

export interface Failure {
  success: false;
  error: AppError;
  message: string;
}

export type Result<T = void> = Success<T> | Failure;

export interface AppError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  stack?: string;
  timestamp: Date;
  requestId?: string;
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
  value?: unknown;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings?: ValidationError[];
}

// ============================================================================
// User and Permission Types
// ============================================================================

export type UserRole = 
  | 'super_admin'
  | 'admin'
  | 'secretary'
  | 'judge'
  | 'steward'
  | 'exhibitor'
  | 'viewer';

export interface Permission {
  resource: string;
  action: string;
  conditions?: Record<string, unknown>;
}

export interface UserContext {
  userId: string;
  role: UserRole;
  permissions: Permission[];
  organizationId?: string;
  showId?: string | undefined;
}

// ============================================================================
// File and Media Types
// ============================================================================

export interface FileInfo {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  thumbnailUrl?: string;
  uploadedAt: Date;
  uploadedBy: string;
}

export interface ImageInfo extends FileInfo {
  width: number;
  height: number;
  alt?: string;
}

// ============================================================================
// Notification Types
// ============================================================================

export type NotificationType = 
  | 'info'
  | 'success'
  | 'warning'
  | 'error'
  | 'conflict';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  actions?: NotificationAction[];
  metadata?: Record<string, unknown>;
}

export interface NotificationAction {
  id: string;
  label: string;
  action: string;
  style?: 'primary' | 'secondary' | 'destructive';
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface AppConfig {
  environment: 'development' | 'staging' | 'production';
  version: string;
  buildDate: Date;
  features: Record<string, boolean>;
  limits: Record<string, number>;
}

// ============================================================================
// Utility Types
// ============================================================================

// Make all properties optional recursively
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

// Make specific properties required
export type RequireFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

// Omit fields from sync metadata
export type WithoutSync<T> = Omit<T, '_sync'>;

// Extract sync metadata
export type SyncMetadataOnly<T> = T extends { _sync?: infer S } ? S : never;

// Create update type (omit readonly fields)
export type UpdateInput<T> = Omit<T, 'id' | 'createdAt' | 'createdBy' | '_sync'>;

// Create create type (omit all generated fields)
export type CreateInput<T> = Omit<T, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy' | '_sync'>;

// ============================================================================
// Type Guards
// ============================================================================

export function isBaseEntity(obj: unknown): obj is BaseEntity {
  return typeof obj === 'object' && 
         obj !== null && 
         'id' in obj && 
         'createdAt' in obj && 
         'updatedAt' in obj;
}

export function isSyncableEntity(obj: unknown): obj is SyncableEntity {
  return isBaseEntity(obj) && ('_sync' in obj || true); // _sync is optional
}

export function hasValidId(id: unknown): id is string {
  return typeof id === 'string' && id.length > 0;
}

export function isValidDate(date: unknown): date is Date {
  return date instanceof Date && !isNaN(date.getTime());
}

// ============================================================================
// Constants
// ============================================================================

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_TIMEOUT = 30000; // 30 seconds
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export const SUPPORTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png', 
  'image/gif',
  'image/webp'
] as const;

export const SUPPORTED_DOCUMENT_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain'
] as const;