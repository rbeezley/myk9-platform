import { describe, expect, it } from 'vitest';

import { getChangeClassBlock, getChangeClassNote } from '../changeClassEligibility';

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

describe('getChangeClassNote', () => {
  const NOTE = "The rulebook's class change deadline has passed. This change is your call.";

  it('says the deadline has passed for AKC and UKC on a started class', () => {
    expect(getChangeClassNote({ registryId: 'AKC', classStatusKind: 'active' })).toBe(NOTE);
    expect(getChangeClassNote({ registryId: 'UKC', classStatusKind: 'active' })).toBe(NOTE);
  });

  it('reads a missing registry as AKC', () => {
    expect(getChangeClassNote({ classStatusKind: 'active' })).toBe(NOTE);
  });

  it('says nothing for ASCA, whose rules are silent on timing', () => {
    expect(getChangeClassNote({ registryId: 'ASCA', classStatusKind: 'active' })).toBeNull();
  });

  it('says nothing for a class that has not started', () => {
    expect(getChangeClassNote({ registryId: 'AKC', classStatusKind: 'neutral' })).toBeNull();
    expect(getChangeClassNote({ registryId: 'AKC' })).toBeNull();
  });
});
