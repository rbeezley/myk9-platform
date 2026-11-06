import { describe, expect, it } from 'vitest';
import { orderedWrites, parseArgs, render, summaryMarkdown } from './issue-janitor';
import { linksIssue } from './issue-janitor-github';
import { branchesForIssue, planJanitor } from './issue-janitor-plan';
import {
  NOW,
  DEPLOYED,
  board,
  empty,
  ago,
  pr,
  github,
  branches,
  byIssue,
  comments,
  parentIssue,
  plan1,
} from './issue-janitor-fixtures';
describe('planJanitor In Progress', () => {
  const plan = byIssue(planJanitor(board, github, branches, NOW));

  it('plans a fresh read for a merged PR with a verify label, with no state write in writes', () => {
    const p = plan['101']!;
    expect(p.action).toBe('fresh-read');
    expect(p.writes).toEqual([]);
    expect(Object.keys(p.outcomes!)).toEqual(['done', 'inReview', 'stayInProgress']);
    expect(p.outcomes!.inReview).toEqual([
      { tool: 'save_issue', args: { id: 'MYK9-101', state: 'In Review' } },
      {
        tool: 'save_comment',
        args: {
          issueId: 'MYK9-101',
          body: 'PR https://github.com/rbeezley/myk9-platform/pull/9101 merged. Moving to In Review.\nOwed: verify:browser\n\njanitor: merged#9101-in-review',
        },
      },
    ]);
  });

  it('never chooses Done itself: a no-label merge is a fresh read with a {{owed}} template', () => {
    const p = plan['102']!;
    expect(p.action).toBe('fresh-read');
    expect(p.writes).toEqual([]);
    expect(p.outcomes!.done).toEqual([
      { tool: 'save_issue', args: { id: 'MYK9-102', state: 'Done' } },
    ]);
    expect(p.outcomes!.inReview![1]!.args.body).toContain('\nOwed: {{owed}}');
    expect(p.outcomes!.stayInProgress).toEqual([
      {
        tool: 'save_comment',
        args: {
          issueId: 'MYK9-102',
          body: 'PR https://github.com/rbeezley/myk9-platform/pull/9102 merged; implementation still owed: {{owed}}\n\njanitor: merged#9102-stay',
        },
      },
    ]);
    expect(p.fill).toEqual(['owed']);
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
    expect(p?.comment).toContain('/wt/checkout');
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

  it('plans a fresh read with done and leave outcomes for a deployed merge owing production evidence', () => {
    const p = withDeploy['201']!;
    expect(p.action).toBe('fresh-read');
    expect(p.writes).toEqual([]);
    expect(Object.keys(p.outcomes!)).toEqual(['done', 'leave']);
    expect(p.outcomes!.leave).toEqual([]);
    expect(p.outcomes!.done![0]!.args.body).toContain(`deployed commit ${DEPLOYED.slice(0, 9)}`);
    expect(p.outcomes!.done![0]!.args.body).toContain('#9201');
    expect(p.outcomes!.done![1]).toEqual({
      tool: 'save_issue',
      args: { id: 'MYK9-201', state: 'Done' },
    });
    expect(withDeploy['204']?.action).toBe('fresh-read');
    expect(withDeploy['204']?.outcomes!.done![0]!.args.body).toContain(
      'production evidence of the nightly cron run'
    );
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
    expect(p?.action).toBe('fresh-read');
    expect(p?.outcomes!.done!.map(w => w.tool)).toEqual(['save_issue']);
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
    expect(applied).toContain('"outcomes"');
    const body = JSON.parse(applied.split('```json\n')[1]!.split('\n```')[0]!) as {
      writes: { tool: string; args: { id?: string } }[];
    };
    expect(body.writes[0]).toEqual({
      tool: 'save_issue',
      args: { id: 'MYK9-103', state: 'Todo' },
    });
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

describe('parent issues waiting on children', () => {
  it('skips with the open children named, in the reason', () => {
    const p = plan1(
      parentIssue([
        { id: 'MYK9-1651', state: 'In Progress' },
        { id: 'MYK9-1652', state: 'Todo' },
        { id: 'MYK9-1653', state: 'Done' },
      ]),
      []
    );
    expect(p.action).toBe('skip');
    expect(p.reason).toBe('waiting on children: MYK9-1651 (In Progress), MYK9-1652 (Todo)');
    expect(p.writes).toEqual([]);
  });

  it('does not return a parent with no PR or branch and merged-but-open children to Todo (MYK9-1650)', () => {
    const p = plan1(
      parentIssue([
        { id: 'MYK9-1651', state: 'In Review' },
        { id: 'MYK9-1652', state: 'Done' },
      ]),
      []
    );
    expect(p.action).not.toBe('to-todo');
    expect(p.action).toBe('skip');
    expect(p.writes).toEqual([]);
  });

  it('plans a fresh read, never to-todo, once every child is closed (case-insensitive)', () => {
    const p = plan1(
      parentIssue([
        { id: 'MYK9-1651', state: 'Done' },
        { id: 'MYK9-1652', state: 'canceled' },
        { id: 'MYK9-1653', state: 'DUPLICATE' },
      ]),
      []
    );
    expect(p.action).toBe('fresh-read');
    expect(p.reason).toBe('all children closed');
    expect(p.writes).toEqual([]);
    expect(Object.keys(p.outcomes!)).toEqual(['done', 'inReview', 'stayInProgress']);
    expect(p.fill).toEqual(['owed']);
    expect(p.outcomes!.inReview?.[1]?.args.body).toMatch(
      /^All child issues are closed[\s\S]*\nOwed: \{\{owed\}\}/
    );
  });

  it('keeps the In Review verify:* skip ahead of the child check', () => {
    const issue = {
      ...parentIssue([{ id: 'MYK9-1651', state: 'Done' }], 'MYK9-1650', 'In Review'),
      labels: ['verify:browser'],
    };
    const [p] = planJanitor({ issues: [issue] }, github, [], NOW, { deployedCommit: DEPLOYED });
    expect(p?.action).toBe('skip');
    expect(p?.reason).toContain('verify:*');
  });

  it('fails loudly, naming the issue, on a child without a string state', () => {
    const bad = parentIssue([{ id: 'MYK9-1651' } as never]);
    expect(() => planJanitor({ issues: [bad] }, github, [], NOW)).toThrow(/MYK9-1650.*child/);
  });

  it('applies to the In Review pass too, with done and leave outcomes', () => {
    const issue = parentIssue([{ id: 'MYK9-1651', state: 'Done' }], 'MYK9-1650', 'In Review');
    const [p] = planJanitor({ issues: [issue] }, github, [], NOW, { deployedCommit: DEPLOYED });
    expect(p?.action).toBe('fresh-read');
    expect(Object.keys(p!.outcomes!)).toEqual(['done', 'leave']);
    const open = { ...issue, children: [{ id: 'MYK9-1651', state: 'Todo' }] };
    const [q] = planJanitor({ issues: [open] }, github, [], NOW, { deployedCommit: DEPLOYED });
    expect(q?.action).toBe('skip');
  });

  it('keeps needs:* and live-session skips ahead of the child check', () => {
    const held = {
      ...parentIssue([{ id: 'MYK9-1651', state: 'Done' }]),
      labels: ['needs:decision'],
    };
    expect(plan1(held, []).reason).toContain('needs:');
    const live = { ...parentIssue([{ id: 'MYK9-1651', state: 'Done' }]), comments: comments(1) };
    expect(plan1(live, []).reason).toContain('live session');
  });

  it('fails the run loudly, naming the issue, when a board entry lacks children', () => {
    const bare: Record<string, unknown> = { ...parentIssue([]) };
    delete bare.children;
    expect(() => planJanitor({ issues: [bare as never] }, github, [], NOW)).toThrow(
      /MYK9-1650.*children/
    );
  });

  it('does not repeat the stay comment once its marker is on the parent', () => {
    const closed = [{ id: 'MYK9-1651', state: 'Done' }];
    const fresh = plan1(parentIssue(closed), []);
    expect(fresh.outcomes!.stayInProgress).toHaveLength(1);
    const marked = {
      ...parentIssue(closed),
      comments: [{ createdAt: ago(80), body: 'x\n\njanitor: children-closed-stay' }],
    };
    const again = plan1(marked, []);
    expect(again.action).toBe('fresh-read');
    expect(again.outcomes!.stayInProgress).toEqual([]);
    expect(again.outcomes!.inReview).toHaveLength(2);
  });
});
