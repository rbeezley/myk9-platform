import { describe, expect, it } from 'vitest';
import { EMPTY_UNSENT_WORK, type UnsentWork } from '@/services/replication/unsentWork';
import { UserRole } from '@/types/auth-types';
import { readSignOutUnsent, resolveSignOutWarning } from './signOutWarning';

const work = (unsentScoreCount: number, otherChangeCount = 0): UnsentWork => ({
  ...EMPTY_UNSENT_WORK,
  unsentScoreCount,
  otherChangeCount,
  total: unsentScoreCount + otherChangeCount,
});

describe('resolveSignOutWarning (MYK9-2013)', () => {
  it.each([
    ['a passcode session online', false, []],
    ['an exhibitor account online', false, [UserRole.EXHIBITOR]],
    ['a judge account online', false, [UserRole.JUDGE]],
    ['a passcode session offline', true, []],
    ['a judge account offline', true, [UserRole.JUDGE]],
  ])('warns %s with unsent scores and names the count', async (_label, isOffline, roles) => {
    const warning = await resolveSignOutWarning({
      isOffline,
      roles,
      read: async () => work(2),
    });
    expect(warning).not.toBeNull();
    expect(warning?.unsent).toEqual({ scores: 2, otherChanges: 0 });
  });

  it('signs a passcode session out with no warning when nothing is unsent online', async () => {
    expect(
      await resolveSignOutWarning({ isOffline: false, roles: [], read: async () => work(0) })
    ).toBeNull();
  });

  it('warns when the device read fails', async () => {
    const warning = await resolveSignOutWarning({
      isOffline: false,
      roles: [],
      read: () => Promise.reject(new Error('IndexedDB closed')),
    });
    expect(warning).toEqual({ mode: 'unsent', unsent: null });
  });

  it('reads the counts from the unsent-work source', async () => {
    expect(await readSignOutUnsent(async () => work(3, 1))).toEqual({
      scores: 3,
      otherChanges: 1,
    });
  });
});
