import { describe, expect, it } from 'vitest';
import {
  buildEntryListOwnership,
  formatRunQueueState,
  stateForClaim,
  type DogsAheadResult,
} from '@myk9/ringside';
import { rowToEntry, type EntryRow } from '@/services/replication/ReplicatedEntriesTable.mapper';
import type { ShowEntry } from '@/store/entry-store-types';
import { ownEntryQueueState, withServerPlace } from '@/utils/showEntryRunQueue';
import { transformEntry } from './atShowDataAdapter';
import { buildExhibitorDogs } from './exhibitorDogIndex';
import { isBeforeTrialDay, ownPillAllowed } from './placeInLineDayGate';
import { pendingReplicatedByRunOrder } from './replicatedRunQueue';

/**
 * MYK9-2092: one dog, one class, the hand-set run order differing from armband order and a
 * withdrawn dog ahead. Every exhibitor place-in-line surface must name the same place.
 *
 * Run order: Bo (armband 4, order 1, WITHDRAWN) -> Cy (armband 3, order 2) -> Al (armband 1,
 * order 3) -> Me (armband 2, order 4). Armband order would put Me second; the true place is 3rd.
 */
const CLASS_ID = 'class-1';
const ME = 'e-me';
const SERVER_PLACE = 3;

function row(id: string, armband: string, runOrder: number, entryStatus = 'confirmed'): EntryRow {
  return {
    id,
    class_id: CLASS_ID,
    armband,
    run_order: runOrder,
    is_scored: false,
    is_in_ring: false,
    check_in_status: 'no-status',
    entry_status: entryStatus,
    result_status: 'pending',
    deleted_at: null,
  } as unknown as EntryRow;
}

const freshRows = [
  row('e-bo', '4', 1, 'withdrawn'),
  row('e-cy', '3', 2),
  row('e-al', '1', 3),
  row(ME, '2', 4),
];

/** The same class on a phone whose replica has not yet heard that Bo withdrew. */
const lagRows = freshRows.map(r =>
  (r as unknown as { id: string }).id === 'e-bo' ? row('e-bo', '4', 1) : r
);

/** What the server's one rule (entry_queue_places_for_classes) answers for Me, checked below. */
const serverAnswer = { place: SERVER_PLACE, claimState: 'live' as const };

function listAnswer(rows: EntryRow[], serverPlaces?: ReadonlyMap<string, number>): DogsAheadResult {
  const entries = rows.map(r => transformEntry(rowToEntry(r), null));
  return (
    buildEntryListOwnership(
      entries,
      new Set([ME]),
      undefined,
      true,
      new Map([[ME, 'live' as const]]),
      serverPlaces
    )?.dogsAheadByEntryId.get(ME) ?? null
  );
}

function listPlace(result: DogsAheadResult): number | null {
  return result?.kind === 'waiting' ? result.dogsAhead + 1 : null;
}

describe('one place in line for one dog (MYK9-2092)', () => {
  it('the replica queue helper, run over the fresh class, also puts Me third (the SQL rule itself is pinned by serverQueuePlaceParity)', () => {
    const queue = pendingReplicatedByRunOrder(freshRows.map(r => rowToEntry(r)));
    expect(queue.findIndex(e => e.id === ME) + 1).toBe(SERVER_PLACE);
  });

  it('My Shows, Your dogs today, Where to be and the class page read the server place', () => {
    const own = {
      id: ME,
      status: 'confirmed',
      checkInStatus: 'no-status',
      registrationData: { armband: '2', runOrder: 4 },
    } as unknown as ShowEntry;
    const state = withServerPlace(ownEntryQueueState(own), serverAnswer);
    expect(state).toEqual({ kind: 'waiting', place: SERVER_PLACE });
    expect(formatRunQueueState(state!)).toBe('3rd up');
  });

  it("the exhibitor's dog page shows the server's run_position as it is", () => {
    const [dog] = buildExhibitorDogs([
      {
        armband: 2,
        call_name: 'Me',
        breed: 'Beagle',
        handler_name: 'H',
        class_id: CLASS_ID,
        class_name: 'Container Novice',
        trial_name: 'T',
        trial_date: null,
        check_in_status: 'no-status',
        run_position: SERVER_PLACE,
        run_claim_state: 'live',
      },
    ]);
    const entry = dog!.entries[0]!;
    expect(formatRunQueueState(stateForClaim(entry.runPosition!, entry.runClaimState))).toBe(
      '3rd up'
    );
  });

  it('Ringside list agrees when its copy of the class is fresh', () => {
    expect(listPlace(listAnswer(freshRows))).toBe(SERVER_PLACE);
  });

  it('Ringside list names the server place, not its own count, when its copy of the class lags', () => {
    // Counted on the phone, the not-yet-withdrawn Bo puts Me fourth.
    const places = new Map([[ME, SERVER_PLACE]]);
    expect(listPlace(listAnswer(lagRows, places))).toBe(SERVER_PLACE);
  });

  it('Ringside list invents no place while the server has not answered', () => {
    const result = listAnswer(freshRows, new Map());
    expect(result?.kind).not.toBe('waiting');
  });

  it("the exhibitor's dog page makes no place claim before the trial day", () => {
    const base = {
      armband: 2,
      call_name: 'Me',
      breed: 'Beagle',
      handler_name: 'H',
      class_id: CLASS_ID,
      class_name: 'Container Novice',
      trial_name: 'T',
      check_in_status: 'no-status',
      run_position: SERVER_PLACE,
      run_claim_state: 'live',
    };
    const noon = new Date('2026-11-16T18:00:00Z');
    const [night] = buildExhibitorDogs([{ ...base, trial_date: '2026-11-17' }], noon);
    expect(night!.entries[0]!.runPosition).toBeNull();
    const [today] = buildExhibitorDogs([{ ...base, trial_date: '2026-11-16' }], noon);
    expect(today!.entries[0]!.runPosition).toBe(SERVER_PLACE);
  });

  it('the list shows no own-dog pill before the trial day', () => {
    const entries = freshRows.map(r => transformEntry(rowToEntry(r), null));
    const build = (trialDate: string) =>
      buildEntryListOwnership(
        entries,
        new Set([ME]),
        undefined,
        ownPillAllowed(false, trialDate, new Date('2026-11-16T18:00:00Z')),
        new Map([[ME, 'live' as const]]),
        new Map([[ME, SERVER_PLACE]])
      )?.dogsAheadByEntryId.get(ME);
    expect(build('2026-11-17')).toBeNull();
    expect(listPlace(build('2026-11-16') ?? null)).toBe(SERVER_PLACE);
  });

  it('isBeforeTrialDay: today and no date are not before, tomorrow is', () => {
    const noon = new Date('2026-11-16T18:00:00Z');
    expect(isBeforeTrialDay('2026-11-16', noon)).toBe(false);
    expect(isBeforeTrialDay('2026-11-17', noon)).toBe(true);
    expect(isBeforeTrialDay(null, noon)).toBe(false);
    expect(isBeforeTrialDay(undefined, noon)).toBe(false);
  });
});
