import React, { Suspense, lazy, startTransition } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router-dom';
import { useUrlFilters } from '@/hooks/useUrlFilters';

/**
 * MYK9-221 regression suite for the debounce window.
 *
 * These use `createMemoryRouter` + `RouterProvider` (the production shape —
 * `router.tsx` uses `createBrowserRouter`) with a lazily-loaded target route,
 * because the bugs below only exist between "the router's location has moved"
 * and "React has committed that move". react-router 7 wraps navigation state in
 * `React.startTransition`, so that gap is real and a 300ms timer can land in it.
 */

const DEFAULTS = { search: '', club: 'all' };
const probe = { search: '', pathname: '' };
const setter = { set: null as null | ((u: (p: typeof DEFAULTS) => typeof DEFAULTS) => void) };

const Spy: React.FC = () => {
  const loc = useLocation();
  React.useEffect(() => {
    probe.search = loc.search;
    probe.pathname = loc.pathname;
  });
  return null;
};

const FilteredPage: React.FC = () => {
  const [, setFilters] = useUrlFilters(DEFAULTS, { debounceMs: 300 });
  React.useEffect(() => {
    setter.set = setFilters as never;
  }, [setFilters]);
  return <div>dogs</div>;
};

const LazyShows = lazy(
  () =>
    new Promise<{ default: React.FC }>(resolve => {
      setTimeout(() => resolve({ default: () => <div>shows</div> }), 1000);
    })
);

function boot(entry = '/dogs') {
  const router = createMemoryRouter(
    [
      {
        path: '/dogs',
        element: (
          <>
            <Spy />
            <FilteredPage />
          </>
        ),
      },
      {
        path: '/shows',
        element: (
          <>
            <Spy />
            <Suspense fallback={<div>loading</div>}>
              <LazyShows />
            </Suspense>
          </>
        ),
      },
    ],
    { initialEntries: [entry] }
  );
  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  probe.search = '';
  probe.pathname = '';
  setter.set = null;
});
afterEach(() => vi.useRealTimers());

describe('a pending write never follows the user to another route', () => {
  it('CONTROL: with nothing pending, navigation is clean', () => {
    const router = boot();
    act(() => void router.navigate('/shows'));
    act(() => void vi.advanceTimersByTime(2000));
    expect(probe.pathname + probe.search).toBe('/shows');
  });

  it('CONTROL: with no navigation, the debounced write still lands', () => {
    boot();
    act(() => setter.set!(p => ({ ...p, search: 'max' })));
    expect(probe.search).toBe('');
    act(() => void vi.advanceTimersByTime(300));
    expect(probe.search).toBe('?search=max');
  });

  it('drops the write when the navigation commit lands before the timer', () => {
    const router = boot();
    act(() => setter.set!(p => ({ ...p, search: 'max' })));
    act(() => void vi.advanceTimersByTime(50));
    act(() => void router.navigate('/shows'));
    act(() => void vi.advanceTimersByTime(2000));
    expect(probe.pathname + probe.search).toBe('/shows');
  });

  it('drops the write when the timer fires BEFORE React commits the navigation', () => {
    // The dangerous ordering: the router's location has already moved, so a
    // relative `setSearchParams` would resolve against /shows, but no render or
    // effect has run to tell the still-mounted page about it.
    const router = boot();
    act(() => setter.set!(p => ({ ...p, search: 'max' })));
    act(() => void vi.advanceTimersByTime(50));
    act(() => {
      void router.navigate('/shows');
      vi.advanceTimersByTime(300);
    });
    act(() => void vi.advanceTimersByTime(2000));
    expect(probe.pathname + probe.search).toBe('/shows');
  });

  it('drops the write when the navigation is wrapped in startTransition', () => {
    const router = boot();
    act(() => setter.set!(p => ({ ...p, search: 'max' })));
    act(() => void vi.advanceTimersByTime(50));
    act(() => {
      startTransition(() => {
        void router.navigate('/shows');
      });
      vi.advanceTimersByTime(300);
    });
    act(() => void vi.advanceTimersByTime(2000));
    expect(probe.pathname + probe.search).toBe('/shows');
  });
});

describe('a pending write never clobbers a filter changed underneath it', () => {
  it('keeps a ?club= set by a deep link while a search write was in flight', () => {
    const router = boot();
    act(() => setter.set!(p => ({ ...p, search: 'retriev' })));
    act(() => void vi.advanceTimersByTime(100));
    // The sidebar's "Club shows" deep link (unifiedSidebarConfig.ts) lands on
    // the SAME route, so the pathname guard deliberately does not apply here.
    act(() => void router.navigate('/dogs?club=club-1'));
    act(() => void vi.advanceTimersByTime(300));

    const params = new URLSearchParams(probe.search);
    expect(params.get('search')).toBe('retriev');
    expect(params.get('club')).toBe('club-1');
  });

  it('keeps a ?club= set by a deep link when an immediate write flushes the draft', () => {
    const router = boot();
    act(() => setter.set!(p => ({ ...p, search: 'retriev' })));
    act(() => void router.navigate('/dogs?club=club-1'));
    // A non-debounced key commits at once, carrying the pending search with it.
    act(() => setter.set!(p => ({ ...p, club: 'club-2' })));

    const params = new URLSearchParams(probe.search);
    expect(params.get('search')).toBe('retriev');
    expect(params.get('club')).toBe('club-2');
  });
});
