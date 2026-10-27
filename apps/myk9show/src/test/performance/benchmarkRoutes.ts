/** Read-only routes included in the MYK9-843 lab baseline. */
export type BenchmarkRole = 'public' | 'exhibitor' | 'secretary' | 'judge' | 'admin';

export interface BenchmarkRoute {
  id: string;
  role: BenchmarkRole;
  path: string;
  readySelector: string;
  unavailableSelectors?: readonly string[];
}

const defaultShowId = 'dededede-0000-0000-0000-000000000010';
const defaultClassId = 'dec1a55e-0000-0000-0000-000000000032';
export function benchmarkRoutesFor(
  showId = process.env.MYK9_PERF_SHOW_ID ?? defaultShowId,
  classId = process.env.MYK9_PERF_CLASS_ID ?? defaultClassId
): readonly BenchmarkRoute[] {
  return [
    { id: 'public-home', role: 'public', path: '/', readySelector: '.landing-v2 h1' },
    {
      id: 'public-shows',
      role: 'public',
      path: '/shows',
      // The public list hides demo-club shows, so the seeded benchmark show never
      // appears here; the result count is the settled state when no real show exists.
      readySelector:
        '[data-testid="show-card"], [data-testid="show-card-vertical"], :text-matches("^Showing (all )?[0-9]+ shows?")',
    },
    {
      id: 'public-show-detail',
      role: 'public',
      path: `/shows/${showId}`,
      readySelector: 'h1:not(.sr-only):not([role="alert"] h1):not(:has-text("not found"))',
    },
    {
      id: 'exhibitor-entries',
      role: 'exhibitor',
      path: '/exhibitor/entries',
      readySelector:
        '[data-testid="entry-filter-strip"], h2:has-text("Welcome!"), h2:has-text("Your dogs are ready"), h2:has-text("Find your next show")',
    },
    {
      id: 'exhibitor-registration',
      role: 'exhibitor',
      path: `/shows/${showId}/register`,
      readySelector:
        'input[aria-label="Search dogs by call name"], :text("You don\'t have any dogs yet"), :text("No eligible dogs found")',
    },
    {
      id: 'exhibitor-cart',
      role: 'exhibitor',
      path: '/cart',
      readySelector: 'h1:has-text("Your Entry"), h1:has-text("Nothing in your entry yet")',
    },
    {
      id: 'secretary-overview',
      role: 'secretary',
      path: '/secretary/dashboard',
      readySelector: 'p:text-matches("^Managing [1-9][0-9]* shows?$")',
    },
    {
      id: 'secretary-entries',
      role: 'secretary',
      path: `/shows/${showId}/entries`,
      readySelector: '[data-testid="registration-totals"]',
    },
    {
      // Setup and Show Day both redirect into the show home (MYK9-957); this is the
      // one cockpit page they land on.
      id: 'secretary-show-home',
      role: 'secretary',
      path: `/shows/${showId}`,
      readySelector: '[data-testid="secretary-cockpit"]',
      unavailableSelectors: [
        ':text("Entry counts are loading.")',
        ':text("Couldn\'t load entry counts.")',
      ],
    },
    {
      id: 'secretary-results',
      role: 'secretary',
      path: `/shows/${showId}/results`,
      // The Results tab (features/results-tab) replaced the Results Control page here.
      readySelector:
        'ul[aria-label="Classes"] li, :text("This show has no classes yet"), :text("No classes match these filters"), :text("Nothing needs you right now")',
    },
    {
      id: 'secretary-reports',
      role: 'secretary',
      path: `/shows/${showId}/reports`,
      readySelector:
        '[aria-label="Report preview scroll area"], [role="status"]:has-text("No entries found for this selection")',
    },
    {
      id: 'judge-dashboard',
      role: 'judge',
      path: '/judge/dashboard',
      readySelector: '[role="tablist"]',
    },
    {
      id: 'ringside-class-picker',
      role: 'judge',
      path: `/at-show/${showId}`,
      readySelector: '#your-ring-heading, [data-testid^="at-show-trial-"]',
    },
    {
      id: 'ringside-scoring',
      role: 'judge',
      path: `/at-show/${showId}/class/${classId}`,
      readySelector: '[data-loaded="true"]',
    },
    {
      id: 'admin-users',
      role: 'admin',
      path: '/admin/users',
      readySelector: 'table tbody tr:not(:has(.animate-pulse)), :text("No users yet")',
    },
    {
      id: 'admin-health',
      role: 'admin',
      path: '/admin/health',
      readySelector: '[data-testid="health-verdict-headline"]',
    },
  ];
}

export const BENCHMARK_ROUTES = benchmarkRoutesFor();

export function resolveBenchmarkRoutePath(path: string, origin: string): string {
  const resolved = new URL(path, origin);
  if (resolved.origin !== new URL(origin).origin) {
    throw new Error(`Benchmark route must stay on the configured origin: ${path}`);
  }
  return resolved.href;
}

/**
 * Route ids earlier reports' reproduce commands select. Setup and Show Day were
 * folded into the show home (MYK9-957), so both now mean `secretary-show-home`.
 */
export const RETIRED_ROUTE_IDS: Readonly<Record<string, string>> = {
  'secretary-setup': 'secretary-show-home',
  'secretary-show-day': 'secretary-show-home',
};

/** Translate retired ids, drop duplicates, and fail loudly on an id no route has. */
export function resolveRequestedRouteIds(
  requested: readonly string[],
  routes: readonly BenchmarkRoute[]
): string[] {
  const known = new Set(routes.map(route => route.id));
  const resolved = requested.map(id => RETIRED_ROUTE_IDS[id] ?? id);
  const unknown = resolved.filter(id => !known.has(id));
  if (unknown.length) throw new Error(`Unknown benchmark route id(s): ${unknown.join(', ')}`);
  return [...new Set(resolved)];
}
