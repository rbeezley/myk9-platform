/**
 * Stall deadlines for a cloud session (MYK9-1602). A cloud session cannot be messaged and
 * never reports that it stalled, so only a deadline can catch one: on 2026-10-31 a fix session
 * pushed nothing for over two hours before anyone noticed.
 *
 * `decide` is the pure rule (observed state + now -> wait | ok | stall); `check` gathers the
 * state with `gh` and applies it. `watch-cloud-session.sh` is the polling loop around `check`.
 */
import { execFileSync } from 'node:child_process';

/** Exit codes shared with watch-cloud-session.sh; documented in its header. */
export const EXIT = {
  OK: 0,
  USAGE: 2,
  GH_UNREACHABLE: 3,
  NO_PUSH: 10,
  NO_READY_PR: 11,
  QUIET_AFTER_FINDINGS: 12,
  /** Internal to the loop, never a process exit of the .sh. */
  WAIT: 20,
} as const;

export type Mode = 'first' | 'fix';

export type Thresholds = { noPushS: number; noPrS: number; quietS: number };
export const DEFAULT_THRESHOLDS: Thresholds = { noPushS: 30 * 60, noPrS: 60 * 60, quietS: 10 * 60 };

export type GateComment = { body: string; createdAt: number; authorAssociation: string };
export type Observation = {
  mode: Mode;
  /** Seconds since epoch. */
  dispatchedAt: number;
  now: number;
  /** A `claude/myk9-<n>-*` branch exists, or a matching PR does. */
  branchExists: boolean;
  /** A non-draft open PR matching the issue exists. */
  readyPr: boolean;
  /** Committed date of the PR head, seconds; null when there is no PR. Fallback only. */
  headCommitAt: number | null;
  /** The PR head commit SHA; null when there is no PR. */
  headSha: string | null;
  /** The PR's comments, any order; `decide` picks the review ones. */
  gateComments: GateComment[];
  /** The session's branch: the matching PR's head, else the first pushed `claude/myk9-<n>-*`. */
  branch?: string | null;
};
export type Decision =
  | { kind: 'wait' }
  | { kind: 'ok'; reason: string }
  | { kind: 'stall'; code: number; reason: string };

/** Clean verdict grammars, mirrored from VERDICT_BY_TIER in scripts/qa/review-gate.ts. */
const CLEAN_VERDICT = [
  /^(no findings|\d+ findings?, all (addressed|fixed))\.?$/i,
  /^(?:[2-9]|[1-9]\d+) (?:lens|lenses), all findings addressed\.?$/i,
  /^low-risk paths, CI green\.?$/i,
  /^override, floor was (independent|adversarial)\.?$/i,
];
/** REVIEW_GATE_LINE from review-gate.ts: the first line of the comment. */
const GATE_LINE =
  /^Review gate: (?:independent\/codex|independent\/claude|codex|claude|adversarial|owner|none) reviewed [0-9a-f]{7,40}\.\.[0-9a-f]{7,40}\s+[—–-]\s+(.+?)\s*$/;

const TRUSTED = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);
/** The reviewers' own findings comment, as posted by codex-review.sh / claude-review.sh. */
const FINDINGS_COMMENT = /^(?:Codex|Claude) findings for ([0-9a-f]{7,40})\b/;
const RANGE_HEAD = /reviewed [0-9a-f]{7,40}\.\.([0-9a-f]{7,40})\b/;

export type Classified = { kind: 'findings' | 'clean'; reviewedHead: string | null };

/**
 * What a PR comment says about the review, from a trusted author only (an outsider's comment on
 * this public repo must never start or stop a clock; mirrors codex-review.sh's ANCHOR_JQ).
 * - `Codex findings for <sha>` / `Claude findings for <sha>`: the normal findings form, `findings`.
 * - A first-line `Review gate:` whose verdict is not a clean grammar (a withdrawal): `findings`.
 * - A first-line `Review gate:` with a clean verdict, including "N findings, all addressed": `clean`.
 * - Anything else: null.
 * `reviewedHead` is the SHA the comment names (a prefix for findings comments).
 */
export function classifyComment(body: string, authorAssociation: string): Classified | null {
  if (!TRUSTED.has(authorAssociation.toUpperCase())) return null;
  const firstLine = body.split(/\r?\n/, 1)[0] ?? '';
  const found = FINDINGS_COMMENT.exec(firstLine);
  if (found) return { kind: 'findings', reviewedHead: found[1] ?? null };
  const match = GATE_LINE.exec(firstLine);
  if (!match?.[1]) return null;
  return {
    kind: CLEAN_VERDICT.some(re => re.test(match[1]!)) ? 'clean' : 'findings',
    reviewedHead: RANGE_HEAD.exec(firstLine)?.[1] ?? null,
  };
}

export function decide(o: Observation, t: Thresholds = DEFAULT_THRESHOLDS): Decision {
  const age = o.now - o.dispatchedAt;
  if (o.mode === 'first') {
    if (o.readyPr) return { kind: 'ok', reason: 'a ready PR is open' };
    if (!o.branchExists) {
      return age >= t.noPushS
        ? {
            kind: 'stall',
            code: EXIT.NO_PUSH,
            reason: `no branch pushed ${Math.floor(age / 60)} min after dispatch`,
          }
        : { kind: 'wait' };
    }
    return age >= t.noPrS
      ? {
          kind: 'stall',
          code: EXIT.NO_READY_PR,
          reason: `branch pushed but no ready PR ${Math.floor(age / 60)} min after dispatch`,
        }
      : { kind: 'wait' };
  }
  // fix mode: the latest review comment decides.
  const latest = o.gateComments
    .map(c => ({ at: c.createdAt, c: classifyComment(c.body, c.authorAssociation) }))
    .filter(x => x.c !== null)
    .sort((a, b) => b.at - a.at)[0];
  if (latest?.c?.kind === 'clean') return { kind: 'ok', reason: 'the latest review gate is clean' };
  // The clock starts at the findings (quiet 10 min after findings means act), or at the dispatch
  // when no findings comment is visible. Findings that were never posted are not this watcher's
  // job: the session cannot see them, so the orchestrator fixes them locally at once.
  const clockStart = latest ? latest.at : o.dispatchedAt;
  const reviewedHead = latest?.c?.reviewedHead ?? null;
  // Delivery is a head that is no longer the one reviewed. Commit dates are the fallback only
  // when the comment names no head: the committer's clock can predate the comment.
  const moved =
    reviewedHead !== null && o.headSha !== null
      ? !o.headSha.startsWith(reviewedHead)
      : o.headCommitAt !== null && o.headCommitAt > clockStart;
  if (moved) return { kind: 'ok', reason: 'a new head landed after the findings' };
  return o.now - clockStart >= t.quietS
    ? {
        kind: 'stall',
        code: EXIT.QUIET_AFTER_FINDINGS,
        reason: `branch quiet ${Math.floor((o.now - clockStart) / 60)} min after findings`,
      }
    : { kind: 'wait' };
}

type Pr = {
  number: number;
  isDraft: boolean;
  headRefName: string;
  headRefOid?: string;
  body: string | null;
};

/** The lane reference's rule: the prefix, or any `claude/` branch whose body says `Fixes MYK9-<n>`. */
export function matchingPrs(prs: Pr[], issue: string): Pr[] {
  const prefix = `claude/myk9-${issue}-`;
  const fixes = new RegExp(`Fixes MYK9-${issue}\\b`);
  return prs.filter(
    p =>
      p.headRefName.startsWith(prefix) ||
      (p.headRefName.startsWith('claude/') && fixes.test(p.body ?? ''))
  );
}

export class GhError extends Error {}

type Gh = (args: string[]) => string;
const realGh: Gh = args => {
  try {
    return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    throw new GhError(`gh ${args.slice(0, 2).join(' ')} failed: ${(e as Error).message}`);
  }
};

function parseJson<T>(text: string, what: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new GhError(`gh ${what} returned unparseable output`);
  }
}

export function observe(
  issue: string,
  mode: Mode,
  dispatchedAt: number,
  now: number,
  gh: Gh = realGh
): Observation {
  const prs = matchingPrs(
    parseJson<Pr[]>(
      gh([
        'pr',
        'list',
        '--state',
        'open',
        '--limit',
        '100',
        '--json',
        'number,isDraft,headRefName,headRefOid,body',
      ]),
      'pr list'
    ),
    issue
  );
  const refs = parseJson<{ ref?: string }[]>(
    gh(['api', `repos/{owner}/{repo}/git/matching-refs/heads/claude/myk9-${issue}-`]),
    'api matching-refs'
  );
  const ready = prs.filter(p => !p.isDraft);
  let headCommitAt: number | null = null;
  let gateComments: GateComment[] = [];
  const pr = ready[0] ?? prs[0];
  // First mode needs only the PR list; reading comments there could only turn a delivered PR into
  // a gh failure.
  if (pr && mode === 'fix') {
    const view = parseJson<{
      comments: { body: string; createdAt: string; authorAssociation: string }[];
      commits: { committedDate: string }[];
    }>(gh(['pr', 'view', String(pr.number), '--json', 'comments,commits']), 'pr view');
    const last = view.commits[view.commits.length - 1];
    headCommitAt = last ? Date.parse(last.committedDate) / 1000 : null;
    gateComments = view.comments.map(c => ({
      body: c.body,
      createdAt: Date.parse(c.createdAt) / 1000,
      authorAssociation: c.authorAssociation,
    }));
  }
  return {
    mode,
    dispatchedAt,
    now,
    branchExists: refs.length > 0 || prs.length > 0,
    readyPr: ready.length > 0,
    headCommitAt,
    headSha: pr?.headRefOid ?? null,
    gateComments,
    branch: pr?.headRefName ?? refs[0]?.ref?.replace(/^refs\/heads\//, '') ?? null,
  };
}

export function parseTime(text: string): number | null {
  if (/^\d{9,11}$/.test(text)) return Number(text);
  const ms = Date.parse(text);
  return Number.isNaN(ms) ? null : ms / 1000;
}

function envSeconds(name: string, fallback: number): number {
  const v = process.env[name];
  return v && /^\d+$/.test(v) ? Number(v) : fallback;
}

/** One observation and decision; returns the process exit code (EXIT.WAIT = keep polling). */
export function check(argv: string[], gh: Gh = realGh): number {
  const [issue, mode, dispatched] = argv;
  const at = dispatched ? parseTime(dispatched) : null;
  if (!issue || !/^\d+$/.test(issue) || (mode !== 'first' && mode !== 'fix') || at === null) {
    console.error(
      'usage: watch-cloud-session.sh <issue-number> <first|fix> <dispatched-at epoch|ISO>'
    );
    return EXIT.USAGE;
  }
  const now = envSeconds('WATCH_NOW_S', Math.floor(Date.now() / 1000));
  const thresholds: Thresholds = {
    noPushS: envSeconds('WATCH_NO_PUSH_S', DEFAULT_THRESHOLDS.noPushS),
    noPrS: envSeconds('WATCH_NO_PR_S', DEFAULT_THRESHOLDS.noPrS),
    quietS: envSeconds('WATCH_QUIET_S', DEFAULT_THRESHOLDS.quietS),
  };
  let decision: Decision;
  let observed: Observation;
  try {
    observed = observe(issue, mode, at, now, gh);
    decision = decide(observed, thresholds);
  } catch (e) {
    if (!(e instanceof GhError)) throw e;
    console.error(`watch-cloud-session: ${e.message} (this is not a stall verdict)`);
    return EXIT.GH_UNREACHABLE;
  }
  if (decision.kind === 'wait') return EXIT.WAIT;
  // The takeover needs the branch the session pushed (exit 11 has one, exit 10 none).
  if (observed.branch) console.log(`WATCH_BRANCH=${observed.branch}`);
  if (decision.kind === 'ok') {
    console.log(`WATCH_OK=${decision.reason}`);
    return EXIT.OK;
  }
  console.log(`WATCH_STALL=${decision.reason}`);
  return decision.code;
}

if (process.argv[1]?.endsWith('watch-cloud-session.ts')) {
  process.exit(check(process.argv.slice(2)));
}
