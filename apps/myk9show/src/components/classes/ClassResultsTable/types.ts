/**
 * Types for ClassResultsTable
 */
import type {
  ScentWorkEntry,
  ScentWorkClassConfig,
  QualificationStatus,
} from '@/types/scent-work-types';
import type { CheckInStatus } from '@myk9/core';
import type { UserPermissions } from '@/types/user-permissions';
import type { RawEntryRow } from '@/hooks/queries/useClassEntriesRaw';

/** Props for the ClassResultsTable component */
export interface ClassResultsTableProps {
  entries: ScentWorkEntry[];
  rawEntries?: RawEntryRow[] | undefined;
  classConfig: ScentWorkClassConfig;
  userPermissions: UserPermissions;
  onDeleteEntry?: ((entryId: string) => void) | undefined;
  onAddEntry?: (() => void) | undefined;
  className?: string | undefined;
  classId?: string | undefined;
  onOpenRequirements?: (() => void) | undefined;
}

/** Per-entry edits stored in the edit buffer. Only contains fields the user changed. */
export interface ScoringEdit {
  qualification?: QualificationStatus | '';
  qualificationReason?: string;
  searchTime?: string;
  faults?: string;
  notes?: string;
}

/** A row for display — merges raw DB data with any pending edits. */
export interface ScoringRow {
  entryId: string;
  armband: string;
  dogName: string;
  dogBreed: string;
  handlerName: string;
  qualification: QualificationStatus | '';
  qualificationReason: string;
  searchTime: string;
  faults: string;
  notes: string;
  placement: number | null;
  checkInStatus: CheckInStatus;
  isScored: boolean;
  hasEdits: boolean;
}
