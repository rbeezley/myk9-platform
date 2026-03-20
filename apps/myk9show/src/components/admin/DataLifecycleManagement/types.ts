/**
 * Shared types for the DataLifecycleManagement module.
 */

import type React from 'react';

import type { ArchiveStats } from '@/services/data-lifecycle/DataArchiveService';
import type { CleanupReport } from '@/services/data-lifecycle/OrphanedRecordsCleaner';

/** Shape of a soft-deleted club record */
export interface DeletedClub {
  id: string;
  name: string | null;
  deleted_at: string | null;
  deleted_by_user?: { email?: string } | null;
}

/** Shape of a soft-deleted dog record */
export interface DeletedDog {
  id: string;
  name: string;
  breed: string;
  deleted_at: string | null;
  deleted_by_user?: { email?: string } | null;
}

/** All entity types that support soft delete */
export type EntityType = 'show' | 'trial' | 'class' | 'entry' | 'dog' | 'club' | 'person';

/** Unified shape for displaying a deleted entity in the trash view */
export interface DeletedEntity {
  id: string;
  name: string;
  context?: string;
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

/** Props shared by overview/stats components */
export interface OverviewCardsProps {
  archiveStats: ArchiveStats | null;
  schedulerStatus: Record<string, unknown> | null;
  policyCount: number;
  deletedClubsCount: number;
  deletedDogsCount: number;
}

/** Props for the Overview tab panel */
export interface OverviewTabProps {
  archiveStats: ArchiveStats | null;
  schedulerStatus: Record<string, unknown> | null;
  isLoading: boolean;
  onStartScheduler: () => void;
  onStopScheduler: () => void;
  onRunArchiveCheck: () => Promise<void>;
}

/** Props for the Archiving tab panel */
export interface ArchivingTabProps {
  archiveStats: ArchiveStats | null;
  isLoading: boolean;
  onRunArchiveCheck: () => Promise<void>;
}

/** Props for the Policies tab panel */
export interface PoliciesTabProps {
  policies: Array<{
    id: string;
    name: string;
    description: string;
    dataTypes: string[];
    isActive: boolean;
    priority: number;
  }>;
}

/** Props for the Cleanup tab panel */
export interface CleanupTabProps {
  isLoading: boolean;
  lastCleanupReport: CleanupReport | null;
  onRunCleanup: (dryRun: boolean) => Promise<void>;
}

/** Props for the Export/Import tab panel */
export interface ExportImportTabProps {
  isLoading: boolean;
  onExportData: () => Promise<void>;
}

/** Props for the Deleted Entities tab panel */
export interface DeletedEntitiesTabProps {
  deletedClubs: DeletedClub[];
  deletedDogs: DeletedDog[];
  isLoadingDeleted: boolean;
  onShowRestoreDialog: (entityId: string, entityName: string, entityType: 'club' | 'dog') => void;
  onShowDeleteDialog: (entityId: string, entityName: string, entityType: 'club' | 'dog') => void;
  onRefreshDeletedEntities: () => Promise<void>;
}

/** Props for the confirmation dialogs */
export interface ConfirmationDialogsProps {
  showRestoreDialog: boolean;
  onRestoreDialogChange: (open: boolean) => void;
  showDeleteDialog: boolean;
  onDeleteDialogChange: (open: boolean) => void;
  selectedEntity: SelectedEntity | null;
  isLoadingDeleted: boolean;
  onConfirmRestore: () => Promise<void>;
  onConfirmDelete: () => Promise<void>;
}
