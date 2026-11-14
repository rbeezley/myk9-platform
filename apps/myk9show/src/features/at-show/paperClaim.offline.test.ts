/**
 * MYK9-1970: a phone that already holds the class shows the paper line with no network.
 * The chain is replica class -> class list row (`on_paper`) -> at-show class summary ->
 * entry detail -> queue line, and nothing in it asks the server.
 */
import { describe, expect, it } from 'vitest';
import type { ClassEntry } from '@myk9/ringside';
import type { ReplicatedClass, ReplicatedEntry } from '@/services/replication';
import { toClassEntry } from './atShowClassListAdapter';
import {
  buildMyAtShowEntryDetails,
  deriveAtShowQueueLine,
  toAtShowClassSummary,
  type AtShowEntryDetail,
} from './myAtShowEntryDetails.helpers';

const cls = (over: Partial<ReplicatedClass> = {}): ReplicatedClass => ({
  id: 'class-1',
  name: 'Container Novice',
  classStatus: 'in_progress',
  ...over,
});

describe('toClassEntry: on_paper from the replicated class and show', () => {
  it.each([
    ['its own flag', cls({ scoresOnPaper: true }), true, true],
    ['its own flag over a device-scoring show', cls({ scoresOnPaper: true }), true, true],
    ['the show switch turned off', cls({ scoresOnPaper: null }), false, true],
    ['an explicit live flag over a paper show', cls({ scoresOnPaper: false }), false, false],
    ['a device-scoring show', cls({ scoresOnPaper: null }), true, false],
    ['a class and show with nothing set', cls(), undefined, false],
  ])('reads %s', (_label, row, showUsesDeviceScoring, onPaper) => {
    const entry = toClassEntry(row, [], new Set(), showUsesDeviceScoring);
    expect(entry.on_paper === true).toBe(onPaper);
  });
});

describe('the paper line offline', () => {
  const replicaEntry: ReplicatedEntry = {
    id: 'entry-1',
    showId: 'show-1',
    classId: 'class-1',
    dogCallName: 'Rex',
    armband: '101',
    checkInStatus: 'checked-in',
    runOrder: 3,
    isScored: false,
  };

  function detailFor(classEntry: ClassEntry): AtShowEntryDetail {
    const summary = toAtShowClassSummary(classEntry, 'America/Chicago', 'allowed');
    return buildMyAtShowEntryDetails(
      [replicaEntry],
      new Set(['entry-1']),
      new Map([['class-1', summary]]),
      new Map(),
      new Map()
    )[0]!;
  }

  it('says paper with no place when no server answer is held', () => {
    const detail = detailFor(toClassEntry(cls({ scoresOnPaper: true }), [], new Set()));
    expect(detail.onPaper).toBe(true);
    expect(deriveAtShowQueueLine(detail, undefined)).toEqual({ kind: 'paper' });
  });

  it('says Waiting, as before, on a class that is not on paper', () => {
    const detail = detailFor(toClassEntry(cls({ scoresOnPaper: false }), [], new Set(), true));
    expect(detail.onPaper).toBe(false);
    expect(deriveAtShowQueueLine(detail, undefined)).toEqual({ kind: 'waiting-unknown' });
  });

  it('lets the server add the place, and decide stale, once online', () => {
    const detail = detailFor(toClassEntry(cls({ scoresOnPaper: true }), [], new Set()));
    expect(deriveAtShowQueueLine(detail, { place: 7, claim: 'paper' })).toEqual({
      kind: 'paper',
      place: 7,
    });
    const live = detailFor(toClassEntry(cls({ scoresOnPaper: false }), [], new Set(), true));
    expect(deriveAtShowQueueLine(live, { place: 7, claim: 'stale' })).toEqual({ kind: 'stale' });
  });
});
