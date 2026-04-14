import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { ScopeType } from '@/types/auth-types';

// --- Mutable mock state ---

const mockShows = [
  { id: 'show-1', name: 'Club A Show', clubId: 'club-a' },
  { id: 'show-2', name: 'Club B Show', clubId: 'club-b' },
  { id: 'show-3', name: 'Club A Trial 2', clubId: 'club-a' },
  { id: 'show-4', name: 'Club C Show', clubId: 'club-c' },
];

let mockIsAdmin = false;
let mockScopes: Array<{ scopeType: ScopeType; scopeId: string }> = [];
let mockShowsOverride: typeof mockShows | null = null;

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    userWithRoles: { scopes: mockScopes },
    isAdmin: mockIsAdmin,
  }),
}));

const mockSelectShow = vi.fn();

vi.mock('@/store/showStore', () => ({
  useShowStore: (selector?: (s: Record<string, unknown>) => unknown) => {
    const state = {
      shows: mockShowsOverride ?? mockShows,
      isLoading: false,
      selectShow: mockSelectShow,
    };
    return selector ? selector(state) : state;
  },
}));

vi.mock('@/store/trialStore', () => ({
  useTrialStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ trials: [], trialClasses: {} }),
}));

vi.mock('../../utils/classStageMapping', () => ({
  mapClassToStage: () => 'pending',
  groupClassesByStage: () => ({}),
}));

vi.mock('@/hooks/useReplicationSync', () => ({
  useReplicationSync: () => ({ status: { tablesStatus: {} } }),
}));

// Import after mocks are set up (vi.mock is hoisted)
import { useMissionControlData } from '../useMissionControlData';

describe('useMissionControlData - show scoping', () => {
  beforeEach(() => {
    mockIsAdmin = false;
    mockScopes = [];
    mockShowsOverride = null;
  });

  it('admin sees all shows', () => {
    mockIsAdmin = true;
    const { result } = renderHook(() => useMissionControlData());
    expect(result.current.shows).toHaveLength(4);
  });

  it('secretary scoped to one club sees only that club shows', () => {
    mockScopes = [{ scopeType: ScopeType.CLUB, scopeId: 'club-a' }];
    const { result } = renderHook(() => useMissionControlData());
    expect(result.current.shows).toHaveLength(2);
    expect(result.current.shows.map((s: { id: string }) => s.id)).toEqual(['show-1', 'show-3']);
  });

  it('secretary scoped to multiple clubs sees all their clubs shows', () => {
    mockScopes = [
      { scopeType: ScopeType.CLUB, scopeId: 'club-a' },
      { scopeType: ScopeType.CLUB, scopeId: 'club-c' },
    ];
    const { result } = renderHook(() => useMissionControlData());
    expect(result.current.shows).toHaveLength(3);
    expect(result.current.shows.map((s: { id: string }) => s.id)).toEqual([
      'show-1',
      'show-3',
      'show-4',
    ]);
  });

  it('non-admin user with no club scopes sees zero shows', () => {
    mockScopes = [];
    const { result } = renderHook(() => useMissionControlData());
    // Security: no club scopes + not admin → empty list, not a cross-club data leak
    expect(result.current.shows).toHaveLength(0);
  });

  it('show-scoped roles are ignored for club filtering', () => {
    mockScopes = [{ scopeType: ScopeType.SHOW, scopeId: 'show-2' }];
    const { result } = renderHook(() => useMissionControlData());
    // No club scopes, no admin — sees zero shows (show-scoped roles don't grant club access)
    expect(result.current.shows).toHaveLength(0);
  });

  it('deduplicates shows', () => {
    mockShowsOverride = [...mockShows, { id: 'show-1', name: 'Duplicate', clubId: 'club-a' }];
    mockIsAdmin = true;
    const { result } = renderHook(() => useMissionControlData());
    expect(result.current.shows).toHaveLength(4);
  });

  it('selects first visible show by default', () => {
    mockScopes = [{ scopeType: ScopeType.CLUB, scopeId: 'club-b' }];
    const { result } = renderHook(() => useMissionControlData());
    expect(result.current.selectedShow?.id).toBe('show-2');
  });

  it('handleShowChange updates selected show', () => {
    mockIsAdmin = true;
    const { result } = renderHook(() => useMissionControlData());
    act(() => {
      result.current.handleShowChange('show-3');
    });
    expect(result.current.selectedShow?.id).toBe('show-3');
  });
});
