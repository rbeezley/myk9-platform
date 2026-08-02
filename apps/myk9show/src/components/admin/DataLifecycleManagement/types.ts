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
  /**
   * Where this removed record can be READ, if anywhere.
   *
   * Only wired for people: `/people/:id` falls through to the admin-gated
   * removed-person read (MYK9-153). Dogs, shows and the rest are still hidden
   * by their own `deleted_at IS NULL` policies, so linking them would rebuild
   * the dead end this replaced. Omit it until that entity has a read path.
   */
  recordHref?: (item: DeletedEntity) => string | undefined;
  restore: (id: string, restoredBy?: string) => Promise<unknown>;
  hardDelete: (id: string) => Promise<unknown>;
}
