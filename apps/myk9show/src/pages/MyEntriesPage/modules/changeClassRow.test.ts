import { describe, it, expect } from 'vitest';
import { EntryStatus } from '@/types/show-registration-types';
import {
  canChangeClass,
  declinedClassChangeReason,
  listChangeClassOptions,
  type ChangeClassRowContext,
} from './changeClassRow';

const OPEN: ChangeClassRowContext = {
  kind: 'opens-later',
  isPastShow: false,
  isShowClosedOut: false,
  unresolved: false,
  hasShowId: true,
  entryStatus: EntryStatus.ACCEPTED,
};

describe('canChangeClass', () => {
  it('is offered to an accepted entry that has not been to the ring', () => {
    expect(canChangeClass(OPEN)).toBe(true);
  });

  it.each([
    ['a pending entry', { entryStatus: EntryStatus.PENDING }],
    ['a waiting request', { entryStatus: EntryStatus.MOVE_UP_REQUESTED }],
    ['a checked-in dog', { kind: 'checked-in' as const }],
    ['a dog in the ring', { kind: 'in-ring' as const }],
    ['a scored row', { kind: 'result' as const }],
    ['a past show', { isPastShow: true }],
    ['a closed-out show', { isShowClosedOut: true }],
    ['an unresolved class', { unresolved: true }],
    ['a missing show', { hasShowId: false }],
  ])('is not offered for %s', (_name, change) => {
    expect(canChangeClass({ ...OPEN, ...change })).toBe(false);
  });
});

describe('declinedClassChangeReason', () => {
  it('reads the reason the secretary left', () => {
    expect(declinedClassChangeReason(EntryStatus.ACCEPTED, 'Move-up denied: Too late')).toBe(
      'Too late'
    );
    expect(declinedClassChangeReason(EntryStatus.ACCEPTED, 'Move-up request denied')).toBe('');
  });

  it('is null for any other row', () => {
    expect(declinedClassChangeReason(EntryStatus.ACCEPTED, 'Move-up denied: x')).toBe('x');
    expect(
      declinedClassChangeReason(EntryStatus.MOVE_UP_REQUESTED, 'Move-up denied: x')
    ).toBeNull();
    expect(declinedClassChangeReason(EntryStatus.ACCEPTED, 'Bring a crate')).toBeNull();
    expect(declinedClassChangeReason(EntryStatus.ACCEPTED, undefined)).toBeNull();
  });
});

describe('listChangeClassOptions', () => {
  const base = { status: 'upcoming', hasStarted: false, trialName: 'Trial 1', isFull: false };
  const classes = [
    { ...base, classId: 'a', className: 'A' },
    { ...base, classId: 'b', className: 'B' },
    { ...base, classId: 'c', className: 'C', isFull: true },
    { ...base, classId: 'd', className: 'D', hasStarted: true },
    { ...base, classId: 'e', className: 'E', status: 'cancelled' },
    { ...base, classId: 'f', className: 'F' },
  ] as unknown as Parameters<typeof listChangeClassOptions>[0]['classes'];

  it('drops the current class, the dog’s other classes and closed classes; marks full ones', () => {
    const options = listChangeClassOptions({
      classes,
      currentClassId: 'a',
      dogClassIds: new Set(['a', 'f']),
    });
    expect(options.map(o => [o.classId, o.state])).toEqual([
      ['b', 'open'],
      ['c', 'full'],
    ]);
  });
});
