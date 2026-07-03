import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useShowEntriesForUser } from './useShowEntriesForUser';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@/store/entryStore', () => ({
  useEntryStore: vi.fn(),
}));

vi.mock('@/hooks/useClassStoreCompat', () => ({
  useClassStoreCompat: vi.fn(),
}));

vi.mock('@/hooks/useDogStoreCompat', () => ({
  useDogStoreCompat: vi.fn(),
}));

vi.mock('@/hooks/useShowStoreCompat', () => ({
  useShowStoreCompat: vi.fn(),
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: vi.fn(),
}));

import { useEntryStore } from '@/store/entryStore';
import { useClassStoreCompat } from '@/hooks/useClassStoreCompat';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { useShowStoreCompat } from '@/hooks/useShowStoreCompat';
import { useAuthContext } from '@/hooks/useAuthContext';
import { ScopeType, UserRole } from '@/types/auth-types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const USER_ID = 'user-1';
const SHOW_ID = 'show-1';
const DOG_ID = 'dog-1';
const CLASS_ID = 'class-1';
const TRIAL_ID = 'trial-1';

function makeDog(overrides = {}) {
  return { id: DOG_ID, ownerId: USER_ID, callName: 'Maggie', name: 'Magnolia', ...overrides };
}

function makeClass(overrides = {}) {
  return {
    id: CLASS_ID,
    trialId: TRIAL_ID,
    trial: 'Trial 1',
    trialDate: '2026-05-10',
    element: 'Container',
    level: 'Novice',
    section: 'A',
    className: 'Container Novice A',
    judge: 'Smith',
    startTime: '9:00 AM',
    ...overrides,
  };
}

function makeEntry(overrides = {}) {
  return {
    id: 'entry-1',
    showId: SHOW_ID,
    classId: CLASS_ID,
    dogId: DOG_ID,
    status: 'accepted',
    registrationData: { armband: '101', runOrder: 3, handler: 'Sarah', submittedAt: '', entryFee: 0, paymentStatus: 'paid' },
    competitionData: undefined,
    checkInStatus: 'no-status',
    ...overrides,
  };
}

function setMocks({
  entries = [makeEntry()],
  classes = [makeClass()],
  dogs = [makeDog()],
  shows = [{ id: SHOW_ID, clubId: 'club-1' }],
  userId = USER_ID,
  isAdmin = false,
  isSecretary = false,
  scopes = [],
  hasRole = vi.fn(() => false),
  isLoading = false,
  error = null,
} = {}) {
  vi.mocked(useAuthContext).mockReturnValue({
    userWithRoles: { databaseUserId: userId, scopes },
    isAdmin,
    isSecretary,
    hasRole,
  } as ReturnType<typeof useAuthContext>);

  vi.mocked(useEntryStore).mockImplementation((selector: (s: unknown) => unknown) => {
    const state = { entries, isLoading, error };
    return selector(state);
  });

  vi.mocked(useClassStoreCompat).mockReturnValue({ classes } as ReturnType<typeof useClassStoreCompat>);
  vi.mocked(useDogStoreCompat).mockReturnValue({ dogs } as ReturnType<typeof useDogStoreCompat>);
  vi.mocked(useShowStoreCompat).mockReturnValue({ shows } as ReturnType<typeof useShowStoreCompat>);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useShowEntriesForUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty result when showId is undefined', () => {
    setMocks();
    const { result } = renderHook(() => useShowEntriesForUser(undefined));
    expect(result.current.allEntries).toHaveLength(0);
    expect(result.current.dogGroups).toHaveLength(0);
  });

  it('returns empty result when user has no dogs', () => {
    setMocks({ dogs: [] });
    const { result } = renderHook(() => useShowEntriesForUser(SHOW_ID));
    expect(result.current.allEntries).toHaveLength(0);
  });

  it('excludes entries from other shows', () => {
    setMocks({ entries: [makeEntry({ showId: 'other-show' })] });
    const { result } = renderHook(() => useShowEntriesForUser(SHOW_ID));
    expect(result.current.allEntries).toHaveLength(0);
  });

  it('excludes entries for dogs owned by other users', () => {
    setMocks({ dogs: [makeDog({ ownerId: 'other-user' })] });
    const { result } = renderHook(() => useShowEntriesForUser(SHOW_ID));
    expect(result.current.allEntries).toHaveLength(0);
  });

  it('includes all show entries for secretary users scoped to the show club', () => {
    setMocks({
      dogs: [makeDog({ ownerId: 'other-user' })],
      isSecretary: true,
      scopes: [{ scopeType: ScopeType.CLUB, scopeId: 'club-1', roleId: UserRole.SECRETARY }],
    });
    const { result } = renderHook(() => useShowEntriesForUser(SHOW_ID));
    expect(result.current.allEntries).toHaveLength(1);
    expect(result.current.allEntries[0].dogName).toBe('Maggie');
  });

  it('does not expose all show entries for secretary users scoped to a different club', () => {
    setMocks({
      dogs: [makeDog({ ownerId: 'other-user' })],
      isSecretary: true,
      scopes: [{ scopeType: ScopeType.CLUB, scopeId: 'other-club', roleId: UserRole.SECRETARY }],
    });
    const { result } = renderHook(() => useShowEntriesForUser(SHOW_ID));
    expect(result.current.allEntries).toHaveLength(0);
  });

  it('includes all show entries for secretary users scoped directly to the show', () => {
    setMocks({
      dogs: [makeDog({ ownerId: 'other-user' })],
      isSecretary: true,
      scopes: [{ scopeType: ScopeType.SHOW, scopeId: SHOW_ID, roleId: UserRole.SECRETARY }],
    });
    const { result } = renderHook(() => useShowEntriesForUser(SHOW_ID));
    expect(result.current.allEntries).toHaveLength(1);
  });

  it('includes all show entries for club admins scoped to the show club', () => {
    setMocks({
      dogs: [makeDog({ ownerId: 'other-user' })],
      hasRole: vi.fn(role => role === UserRole.CLUB_ADMIN),
      scopes: [{ scopeType: ScopeType.CLUB, scopeId: 'club-1', roleId: UserRole.CLUB_ADMIN }],
    });
    const { result } = renderHook(() => useShowEntriesForUser(SHOW_ID));
    expect(result.current.allEntries).toHaveLength(1);
  });

  it('does not expose all show entries for club admins scoped to a different club', () => {
    setMocks({
      dogs: [makeDog({ ownerId: 'other-user' })],
      hasRole: vi.fn(role => role === UserRole.CLUB_ADMIN),
      scopes: [{ scopeType: ScopeType.CLUB, scopeId: 'other-club', roleId: UserRole.CLUB_ADMIN }],
    });
    const { result } = renderHook(() => useShowEntriesForUser(SHOW_ID));
    expect(result.current.allEntries).toHaveLength(0);
  });

  it('enriches entry with element, level, classTitle from class store', () => {
    setMocks();
    const { result } = renderHook(() => useShowEntriesForUser(SHOW_ID));
    const entry = result.current.allEntries[0];
    expect(entry.element).toBe('Container');
    expect(entry.level).toBe('Novice');
    expect(entry.classTitle).toContain('Container');
  });

  it('enriches entry with trialDate and dayLabel', () => {
    setMocks();
    const { result } = renderHook(() => useShowEntriesForUser(SHOW_ID));
    const entry = result.current.allEntries[0];
    expect(entry.trialDate).toBe('2026-05-10');
    expect(entry.dayLabel).toContain('Sunday');
  });

  it('enriches entry with startTime and judgeName', () => {
    setMocks();
    const { result } = renderHook(() => useShowEntriesForUser(SHOW_ID));
    const entry = result.current.allEntries[0];
    expect(entry.startTime).toBe('9:00 AM');
    expect(entry.judgeName).toBe('Smith');
  });

  it('uses the show judge assignment for the class before stale class judge text', () => {
    setMocks({
      classes: [makeClass({ judge: 'TBD' })],
      shows: [
        {
          id: SHOW_ID,
          clubId: 'club-1',
          assignedJudges: [
            {
              judgeId: 'judge-1',
              judgeName: 'Assigned Judge',
              assignedDate: '2026-05-01',
              assignedClasses: [CLASS_ID],
            },
          ],
        },
      ],
    });

    const { result } = renderHook(() => useShowEntriesForUser(SHOW_ID));

    expect(result.current.allEntries[0].judgeName).toBe('Assigned Judge');
  });

  it('keeps TBD only for genuinely unassigned classes', () => {
    setMocks({ classes: [makeClass({ judge: 'TBD' })] });
    const { result } = renderHook(() => useShowEntriesForUser(SHOW_ID));

    expect(result.current.allEntries[0].judgeName).toBe('TBD');
  });

  it('hasResult is false when competitionData is absent', () => {
    setMocks();
    const { result } = renderHook(() => useShowEntriesForUser(SHOW_ID));
    expect(result.current.allEntries[0].hasResult).toBe(false);
  });

  it('hasResult is true and result is populated when competitionData present', () => {
    const compData = {
      qualified: true,
      time: '00:38.2',
      placement: '1',
      faults: 0,
      recordedBy: 'judge',
      recordedAt: '2026-05-10T10:00:00Z',
    };
    setMocks({ entries: [makeEntry({ competitionData: compData })] });
    const { result } = renderHook(() => useShowEntriesForUser(SHOW_ID));
    const entry = result.current.allEntries[0];
    expect(entry.hasResult).toBe(true);
    expect(entry.result?.qualified).toBe(true);
    expect(entry.result?.time).toBe('00:38.2');
    expect(entry.result?.placement).toBe(1);
    expect(entry.result?.faults).toBe(0);
  });

  it('groups entries by dog', () => {
    const dog2 = makeDog({ id: 'dog-2', callName: 'Daisy' });
    const class2 = makeClass({ id: 'class-2' });
    const entry2 = makeEntry({ id: 'entry-2', dogId: 'dog-2', classId: 'class-2' });
    setMocks({ dogs: [makeDog(), dog2], classes: [makeClass(), class2], entries: [makeEntry(), entry2] });
    const { result } = renderHook(() => useShowEntriesForUser(SHOW_ID));
    expect(result.current.dogGroups).toHaveLength(2);
    expect(result.current.totalClasses).toBe(2);
  });

  it('sorts allEntries by date then startTime', () => {
    const class2 = makeClass({ id: 'class-2', trialDate: '2026-05-11', startTime: '10:00 AM' });
    const class3 = makeClass({ id: 'class-3', trialDate: '2026-05-10', startTime: '14:00 PM' });
    const entry2 = makeEntry({ id: 'e2', classId: 'class-2' });
    const entry3 = makeEntry({ id: 'e3', classId: 'class-3' });
    setMocks({
      classes: [makeClass(), class2, class3],
      entries: [makeEntry(), entry2, entry3],
    });
    const { result } = renderHook(() => useShowEntriesForUser(SHOW_ID));
    const dates = result.current.allEntries.map(e => e.trialDate);
    expect(dates[0]).toBe('2026-05-10');
    expect(dates[1]).toBe('2026-05-10');
    expect(dates[2]).toBe('2026-05-11');
  });

  it('computes dogsAhead correctly', () => {
    // entry has runOrder 3; two other unscored entries in same class with orders 1 and 2
    const otherEntry1 = makeEntry({
      id: 'oe1', dogId: 'dog-x',
      registrationData: { armband: '100', runOrder: 1, handler: 'x', submittedAt: '', entryFee: 0, paymentStatus: 'paid' },
    });
    const otherEntry2 = makeEntry({
      id: 'oe2', dogId: 'dog-x',
      registrationData: { armband: '102', runOrder: 2, handler: 'x', submittedAt: '', entryFee: 0, paymentStatus: 'paid' },
    });
    setMocks({ entries: [makeEntry(), otherEntry1, otherEntry2] });
    const { result } = renderHook(() => useShowEntriesForUser(SHOW_ID));
    expect(result.current.allEntries[0].dogsAhead).toBe(2);
  });

  it('uses dogName from callName', () => {
    setMocks();
    const { result } = renderHook(() => useShowEntriesForUser(SHOW_ID));
    expect(result.current.allEntries[0].dogName).toBe('Maggie');
  });

  it('skips entries whose classId has no matching class', () => {
    setMocks({ entries: [makeEntry({ classId: 'no-such-class' })] });
    const { result } = renderHook(() => useShowEntriesForUser(SHOW_ID));
    expect(result.current.allEntries).toHaveLength(0);
  });

  it('carries entryStatus and paymentStatus through enrichment', () => {
    setMocks();
    const { result } = renderHook(() => useShowEntriesForUser(SHOW_ID));
    const entry = result.current.allEntries[0];
    expect(entry.entryStatus).toBe('accepted');
    expect(entry.paymentStatus).toBe('paid');
  });

  it('keeps a withdrawn/refunded entry (does not drop it) with its terminal state', () => {
    setMocks({
      entries: [
        makeEntry({
          status: 'withdrawn',
          registrationData: {
            armband: '101',
            runOrder: 3,
            handler: 'Sarah',
            submittedAt: '',
            entryFee: 30,
            paymentStatus: 'refunded',
          },
        }),
      ],
    });
    const { result } = renderHook(() => useShowEntriesForUser(SHOW_ID));
    expect(result.current.allEntries).toHaveLength(1);
    const entry = result.current.allEntries[0];
    expect(entry.entryStatus).toBe('withdrawn');
    expect(entry.paymentStatus).toBe('refunded');
  });

  describe('move-up duplicate handling', () => {
    const DEST_CLASS_ID = 'class-2';

    function reg(overrides = {}) {
      return {
        armband: '101',
        runOrder: 3,
        handler: 'Sarah',
        submittedAt: '',
        entryFee: 0,
        paymentStatus: 'paid',
        ...overrides,
      };
    }

    function setupMoveUp(extraEntries: ReturnType<typeof makeEntry>[] = []) {
      const sourceClass = makeClass(); // class-1: Container Novice A
      const destClass = makeClass({
        id: DEST_CLASS_ID,
        element: 'Interior',
        level: 'Excellent',
        section: 'B',
        className: 'Interior Excellent B',
      });
      const sourceEntry = makeEntry({
        id: 'src-1',
        classId: CLASS_ID,
        status: 'moved',
        registrationData: reg({ specialRequests: 'Moved up to Interior Excellent B' }),
      });
      const destEntry = makeEntry({
        id: 'dest-1',
        classId: DEST_CLASS_ID,
        status: 'confirmed',
        registrationData: reg({ runOrder: 1, specialRequests: `Moved up from class ${CLASS_ID}` }),
      });
      setMocks({
        classes: [sourceClass, destClass],
        entries: [sourceEntry, destEntry, ...extraEntries],
      });
    }

    it('suppresses the moved source row, leaving only the destination', () => {
      setupMoveUp();
      const { result } = renderHook(() => useShowEntriesForUser(SHOW_ID));
      expect(result.current.allEntries).toHaveLength(1);
      expect(result.current.allEntries[0].entryId).toBe('dest-1');
      expect(result.current.allEntries[0].classId).toBe(DEST_CLASS_ID);
      expect(result.current.totalClasses).toBe(1);
    });

    it('annotates the destination row with the source class name', () => {
      setupMoveUp();
      const { result } = renderHook(() => useShowEntriesForUser(SHOW_ID));
      expect(result.current.allEntries[0].movedUpFrom).toBe('Container Novice A');
    });

    it('suppresses the source but leaves movedUpFrom undefined when the source class is not loaded', () => {
      // Destination references a source class that isn't in the class store (e.g.
      // filtered out). The source row is still suppressed; annotation falls back
      // to undefined rather than rendering a raw class id.
      const destClass = makeClass({
        id: DEST_CLASS_ID,
        element: 'Interior',
        level: 'Excellent',
        section: 'B',
        className: 'Interior Excellent B',
      });
      const sourceEntry = makeEntry({
        id: 'src-1',
        classId: CLASS_ID,
        status: 'moved',
        registrationData: reg({ specialRequests: 'Moved up to Interior Excellent B' }),
      });
      const destEntry = makeEntry({
        id: 'dest-1',
        classId: DEST_CLASS_ID,
        status: 'confirmed',
        registrationData: reg({ runOrder: 1, specialRequests: `Moved up from class ${CLASS_ID}` }),
      });
      // Only the destination class is loaded — the source class (CLASS_ID) is not.
      setMocks({ classes: [destClass], entries: [sourceEntry, destEntry] });
      const { result } = renderHook(() => useShowEntriesForUser(SHOW_ID));
      expect(result.current.allEntries).toHaveLength(1);
      expect(result.current.allEntries[0].entryId).toBe('dest-1');
      expect(result.current.allEntries[0].movedUpFrom).toBeUndefined();
    });

    it('keeps the moved source row when its destination is absent (half-failed move)', () => {
      // Only the moved source exists — no destination row was inserted.
      const sourceClass = makeClass();
      const orphanSource = makeEntry({
        id: 'src-1',
        classId: CLASS_ID,
        status: 'moved',
        registrationData: reg({ specialRequests: 'Moved up to Interior Excellent B' }),
      });
      setMocks({ classes: [sourceClass], entries: [orphanSource] });
      const { result } = renderHook(() => useShowEntriesForUser(SHOW_ID));
      expect(result.current.allEntries).toHaveLength(1);
      expect(result.current.allEntries[0].entryId).toBe('src-1');
      expect(result.current.allEntries[0].movedUpFrom).toBeUndefined();
    });

    it('shows only the final row for a chained move-up (no phantom intermediate rows)', () => {
      // Novice -> Advanced -> Excellent. Both intermediate rows are 'moved' with
      // their back-pointer overwritten to "Moved up to ..."; only the final
      // Excellent row survives.
      const noviceClass = makeClass({ id: CLASS_ID });
      const advancedClass = makeClass({ id: 'class-adv', level: 'Advanced' });
      const excellentClass = makeClass({ id: 'class-exc', level: 'Excellent' });
      const novice = makeEntry({
        id: 'src-novice',
        classId: CLASS_ID,
        status: 'moved',
        registrationData: reg({ specialRequests: 'Moved up to Advanced' }),
      });
      const advanced = makeEntry({
        id: 'src-advanced',
        classId: 'class-adv',
        status: 'moved',
        registrationData: reg({ specialRequests: 'Moved up to Excellent' }),
      });
      const excellent = makeEntry({
        id: 'dest-excellent',
        classId: 'class-exc',
        status: 'confirmed',
        registrationData: reg({ runOrder: 1, specialRequests: 'Moved up from class class-adv' }),
      });
      setMocks({
        classes: [noviceClass, advancedClass, excellentClass],
        entries: [novice, advanced, excellent],
      });
      const { result } = renderHook(() => useShowEntriesForUser(SHOW_ID));
      expect(result.current.allEntries).toHaveLength(1);
      expect(result.current.allEntries[0].entryId).toBe('dest-excellent');
      expect(result.current.allEntries[0].movedUpFrom).toBe('Container Advanced A');
    });
  });
});
