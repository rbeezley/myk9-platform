import { describe, expect, it } from 'vitest';
import {
  EXPECTED_ACCOUNT_REPOS,
  collectAccountJobCounts,
  evaluateHeadroom,
  type HeadroomInputs,
} from './loadRunnerHeadroom';

const CEILING = 20;
const REQUIRED = 17;
const CURRENT = 'rbeezley/myk9-platform';
const SIBLING = 'rbeezley/myK9Qv3';

/** Every expected repo present, so scope checks pass and the arithmetic is under test. */
function fullInventory(extra: readonly string[] = []): string[] {
  return [...EXPECTED_ACCOUNT_REPOS, ...extra];
}

function headroom(overrides: Partial<HeadroomInputs> = {}) {
  return evaluateHeadroom({
    ceiling: CEILING,
    required: REQUIRED,
    currentRepo: CURRENT,
    repos: [{ fullName: CURRENT, activeJobs: 0 }],
    inventory: fullInventory(),
    unreadableRepos: [],
    ...overrides,
  });
}

function verdictReason(verdict: ReturnType<typeof evaluateHeadroom>): string {
  return verdict.ok ? '' : verdict.reason;
}

describe('evaluateHeadroom', () => {
  it('counts jobs in a sibling repository against the account ceiling', () => {
    // The regression NCR-2026-08-27-01 names: the rehearsal repo is idle, so a
    // per-repo gate sees 20 free and dispatches. Account-wide, only 16 are.
    const verdict = headroom({
      repos: [
        { fullName: CURRENT, activeJobs: 0 },
        { fullName: SIBLING, activeJobs: 4 },
      ],
    });

    expect(verdict.ok).toBe(false);
    expect(verdictReason(verdict)).toContain(`${SIBLING}=4`);
    expect(verdictReason(verdict)).toContain('leaving 16 free but 17 required');
  });

  it('admits the rehearsal when the whole account has room', () => {
    const verdict = headroom({
      repos: [
        { fullName: CURRENT, activeJobs: 1 },
        { fullName: SIBLING, activeJobs: 2 },
      ],
    });

    expect(verdict).toEqual({ ok: true, busy: 3, free: 17 });
  });

  it('admits exactly at the boundary', () => {
    expect(headroom({ repos: [{ fullName: CURRENT, activeJobs: 3 }] })).toEqual({
      ok: true,
      busy: 3,
      free: 17,
    });
  });

  it('refuses one job past the boundary', () => {
    expect(headroom({ repos: [{ fullName: CURRENT, activeJobs: 4 }] }).ok).toBe(false);
  });

  it('refuses when any repository could not be read, even with apparent room', () => {
    const verdict = headroom({ unreadableRepos: [`${SIBLING} (HTTP 404)`] });

    expect(verdict.ok).toBe(false);
    expect(verdictReason(verdict)).toContain('could not be verified');
    expect(verdictReason(verdict)).toContain(SIBLING);
  });

  it('refuses an inventory that omits the rehearsal repository', () => {
    const verdict = headroom({ inventory: [SIBLING] });

    expect(verdict.ok).toBe(false);
    expect(verdictReason(verdict)).toContain('not an account-wide view');
  });

  it('refuses an empty inventory rather than reading it as an idle account', () => {
    const verdict = headroom({ inventory: [] });

    expect(verdict.ok).toBe(false);
    expect(verdictReason(verdict)).toContain('inventory was empty');
  });

  // The finding this section exists for: a token scoped to ONLY the rehearsal's
  // own repository passes every structural check and still undercounts.
  it('refuses a token scoped to only the rehearsal repository', () => {
    const verdict = headroom({ inventory: [CURRENT] });

    expect(verdict.ok).toBe(false);
    expect(verdictReason(verdict)).toContain(SIBLING);
    expect(verdictReason(verdict)).toContain('did not enumerate');
  });

  it('refuses a narrowly-scoped token even when every visible repo is idle', () => {
    // Idle + readable + contains our own repo — the shape that would otherwise
    // sail through with 20 free slots while the sibling is running CI.
    const verdict = headroom({
      repos: [{ fullName: CURRENT, activeJobs: 0 }],
      inventory: [CURRENT],
    });

    expect(verdict.ok).toBe(false);
  });

  it('names every expected repository the token failed to enumerate', () => {
    const verdict = headroom({ inventory: [CURRENT, SIBLING] });

    expect(verdict.ok).toBe(false);
    expect(verdictReason(verdict)).toContain('rbeezley/AKC-Scent-Work-Rules');
    expect(verdictReason(verdict)).toContain('rbeezley/myk9show-launch-video');
  });

  it('accepts repositories beyond the expected floor', () => {
    // The pinned set is a floor, not a ceiling: a repo created later is counted
    // without anyone having to update the list first.
    const verdict = headroom({
      repos: [
        { fullName: CURRENT, activeJobs: 1 },
        { fullName: 'rbeezley/brand-new', activeJobs: 2 },
      ],
      inventory: fullInventory(['rbeezley/brand-new']),
    });

    expect(verdict).toEqual({ ok: true, busy: 3, free: 17 });
  });
});

interface StubRoute {
  readonly [path: string]: unknown;
}

function readerFor(routes: StubRoute, failing: readonly string[] = []) {
  return async (path: string) => {
    if (failing.some(prefix => path.startsWith(prefix))) {
      throw new Error('HTTP 404');
    }
    if (!(path in routes)) {
      throw new Error(`unstubbed path: ${path}`);
    }
    return routes[path];
  };
}

const inventoryPage = (page: number) => `user/repos?per_page=100&page=${page}&affiliation=owner`;
const runsPage = (repo: string, status: string, page: number) =>
  `repos/${repo}/actions/runs?status=${status}&per_page=100&page=${page}`;
const jobsPage = (repo: string, runId: number, page: number) =>
  `repos/${repo}/actions/runs/${runId}/jobs?per_page=100&page=${page}`;

/** No active runs anywhere, so a repo contributes zero without extra stubbing. */
function idleRepoRoutes(repo: string): StubRoute {
  return {
    [runsPage(repo, 'in_progress', 1)]: { workflow_runs: [] },
    [runsPage(repo, 'queued', 1)]: { workflow_runs: [] },
  };
}

describe('collectAccountJobCounts', () => {
  it('sums active jobs across every repository on the account', async () => {
    const routes: StubRoute = {
      [inventoryPage(1)]: [
        { full_name: CURRENT, archived: false },
        { full_name: SIBLING, archived: false },
      ],
      [runsPage(CURRENT, 'in_progress', 1)]: { workflow_runs: [{ id: 1 }, { id: 999 }] },
      [runsPage(CURRENT, 'queued', 1)]: { workflow_runs: [] },
      [jobsPage(CURRENT, 1, 1)]: { jobs: [{ status: 'in_progress' }, { status: 'completed' }] },
      [runsPage(SIBLING, 'in_progress', 1)]: { workflow_runs: [{ id: 7 }] },
      [runsPage(SIBLING, 'queued', 1)]: { workflow_runs: [{ id: 8 }] },
      [jobsPage(SIBLING, 7, 1)]: { jobs: [{ status: 'in_progress' }, { status: 'in_progress' }] },
      [jobsPage(SIBLING, 8, 1)]: { jobs: [{ status: 'queued' }] },
    };

    const collected = await collectAccountJobCounts({
      read: readerFor(routes),
      currentRepo: CURRENT,
      currentRunId: '999',
    });

    expect(collected.unreadableRepos).toEqual([]);
    expect(collected.repos).toEqual([
      { fullName: CURRENT, activeJobs: 1 },
      { fullName: SIBLING, activeJobs: 3 },
    ]);
    expect(collected.inventory).toEqual([CURRENT, SIBLING]);
  });

  it('excludes the rehearsal run itself', async () => {
    const routes: StubRoute = {
      [inventoryPage(1)]: [{ full_name: CURRENT, archived: false }],
      [runsPage(CURRENT, 'in_progress', 1)]: { workflow_runs: [{ id: 4242 }] },
      [runsPage(CURRENT, 'queued', 1)]: { workflow_runs: [] },
    };

    const collected = await collectAccountJobCounts({
      read: readerFor(routes),
      currentRepo: CURRENT,
      currentRunId: '4242',
    });

    expect(collected.repos).toEqual([{ fullName: CURRENT, activeJobs: 0 }]);
  });

  it('reports a repository it cannot read instead of counting it as idle', async () => {
    const routes: StubRoute = {
      [inventoryPage(1)]: [
        { full_name: CURRENT, archived: false },
        { full_name: SIBLING, archived: false },
      ],
      ...idleRepoRoutes(CURRENT),
    };

    const collected = await collectAccountJobCounts({
      read: readerFor(routes, [`repos/${SIBLING}/`]),
      currentRepo: CURRENT,
      currentRunId: '1',
    });

    expect(collected.repos).toEqual([{ fullName: CURRENT, activeJobs: 0 }]);
    expect(collected.unreadableRepos).toHaveLength(1);
    expect(collected.unreadableRepos[0]).toContain(SIBLING);
    expect(headroom({ ...collected }).ok).toBe(false);
  });

  it('treats an unreadable inventory as unverifiable, not as an idle account', async () => {
    const collected = await collectAccountJobCounts({
      read: readerFor({}, ['user/repos']),
      currentRepo: CURRENT,
      currentRunId: '1',
    });

    expect(collected.repos).toEqual([]);
    expect(collected.inventory).toEqual([]);
    expect(collected.unreadableRepos).toHaveLength(1);
    expect(headroom({ ...collected }).ok).toBe(false);
  });

  it('keeps archived repositories in the inventory but counts them as nothing', async () => {
    // They cannot run Actions, so zero is right — but dropping them from the
    // inventory would make archiving a repo look like a narrowly-scoped token.
    const routes: StubRoute = {
      [inventoryPage(1)]: [
        { full_name: CURRENT, archived: false },
        { full_name: SIBLING, archived: true },
      ],
      ...idleRepoRoutes(CURRENT),
    };

    const collected = await collectAccountJobCounts({
      read: readerFor(routes),
      currentRepo: CURRENT,
      currentRunId: '1',
    });

    expect(collected.repos.map(repo => repo.fullName)).toEqual([CURRENT]);
    expect(collected.inventory).toEqual([CURRENT, SIBLING]);
    expect(collected.unreadableRepos).toEqual([]);
  });

  describe('pagination', () => {
    it('follows every page of the repository inventory', async () => {
      const firstPage = Array.from({ length: 100 }, (_, index) => ({
        full_name: `rbeezley/filler-${index}`,
        archived: true,
      }));
      const routes: StubRoute = {
        [inventoryPage(1)]: firstPage,
        [inventoryPage(2)]: [{ full_name: CURRENT, archived: false }],
        ...idleRepoRoutes(CURRENT),
      };

      const collected = await collectAccountJobCounts({
        read: readerFor(routes),
        currentRepo: CURRENT,
        currentRunId: '1',
      });

      // Page 2 is where our own repo lives; a single-page read would miss it.
      expect(collected.inventory).toHaveLength(101);
      expect(collected.inventory).toContain(CURRENT);
      expect(collected.unreadableRepos).toEqual([]);
    });

    it('follows every page of active runs', async () => {
      const fullRunPage = Array.from({ length: 100 }, (_, index) => ({ id: index + 1 }));
      const jobRoutes: StubRoute = Object.fromEntries(
        [...fullRunPage, { id: 101 }].map(run => [
          jobsPage(CURRENT, run.id, 1),
          { jobs: [{ status: 'in_progress' }] },
        ])
      );
      const routes: StubRoute = {
        [inventoryPage(1)]: [{ full_name: CURRENT, archived: false }],
        [runsPage(CURRENT, 'in_progress', 1)]: { workflow_runs: fullRunPage },
        [runsPage(CURRENT, 'in_progress', 2)]: { workflow_runs: [{ id: 101 }] },
        [runsPage(CURRENT, 'queued', 1)]: { workflow_runs: [] },
        ...jobRoutes,
      };

      const collected = await collectAccountJobCounts({
        read: readerFor(routes),
        currentRepo: CURRENT,
        currentRunId: '0',
      });

      expect(collected.repos).toEqual([{ fullName: CURRENT, activeJobs: 101 }]);
    });

    it('follows every page of a run’s jobs', async () => {
      const routes: StubRoute = {
        [inventoryPage(1)]: [{ full_name: CURRENT, archived: false }],
        [runsPage(CURRENT, 'in_progress', 1)]: { workflow_runs: [{ id: 5 }] },
        [runsPage(CURRENT, 'queued', 1)]: { workflow_runs: [] },
        [jobsPage(CURRENT, 5, 1)]: {
          jobs: Array.from({ length: 100 }, () => ({ status: 'in_progress' })),
        },
        [jobsPage(CURRENT, 5, 2)]: { jobs: [{ status: 'queued' }, { status: 'completed' }] },
      };

      const collected = await collectAccountJobCounts({
        read: readerFor(routes),
        currentRepo: CURRENT,
        currentRunId: '0',
      });

      expect(collected.repos).toEqual([{ fullName: CURRENT, activeJobs: 101 }]);
    });

    it('refuses rather than truncating when a collection never ends', async () => {
      // A full page forever: the loop must give up and report, never return the
      // pages it did read as if they were the whole account.
      const read = async (path: string) => {
        if (path.startsWith('user/repos')) {
          return Array.from({ length: 100 }, (_, index) => ({
            full_name: `rbeezley/endless-${index}`,
            archived: true,
          }));
        }
        throw new Error(`unexpected path: ${path}`);
      };

      const collected = await collectAccountJobCounts({
        read,
        currentRepo: CURRENT,
        currentRunId: '1',
      });

      expect(collected.inventory).toEqual([]);
      expect(collected.unreadableRepos[0]).toContain('truncated');
      expect(headroom({ ...collected }).ok).toBe(false);
    });
  });
});
