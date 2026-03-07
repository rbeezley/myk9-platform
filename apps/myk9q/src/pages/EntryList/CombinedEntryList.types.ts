import type { Entry } from '../../stores/entryStore';

export type SortOrder = 'run' | 'armband' | 'placement' | 'section-armband';

export type PrintDialogType =
  | 'check-in'
  | 'results-a'
  | 'results-b'
  | 'scoresheet-a'
  | 'scoresheet-b'
  | null;

export interface PrintDialogState {
  type: PrintDialogType;
}

export interface ResetConfirmState {
  show: boolean;
  entry: Entry | null;
}

export interface OrgData {
  organization: string;
  activity_type: string;
}
