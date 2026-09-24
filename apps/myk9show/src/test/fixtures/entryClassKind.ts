/**
 * `EntryClass.entryStatusKind` is required (MYK9-624): the My Shows lifecycle
 * predicate keys on it, never on the lossy UI enum. Hand-built fixtures that
 * only name `entryStatus` / `status` get the kind those fields imply, so a
 * factory default never disagrees with the enum beside it.
 *
 * Production never goes through here — `useMyEntriesData` classifies the raw
 * `entry_status` with `getEntryStatusKindForDisplay`.
 */
import { EntryStatus } from '@/types/show-registration-types';
import type { EntryStatusKind } from '@/services/entryDisplay/entryDisplaySelectors';
import type { EntryClass } from '@/pages/MyEntriesPage/modules/my-entries-types';

const KIND_BY_UI_STATUS: Record<EntryStatus, EntryStatusKind> = {
  [EntryStatus.PENDING]: 'pending',
  [EntryStatus.ACCEPTED]: 'accepted',
  [EntryStatus.REJECTED]: 'not_accepted',
  [EntryStatus.WAITLIST]: 'waitlist',
  [EntryStatus.CANCELLED]: 'withdrawn',
  [EntryStatus.MISSING_INFO]: 'pending',
  [EntryStatus.SCRATCHED]: 'scratched',
  [EntryStatus.MOVED]: 'moved',
  [EntryStatus.COMPLETED]: 'completed',
  [EntryStatus.MOVE_UP_REQUESTED]: 'move_up_requested',
};

const KIND_BY_PARTICIPATION: Record<EntryClass['status'], EntryStatusKind> = {
  entered: 'accepted',
  withdrawn: 'withdrawn',
  scratched: 'scratched',
  moved: 'moved',
  absent: 'absent',
};

/** The kind a fixture's `entryStatus` (else its `status`) implies. */
export function fixtureEntryStatusKind(
  cls: Pick<EntryClass, 'status'> & Partial<Pick<EntryClass, 'entryStatus' | 'entryStatusKind'>>
): EntryStatusKind {
  if (cls.entryStatusKind) return cls.entryStatusKind;
  if (cls.entryStatus) return KIND_BY_UI_STATUS[cls.entryStatus];
  return KIND_BY_PARTICIPATION[cls.status];
}

/** A fixture class with its kind filled in from the fields it does name. */
export function withFixtureKind(
  cls: Omit<EntryClass, 'entryStatusKind'> & { entryStatusKind?: EntryStatusKind | undefined }
): EntryClass {
  return { ...cls, entryStatusKind: fixtureEntryStatusKind(cls) };
}
