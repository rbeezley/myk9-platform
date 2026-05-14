import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useMyEntries } from '@/hooks/useMyEntries';
import type { SyncableShowEntry } from '@/store/entry-store-types';

// --- Mock stores ---

const mockEntries: SyncableShowEntry[] = [];
const mockClasses: Array<{ id: string; className?: string }> = [];
const mockDogs: Array<{ id: string; callName?: string; name: string; ownerId: string }> = [];
let mockIsLoading = false;
let mockError: string | null = null;

// Auth mock state
let mockAuthState = {
  userWithRoles: {
    databaseUserId: 'person-1',
    roles: [{ name: 'exhibitor' }],
  } as Record<string, unknown>,
  isAdmin: false,
  isSecretary: false,
  loading: false,
  rbacLoading: false,
  hasRole: (role: string) => role === 'exhibitor',
};

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => mockAuthState,
}));

vi.mock('@/store/entryStore', () => ({
  useEntryStore: (selector?: (s: Record<string, unknown>) => unknown) => {
    const state = {
      entries: mockEntries,
      isLoading: mockIsLoading,
      error: mockError,
    };
    return selector ? selector(state) : state;
  },
}));

vi.mock('@/hooks/useClassStoreCompat', () => ({
  useClassStoreCompat: () => ({ classes: mockClasses }),
}));

vi.mock('@/hooks/useDogStoreCompat', () => ({
  useDogStoreCompat: () => ({ dogs: mockDogs }),
}));

// --- Helpers ---

function makeEntry(
  overrides: Partial<SyncableShowEntry> & {
    id: string;
    showId: string;
    classId: string;
    dogId: string;
  }
): SyncableShowEntry {
  return {
    status: 'confirmed' as const,
    registrationData: {
      submittedAt: new Date().toISOString(),
      handler: '',
      entryFee: 0,
      paymentStatus: 'pending' as const,
      ...overrides.registrationData,
    },
    statusHistory: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    _version: 1,
    _lastModified: new Date(),
    _lastModifiedBy: 'test',
    _syncStatus: 'synced' as const,
    ...overrides,
  } as SyncableShowEntry;
}

// --- Tests ---

describe('useMyEntries', () => {
  beforeEach(() => {
    mockEntries.length = 0;
    mockClasses.length = 0;
    mockDogs.length = 0;
    mockIsLoading = false;
    mockError = null;
    mockAuthState = {
      userWithRoles: {
        databaseUserId: 'person-1',
        roles: [{ name: 'exhibitor' }],
      },
      isAdmin: false,
      isSecretary: false,
      loading: false,
      rbacLoading: false,
      hasRole: (role: string) => role === 'exhibitor',
    };
  });

  it('returns empty results when showId is undefined', () => {
    const { result } = renderHook(() => useMyEntries(undefined));
    expect(result.current.entries).toHaveLength(0);
    expect(result.current.entriesByClass).toHaveLength(0);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isError).toBe(false);
  });

  it('returns entries for exhibitor filtered by dog ownership', () => {
    mockDogs.push({ id: 'd1', callName: 'Bella', name: 'Bella', ownerId: 'person-1' });
    mockClasses.push({ id: 'c1', className: 'Novice JWW' });
    mockEntries.push(
      makeEntry({ id: 'e1', showId: 'show-1', classId: 'c1', dogId: 'd1' }),
      makeEntry({ id: 'e2', showId: 'show-1', classId: 'c1', dogId: 'd-other' })
    );

    const { result } = renderHook(() => useMyEntries('show-1'));
    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0].id).toBe('e1');
    expect(result.current.entriesByClass[0].dogName).toBe('Bella');
    expect(result.current.entriesByClass[0].className).toBe('Novice JWW');
  });

  it('keeps site admin My entries scoped to dogs they own', () => {
    mockAuthState = {
      userWithRoles: { databaseUserId: 'admin-1', roles: [{ name: 'site_admin' }] },
      isAdmin: true,
      isSecretary: false,
      loading: false,
      rbacLoading: false,
      hasRole: (role: string) => role === 'site_admin',
    };
    mockDogs.push(
      { id: 'd1', callName: 'Bella', name: 'Bella', ownerId: 'admin-1' },
      { id: 'd2', callName: 'Max', name: 'Max', ownerId: 'someone-else' }
    );
    mockClasses.push({ id: 'c1', className: 'Novice JWW' });
    mockEntries.push(
      makeEntry({ id: 'e1', showId: 'show-1', classId: 'c1', dogId: 'd1' }),
      makeEntry({ id: 'e2', showId: 'show-1', classId: 'c1', dogId: 'd2' })
    );

    const { result } = renderHook(() => useMyEntries('show-1'));
    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0].id).toBe('e1');
  });

  it('keeps secretary My entries scoped to dogs they own', () => {
    mockAuthState = {
      userWithRoles: { databaseUserId: 'sec-1', roles: [{ name: 'secretary' }] },
      isAdmin: false,
      isSecretary: true,
      loading: false,
      rbacLoading: false,
      hasRole: (role: string) => role === 'secretary',
    };
    mockDogs.push({ id: 'd1', callName: 'Bella', name: 'Bella', ownerId: 'someone-else' });
    mockEntries.push(makeEntry({ id: 'e1', showId: 'show-1', classId: 'c1', dogId: 'd1' }));
    mockClasses.push({ id: 'c1', className: 'Open Standard' });

    const { result } = renderHook(() => useMyEntries('show-1'));
    expect(result.current.entries).toHaveLength(0);
  });

  it('keeps club_admin My entries scoped to dogs they own', () => {
    mockAuthState = {
      userWithRoles: { databaseUserId: 'ca-1', roles: [{ name: 'club_admin' }] },
      isAdmin: false,
      isSecretary: false,
      loading: false,
      rbacLoading: false,
      hasRole: (role: string) => role === 'club_admin',
    };
    mockDogs.push({ id: 'd1', callName: 'Bella', name: 'Bella', ownerId: 'someone-else' });
    mockEntries.push(makeEntry({ id: 'e1', showId: 'show-1', classId: 'c1', dogId: 'd1' }));
    mockClasses.push({ id: 'c1', className: 'Open Standard' });

    const { result } = renderHook(() => useMyEntries('show-1'));
    expect(result.current.entries).toHaveLength(0);
  });

  it('computes dogsAhead from entries in the same class', () => {
    mockClasses.push({ id: 'c1', className: 'Novice JWW' });
    mockDogs.push({ id: 'd1', callName: 'Bella', name: 'Bella', ownerId: 'person-1' });
    mockEntries.push(
      makeEntry({
        id: 'e1',
        showId: 'show-1',
        classId: 'c1',
        dogId: 'd-other1',
        status: 'completed' as const,
        registrationData: {
          submittedAt: '',
          handler: '',
          entryFee: 0,
          paymentStatus: 'pending' as const,
          runOrder: 1,
        },
      }),
      makeEntry({
        id: 'e2',
        showId: 'show-1',
        classId: 'c1',
        dogId: 'd-other2',
        registrationData: {
          submittedAt: '',
          handler: '',
          entryFee: 0,
          paymentStatus: 'pending' as const,
          runOrder: 3,
        },
      }),
      makeEntry({
        id: 'e3',
        showId: 'show-1',
        classId: 'c1',
        dogId: 'd1',
        registrationData: {
          submittedAt: '',
          handler: '',
          entryFee: 0,
          paymentStatus: 'pending' as const,
          runOrder: 5,
        },
      })
    );

    const { result } = renderHook(() => useMyEntries('show-1'));
    const e3 = result.current.entriesByClass.find(e => e.runOrder === 5);
    expect(e3?.dogsAhead).toBe(1);
  });

  it('marks entry as scored when status is completed', () => {
    mockClasses.push({ id: 'c1', className: 'Novice JWW' });
    mockDogs.push({ id: 'd1', callName: 'Bella', name: 'Bella', ownerId: 'person-1' });
    mockEntries.push(
      makeEntry({
        id: 'e1',
        showId: 'show-1',
        classId: 'c1',
        dogId: 'd1',
        status: 'completed' as const,
      })
    );

    const { result } = renderHook(() => useMyEntries('show-1'));
    expect(result.current.entriesByClass[0].scored).toBe(true);
  });

  it('marks entry as scored when competitionData exists', () => {
    mockClasses.push({ id: 'c1', className: 'Novice JWW' });
    mockDogs.push({ id: 'd1', callName: 'Bella', name: 'Bella', ownerId: 'person-1' });
    mockEntries.push(
      makeEntry({
        id: 'e1',
        showId: 'show-1',
        classId: 'c1',
        dogId: 'd1',
        competitionData: { recordedBy: 'judge-1', recordedAt: new Date().toISOString() },
      })
    );

    const { result } = renderHook(() => useMyEntries('show-1'));
    expect(result.current.entriesByClass[0].scored).toBe(true);
  });

  it('falls back to Unknown Class/Dog when stores have no data', () => {
    mockDogs.push({ id: 'd-missing', name: '', ownerId: 'person-1' });
    mockEntries.push(
      makeEntry({ id: 'e1', showId: 'show-1', classId: 'c-missing', dogId: 'd-missing' })
    );

    const { result } = renderHook(() => useMyEntries('show-1'));
    expect(result.current.entriesByClass[0].className).toBe('Unknown Class');
    expect(result.current.entriesByClass[0].dogName).toBe('Unknown Dog');
  });

  it('reports isError when entry store has an error', () => {
    mockError = 'IndexedDB failed';
    const { result } = renderHook(() => useMyEntries('show-1'));
    expect(result.current.isError).toBe(true);
  });

  it('reports isLoading from entry store', () => {
    mockIsLoading = true;
    const { result } = renderHook(() => useMyEntries('show-1'));
    expect(result.current.isLoading).toBe(true);
  });

  it('returns entries for all dogs owned by the exhibitor', () => {
    mockDogs.push(
      { id: 'd1', callName: 'Bella', name: 'Bella', ownerId: 'person-1' },
      { id: 'd2', callName: 'Max', name: 'Max', ownerId: 'person-1' }
    );
    mockClasses.push(
      { id: 'c1', className: 'Novice JWW' },
      { id: 'c2', className: 'Open Standard' }
    );
    mockEntries.push(
      makeEntry({ id: 'e1', showId: 'show-1', classId: 'c1', dogId: 'd1' }),
      makeEntry({ id: 'e2', showId: 'show-1', classId: 'c2', dogId: 'd2' }),
      makeEntry({ id: 'e3', showId: 'show-1', classId: 'c1', dogId: 'd-other' })
    );

    const { result } = renderHook(() => useMyEntries('show-1'));
    expect(result.current.entries).toHaveLength(2);
    const dogNames = result.current.entriesByClass.map(e => e.dogName).sort();
    expect(dogNames).toEqual(['Bella', 'Max']);
  });

  it('returns empty results when exhibitor databaseUserId is undefined', () => {
    mockAuthState = {
      userWithRoles: { databaseUserId: undefined, roles: [{ name: 'exhibitor' }] },
      isAdmin: false,
      isSecretary: false,
      loading: false,
      rbacLoading: false,
      hasRole: (role: string) => role === 'exhibitor',
    };
    mockDogs.push({ id: 'd1', callName: 'Bella', name: 'Bella', ownerId: 'person-1' });
    mockEntries.push(makeEntry({ id: 'e1', showId: 'show-1', classId: 'c1', dogId: 'd1' }));

    const { result } = renderHook(() => useMyEntries('show-1'));
    expect(result.current.entries).toHaveLength(0);
  });

  it('keeps loading while auth is still resolving the database person id', () => {
    mockAuthState = {
      userWithRoles: { databaseUserId: undefined, roles: [{ name: 'exhibitor' }] },
      isAdmin: false,
      isSecretary: false,
      loading: true,
      rbacLoading: false,
      hasRole: (role: string) => role === 'exhibitor',
    };

    const { result } = renderHook(() => useMyEntries('show-1'));
    expect(result.current.entries).toHaveLength(0);
    expect(result.current.isLoading).toBe(true);
  });
});
