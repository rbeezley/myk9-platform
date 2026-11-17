import { describe, expect, it } from 'vitest';

import type { ShowMapDisplayStatus } from '../../showMapTypes';
import type { SecretaryCockpitClassEntry } from '../cockpitClassEntries';
import { buildScheduleCardStatus } from '../scheduleCardStatus';
import { queueFor } from './queueFixture';
import type { SecretaryCockpitClass, SecretaryCockpitPaperwork } from '../secretaryCockpitTypes';

const CHECKED_IN: ShowMapDisplayStatus = {
  value: 'checked-in',
  label: 'Checked in',
  kind: 'complete',
};

function entry(
  position: number,
  overrides: Partial<SecretaryCockpitClassEntry> = {}
): SecretaryCockpitClassEntry {
  return {
    nodeId: `entry:${position}`,
    queue: queueFor(`entry:${position}`, `${position}`, overrides.state ?? 'waiting'),
    entryId: `${position}`,
    checkInValue: 'checked-in',
    deskEditable: true,
    lockedReason: null,
    dogName: `Dog ${position}`,
    checkIn: CHECKED_IN,
    state: 'waiting',
    counted: true,
    notCheckedIn: false,
    place: position,
    result: null,
    ...overrides,
  };
}

function cls(overrides: Partial<SecretaryCockpitClass> = {}): SecretaryCockpitClass {
  return {
    id: 'class-1',
    trialId: 'trial-1',
    name: 'Container Novice',
    classOrder: 0,
    lifecycle: 'not-started',
    entryCount: 6,
    scoredCount: 0,
    actions: [],
    attention: [],
    paperwork: [],
    entryRows: [],
    entries: [],
    ...overrides,
  };
}

function paperwork(reportId: string, state: SecretaryCockpitPaperwork['state']) {
  return { reportId, label: reportId, state } satisfies SecretaryCockpitPaperwork;
}

const PRINTED_BEFORE = [paperwork('check-in-sheet', 'current'), paperwork('scoresheet', 'current')];

const NOTHING = { progress: null, inRing: null, nextArmbands: [], nextStep: null };

// MYK9-2143: the lifecycle is the card's badge, so the status never repeats it as a word.
describe('buildScheduleCardStatus', () => {
  it('counts dogs not checked in before the class starts, as the next step', () => {
    const entries = [
      entry(1, { notCheckedIn: true }),
      entry(2, { notCheckedIn: true }),
      entry(3, { notCheckedIn: true }),
      entry(4),
    ];
    expect(buildScheduleCardStatus(cls({ entries }), true)).toEqual({
      ...NOTHING,
      progress: { scored: 0, total: 4 },
      nextStep: '3 of 4 not checked in',
    });
  });

  it('has no next step when everyone is checked in or nothing is read', () => {
    expect(buildScheduleCardStatus(cls({ entries: [entry(1)] }), true).nextStep).toBeNull();
    expect(buildScheduleCardStatus(cls(), true).nextStep).toBeNull();
  });

  it('does not count a pulled dog as not checked in, or as entered', () => {
    const pulled = entry(1, { state: 'pulled', counted: false, place: null });
    expect(buildScheduleCardStatus(cls({ entries: [pulled] }), true)).toEqual(NOTHING);
  });

  it("uses the class's own counts only while its entries are unread", () => {
    expect(
      buildScheduleCardStatus(cls({ lifecycle: 'in-progress', scoredCount: 2 }), true).progress
    ).toEqual({ scored: 2, total: 6 });
    const entries = [entry(1, { state: 'scored', place: null }), entry(2), entry(3)];
    // The entries' counts (3 entered, 1 scored), not the class's own entryCount of 6.
    expect(
      buildScheduleCardStatus(cls({ lifecycle: 'in-progress', entries }), true).progress
    ).toEqual({ scored: 1, total: 3 });
  });

  it('never spells an unknown or empty count as a zero', () => {
    expect(buildScheduleCardStatus(cls({ entryCount: null }), true).progress).toBeNull();
    expect(buildScheduleCardStatus(cls({ entryCount: 0 }), true).progress).toBeNull();
  });

  it('names the dog in the ring and the next armbands while running', () => {
    const entries = [
      entry(1, { state: 'scored', place: null }),
      entry(2, { dogName: 'Willow', armband: '102', state: 'in-ring', place: null }),
      entry(3, { armband: '103' }),
      entry(4, { armband: '104' }),
    ];
    expect(buildScheduleCardStatus(cls({ lifecycle: 'in-progress', entries }), true)).toEqual({
      progress: { scored: 1, total: 4 },
      inRing: { armband: '102', dogName: 'Willow' },
      nextArmbands: ['103', '104'],
      nextStep: null,
    });
  });

  it('names nobody when none is in the ring, and only while running', () => {
    const waiting = [entry(1, { armband: '101' })];
    expect(
      buildScheduleCardStatus(cls({ lifecycle: 'in-progress', entries: waiting }), true)
    ).toMatchObject({ inRing: null, nextArmbands: ['101'] });
    expect(buildScheduleCardStatus(cls({ entries: waiting }), true)).toMatchObject({
      inRing: null,
      nextArmbands: [],
    });
  });

  it('points at the first after-scoring step not done once complete', () => {
    const complete = cls({
      lifecycle: 'complete',
      scoredCount: 6,
      wrapUpStatus: 'needs-judge-signature',
      paperwork: PRINTED_BEFORE,
    });
    expect(buildScheduleCardStatus(complete, true)).toEqual({
      ...NOTHING,
      progress: { scored: 6, total: 6 },
      nextStep: 'Print preliminary results',
    });
  });

  it('waits on the judge signature when every print step is done', () => {
    const complete = cls({
      lifecycle: 'complete',
      scoredCount: 6,
      wrapUpStatus: 'needs-judge-signature',
      paperwork: [
        ...PRINTED_BEFORE,
        paperwork('results-sheet', 'current'),
        paperwork('result-labels', 'current'),
      ],
    });
    expect(buildScheduleCardStatus(complete, true).nextStep).toBe('Waiting on judge signature');
  });

  it('asks for a reprint when printed results went stale', () => {
    const complete = cls({
      lifecycle: 'complete',
      scoredCount: 6,
      wrapUpStatus: 'needs-judge-signature',
      paperwork: [...PRINTED_BEFORE, paperwork('results-sheet', 'stale')],
    });
    expect(buildScheduleCardStatus(complete, true).nextStep).toBe('Reprint preliminary results');
  });

  it('has no next step when signed off, or when the checklist is not in use', () => {
    const paperworkDone = [
      ...PRINTED_BEFORE,
      paperwork('results-sheet', 'current'),
      paperwork('result-labels', 'current'),
    ];
    const signed = cls({
      lifecycle: 'complete',
      scoredCount: 6,
      wrapUpStatus: 'signed-by-judge',
      paperwork: paperworkDone,
    });
    expect(buildScheduleCardStatus(signed, true).nextStep).toBeNull();
    expect(
      buildScheduleCardStatus(
        cls({ lifecycle: 'complete', wrapUpStatus: 'needs-judge-signature' }),
        false
      ).nextStep
    ).toBeNull();
  });

  it('says nothing for a cancelled class, and only the count when the lifecycle is unknown', () => {
    expect(buildScheduleCardStatus(cls({ lifecycle: 'cancelled' }), true)).toEqual(NOTHING);
    expect(buildScheduleCardStatus(cls({ lifecycle: null }), true)).toEqual({
      ...NOTHING,
      progress: { scored: 0, total: 6 },
    });
  });
});
