/**
 * Shared types for the EntryList page in @myk9/ringside.
 *
 * Moved from apps/myk9q/src/pages/EntryList/CombinedEntryList.types.ts in
 * PR E2a — pure helpers + hooks extraction. Host app re-exports this barrel
 * via apps/myk9q/src/pages/EntryList/CombinedEntryList.types.ts as a shim
 * so existing in-app imports stay green.
 */

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
