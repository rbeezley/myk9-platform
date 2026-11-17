/**
 * Types for ClassResultsTable
 */
import type { QualificationStatus, ScentWorkEntry } from '@/types/scent-work-types';
import type { RawEntryRow } from '@/hooks/queries/useClassEntriesRaw';

/** Props for the ClassResultsTable component (read-only: released results for anyone). */
export interface ClassResultsTableProps {
  entries: ScentWorkEntry[];
  rawEntries?: RawEntryRow[] | undefined;
  className?: string | undefined;
  classId?: string | undefined;
  showId?: string | undefined;
  trialId?: string | undefined;
  classStatus?: string | undefined;
  resultsReleasedAt?: string | null | undefined;
}

/** A row for display, built from the raw DB data. */
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
  placement: number | null;
  isScored: boolean;
  /** MYK9-969: the server hid this entry's results from the current viewer. */
  resultsPrivate?: boolean | undefined;
}
