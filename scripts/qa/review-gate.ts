/**
 * Review gate — a commit status on a PR's head that is green ONLY when
 * accepted review evidence has been recorded against THAT SHA.
 *
 * Why a status, and why pinned to the SHA: on 2026-09-05 PR #2040 was
 * squash-merged while its Codex review was still running; the review then
 * returned two real P2 findings, both already on `main`. Nothing was red —
 * every CI check passed and `codex review` exits 0 whether it found defects,
 * was interrupted by a usage limit, or never ran. "The review must happen"
 * had quietly become "the review must happen at some point". The evidence
 * the shipping skill records is a PR comment of the form
 *
 *   Review gate: codex reviewed 0a2020c7a..5af9af158 — no findings
 *
 * and this script turns that into a `Review gate` status on the head commit.
 * The documented human-fallback evidence is deliberately more constrained than
 * a normal reviewer verdict: it requires a trusted owner/member, two named
 * adversarial subagent lenses, and passing required checks.
 * A push after the review moves the head, the recorded SHA no longer matches,
 * and the status goes red until a review is recorded for the new head. That
 * is the whole point: a review of an earlier head is an audit, not a gate.
 *
 * Deliberate limits: the comment is written by the agent that ran the review,
 * so this proves a review was CLAIMED for this SHA, not that its log was read.
 * It closes the "merged before the review finished" and "reviewed an older
 * head" holes, which are the two that have actually fired. Only a comment
 * whose FIRST line is the evidence line counts — a quoted, indented or
 * mid-comment copy of the format is not evidence, because prose about code
 * satisfies a text scan. And the verdict must match the documented grammar
 * exactly: substring tests accepted "2 findings, not all addressed" and
 * "no findings yet; review still running" as green (Codex review of #2058).
 * The repo is public, so evidence counts only from an OWNER, MEMBER or
 * COLLABORATOR — anyone can comment on a public PR, and the workflow that
 * reads these comments publishes a status with a write-capable token.
 */
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { meetsFloor, requiredTier, type Tier } from './review-tier.ts';

export const REVIEW_GATE_CONTEXT = 'Review gate';

export interface GateComment {
  body: string;
  createdAt: string;
  /** Last edit time; an edited older comment must outrank a newer unedited one. */
  updatedAt?: string;
  author?: string;
  /** GitHub's author_association for the comment; only trusted values count. */
  authorAssociation?: string;
}

/** Associations whose comments may carry evidence. CONTRIBUTOR and NONE cannot. */
export const TRUSTED_ASSOCIATIONS: ReadonlySet<string> = new Set([
  'OWNER',
  'MEMBER',
  'COLLABORATOR',
]);

/** Only repository owners or members may authorize a degraded review path. */
export const HUMAN_FALLBACK_ASSOCIATIONS: ReadonlySet<string> = new Set(['OWNER', 'MEMBER']);

export function commentTrusted(comment: GateComment): boolean {
  return TRUSTED_ASSOCIATIONS.has((comment.authorAssociation ?? '').toUpperCase());
}

/** Every token REVIEW_GATE_LINE can capture in its reviewer group. */
export const REVIEWER_TOKENS = [
  'independent/codex',
  'independent/claude',
  'codex',
  'claude',
  'adversarial',
  'owner',
  'none',
  'human-fallback',
] as const;

export type ReviewerToken = (typeof REVIEWER_TOKENS)[number];

function isReviewerToken(value: string): value is ReviewerToken {
  return (REVIEWER_TOKENS as readonly string[]).includes(value);
}

export interface GateEvidence {
  reviewer: ReviewerToken;
  tier: Tier;
  base: string;
  head: string;
  verdict: string;
  createdAt: string;
  /** createdAt when the comment was never edited. */
  updatedAt: string;
  authorAssociation: string;
  body: string;
}

export interface GateResult {
  state: 'success' | 'failure';
  description: string;
  evidence?: GateEvidence;
}

export interface StatusCheck {
  name?: string;
  context?: string;
  conclusion?: string | null;
  state?: string | null;
}

export interface RequiredChecksResult {
  pending: string[];
  failed: string[];
}

const PASSING_CONCLUSIONS = new Set(['SUCCESS', 'NEUTRAL', 'SKIPPED']);

export function requiredChecksResult(
  rollup: readonly StatusCheck[],
  required: readonly string[]
): RequiredChecksResult {
  const pending: string[] = [];
  const failed: string[] = [];
  for (const requiredName of required.filter(name => name !== REVIEW_GATE_CONTEXT)) {
    const check = rollup.find(entry => (entry.name ?? entry.context) === requiredName);
    if (!check) {
      pending.push(requiredName);
      continue;
    }
    const conclusion = (check.conclusion ?? '').toUpperCase();
    const state = (check.state ?? '').toUpperCase();
    if (conclusion) {
      if (!PASSING_CONCLUSIONS.has(conclusion)) failed.push(requiredName);
    } else if (state === 'SUCCESS') {
      // GitHub status contexts use state instead of conclusion.
    } else if (state === 'FAILURE' || state === 'ERROR') {
      failed.push(requiredName);
    } else {
      pending.push(requiredName);
    }
  }
  return { pending, failed };
}

/**
 * The evidence line. Must be the FIRST line of the comment (the workflow's
 * trigger filter uses the same rule); the dash accepts em, en or hyphen.
 */
export const REVIEW_GATE_LINE =
  /^Review gate: (independent\/codex|independent\/claude|codex|claude|adversarial|owner|none|human-fallback) reviewed ([0-9a-f]{7,40})\.\.([0-9a-f]{7,40})\s+[—–-]\s+(.+?)\s*$/m;

/** Legacy reviewer tokens predate tiers and all mean a cross-harness review. */
export function tierForReviewer(reviewer: string): Tier {
  if (reviewer === 'none') return 'none';
  if (reviewer === 'adversarial') return 'adversarial';
  if (reviewer === 'owner' || reviewer === 'human-fallback') return 'owner';
  return 'independent';
}

/**
 * The ONLY verdicts that are green, matched against the whole remainder of
 * the line. Anything else — a parenthetical, "not all addressed", "no findings
 * yet", a log excerpt — is red by default. Extra detail belongs on the
 * comment's later lines, not in the verdict.
 *
 * Bound to the TIER the reviewer token maps to (Codex review of Task 3 round
 * 1, C2): `no findings` / `N findings, all addressed` is only ever valid
 * evidence for `independent`, `N lenses, all findings addressed` only for
 * `adversarial`, `low-risk paths, CI green` only for `none`. A tier-agnostic
 * union let a `codex reviewed … — low-risk paths, CI green` line — which
 * literally asserts no review happened — pass at the `independent` floor,
 * reopening the #2040 hole this file's header describes. The adversarial
 * grammar requires at least 2 lenses (`[2-9]|\d{2,}`, never `0` or `1`) —
 * one lens is not adversarial review, and the mandatory `migration-auditor`
 * lens on migration paths must be one of the (at least) two.
 */
export const VERDICT_BY_TIER: Readonly<Record<'independent' | 'adversarial' | 'none', RegExp>> = {
  independent: /^(no findings|\d+ findings?, all (addressed|fixed))\.?$/i,
  adversarial: /^(?:[2-9]|\d{2,}) (?:lens|lenses), all findings addressed\.?$/i,
  none: /^low-risk paths, CI green\.?$/i,
};

/**
 * True when `verdict` is clean text under ANY tier's grammar. Used by the
 * pure-text near-miss table (which is not testing a specific reviewer's
 * claim) and the `--verdict` CLI probe (which does not know which tier the
 * poster will ultimately claim). `evaluateReviewGate` never calls this
 * directly for a non-human-fallback reviewer — it binds the verdict to the
 * evidence's OWN tier via `VERDICT_BY_TIER[latest.tier]` instead, which is
 * strictly narrower.
 */
export function verdictAccepted(verdict: string): boolean {
  const trimmed = verdict.trim();
  return Object.values(VERDICT_BY_TIER).some(re => re.test(trimmed));
}

export const HUMAN_FALLBACK_VERDICT =
  /^2 adversarial subagent reviews, all findings addressed\.?$/i;

const FALLBACK_REASON = /^Fallback reason: Claude unavailable\s*[-—:]\s*.+$/im;
const SUBAGENT_REVIEW = /^Adversarial subagent review: .+$/gim;
const PASSING_CHECKS = /^Required checks: passing$/im;

export function parseGateComments(comments: readonly GateComment[]): GateEvidence[] {
  const out: GateEvidence[] = [];
  for (const comment of comments) {
    // Untrusted authors are dropped BEFORE ordering, so an outsider's newer
    // clean line can never outrank a trusted withdrawal (Codex, #2058 P1).
    if (!commentTrusted(comment)) continue;
    const firstLine = comment.body.split(/\r?\n/, 1)[0] ?? '';
    const match = REVIEW_GATE_LINE.exec(firstLine);
    if (!match) continue;
    const [, reviewer, base, head, verdict] = match;
    // REVIEW_GATE_LINE's own alternation only ever captures a ReviewerToken;
    // this guard makes that true by construction rather than by an `as` cast.
    if (!isReviewerToken(reviewer)) continue;
    out.push({
      reviewer,
      tier: tierForReviewer(reviewer),
      base,
      head,
      verdict,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt ?? comment.createdAt,
      authorAssociation: (comment.authorAssociation ?? '').toUpperCase(),
      body: comment.body,
    });
  }
  return out;
}

/** Strict tier binding: `latest.tier` decides which single grammar applies. */
function verdictMatchesTier(verdict: string, tier: Tier): boolean {
  if (tier !== 'independent' && tier !== 'adversarial' && tier !== 'none') return false;
  return VERDICT_BY_TIER[tier].test(verdict.trim());
}

export function humanFallbackAccepted(evidence: GateEvidence): boolean {
  if (evidence.reviewer !== 'human-fallback') return false;
  if (!HUMAN_FALLBACK_ASSOCIATIONS.has(evidence.authorAssociation)) return false;
  if (!HUMAN_FALLBACK_VERDICT.test(evidence.verdict.trim())) return false;
  if (!FALLBACK_REASON.test(evidence.body)) return false;
  if (!PASSING_CHECKS.test(evidence.body)) return false;
  return [...evidence.body.matchAll(SUBAGENT_REVIEW)].length >= 2;
}

export function evaluateReviewGate(input: {
  headSha: string;
  comments: readonly GateComment[];
  changedFiles: readonly string[];
  /**
   * True when the changed-file list is empty or hit GitHub's 3000-file cap
   * and may therefore be truncated. Pins the floor to `independent` instead
   * of guessing a (possibly lower) floor from a partial diff — a truncated
   * list silently LOWERING the floor is the one way this feature would be
   * worse than no floor at all.
   */
  fileListUnusable?: boolean;
}): GateResult {
  const head = input.headSha.toLowerCase();
  const short = head.slice(0, 9);
  // Kill switch: MYK9_REVIEW_TIERS=off restores pre-floor behaviour exactly.
  const tiersEnabled = (process.env.MYK9_REVIEW_TIERS ?? 'on') !== 'off';
  // Latest by UPDATE, not creation: an older attestation edited to withdraw
  // a clean verdict must outrank a newer-created clean one (Codex, #2058).
  const forHead = parseGateComments(input.comments)
    .filter(e => head.startsWith(e.head.toLowerCase()))
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  const latest = forHead.at(-1);
  if (!latest) {
    return {
      state: 'failure',
      description: `no independent review recorded for ${short} — run the gate (ship-pr Step 4) against this head`,
    };
  }
  // Human fallback is checked on its own contract (association, two named
  // subagent lenses, passing checks). Every OTHER reviewer's verdict is bound
  // to the evidence's OWN tier — never the tier-agnostic union — so a
  // `codex` (independent) line cannot pass by wearing an `adversarial` or
  // `none` verdict phrase (Codex review of Task 3 round 1, C2). With the kill
  // switch off, only the original `independent` grammar is ever valid,
  // restoring exactly today's behaviour rather than a superset of it (I1).
  const isHumanFallback = latest.reviewer === 'human-fallback';
  const accepted = isHumanFallback
    ? humanFallbackAccepted(latest)
    : tiersEnabled
      ? verdictMatchesTier(latest.verdict, latest.tier)
      : VERDICT_BY_TIER.independent.test(latest.verdict.trim());
  if (!accepted) {
    return {
      state: 'failure',
      description: `${latest.reviewer} review of ${short} is not clean: ${latest.verdict}`,
      evidence: latest,
    };
  }
  // Only a CONFIRMED human-fallback attestation (association, two lenses,
  // passing checks — all already verified by `accepted` above) is exempt
  // from the floor. The bare `owner` token routes through `verdictMatchesTier`
  // above, which has no `owner` grammar entry and so can never reach here —
  // this exemption is belt-and-suspenders, not the only thing stopping it.
  // Originally this exempted the whole `owner` TIER unconditionally, which
  // let a COLLABORATOR bypass the floor on any guardrail path by posting a
  // bare `owner reviewed … — no findings` line (Codex review of Task 3
  // round 1, C1 — controller's own instruction, corrected). Task 4 adds a
  // real override path (`overrideAccepted`) with its own association check.
  const humanFallbackExempt = isHumanFallback && humanFallbackAccepted(latest);
  if (tiersEnabled && !humanFallbackExempt) {
    // The invariant lives HERE, not only in runCli's caller-side check, so a
    // future caller that computes changedFiles itself (push-hold.ts already
    // imports this module) cannot silently clear a guardrail PR on a
    // transient `gh` failure that yields an empty list (I2).
    const listUnusable =
      input.fileListUnusable === true ||
      input.changedFiles.length === 0 ||
      input.changedFiles.length >= 3000;
    const floor = listUnusable
      ? {
          tier: 'independent' as Tier,
          reason:
            'the changed-file list is empty or hit GitHub’s 3000-file cap and may be truncated',
        }
      : requiredTier(input.changedFiles);
    if (!meetsFloor(latest.tier, floor.tier)) {
      return {
        state: 'failure',
        description: `${latest.tier} review of ${short} is below the ${floor.tier} floor: ${floor.reason}`,
        evidence: latest,
      };
    }
  }
  return {
    state: 'success',
    description: `${latest.reviewer} reviewed ${latest.base.slice(0, 9)}..${short}: ${latest.verdict}`,
    evidence: latest,
  };
}

/** GitHub caps a status description at 140 characters. */
export function clampDescription(text: string): string {
  return text.length <= 140 ? text : `${text.slice(0, 137)}...`;
}

/** Parse `gh api --paginate --slurp` output: an array of pages, each an array. */
export function flattenPages<T>(slurped: string): T[] {
  const pages = JSON.parse(slurped) as T[][] | T[];
  return (pages as unknown[]).flatMap(page => (Array.isArray(page) ? (page as T[]) : [page as T]));
}

function gh(args: string[]): string {
  return execFileSync('gh', args, { encoding: 'utf8' });
}

function requiredChecksFor(repo: string): string[] {
  const rulesetName = process.env.MYK9_PR_RULESET ?? 'main-required-checks';
  const rulesets = JSON.parse(gh(['api', `repos/${repo}/rulesets`])) as Array<{
    id: number;
    name: string;
  }>;
  const ruleset = rulesets.find(candidate => candidate.name === rulesetName);
  if (!ruleset) throw new Error(`required ruleset '${rulesetName}' was not found`);
  const detail = JSON.parse(gh(['api', `repos/${repo}/rulesets/${ruleset.id}`])) as {
    rules?: Array<{
      type?: string;
      parameters?: { required_status_checks?: Array<{ context?: string }> };
    }>;
  };
  return (detail.rules ?? [])
    .filter(rule => rule.type === 'required_status_checks')
    .flatMap(rule =>
      (rule.parameters?.required_status_checks ?? []).map(check => check.context ?? '')
    )
    .filter(Boolean);
}

interface PrView {
  headRefOid: string;
  isDraft: boolean;
  statusCheckRollup?: StatusCheck[];
  files?: Array<{ path: string }>;
}

/** REST shape — `gh pr view --json comments` carries no edit timestamp. */
interface RestComment {
  body: string;
  created_at: string;
  updated_at: string;
  author_association?: string;
  user?: { login: string };
}

export function runCli(
  env: NodeJS.ProcessEnv = process.env,
  argv: string[] = process.argv.slice(2)
): number {
  const prNumber = env.PR_NUMBER;
  const repo = env.REPO;
  if (!prNumber || !repo) {
    console.error('review-gate: PR_NUMBER and REPO are required');
    return 2;
  }
  const view = JSON.parse(
    gh([
      'pr',
      'view',
      prNumber,
      '--repo',
      repo,
      '--json',
      'headRefOid,isDraft,statusCheckRollup,files',
    ])
  ) as PrView;
  if (view.isDraft) {
    console.log(`review-gate: PR #${prNumber} is a draft — no status posted`);
    return 0;
  }
  // gh caps the files list at 3000 entries, so a PR at or past the cap may be
  // truncated. evaluateReviewGate itself re-derives this invariant from
  // `changedFiles.length` (I2, Codex review of Task 3 round 1) — this local
  // copy exists only to print the diagnostic log line below, not to gate
  // anything; a caller that skipped this flag entirely would still get the
  // independent floor forced from inside evaluateReviewGate.
  const changedFiles = (view.files ?? []).map(f => f.path);
  const fileListUnusable = changedFiles.length === 0 || changedFiles.length >= 3000;
  if (fileListUnusable) {
    console.log(
      `review-gate: file list unusable (${changedFiles.length}) — forcing independent floor`
    );
  }
  // --paginate alone concatenates one JSON array per page, which JSON.parse
  // rejects on any PR past 100 comments (Codex, #2058). --slurp wraps the
  // pages in one outer array; flattenPages unwraps it.
  const comments = flattenPages<RestComment>(
    gh(['api', '--paginate', '--slurp', `repos/${repo}/issues/${prNumber}/comments?per_page=100`])
  );
  const result = evaluateReviewGate({
    headSha: view.headRefOid,
    changedFiles,
    fileListUnusable,
    comments: comments.map(c => ({
      body: c.body,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
      author: c.user?.login,
      authorAssociation: c.author_association,
    })),
  });
  if (result.state === 'success' && result.evidence?.reviewer === 'human-fallback') {
    try {
      const checks = requiredChecksResult(view.statusCheckRollup ?? [], requiredChecksFor(repo));
      if (checks.pending.length > 0 || checks.failed.length > 0) {
        const outstanding = [
          ...checks.pending.map(name => `${name} pending`),
          ...checks.failed.map(name => `${name} failed`),
        ];
        return postStatus(
          view.headRefOid,
          {
            state: 'failure',
            description: `human fallback requires passing checks: ${outstanding.join(', ')}`,
          },
          env,
          argv
        );
      }
    } catch (error) {
      return postStatus(
        view.headRefOid,
        {
          state: 'failure',
          description: `human fallback could not verify required checks: ${error instanceof Error ? error.message : String(error)}`,
        },
        env,
        argv
      );
    }
  }
  return postStatus(view.headRefOid, result, env, argv);
}

function postStatus(
  headRefOid: string,
  result: GateResult,
  env: NodeJS.ProcessEnv,
  argv: readonly string[]
): number {
  const description = clampDescription(result.description);
  console.log(`review-gate: ${headRefOid} -> ${result.state}: ${description}`);
  if (argv.includes('--dry-run')) return result.state === 'success' ? 0 : 1;
  const fields = [
    '-f',
    `state=${result.state}`,
    '-f',
    `context=${REVIEW_GATE_CONTEXT}`,
    '-f',
    `description=${description}`,
  ];
  if (env.RUN_URL) fields.push('-f', `target_url=${env.RUN_URL}`);
  gh(['api', '--method', 'POST', `repos/${env.REPO}/statuses/${headRefOid}`, ...fields]);
  // The status carries the verdict; the job itself succeeds either way so a
  // red gate reads as "review missing", never as "the checker crashed".
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // `--verdict "<text>"`: exit 0 when verdictAccepted() accepts the text, 2
  // when it does not. scripts/qa/post-review-gate.sh calls this instead of
  // carrying its own copy of the grammar — a hand-copied regex drifts from
  // the parser that actually judges the comment, which is how `finding(s)`
  // came to be documented as accepted while the real grammar rejected it.
  // One grammar, one owner. (post-review-gate.sh only ever posts
  // codex/claude — independent-tier — verdicts today, so the union check
  // here is equivalent to the tier-bound one `evaluateReviewGate` applies;
  // a future poster for the other tiers should ask review-gate.ts for the
  // reviewer's own grammar instead of widening what this flag accepts.)
  const verdictFlag = process.argv.indexOf('--verdict');
  if (verdictFlag >= 0) {
    const text = (process.argv[verdictFlag + 1] ?? '').trim();
    process.exit(verdictAccepted(text) ? 0 : 2);
  }
  process.exitCode = runCli();
}
