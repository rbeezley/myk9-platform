import { render, renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useTrackSectionView, TRACKED_SECTIONS } from '../useTrackSectionView';
import type { TrackedSection } from '../useTrackSectionView';
import { mockSupabase } from '@/test/mocks/supabase';

// Mock useAuth — default: authenticated user
const mockUser = { id: 'user-123' };
vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(() => ({ user: mockUser })),
}));

// Mock LoggingService
vi.mock('@/services/LoggingService', () => ({
  logger: { debug: vi.fn() },
}));

// IntersectionObserver mock
type ObserverCallback = (entries: Partial<IntersectionObserverEntry>[]) => void;
let observerCallback: ObserverCallback;
let observerDisconnect: ReturnType<typeof vi.fn>;
let observerObserve: ReturnType<typeof vi.fn>;

// Track insert calls
let insertSpy: ReturnType<typeof vi.fn>;

/** Test component that attaches the ref to a real DOM element */
function TrackedSection({ section, page }: { section: TrackedSection; page: string }) {
  const ref = useTrackSectionView(section, page);
  return <div ref={ref} data-testid="tracked-section" />;
}

beforeEach(() => {
  observerDisconnect = vi.fn();
  observerObserve = vi.fn();
  global.IntersectionObserver = class MockObserver {
    constructor(callback: ObserverCallback) {
      observerCallback = callback;
    }
    observe = observerObserve;
    unobserve = vi.fn();
    disconnect = observerDisconnect;
    root = null;
    rootMargin = '';
    thresholds = [];
    takeRecords = vi.fn().mockReturnValue([]);
  } as unknown as typeof IntersectionObserver;

  insertSpy = vi.fn(() => Promise.resolve({ error: null }));
  mockSupabase.from.mockReturnValue({ insert: insertSpy });
});

afterEach(async () => {
  mockSupabase.from.mockReset();
  const { useAuth } = await import('@/hooks/useAuth');
  vi.mocked(useAuth).mockReturnValue({ user: mockUser } as ReturnType<typeof useAuth>);
});

describe('useTrackSectionView', () => {
  it('inserts an event on first intersection', () => {
    render(<TrackedSection section={TRACKED_SECTIONS.QUALIFICATION_TREND} page="analytics" />);

    act(() => {
      observerCallback([{ isIntersecting: true, intersectionRatio: 0.5 }]);
    });

    expect(mockSupabase.from).toHaveBeenCalledWith('analytics_events');
    expect(insertSpy).toHaveBeenCalledWith({
      user_id: 'user-123',
      event_type: 'section_view',
      section_name: 'qualification_trend_chart',
      page: 'analytics',
      metadata: null,
    });
  });

  it('deduplicates — second intersection does not insert', () => {
    render(<TrackedSection section={TRACKED_SECTIONS.QUALIFICATION_TREND} page="analytics" />);

    act(() => {
      observerCallback([{ isIntersecting: true, intersectionRatio: 0.5 }]);
    });
    act(() => {
      observerCallback([{ isIntersecting: true, intersectionRatio: 0.5 }]);
    });

    expect(insertSpy).toHaveBeenCalledTimes(1);
  });

  it('does not insert when not intersecting', () => {
    render(<TrackedSection section={TRACKED_SECTIONS.DOG_BREAKDOWN} page="analytics" />);

    act(() => {
      observerCallback([{ isIntersecting: false, intersectionRatio: 0 }]);
    });

    expect(insertSpy).not.toHaveBeenCalled();
  });

  it('does not fire when ref is never attached to a DOM element', () => {
    renderHook(() => useTrackSectionView(TRACKED_SECTIONS.QUALIFICATION_TREND, 'analytics'));

    expect(observerObserve).not.toHaveBeenCalled();
    expect(insertSpy).not.toHaveBeenCalled();
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

    render(<TrackedSection section={TRACKED_SECTIONS.FASTEST_TIMES} page="analytics" />);

    expect(observerObserve).not.toHaveBeenCalled();
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it('disconnects observer on unmount', () => {
    const { unmount } = render(
      <TrackedSection section={TRACKED_SECTIONS.LIFETIME_PAGE} page="analytics" />
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
