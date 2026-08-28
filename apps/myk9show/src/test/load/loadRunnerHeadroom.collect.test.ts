import { describe, expect, it } from 'vitest';
import { collectAccountJobCounts } from './loadRunnerHeadroom';
import { CURRENT, SIBLING, headroom } from './loadRunnerHeadroom.fixtures';

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
/** Profile route; public_repos matches the public repos the stubs enumerate. */
const userRoute = (publicRepos: number) => ({ user: { public_repos: publicRepos } });
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
      ...userRoute(1),
      [inventoryPage(1)]: [
        { full_name: CURRENT, archived: false, private: false },
        { full_name: SIBLING, archived: false, private: true },
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
    // One public repo enumerated, one reported: the audit is satisfied.
    expect(collected.publicRepoAudit).toEqual({ reported: 1, enumerated: 1 });
  });

  it('surfaces a public-repo shortfall from the live profile', async () => {
    const routes: StubRoute = {
      ...userRoute(4),
      [inventoryPage(1)]: [{ full_name: CURRENT, archived: false, private: false }],
      ...idleRepoRoutes(CURRENT),
    };

    const collected = await collectAccountJobCounts({
      read: readerFor(routes),
      currentRepo: CURRENT,
      currentRunId: '1',
    });

    expect(collected.publicRepoAudit).toEqual({ reported: 4, enumerated: 1 });
    expect(headroom({ ...collected }).ok).toBe(false);
  });

  it('leaves the audit unreported when the profile read fails', async () => {
    const routes: StubRoute = {
      [inventoryPage(1)]: [{ full_name: CURRENT, archived: false, private: false }],
      ...idleRepoRoutes(CURRENT),
    };
    const base = readerFor(routes);

    const collected = await collectAccountJobCounts({
      // Exactly the profile route, not a prefix — 'user' as a prefix would also
      // kill 'user/repos' and the inventory would be what failed instead.
      read: async path => {
        if (path === 'user') throw new Error('HTTP 403');
        return base(path);
      },
      currentRepo: CURRENT,
      currentRunId: '1',
    });

    // The inventory still read cleanly; only the audit is unavailable.
    expect(collected.inventory).toEqual([CURRENT]);
    expect(collected.unreadableRepos).toEqual([]);
    expect(collected.publicRepoAudit.reported).toBeNull();
  });

  it('excludes the rehearsal run itself', async () => {
    const routes: StubRoute = {
      ...userRoute(1),
      [inventoryPage(1)]: [{ full_name: CURRENT, archived: false, private: false }],
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
      ...userRoute(1),
      [inventoryPage(1)]: [
        { full_name: CURRENT, archived: false, private: false },
        { full_name: SIBLING, archived: false, private: true },
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
      ...userRoute(1),
      [inventoryPage(1)]: [
        { full_name: CURRENT, archived: false, private: false },
        { full_name: SIBLING, archived: true, private: true },
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

  describe('run-status transitions', () => {
    it('reads queued before in_progress so a starting run cannot slip between them', async () => {
      const seen: string[] = [];
      const routes: StubRoute = {
        ...userRoute(1),
        [inventoryPage(1)]: [{ full_name: CURRENT, archived: false, private: false }],
        ...idleRepoRoutes(CURRENT),
      };
      const base = readerFor(routes);

      await collectAccountJobCounts({
        read: async path => {
          if (path.includes('/actions/runs?status=')) {
            seen.push(path.includes('status=queued') ? 'queued' : 'in_progress');
          }
          return base(path);
        },
        currentRepo: CURRENT,
        currentRunId: '1',
      });

      // in_progress first would lose a run that is queued at the first read and
      // running by the second; the trailing queued re-read catches one enqueued
      // after the first read that never started.
      expect(seen).toEqual(['queued', 'in_progress', 'queued']);
    });

    it('counts a run that only appears in the second queued snapshot', async () => {
      // Enqueued after the first queued read and still queued through the
      // in_progress read — invisible to a two-snapshot count.
      let queuedReads = 0;
      const routes: StubRoute = {
        ...userRoute(1),
        [inventoryPage(1)]: [{ full_name: CURRENT, archived: false, private: false }],
        [runsPage(CURRENT, 'in_progress', 1)]: { workflow_runs: [] },
        [jobsPage(CURRENT, 77, 1)]: { jobs: [{ status: 'queued' }, { status: 'queued' }] },
      };
      const base = readerFor(routes);

      const collected = await collectAccountJobCounts({
        read: async path => {
          if (path.includes('status=queued')) {
            queuedReads += 1;
            return { workflow_runs: queuedReads === 1 ? [] : [{ id: 77 }] };
          }
          return base(path);
        },
        currentRepo: CURRENT,
        currentRunId: '1',
      });

      expect(collected.repos).toEqual([{ fullName: CURRENT, activeJobs: 2 }]);
    });

    it('counts a run appearing in both status reads only once', async () => {
      const routes: StubRoute = {
        ...userRoute(1),
        [inventoryPage(1)]: [{ full_name: CURRENT, archived: false, private: false }],
        // The same run id in both lists — exactly what a queued -> in_progress
        // transition between the two reads produces.
        [runsPage(CURRENT, 'queued', 1)]: { workflow_runs: [{ id: 42 }] },
        [runsPage(CURRENT, 'in_progress', 1)]: { workflow_runs: [{ id: 42 }] },
        [jobsPage(CURRENT, 42, 1)]: { jobs: [{ status: 'in_progress' }, { status: 'queued' }] },
      };

      const collected = await collectAccountJobCounts({
        read: readerFor(routes),
        currentRepo: CURRENT,
        currentRunId: '1',
      });

      expect(collected.repos).toEqual([{ fullName: CURRENT, activeJobs: 2 }]);
    });
  });

  describe('pagination', () => {
    it('follows every page of the repository inventory', async () => {
      const firstPage = Array.from({ length: 100 }, (_, index) => ({
        full_name: `rbeezley/filler-${index}`,
        archived: true,
        private: true,
      }));
      const routes: StubRoute = {
        ...userRoute(1),
        [inventoryPage(1)]: firstPage,
        [inventoryPage(2)]: [{ full_name: CURRENT, archived: false, private: false }],
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
        ...userRoute(1),
        [inventoryPage(1)]: [{ full_name: CURRENT, archived: false, private: false }],
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
        ...userRoute(1),
        [inventoryPage(1)]: [{ full_name: CURRENT, archived: false, private: false }],
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
            private: true,
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
