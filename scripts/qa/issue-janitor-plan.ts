/**
 * Issue janitor planner (MYK9-1434). Pure: board + injected GitHub reader +
 * branch list + clock in, plan out. It applies only the dispositions already
 * in docs/agents/issue-tracker.md and never writes anything itself; the
 * scheduled session executes `writes` with the Linear MCP. It changes state on
 * its own only for a closed-unmerged PR or an unclaimed issue (both to Todo);
 * anything that could mean Done, In Review or still In Progress is a `fresh-read`
 * entry whose `outcomes` the session picks from after reading the issue.
 */
import { describeOwner, latestClaim } from './issue-janitor-claim.ts';
import {
  BRANCH_ACTIVE_MS,
  BRANCH_PREFIXES,
  HOUR_MS,
  LIVE_SESSION_MS,
  STALE_PR_MS,
  type BoardComment,
  type BoardIssue,
  type BranchInfo,
  type GitHubReader,
  type McpWrite,
  type PlanEntry,
  type PlanOptions,
  type PrInfo,
  type Snapshot,
} from './issue-janitor-types.ts';

const HUMAN_OWED =
  /browser|walk|operator|decision|offline|physical|print|real.user|checkout|load|recovery|device/i;

export function issueNumber(id: string): number {
  const match = /(\d+)$/.exec(id);
  if (!match) throw new Error(`not an issue id: ${id}`);
  return Number(match[1]);
}

export function branchesForIssue(n: number, branches: BranchInfo[]): BranchInfo[] {
  const prefixes = BRANCH_PREFIXES.map(p => `${p}myk9-${n}-`);
  return branches.filter(b => prefixes.some(p => b.name.toLowerCase().startsWith(p)));
}

const janitorKey = (key: string) => `janitor: ${key}`;
const hasKey = (comments: BoardComment[], key: string) =>
  comments.some(c => c.body.includes(janitorKey(key)));

function lastCommentAt(issue: BoardIssue): number {
  const times = issue.comments.map(c => Date.parse(c.createdAt)).filter(Number.isFinite);
  // No comment at all: updatedAt stands in, so a claim made seconds ago without
  // its comment is still treated as a live session.
  return times.length ? Math.max(...times) : Date.parse(issue.updatedAt);
}

const entry = (
  issue: string,
  action: PlanEntry['action'],
  reason: string,
  comment: string | null = null,
  state: string | null = null
): PlanEntry => ({
  issue,
  action,
  reason,
  comment,
  writes: [
    ...(state ? [{ tool: 'save_issue' as const, args: { id: issue, state } }] : []),
    ...(comment
      ? [{ tool: 'save_comment' as const, args: { issueId: issue, body: comment } }]
      : []),
  ],
  fill: [],
});

const stateWrite = (issue: string, state: string): McpWrite => ({
  tool: 'save_issue',
  args: { id: issue, state },
});
const commentWrite = (issue: string, body: string): McpWrite => ({
  tool: 'save_comment',
  args: { issueId: issue, body },
});

function freshRead(issue: string, reason: string, outcomes: Record<string, McpWrite[]>): PlanEntry {
  const templated = Object.values(outcomes)
    .flat()
    .some(w => (w.args.body ?? '').includes('{{owed}}'));
  return {
    ...entry(issue, 'fresh-read', reason),
    outcomes,
    fill: templated ? ['owed'] : [],
  };
}

const skip = (issue: string, reason: string) => entry(issue, 'skip', reason);

function owedLine(issue: BoardIssue): string | null {
  const sorted = [...issue.comments].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)
  );
  for (const comment of sorted) {
    const match = /^\s*Owed:\s*(.+)$/im.exec(comment.body);
    if (match) return (match[1] ?? '').trim();
  }
  return null;
}

function verifyLabels(issue: BoardIssue): string[] {
  return issue.labels
    .filter(l => l.toLowerCase().startsWith('verify:'))
    .map(l => l.slice('verify:'.length).toLowerCase());
}

/** Active = checked out in a worktree, or a matching tip within 24 h. Returns the reason, or null. */
function branchActivity(
  matching: BranchInfo[],
  nowMs: number
): { reason: string; name: string; lastBranch: number | null } {
  const treeBranch = matching.find(b => b.worktree !== null);
  const newest = matching.map(b => Date.parse(b.tipAt)).filter(Number.isFinite);
  const lastBranch = newest.length ? Math.max(...newest) : null;
  if (treeBranch) {
    return {
      reason: `branch ${treeBranch.name} is checked out in worktree ${treeBranch.worktree}`,
      name: treeBranch.name,
      lastBranch,
    };
  }
  if (lastBranch !== null && nowMs - lastBranch < BRANCH_ACTIVE_MS) {
    const name = matching.find(b => Date.parse(b.tipAt) === lastBranch)?.name ?? '';
    return {
      reason: `branch ${name} had activity ${Math.floor((nowMs - lastBranch) / HOUR_MS)} h ago`,
      name,
      lastBranch,
    };
  }
  return { reason: '', name: '', lastBranch };
}

function planInProgress(
  issue: BoardIssue,
  prs: PrInfo[],
  matching: BranchInfo[],
  nowMs: number
): PlanEntry {
  const id = issue.id;
  const open = prs.filter(p => p.state === 'open');
  const merged = prs.filter(p => p.merged);
  const closed = prs.filter(p => p.state === 'closed' && !p.merged);

  if (open.length) {
    const moved = Math.max(...open.map(p => Date.parse(p.headCommittedAt)));
    const idle = nowMs - moved;
    if (idle < STALE_PR_MS)
      return skip(id, `open PR #${open[0]?.number} head moved ${Math.floor(idle / HOUR_MS)} h ago`);
    const pr = open.reduce((a, b) =>
      Date.parse(a.headCommittedAt) >= Date.parse(b.headCommittedAt) ? a : b
    );
    const key = `stale-pr#${pr.number}`;
    if (hasKey(issue.comments, key))
      return skip(id, `stale-PR comment for #${pr.number} already posted`);
    const owner = describeOwner(latestClaim(issue.comments));
    const comment =
      `PR ${pr.url} has not had a new commit for ${Math.floor(idle / HOUR_MS)} h (head ${pr.headSha.slice(0, 9)}). ` +
      `Claimed by ${owner}. Leaving the issue In Progress; that session or a new one should resume it.\n\n${janitorKey(key)}`;
    return entry(
      id,
      'comment-stale-pr',
      `open PR #${pr.number} idle ${Math.floor(idle / HOUR_MS)} h`,
      comment
    );
  }

  const activity = branchActivity(matching, nowMs);
  const lastBranch = activity.lastBranch;
  if (merged.length && activity.reason) {
    const full = merged.filter(p => !p.partial);
    if (full[0]) {
      return skip(
        id,
        `PR #${full[0].number} merged but branch ${activity.name} is active; implementation continuing`
      );
    }
  }
  if (merged.length) {
    const full = merged.filter(p => !p.partial);
    if (full.length === 0) {
      const partial = merged[0];
      return skip(id, `partial PR #${partial?.number} merged (Ignore); the root reconciles`);
    }
    const pr = full.reduce((a, b) =>
      Date.parse(a.mergedAt ?? '') >= Date.parse(b.mergedAt ?? '') ? a : b
    );
    const verify = verifyLabels(issue);
    const owed = verify.length ? verify.map(v => `verify:${v}`).join(', ') : '{{owed}}';
    if (hasKey(issue.comments, `merged#${pr.number}-stay`)) {
      return skip(
        id,
        'implementation still owed per the janitor comment; the session must resume it'
      );
    }
    const tag = (suffix: string) => `\n\n${janitorKey(`merged#${pr.number}-${suffix}`)}`;
    return freshRead(id, `PR #${pr.number} merged ${pr.mergedAt ?? ''}`, {
      done: [stateWrite(id, 'Done')],
      inReview: [
        stateWrite(id, 'In Review'),
        commentWrite(
          id,
          `PR ${pr.url} merged. Moving to In Review.\nOwed: ${owed}${tag('in-review')}`
        ),
      ],
      stayInProgress: [
        commentWrite(id, `PR ${pr.url} merged; implementation still owed: {{owed}}${tag('stay')}`),
      ],
    });
  }

  if (activity.reason) return skip(id, activity.reason);

  if (closed.length) {
    const pr = closed.reduce((a, b) =>
      Date.parse(a.closedAt ?? '') >= Date.parse(b.closedAt ?? '') ? a : b
    );
    const note = pr.closeNote ? ` Last note: ${pr.closeNote}` : ' No close note on the PR.';
    const comment = `PR ${pr.url} was closed without merging (${pr.closedAt ?? 'unknown time'}).${note} Returning to Todo.`;
    return entry(id, 'to-todo', `PR #${pr.number} closed unmerged`, comment, 'Todo');
  }

  const claimed = latestClaim(issue.comments)?.claimedAt ?? null;
  const stamp =
    lastBranch !== null ? new Date(lastBranch).toISOString() : (claimed ?? issue.updatedAt);
  return entry(
    id,
    'to-todo',
    'no PR and no branch activity in 24 h',
    `unclaimed since ${stamp}: no branch or PR activity`,
    'Todo'
  );
}

function planInReview(
  issue: BoardIssue,
  prs: PrInfo[],
  github: GitHubReader,
  deployed: string
): PlanEntry {
  const id = issue.id;
  const merged = prs.filter(p => p.merged);
  if (merged.length === 0) return skip(id, 'In Review with no merged PR found');
  if (merged.every(p => p.partial))
    return skip(id, 'only a partial (Ignore) PR merged; the root reconciles');
  if (prs.some(p => p.state === 'open')) return skip(id, 'a PR is still open');
  const full = merged.filter(p => !p.partial);
  const undeployed = full.filter(p => !github.isDeployed(p, deployed));
  if (undeployed.length)
    return skip(id, `PR #${undeployed[0]?.number} is not in the deployed commit`);
  const verify = verifyLabels(issue);
  if (verify.length) return skip(id, 'verify:* evidence owed; needs a check beyond the deploy');
  const owed = owedLine(issue);
  const prodOwed = owed !== null && /production/i.test(owed) && !HUMAN_OWED.test(owed);
  if (!prodOwed) return skip(id, 'no production-only evidence recorded as owed');
  const key = `prod-evidence#${id}`;
  const prLine = full.map(p => `#${p.number}`).join(', ');
  const evidence =
    `Production evidence: deployed commit ${deployed.slice(0, 9)} contains PR ${prLine} (merged ${full[0]?.mergedAt ?? ''}). ` +
    `Owed: ${owed}.`;
  const comment = hasKey(issue.comments, key) ? null : `${evidence}\n\n${janitorKey(key)}`;
  return freshRead(id, `merged PR ${prLine} deployed; production-only evidence`, {
    done: [...(comment ? [commentWrite(id, comment)] : []), stateWrite(id, 'Done')],
    leave: [],
  });
}

function snapshotOf(issue: BoardIssue): Snapshot {
  const times = issue.comments.map(c => Date.parse(c.createdAt)).filter(Number.isFinite);
  return {
    state: issue.state,
    labels: [...issue.labels],
    newestCommentAt: times.length ? new Date(Math.max(...times)).toISOString() : null,
  };
}

export function planJanitor(
  board: { issues: BoardIssue[] },
  github: GitHubReader,
  branches: BranchInfo[],
  now: Date,
  options: PlanOptions = {}
): PlanEntry[] {
  const nowMs = now.getTime();
  return board.issues.map(issue => ({ ...planIssue(issue), snapshot: snapshotOf(issue) }));

  function planIssue(issue: BoardIssue): PlanEntry {
    const id = issue.id;
    const inProgress = issue.state === 'In Progress';
    const inReview = issue.state === 'In Review';
    if (!inProgress && !inReview) return skip(id, `state ${issue.state} is not a janitor state`);
    if (issue.labels.some(l => l.toLowerCase().startsWith('needs:')))
      return skip(id, 'held on purpose (needs:* label)');
    if (inReview && !options.deployedCommit)
      return skip(id, 'In Review pass needs --deployed-commit');
    if (nowMs - lastCommentAt(issue) < LIVE_SESSION_MS)
      return skip(id, 'last comment under 6 h old (live session)');
    const n = issueNumber(id);
    const claimBranch = latestClaim(issue.comments)?.branch ?? null;
    const matching = [
      ...branchesForIssue(n, branches),
      ...branches.filter(b => b.name === claimBranch && !branchesForIssue(n, [b]).length),
    ];
    try {
      const names = new Set(matching.map(b => b.name));
      if (claimBranch) names.add(claimBranch);
      const prs = github.prsForIssue(n, [...names]);
      return inProgress
        ? planInProgress(issue, prs, matching, nowMs)
        : planInReview(issue, prs, github, options.deployedCommit ?? '');
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error);
      return skip(id, `GitHub read failed: ${why}`);
    }
  }
}
