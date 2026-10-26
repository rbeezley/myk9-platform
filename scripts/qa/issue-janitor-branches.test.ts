import { describe, expect, it } from 'vitest';
import { orderedWrites } from './issue-janitor';
import { linksIssue } from './issue-janitor-github';
import { planJanitor } from './issue-janitor-plan';
import type { BranchInfo, GitHubReader } from './issue-janitor-types';
import {
  NOW,
  DEPLOYED,
  board,
  ago,
  pr,
  github,
  branches,
  inProgress,
  plan1,
  comments,
} from './issue-janitor-fixtures';

describe('boundaries', () => {
  it('treats a last comment of exactly 6 h as not live and 5 h 59 m as live', () => {
    expect(plan1(inProgress('MYK9-300', comments(6)), []).action).toBe('to-todo');
    expect(plan1(inProgress('MYK9-300', comments(5.98)), []).action).toBe('skip');
  });

  it('comments on a PR idle exactly 48 h and not on one idle 47 h 59 m', () => {
    const idle = (h: number) => [
      pr(9300, { state: 'open', closedAt: null, headCommittedAt: ago(h) }),
    ];
    expect(plan1(inProgress('MYK9-300', comments(80)), idle(48)).action).toBe('comment-stale-pr');
    expect(plan1(inProgress('MYK9-300', comments(80)), idle(47.98)).action).toBe('skip');
  });

  it('treats a branch tip of exactly 24 h as inactive and 23 h 59 m as active', () => {
    const tip = (h: number): BranchInfo[] => [
      { name: 'claude/myk9-300-x', tipAt: ago(h), worktree: null },
    ];
    expect(plan1(inProgress('MYK9-300', comments(80)), [], tip(24)).action).toBe('to-todo');
    expect(plan1(inProgress('MYK9-300', comments(80)), [], tip(23.98)).action).toBe('skip');
  });
});

describe('branch and PR interplay', () => {
  it('counts a branch checked out in a worktree as active whatever its tip date', () => {
    const tree: BranchInfo[] = [{ name: 'claude/myk9-300-x', tipAt: ago(72), worktree: '/wt/300' }];
    const p = plan1(inProgress('MYK9-300', comments(80)), [], tree);
    expect(p.action).toBe('skip');
    expect(p.reason).toContain('/wt/300');
  });

  it('lets an active matching branch win over a closed-unmerged PR', () => {
    const tree: BranchInfo[] = [{ name: 'claude/myk9-300-x', tipAt: ago(2), worktree: null }];
    const p = plan1(inProgress('MYK9-300', comments(80)), [pr(9301, {})], tree);
    expect(p.action).toBe('skip');
    expect(p.reason).toContain('claude/myk9-300-x');
  });

  it('never moves the issue on a merged Ignore-only (partial) PR', () => {
    const p = plan1(inProgress('MYK9-300', comments(80)), [
      pr(9302, { merged: true, mergedAt: ago(20), partial: true }),
    ]);
    expect(p.action).toBe('skip');
    expect(p.reason).toBe('partial PR #9302 merged (Ignore); the root reconciles');
  });

  it('turns a failed GitHub read into a skip instead of aborting the run', () => {
    const failing = plan1(inProgress('MYK9-300', comments(80)), [], [], {
      prsForIssue: () => {
        throw new Error('HTTP 502');
      },
    });
    expect(failing.action).toBe('skip');
    expect(failing.reason).toBe('GitHub read failed: HTTP 502');
  });
});

describe('linksIssue kinds', () => {
  const pull = (body: string, ref: string) =>
    ({ body, head: { ref, sha: 'x' } }) as Parameters<typeof linksIssue>[0];
  it('marks Ignore-without-Fixes as partial', () => {
    expect(linksIssue(pull('Ignore MYK9-5', 'feat/x'), 5)).toBe('partial');
    expect(linksIssue(pull('Fixes MYK9-5\nIgnore MYK9-5', 'feat/x'), 5)).toBe('full');
    expect(linksIssue(pull('', 'claude/myk9-5-x'), 5)).toBe('full');
  });
});

describe('merged PR with continuing implementation', () => {
  const merged = [pr(9400, { merged: true, mergedAt: ago(20) })];
  const labelled = { ...inProgress('MYK9-400', comments(80)), labels: ['verify:browser'] };

  it('stays In Progress while a matching branch is active', () => {
    const fresh: BranchInfo[] = [{ name: 'claude/myk9-400-more', tipAt: ago(2), worktree: null }];
    const p = plan1(labelled, merged, fresh);
    expect(p.action).toBe('skip');
    expect(p.reason).toBe(
      'PR #9400 merged but branch claude/myk9-400-more is active; implementation continuing'
    );
  });

  it('moves to In Review when the branch is old and has no worktree', () => {
    const old: BranchInfo[] = [{ name: 'claude/myk9-400-more', tipAt: ago(72), worktree: null }];
    expect(plan1(labelled, merged, old).action).toBe('fresh-read');
  });
});

describe('fallback template and snapshot', () => {
  const plan = planJanitor(board, github, branches, NOW);

  it('declares the fillable {{owed}} template and never says "name them here"', () => {
    for (const p of plan) {
      for (const w of [...p.writes, ...Object.values(p.outcomes ?? {}).flat()]) {
        expect(w.args.body ?? '').not.toContain('name them here');
      }
    }
    const p = plan.find(e => e.issue === 'MYK9-102')!;
    const body = p.outcomes!.inReview!.find(w => w.tool === 'save_comment')!.args.body!;
    expect(p.fill).toEqual(['owed']);
    expect(body.split('\n')[1]).toBe('Owed: {{owed}}');
    expect(/^\s*Owed:\s*(.+)$/im.exec(body)?.[1]).toBe('{{owed}}');
  });

  it('orderedWrites on the fixture board holds no Done and no In Review write', () => {
    const states = orderedWrites(plan).map(w => w.args.state);
    expect(states).not.toContain('Done');
    expect(states).not.toContain('In Review');
    expect(states).toContain('Todo');
  });

  it('echoes state, labels and newest comment time for every entry', () => {
    const p = plan.find(e => e.issue === 'MYK9-101')!;
    expect(p.snapshot).toEqual({
      state: 'In Progress',
      labels: ['verify:browser'],
      newestCommentAt: '2026-10-20T16:00:00.000Z',
    });
    expect(plan.every(e => e.snapshot !== undefined)).toBe(true);
  });
});

describe('claim branch lookup', () => {
  const claimed = (branch: string) => ({
    ...inProgress('MYK9-500', comments(80)),
    comments: [
      {
        createdAt: ago(80),
        body: `Claimed 2026-10-20 09:00 PDT by s · branch ${branch} · worktree /wt/500`,
      },
    ],
  });

  it('asks the reader about the claim branch, deduplicated with prefix branches', () => {
    const calls: string[][] = [];
    const tree: BranchInfo[] = [{ name: 'claude/myk9-500-a', tipAt: ago(72), worktree: null }];
    planJanitor(
      { issues: [claimed('claude/myk9-500-a')] },
      {
        ...github,
        prsForIssue: (_n, names) => {
          calls.push(names);
          return [];
        },
      },
      tree,
      NOW
    );
    expect(calls).toEqual([['claude/myk9-500-a']]);
    const other: string[][] = [];
    planJanitor(
      { issues: [claimed('feat/odd-name')] },
      {
        ...github,
        prsForIssue: (_n, names) => {
          other.push(names);
          return [];
        },
      },
      tree,
      NOW
    );
    expect(other).toEqual([['claude/myk9-500-a', 'feat/odd-name']]);
  });

  it('does not return the issue to Todo when a PR is found only through the claim branch', () => {
    const reader: GitHubReader = {
      ...github,
      prsForIssue: (_n, names) =>
        names.includes('feat/odd-name') ? [pr(9500, { merged: true, mergedAt: ago(20) })] : [],
    };
    const [p] = planJanitor({ issues: [claimed('feat/odd-name')] }, reader, [], NOW);
    expect(p?.action).toBe('fresh-read');
    const [none] = planJanitor(
      { issues: [claimed('none yet, prefix claude/myk9-500-')] },
      reader,
      [],
      NOW
    );
    expect(none?.action).toBe('to-todo');
  });
});

describe('claim branch activity and merged-PR idempotency', () => {
  const claimLine = (branch: string) =>
    `Claimed 2026-10-20 09:00 PDT by s · branch ${branch} · worktree /wt/x`;
  const claimedIssue = (branch: string, extra: { createdAt: string; body: string }[] = []) => ({
    ...inProgress('MYK9-600', comments(80)),
    comments: [{ createdAt: ago(80), body: claimLine(branch) }, ...extra],
  });

  it('treats a worktree on a claim branch outside the prefixes as active', () => {
    const tree: BranchInfo[] = [{ name: 'feature/x', tipAt: ago(72), worktree: '/wt/feature-x' }];
    const p = plan1(claimedIssue('feature/x'), [], tree);
    expect(p.action).toBe('skip');
    expect(p.reason).toContain('/wt/feature-x');
  });

  it('keys the merged-PR comments so a second run does not repeat them', () => {
    const merged = [pr(9600, { merged: true, mergedAt: ago(20) })];
    const first = plan1(claimedIssue('none yet'), merged);
    expect(first.outcomes!.inReview![1]!.args.body).toContain('janitor: merged#9600-in-review');
    const stay = first.outcomes!.stayInProgress![0]!.args.body!;
    expect(stay).toContain('janitor: merged#9600-stay');
    const second = plan1(claimedIssue('none yet', [{ createdAt: ago(30), body: stay }]), merged);
    // A prior stay decision never hides newer evidence: the issue is re-read every run,
    // and only its own duplicate comment is suppressed.
    expect(second.action).toBe('fresh-read');
    expect(second.reason).toContain('stay comment already posted');
    expect(second.outcomes!.stayInProgress).toEqual([]);
    expect(second.outcomes!.inReview![1]!.args.body).toContain('janitor: merged#9600-in-review');
    expect(second.outcomes!.done).toEqual([
      { tool: 'save_issue', args: { id: second.issue, state: 'Done' } },
    ]);
  });

  it('ignores a merged undeployed partial PR in the In Review pass and quotes only full PRs', () => {
    const issue = {
      ...board.issues.find(i => i.id === 'MYK9-201')!,
      comments: [{ createdAt: ago(60), body: 'Owed: production evidence that the cron ran' }],
    };
    const prs = [
      pr(9701, { merged: true, mergedAt: ago(40) }),
      pr(9702, { merged: true, mergedAt: ago(40), partial: true }),
    ];
    const [p] = planJanitor(
      { issues: [issue] },
      { prsForIssue: () => prs, isDeployed: x => x.number !== 9702 },
      [],
      NOW,
      { deployedCommit: DEPLOYED }
    );
    expect(p?.action).toBe('fresh-read');
    expect(p?.outcomes!.done![0]!.args.body).toContain('PR #9701 ');
    expect(p?.outcomes!.done![0]!.args.body).not.toContain('9702');
  });
});
