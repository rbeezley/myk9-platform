import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { planJanitor } from './issue-janitor-plan';
import type { Board, BranchInfo, GitHubReader, PrInfo } from './issue-janitor-types';

export const NOW = new Date('2026-10-26T12:00:00Z');
export const DEPLOYED = 'deadbeef0000000000000000000000000000cafe';
export const board = JSON.parse(
  readFileSync(join(__dirname, 'fixtures/issue-janitor/board.json'), 'utf8')
) as Board;
export const empty = JSON.parse(
  readFileSync(join(__dirname, 'fixtures/issue-janitor/board-empty.json'), 'utf8')
) as Board;

export const ago = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString();

export function pr(n: number, over: Partial<PrInfo>): PrInfo {
  return {
    number: n,
    url: `https://github.com/rbeezley/myk9-platform/pull/${n}`,
    state: 'closed',
    merged: false,
    headRefName: `claude/myk9-${n}-x`,
    headSha: 'abcdef123456789',
    headCommittedAt: ago(100),
    mergedAt: null,
    partial: false,
    closedAt: ago(30),
    closeNote: null,
    ...over,
  };
}

export const PRS: Record<number, PrInfo[]> = {
  101: [pr(9101, { merged: true, mergedAt: ago(20) })],
  102: [pr(9102, { merged: true, mergedAt: ago(20) })],
  103: [pr(9103, { closeNote: 'superseded by the batch PR' })],
  104: [pr(9104, { state: 'open', closedAt: null, headCommittedAt: ago(50) })],
  105: [pr(9105, { state: 'open', closedAt: null, headCommittedAt: ago(10) })],
  110: [pr(9110, { state: 'open', closedAt: null, headCommittedAt: ago(60) })],
  201: [pr(9201, { merged: true, mergedAt: ago(40) })],
  202: [pr(9202, { merged: true, mergedAt: ago(40) })],
  203: [pr(9203, { merged: true, mergedAt: ago(1) })],
  204: [pr(9204, { merged: true, mergedAt: ago(40) })],
  205: [pr(9205, { merged: true, mergedAt: ago(40) })],
  206: [pr(9206, { merged: true, mergedAt: ago(40) })],
  207: [pr(9207, { merged: true, mergedAt: ago(40) })],
};

export const github: GitHubReader = {
  prsForIssue: n => PRS[n] ?? [],
  isDeployed: p => p.number !== 9203,
};

export const branches: BranchInfo[] = [
  { name: 'claude/myk9-107-fresh', tipAt: ago(3), worktree: '/wt/107' },
  { name: 'codex/myk9-106-old', tipAt: ago(72), worktree: null },
  { name: 'claude/myk9-1070-other', tipAt: ago(1), worktree: null },
];

export const byIssue = (plan: ReturnType<typeof planJanitor>) =>
  Object.fromEntries(plan.map(p => [p.issue.replace('MYK9-', ''), p]));

export const base = board.issues[0]!;
export const inProgress = (id: string, comments: { createdAt: string; body: string }[]) => ({
  ...base,
  id,
  labels: [] as string[],
  comments,
});
export const plan1 = (
  issue: ReturnType<typeof inProgress>,
  prs: PrInfo[],
  tree: BranchInfo[] = [],
  gh: Partial<GitHubReader> = {}
) => planJanitor({ issues: [issue] }, { ...github, prsForIssue: () => prs, ...gh }, tree, NOW)[0]!;
export const comments = (hoursAgo: number) => [{ createdAt: ago(hoursAgo), body: 'note' }];
