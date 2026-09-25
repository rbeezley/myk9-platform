import { describe, expect, it } from 'vitest';
import {
  DEFERRAL_HISTORY_START,
  candidateIssueNumbers,
  groupCommentsByIssue,
  parseRepoComments,
  parseSinceFlag,
  reconcile,
  type PrView,
  type RepoComment,
} from './deferred-reviews';

const HEAD = 'aaaaaaaaa1111111111122222222223333333333';

function override(issue: number, onPullRequest?: boolean): RepoComment {
  return {
    issue,
    body: [
      `Review gate: owner reviewed abc1234..aaaaaaaaa — override, floor was independent`,
      'Override reason: Codex unavailable — usage limit',
      'Deferred re-review: MYK9-509',
    ].join('\n'),
    createdAt: '2026-09-10T00:00:00Z',
    updatedAt: '2026-09-10T00:00:00Z',
    author: 'rbeezley',
    authorAssociation: 'OWNER',
    ...(onPullRequest === undefined ? {} : { onPullRequest }),
  };
}

function merged(number: number): PrView {
  return {
    number,
    state: 'MERGED',
    mergedAt: '2026-09-10T00:00:00Z',
    mergeCommit: { oid: 'ffffffffff' },
    headRefOid: HEAD,
  };
}

// MYK9-748 (#2259 review).
describe('deferred-reviews window and candidates', () => {
  // A rolling 30-day window dropped an unresolved override whose comment had
  // not been edited in 30 days, and the job then reported no open deferrals
  // while the debt remained. The default now reaches back to the first merge
  // that could carry a deferral.
  it('defaults to the start of deferral history, not a rolling window', () => {
    expect(parseSinceFlag([])).toBe(DEFERRAL_HISTORY_START);
    expect(DEFERRAL_HISTORY_START).toBe('2026-09-14');
    expect(parseSinceFlag(['--since', '2026-09-20'])).toBe('2026-09-20');
  });

  it('tells a pull request comment from a plain issue comment', () => {
    const comment = (issue: number, kind: 'pull' | 'issues') => ({
      body: 'x',
      created_at: '2026-09-10T00:00:00Z',
      updated_at: '2026-09-10T00:00:00Z',
      issue_url: `https://api.github.com/repos/o/r/issues/${issue}`,
      html_url: `https://github.com/o/r/${kind}/${issue}#issuecomment-1`,
    });
    const rows = parseRepoComments(JSON.stringify([[comment(1, 'pull'), comment(2, 'issues')]]));
    expect(rows.map(row => row.onPullRequest)).toEqual([true, false]);
  });

  // A `Deferred re-review:` line quoted on a plain issue made `gh pr view`
  // fail, and the run aborted with exit 2 instead of skipping the issue.
  it('does not spend a gh pr view on a plain issue', () => {
    const grouped = groupCommentsByIssue([override(10, false), override(11, true), override(12)]);
    expect(candidateIssueNumbers(grouped)).toEqual([11, 12]);
  });

  it('reconciles past a deferral line quoted on a plain issue', async () => {
    const viewed: number[] = [];
    const result = await reconcile({ REPO: 'o/r', LINEAR_API_KEY: 'key' }, [], {
      listRepoComments: () => [override(10, false), override(11, true)],
      viewPr: (_repo, number) => {
        viewed.push(number);
        if (number === 10) throw new Error('gh: no pull requests found');
        return merged(number);
      },
      resolveLinearIssue: async () => ({ exists: true, stateName: 'Done', stateType: 'completed' }),
    });
    expect(result.code).toBe(0);
    expect(viewed).toEqual([11]);
  });
});
