/**
 * Cross-surface "dogs ahead" consistency (MYK9-91).
 *
 * The whole point of consolidating onto the shared run-queue primitive: for the
 * SAME entry in the SAME class state, the exhibitor must see the same number
 * everywhere. This test drives three genuinely independent modules —
 *
 *   1. the ringside entry-list queue pill  (`@myk9/ringside` computeDogsAheadInList)
 *   2. the ring-conflict label             (`@/utils/conflictDetection`)
 *   3. the "your turn" push notification   (`@/utils/showEntryRunQueue` + `@myk9/notifications`)
 *
 * — and asserts they agree. If any surface reintroduces its own maths, this
 * fails.
 */

import { computeDogsAheadInList, formatDogsAheadInList } from '@myk9/ringside';
import type { Entry as RingsideEntry } from '@myk9/ringside';
import { buildYourTurnPayload } from '@myk9/notifications';
import { detectConflicts, type ClassContext } from '../conflictDetection';
import { pendingShowEntriesByRunOrder } from '../showEntryRunQueue';
import type { ShowEntry } from '@/store/entry-store-types';

const CLASS_ID = 'class-scent-master';
const OTHER_CLASS_ID = 'class-container-master';

function showEntry(overrides: {
  id: string;
  dogId: string;
  armband: string;
  runOrder: number;
  scored?: boolean;
  checkInStatus?: ShowEntry['checkInStatus'];
  classId?: string;
}): ShowEntry {
  return {
    id: overrides.id,
    showId: 'show-1',
    classId: overrides.classId ?? CLASS_ID,
    dogId: overrides.dogId,
    status: 'confirmed',
    checkInStatus: overrides.checkInStatus,
    registrationData: {
      submittedAt: '2026-07-01T00:00:00.000Z',
      handler: 'Handler',
      entryFee: 30,
      paymentStatus: 'paid',
      armband: overrides.armband,
      runOrder: overrides.runOrder,
    },
    competitionData: overrides.scored
      ? { recordedBy: 'judge', recordedAt: '2026-07-01T00:00:00.000Z' }
      : undefined,
    statusHistory: [],
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  } as ShowEntry;
}

/** The ringside entry list renders its own row type; same facts, other names. */
function toRingsideEntry(entry: ShowEntry): RingsideEntry {
  return {
    id: entry.id,
    armband: Number.parseInt(entry.registrationData.armband ?? '0', 10),
    callName: `Dog ${entry.dogId}`,
    breed: 'Golden Retriever',
    handler: 'Handler',
    isScored: !!entry.competitionData,
    status: (entry.checkInStatus ?? 'no-status') as RingsideEntry['status'],
    exhibitorOrder: entry.registrationData.runOrder ?? 0,
    classId: entry.classId,
    className: 'Master Interior',
  } as RingsideEntry;
}

/** What `useNotificationMonitor.notifyUpcomingDogs` computes for an entry. */
function notificationDogsAhead(entries: ShowEntry[], entryId: string): number | null {
  const index = pendingShowEntriesByRunOrder(entries).findIndex(e => e.id === entryId);
  return index === -1 ? null : index;
}

/** What the conflict scanner reports for the dog in that class. */
function conflictDogsAhead(entries: ShowEntry[], dogId: string): number | null {
  const context: ClassContext = {
    classId: CLASS_ID,
    className: 'Master Interior',
    status: 'In Progress',
    entries,
  };
  // Scan from an unrelated class so the target class is not skipped as "self".
  const conflicts = detectConflicts(dogId, OTHER_CLASS_ID, [context], 99);
  return conflicts.length === 0 ? null : conflicts[0].dogsAhead;
}

describe('dogs-ahead is the same number on every surface', () => {
  const cases: Array<{ name: string; entries: ShowEntry[]; targetId: string; expected: number }> = [
    {
      // The locked INTENT: the in-ring dog is excluded, so the dog behind it is
      // "next" — not "1 dog ahead".
      name: 'a dog is in the ring and the target is next',
      entries: [
        showEntry({
          id: 'e1',
          dogId: 'dog-1',
          armband: '10',
          runOrder: 1,
          checkInStatus: 'in-ring',
        }),
        showEntry({ id: 'e2', dogId: 'dog-2', armband: '20', runOrder: 2 }),
        showEntry({ id: 'e3', dogId: 'dog-3', armband: '30', runOrder: 3 }),
      ],
      targetId: 'e2',
      expected: 0,
    },
    {
      name: 'a dog is in the ring and one more waits in front of the target',
      entries: [
        showEntry({
          id: 'e1',
          dogId: 'dog-1',
          armband: '10',
          runOrder: 1,
          checkInStatus: 'in-ring',
        }),
        showEntry({ id: 'e2', dogId: 'dog-2', armband: '20', runOrder: 2 }),
        showEntry({ id: 'e3', dogId: 'dog-3', armband: '30', runOrder: 3 }),
      ],
      targetId: 'e3',
      expected: 1,
    },
    {
      name: 'nobody is in the ring yet',
      entries: [
        showEntry({ id: 'e1', dogId: 'dog-1', armband: '10', runOrder: 1 }),
        showEntry({ id: 'e2', dogId: 'dog-2', armband: '20', runOrder: 2 }),
        showEntry({ id: 'e3', dogId: 'dog-3', armband: '30', runOrder: 3 }),
      ],
      targetId: 'e3',
      expected: 2,
    },
    {
      name: 'scored dogs no longer count as ahead',
      entries: [
        showEntry({ id: 'e1', dogId: 'dog-1', armband: '10', runOrder: 1, scored: true }),
        showEntry({ id: 'e2', dogId: 'dog-2', armband: '20', runOrder: 2, scored: true }),
        showEntry({ id: 'e3', dogId: 'dog-3', armband: '30', runOrder: 3 }),
        showEntry({ id: 'e4', dogId: 'dog-4', armband: '40', runOrder: 4 }),
      ],
      targetId: 'e4',
      expected: 1,
    },
    {
      // `pulled` lives on check_in_status only — entry_status (migration 003)
      // has no such value — so a gate-pulled dog must drop out of the count.
      name: 'a dog pulled at the gate no longer counts as ahead',
      entries: [
        showEntry({
          id: 'e1',
          dogId: 'dog-1',
          armband: '10',
          runOrder: 1,
          checkInStatus: 'in-ring',
        }),
        showEntry({
          id: 'e2',
          dogId: 'dog-2',
          armband: '20',
          runOrder: 2,
          checkInStatus: 'pulled',
        }),
        showEntry({ id: 'e3', dogId: 'dog-3', armband: '30', runOrder: 3 }),
      ],
      targetId: 'e3',
      expected: 0,
    },
  ];

  for (const { name, entries, targetId, expected } of cases) {
    it(`agrees across entry list, conflict label and push when ${name}`, () => {
      const target = entries.find(e => e.id === targetId);
      if (!target) throw new Error(`bad fixture: ${targetId}`);

      const listResult = computeDogsAheadInList(entries.map(toRingsideEntry), targetId);
      const listDogsAhead =
        listResult && listResult.kind === 'waiting' ? listResult.dogsAhead : null;

      const conflict = conflictDogsAhead(entries, target.dogId);
      const push = notificationDogsAhead(entries, targetId);

      expect(listDogsAhead).toBe(expected);
      expect(conflict).toBe(expected);
      expect(push).toBe(expected);
    });
  }

  it('renders the same wording from the same number on the list pill and the push body', () => {
    const entries = [
      showEntry({ id: 'e1', dogId: 'dog-1', armband: '10', runOrder: 1, checkInStatus: 'in-ring' }),
      showEntry({ id: 'e2', dogId: 'dog-2', armband: '20', runOrder: 2 }),
    ];

    const listResult = computeDogsAheadInList(entries.map(toRingsideEntry), 'e2');
    expect(formatDogsAheadInList(listResult)).toBe("You're next");

    const push = notificationDogsAhead(entries, 'e2');
    expect(push).toBe(0);
    const payload = buildYourTurnPayload({
      dogName: 'Bella',
      className: 'Master Interior',
      dogsAhead: push ?? -1,
      armband: '20',
    });
    // Zero dogs ahead reads as an it's-your-turn push, never "1 dog ahead".
    const copy = `${payload.title} ${payload.body}`;
    expect(copy).not.toMatch(/1 dog ahead/);
    expect(copy.toLowerCase()).toMatch(/next|your turn/);
  });
});
