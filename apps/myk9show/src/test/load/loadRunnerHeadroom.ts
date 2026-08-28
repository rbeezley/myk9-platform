/**
 * Account-wide runner-headroom gate for the G9 rehearsal (NCR-2026-08-27-01).
 *
 * GitHub's concurrent-job ceiling is an ACCOUNT limit, shared by every
 * repository the account owns. The first version of this gate counted only
 * `repos/${GITHUB_REPOSITORY}`, so a CI run in a sibling repository consumed
 * slots the gate had already promised to the rehearsal. That is not
 * theoretical: `rbeezley/myK9Qv3` carries an active CI workflow.
 *
 * The failure it produces is the expensive kind. The gate runs BEFORE the
 * canonical reseed precisely so a busy window costs nothing; a gate that passes
 * on an incomplete count moves the failure to after the reseed, where a shard
 * that cannot get a runner misses the synchronized barrier and burns the whole
 * operator-approved window.
 *
 * So the rule here is: count every repository on the account, or refuse. A
 * partial count is never rounded down into a pass, because "we could not see
 * the other repositories" and "the other repositories are idle" are the same
 * observation from inside a repo-scoped token, and only one of them is safe.
 */

export interface RepoJobCount {
  readonly fullName: string;
  readonly activeJobs: number;
}

export interface HeadroomInputs {
  /** Account-wide concurrent-job ceiling for the plan. */
  readonly ceiling: number;
  /** Jobs this rehearsal needs simultaneously (shards + sampler). */
  readonly required: number;
  /** `owner/repo` of the repository running the rehearsal. */
  readonly currentRepo: string;
  /** Active-job counts for every Actions-capable repository on the account. */
  readonly repos: readonly RepoJobCount[];
  /** Repositories the token could not read. Any entry refuses the dispatch. */
  readonly unreadableRepos: readonly string[];
}

export type HeadroomVerdict =
  | { readonly ok: true; readonly busy: number; readonly free: number }
  | { readonly ok: false; readonly reason: string };

/**
 * Decides whether the rehearsal may proceed.
 *
 * Deliberately pure and total: every refusal path returns a verdict carrying
 * the operator-facing reason, so the caller never has to reconstruct why.
 */
export function evaluateHeadroom(inputs: HeadroomInputs): HeadroomVerdict {
  if (inputs.unreadableRepos.length > 0) {
    return {
      ok: false,
      reason:
        `Account-wide capacity could not be verified: no Actions read access to ` +
        `${inputs.unreadableRepos.join(', ')}. The concurrency ceiling is shared across ` +
        `every repository on the account, so an unreadable repository is unmeasured ` +
        `capacity, not idle capacity. Grant the headroom token Actions:read on all ` +
        `repositories and re-dispatch.`,
    };
  }

  if (inputs.repos.length === 0) {
    return {
      ok: false,
      reason:
        'Account-wide capacity could not be verified: the repository inventory was empty. ' +
        'A token that enumerates no repositories cannot prove the account is idle.',
    };
  }

  const seen = inputs.repos.some(repo => repo.fullName === inputs.currentRepo);
  if (!seen) {
    // A repo-scoped token enumerates a plausible-looking inventory that simply
    // omits everything it cannot see. The rehearsal's own repository is always
    // in scope, so its absence proves the inventory is not account-wide.
    return {
      ok: false,
      reason:
        `Account-wide capacity could not be verified: the repository inventory ` +
        `(${inputs.repos.map(repo => repo.fullName).join(', ')}) does not include ` +
        `${inputs.currentRepo}, so it is not an account-wide view.`,
    };
  }

  const busy = inputs.repos.reduce((total, repo) => total + repo.activeJobs, 0);
  const free = inputs.ceiling - busy;

  if (free < inputs.required) {
    const breakdown = inputs.repos
      .filter(repo => repo.activeJobs > 0)
      .map(repo => `${repo.fullName}=${repo.activeJobs}`)
      .join(', ');
    return {
      ok: false,
      reason:
        `Not enough runner headroom for a synchronized start: ${busy} of ` +
        `${inputs.ceiling} account-wide jobs are active (${breakdown || 'none'}), ` +
        `leaving ${free} free but ${inputs.required} required. Let other workflows ` +
        `finish, avoid pushing to main during the window, and re-dispatch.`,
    };
  }

  return { ok: true, busy, free };
}

/** Minimal shape of a repository as returned by `GET /user/repos`. */
export interface AccountRepo {
  readonly full_name: string;
  readonly archived: boolean;
}

/** Minimal shape of a workflow run as returned by `GET /repos/{repo}/actions/runs`. */
export interface WorkflowRun {
  readonly id: number;
}

/** Minimal shape of a job as returned by `GET /repos/{repo}/actions/runs/{id}/jobs`. */
export interface WorkflowJob {
  readonly status: string;
}

/**
 * Injectable GitHub reader. Resolves the parsed JSON body, or rejects — a
 * rejection is treated as "unreadable", never as "empty".
 */
export type GitHubReader = (path: string) => Promise<unknown>;

const ACTIVE_RUN_STATUSES = ['in_progress', 'queued'] as const;
const ACTIVE_JOB_STATUSES = new Set(['in_progress', 'queued']);

export interface CollectOptions {
  readonly read: GitHubReader;
  readonly currentRepo: string;
  /** Excluded from the count: this run's own jobs are not competition. */
  readonly currentRunId: string;
}

export interface CollectedCounts {
  readonly repos: readonly RepoJobCount[];
  readonly unreadableRepos: readonly string[];
}

/**
 * Enumerates the account's repositories and counts their active jobs.
 *
 * Archived repositories are skipped: Actions cannot run in them, so they are
 * provably not consuming concurrency — the one exclusion that does not weaken
 * the count.
 */
export async function collectAccountJobCounts(options: CollectOptions): Promise<CollectedCounts> {
  let inventory: unknown;
  try {
    inventory = await options.read('user/repos?per_page=100&affiliation=owner');
  } catch (error) {
    return {
      repos: [],
      unreadableRepos: [`<account repository inventory: ${describeError(error)}>`],
    };
  }

  if (!Array.isArray(inventory)) {
    return { repos: [], unreadableRepos: ['<account repository inventory: not a list>'] };
  }

  const repos: RepoJobCount[] = [];
  const unreadableRepos: string[] = [];

  for (const entry of inventory as AccountRepo[]) {
    if (typeof entry?.full_name !== 'string') continue;
    if (entry.archived) continue;

    try {
      repos.push({
        fullName: entry.full_name,
        activeJobs: await countActiveJobs(entry.full_name, options),
      });
    } catch (error) {
      unreadableRepos.push(`${entry.full_name} (${describeError(error)})`);
    }
  }

  return { repos, unreadableRepos };
}

async function countActiveJobs(fullName: string, options: CollectOptions): Promise<number> {
  let active = 0;

  for (const status of ACTIVE_RUN_STATUSES) {
    const body = await options.read(`repos/${fullName}/actions/runs?status=${status}&per_page=100`);
    const runs = (body as { workflow_runs?: WorkflowRun[] })?.workflow_runs;
    if (!Array.isArray(runs)) continue;

    for (const run of runs) {
      if (String(run.id) === options.currentRunId) continue;
      const jobsBody = await options.read(
        `repos/${fullName}/actions/runs/${run.id}/jobs?per_page=100`
      );
      const jobs = (jobsBody as { jobs?: WorkflowJob[] })?.jobs;
      if (!Array.isArray(jobs)) continue;
      active += jobs.filter(job => ACTIVE_JOB_STATUSES.has(job.status)).length;
    }
  }

  return active;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
