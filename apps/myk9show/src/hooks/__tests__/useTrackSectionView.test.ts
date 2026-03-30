import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  useTrackSectionView,
  TRACKED_SECTIONS,
  _resetTrackedSections,
} from '../useTrackSectionView';

// Mock supabase
const mockInsert = vi.fn(() => Promise.resolve({ error: null }));
const mockFrom = vi.fn(() => ({ insert: mockInsert }));
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { from: mockFrom },
}));

// Mock useAuth — default: authenticated user
const mockUser = { id: 'user-123' };
vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(() => ({ user: mockUser })),
}));

// Mock react-router useLocation
let mockPathname = '/analytics';
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useLocation: vi.fn(() => ({ pathname: mockPathname })),
  };
});

// IntersectionObserver mock
type ObserverCallback = (entries: Partial<IntersectionObserverEntry>[]) => void;
let observerCallback: ObserverCallback;
let observerDisconnect: ReturnType<typeof vi.fn>;

beforeEach(() => {
  observerDisconnect = vi.fn();
  vi.stubGlobal(
    'IntersectionObserver',
    vi.fn((callback: ObserverCallback) => {
      observerCallback = callback;
      return {
        observe: vi.fn(),
        unobserve: vi.fn(),
        disconnect: observerDisconnect,
      };
    })
  );
  mockFrom.mockClear();
  mockInsert.mockClear();
  _resetTrackedSections();
  mockPathname = '/analytics';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useTrackSectionView', () => {
  it('inserts an event on first intersection', () => {
    const { result } = renderHook(() =>
      useTrackSectionView(TRACKED_SECTIONS.QUALIFICATION_TREND, 'analytics')
    );

    act(() => {
      observerCallback([{ isIntersecting: true, intersectionRatio: 0.5 }]);
    });

    expect(mockFrom).toHaveBeenCalledWith('analytics_events');
    expect(mockInsert).toHaveBeenCalledWith({
      user_id: 'user-123',
      event_type: 'section_view',
      section_name: 'qualification_trend_chart',
      page: 'analytics',
      metadata: null,
    });
    expect(result.current.current).toBeNull();
  });

  it('deduplicates — second intersection does not insert', () => {
    renderHook(() => useTrackSectionView(TRACKED_SECTIONS.QUALIFICATION_TREND, 'analytics'));

    act(() => {
      observerCallback([{ isIntersecting: true, intersectionRatio: 0.5 }]);
    });
    act(() => {
      observerCallback([{ isIntersecting: true, intersectionRatio: 0.5 }]);
    });

    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it('does not insert when not intersecting', () => {
    renderHook(() => useTrackSectionView(TRACKED_SECTIONS.DOG_BREAKDOWN, 'analytics'));

    act(() => {
      observerCallback([{ isIntersecting: false, intersectionRatio: 0 }]);
    });

    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('does not fire when ref is never attached to a DOM element', () => {
    renderHook(() => useTrackSectionView(TRACKED_SECTIONS.QUALIFICATION_TREND, 'analytics'));

    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('no-ops for unauthenticated users', async () => {
    const { useAuth } = await import('@/hooks/useAuth');
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      loading: false,
      signIn: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
      resetPassword: vi.fn(),
      updatePassword: vi.fn(),
      updateProfile: vi.fn(),
    } as ReturnType<typeof useAuth>);

    renderHook(() => useTrackSectionView(TRACKED_SECTIONS.FASTEST_TIMES, 'analytics'));

    act(() => {
      observerCallback([{ isIntersecting: true, intersectionRatio: 0.5 }]);
    });

    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('resets tracking set when pathname changes', () => {
    const { rerender } = renderHook(() =>
      useTrackSectionView(TRACKED_SECTIONS.QUALIFICATION_TREND, 'analytics')
    );

    act(() => {
      observerCallback([{ isIntersecting: true, intersectionRatio: 0.5 }]);
    });
    expect(mockInsert).toHaveBeenCalledTimes(1);

    mockPathname = '/dogs';
    rerender();
    mockPathname = '/analytics';
    rerender();

    act(() => {
      observerCallback([{ isIntersecting: true, intersectionRatio: 0.5 }]);
    });
    expect(mockInsert).toHaveBeenCalledTimes(2);
  });

  it('disconnects observer on unmount', () => {
    const { unmount } = renderHook(() =>
      useTrackSectionView(TRACKED_SECTIONS.LIFETIME_PAGE, 'analytics')
    );

    unmount();

    expect(observerDisconnect).toHaveBeenCalled();
  });

  it('exports all tracked section constants', () => {
    expect(TRACKED_SECTIONS).toEqual({
      QUALIFICATION_TREND: 'qualification_trend_chart',
      DOG_BREAKDOWN: 'dog_breakdown_cards',
      FASTEST_TIMES: 'fastest_times_table',
      LIFETIME_PAGE: 'lifetime_analytics_page',
    });
  });
});
