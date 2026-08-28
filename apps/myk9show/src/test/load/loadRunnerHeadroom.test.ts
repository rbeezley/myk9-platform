import { describe, expect, it } from 'vitest';
import { collectAccountJobCounts, evaluateHeadroom } from './loadRunnerHeadroom';

const CEILING = 20;
const REQUIRED = 17;
const CURRENT = 'rbeezley/myk9-platform';

function verdictReason(verdict: ReturnType<typeof evaluateHeadroom>): string {
  return verdict.ok ? '' : verdict.reason;
}

describe('evaluateHeadroom', () => {
  it('counts jobs in a sibling repository against the account ceiling', () => {
    // The regression NCR-2026-08-27-01 names: the rehearsal repo is idle, so a
    // per-repo gate sees 20 free and dispatches. Account-wide, only 16 are.
    const verdict = evaluateHeadroom({
      ceiling: CEILING,
      required: REQUIRED,
      currentRepo: CURRENT,
      repos: [
        { fullName: CURRENT, activeJobs: 0 },
        { fullName: 'rbeezley/myK9Qv3', activeJobs: 4 },
      ],
      unreadableRepos: [],
    });

    expect(verdict.ok).toBe(false);
    expect(verdictReason(verdict)).toContain('rbeezley/myK9Qv3=4');
    expect(verdictReason(verdict)).toContain('leaving 16 free but 17 required');
  });

  it('admits the rehearsal when the whole account has room', () => {
    const verdict = evaluateHeadroom({
      ceiling: CEILING,
      required: REQUIRED,
      currentRepo: CURRENT,
      repos: [
        { fullName: CURRENT, activeJobs: 1 },
        { fullName: 'rbeezley/myK9Qv3', activeJobs: 2 },
      ],
      unreadableRepos: [],
    });

    expect(verdict).toEqual({ ok: true, busy: 3, free: 17 });
  });

  it('admits exactly at the boundary', () => {
    const verdict = evaluateHeadroom({
      ceiling: CEILING,
      required: REQUIRED,
      currentRepo: CURRENT,
      repos: [{ fullName: CURRENT, activeJobs: 3 }],
      unreadableRepos: [],
    });

    expect(verdict).toEqual({ ok: true, busy: 3, free: 17 });
  });

  it('refuses one job past the boundary', () => {
    const verdict = evaluateHeadroom({
      ceiling: CEILING,
      required: REQUIRED,
      currentRepo: CURRENT,
      repos: [{ fullName: CURRENT, activeJobs: 4 }],
      unreadableRepos: [],
    });

    expect(verdict.ok).toBe(false);
  });

  it('refuses when any repository could not be read, even with apparent room', () => {
    const verdict = evaluateHeadroom({
      ceiling: CEILING,
      required: REQUIRED,
      currentRepo: CURRENT,
      repos: [{ fullName: CURRENT, activeJobs: 0 }],
      unreadableRepos: ['rbeezley/myK9Qv3 (HTTP 404)'],
    });

    expect(verdict.ok).toBe(false);
    expect(verdictReason(verdict)).toContain('could not be verified');
    expect(verdictReason(verdict)).toContain('rbeezley/myK9Qv3');
  });

  it('refuses an inventory that omits the rehearsal repository', () => {
    // The shape a repo-scoped token produces: a list that looks fine and is not
    // account-wide. Absence of our own repo is the proof.
    const verdict = evaluateHeadroom({
      ceiling: CEILING,
      required: REQUIRED,
      currentRepo: CURRENT,
      repos: [{ fullName: 'rbeezley/myK9Qv3', activeJobs: 0 }],
      unreadableRepos: [],
    });

    expect(verdict.ok).toBe(false);
    expect(verdictReason(verdict)).toContain('not an account-wide view');
  });

  it('refuses an empty inventory rather than reading it as an idle account', () => {
    const verdict = evaluateHeadroom({
      ceiling: CEILING,
      required: REQUIRED,
      currentRepo: CURRENT,
      repos: [],
      unreadableRepos: [],
    });

    expect(verdict.ok).toBe(false);
    expect(verdictReason(verdict)).toContain('inventory was empty');
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

describe('collectAccountJobCounts', () => {
  const inventoryPath = 'user/repos?per_page=100&affiliation=owner';

  it('sums active jobs across every repository on the account', async () => {
    const routes: StubRoute = {
      [inventoryPath]: [
        { full_name: CURRENT, archived: false },
        { full_name: 'rbeezley/myK9Qv3', archived: false },
      ],
      [`repos/${CURRENT}/actions/runs?status=in_progress&per_page=100`]: {
        workflow_runs: [{ id: 1 }, { id: 999 }],
      },
      [`repos/${CURRENT}/actions/runs?status=queued&per_page=100`]: { workflow_runs: [] },
      [`repos/${CURRENT}/actions/runs/1/jobs?per_page=100`]: {
        jobs: [{ status: 'in_progress' }, { status: 'completed' }],
      },
      'repos/rbeezley/myK9Qv3/actions/runs?status=in_progress&per_page=100': {
        workflow_runs: [{ id: 7 }],
      },
      'repos/rbeezley/myK9Qv3/actions/runs?status=queued&per_page=100': {
        workflow_runs: [{ id: 8 }],
      },
      'repos/rbeezley/myK9Qv3/actions/runs/7/jobs?per_page=100': {
        jobs: [{ status: 'in_progress' }, { status: 'in_progress' }],
      },
      'repos/rbeezley/myK9Qv3/actions/runs/8/jobs?per_page=100': {
        jobs: [{ status: 'queued' }],
      },
    };

    const collected = await collectAccountJobCounts({
      read: readerFor(routes),
      currentRepo: CURRENT,
      currentRunId: '999',
    });

    expect(collected.unreadableRepos).toEqual([]);
    expect(collected.repos).toEqual([
      { fullName: CURRENT, activeJobs: 1 },
      { fullName: 'rbeezley/myK9Qv3', activeJobs: 3 },
    ]);
  });

  it('excludes the rehearsal run itself', async () => {
    const routes: StubRoute = {
      [inventoryPath]: [{ full_name: CURRENT, archived: false }],
      [`repos/${CURRENT}/actions/runs?status=in_progress&per_page=100`]: {
        workflow_runs: [{ id: 4242 }],
      },
      [`repos/${CURRENT}/actions/runs?status=queued&per_page=100`]: { workflow_runs: [] },
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
      [inventoryPath]: [
        { full_name: CURRENT, archived: false },
        { full_name: 'rbeezley/myK9Qv3', archived: false },
      ],
      [`repos/${CURRENT}/actions/runs?status=in_progress&per_page=100`]: { workflow_runs: [] },
      [`repos/${CURRENT}/actions/runs?status=queued&per_page=100`]: { workflow_runs: [] },
    };

    const collected = await collectAccountJobCounts({
      read: readerFor(routes, ['repos/rbeezley/myK9Qv3/']),
      currentRepo: CURRENT,
      currentRunId: '1',
    });

    expect(collected.repos).toEqual([{ fullName: CURRENT, activeJobs: 0 }]);
    expect(collected.unreadableRepos).toHaveLength(1);
    expect(collected.unreadableRepos[0]).toContain('rbeezley/myK9Qv3');

    // And that state must refuse, not pass on the readable half.
    expect(
      evaluateHeadroom({
        ceiling: CEILING,
        required: REQUIRED,
        currentRepo: CURRENT,
        repos: collected.repos,
        unreadableRepos: collected.unreadableRepos,
      }).ok
    ).toBe(false);
  });

  it('treats an unreadable inventory as unverifiable, not as an idle account', async () => {
    const collected = await collectAccountJobCounts({
      read: readerFor({}, ['user/repos']),
      currentRepo: CURRENT,
      currentRunId: '1',
    });

    expect(collected.repos).toEqual([]);
    expect(collected.unreadableRepos).toHaveLength(1);
    expect(
      evaluateHeadroom({
        ceiling: CEILING,
        required: REQUIRED,
        currentRepo: CURRENT,
        repos: collected.repos,
        unreadableRepos: collected.unreadableRepos,
      }).ok
    ).toBe(false);
  });

  it('skips archived repositories, which cannot run Actions', async () => {
    const routes: StubRoute = {
      [inventoryPath]: [
        { full_name: CURRENT, archived: false },
        { full_name: 'rbeezley/old-thing', archived: true },
      ],
      [`repos/${CURRENT}/actions/runs?status=in_progress&per_page=100`]: { workflow_runs: [] },
      [`repos/${CURRENT}/actions/runs?status=queued&per_page=100`]: { workflow_runs: [] },
    };

    const collected = await collectAccountJobCounts({
      read: readerFor(routes),
      currentRepo: CURRENT,
      currentRunId: '1',
    });

    expect(collected.repos.map(repo => repo.fullName)).toEqual([CURRENT]);
    expect(collected.unreadableRepos).toEqual([]);
  });
});
