/**
 * Shared types for ClassResultsTable sub-components
 */
import type {
  ScentWorkEntry,
  ScentWorkClassConfig,
  ScentWorkResult,
  MultiAreaScentWorkResult,
  QualificationStatus,
} from '@/types/scent-work-types';
import type { UserPermissions } from '@/types/user-permissions';

/** Props for the top-level ClassResultsTable component */
export interface ClassResultsTableProps {
  entries: ScentWorkEntry[];
  classConfig: ScentWorkClassConfig;
  userPermissions: UserPermissions;
  onResultsSubmit: (results: (ScentWorkResult | MultiAreaScentWorkResult)[]) => Promise<void>;
  onDeleteEntry?: ((entryId: string) => void) | undefined;
  onAddEntry?: (() => void) | undefined;
  className?: string | undefined;
  /** Class ID used for Enter Scores navigation */
  classId?: string | undefined;
  /** Opens the requirements panel/drawer */
  onOpenRequirements?: (() => void) | undefined;
}

/** Internal row-level data used by the bulk-edit table */
export interface BulkEntryData {
  entryId: string;
  armband: string;
  dogName: string;
  handlerName: string;
  searchTime: string;
  qualification: QualificationStatus | '';
  qualificationReason: string;
  faults: string;
  notes: string;
  placement: number | null;
  isValid: boolean;
  hasChanges: boolean;
  /** Track which fields were modified */
  modifiedFields?: Set<keyof BulkEntryData> | undefined;
  /** Who last edited this result */
  lastEditedBy?: string | undefined;
  /** When it was last edited */
  lastEditedAt?: Date | undefined;
}

/** Summary statistics for the results table */
export interface ResultsSummary {
  totalEntries: number;
  entriesWithData: number;
  validEntries: number;
  invalidEntries: number;
  canSubmit: boolean;
}
