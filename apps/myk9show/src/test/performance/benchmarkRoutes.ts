/** Read-only routes included in the MYK9-843 lab baseline. */
export type BenchmarkRole = 'public' | 'exhibitor' | 'secretary' | 'judge' | 'admin';

export interface BenchmarkRoute {
  id: string;
  role: BenchmarkRole;
  path: string;
  readySelector: string;
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
      readySelector: '[data-testid="show-card"], [data-testid="show-card-vertical"]',
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
      readySelector: 'h1:has-text("My Shows")',
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
      readySelector: 'h1:has-text("Your Cart"), h1:has-text("Your cart is empty")',
    },
    {
      id: 'secretary-overview',
      role: 'secretary',
      path: '/secretary/dashboard',
      readySelector: 'p:text-matches("^Managing [1-9][0-9]* shows?$")',
    },
    {
      id: 'secretary-setup',
      role: 'secretary',
      path: `/shows/${showId}/setup`,
      readySelector: '[role="group"][aria-label="Setup section"]',
    },
    {
      id: 'secretary-entries',
      role: 'secretary',
      path: `/shows/${showId}/entries`,
      readySelector: '[data-testid="registration-totals"]',
    },
    {
      id: 'secretary-show-day',
      role: 'secretary',
      path: `/shows/${showId}/show-day`,
      readySelector: 'section[aria-label="Show Desk"] h2',
    },
    {
      id: 'secretary-results',
      role: 'secretary',
      path: `/shows/${showId}/results`,
      readySelector: '[data-testid="results-readiness-verdict"]',
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
