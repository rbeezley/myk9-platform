/**
 * Regression tests for impeccable p2 audit findings H1 and H3.
 *
 * The Show Desk derives every per-class count, every pending-attention chip and
 * the mark-complete guard from one entries query. That query inherits React
 * Query's `'online'` networkMode, so losing wifi at a venue PAUSES it --
 * `fetchStatus: 'paused'` makes `isFetching` false, which makes `isLoading`
 * false, and pending is not error -- so it returns `data: undefined` while
 * looking, to every gate on the page, exactly like a settled empty result.
 *
 * What makes this page's version of the bug notable is that the truthful state
 * was already designed. `secretaryCockpitModel` has a full `EvidenceValue`
 * union, and `progressFor` returns `{ evidence: 'unknown', value: null }` when
 * either count is null. That branch was unreachable: `buildSecretaryCockpitSnapshot`
 * ran `entryCount ?? 0` one step upstream, so a count was never null, and the
 * schedule then ran `progress.value === null ? 0` at the call site for good
 * measure. Three collapses in one chain, each individually reasonable.
 *
 * These tests pin the chain end to end: unknown must stay unknown.
 */

import { describe, it, expect } from 'vitest';
import { buildSecretaryCockpitModel } from '../secretaryCockpitModel';
import type {
  SecretaryCockpitSnapshot,
  SecretaryCockpitState,
} from '../secretaryCockpitTypes';

function snapshotWithCounts(
  entryCount: number | null,
  scoredCount: number | null
): SecretaryCockpitSnapshot {
  return {
    showId: 'show-1',
    timeZone: 'America/Chicago',
    now: new Date('2026-08-28T19:00:00Z'),
    trials: [{ id: 'trial-1', date: '2026-08-28', number: '1', order: 0 }],
    classes: [
      {
        id: 'class-1',
        trialId: 'trial-1',
        name: 'Novice A',
        classOrder: 0,
        scheduledStart: '2026-08-28T20:00:00Z',
        revisedExpectedStart: null,
        lifecycle: 'in-progress',
        actualStart: null,
        actualFinish: null,
        entryCount,
        scoredCount,
        closeout: null,
        judgeName: 'J. Smith',
        operationalArea: null,
        attention: [],
        actions: [],
        paperwork: [],
      },
    ],
  };
}

const STATE: SecretaryCockpitState = {
  selectedDay: '2026-08-28',
  filter: 'all',
};

/** The single class in the fixture, after the model has been built. */
function progressFor(entryCount: number | null, scoredCount: number | null) {
  const model = buildSecretaryCockpitModel(snapshotWithCounts(entryCount, scoredCount), STATE);
  const cls = model.trialGroups.flatMap(group => group.classes)[0];
  if (!cls) throw new Error('fixture class missing from model');
  return cls.progress;
}

describe('cockpit progress evidence (audit H1/H3)', () => {
  it('reports progress as UNKNOWN when the entry count never loaded', () => {
    const progress = progressFor(null, null);

    expect(progress.evidence).toBe('unknown');
    expect(progress.value).toBeNull();
  });

  it('reports progress as UNKNOWN when only the scored half is missing', () => {
    // A partial read is still not a fact about how many are scored.
    expect(progressFor(40, null).evidence).toBe('unknown');
  });

  it('reports a real zero as a real zero, so an empty class stays legible', () => {
    const progress = progressFor(0, 0);

    expect(progress.evidence).toBe('computed');
    expect(progress.value).toEqual({ completed: 0, total: 0 });
  });

  it('computes progress normally when the read succeeded', () => {
    const progress = progressFor(40, 12);

    expect(progress.evidence).toBe('computed');
    expect(progress.value).toEqual({ completed: 12, total: 40 });
  });

  it('never turns an unknown count into a zero', () => {
    // The specific failure: "0 of 0 scored" rendered on a class with 40 entries
    // and 12 scored, because every layer defaulted the unknown to a number.
    expect(progressFor(null, null).value).not.toEqual({ completed: 0, total: 0 });
  });
});
