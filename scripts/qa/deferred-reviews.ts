/**
 * Deferred re-review reconciliation (MYK9-533).
 *
 * The `owner` review-gate override (review-gate.ts, `overrideAccepted`) lets a
 * PR merge with scrutiny DEFERRED rather than skipped, on the condition that
 * the evidence names a tracked issue: `Deferred re-review: <ISSUE-ID>`. That
 * id is validated by SHAPE only at merge time — `MYK9-999999` parses fine —
 * so nothing before this script ever asked whether the id actually resolves,
 * and nothing asked whether a recorded deferral ever got its re-review.
 *
 * This runs as a SCHEDULED job, not an inline gate check, because the
 * `Review gate` status itself is computed by a `pull_request_target` workflow
 * with no Linear credential (review-gate.yml) — the design note on MYK9-533 is
 * the decision record. Wiring a Linear lookup into that path would mean either
 * granting it a `LINEAR_API_KEY` (widening what an untrusted PR's workflow run
 * can reach) or letting a Linear outage silently pass every override, which is
 * the exact "outage looks like success" failure this repo has been bitten by
 * before (`docs/lessons/README.md#stale-health-check`,
 * `#ci-poll-settled`). A weekly reconciliation instead: fails LOUD on an
 * outage or a missing key (exit 2), never silently green; fails on any
 * unresolvable id (exit 1); and surfaces every still-open deferral so the debt
 * is visible without anyone having to go looking for it.
 *
 * ## How the window is walked (round 1 review, P1)
 *
 * The first cut enumerated every merged PR (`gh pr list --limit N`) and then
 * read every one of their comment threads — 594 PRs in the default 30-day
 * window on 2026-09-15, so ~600 requests per run, AND `--limit` truncates
 * silently at the cap, which is the exact "silent pass" this script exists to
 * refuse. It now reads the repo-wide comment stream instead:
 * `GET /repos/{owner}/{repo}/issues/comments?since=…&per_page=100`, paginated
 * by `gh api --paginate`. That is 15 requests for 1,436 comments across 627
 * issues in the same window, and pagination follows `Link` headers rather
 * than stopping at a caller-supplied cap.
 *
 * Grouping is by issue number; only issues carrying an in-window
 * `Deferred re-review:` line are candidates, and each candidate costs exactly
 * one `gh pr view` to confirm it is a MERGED pull request and to learn the
 * merged head. Today that is 4 candidates: 19 GitHub requests per run,
 * measured end to end at 15.4 s against the live repo on 2026-09-15 — well
 * inside the workflow's `timeout-minutes: 10`, even with the four Linear
 * lookups on top.
 *
 * The window's `since` filters on `updated_at`, which is also the key
 * `evaluateReviewGate` orders evidence by. The in-window comment set is
 * therefore CLOSED under "was updated later": anything that could supersede an
 * in-window gate line was itself updated later and is in the window too. So
 * selecting the latest-for-head from the in-window comments alone cannot pick
 * a line that something outside the window already replaced.
 *
 * ## What counts as debt (round 1 review, P2-2)
 *
 * Evidence is selected exactly the way the gate selects it: for the MERGED
 * head, the latest trusted gate line by `updatedAt` (`evaluateReviewGate`'s
 * own rule). Its `Deferred re-review:` ids are reconciled only when THAT line
 * is an accepted `owner` override. A superseded override — an older head, or a
 * corrected line posted afterwards for the same head — never gated the merge
 * and carries no debt; the first cut reconciled every override comment ever
 * posted, so a typo'd id that was immediately corrected read as permanent,
 * unclearable debt.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  flattenPages,
  overrideAccepted,
  parseGateComments,
  type GateComment,
} from './review-gate.ts';

/**
 * `DEFERRED_REVIEW`'s canonical shape check lives in `review-gate.ts` (search
 * that file for `const DEFERRED_REVIEW`) — that copy only proves a line of
 * this shape exists in the body. This copy captures the id itself, which the
 * canonical regex has no reason to do, so it is not exported and is
 * re-declared here rather than imported.
 */
const DEFERRED_REVIEW_ID = /^Deferred re-review: ([A-Z][A-Z0-9]*-\d+)$/gm;

export const LINEAR_ENDPOINT = 'https://api.linear.app/graphql';
/**
 * ASSUMPTION, unverified until the first live run (no `LINEAR_API_KEY` in this
 * session, and none was hunted for): Linear's `issue(id:)` root field resolves
 * an ARCHIVED issue with no `includeArchived` flag — unlike `issues(...)`,
 * where archived rows are hidden by default (LESSONS #linear-include-archived).
 * This workspace auto-archives Done issues, so if that assumption is wrong,
 * every completed deferral would read as `exists: false` and the job would
 * exit 1 on the whole ledger. That is the LOUD direction, not a silent pass —
 * but it is still wrong, so if the first run reports Done ids as unresolvable,
 * the fix is to add the archived-inclusive argument here, not to relax the
 * exit code.
 */
const LINEAR_QUERY = 'query($id: String!) { issue(id: $id) { identifier state { name type } } }';

/**
 * Linear issue `state.type` values, split by what they mean for the ledger
 * (round 1 review, P2-3). `completed` clears the debt: the re-review happened.
 * `canceled` does NOT — the re-review was dropped, and a ledger that reads
 * "satisfied" because someone canceled the follow-up is worse than no ledger.
 * Canceled ids get their own summary section and a non-zero exit.
 */
const COMPLETED_STATE_TYPE = 'completed';
const CANCELED_STATE_TYPE = 'canceled';

export interface RepoComment {
  /** The issue or PR number the comment belongs to. */
  issue: number;
  body: string;
  createdAt: string;
  updatedAt: string;
  author?: string;
  authorAssociation?: string;
}

export interface PrView {
  number: number;
  state: string;
  mergedAt: string | null;
  mergeCommit: { oid: string } | null;
  headRefOid: string;
}

export interface DeferralCandidate {
  pr: number;
  head: string;
  id: string;
}

export interface LinearIssueLookup {
  exists: boolean;
  stateName: string | null;
  stateType: string | null;
}

export interface DeferralRow extends DeferralCandidate, LinearIssueLookup {}

export interface ScanCounts {
  comments: number;
  issues: number;
  candidatePrs: number;
  mergedPrs: number;
}

export interface ReconcileResult {
  code: number;
  rows: DeferralRow[];
  output: string;
}

export interface ReconcileDeps {
  listRepoComments: (repo: string, since: string) => RepoComment[];
  viewPr: (repo: string, number: number) => PrView;
  resolveLinearIssue: (id: string, apiKey: string) => Promise<LinearIssueLookup>;
  now?: Date;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Every `Deferred re-review: <ID>` id named in a comment body, in order. */
export function extractDeferredIds(body: string): string[] {
  return [...body.matchAll(DEFERRED_REVIEW_ID)]
    .map(match => match[1])
    .filter((id): id is string => !!id);
}

/** Repo-wide comments bucketed by the issue/PR they belong to, order preserved. */
export function groupCommentsByIssue(comments: readonly RepoComment[]): Map<number, RepoComment[]> {
  const grouped = new Map<number, RepoComment[]>();
  for (const comment of comments) {
    const bucket = grouped.get(comment.issue);
    if (bucket) bucket.push(comment);
    else grouped.set(comment.issue, [comment]);
  }
  return grouped;
}

/**
 * The only issues worth one `gh pr view`: those naming a deferred id in the
 * window at all. Everything else can carry no debt no matter what its gate
 * evidence says, so spending a request on it is pure cost.
 */
export function candidateIssueNumbers(grouped: ReadonlyMap<number, RepoComment[]>): number[] {
  const out: number[] = [];
  for (const [number, comments] of grouped) {
    if (comments.some(comment => extractDeferredIds(comment.body).length > 0)) out.push(number);
  }
  return out.sort((a, b) => a - b);
}

/** True when the `gh pr view` payload describes a pull request that actually merged. */
export function prIsMerged(pr: PrView): boolean {
  return pr.state === 'MERGED' && !!pr.mergedAt;
}

function toGateComment(comment: RepoComment): GateComment {
  return {
    body: comment.body,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    author: comment.author,
    authorAssociation: comment.authorAssociation,
  };
}

/**
 * The deferred ids that actually gated this merge, selected the way
 * `evaluateReviewGate` selects evidence: latest trusted gate line by
 * `updatedAt` among those whose head prefixes the MERGED head, and only when
 * that one line is an accepted `owner` override (round 1 review, P2-2).
 */
export function deferralCandidatesForPr(
  pr: PrView,
  comments: readonly RepoComment[]
): DeferralCandidate[] {
  const head = pr.headRefOid.toLowerCase();
  const forHead = parseGateComments(comments.map(toGateComment))
    .filter(evidence => head.startsWith(evidence.head.toLowerCase()))
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  const latest = forHead.at(-1);
  if (!latest || !overrideAccepted(latest)) return [];
  return extractDeferredIds(latest.body).map(id => ({
    pr: pr.number,
    head: pr.headRefOid.slice(0, 9),
    id,
  }));
}

/** `(pr, id)` pairs collapsed — one override line can name the same id twice. */
export function dedupeCandidates(candidates: readonly DeferralCandidate[]): DeferralCandidate[] {
  const seen = new Set<string>();
  return candidates.filter(candidate => {
    const key = `${candidate.pr}:${candidate.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Default lookback window: 30 days before `now`, as an ISO date (YYYY-MM-DD). */
export function parseSinceFlag(argv: readonly string[], now: Date): string {
  const flagIndex = argv.indexOf('--since');
  const explicit = flagIndex >= 0 ? argv[flagIndex + 1] : undefined;
  if (explicit) return explicit;
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  return thirtyDaysAgo.toISOString().slice(0, 10);
}

function stateType(row: Pick<DeferralRow, 'stateType'>): string {
  return (row.stateType ?? '').toLowerCase();
}

/** True when the re-review is still outstanding — resolved, not done, not canceled. */
export function isOpenDeferral(row: Pick<DeferralRow, 'exists' | 'stateType'>): boolean {
  const type = stateType(row);
  return row.exists && type !== COMPLETED_STATE_TYPE && type !== CANCELED_STATE_TYPE;
}

/**
 * True when the re-review was DROPPED: the issue exists and is Canceled, so
 * nobody is going to do it, and nothing else in the system would ever say so.
 */
export function isDroppedDeferral(row: Pick<DeferralRow, 'exists' | 'stateType'>): boolean {
  return row.exists && stateType(row) === CANCELED_STATE_TYPE;
}

export function formatTable(rows: readonly DeferralRow[]): string {
  if (rows.length === 0) return 'deferred-reviews: no deferred re-reviews recorded in the window';
  const header = ['PR', 'head', 'deferred id', 'exists?', 'state'];
  const lines = rows.map(row => [
    `#${row.pr}`,
    row.head,
    row.id,
    row.exists ? 'yes' : 'NO',
    row.exists ? (row.stateName ?? 'unknown') : '-',
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...lines.map(line => line[i]!.length)));
  const fmt = (cols: readonly string[]) => cols.map((c, i) => c.padEnd(widths[i]!)).join('  ');
  return [fmt(header), fmt(widths.map(w => '-'.repeat(w))), ...lines.map(fmt)].join('\n');
}

/**
 * The `$GITHUB_STEP_SUMMARY` body: every OPEN deferral, then every DROPPED
 * (canceled) one in its own section, so neither kind of debt is invisible.
 */
export function summaryMarkdown(rows: readonly DeferralRow[]): string {
  const open = rows.filter(isOpenDeferral);
  const dropped = rows.filter(isDroppedDeferral);
  const lines = ['## Open deferred re-reviews', ''];
  if (open.length === 0) {
    lines.push(
      'None — every deferred re-review named in the window is closed out, or none were recorded.'
    );
  } else {
    lines.push('| PR | head | issue | state |', '| --- | --- | --- | --- |');
    for (const row of open) {
      lines.push(`| #${row.pr} | ${row.head} | ${row.id} | ${row.stateName ?? 'unknown'} |`);
    }
  }
  lines.push('', '## Dropped deferrals (Canceled — NOT cleared)', '');
  if (dropped.length === 0) {
    lines.push('None.');
  } else {
    lines.push(
      'These re-reviews were promised at merge time and then canceled. The scrutiny never happened.',
      '',
      '| PR | head | issue | state |',
      '| --- | --- | --- | --- |'
    );
    for (const row of dropped) {
      lines.push(`| #${row.pr} | ${row.head} | ${row.id} | ${row.stateName ?? 'unknown'} |`);
    }
  }
  return `${lines.join('\n')}\n`;
}

/**
 * The reconciliation itself, over injected boundaries — `deps` is the whole
 * network surface (gh CLI reads, Linear API reads), so this is unit-testable
 * with stubbed responses and no process spawned.
 *
 * Exit codes: 2 when the check could not run at all (missing REPO/API key, gh
 * failure, a truncation-suspect comment listing, Linear unreachable or
 * erroring) — loud and non-zero, never a silent pass on outage. 1 when every
 * lookup succeeded but at least one id did not resolve, or resolved to a
 * CANCELED issue — in both cases the ledger points at scrutiny that never
 * happened. 0 when every id resolves and none was dropped.
 */
export async function reconcile(
  env: NodeJS.ProcessEnv,
  argv: readonly string[],
  deps: ReconcileDeps
): Promise<ReconcileResult> {
  const repo = env.REPO;
  if (!repo) {
    return { code: 2, rows: [], output: 'deferred-reviews: REPO is required (e.g. owner/name)' };
  }
  const apiKey = env.LINEAR_API_KEY;
  if (!apiKey) {
    return {
      code: 2,
      rows: [],
      output:
        'deferred-reviews: LINEAR_API_KEY is not set — refusing to reconcile rather than silently passing every id',
    };
  }

  const since = parseSinceFlag(argv, deps.now ?? new Date());

  let comments: RepoComment[];
  try {
    comments = deps.listRepoComments(repo, since);
  } catch (error) {
    return {
      code: 2,
      rows: [],
      output: `deferred-reviews: could not list repo comments since ${since} — ${message(error)}`,
    };
  }

  const grouped = groupCommentsByIssue(comments);
  const candidateNumbers = candidateIssueNumbers(grouped);
  const counts: ScanCounts = {
    comments: comments.length,
    issues: grouped.size,
    candidatePrs: candidateNumbers.length,
    mergedPrs: 0,
  };

  const candidates: DeferralCandidate[] = [];
  for (const number of candidateNumbers) {
    let pr: PrView;
    try {
      pr = deps.viewPr(repo, number);
    } catch (error) {
      return {
        code: 2,
        rows: [],
        output: `deferred-reviews: could not read PR #${number} — ${message(error)}`,
      };
    }
    // An issue (not a PR), an open PR, or a closed-unmerged PR carries no
    // merge-time debt: nothing was let through on the strength of a deferral.
    if (!prIsMerged(pr)) continue;
    counts.mergedPrs++;
    candidates.push(...deferralCandidatesForPr(pr, grouped.get(number) ?? []));
  }

  const rows: DeferralRow[] = [];
  for (const candidate of dedupeCandidates(candidates)) {
    let lookup: LinearIssueLookup;
    try {
      lookup = await deps.resolveLinearIssue(candidate.id, apiKey);
    } catch (error) {
      return {
        code: 2,
        rows: [],
        output: `deferred-reviews: Linear API unreachable resolving ${candidate.id} (PR #${candidate.pr}) — ${message(error)}`,
      };
    }
    rows.push({ ...candidate, ...lookup });
  }

  const unresolved = rows.filter(row => !row.exists);
  const dropped = rows.filter(isDroppedDeferral);
  const scanned =
    `deferred-reviews: scanned ${counts.comments} comment(s) across ${counts.issues} issue(s) since ${since}; ` +
    `${counts.candidatePrs} named a deferred id, ${counts.mergedPrs} of those are merged PRs`;
  let output = `${scanned}\n\n${formatTable(rows)}`;
  if (unresolved.length > 0) {
    output += `\n\ndeferred-reviews: ${unresolved.length} unresolvable id(s) — ${unresolved
      .map(row => `${row.id} (PR #${row.pr})`)
      .join(', ')}`;
  }
  if (dropped.length > 0) {
    output += `\n\ndeferred-reviews: ${dropped.length} dropped deferral(s) — canceled without the re-review, NOT cleared — ${dropped
      .map(row => `${row.id} (PR #${row.pr})`)
      .join(', ')}`;
  }

  if (env.GITHUB_STEP_SUMMARY) {
    appendFileSync(env.GITHUB_STEP_SUMMARY, summaryMarkdown(rows));
  }

  return { code: unresolved.length > 0 || dropped.length > 0 ? 1 : 0, rows, output };
}

// --- Real boundaries (gh CLI, Linear API) — swapped out in tests via `reconcile`'s `deps`. ---

/**
 * `maxBuffer` INHERITANCE: `execFileSync` defaults to a 1 MiB buffer, and
 * overflowing it throws (`ENOBUFS` / "maxBuffer length exceeded") rather than
 * returning a short read — loud, which is what we want, but fatal. The
 * repo-wide `--paginate --slurp` comment listing is 7.0 MB for a 30-day window
 * today and grows with repo traffic, so that ONE call passes an explicit
 * `maxBuffer` below; every other call here returns a few KB and deliberately
 * inherits the 1 MiB default. Passing `undefined` is the same as not passing
 * the option at all, so the default still applies to those calls. Either way
 * `reconcile` turns the throw into exit 2, never a truncated success.
 */
function gh(args: string[], maxBuffer?: number): string {
  return execFileSync('gh', args, { encoding: 'utf8', maxBuffer });
}

/** 64 MiB — comfortably above the 7.0 MB a 30-day comment window produces today. */
const COMMENT_MAX_BUFFER = 64 * 1024 * 1024;

/** REST shape for `GET /repos/{owner}/{repo}/issues/comments`. */
interface RestComment {
  body: string;
  created_at: string;
  updated_at: string;
  author_association?: string;
  user?: { login: string };
  issue_url: string;
}

/**
 * Sanity bound on the repo-wide listing. `gh api --paginate` follows `Link`
 * headers, so unlike `gh pr list --limit` it does not truncate — but an
 * unbounded walk of a runaway window would blow the job's `timeout-minutes`
 * and look like a hang. Hitting the cap is treated as a FAILURE (exit 2), not
 * a shortened result, because a capped listing cannot be distinguished from a
 * complete one. 30 days = 15 pages / 1,436 comments on 2026-09-15.
 */
export const COMMENT_PAGE_CAP = 200;

export function parseRepoComments(slurped: string): RepoComment[] {
  const pages = JSON.parse(slurped) as RestComment[][];
  if (pages.length >= COMMENT_PAGE_CAP) {
    throw new Error(
      `repo comment listing reached ${pages.length} pages, the sanity cap (${COMMENT_PAGE_CAP}) — the window is too wide to walk safely; narrow --since or raise COMMENT_PAGE_CAP deliberately`
    );
  }
  return flattenPages<RestComment>(slurped).map(comment => ({
    issue: Number(comment.issue_url.split('/').pop()),
    body: comment.body,
    createdAt: comment.created_at,
    updatedAt: comment.updated_at,
    author: comment.user?.login,
    authorAssociation: comment.author_association,
  }));
}

function listRepoComments(repo: string, since: string): RepoComment[] {
  return parseRepoComments(
    gh(
      [
        'api',
        '--paginate',
        '--slurp',
        `repos/${repo}/issues/comments?since=${since}T00:00:00Z&per_page=100`,
      ],
      COMMENT_MAX_BUFFER
    )
  );
}

function viewPr(repo: string, number: number): PrView {
  const raw = gh([
    'pr',
    'view',
    String(number),
    '--repo',
    repo,
    '--json',
    'number,state,mergedAt,mergeCommit,headRefOid',
  ]);
  return JSON.parse(raw) as PrView;
}

interface LinearError {
  message?: string;
  extensions?: { type?: string; code?: string; userPresentableMessage?: string };
}

/**
 * Linear reports an unresolvable id as a GraphQL error, not an HTTP one —
 * `response.ok` is true either way. Only a NOT-FOUND error means "this id does
 * not exist"; an auth failure, a rate limit or a schema error means the check
 * DID NOT RUN, and the first cut read all three as `exists: false`, i.e. it
 * would have reported the whole ledger as broken during a Linear incident
 * (round 1 review, P3). Anything that is not recognisably not-found now throws
 * and becomes exit 2.
 */
export function errorIsNotFound(errors: readonly LinearError[]): boolean {
  return errors.every(error => {
    const signal = `${error.extensions?.type ?? ''} ${error.extensions?.code ?? ''}`.toLowerCase();
    return /not[\s_-]?found/.test(signal);
  });
}

export async function resolveLinearIssue(
  id: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch
): Promise<LinearIssueLookup> {
  const response = await fetchImpl(LINEAR_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: apiKey },
    body: JSON.stringify({ query: LINEAR_QUERY, variables: { id } }),
  });
  if (!response.ok) {
    throw new Error(`Linear API returned HTTP ${response.status}`);
  }
  const payload = (await response.json()) as {
    data?: { issue: { identifier: string; state?: { name: string; type: string } } | null };
    errors?: LinearError[];
  };
  if (payload.errors && payload.errors.length > 0) {
    if (!errorIsNotFound(payload.errors)) {
      throw new Error(
        `Linear GraphQL error resolving ${id}: ${payload.errors.map(e => e.message ?? 'unknown').join('; ')}`
      );
    }
    return { exists: false, stateName: null, stateType: null };
  }
  const issue = payload.data?.issue ?? null;
  if (!issue) return { exists: false, stateName: null, stateType: null };
  return {
    exists: true,
    stateName: issue.state?.name ?? null,
    stateType: issue.state?.type ?? null,
  };
}

export async function runCli(
  env: NodeJS.ProcessEnv = process.env,
  argv: readonly string[] = process.argv.slice(2)
): Promise<number> {
  const result = await reconcile(env, argv, {
    listRepoComments,
    viewPr,
    resolveLinearIssue: (id, apiKey) => resolveLinearIssue(id, apiKey),
    now: new Date(),
  });
  console.log(result.output);
  return result.code;
}

/**
 * Offline known-answer check: no `gh`/Linear calls, so it runs in CI and in a
 * mutated copy alike. Exists because a self-check that reports its own bugs as
 * good news is worse than none (LESSONS #measurement-harness) - this proves
 * the branches this script exists to add: an unresolvable deferred id and a
 * CANCELED one must each fail the exit code, a superseded override must not
 * count as debt, and a truncation-suspect listing must fail loud.
 */
async function selfTest(): Promise<number> {
  const mergedHead = 'deadbeef0011223344556677889900aabbccddee';
  const gateLine = (head: string, id: string) =>
    [
      `Review gate: owner reviewed abc1234..${head} - override, floor was independent`,
      'Override reason: Codex unavailable - usage limit',
      `Deferred re-review: ${id}`,
    ].join('\n');
  const comment = (issue: number, head: string, id: string, updatedAt: string): RepoComment => ({
    issue,
    body: gateLine(head, id),
    createdAt: updatedAt,
    updatedAt,
    author: 'rbeezley',
    authorAssociation: 'OWNER',
  });
  const mergedPr = (number: number): PrView => ({
    number,
    state: 'MERGED',
    mergedAt: '2026-01-01T00:00:00Z',
    mergeCommit: { oid: 'ffffffff' },
    headRefOid: mergedHead,
  });

  let failures = 0;
  const check = (label: string, ok: boolean): void => {
    console.log(`self-test [${label}]: ${ok ? 'pass' : 'FAIL'}`);
    if (!ok) failures++;
  };
  const baseEnv = { REPO: 'self-test/self-test', LINEAR_API_KEY: 'self-test-key' };
  const now = new Date('2026-01-02T00:00:00Z');

  const unresolvable = await reconcile(baseEnv, [], {
    listRepoComments: () => [comment(9999, 'deadbeef0', 'MYK9-000000', '2026-01-01T00:00:00Z')],
    viewPr: (_repo, number) => mergedPr(number),
    resolveLinearIssue: async () => ({ exists: false, stateName: null, stateType: null }),
    now,
  });
  check('unresolvable id fails the exit code', unresolvable.code === 1);
  check('unresolvable id is named in the output', unresolvable.output.includes('MYK9-000000'));

  const canceled = await reconcile(baseEnv, [], {
    listRepoComments: () => [comment(9999, 'deadbeef0', 'MYK9-000001', '2026-01-01T00:00:00Z')],
    viewPr: (_repo, number) => mergedPr(number),
    resolveLinearIssue: async () => ({
      exists: true,
      stateName: 'Canceled',
      stateType: 'canceled',
    }),
    now,
  });
  check('a canceled deferral is NOT cleared', canceled.code === 1);
  check('the canceled id is named in the output', canceled.output.includes('MYK9-000001'));

  const superseded = await reconcile(baseEnv, [], {
    listRepoComments: () => [
      comment(9999, 'deadbeef0', 'MYK9-000002', '2026-01-01T00:00:00Z'),
      comment(9999, 'deadbeef0', 'MYK9-000003', '2026-01-01T01:00:00Z'),
    ],
    viewPr: (_repo, number) => mergedPr(number),
    resolveLinearIssue: async () => ({ exists: true, stateName: 'Done', stateType: 'completed' }),
    now,
  });
  check(
    'only the latest override for the head carries debt',
    superseded.rows.length === 1 && superseded.rows[0]?.id === 'MYK9-000003'
  );

  // The cap branch itself, not a stub standing in for it: a page count AT the
  // sanity cap must throw, and `reconcile` must turn that into exit 2.
  let capThrew = false;
  try {
    parseRepoComments(JSON.stringify(Array.from({ length: COMMENT_PAGE_CAP }, () => [])));
  } catch {
    capThrew = true;
  }
  check('a page count at the sanity cap throws', capThrew);

  const truncated = await reconcile(baseEnv, [], {
    listRepoComments: () =>
      parseRepoComments(JSON.stringify(Array.from({ length: COMMENT_PAGE_CAP }, () => []))),
    viewPr: (_repo, number) => mergedPr(number),
    resolveLinearIssue: async () => ({ exists: true, stateName: 'Done', stateType: 'completed' }),
    now,
  });
  check('a truncation-suspect listing fails loud (exit 2)', truncated.code === 2);

  console.log(failures === 0 ? 'self-test PASS' : `self-test ${failures} FAIL(s)`);
  return failures === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--self-test')) {
    selfTest().then(code => process.exit(code));
  } else {
    runCli().then(code => {
      process.exitCode = code;
    });
  }
}
