/**
 * The My Shows list: one show group per show, dog cards beneath each.
 *
 * Lives here rather than in `index.tsx` because that file is at the 500-line
 * cap and CI's quality ratchet fails any regression (D10). The page hands this
 * component the same `filteredEntries` the filters already produced — the
 * grouping is a render-time view, so the tab counts, the status filter and the
 * `?entryIds=` scope reader keep their existing contract (D2, D3).
 *
 * @module MyEntriesPage/modules/MyShowsList
 */

import React from 'react';
import type { ResultCardModel } from '@/features/result-card';
import { groupEntriesByShow } from './groupEntriesByShow';
import type { MyShowClass, MyShowDog, MyShowGroup } from './groupEntriesByShow';
import { MyShowGroupCard } from './MyShowGroup';
import type { EntryStatusFilter, MyEntry } from './my-entries-types';
import { narrowDogsToStatus } from './statusFilterPredicate';

/**
 * Group the filtered orders into the show groups the list renders.
 *
 * Exported beside the component it feeds (design D2) so the memo and its only
 * consumer stay in one place; that costs the fast-refresh rule below, which is
 * a dev-server nicety rather than a correctness constraint.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useMyShowGroups(
  filteredEntries: MyEntry[],
  selectedStatus: EntryStatusFilter = 'any'
): MyShowGroup[] {
  return React.useMemo(
    () => narrowDogsToStatus(groupEntriesByShow(filteredEntries), selectedStatus),
    [filteredEntries, selectedStatus]
  );
}

export interface MyShowsListProps {
  filteredEntries: MyEntry[];
  /** The strip's status axis, re-applied per dog (see `narrowDogsToStatus`). */
  selectedStatus?: EntryStatusFilter | undefined;
  selfCheckinByClassId?: Record<string, boolean> | undefined;
  seenResultReleaseKeys: Set<string>;
  onCheckInDay: (dog: MyShowDog, classes: MyShowClass[]) => void;
  onOpenCheckIn: (order: MyEntry, cls: MyShowClass) => void;
  onOpenEdit: (orders: MyEntry[]) => void;
  onOpenReceipts: (group: MyShowGroup) => void;
  onResultRevealClick?: ((model: ResultCardModel) => void) | undefined;
  /**
   * The instant the whole list reckons against. Injectable so tests can place
   * themselves on a trial day without faking the global clock; the page never
   * passes it.
   */
  now?: Date | undefined;
}

export const MyShowsList: React.FC<MyShowsListProps> = ({
  filteredEntries,
  selectedStatus = 'any',
  selfCheckinByClassId,
  seenResultReleaseKeys,
  onCheckInDay,
  onOpenCheckIn,
  onOpenEdit,
  onOpenReceipts,
  onResultRevealClick,
  now: nowProp,
}) => {
  const groups = useMyShowGroups(filteredEntries, selectedStatus);
  // One instant for the whole render pass, so the day gate, the money state
  // and the paid-strip window cannot disagree mid-list. Captured in state
  // rather than a `useMemo` — a `new Date()` inside a memo is a dependency
  // that never settles.
  const [capturedNow] = React.useState(() => new Date());
  const now = nowProp ?? capturedNow;

  return (
    <ul className="space-y-8">
      {groups.map(group => (
        <li key={group.key}>
          <MyShowGroupCard
            group={group}
            now={now}
            selfCheckinByClassId={selfCheckinByClassId}
            seenResultReleaseKeys={seenResultReleaseKeys}
            onCheckInDay={onCheckInDay}
            onOpenCheckIn={onOpenCheckIn}
            onOpenEdit={onOpenEdit}
            onOpenReceipts={onOpenReceipts}
            onResultRevealClick={onResultRevealClick}
          />
        </li>
      ))}
    </ul>
  );
};
