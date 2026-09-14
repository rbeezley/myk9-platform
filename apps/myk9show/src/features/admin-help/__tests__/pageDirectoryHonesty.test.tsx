/**
 * MYK9-476. Does the Page Directory tell the truth about what each route renders?
 *
 * The original defect was that `pageDirectory.ts` described two retired
 * redirects as working critical-path show-day features. The only invariant
 * guarding the file checked that each path EXISTS in the route registry, which
 * was true for every mislabelled row.
 *
 * The first attempt at a guard classified routes by walking the static React
 * element tree and matching on component identity. That is the same trap one
 * level up: `/results/dashboard` renders `<ProtectedRoute><ResultsDashboardRedirect/></ProtectedRoute>`,
 * whose whole body is `return <Navigate to="/shows" replace />`, and a
 * hand-maintained list of "components that are really redirects" passes it
 * silently the moment someone adds a new one. So the classification here is
 * BEHAVIOURAL: every static route is actually rendered at its own path with a
 * location probe, and a route that moves the location on its own is a redirect
 * no matter how many components it is wrapped in.
 *
 * Only static paths are swept. A `:param` route cannot be rendered at a
 * meaningful location without inventing data, and inventing data would decide
 * the verdict rather than measure it — `/classes/:classId` redirects only when
 * it resolves a class and otherwise renders a loading skeleton or a not-found
 * state, so it is a page by any honest reading.
 */
import type { ReactNode } from 'react';
import { Component, Suspense, lazy, useLayoutEffect } from 'react';
import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest';
import { act, render, cleanup, screen } from '@testing-library/react';
import { MemoryRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// The route guards are the whole reason a redirect hides: they sit between the
// <Route> element and the component that actually calls <Navigate>. Made
// transparent so the sweep measures the destination, not the guard.
vi.mock('@/context/AuthContext', async importOriginal => {
  const actual = await importOriginal<typeof import('@/context/AuthContext')>();
  const passThrough = ({ children }: { children?: ReactNode }) => children ?? null;
  return { ...actual, ProtectedRoute: passThrough, ClubAdminRoute: passThrough };
});

const { ProtectedRoute } = await import('@/context/AuthContext');
const { SuspenseWrapper } = await import('@/routes/utils/SuspenseWrapper');
const { pageDirectory } = await import('../data/pageDirectory');
const { router } = await import('@/router');

type RouteSurfaceKind = 'page' | 'redirect' | 'placeholder' | 'unknown';

/** Per-route settle budget. Generous on purpose; routes normally settle in ms. */
const SETTLE_BUDGET_MS = 10000;

function joinRoutePaths(parentPath: string, childPath: string): string {
  if (childPath.startsWith('/')) return childPath;
  return `${parentPath}/${childPath}`.replace(/\/+/g, '/');
}

function collectElements(
  routes: typeof router.routes,
  parentPath = '',
  out = new Map<string, ReactNode>()
): Map<string, ReactNode> {
  for (const route of routes) {
    const path = route.path ? joinRoutePaths(parentPath, route.path) : parentPath;
    if (route.path && route.element) out.set(path, route.element as ReactNode);
    collectElements(route.children ?? [], path, out);
  }
  return out;
}

const elementsByPath = collectElements(router.routes);

/** A page that throws is still not a redirect, so failures must not abort the sweep. */
class Boundary extends Component<{ children: ReactNode }, { threw: boolean }> {
  override state = { threw: false };
  static getDerivedStateFromError() {
    return { threw: true };
  }
  override render() {
    return this.state.threw ? <div data-testid="threw" /> : this.props.children;
  }
}

function LocationProbe({ onLocation }: { onLocation: (pathname: string) => void }) {
  const { pathname } = useLocation();
  useLayoutEffect(() => {
    onLocation(pathname);
  }, [pathname, onLocation]);
  return null;
}

/**
 * Flushes until the DOM and the location both stop changing. Deliberately not
 * keyed on a Suspense fallback marker: several route elements carry their own
 * `SuspenseWrapper` inside, so an outer fallback never appears for them and
 * settling on it would read "resolved" the instant the render committed —
 * classifying every lazy route as a page without ever loading it.
 */
async function settle(readPathname: () => string): Promise<void> {
  // A deadline, not an iteration count. A lazy chunk that resolves in 5ms on an
  // idle machine can take two orders of magnitude longer under a loaded
  // shuffled run, and a loop that gives up after N flushes reports that as a
  // finding about the app instead of about the harness.
  const deadline = performance.now() + SETTLE_BUDGET_MS;
  let previous = '';
  let stable = 0;
  while (performance.now() < deadline) {
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 5));
    });
    // A route element with no SuspenseWrapper of its own hits the outer
    // fallback, and an unresolved lazy import holds the DOM perfectly stable
    // there. "Nothing changed" is not "finished" while that marker is up.
    if (document.querySelector('[data-testid="route-pending"]')) {
      previous = '';
      stable = 0;
      continue;
    }
    const snapshot = `${readPathname()}|${document.body.innerHTML}`;
    stable = snapshot === previous ? stable + 1 : 0;
    previous = snapshot;
    if (stable >= 2) return;
  }
}

async function classifyElement(path: string, element: ReactNode): Promise<RouteSurfaceKind> {
  let pathname = path;
  const record = (next: string) => {
    pathname = next;
  };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <LocationProbe onLocation={record} />
        <Boundary>
          <Suspense fallback={<div data-testid="route-pending" />}>
            <Routes>
              <Route path={path} element={element} />
              <Route path="*" element={<div data-testid="landed-elsewhere" />} />
            </Routes>
          </Suspense>
        </Boundary>
      </MemoryRouter>
    </QueryClientProvider>
  );

  await settle(() => pathname);

  const stillPending = screen.queryByTestId('route-pending') !== null;
  const kind: RouteSurfaceKind = stillPending
    ? 'unknown'
    : pathname !== path
      ? 'redirect'
      : screen.queryByTestId('coming-soon-page')
        ? 'placeholder'
        : 'page';

  cleanup();
  queryClient.clear();
  return kind;
}

async function classifyRoute(path: string): Promise<RouteSurfaceKind> {
  const element = elementsByPath.get(path);
  if (element === undefined) return 'unknown';
  return classifyElement(path, element);
}

const STATIC_PATHS = pageDirectory.map(e => e.path).filter(p => !p.includes(':'));

describe('pageDirectory (behavioural honesty sweep)', () => {
  const kinds = new Map<string, RouteSurfaceKind>();
  let sweepMs = 0;
  // Pages render against the globally mocked Supabase client; the noise is the
  // mock's, not a finding.
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeAll(async () => {
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const started = performance.now();
    for (const path of STATIC_PATHS) {
      kinds.set(path, await classifyRoute(path));
    }
    sweepMs = performance.now() - started;
  }, 120000);

  afterAll(() => {
    consoleError.mockRestore();
    // process.stdout, not console: vitest intercepts console output from
    // afterAll and the number is the point of measuring it.
    process.stdout.write(
      `[pageDirectory honesty] classified ${STATIC_PATHS.length} static routes in ${Math.round(sweepMs)}ms\n`
    );
  });

  // Positive control. Without it, a sweep that returned 'page' for everything —
  // a broken mock, a guard that never becomes transparent, a settle window too
  // short for lazy imports — would make every assertion below pass while
  // measuring nothing.
  /**
   * Known-answer check on the harness itself, run through the very same
   * machinery as the real sweep. A redirect that only appears AFTER a lazy
   * import resolves, behind the app's real guard and Suspense wrappers, is the
   * case a harness silently gets wrong: settle too early and it reads as a
   * page. If this goes red, every 'page' verdict below is worthless.
   */
  it('the harness sees a redirect that only exists after a lazy import resolves', async () => {
    const LazyRedirect = lazy(async () => ({
      default: () => <Navigate to="/shows" replace />,
    }));
    const LazyPage = lazy(async () => ({
      default: () => <div>a real page</div>,
    }));

    await expect(
      classifyElement(
        '/harness-control-redirect',
        <ProtectedRoute>
          <SuspenseWrapper>
            <LazyRedirect />
          </SuspenseWrapper>
        </ProtectedRoute>
      )
    ).resolves.toBe('redirect');

    // The contrast case: same wrappers, same laziness, no redirect.
    await expect(
      classifyElement(
        '/harness-control-page',
        <ProtectedRoute>
          <SuspenseWrapper>
            <LazyPage />
          </SuspenseWrapper>
        </ProtectedRoute>
      )
    ).resolves.toBe('page');
  }, 30000);

  it('the sweep actually recognises a redirect, a placeholder and a real page', () => {
    // A bare <Route element={<Navigate to="/shows" replace />} />.
    expect(kinds.get('/browse-shows')).toBe('redirect');
    // A redirect hidden two components deep: <ProtectedRoute><ResultsDashboardRedirect/></ProtectedRoute>.
    // This is the case the previous static classifier could not see.
    expect(kinds.get('/results/dashboard')).toBe('redirect');
    // featurePage(features.analytics === false, ...) → <ComingSoonPage />.
    expect(kinds.get('/exhibitor/analytics')).toBe('placeholder');
    // Real pages, for contrast.
    expect(kinds.get('/exhibitor/entries')).toBe('page');
    expect(kinds.get('/dogs')).toBe('page');
  });

  it('every static directory path resolves to a route in the application route tree', () => {
    expect(STATIC_PATHS.filter(p => kinds.get(p) === 'unknown')).toEqual([]);
  });

  it("no entry claims status 'working' while its route renders only a redirect or a placeholder", () => {
    const lying = pageDirectory
      .filter(e => e.status === 'working' && kinds.has(e.path))
      .map(e => ({ path: e.path, renders: kinds.get(e.path) }))
      .filter(r => r.renders === 'redirect' || r.renders === 'placeholder');
    expect(lying).toEqual([]);
  });

  it("every entry whose route renders only a redirect or a placeholder is marked 'stub'", () => {
    const mismarked = pageDirectory
      .filter(e => kinds.has(e.path))
      .map(e => ({ path: e.path, status: e.status, renders: kinds.get(e.path) }))
      .filter(
        r => (r.renders === 'redirect' || r.renders === 'placeholder') && r.status !== 'stub'
      );
    expect(mismarked).toEqual([]);
  });

  it('MyEntriesPage is reachable from exactly one canonical route', () => {
    // /my-entries redirects; only /exhibitor/entries renders the page. That the
    // redirect also carries the query string and hash is pinned in
    // routes/MyEntriesRedirect.test.tsx.
    expect(kinds.get('/my-entries')).toBe('redirect');
    expect(kinds.get('/exhibitor/entries')).toBe('page');
  });
});
