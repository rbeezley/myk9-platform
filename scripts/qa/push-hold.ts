/**
 * Repository-wide operator push hold. This runs from .githooks/pre-push, before
 * any ref is updated, and deliberately never writes a PR/evidence comment.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { commentTrusted, type GateComment } from './review-gate.ts';

const COMMENTS_PER_PAGE = 100;
// A missing checkpoint never silently means "no hold": after this many
// comments, fail closed and ask an operator to post a fresh PUSH RELEASE.
const MAX_COMMENT_PAGES = 20;

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

export function fetchPushDirective(): PushDirective | undefined {
  // REST, not `gh repo view`: that goes through GraphQL, which cloud sessions
  // cannot reach, so every cloud push failed closed here. gh fills
  // {owner}/{repo} from the git remote.
  const repo = gh(['api', 'repos/{owner}/{repo}', '--jq', '.full_name']).trim();
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('cannot resolve GitHub repository');
  // Repository issue comments include PRs after they close. Read newest first.
  // GitHub timestamps have second precision and the order within a second is
  // unspecified, so continue through the ENTIRE timestamp bucket (including
  // the next page) and break ties by comment ID before returning a directive.
  let latest: PushDirective | undefined;
  let latestTime = -Infinity;
  const prCache = new Map<number, boolean>();
  for (let page = 1; page <= MAX_COMMENT_PAGES; page++) {
    const endpoint = `repos/${repo}/issues/comments?sort=created&direction=desc&per_page=${COMMENTS_PER_PAGE}&page=${page}`;
    const comments = JSON.parse(gh(['api', endpoint])) as GitHubComment[];
    if (!Array.isArray(comments))
      throw new Error('GitHub issue comments response was not an array');
    for (const comment of comments) {
      const createdAt = Date.parse(comment.created_at);
      if (!Number.isFinite(createdAt)) {
        throw new Error(`invalid creation time on comment ${comment.id}`);
      }
      if (latest && createdAt < latestTime) return latest;
      const issueNumber = /\/issues\/(\d+)$/.exec(comment.issue_url ?? '')?.[1];
      if (!issueNumber) throw new Error(`issue URL missing from comment ${comment.id}`);
      const directive = parsePushDirective(comment, Number(issueNumber));
      if (!directive) continue;
      const pr = Number(issueNumber);
      let isPr = prCache.get(pr);
      if (isPr === undefined) {
        const issue = JSON.parse(gh(['api', `repos/${repo}/issues/${pr}`])) as {
          pull_request?: unknown;
        };
        isPr = Boolean(issue.pull_request);
        prCache.set(pr, isPr);
      }
      if (!isPr) continue;
      if (
        !latest ||
        createdAt > latestTime ||
        (createdAt === latestTime && directive.commentId > latest.commentId)
      ) {
        latest = directive;
        latestTime = createdAt;
      }
    }
    if (comments.length < COMMENTS_PER_PAGE) return latest;
  }
  throw new Error(
    `scanned ${MAX_COMMENT_PAGES * COMMENTS_PER_PAGE} newest comments without resolving the latest trusted PR directive; ask an owner or member to post PUSH RELEASE on a PR`
  );
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
