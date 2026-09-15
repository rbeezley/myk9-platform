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
 * The `owner` override evidence is deliberately more constrained than a normal
 * reviewer verdict: it requires a trusted owner/member, a claimed floor that
 * matches the real one, an `Override reason:` and a `Deferred re-review:`
 * issue so the debt is recorded (MYK9-532 retired the pre-tier `human-fallback`
 * token this override replaced — it carried none of that).
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
import {
  meetsFloor,
  MIGRATION_LENS,
  requiredTier,
  touchesMigration,
  type Tier,
} from './review-tier.ts';

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

/** Only repository owners or members may authorize the `owner` override. */
export const OWNER_OVERRIDE_ASSOCIATIONS: ReadonlySet<string> = new Set(['OWNER', 'MEMBER']);

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
] as const;

export type ReviewerToken = (typeof REVIEWER_TOKENS)[number];

function isReviewerToken(value: string): value is ReviewerToken {
  return (REVIEWER_TOKENS as readonly string[]).includes(value);
}

/**
 * The tokens `REVIEW_GATE_LINE` accepted before Task 2 added tiers. With
 * `MYK9_REVIEW_TIERS=off`, evidence claiming any OTHER token is treated as
 * though it never parsed at all (Codex review of Task 3 round 2, I1
 * residual) — not merely rejected on its verdict grammar. Filtering only the
 * verdict grammar left a `none`/`adversarial`/`owner`/`independent/*` line
 * PARSEABLE with the switch off, which `REVIEW_GATE_LINE` on `origin/main`
 * cannot do at all; a lever pulled at 2am to revert a misfiring feature must
 * land exactly on the state being reverted to, not somewhere weaker than it.
 * `human-fallback` predates this set too, but MYK9-532 retired it outright —
 * it is no longer a `ReviewerToken` at all, kill switch or not.
 */
const LEGACY_REVIEWER_TOKENS: ReadonlySet<ReviewerToken> = new Set(['codex', 'claude']);

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

/** Kept for `PrView.statusCheckRollup` below — the fetched rollup shape. */
export interface StatusCheck {
  name?: string;
  context?: string;
  conclusion?: string | null;
  state?: string | null;
}

/**
 * The evidence line. Must be the FIRST line of the comment (the workflow's
 * trigger filter uses the same rule); the dash accepts em, en or hyphen.
 */
export const REVIEW_GATE_LINE =
  /^Review gate: (independent\/codex|independent\/claude|codex|claude|adversarial|owner|none) reviewed ([0-9a-f]{7,40})\.\.([0-9a-f]{7,40})\s+[—–-]\s+(.+?)\s*$/m;

/**
 * MYK9-532: `human-fallback` is retired and is deliberately NOT part of
 * `REVIEW_GATE_LINE`'s grammar any more — nothing parses a `human-fallback`
 * comment as evidence. This pattern exists only so `evaluateReviewGate` can
 * recognize the shape well enough to answer with a refusal naming its
 * replacement, the `owner` override, instead of the generic "no review
 * recorded" message.
 */
const LEGACY_HUMAN_FALLBACK_LINE =
  /^Review gate: human-fallback reviewed ([0-9a-f]{7,40})\.\.([0-9a-f]{7,40})\s+[—–-]\s+.+$/m;

/** True when a trusted comment's first line claims the retired `human-fallback` token for this head. */
function legacyHumanFallbackAttempt(comments: readonly GateComment[], head: string): boolean {
  const normalizedHead = head.toLowerCase();
  return comments.some(c => {
    if (!commentTrusted(c)) return false;
    const firstLine = c.body.split(/\r?\n/, 1)[0] ?? '';
    const match = LEGACY_HUMAN_FALLBACK_LINE.exec(firstLine);
    const commentHead = match?.[2];
    return commentHead !== undefined && normalizedHead.startsWith(commentHead.toLowerCase());
  });
}

/**
 * Exhaustive tier table, `satisfies Record<ReviewerToken, Tier>` so an
 * unmapped token is a COMPILE error, not a silent floor bypass. The if-chain
 * this replaced ended `return 'independent'` — any token that matched
 * `REVIEW_GATE_LINE`'s alternation but fell through every branch silently
 * received the STRONGEST tier, clearing every floor. Confirmed:
 * `tierForReviewer('gemini')` used to return `'independent'` on a guardrail
 * path with no compile-time or runtime signal (2026-09-14). Adding a new
 * `ReviewerToken` without adding a row here is now BOTH a `tsc` error (this
 * file is covered by `scripts/qa/tsconfig.json`, wired into `pnpm typecheck`
 * via `typecheck:scripts`, MYK9-531) AND caught at runtime by
 * `review-gate.test.ts`'s "has an explicit mapping for every REVIEWER_TOKENS
 * member" test — the runtime test stays as defence in depth even now that
 * the type-level guarantee is real (verified 2026-09-14).
 */
const TIER_BY_REVIEWER = {
  'independent/codex': 'independent',
  'independent/claude': 'independent',
  codex: 'independent',
  claude: 'independent',
  adversarial: 'adversarial',
  owner: 'owner',
  none: 'none',
} satisfies Record<ReviewerToken, Tier>;

/**
 * MYK9-532: `human-fallback` — the pre-tier token that used to map to tier
 * `owner` here — is retired outright, not merely re-floored. It carried no
 * `Deferred re-review:` requirement and no claimed-floor check, so it let a
 * poster skip every constraint the `owner` override adds simply by typing
 * the older token (fallback review of #2243, M4 — flagged independently by
 * three reviewers). The one PR that kept it green (#2241) is merged; nothing
 * open depends on it (confirmed 2026-09-14). `evaluateReviewGate` still
 * recognizes the shape (`legacyHumanFallbackAttempt`) well enough to name the
 * `owner` override as the replacement instead of failing silently.
 */
/** Legacy reviewer tokens predate tiers and all mean a cross-harness review. */
export function tierForReviewer(reviewer: ReviewerToken): Tier {
  return TIER_BY_REVIEWER[reviewer];
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
 * grammar requires at least 2 lenses (`[2-9]|[1-9]\d+`, never `0` or `1` —
 * and never a zero-padded `00`/`01`, which `\d{2,}` alone would have let
 * through, Codex review of Task 3 round 2, C3) — one lens is not adversarial
 * review, and the mandatory `migration-auditor` lens on migration paths must
 * be one of the (at least) two.
 *
 * `owner` claims `OVERRIDE_VERDICT` — the same grammar `overrideAccepted`
 * checks. Giving `owner` a row here, by itself, does NOT exempt it from the
 * floor: `verdictMatchesTier` only decides whether the verdict TEXT matches
 * the tier's grammar, and evaluateReviewGate still runs the floor check for
 * every tier except a CONFIRMED override (see the exemption comment below).
 * This was proven safe by simulation during Task 3 review — widening the
 * EXEMPTION condition itself is what would reopen C1, not this table entry.
 */
export const OVERRIDE_VERDICT = /^override, floor was (independent|adversarial)\.?$/i;

export const VERDICT_BY_TIER: Readonly<Record<Tier, RegExp>> = {
  independent: /^(no findings|\d+ findings?, all (addressed|fixed))\.?$/i,
  adversarial: /^(?:[2-9]|[1-9]\d+) (?:lens|lenses), all findings addressed\.?$/i,
  none: /^low-risk paths, CI green\.?$/i,
  owner: OVERRIDE_VERDICT,
};

/**
 * True when `verdict` is clean text under ANY tier's grammar. Used by the
 * pure-text near-miss table (which is not testing a specific reviewer's
 * claim) and the `--verdict` CLI probe (which does not know which tier the
 * poster will ultimately claim). `evaluateReviewGate` never calls this
 * directly for a real reviewer's evidence — it binds the verdict to the
 * evidence's OWN tier via `VERDICT_BY_TIER[latest.tier]` instead, which is
 * strictly narrower.
 */
export function verdictAccepted(verdict: string): boolean {
  const trimmed = verdict.trim();
  return Object.values(VERDICT_BY_TIER).some(re => re.test(trimmed));
}

/**
 * The lens line form, capturing the lens NAME. This shape ("a named
 * subagent lens looked at this") is what the `adversarial` tier's body
 * contract runs on, so the migration rule ("one lens must be
 * migration-auditor") becomes a thing the gate can CHECK rather than prose
 * in a reason string that nothing enforces.
 */
const SUBAGENT_LENS = /^Adversarial subagent review:[ \t]*(\S.*?)[ \t]*$/gim;

/**
 * The bare `owner` token's own contract. `OVERRIDE_REASON` is free text on
 * which HARNESS was unavailable, not hardcoded to Claude — the retired
 * `human-fallback` token's `Fallback reason: Claude unavailable` grammar made
 * the documented fallback unusable whenever Codex, not Claude, was the
 * missing reviewer, which is the bug this whole plan exists to fix
 * (2026-09-14). An override defers scrutiny rather than skipping it, so
 * `DEFERRED_REVIEW` names a tracked issue; without one there is no debt
 * record and the override is refused.
 */
/**
 * Two accepted shapes, because there are two honest reasons to defer:
 *  - `<harness> unavailable — <detail>`: the reviewer cannot be reached.
 *  - `convergence stop — <detail>`: the reviewer IS reachable, and CLAUDE.md's
 *    convergence rule says to stop the round anyway (the second finding on one
 *    path, or findings describing code the previous fix introduced). Before
 *    this, the ONLY green phrasing asserted unavailability, so recording a
 *    convergence stop required writing something false — the exact shape this
 *    whole feature exists to remove (fallback review of #2243, S-e). The
 *    deferred-issue line is still required: a convergence stop is deferred
 *    scrutiny plus a restructure proposal, never a waiver.
 */
const OVERRIDE_REASON = /^Override reason: (?:.+ unavailable|convergence stop)\s*[-—:]\s*.+$/im;
// [A-Z][A-Z0-9]*, not [A-Z]+: this repo's own issue prefix is MYK9-<n> — a
// digit inside the prefix — and a brief-literal `[A-Z]+-\d+` cannot match it
// (verified against MYK9-523 during implementation: it does not match). No
// `i` flag: this is a SHAPE check (an issue id was named), not an identity
// check, so `A-1` is fine — but an `i` flag made the letters decorative,
// letting lowercase `myk9-523` parse despite the comment above claiming
// uppercase (round 1 finding M-a).
const DEFERRED_REVIEW = /^Deferred re-review: [A-Z][A-Z0-9]*-\d+$/m;

/**
 * The full owner-override contract. Checks the trusted-association gate
 * ITSELF (not merely via the caller) — this is what keeps a COLLABORATOR
 * from posting a bare `owner` line and having it accepted (C1): only OWNER
 * or MEMBER may authorize deferring scrutiny.
 */
export function overrideAccepted(evidence: GateEvidence): boolean {
  if (evidence.tier !== 'owner' || evidence.reviewer !== 'owner') return false;
  if (!OWNER_OVERRIDE_ASSOCIATIONS.has(evidence.authorAssociation)) return false;
  if (!verdictMatchesTier(evidence.verdict, 'owner')) return false;
  if (!OVERRIDE_REASON.test(evidence.body)) return false;
  return DEFERRED_REVIEW.test(evidence.body);
}

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
    // REVIEW_GATE_LINE has no optional groups, so a successful match always
    // captures all four; this narrows `noUncheckedIndexedAccess`'s
    // `string | undefined` element type back to `string` by construction
    // (MYK9-531), never with `!` or `as`.
    if (
      reviewer === undefined ||
      base === undefined ||
      head === undefined ||
      verdict === undefined
    ) {
      continue;
    }
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

/**
 * Strict tier binding: `latest.tier` decides which single grammar applies.
 * `VERDICT_BY_TIER` now has an entry for every `Tier` (including `owner`),
 * so no fallback branch is needed — the type system guarantees exhaustion.
 */
function verdictMatchesTier(verdict: string, tier: Tier): boolean {
  return VERDICT_BY_TIER[tier].test(verdict.trim());
}

/** The lens names an `adversarial` evidence comment attests to, in order. */
export function adversarialLensNames(body: string): string[] {
  return [...body.matchAll(SUBAGENT_LENS)].map(match => match[1]!.trim());
}

/** Minimum lenses an `adversarial` verdict's BODY must actually name. */
export const ADVERSARIAL_MIN_LENSES = 2;

/**
 * The `<N>` of an adversarial verdict, for binding it to the lenses the body
 * names. Same count alternation as `VERDICT_BY_TIER.adversarial` (no `0`, `1`
 * or zero-padded form) so this can never accept a shape that grammar rejects.
 */
const ADVERSARIAL_COUNT = /^(?:([2-9]|[1-9]\d+)) (?:lens|lenses), all findings addressed\.?$/i;

/**
 * The `adversarial` tier's body contract. Before this, the tier's whole
 * substance lived in the VERDICT text (`<N> lenses, all findings addressed`)
 * — a number the poster typed — and the spec's "a migration needs the
 * `migration-auditor` lens" existed ONLY as prose inside `review-tier.ts`'s
 * reason string and the PLAYBOOK. A migration could therefore go green on
 * `adversarial` with no lens named at all (final whole-branch review, F3).
 * Now the body must NAME the lenses, and on a migration diff one of them must
 * be `migration-auditor` exactly.
 */
export function adversarialBodyProblem(
  evidence: GateEvidence,
  changedFiles: readonly string[]
): string | undefined {
  // Distinct names only: the tier's substance is two INDEPENDENT bug-finding
  // lenses, so the same lens listed twice is one lens, not two.
  const lenses = [...new Set(adversarialLensNames(evidence.body))];
  if (lenses.length < ADVERSARIAL_MIN_LENSES) {
    return `must name ${ADVERSARIAL_MIN_LENSES} distinct lenses as "Adversarial subagent review: <name>" body lines (found ${lenses.length})`;
  }
  // The verdict's `<N>` was free text: `9 lenses, all findings addressed` over
  // a body naming two went green (fallback review of #2243, M5). A digit the
  // poster types is a CLAIM; the named lines are the record. Bind them, in
  // both directions — an understated count is still a record that does not
  // match what happened.
  const claimed = Number(ADVERSARIAL_COUNT.exec(evidence.verdict.trim())?.[1] ?? NaN);
  if (claimed !== lenses.length) {
    return `claims ${Number.isNaN(claimed) ? 'an unreadable number of' : claimed} lenses but names ${lenses.length} distinct (${lenses.join(', ')})`;
  }
  if (touchesMigration(changedFiles) && !lenses.includes(MIGRATION_LENS)) {
    return `touches a migration, so one lens must be ${MIGRATION_LENS} (named: ${lenses.join(', ')})`;
  }
  return undefined;
}

interface EvaluateReviewGateInput {
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
}

/**
 * The floor this input would face under ordinary (non-exempt) evidence.
 * Shared by the general floor check below AND the override claimed-floor
 * check (round 1 review, I-B): an override's verdict claims which floor it
 * is skipping (`override, floor was independent|adversarial`), and that
 * claim must match the REAL floor for these `changedFiles` — an override
 * bypasses the floor either way, but the recorded debt IS the contract, and
 * a claim that understates the floor it skipped leaves an audit trail that
 * misrepresents the risk deferred.
 */
function resolveFloor(input: { changedFiles: readonly string[]; fileListUnusable?: boolean }): {
  tier: Tier;
  reason: string;
} {
  // The invariant lives HERE, not only in runCli's caller-side check, so a
  // future caller that computes changedFiles itself (push-hold.ts already
  // imports this module) cannot silently clear a guardrail PR on a
  // transient `gh` failure that yields an empty list (I2).
  const listUnusable =
    input.fileListUnusable === true ||
    input.changedFiles.length === 0 ||
    input.changedFiles.length >= 3000;
  return listUnusable
    ? {
        tier: 'independent',
        reason: 'the changed-file list is empty or hit GitHub’s 3000-file cap and may be truncated',
      }
    : requiredTier(input.changedFiles);
}

export function evaluateReviewGate(input: EvaluateReviewGateInput): GateResult {
  const head = input.headSha.toLowerCase();
  const short = head.slice(0, 9);
  // Kill switch: MYK9_REVIEW_TIERS=off restores origin/main's behaviour
  // exactly — no floor, and only the legacy codex/claude tokens are even
  // recognised as evidence (see LEGACY_REVIEWER_TOKENS).
  const tiersEnabled = (process.env.MYK9_REVIEW_TIERS ?? 'on') !== 'off';
  // Latest by UPDATE, not creation: an older attestation edited to withdraw
  // a clean verdict must outrank a newer-created clean one (Codex, #2058).
  const forHead = parseGateComments(input.comments)
    .filter(e => head.startsWith(e.head.toLowerCase()))
    .filter(e => tiersEnabled || LEGACY_REVIEWER_TOKENS.has(e.reviewer))
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  const latest = forHead.at(-1);
  if (!latest) {
    // MYK9-532: nothing parses a `human-fallback` comment as evidence any
    // more, so a poster who only tried that token lands here (no evidence
    // found) rather than in the `accepted` check below. Name the retired
    // token's replacement explicitly instead of the generic message — a
    // silent "no review recorded" would send the poster looking for a typo
    // in a token that was never going to work again.
    if (legacyHumanFallbackAttempt(input.comments, head)) {
      return {
        state: 'failure',
        // Must survive `clampDescription`'s 140-char GitHub cap intact: the
        // three grammar fragments ARE the message, and a longer, prettier
        // sentence loses the last two to the ellipsis on the commit status
        // even though the unit test on the raw string stays green (MYK9-532).
        description:
          `human-fallback is retired for ${short}: use the owner override — ` +
          `"override, floor was <floor>", "Override reason:", "Deferred re-review:"`,
      };
    }
    return {
      state: 'failure',
      description: `no independent review recorded for ${short} — run the gate (ship-pr Step 4) against this head`,
    };
  }
  // The bare `owner` override is checked on its OWN contract (association
  // plus reason/deferred-issue) — never merely on verdict grammar. Every
  // OTHER reviewer's verdict is bound to the evidence's OWN tier — never the
  // tier-agnostic union — so a `codex` (independent) line cannot pass by
  // wearing an `adversarial` or `none` verdict phrase (Codex review of Task 3
  // round 1, C2). With the kill switch off, `latest` can only ever be a
  // legacy-token evidence (filtered above — `owner` is not in
  // LEGACY_REVIEWER_TOKENS, so `isOverride` is unreachable there), so the
  // tiersEnabled-false branch is reachable only for `independent` grammar in
  // practice — the explicit `VERDICT_BY_TIER.independent` check below is kept
  // anyway so a future change to the filter fails safe, not open.
  const isOverride = latest.reviewer === 'owner';
  const accepted = isOverride
    ? overrideAccepted(latest)
    : tiersEnabled
      ? verdictMatchesTier(latest.verdict, latest.tier)
      : VERDICT_BY_TIER.independent.test(latest.verdict.trim());
  if (!accepted) {
    // Name what is missing for an override specifically — the association
    // check and the verdict grammar already produce the generic "not clean"
    // message, but a poster who got everything else right except the
    // deferred-issue line deserves to be told exactly that.
    const why =
      isOverride && !DEFERRED_REVIEW.test(latest.body)
        ? `override of ${short} must name a Deferred re-review: <ISSUE-ID>`
        : `${latest.reviewer} review of ${short} is not clean: ${latest.verdict}`;
    return { state: 'failure', description: why, evidence: latest };
  }
  // Only a CONFIRMED override (association, full contract — already verified
  // by `accepted` above) is exempt from the floor. Originally this exempted
  // the whole `owner` TIER unconditionally, which let a COLLABORATOR bypass
  // the floor on any guardrail path by posting a bare `owner reviewed … — no
  // findings` line (Codex review of Task 3 round 1, C1 — controller's own
  // instruction, corrected).
  //
  // C1 is actually held by `overrideAccepted`'s own association check
  // (`OWNER_OVERRIDE_ASSOCIATIONS.has(...)`, above near line 280) — NOT by
  // this exemption line. (Round 1 review, I-A: an earlier version of this
  // comment claimed the opposite — that THIS condition was what held C1 —
  // which is wrong and would have sent the next maintainer to the wrong
  // line.) This condition is defence-in-depth against a future `owner`-tier
  // reviewer token that might route around `overrideAccepted` entirely, not
  // the thing actually stopping the COLLABORATOR case today.
  //
  // MYK9-532 retired the only other reviewer token that ever mapped to tier
  // `owner` (`human-fallback`), so `latest.tier === 'owner'` is unique to the
  // bare `owner` override now — but this stays keyed on an ACCEPTED override
  // (`overrideExempt`, via `overrideAccepted`), never widened to a bare tier
  // check, so a future `owner`-tier token doesn't quietly reopen C1.
  const overrideExempt = isOverride && overrideAccepted(latest);
  // Round 1 review, I-B: `accepted` above only confirmed the override's
  // OWN grammar (verdict text matches `override, floor was
  // independent|adversarial`); nothing previously checked that claim
  // against the REAL floor these `changedFiles` require. Not an
  // enforcement hole on its own — the override still bypasses the floor
  // whichever tier it names — but the whole point of this plan is that an
  // override records what it deferred, and a claim of "floor was
  // independent" on a migration (real floor: adversarial), or "floor was
  // adversarial" on a guardrail path (real floor: independent), would ship
  // a debt record that misstates the risk. Refuse the mismatch instead of
  // silently trusting the poster's own arithmetic.
  if (overrideExempt) {
    // Unreachable in pristine code — `overrideExempt` already required
    // `OVERRIDE_VERDICT` to match — but the fallback keeps this message
    // readable rather than "claims floor was undefined" under a mutant
    // that removes the verdict-grammar check upstream.
    const claimed = OVERRIDE_VERDICT.exec(latest.verdict.trim())?.[1]?.toLowerCase() ?? 'unstated';
    const real = resolveFloor(input).tier;
    if (claimed !== real) {
      return {
        state: 'failure',
        description: `override of ${short} claims floor was ${claimed}, but the real floor for these changes is ${real}`,
        evidence: latest,
      };
    }
  }
  if (tiersEnabled && !overrideExempt) {
    const floor = resolveFloor(input);
    if (!meetsFloor(latest.tier, floor.tier)) {
      return {
        state: 'failure',
        description: `${latest.tier} review of ${short} is below the ${floor.tier} floor: ${floor.reason}`,
        evidence: latest,
      };
    }
  }
  // The `adversarial` tier's BODY contract (F3). Ordered AFTER the floor check
  // so a guardrail path still reports the floor it missed (the stronger, more
  // actionable message) rather than a lens complaint about a tier it may not
  // use at all.
  if (tiersEnabled && latest.tier === 'adversarial') {
    const problem = adversarialBodyProblem(latest, input.changedFiles);
    if (problem) {
      return {
        state: 'failure',
        description: `adversarial review of ${short} ${problem}`,
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
  // One grammar, one owner.
  //
  // `--reviewer <token>` narrows the check to that reviewer's OWN tier
  // grammar via `verdictMatchesTier`, the same binding `evaluateReviewGate`
  // applies to real evidence. Without it a `codex` line wearing an
  // `adversarial`/`owner` verdict phrase would pass this probe (the
  // tier-agnostic union `verdictAccepted` matches ANY tier's grammar) and
  // get posted, only for the real gate to refuse it on the tier-bound check
  // — the poster and the judge disagreeing is how a confusing red gate
  // happens. Omitting `--reviewer` keeps the old union behaviour for any
  // other caller of this flag.
  const verdictFlag = process.argv.indexOf('--verdict');
  if (verdictFlag >= 0) {
    const text = (process.argv[verdictFlag + 1] ?? '').trim();
    const reviewerFlag = process.argv.indexOf('--reviewer');
    if (reviewerFlag >= 0) {
      const reviewerArg = process.argv[reviewerFlag + 1] ?? '';
      const accepted = isReviewerToken(reviewerArg)
        ? verdictMatchesTier(text, tierForReviewer(reviewerArg))
        : false;
      process.exit(accepted ? 0 : 2);
    }
    process.exit(verdictAccepted(text) ? 0 : 2);
  }
  // `--override-reason-line "<full line>"` / `--deferred-review-line "<full
  // line>"`: exit 0 when OVERRIDE_REASON / DEFERRED_REVIEW accepts the
  // WHOLE line, 2 when it does not. post-review-gate.sh's env-var presence
  // check (`[ -n "${OVERRIDE_REASON:-}" ]`) only proves the var is non-empty
  // — `OVERRIDE_REASON="I was busy"` or `DEFERRED_REVIEW=myk9-523` both pass
  // that check, post successfully, and are then refused by the real gate
  // (overrideAccepted requires the "<harness> unavailable — <detail>" shape
  // and DEFERRED_REVIEW's uppercase-prefix issue-id shape — deliberately
  // case-sensitive, see the comment at DEFERRED_REVIEW's definition above).
  // Same class of poster/judge disagreement `--reviewer` closed for
  // verdicts; these two flags close it for the override body lines by
  // asking the ONE definition of each shape instead of re-deriving it.
  const overrideReasonLineFlag = process.argv.indexOf('--override-reason-line');
  if (overrideReasonLineFlag >= 0) {
    const line = process.argv[overrideReasonLineFlag + 1] ?? '';
    process.exit(OVERRIDE_REASON.test(line) ? 0 : 2);
  }
  const deferredReviewLineFlag = process.argv.indexOf('--deferred-review-line');
  if (deferredReviewLineFlag >= 0) {
    const line = process.argv[deferredReviewLineFlag + 1] ?? '';
    process.exit(DEFERRED_REVIEW.test(line) ? 0 : 2);
  }
  process.exitCode = runCli();
}
