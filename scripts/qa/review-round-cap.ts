/**
 * Round-cap verdict (MYK9-1566). Five of six Wave 2 PRs ended at the 3-round
 * Codex cap with only P2s left and each needed a hand-posted `owner`
 * convergence override to merge. The reviewing agent may now record that exit
 * itself, but only when the record proves it, so it is not a waiver:
 *
 *   - at least ROUND_CAP_MIN_ROUNDS reviewer rounds on the PR (distinct heads);
 *   - the quoted log carries no `[P0]` / `[P1]` bullet;
 *   - a `Deferred re-review:` issue holds the remaining findings;
 *   - it is posted on the head that round reviewed (the gate's head match), and
 *     its `log sha256:` equals the one an earlier round comment on that head
 *     recorded, so it quotes THAT round's log and not a convenient other one.
 *
 * Pure functions on the gate's parsed evidence. This module imports only the
 * `GateEvidence` TYPE, so review-gate.ts can import it without a cycle.
 */
import type { GateEvidence } from './review-gate.ts';

export const ROUND_CAP_MIN_ROUNDS = 3;

/** The verdict text; valid only for the `codex` / `claude` reviewer tokens (independent tier). */
export const ROUND_CAP_VERDICT = /^round cap, no P0\/P1 open\.?$/i;

const ROUND_REVIEWERS: ReadonlySet<string> = new Set([
  'codex',
  'claude',
  'independent/codex',
  'independent/claude',
]);

/**
 * A P0 or P1 finding bullet: the same shapes as REVIEW_FINDING_BULLET in
 * review-verdict.sh (tag first, bolded optionally, or after a backticked
 * location), narrowed to priorities 0 and 1.
 */
export const BLOCKING_FINDING_BULLET =
  /^[ \t]*- (?:(?:\*\*)?\[P[01]\]|`[^`]+`[ \t]*[-–—][ \t]*(?:\*\*)?\[P[01]\])/m;

/** The text of the fenced verdict block the poster quotes (first ```text fence to the last closing one). */
export function quotedLog(body: string): string {
  const open = body.indexOf('```text\n');
  if (open < 0) return '';
  const start = open + '```text\n'.length;
  const end = body.lastIndexOf('\n```');
  return end > start ? body.slice(start, end) : '';
}

export function logHashOf(body: string): string | undefined {
  return /^log sha256: ([0-9a-f]{64})$/m.exec(body)?.[1];
}

export function isRoundCapVerdict(verdict: string): boolean {
  return ROUND_CAP_VERDICT.test(verdict.trim());
}

const sameHead = (a: string, b: string): boolean => {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x.startsWith(y) || y.startsWith(x);
};

/**
 * Why `cap` is not a valid round-cap verdict, or undefined when it is.
 * `all` is every parsed evidence comment on the PR (any head); `deferredOk` is
 * the caller's DEFERRED_REVIEW shape check of the cap body.
 */
export function roundCapProblem(
  cap: GateEvidence,
  all: readonly GateEvidence[],
  deferredOk: boolean
): string | undefined {
  if (!ROUND_REVIEWERS.has(cap.reviewer)) {
    return 'is only valid from the codex or claude reviewer';
  }
  const rounds = all.filter(e => ROUND_REVIEWERS.has(e.reviewer) && !isRoundCapVerdict(e.verdict));
  const heads = new Set(rounds.map(e => e.head.toLowerCase().slice(0, 7)));
  if (heads.size < ROUND_CAP_MIN_ROUNDS) {
    return `needs ${ROUND_CAP_MIN_ROUNDS} reviewer rounds on this PR (found ${heads.size})`;
  }
  if (!deferredOk)
    return 'must name a Deferred re-review: <ISSUE-ID> holding the remaining findings';
  const hash = logHashOf(cap.body);
  const log = quotedLog(cap.body);
  if (!hash || log.trim() === '') return 'must quote the round log and its log sha256';
  if (BLOCKING_FINDING_BULLET.test(log))
    return 'quotes a log that still carries a [P0] or [P1] bullet';
  // The LATEST round recorded on this head (by last edit), not any earlier one: a
  // later round with a P1 supersedes an earlier P2-only log. Hash AND quoted text
  // must match it, so an edited cap that drops a P1 bullet under the old hash is refused.
  const latest = rounds
    .filter(e => sameHead(e.head, cap.head))
    .sort((x, y) => x.updatedAt.localeCompare(y.updatedAt))
    .at(-1);
  if (!latest || logHashOf(latest.body) !== hash) {
    return 'must quote the log of the latest round recorded on this same head (log sha256 does not match it)';
  }
  if (quotedLog(latest.body).trim() !== log.trim()) {
    return 'quotes text that differs from the latest round recorded on this head';
  }
  return undefined;
}
