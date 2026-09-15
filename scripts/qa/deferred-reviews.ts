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
 * Scope: this only reconciles ids named in an ACCEPTED `owner`-tier override
 * comment (`overrideAccepted`) on a MERGED pull request — a rejected or
 * superseded comment carries no debt. A PR can carry more than one such
 * comment if the override was re-posted after a push; every one found is
 * reconciled (deduplicated by id), because a superseded comment's named debt
 * is still real debt even though it stopped gating anything.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { flattenPages, overrideAccepted, parseGateComments, type GateComment } from './review-gate.ts';

/**
 * `DEFERRED_REVIEW`'s canonical shape check lives in `review-gate.ts` (search
 * that file for `const DEFERRED_REVIEW`) — that copy only proves a line of
 * this shape exists in the body. This copy captures the id itself, which the
 * canonical regex has no reason to do, so it is not exported and is
 * re-declared here rather than imported.
 */
const DEFERRED_REVIEW_ID = /^Deferred re-review: ([A-Z][A-Z0-9]*-\d+)$/gm;

export const LINEAR_ENDPOINT = 'https://api.linear.app/graphql';
const LINEAR_QUERY = 'query($id: String!) { issue(id: $id) { identifier state { name type } } }';

/** Linear issue `state.type` values that count as the debt being cleared. */
const CLOSED_STATE_TYPES = new Set(['completed', 'canceled']);

export interface MergedPr {
  number: number;
  headRefOid: string;
  mergedAt: string;
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

export interface ReconcileResult {
  code: number;
  rows: DeferralRow[];
  output: string;
}

export interface ReconcileDeps {
  listMergedPrs: (repo: string, since: string) => MergedPr[];
  commentsForPr: (repo: string, number: number) => GateComment[];
  resolveLinearIssue: (id: string, apiKey: string) => Promise<LinearIssueLookup>;
  now?: Date;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Every `Deferred re-review: <ID>` id named in a comment body, in order. */
export function extractDeferredIds(body: string): string[] {
  return [...body.matchAll(DEFERRED_REVIEW_ID)].map(match => match[1]).filter((id): id is string => !!id);
}

/**
 * Every deferred id an ACCEPTED `owner` override names on one PR. Not scoped
 * to the PR's final head — see the file header on why a superseded comment's
 * debt still counts.
 */
export function deferralCandidatesForPr(
  pr: MergedPr,
  comments: readonly GateComment[]
): DeferralCandidate[] {
  const out: DeferralCandidate[] = [];
  for (const evidence of parseGateComments(comments)) {
    if (!overrideAccepted(evidence)) continue;
    for (const id of extractDeferredIds(evidence.body)) {
      out.push({ pr: pr.number, head: pr.headRefOid.slice(0, 9), id });
    }
  }
  return out;
}

/** `(pr, id)` pairs collapsed — a re-posted override can repeat the same id. */
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

/** True when a resolved issue's debt is still outstanding (not Done/Canceled). */
export function isOpenDeferral(row: Pick<DeferralRow, 'exists' | 'stateType'>): boolean {
  return row.exists && !CLOSED_STATE_TYPES.has((row.stateType ?? '').toLowerCase());
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

/** The `$GITHUB_STEP_SUMMARY` body: every OPEN deferral, so the debt is visible. */
export function summaryMarkdown(rows: readonly DeferralRow[]): string {
  const open = rows.filter(isOpenDeferral);
  const lines = ['## Open deferred re-reviews', ''];
  if (open.length === 0) {
    lines.push('None — every deferred re-review named in the window is Done, Canceled, or none were recorded.');
  } else {
    lines.push('| PR | head | issue | state |', '| --- | --- | --- | --- |');
    for (const row of open) {
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
 * failure, Linear unreachable) — loud and non-zero, never a silent pass on
 * outage. 1 when every lookup succeeded but at least one id did not resolve —
 * the ledger points at nothing, which is the defect this script exists to
 * catch. 0 when every id resolves (open or closed).
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

  let prs: MergedPr[];
  try {
    prs = deps.listMergedPrs(repo, since);
  } catch (error) {
    return { code: 2, rows: [], output: `deferred-reviews: could not list merged PRs — ${message(error)}` };
  }

  const candidates: DeferralCandidate[] = [];
  for (const pr of prs) {
    let comments: GateComment[];
    try {
      comments = deps.commentsForPr(repo, pr.number);
    } catch (error) {
      return {
        code: 2,
        rows: [],
        output: `deferred-reviews: could not read comments on #${pr.number} — ${message(error)}`,
      };
    }
    candidates.push(...deferralCandidatesForPr(pr, comments));
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
  let output = formatTable(rows);
  if (unresolved.length > 0) {
    output += `\n\ndeferred-reviews: ${unresolved.length} unresolvable id(s) — ${unresolved
      .map(row => `${row.id} (PR #${row.pr})`)
      .join(', ')}`;
  }

  if (env.GITHUB_STEP_SUMMARY) {
    appendFileSync(env.GITHUB_STEP_SUMMARY, summaryMarkdown(rows));
  }

  return { code: unresolved.length > 0 ? 1 : 0, rows, output };
}

// --- Real boundaries (gh CLI, Linear API) — swapped out in tests via `reconcile`'s `deps`. ---

function gh(args: string[]): string {
  return execFileSync('gh', args, { encoding: 'utf8' });
}

/** REST shape — matches review-gate.ts's own `RestComment` (not exported there). */
interface RestComment {
  body: string;
  created_at: string;
  updated_at: string;
  author_association?: string;
  user?: { login: string };
}

function listMergedPrs(repo: string, since: string): MergedPr[] {
  const raw = gh([
    'pr',
    'list',
    '--repo',
    repo,
    '--state',
    'merged',
    '--search',
    `merged:>=${since}`,
    '--json',
    'number,headRefOid,mergedAt',
    '--limit',
    '200',
  ]);
  return JSON.parse(raw) as MergedPr[];
}

function commentsForPr(repo: string, number: number): GateComment[] {
  const comments = flattenPages<RestComment>(
    gh(['api', '--paginate', '--slurp', `repos/${repo}/issues/${number}/comments?per_page=100`])
  );
  return comments.map(c => ({
    body: c.body,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
    author: c.user?.login,
    authorAssociation: c.author_association,
  }));
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
    errors?: Array<{ message: string }>;
  };
  // Linear reports an unresolvable id as a GraphQL error ("Entity not found"),
  // not an HTTP error — response.ok is true either way.
  if (payload.errors && payload.errors.length > 0) {
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
    listMergedPrs,
    commentsForPr,
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
 * the one branch this script exists to add: an unresolvable deferred id must
 * fail the exit code, not pass silently.
 */
async function selfTest(): Promise<number> {
  const fixturePr: MergedPr = { number: 9999, headRefOid: 'deadbeef0011', mergedAt: '2026-01-01' };
  const comment: GateComment = {
    body: [
      'Review gate: owner reviewed abc1234..deadbeef0 - override, floor was independent',
      'Override reason: Codex unavailable - usage limit',
      'Deferred re-review: MYK9-000000',
    ].join('\n'),
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    author: 'rbeezley',
    authorAssociation: 'OWNER',
  };

  const result = await reconcile(
    { REPO: 'self-test/self-test', LINEAR_API_KEY: 'self-test-key' },
    [],
    {
      listMergedPrs: () => [fixturePr],
      commentsForPr: () => [comment],
      resolveLinearIssue: async () => ({ exists: false, stateName: null, stateType: null }),
      now: new Date('2026-01-02T00:00:00Z'),
    }
  );

  let failures = 0;
  const check = (label: string, ok: boolean): void => {
    console.log(`self-test [${label}]: ${ok ? 'pass' : 'FAIL'}`);
    if (!ok) failures++;
  };
  check('unresolvable id fails the exit code', result.code === 1);
  check('unresolvable id is named in the output', result.output.includes('MYK9-000000'));

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
