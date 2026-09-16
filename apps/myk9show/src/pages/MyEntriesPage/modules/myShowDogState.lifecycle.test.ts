/**
 * MYK9-582 — the lifecycle half of `deriveClassRowState`.
 *
 * Every fixture starts from a RAW `entry_status` string and is projected the
 * way `useMyEntriesData` projects one (`getEntryStatusKindForDisplay` for the
 * lossless kind, `mapEntryStatus` for the UI enum, `mapClassEntryStatus` for
 * the participation value), then pushed through the real
 * `groupEntriesByOrder` → `groupEntriesByShow` pipeline. A shape this page's
 * only producer cannot emit is therefore not reachable from here — which is
 * what round 2 found: fixtures that set `entryStatus` by hand were certifying
 * a branch production never enters.
 *
 * Split out of `myShowDogState.test.ts` so both files stay under 500 lines.
 */
import { describe, it, expect } from 'vitest';
import { EXCLUDED_ENTRY_STATUSES } from '@/features/_shared/entryAccounting';
import {
  getEntryStatusKindForDisplay,
  type EntryStatusKind,
} from '@/services/entryDisplay/entryDisplaySelectors';
import { mapEntryStatus } from '@/services/entryDisplay/entryStatusUiAdapter';
import { mapClassEntryStatus } from '@/utils/entryManagementUtils';
import { makeClass, makeRow, NOW, toOrders } from '@/test/fixtures/myShowsFixtures';
import { groupEntriesByShow, indexOrdersById, type MyShowClass } from './groupEntriesByShow';
import { deriveClassRowState, deriveDogChip, type ClassRowKind } from './myShowDogState';
import type { EntryClass, MyEntry } from './my-entries-types';

/**
 * The three fields `useMyEntriesData` derives from one raw `entry_status`, in
 * the same order and through the same functions as its class mapper.
 */
function classFromRawStatus(rawStatus: string, overrides: Partial<EntryClass> = {}): EntryClass {
  return makeClass({
    entryStatus: mapEntryStatus(rawStatus),
    entryStatusKind: getEntryStatusKindForDisplay(rawStatus, overrides.checkInStatus ?? null),
    status: mapClassEntryStatus(rawStatus),
    ...overrides,
  });
}

function buildDog(classes: EntryClass[], rowOverrides: Partial<MyEntry> = {}) {
  const rows = [makeRow({ id: 'e1', registrationId: 'r1', classes, ...rowOverrides })];
  const [group] = groupEntriesByShow(toOrders(rows));
  return { group: group!, dog: group!.dogs[0]!, ordersById: indexOrdersById(group!) };
}

function rowKind(classes: EntryClass[], rowOverrides: Partial<MyEntry> = {}): ClassRowKind {
  const { dog, ordersById } = buildDog(classes, rowOverrides);
  return deriveClassRowState(dog.classes[0] as MyShowClass, {
    now: NOW,
    ordersById,
    isPastShow: false,
  }).kind;
}

/** The row state of one class, built from its raw DB status. */
function stateOfRaw(rawStatus: string, overrides: Partial<EntryClass> = {}): ClassRowKind {
  return rowKind([classFromRawStatus(rawStatus, overrides)]);
}

describe('deriveClassRowState — settled by lifecycle, from raw statuses', () => {
  it.each<[string, ClassRowKind, EntryStatusKind]>([
    ['withdrawn', 'withdrawn', 'withdrawn'],
    ['scratched', 'scratched', 'scratched'],
    ['absent', 'absent', 'absent'],
    ['moved', 'moved', 'moved'],
    ['not_accepted', 'not-accepted', 'not_accepted'],
  ])('reads raw %s as the %s row', (rawStatus, expected, expectedKind) => {
    // The kind assertion is the guard: it fails loudly if the classifier moves,
    // instead of the row silently falling through to the day math.
    expect(getEntryStatusKindForDisplay(rawStatus, null)).toBe(expectedKind);
    expect(stateOfRaw(rawStatus)).toBe(expected);
  });

  // The UI enum is NOT the input: it has no `absent` member, so
  // `mapEntryStatusKindToUi` folds this terminal row onto PENDING. Reading the
  // enum is what hid the row before.
  it('settles an absent row whose UI enum reads PENDING', () => {
    expect(classFromRawStatus('absent').entryStatus).toBe(mapEntryStatus('pending'));
    expect(stateOfRaw('absent')).toBe('absent');
  });

  // Owner decision (2026-06-18): promotion-expired stays in the review lane. It
  // classifies as `not_accepted`, so only the PENDING projection beside that
  // kind keeps this row live.
  it('leaves a promotion-expired row live, not declined', () => {
    expect(classFromRawStatus('promotion-expired').entryStatusKind).toBe('not_accepted');
    expect(stateOfRaw('promotion-expired')).not.toBe('not-accepted');
  });

  // The promotion-expired escape hatch must not swallow a genuine decline,
  // whose UI enum is REJECTED, nor the absent row that also projects to PENDING.
  it('still declines a real not_accepted row', () => {
    expect(stateOfRaw('not_accepted')).toBe('not-accepted');
  });

  it('leaves an accepted row to the day math', () => {
    expect(stateOfRaw('confirmed')).toBe('check-in-available');
  });

  // `EntryClass.entryStatusKind` is still OPTIONAL on the type: making it
  // required means adding it to 24 fixture builders, one of which
  // (`myEntryCardState.test.ts`) belongs to the open PR #2301, so this branch
  // cannot be deleted yet. No PRODUCER emits a class without a kind — a
  // typecheck with the field required reports 27 errors and every one is a
  // test fixture — so this covers the type's optionality, not a real shape.
  it('leaves a row with no classification live (type-level guard)', () => {
    const cls = classFromRawStatus('confirmed');
    delete (cls as { entryStatusKind?: unknown }).entryStatusKind;
    expect(rowKind([cls])).toBe('check-in-available');
  });

  // Coupling to the shared lifecycle list, over ALL five of its members: if
  // `entryAccounting` grows an excluded status, this fails rather than letting
  // the new one fall through to the day math.
  const SETTLED_KINDS: readonly ClassRowKind[] = [
    'withdrawn',
    'scratched',
    'absent',
    'moved',
    'not-accepted',
  ];

  it('settles every status entryAccounting excludes from the expected set', () => {
    expect(EXCLUDED_ENTRY_STATUSES.size).toBe(5);
    for (const rawStatus of EXCLUDED_ENTRY_STATUSES) {
      expect([rawStatus, stateOfRaw(rawStatus)]).toEqual([
        rawStatus,
        expect.stringMatching(new RegExp(`^(${SETTLED_KINDS.join('|')})$`)),
      ]);
    }
  });

  // A recorded absence outranks the lifecycle on purpose: a row withdrawn on
  // paper but marked absent or excused in the ring has an OUTCOME, and
  // `ResultBadge` names it.
  it('lets a recorded absence outrank the withdrawal', () => {
    expect(stateOfRaw('withdrawn', { resultStatus: 'excused' })).toBe('absent');
  });
});

describe('deriveDogChip — the live filter shares the row predicate', () => {
  // Round 3: `checkInBearingClasses` used `isExpectedEntry`, which reads the
  // lossy UI enum. An absent class projects onto PENDING there, was counted as
  // a class still owing a check-in, and held the chip on "Accepted" over a dog
  // that had already checked in for everything it was going to run.
  it('reaches Checked in past an absent class', () => {
    const { dog, group } = buildDog(
      [
        classFromRawStatus('absent', { id: 'c1' }),
        classFromRawStatus('confirmed', {
          id: 'c2',
          classId: 'class-2',
          checkInStatus: 'checked-in',
        }),
      ],
      { entryStatus: mapEntryStatus('confirmed'), entryStatusKind: 'accepted' }
    );
    expect(
      deriveDogChip(dog, { isPastShow: false, isShowCancelled: group.isShowCancelled })
    ).toEqual({ kind: 'checked_in', label: 'Checked in', status: 'checked_in' });
  });

  it('ignores a settled class’s stale check-in state', () => {
    const { dog, group } = buildDog(
      [
        classFromRawStatus('withdrawn', { id: 'c1', checkInStatus: 'pulled' }),
        classFromRawStatus('submitted', { id: 'c2', classId: 'class-2' }),
      ],
      { entryStatus: mapEntryStatus('submitted'), entryStatusKind: 'pending' }
    );
    expect(
      deriveDogChip(dog, { isPastShow: false, isShowCancelled: group.isShowCancelled })
    ).toEqual({ kind: 'status', label: 'Pending review', status: 'pending' });
  });
});
