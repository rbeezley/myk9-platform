/**
 * Shared types for the deleted-items admin restore page.
 */

import type React from 'react';

/** All entity types that support soft delete */
export type EntityType = 'show' | 'trial' | 'class' | 'entry' | 'dog' | 'club' | 'person';

/** Unified shape for displaying a deleted entity in the trash view */
export interface DeletedEntity {
  id: string;
  name: string;
  context?: string | undefined;
  deleted_at: string | null;
  deleted_by_email?: string | null;
}

/** Entity selected for restore/delete confirmation */
export interface SelectedEntity {
  id: string;
  name: string;
  type: EntityType;
}

/** Configuration for a single entity section in the trash view */
export interface EntitySectionConfig {
  type: EntityType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  fetchDeleted: () => Promise<DeletedEntity[]>;
  restore: (id: string, restoredBy?: string) => Promise<unknown>;
  hardDelete: (id: string) => Promise<unknown>;
}
