export type JanitorState = 'In Progress' | 'In Review';

export interface BoardComment {
  createdAt: string;
  body: string;
}

export interface BoardIssue {
  /** `MYK9-1434` */
  id: string;
  state: JanitorState | string;
  labels: string[];
  updatedAt: string;
  comments: BoardComment[];
}

export interface Board {
  issues: BoardIssue[];
}

export interface PrInfo {
  number: number;
  url: string;
  state: 'open' | 'closed';
  merged: boolean;
  headRefName: string;
  headSha: string;
  /** Committer date of the head commit: "has the head moved" is this. */
  headCommittedAt: string;
  mergedAt: string | null;
  closedAt: string | null;
  /** Linked only by `Ignore MYK9-<n>` (no `Fixes`): a partial PR never moves the issue. */
  partial: boolean;
  /** Last PR comment or title, shown as the reason a PR closed unmerged. */
  closeNote: string | null;
}

export interface BranchInfo {
  name: string;
  /** Newest commit date on the branch. */
  tipAt: string;
  /** Present when a local worktree has the branch checked out. */
  worktree: string | null;
}

/** Everything the planner needs from GitHub; injected so tests never hit the network. */
export interface GitHubReader {
  prsForIssue(issueNumber: number, branchNames: string[]): PrInfo[];
  /** Is the PR's merge commit an ancestor of (or equal to) the deployed commit? */
  isDeployed(pr: PrInfo, deployedCommit: string): boolean;
}

export type JanitorAction =
  'to-in-review' | 'to-done-candidate' | 'to-todo' | 'comment-stale-pr' | 'skip';

export interface McpWrite {
  tool: 'save_issue' | 'save_comment';
  args: Record<string, string>;
}

export interface PlanEntry {
  issue: string;
  action: JanitorAction;
  reason: string;
  comment: string | null;
  /** Writes the session executes in order. Never contains a Done write. */
  writes: McpWrite[];
  /** `to-done-candidate` only: executed after a fresh `get_issue` read shows every criterion met. */
  doneWrites: McpWrite[];
  /** `to-done-candidate` from In Progress: executed instead if the fresh read finds a criterion unmet. */
  fallbackWrites: McpWrite[];
}

export interface PlanOptions {
  deployedCommit?: string;
}

export const HOUR_MS = 3_600_000;
export const LIVE_SESSION_MS = 6 * HOUR_MS;
export const STALE_PR_MS = 48 * HOUR_MS;
export const BRANCH_ACTIVE_MS = 24 * HOUR_MS;
export const BRANCH_PREFIXES = ['claude/', 'codex/', 'richardbeezley1/'] as const;
