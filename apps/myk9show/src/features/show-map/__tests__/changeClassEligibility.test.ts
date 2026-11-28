import { describe, expect, it } from 'vitest';

import {
  getChangeClassBlock,
  getChangeClassNote,
  isJudgingUnderway,
} from '../changeClassEligibility';

// MYK9-2476: Change class is offered while the dog has not run, even on a started class.
describe('getChangeClassBlock', () => {
  const accepted = { entryStatus: 'confirmed' } as const;

  it('offers an unrun accepted dog on a started class', () => {
    expect(getChangeClassBlock({ ...accepted, classStatusKind: 'active' })).toBeNull();
    expect(
      getChangeClassBlock({ ...accepted, classStatusKind: 'active', runStatusKind: 'neutral' })
    ).toBeNull();
  });

  it('still offers an unrun dog on a class that has not started', () => {
    expect(getChangeClassBlock({ ...accepted, classStatusKind: 'neutral' })).toBeNull();
    expect(getChangeClassBlock({ ...accepted })).toBeNull();
  });

  it('blocks a dog that has run, even on a started class', () => {
    expect(
      getChangeClassBlock({ ...accepted, classStatusKind: 'active', runStatusKind: 'complete' })
    ).toBe('This entry has already run.');
  });

  it('blocks a dog in the ring', () => {
    expect(
      getChangeClassBlock({ ...accepted, classStatusKind: 'active', runStatusKind: 'active' })
    ).toBe('This entry is in the ring.');
  });

  it('blocks a moved, pulled or scratched dog', () => {
    expect(
      getChangeClassBlock({ ...accepted, classStatusKind: 'active', runStatusKind: 'muted' })
    ).toBe('This entry was already moved or removed.');
  });

  it('blocks a pending or withdrawn entry on a started class', () => {
    expect(getChangeClassBlock({ entryStatus: 'pending', classStatusKind: 'active' })).toBe(
      'Accept this entry first.'
    );
    expect(getChangeClassBlock({ entryStatus: 'withdrawn', classStatusKind: 'active' })).toBe(
      'This entry is withdrawn or scratched.'
    );
  });

  it('blocks a finished class and a cancelled class', () => {
    expect(getChangeClassBlock({ ...accepted, classStatusKind: 'complete' })).toBe(
      'Its class is finished.'
    );
    expect(getChangeClassBlock({ ...accepted, classStatusKind: 'muted' })).toBe(
      'Its class was cancelled.'
    );
  });
});

describe('isJudgingUnderway', () => {
  it('reads a started or finished class as underway', () => {
    expect(isJudgingUnderway('active', [])).toBe(true);
    expect(isJudgingUnderway('complete', [])).toBe(true);
  });

  it('reads a dog in the ring, scored, or checked in as underway while the class still reads not started', () => {
    expect(isJudgingUnderway('neutral', [{ runStatusKind: 'active' }])).toBe(true);
    expect(isJudgingUnderway('neutral', [{ runStatusKind: 'complete' }])).toBe(true);
    expect(isJudgingUnderway('neutral', [{ checkInStatus: 'checked-in' }])).toBe(true);
  });

  it('does not count a dog at the gate, a moved or pulled dog, or no evidence', () => {
    expect(isJudgingUnderway('neutral', [{ checkInStatus: 'at-gate' }])).toBe(false);
    expect(
      isJudgingUnderway('neutral', [{ runStatusKind: 'muted', checkInStatus: 'checked-in' }])
    ).toBe(false);
    expect(isJudgingUnderway(undefined, [{}])).toBe(false);
  });
});

describe('getChangeClassNote', () => {
  const NOTE = "The rulebook's class change deadline has passed. This change is your call.";

  it('says the deadline has passed for AKC and UKC once judging is underway', () => {
    expect(getChangeClassNote({ registryId: 'AKC', judgingUnderway: true })).toBe(NOTE);
    expect(getChangeClassNote({ registryId: 'UKC', judgingUnderway: true })).toBe(NOTE);
  });

  it('reads a missing registry as AKC', () => {
    expect(getChangeClassNote({ judgingUnderway: true })).toBe(NOTE);
  });

  it('says nothing for ASCA, whose rules are silent on timing', () => {
    expect(getChangeClassNote({ registryId: 'ASCA', judgingUnderway: true })).toBeNull();
  });

  it('says nothing before judging has begun', () => {
    expect(getChangeClassNote({ registryId: 'AKC', judgingUnderway: false })).toBeNull();
  });
});
