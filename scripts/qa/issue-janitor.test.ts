import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readBranches } from './issue-janitor-github';
import { parseArgs, render, summaryMarkdown } from './issue-janitor';
import { describeOwner, latestClaim, parseClaim } from './issue-janitor-claim';
import { linksIssue } from './issue-janitor-github';
import { branchesForIssue, planJanitor } from './issue-janitor-plan';
import type { Board, BranchInfo, GitHubReader, PrInfo } from './issue-janitor-types';

const NOW = new Date('2026-10-26T12:00:00Z');
const DEPLOYED = 'deadbeef0000000000000000000000000000cafe';
const board = JSON.parse(
  readFileSync(join(__dirname, 'fixtures/issue-janitor/board.json'), 'utf8')
) as Board;
const empty = JSON.parse(
  readFileSync(join(__dirname, 'fixtures/issue-janitor/board-empty.json'), 'utf8')
) as Board;

const ago = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString();

function pr(n: number, over: Partial<PrInfo>): PrInfo {
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

const PRS: Record<number, PrInfo[]> = {
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

const github: GitHubReader = {
  prsForIssue: n => PRS[n] ?? [],
  isDeployed: p => p.number !== 9203,
};

const branches: BranchInfo[] = [
  { name: 'claude/myk9-107-fresh', tipAt: ago(3), worktree: '/wt/107' },
  { name: 'codex/myk9-106-old', tipAt: ago(72), worktree: null },
  { name: 'claude/myk9-1070-other', tipAt: ago(1), worktree: null },
];

const byIssue = (plan: ReturnType<typeof planJanitor>) =>
  Object.fromEntries(plan.map(p => [p.issue.replace('MYK9-', ''), p]));

describe('planJanitor In Progress', () => {
  const plan = byIssue(planJanitor(board, github, branches, NOW));

  it('moves a merged-PR issue with a verify label to In Review and names the owed evidence', () => {
    expect(plan['101']?.action).toBe('to-in-review');
    expect(plan['101']?.writes).toEqual([
      { tool: 'save_issue', args: { id: 'MYK9-101', state: 'In Review' } },
      {
        tool: 'save_comment',
        args: { issueId: 'MYK9-101', body: expect.stringContaining('verify:browser') },
      },
    ]);
  });

  it('never plans Done directly: a no-evidence merge is a candidate with an In Review fallback', () => {
    const p = plan['102'];
    expect(p?.action).toBe('to-done-candidate');
    expect(p?.writes).toEqual([]);
    expect(p?.doneWrites).toEqual([
      { tool: 'save_issue', args: { id: 'MYK9-102', state: 'Done' } },
    ]);
    expect(p?.fallbackWrites[0]).toEqual({
      tool: 'save_issue',
      args: { id: 'MYK9-102', state: 'In Review' },
    });
  });

  it('returns a closed-unmerged PR to Todo, naming the PR and why it closed', () => {
    expect(plan['103']?.action).toBe('to-todo');
    expect(plan['103']?.comment).toContain('/pull/9103');
    expect(plan['103']?.comment).toContain('superseded by the batch PR');
    expect(plan['103']?.writes[0]).toEqual({
      tool: 'save_issue',
      args: { id: 'MYK9-103', state: 'Todo' },
    });
  });

  it('comments once on an open PR idle over 48 h, naming the claim owner and the age, with no state change', () => {
    const p = plan['104'];
    expect(p?.action).toBe('comment-stale-pr');
    expect(p?.comment).toContain('50 h');
    expect(p?.comment).toContain('session-104');
    expect(p?.comment).toContain('/Users/r/wt/myk9-104');
    expect(p?.writes.map(w => w.tool)).toEqual(['save_comment']);
  });

  it('leaves an open PR whose head moved within 48 h alone', () => {
    expect(plan['105']?.action).toBe('skip');
  });

  it('is idempotent: no second comment for a PR it already commented on', () => {
    expect(plan['110']?.action).toBe('skip');
    expect(plan['110']?.reason).toContain('already posted');
  });

  it('returns a no-PR, no-recent-branch issue to Todo with the unclaimed comment', () => {
    const p = plan['106'];
    expect(p?.action).toBe('to-todo');
    expect(p?.comment).toBe(`unclaimed since ${ago(72)}: no branch or PR activity`);
  });

  it('uses the claim time when no branch exists at all', () => {
    const lone = planJanitor(
      { issues: [board.issues[5]!] },
      { ...github, prsForIssue: () => [] },
      [],
      NOW
    );
    expect(lone[0]?.comment).toBe('unclaimed since 2026-10-20 09:00 PDT: no branch or PR activity');
  });

  it('skips a no-PR issue whose branch had a commit in the last 24 h', () => {
    expect(plan['107']?.action).toBe('skip');
  });

  it('skips an issue with any needs:* label', () => {
    expect(plan['108']?.action).toBe('skip');
    expect(plan['108']?.reason).toContain('needs:');
  });

  it('skips an issue whose last comment is 5 h old (live session), even with nothing else to go on', () => {
    expect(plan['109']?.action).toBe('skip');
    expect(plan['109']?.reason).toContain('live session');
  });

  it('treats an issue with no comments as live when it was updated under 6 h ago', () => {
    const fresh = { ...board.issues[5]!, comments: [], updatedAt: ago(1) };
    expect(planJanitor({ issues: [fresh] }, github, [], NOW)[0]?.action).toBe('skip');
  });
});

describe('planJanitor In Review pass', () => {
  const withDeploy = byIssue(
    planJanitor(board, github, branches, NOW, { deployedCommit: DEPLOYED })
  );

  it('does nothing to In Review issues without --deployed-commit', () => {
    const plan = byIssue(planJanitor(board, github, branches, NOW));
    for (const id of ['201', '202', '203', '204', '205', '206', '207']) {
      expect(plan[id]?.action).toBe('skip');
    }
  });

  it('proposes Done, with the evidence line, for a deployed merge owing only production-class evidence', () => {
    expect(withDeploy['201']?.action).toBe('to-done-candidate');
    expect(withDeploy['201']?.comment).toContain(`deployed commit ${DEPLOYED.slice(0, 9)}`);
    expect(withDeploy['201']?.comment).toContain('#9201');
    expect(withDeploy['201']?.writes).toEqual([]);
    expect(withDeploy['201']?.doneWrites[0]).toEqual({
      tool: 'save_issue',
      args: { id: 'MYK9-201', state: 'Done' },
    });
    expect(withDeploy['204']?.action).toBe('to-done-candidate');
    expect(withDeploy['204']?.comment).toContain('production evidence of the nightly cron run');
  });

  it('skips any verify:* label (a deploy alone satisfies none) and any needs:* label', () => {
    expect(withDeploy['206']?.action).toBe('skip');
    expect(withDeploy['206']?.reason).toBe(
      'verify:* evidence owed; needs a check beyond the deploy'
    );
    expect(withDeploy['207']?.action).toBe('skip');
    expect(withDeploy['207']?.reason).toContain('needs:');
  });

  it('leaves browser-walk, undeployed and walk-owed issues untouched', () => {
    expect(withDeploy['202']?.action).toBe('skip');
    expect(withDeploy['203']?.action).toBe('skip');
    expect(withDeploy['203']?.reason).toContain('not in the deployed commit');
    expect(withDeploy['205']?.action).toBe('skip');
  });

  it('does not repeat its evidence comment', () => {
    const issue = {
      ...board.issues.find(i => i.id === 'MYK9-201')!,
      comments: [
        { createdAt: ago(60), body: 'Owed: production evidence that the cron ran' },
        { createdAt: ago(30), body: 'Production evidence: x\n\njanitor: prod-evidence#MYK9-201' },
      ],
    };
    const [p] = planJanitor({ issues: [issue] }, github, [], NOW, { deployedCommit: DEPLOYED });
    expect(p?.action).toBe('to-done-candidate');
    expect(p?.comment).toBeNull();
    expect(p?.doneWrites.map(w => w.tool)).toEqual(['save_issue']);
  });
});

describe('a board with nothing to do', () => {
  it('plans nothing and reports no changes', () => {
    const plan = planJanitor(empty, github, branches, NOW);
    expect(plan).toEqual([]);
    expect(summaryMarkdown(plan, 'dry-run', NOW)).toContain(
      'No state changes or comments planned.'
    );
  });
});

describe('CLI shape', () => {
  it('requires --board and rejects a bad --now', () => {
    expect(() => parseArgs([])).toThrow('--board');
    expect(() => parseArgs(['--board', 'b.json', '--now', 'nope'])).toThrow('--now');
  });

  it('dry run prints the plan without writes; --apply adds the ordered MCP writes', () => {
    const plan = planJanitor(board, github, branches, NOW);
    const dry = render(plan, parseArgs(['--board', 'b.json', '--now', NOW.toISOString()]));
    expect(dry).toContain('"mode": "dry-run"');
    expect(dry).not.toContain('"writes": [\n    {');
    const applied = render(
      plan,
      parseArgs(['--board', 'b.json', '--now', NOW.toISOString(), '--apply'])
    );
    expect(applied).toContain('"mode": "apply"');
    const doneInWrites = (
      JSON.parse(applied.split('```json\n')[1]!.split('\n```')[0]!) as {
        writes: { args: { state?: string } }[];
      }
    ).writes.filter(w => w.args.state === 'Done');
    expect(doneInWrites).toEqual([]);
    expect(applied).toContain('"doneWrites"');
    const body = JSON.parse(applied.split('```json\n')[1]!.split('\n```')[0]!) as {
      writes: { tool: string; args: { id?: string } }[];
    };
    expect(body.writes[0]).toEqual({
      tool: 'save_issue',
      args: { id: 'MYK9-101', state: 'In Review' },
    });
  });
});

describe('parseClaim', () => {
  it('parses the full local claim', () => {
    expect(
      parseClaim(
        'Claimed 2026-10-26 09:15 PDT by Fix the janitor (https://claude.ai/s/abc) · branch claude/myk9-1434-janitor · worktree /Users/r/wt/myk9-1434'
      )
    ).toEqual({
      claimedAt: '2026-10-26 09:15 PDT',
      who: 'Fix the janitor',
      link: 'https://claude.ai/s/abc',
      branch: 'claude/myk9-1434-janitor',
      worktree: '/Users/r/wt/myk9-1434',
    });
  });

  it('parses the cloud variant with no branch yet and no session link', () => {
    const claim = parseClaim(
      'Claimed 2026-10-26 09:15 UTC by nightly-run · branch none yet, prefix claude/myk9-1434- · worktree cloud session https://claude.ai/code/s1'
    );
    expect(claim).toEqual({
      claimedAt: '2026-10-26 09:15 UTC',
      who: 'nightly-run',
      link: null,
      branch: null,
      worktree: 'cloud session https://claude.ai/code/s1',
    });
    expect(describeOwner(claim)).toBe('nightly-run (cloud session https://claude.ai/code/s1)');
  });

  it('returns null for a comment that is not a claim and finds the newest claim in a thread', () => {
    expect(parseClaim('PR is up')).toBeNull();
    expect(describeOwner(null)).toContain('no claim comment');
    const newest = latestClaim([
      { createdAt: '2026-10-01T00:00:00Z', body: 'Claimed 2026-10-01 00:00 UTC by old' },
      { createdAt: '2026-10-02T00:00:00Z', body: 'Claimed 2026-10-02 00:00 UTC by new' },
    ]);
    expect(newest?.who).toBe('new');
  });
});

describe('matching helpers', () => {
  it('matches branch prefixes exactly (myk9-107- is not myk9-1070-)', () => {
    expect(branchesForIssue(107, branches).map(b => b.name)).toEqual(['claude/myk9-107-fresh']);
  });

  it('links a PR by Fixes/Ignore line or by branch prefix, not by a passing mention', () => {
    const pull = (body: string, ref: string) =>
      ({ body, head: { ref, sha: 'x' } }) as Parameters<typeof linksIssue>[0];
    expect(linksIssue(pull('Fixes MYK9-5', 'feat/x'), 5)).toBe('full');
    expect(linksIssue(pull('Ignore MYK9-5', 'feat/x'), 5)).toBe('partial');
    expect(linksIssue(pull('see MYK9-5', 'feat/x'), 5)).toBeNull();
    expect(linksIssue(pull('', 'richardbeezley1/myk9-5-thing'), 5)).toBe('full');
    expect(linksIssue(pull('Fixes MYK9-50', 'feat/x'), 5)).toBeNull();
  });
});

const base = board.issues[0]!;
const inProgress = (id: string, comments: { createdAt: string; body: string }[]) => ({
  ...base,
  id,
  labels: [] as string[],
  comments,
});
const plan1 = (
  issue: ReturnType<typeof inProgress>,
  prs: PrInfo[],
  tree: BranchInfo[] = [],
  gh: Partial<GitHubReader> = {}
) => planJanitor({ issues: [issue] }, { ...github, prsForIssue: () => prs, ...gh }, tree, NOW)[0]!;
const comments = (hoursAgo: number) => [{ createdAt: ago(hoursAgo), body: 'note' }];

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

describe('claim parser separators', () => {
  it('parses the em dash variant', () => {
    expect(
      parseClaim('Claimed 2026-10-26 09:15 PDT by sess — branch claude/myk9-5-x — worktree /wt/5')
    ).toMatchObject({ who: 'sess', branch: 'claude/myk9-5-x', worktree: '/wt/5' });
  });

  it('ignores prose that merely starts with Claimed', () => {
    expect(parseClaim('Claimed this earlier, then lost the session.')).toBeNull();
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
    expect(plan1(labelled, merged, old).action).toBe('to-in-review');
  });
});

describe('fallback template and snapshot', () => {
  const plan = planJanitor(board, github, branches, NOW);

  it('declares the fillable {{owed}} template and never says "name them here"', () => {
    for (const p of plan) {
      for (const w of [...p.writes, ...p.doneWrites, ...p.fallbackWrites]) {
        expect(w.args.body ?? '').not.toContain('name them here');
      }
    }
    const p = plan.find(e => e.issue === 'MYK9-102')!;
    const body = p.fallbackWrites.find(w => w.tool === 'save_comment')!.args.body!;
    expect(body).toContain('{{owed}}');
    expect(p.fallbackFill).toEqual(['owed']);
    expect(body.split('\n')[1]).toBe('Owed: {{owed}}');
    expect(/^\s*Owed:\s*(.+)$/im.exec(body)?.[1]).toBe('{{owed}}');
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

describe('readBranches', () => {
  const NEWER = '2026-10-25T10:00:00+00:00';
  const OLDER = '2026-10-20T10:00:00+00:00';
  const fake = (args: string[]): string => {
    const key = args.join(' ');
    if (key.startsWith('worktree list'))
      return 'worktree /wt/1\nbranch refs/heads/claude/myk9-1-x\n';
    if (key.startsWith('ls-remote'))
      return 'remoteold\trefs/heads/claude/myk9-1-x\nonlyremote\trefs/heads/codex/myk9-2-y\nzzz\trefs/heads/main\n';
    if (key.startsWith('for-each-ref')) return 'claude/myk9-1-x localnew\n';
    if (key.includes('localnew')) return `${NEWER}\n`;
    if (key.includes('remoteold')) return `${OLDER}\n`;
    if (key.includes('onlyremote')) return `${OLDER}\n`;
    throw new Error(`unexpected ${key}`);
  };
  const exec = (_cmd: string, args: string[]) => fake(args);

  it('keeps the newest of a remote tip and a newer unpushed local tip', () => {
    const out = readBranches(exec);
    expect(out.find(b => b.name === 'claude/myk9-1-x')).toEqual({
      name: 'claude/myk9-1-x',
      tipAt: NEWER,
      worktree: '/wt/1',
    });
  });

  it('still reads a remote-only branch', () => {
    expect(readBranches(exec).find(b => b.name === 'codex/myk9-2-y')?.tipAt).toBe(OLDER);
  });
});
