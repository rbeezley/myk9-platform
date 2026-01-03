/**
 * Base Entity Types
 *
 * Common interfaces for entities across the myK9 platform.
 */

/**
 * Base entity with standard fields
 */
export interface BaseEntity {
  id: string;
  created_at: string;
  updated_at?: string;
}

/**
 * Entity that can be synced offline
 */
export interface SyncableEntity extends BaseEntity {
  /** Timestamp of last sync from server */
  _synced_at?: string;
  /** Local modification timestamp (if modified offline) */
  _local_modified_at?: string;
  /** Whether this entity has local changes not yet synced */
  _is_dirty?: boolean;
  /** Sync status */
  _sync_status?: 'synced' | 'pending' | 'conflict' | 'error';
}

/**
 * Entity scoped to a license key (multi-tenant isolation)
 */
export interface LicenseKeyScoped {
  license_key: string;
}

/**
 * Entity scoped to a specific show
 */
export interface ShowScoped {
  show_id: string;
}

/**
 * Entity scoped to a specific trial within a show
 */
export interface TrialScoped extends ShowScoped {
  trial_id: string;
}

/**
 * Entity scoped to a specific class within a trial
 */
export interface ClassScoped extends TrialScoped {
  class_id: string;
}

/**
 * Soft-deletable entity
 */
export interface SoftDeletable {
  deleted_at?: string | null;
  deleted_by?: string | null;
}

/**
 * Auditable entity with change tracking
 */
export interface Auditable {
  created_by?: string;
  updated_by?: string;
}

/**
 * Combine multiple entity traits
 *
 * @example
 * type Entry = BaseEntity & SyncableEntity & ClassScoped & SoftDeletable;
 */
export type EntityWithTraits<T extends object, Traits extends object[]> =
  T & UnionToIntersection<Traits[number]>;

// Helper type for combining traits
type UnionToIntersection<U> =
  (U extends unknown ? (k: U) => void : never) extends ((k: infer I) => void) ? I : never;
