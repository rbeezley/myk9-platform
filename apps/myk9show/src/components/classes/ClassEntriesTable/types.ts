/**
 * Type definitions for ClassEntriesTable
 */

import { EntryData } from '../types/classTypes';
import { ShowType, ClassTemplate } from '@/types/template.types';
import { UserPermissions } from '@/types/user-permissions';
import { FieldValidationError } from '@/utils/entryValidation';

/**
 * Props for the ClassEntriesTable component
 */
export interface ClassEntriesTableProps {
  entries: EntryData[];
  showType: ShowType;
  template?: ClassTemplate;
  onViewEntry?: (id: string) => void;
  onEditEntry: (id: string) => void;
  onEnterResults?: (id: string) => void;
  onDeleteEntry: (id: string) => void;
  onAddEntry: () => void;
  enableInlineEditing?: boolean;
  onResultUpdate?: (entryId: string, result: Partial<EntryData>) => Promise<void>;
  onToggleInlineEditing?: () => void;
  userPermissions?: UserPermissions;
  className?: string;
}

/**
 * Data structure for tracking inline edits per entry
 */
export interface InlineEditEntry {
  time: string;
  status: string;
  score: string;
  placement: string;
  isValid: boolean;
  hasChanges: boolean;
  errors: FieldValidationError[];
  originalData: {
    time: string;
    status: string;
    score: string;
    placement: string;
  };
}

/**
 * Map of entry IDs to their inline edit state
 */
export interface InlineEditData {
  [entryId: string]: InlineEditEntry;
}

/**
 * Error state for displaying validation/submission errors
 */
export interface ErrorState {
  type: 'validation' | 'submission' | 'import' | 'export';
  message: string;
  details?: Record<string, string>;
  timestamp: Date;
}

/**
 * Summary of pending changes
 */
export interface ChangesSummary {
  total: number;
  valid: number;
  invalid: number;
  canSubmit: boolean;
}

/**
 * Default permissions when none provided
 */
export const DEFAULT_PERMISSIONS: UserPermissions = {
  canViewEntries: true,
  canEditEntries: true,
  canDeleteEntries: true,
  canAddEntries: true,
  canEditResults: true,
  canViewResults: true,
  canSubmitResults: true,
  canBulkEdit: true,
  canImportData: false,
  canExportData: false,
  canAccessAdvancedFeatures: true,
  canManageClass: true,
  canViewStatistics: true,
  role: 'admin' as const
};
