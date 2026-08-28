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
 *
 * The subtle case, and the reason EXPECTED_ACCOUNT_REPOS exists: a token scoped
 * to ONLY the rehearsal's own repository produces an inventory that passes every
 * structural check. It is non-empty, it contains our own repo, and nothing in it
 * failed to read — it simply omits the sibling whose jobs matter. Proving the
 * inventory is complete therefore needs a fact the API cannot supply, since
 * `/user/repos` returns what the token can see and there is no endpoint that
 * returns what the account actually owns regardless of token scope. So the
 * expected set is pinned here as a floor: every one of these must appear, and
 * anything beyond them is still counted.
 */

/**
 * Every repository on the rbeezley account, as of 2026-08-28.
 *
 * A FLOOR, not a ceiling — repositories outside this list are still enumerated
 * and counted; the list only proves the token is not narrowly scoped. Checked
 * against the raw inventory rather than the countable subset, so archiving a
 * repository does not trip the gate.
 *
 * KNOWN RESIDUAL GAP, stated rather than papered over. This floor proves the
 * token is not scoped to a SUBSET of these four; it cannot prove the token is
 * scoped to "All repositories" rather than to exactly these four. The
 * distinction matters only if the account later gains a fifth repository while
 * the token is a selected-repository token — a fine-grained PAT created with
 * "All repositories", as the README instructs, picks up new repositories
 * automatically and has no gap.
 *
 * There is no API that closes this. `/user/repos` returns what the token can
 * see, which is the quantity in doubt, and the count fields on `GET /user` that
 * would settle it (`owned_private_repos`, `total_private_repos`) come back null
 * unless the token carries classic `repo` scope — verified against the live API
 * on 2026-08-28. Only `public_repos` is populated, which is why the public half
 * is cross-checked below and the private half is not.
 *
 * So: create the token with "All repositories", and add any new repository here
 * in the same change that creates it.
 */
export const EXPECTED_ACCOUNT_REPOS: readonly string[] = [
  'rbeezley/myk9-platform',
  'rbeezley/myK9Qv3',
  'rbeezley/AKC-Scent-Work-Rules',
  'rbeezley/myk9show-launch-video',
];

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
  /** Active-job counts for every countable repository on the account. */
  readonly repos: readonly RepoJobCount[];
  /** Every repository name the token enumerated, archived ones included. */
  readonly inventory: readonly string[];
  /** Repositories the token could not read. Any entry refuses the dispatch. */
  readonly unreadableRepos: readonly string[];
  /** Repositories that must appear in the inventory to prove account-wide scope. */
  readonly expectedRepos?: readonly string[];
  /**
   * `public_repos` from `GET /user` against the count of public repositories the
   * token enumerated. A mismatch proves a narrowed token; absent (null) means
   * the check could not run and is not treated as a pass.
   */
  readonly publicRepoAudit?: { readonly reported: number | null; readonly enumerated: number };
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

  if (inputs.inventory.length === 0) {
    return {
      ok: false,
      reason:
        'Account-wide capacity could not be verified: the repository inventory was empty. ' +
        'A token that enumerates no repositories cannot prove the account is idle.',
    };
  }

  if (!inputs.inventory.includes(inputs.currentRepo)) {
    // A token scoped away from our own repository. Its absence proves the
    // inventory is not an account-wide view.
    return {
      ok: false,
      reason:
        `Account-wide capacity could not be verified: the repository inventory ` +
        `(${inputs.inventory.join(', ')}) does not include ${inputs.currentRepo}, ` +
        `so it is not an account-wide view.`,
    };
  }

  // The narrow-token case the structural checks above cannot see: an inventory
  // that is non-empty, contains our own repo, and read cleanly, but omits the
  // sibling whose jobs are the whole point of the gate.
  const expected = inputs.expectedRepos ?? EXPECTED_ACCOUNT_REPOS;
  const absent = expected.filter(name => !inputs.inventory.includes(name));
  if (absent.length > 0) {
    return {
      ok: false,
      reason:
        `Account-wide capacity could not be verified: the headroom token did not ` +
        `enumerate ${absent.join(', ')}. A token scoped to only some repositories ` +
        `returns an inventory that looks complete and silently omits the rest, which ` +
        `is the exact undercount this gate exists to prevent. Re-issue ` +
        `HEADROOM_GITHUB_TOKEN with Actions:read and Metadata:read on ALL repositories. ` +
        `(If a repository was legitimately deleted or transferred, drop it from ` +
        `EXPECTED_ACCOUNT_REPOS in the same change that explains why.)`,
    };
  }

  // The one scope proof the API can actually supply. `public_repos` on the user
  // record is a property of the ACCOUNT, not of the token's repository scope, so
  // a token that hides a public repository shows up here as a shortfall.
  const audit = inputs.publicRepoAudit;
  if (audit && audit.reported !== null && audit.enumerated < audit.reported) {
    return {
      ok: false,
      reason:
        `Account-wide capacity could not be verified: the account reports ` +
        `${audit.reported} public repositories but the headroom token enumerated ` +
        `only ${audit.enumerated}. The token is scoped to a subset of the account. ` +
        `Re-issue HEADROOM_GITHUB_TOKEN with Actions:read and Metadata:read on ALL ` +
        `repositories.`,
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
  readonly private: boolean;
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

/**
 * Run-status snapshots, in read order: queued, in_progress, queued again.
 *
 * `queued` and `in_progress` are separate API reads, so a run can move between
 * them. Reading `in_progress` first loses a run that is queued at the first read
 * and running by the second — it appears in neither result and its jobs vanish
 * from the count, which at the capacity boundary admits a rehearsal that should
 * have been refused. Reading `queued` first fixes that direction. The trailing
 * `queued` re-read closes the other one: a run enqueued after the first queued
 * read that is still queued during the in_progress read.
 *
 * The same run legitimately appears in more than one snapshot, so run ids are
 * de-duplicated before their jobs are fetched.
 *
 * THIS DOES NOT MAKE THE COUNT INSTANTANEOUS, and no number of snapshots would.
 * Work enqueued after the final read is missed by construction — that is a
 * property of sampling, not a bug a fourth read would fix. The extra read
 * narrows the window; the thing that actually absorbs late arrivals is the
 * margin between the ceiling and what the rehearsal needs (20 - 17 = 3 slots).
 * If that margin ever goes to zero, no amount of polling here rescues it.
 */
const ACTIVE_RUN_STATUSES = ['queued', 'in_progress', 'queued'] as const;

const ACTIVE_JOB_STATUSES = new Set(['in_progress', 'queued']);

const PAGE_SIZE = 100;
/**
 * Pages are followed until one comes back short. The cap only bounds a runaway
 * loop, and reaching it THROWS rather than truncating — a truncated collection
 * is an undercount, which is the failure this whole module exists to refuse.
 */
const MAX_PAGES = 20;

export interface CollectOptions {
  readonly read: GitHubReader;
  readonly currentRepo: string;
  /** Excluded from the count: this run's own jobs are not competition. */
  readonly currentRunId: string;
}

export interface CollectedCounts {
  readonly repos: readonly RepoJobCount[];
  readonly inventory: readonly string[];
  readonly unreadableRepos: readonly string[];
  readonly publicRepoAudit: { readonly reported: number | null; readonly enumerated: number };
}

/**
 * Reads every page of a paginated collection.
 *
 * `select` pulls the array out of the body, since `/user/repos` returns a bare
 * array while the Actions endpoints wrap theirs in an object.
 */
async function readAllPages<T>(
  read: GitHubReader,
  pathForPage: (page: number) => string,
  select: (body: unknown) => T[] | undefined
): Promise<T[]> {
  const items: T[] = [];

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const body = await read(pathForPage(page));
    const chunk = select(body);
    if (!Array.isArray(chunk)) {
      throw new Error(`unexpected response shape on page ${page}`);
    }
    items.push(...chunk);
    if (chunk.length < PAGE_SIZE) return items;
  }

  throw new Error(
    `collection exceeded ${MAX_PAGES} pages of ${PAGE_SIZE}; refusing to treat a ` +
      `truncated result as complete`
  );
}

/**
 * Enumerates the account's repositories and counts their active jobs.
 *
 * Archived repositories are counted as zero rather than skipped outright: they
 * cannot run Actions, so they are provably not consuming concurrency, but they
 * still belong in the inventory that proves the token's scope.
 */
export async function collectAccountJobCounts(options: CollectOptions): Promise<CollectedCounts> {
  let inventory: AccountRepo[];
  try {
    inventory = await readAllPages<AccountRepo>(
      options.read,
      page => `user/repos?per_page=${PAGE_SIZE}&page=${page}&affiliation=owner`,
      body => (Array.isArray(body) ? (body as AccountRepo[]) : undefined)
    );
  } catch (error) {
    return {
      repos: [],
      inventory: [],
      unreadableRepos: [`<account repository inventory: ${describeError(error)}>`],
      publicRepoAudit: { reported: null, enumerated: 0 },
    };
  }

  const named = inventory.filter(entry => typeof entry?.full_name === 'string');
  const repos: RepoJobCount[] = [];
  const unreadableRepos: string[] = [];

  // Best-effort: `public_repos` is populated for any token, unlike the private
  // counts. A read failure leaves `reported` null, which evaluateHeadroom treats
  // as "check did not run" rather than as a pass.
  let reportedPublicRepos: number | null = null;
  try {
    const profile = await options.read('user');
    const value = (profile as { public_repos?: unknown })?.public_repos;
    if (typeof value === 'number') reportedPublicRepos = value;
  } catch {
    reportedPublicRepos = null;
  }

  for (const entry of named) {
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

  return {
    repos,
    inventory: named.map(entry => entry.full_name),
    unreadableRepos,
    publicRepoAudit: {
      reported: reportedPublicRepos,
      enumerated: named.filter(entry => entry.private === false).length,
    },
  };
}

async function countActiveJobs(fullName: string, options: CollectOptions): Promise<number> {
  const runIds = new Set<number>();

  for (const status of ACTIVE_RUN_STATUSES) {
    const runs = await readAllPages<WorkflowRun>(
      options.read,
      page => `repos/${fullName}/actions/runs?status=${status}&per_page=${PAGE_SIZE}&page=${page}`,
      body => (body as { workflow_runs?: WorkflowRun[] })?.workflow_runs
    );
    for (const run of runs) {
      if (String(run.id) === options.currentRunId) continue;
      runIds.add(run.id);
    }
  }

  let active = 0;
  for (const runId of runIds) {
    const jobs = await readAllPages<WorkflowJob>(
      options.read,
      page => `repos/${fullName}/actions/runs/${runId}/jobs?per_page=${PAGE_SIZE}&page=${page}`,
      body => (body as { jobs?: WorkflowJob[] })?.jobs
    );
    active += jobs.filter(job => ACTIVE_JOB_STATUSES.has(job.status)).length;
  }

  return active;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
