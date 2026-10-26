/**
 * Parser for the Linear claim comment (MYK9-1435, shared rules Gates step 1):
 *
 *   Claimed <YYYY-MM-DD HH:MM TZ> by <session title or run name> (<session link if any>)
 *   · branch <name or "none yet, prefix claude/myk9-<n>-"> · worktree <path or "cloud session <url>">
 *
 * The issue janitor reads it to name the owner of a stale claim. Every field
 * is optional because a hand-typed claim drifts; a missing field is null,
 * never a guess.
 */
export interface Claim {
  /** The timestamp text exactly as written, e.g. `2026-10-26 09:15 PDT`. */
  claimedAt: string | null;
  who: string | null;
  link: string | null;
  /** Null when the claim says `none yet`. */
  branch: string | null;
  /** A path, or `cloud session <url>`. */
  worktree: string | null;
}

const CLAIM_LINE = /^\s*Claimed\s+(\d{4}-\d{2}-\d{2}.*)$/im;
const FIELD_SEP = /\s+(?:·|—|•|-)\s+/;

export function parseClaim(body: string): Claim | null {
  const match = CLAIM_LINE.exec(body);
  if (!match) return null;
  const parts = (match[1] ?? '').split(FIELD_SEP);
  const head = parts[0] ?? '';
  const byAt = head.search(/\s+by\s+/i);
  const claimedAt = (byAt === -1 ? head : head.slice(0, byAt)).trim() || null;
  let who: string | null = null;
  let link: string | null = null;
  if (byAt !== -1) {
    const rest = head.slice(byAt).replace(/^\s+by\s+/i, '');
    const linkMatch = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(rest);
    if (linkMatch) {
      who = (linkMatch[1] ?? '').trim() || null;
      link = (linkMatch[2] ?? '').trim() || null;
    } else {
      who = rest.trim() || null;
    }
  }
  let branch: string | null = null;
  let worktree: string | null = null;
  for (const part of parts.slice(1)) {
    const branchMatch = /^branch\s+(.+)$/i.exec(part.trim());
    if (branchMatch) {
      const value = (branchMatch[1] ?? '').trim().replace(/^`|`$/g, '');
      branch = /^none yet\b/i.test(value) ? null : value || null;
      continue;
    }
    const treeMatch = /^worktree\s+(.+)$/i.exec(part.trim());
    if (treeMatch) worktree = (treeMatch[1] ?? '').trim().replace(/^`|`$/g, '') || null;
  }
  return { claimedAt, who, link, branch, worktree };
}

/** The newest claim in a thread (comments oldest-first or not; sorted here). */
export function latestClaim(comments: { createdAt: string; body: string }[]): Claim | null {
  const sorted = [...comments].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  for (const comment of sorted) {
    const claim = parseClaim(comment.body);
    if (claim) return claim;
  }
  return null;
}

/** Short owner label for a comment: session name plus worktree or cloud URL. */
export function describeOwner(claim: Claim | null): string {
  if (!claim) return 'an unknown session (no claim comment found)';
  const who = claim.who ?? 'an unnamed session';
  const where = claim.worktree ?? claim.branch;
  return where ? `${who} (${where})` : who;
}
