import { describe, expect, it } from 'vitest';

import type { ShowMapDisplayStatus } from '../../showMapTypes';
import type { SecretaryCockpitClassEntry } from '../cockpitClassEntries';
import { buildStatusLine } from '../scheduleStatusLine';
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

describe('buildStatusLine', () => {
  it('counts dogs not checked in before the class starts', () => {
    const entries = [
      entry(1, { notCheckedIn: true }),
      entry(2, { notCheckedIn: true }),
      entry(3, { notCheckedIn: true }),
      entry(4),
    ];
    expect(buildStatusLine(cls({ entries }), true).text).toBe(
      'Not started · 3 of 4 not checked in'
    );
  });

  it('returns the phrase as parts so the row can set a pending link after the lead', () => {
    const entries = [entry(1, { notCheckedIn: true }), entry(2)];
    expect(buildStatusLine(cls({ entries }), true).parts).toEqual([
      'Not started',
      '1 of 2 not checked in',
    ]);
    const running = buildStatusLine(cls({ lifecycle: 'in-progress', scoredCount: 2 }), true);
    expect(running.parts).toEqual(['Running', '2 of 6 scored']);
    expect(running.parts.join(' · ')).toBe(running.text);
  });

  it('says only "Not started" when everyone is checked in or nothing is read', () => {
    expect(buildStatusLine(cls({ entries: [entry(1)] }), true).text).toBe('Not started');
    expect(buildStatusLine(cls(), true).text).toBe('Not started');
  });

  it('does not count a pulled dog as not checked in', () => {
    const pulled = entry(1, { state: 'pulled', counted: false, place: null });
    expect(buildStatusLine(cls({ entries: [pulled] }), true).text).toBe('Not started');
  });

  it('names the dog in the ring while running', () => {
    const entries = [
      entry(1, { state: 'scored', place: null }),
      entry(2, { dogName: 'Willow', state: 'in-ring', place: null }),
      entry(3),
    ];
    // The tiles' counts (3 entered, 1 scored), not the class's own entryCount of 6.
    expect(buildStatusLine(cls({ lifecycle: 'in-progress', entries }), true).text).toBe(
      'Running · 1 of 3 scored · Willow in ring'
    );
  });

  it('omits the dog when none is in the ring', () => {
    expect(buildStatusLine(cls({ lifecycle: 'in-progress', scoredCount: 2 }), true).text).toBe(
      'Running · 2 of 6 scored'
    );
  });

  it('points at the first after-scoring step not done once complete', () => {
    const complete = cls({
      lifecycle: 'complete',
      scoredCount: 6,
      wrapUpStatus: 'needs-judge-signature',
      paperwork: PRINTED_BEFORE,
    });
    expect(buildStatusLine(complete, true).text).toBe('Print preliminary results');
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
    expect(buildStatusLine(complete, true).text).toBe('Waiting on judge signature');
  });

  it('asks for a reprint when printed results went stale', () => {
    const complete = cls({
      lifecycle: 'complete',
      scoredCount: 6,
      wrapUpStatus: 'needs-judge-signature',
      paperwork: [...PRINTED_BEFORE, paperwork('results-sheet', 'stale')],
    });
    expect(buildStatusLine(complete, true).text).toBe('Reprint preliminary results');
  });

  it('reads Complete when signed off, or when the checklist is not in use', () => {
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
    expect(buildStatusLine(signed, true).text).toBe('Complete');
    expect(
      buildStatusLine(cls({ lifecycle: 'complete', wrapUpStatus: 'needs-judge-signature' }), false)
        .text
    ).toBe('Complete');
  });

  it('reads Cancelled, and a plain fallback when the lifecycle is unknown', () => {
    expect(buildStatusLine(cls({ lifecycle: 'cancelled' }), true).text).toBe('Cancelled');
    expect(buildStatusLine(cls({ lifecycle: null }), true).text).toBe('Status not set');
  });
});
