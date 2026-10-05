/**
 * Repository-wide operator push hold. This runs from .githooks/pre-push, before
 * any ref is updated, and deliberately never writes a PR/evidence comment.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { commentTrusted, type GateComment } from './review-gate.ts';

const COMMENTS_PER_PAGE = 100;
// Freshness window: GitHub search indexes new comments with a lag (typically
// seconds to a few minutes, occasionally longer), so every comment newer than
// this bound is read straight from the feed; older ones are found by search.
// 60 minutes is a deliberately conservative multiple of the observed lag.
const SEARCH_LAG_WINDOW_MS = 60 * 60 * 1000;
// Page cap for covering that window. If the cap is hit before the window is
// covered (about 2000 comments inside an hour, far above normal review
// volume) the scan fails closed, because a hold in the uncovered gap could be
// neither seen here nor indexed yet (MYK9-1015). Volume outside the window
// can no longer block pushes.
const RECENT_COMMENT_PAGES = 20;
// A search or per-PR listing that cannot be read to its end fails closed.
const MAX_SEARCH_PAGES = 10;
const MAX_PR_COMMENT_PAGES = 30;
// Phrases parsePushDirective recognizes; each is searched separately because
// GitHub search has no OR across quoted phrases inside comments.
const DIRECTIVE_SEARCH_PHRASES = [
  'PUSH HOLD',
  'PUSH RELEASE',
  'Hold all pushes until further notice',
];

interface GitHubComment {
  id: number;
  body: string;
  created_at: string;
  author_association: string;
  issue_url: string;
}

interface PushDirective {
  kind: 'hold' | 'release';
  reason?: string;
  pr: number;
  commentId: number;
  /** Creation time is immutable; editing an old comment cannot reorder directives. */
  createdAt: string;
}

export function parsePushRefs(input: string): string[] {
  return input
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => {
      const fields = line.trim().split(/\s+/);
      if (fields.length !== 4 || !fields[2]?.startsWith('refs/')) {
        throw new Error(`invalid pre-push ref line: ${line}`);
      }
      return fields[2];
    });
}

export function parsePushDirective(comment: GitHubComment, pr: number): PushDirective | undefined {
  const gateComment: GateComment = {
    body: comment.body,
    createdAt: comment.created_at,
    authorAssociation: comment.author_association,
  };
  if (!commentTrusted(gateComment)) return undefined;
  const firstLine = comment.body.split(/\r?\n/, 1)[0] ?? '';
  const hold = /^PUSH HOLD:\s*(\S.*)$/i.exec(firstLine);
  const historicalHold = /^Hold all pushes until further notice\s*[—–-]\s*(\S.*)$/i.exec(firstLine);
  if (hold || historicalHold) {
    return {
      kind: 'hold',
      reason: (hold ?? historicalHold)?.[1],
      pr,
      commentId: comment.id,
      createdAt: comment.created_at,
    };
  }
  if (/^PUSH RELEASE$/i.test(firstLine)) {
    return {
      kind: 'release',
      pr,
      commentId: comment.id,
      createdAt: comment.created_at,
    };
  }
  return undefined;
}

function gh(args: string[]): string {
  return execFileSync(process.env.GH_BIN ?? 'gh', args, {
    encoding: 'utf8',
    timeout: 15_000,
    maxBuffer: 20 * 1024 * 1024,
  });
}

function ghJson<T>(endpoint: string): T {
  return JSON.parse(gh(['api', endpoint])) as T;
}

/** Keeps the newest directive; GitHub timestamps are per-second, so ties go to the higher ID. */
function newer(a: PushDirective | undefined, b: PushDirective): PushDirective {
  if (!a) return b;
  const ta = Date.parse(a.createdAt);
  const tb = Date.parse(b.createdAt);
  return tb > ta || (tb === ta && b.commentId > a.commentId) ? b : a;
}

function commentTime(comment: GitHubComment): number {
  const createdAt = Date.parse(comment.created_at);
  if (!Number.isFinite(createdAt))
    throw new Error(`invalid creation time on comment ${comment.id}`);
  return createdAt;
}

function issueNumberOf(comment: GitHubComment): number {
  const n = /\/issues\/(\d+)$/.exec(comment.issue_url ?? '')?.[1];
  if (!n) throw new Error(`issue URL missing from comment ${comment.id}`);
  return Number(n);
}

/** PR numbers whose comments mention a directive phrase, at any age. */
function searchDirectivePrs(repo: string): Set<number> {
  const prs = new Set<number>();
  for (const phrase of DIRECTIVE_SEARCH_PHRASES) {
    const q = encodeURIComponent(`repo:${repo} is:pr in:comments "${phrase}"`);
    for (let page = 1; ; page++) {
      if (page > MAX_SEARCH_PAGES)
        throw new Error(`directive search for "${phrase}" is too large to read`);
      const result = ghJson<{
        incomplete_results?: boolean;
        items?: { number: number }[];
      }>(`search/issues?q=${q}&per_page=${COMMENTS_PER_PAGE}&page=${page}`);
      if (result.incomplete_results)
        throw new Error(`directive search for "${phrase}" was incomplete`);
      if (!Array.isArray(result.items)) throw new Error('GitHub search response had no items');
      for (const item of result.items) prs.add(item.number);
      if (result.items.length < COMMENTS_PER_PAGE) break;
    }
  }
  return prs;
}

function latestDirectiveOnPr(repo: string, pr: number): PushDirective | undefined {
  let latest: PushDirective | undefined;
  for (let page = 1; ; page++) {
    if (page > MAX_PR_COMMENT_PAGES) throw new Error(`PR #${pr} has too many comments to read`);
    const comments = ghJson<GitHubComment[]>(
      `repos/${repo}/issues/${pr}/comments?per_page=${COMMENTS_PER_PAGE}&page=${page}`
    );
    if (!Array.isArray(comments)) throw new Error('GitHub PR comments response was not an array');
    for (const comment of comments) {
      commentTime(comment);
      const directive = parsePushDirective({ ...comment, issue_url: comment.issue_url ?? '' }, pr);
      if (directive) latest = newer(latest, directive);
    }
    if (comments.length < COMMENTS_PER_PAGE) return latest;
  }
}

/** Newest comments straight from the repo feed, so a directive posted seconds ago is never missed. */
function latestRecentDirective(repo: string): PushDirective | undefined {
  let latest: PushDirective | undefined;
  let latestTime = -Infinity;
  const prCache = new Map<number, boolean>();
  const windowStart = Date.now() - SEARCH_LAG_WINDOW_MS;
  for (let page = 1; page <= RECENT_COMMENT_PAGES; page++) {
    const comments = ghJson<GitHubComment[]>(
      `repos/${repo}/issues/comments?sort=created&direction=desc&per_page=${COMMENTS_PER_PAGE}&page=${page}`
    );
    if (!Array.isArray(comments))
      throw new Error('GitHub issue comments response was not an array');
    for (const comment of comments) {
      const createdAt = commentTime(comment);
      // GitHub timestamps have second precision and the order within a second
      // is unspecified, so finish the whole timestamp bucket before returning.
      if (latest && createdAt < latestTime) return latest;
      const pr = issueNumberOf(comment);
      const directive = parsePushDirective(comment, pr);
      if (!directive) continue;
      let isPr = prCache.get(pr);
      if (isPr === undefined) {
        isPr = Boolean(
          ghJson<{ pull_request?: unknown }>(`repos/${repo}/issues/${pr}`).pull_request
        );
        prCache.set(pr, isPr);
      }
      if (!isPr) continue;
      latest = newer(latest, directive);
      latestTime = Date.parse(latest.createdAt);
    }
    if (comments.length < COMMENTS_PER_PAGE) return latest;
    const oldest = Math.min(...comments.map(commentTime));
    // A directive's own timestamp bucket may straddle the page boundary.
    if (oldest < windowStart && (!latest || oldest < latestTime)) return latest;
  }
  throw new Error(
    `the newest ${RECENT_COMMENT_PAGES * COMMENTS_PER_PAGE} comments all fall inside the last ${SEARCH_LAG_WINDOW_MS / 60_000} minutes, so a fresh directive cannot be ruled out; ask an owner or member to post PUSH RELEASE on a PR`
  );
}

export function fetchPushDirective(): PushDirective | undefined {
  // REST, not `gh repo view`: that goes through GraphQL, which cloud sessions
  // cannot reach, so every cloud push failed closed here. gh fills
  // {owner}/{repo} from the git remote.
  const repo = gh(['api', 'repos/{owner}/{repo}', '--jq', '.full_name']).trim();
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('cannot resolve GitHub repository');
  // Two sources, newest wins: the recent feed (fresh) and every PR that search
  // says mentions a directive (old). No directive anywhere still means no hold.
  let latest = latestRecentDirective(repo);
  for (const pr of searchDirectivePrs(repo)) {
    const found = latestDirectiveOnPr(repo, pr);
    if (found) latest = newer(latest, found);
  }
  return latest;
}

export function main(): number {
  try {
    const refs = parsePushRefs(readFileSync(0, 'utf8'));
    if (refs.length === 0) return 0;
    const latest = fetchPushDirective();
    if (latest?.kind === 'hold') {
      process.stderr.write(
        `PUSH BLOCKED: ${latest.reason} (trusted hold on PR #${latest.pr}, comment ${latest.commentId}).\n` +
          `Refs withheld: ${refs.join(', ')}. A newer trusted PUSH RELEASE comment on any PR lifts the hold.\n`
      );
      return 1;
    }
    return 0;
  } catch (error) {
    process.stderr.write(
      `PUSH BLOCKED: could not verify operator hold state: ${String(error)}. No refs were pushed.\n`
    );
    return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
