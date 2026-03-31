import { render, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useTrackSectionView, TRACKED_SECTIONS } from '../useTrackSectionView';
import type { TrackedSection } from '../useTrackSectionView';
import { mockSupabase } from '@/test/mocks/supabase';

// Mock useAuthContext — default: authenticated user
const mockUser = { id: 'user-123' };
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: vi.fn(() => ({ user: mockUser })),
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

/** Test component that attaches the callback ref to a real DOM element */
function TrackedSection({ section, page }: { section: TrackedSection; page: string }) {
  const callbackRef = useTrackSectionView(section, page);
  return <div ref={callbackRef} data-testid="tracked-section" />;
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
  const { useAuthContext } = await import('@/hooks/useAuthContext');
  vi.mocked(useAuthContext).mockReturnValue({ user: mockUser } as ReturnType<
    typeof useAuthContext
  >);
});

describe('useTrackSectionView', () => {
  it('inserts an event on first intersection', () => {
    render(<TrackedSection section={TRACKED_SECTIONS.QUALIFICATION_TREND} page="analytics" />);

    act(() => {
      observerCallback([{ isIntersecting: true, intersectionRatio: 0.5 }]);
    });

    expect(mockSupabase.from).toHaveBeenCalledWith('analytics_events');
    expect(insertSpy).toHaveBeenCalledWith({
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

  it('no-ops for unauthenticated users', async () => {
    const { useAuthContext } = await import('@/hooks/useAuthContext');
    vi.mocked(useAuthContext).mockReturnValue({
      user: null,
    } as ReturnType<typeof useAuthContext>);

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
