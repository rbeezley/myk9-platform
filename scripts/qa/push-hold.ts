/**
 * Repository-wide operator push hold. This runs from .githooks/pre-push, before
 * any ref is updated, and deliberately never writes a PR/evidence comment.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { commentTrusted, type GateComment } from './review-gate.ts';

const COMMENTS_PER_PAGE = 100;
// Freshness window: GitHub search indexes new and edited comments with a lag
// (typically seconds to a few minutes, occasionally longer), so every comment
// UPDATED within this bound is read straight from the feed, which covers both
// new comments and old ones edited into a directive. Comments last updated
// earlier are indexed with their current body and come from search. 60 minutes
// is a deliberately conservative multiple of the observed lag.
const SEARCH_LAG_WINDOW_MS = 60 * 60 * 1000;
// Page cap for that window. If it is hit while the window still has comments
// (about 2000 updates inside an hour, far above normal review volume) the scan
// fails closed, because a hold in the uncovered gap could be neither seen here
// nor indexed yet (MYK9-1015). Volume outside the window cannot block pushes.
const RECENT_COMMENT_PAGES = 20;
// A search or per-PR listing that cannot be read to its end fails closed.
const MAX_SEARCH_PAGES = 10;
const MAX_PR_COMMENT_PAGES = 30;
// The newest-first scan reads to the start of the repo's history when it finds no directive
// (6,686 comments on 2026-10-22), so comment volume alone never blocks it. This cap only stops
// a feed that never ends; it is 100k comments.
const MAX_SCAN_PAGES = 1000;
// What the Claude Code cloud proxy says when it refuses a non-repository path such as
// `search/issues` (MYK9-1325). Only this refusal falls back to the scan; every other search
// error still fails closed.
const SEARCH_REFUSED_BY_PROXY = /sessions are bound to their configured repositories/i;
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
    // Captured, not printed: a refusal the hook handles must not read as a failure, and any
    // error it does not handle carries this text into the PUSH BLOCKED message.
    stdio: ['ignore', 'pipe', 'pipe'],
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

/** Whether an issue number is a pull request, read once per number. */
function pullRequestChecker(repo: string): (issue: number) => boolean {
  const cache = new Map<number, boolean>();
  return issue => {
    let isPr = cache.get(issue);
    if (isPr === undefined) {
      isPr = Boolean(
        ghJson<{ pull_request?: unknown }>(`repos/${repo}/issues/${issue}`).pull_request
      );
      cache.set(issue, isPr);
    }
    return isPr;
  };
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

/**
 * Every comment updated inside the search-lag window, straight from the repo
 * feed. The window is keyed on updated_at (`since` filters on it), so an old
 * comment edited into a directive is seen; ordering among directives still
 * uses created_at, which edits cannot change.
 */
function latestRecentDirective(repo: string): PushDirective | undefined {
  let latest: PushDirective | undefined;
  const isPullRequest = pullRequestChecker(repo);
  const since = encodeURIComponent(new Date(Date.now() - SEARCH_LAG_WINDOW_MS).toISOString());
  for (let page = 1; page <= RECENT_COMMENT_PAGES; page++) {
    const comments = ghJson<GitHubComment[]>(
      `repos/${repo}/issues/comments?sort=updated&direction=desc&since=${since}&per_page=${COMMENTS_PER_PAGE}&page=${page}`
    );
    if (!Array.isArray(comments))
      throw new Error('GitHub issue comments response was not an array');
    for (const comment of comments) {
      commentTime(comment);
      const pr = issueNumberOf(comment);
      const directive = parsePushDirective(comment, pr);
      if (directive && isPullRequest(pr)) latest = newer(latest, directive);
    }
    if (comments.length < COMMENTS_PER_PAGE) return latest;
  }
  throw new Error(
    `more than ${RECENT_COMMENT_PAGES * COMMENTS_PER_PAGE} comments were updated in the last ${SEARCH_LAG_WINDOW_MS / 60_000} minutes, so a fresh directive cannot be ruled out; ask an owner or member to post PUSH RELEASE on a PR`
  );
}

/**
 * The newest trusted PR directive, found without search: every comment newest-created first,
 * stopping once the first directive's second is fully read (same-second directives order by ID).
 * It reads current bodies, so there is no indexing lag, and directives order by creation time,
 * so an older comment edited into a directive could never have won anyway. Used where search
 * is refused (MYK9-1325); explicit `page=` because the proxy also refuses the numeric-ID paths
 * GitHub's Link headers point at.
 */
function latestDirectiveByScan(repo: string): PushDirective | undefined {
  let latest: PushDirective | undefined;
  let stopBefore: number | undefined;
  const isPullRequest = pullRequestChecker(repo);
  for (let page = 1; page <= MAX_SCAN_PAGES; page++) {
    const comments = ghJson<GitHubComment[]>(
      `repos/${repo}/issues/comments?sort=created&direction=desc&per_page=${COMMENTS_PER_PAGE}&page=${page}`
    );
    if (!Array.isArray(comments))
      throw new Error('GitHub issue comments response was not an array');
    for (const comment of comments) {
      const createdAt = commentTime(comment);
      if (stopBefore !== undefined && createdAt < stopBefore) return latest;
      const pr = issueNumberOf(comment);
      const directive = parsePushDirective(comment, pr);
      if (!directive || !isPullRequest(pr)) continue;
      latest = newer(latest, directive);
      stopBefore ??= createdAt;
    }
    if (comments.length < COMMENTS_PER_PAGE) return latest;
  }
  throw new Error(`the comment feed did not end within ${MAX_SCAN_PAGES} pages`);
}

function searchRefusedByProxy(error: unknown): boolean {
  const stderr = (error as { stderr?: unknown } | null)?.stderr;
  return SEARCH_REFUSED_BY_PROXY.test(`${String(stderr ?? '')}\n${String(error)}`);
}

export function fetchPushDirective(): PushDirective | undefined {
  // REST, not `gh repo view`: that goes through GraphQL, which cloud sessions
  // cannot reach, so every cloud push failed closed here. gh fills
  // {owner}/{repo} from the git remote.
  const repo = gh(['api', 'repos/{owner}/{repo}', '--jq', '.full_name']).trim();
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('cannot resolve GitHub repository');
  let directivePrs: Set<number>;
  try {
    directivePrs = searchDirectivePrs(repo);
  } catch (error) {
    // Claude Code cloud sessions cannot reach search; scan the comments instead (MYK9-1325).
    if (searchRefusedByProxy(error)) return latestDirectiveByScan(repo);
    throw error;
  }
  // Two sources, newest wins: the recent feed (fresh) and every PR that search
  // says mentions a directive (old). No directive anywhere still means no hold.
  let latest = latestRecentDirective(repo);
  for (const pr of directivePrs) {
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
