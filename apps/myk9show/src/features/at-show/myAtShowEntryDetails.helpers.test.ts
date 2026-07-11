import { describe, expect, it } from 'vitest';
import {
  buildMyAtShowEntryDetails,
  deriveAtShowNextAction,
  isExhibitorOnlyForAtShow,
  type AtShowClassSummary,
  type AtShowEntryDetail,
} from './myAtShowEntryDetails.helpers';
import type { ReplicatedEntry } from '@/services/replication';
import { UserRole } from '@/types/auth-types';

const entries: ReplicatedEntry[] = [
  {
    id: 'entry-1',
    showId: 'show-1',
    classId: 'class-1',
    dogCallName: 'Rex',
    armband: '101',
    checkInStatus: 'no-status',
    runOrder: 3,
    isScored: false,
  },
  {
    id: 'entry-2',
    showId: 'show-1',
    classId: 'class-2',
    dogCallName: 'Bella',
    armband: '202',
    checkInStatus: 'checked-in',
    runOrder: undefined,
    isScored: false,
  },
  {
    id: 'entry-3',
    showId: 'show-1',
    classId: null,
    dogCallName: 'Duke',
    armband: undefined,
    checkInStatus: 'no-status',
    isScored: true,
  },
  // Not owned — must never appear in the output.
  {
    id: 'entry-unowned',
    showId: 'show-1',
    classId: 'class-1',
    dogCallName: 'Not Mine',
    isScored: false,
  },
];

const classesById = new Map<string, AtShowClassSummary>([
  ['class-1', { className: 'Novice Container', classStatus: 'in_progress' }],
]);

describe('buildMyAtShowEntryDetails', () => {
  it('only includes owned entries, in entry order', () => {
    const details = buildMyAtShowEntryDetails(
      entries,
      new Set(['entry-1', 'entry-2', 'entry-3']),
      classesById
    );

    expect(details.map(d => d.entryId)).toEqual(['entry-1', 'entry-2', 'entry-3']);
  });

  it('resolves class name from the already-loaded class summary map', () => {
    const details = buildMyAtShowEntryDetails(entries, new Set(['entry-1']), classesById);

    expect(details[0]).toMatchObject({
      dogName: 'Rex',
      armband: '101',
      className: 'Novice Container',
      hasRunOrder: true,
    });
  });

  it('leaves className null when the class is not in the summary map yet (running order not posted)', () => {
    const details = buildMyAtShowEntryDetails(entries, new Set(['entry-2']), classesById);

    expect(details[0]).toMatchObject({ className: null, hasRunOrder: false });
  });

  it('falls back to a generic dog label when the call name is missing', () => {
    const noNameEntries: ReplicatedEntry[] = [{ id: 'entry-x', showId: 'show-1', isScored: false }];
    const details = buildMyAtShowEntryDetails(noNameEntries, new Set(['entry-x']), classesById);

    expect(details[0]?.dogName).toBe('Your dog');
  });
});

describe('deriveAtShowNextAction', () => {
  const base: AtShowEntryDetail = {
    entryId: 'e',
    classId: 'class-1',
    dogName: 'Rex',
    armband: '101',
    checkInStatus: 'no-status',
    className: 'Novice Container',
    hasRunOrder: true,
    isScored: false,
  };

  it('recommends check-in when the class is posted and the exhibitor has not checked in', () => {
    expect(deriveAtShowNextAction(base)).toEqual({ kind: 'check-in' });
  });

  it('recommends waiting when the running order is not posted yet', () => {
    expect(deriveAtShowNextAction({ ...base, hasRunOrder: false, className: null })).toEqual({
      kind: 'wait-running-order',
    });
  });

  it('recommends waiting when there is no class id at all', () => {
    expect(deriveAtShowNextAction({ ...base, classId: null, className: null })).toEqual({
      kind: 'wait-running-order',
    });
  });

  it('does not recommend a check-in tap once already checked in', () => {
    expect(deriveAtShowNextAction({ ...base, checkInStatus: 'checked-in' })).toEqual({
      kind: 'view-class',
    });
  });

  it('recommends nothing further once scored', () => {
    expect(
      deriveAtShowNextAction({ ...base, isScored: true, checkInStatus: 'checked-in' })
    ).toEqual({
      kind: 'scored',
    });
  });
});

describe('isExhibitorOnlyForAtShow', () => {
  function hasRoleFrom(roles: UserRole[]) {
    return (role: UserRole) => roles.includes(role);
  }

  it('is true for an exhibitor-only account', () => {
    expect(isExhibitorOnlyForAtShow(hasRoleFrom([UserRole.EXHIBITOR]))).toBe(true);
  });

  it('is false for a secretary who also exhibits (keeps the class-first default)', () => {
    expect(isExhibitorOnlyForAtShow(hasRoleFrom([UserRole.EXHIBITOR, UserRole.SECRETARY]))).toBe(
      false
    );
  });

  it('is false for a judge, club admin, chairman, steward, or site admin', () => {
    for (const staffRole of [
      UserRole.JUDGE,
      UserRole.CLUB_ADMIN,
      UserRole.CHAIRMAN,
      UserRole.STEWARD,
      UserRole.SITE_ADMIN,
    ]) {
      expect(isExhibitorOnlyForAtShow(hasRoleFrom([staffRole]))).toBe(false);
    }
  });

  it('is false for an account without the exhibitor role at all', () => {
    expect(isExhibitorOnlyForAtShow(hasRoleFrom([]))).toBe(false);
  });
});
