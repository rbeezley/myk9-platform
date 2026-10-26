import { describe, expect, it } from 'vitest';
import { resolveAuthorship, type AuthoredCommit } from './authorship.ts';

// Trailer spellings copied from real PRs: Claude's model name varies, and
// Codex has signed with three different addresses (#3271, #3273, main).
const CLAUDE = 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>';
const CLAUDE_OTHER_MODEL = 'Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>';
const CODEX = 'Co-Authored-By: Codex <noreply@openai.com>';
const CODEX_ALT = 'Co-Authored-By: Codex <codex@openai.com>';
const CODEX_ODD = 'Co-Authored-By: Codex <noreply@anthropic.com>';

function commit(sha: string, ...trailers: string[]): AuthoredCommit {
  return {
    sha,
    parentCount: 1,
    message: ['fix: a change', '', 'Body.', '', ...trailers].join('\n'),
  };
}

/** A conflict-free `git merge origin/main`: two parents, no trailer, nothing new. */
function mergeFromMain(sha: string): AuthoredCommit {
  return {
    sha,
    parentCount: 2,
    cleanMerge: true,
    message: "Merge remote-tracking branch 'origin/main'",
  };
}

/** A merge whose tree differs from the automatic merge of its parents. */
function resolvedMerge(sha: string, ...trailers: string[]): AuthoredCommit {
  const message = ["Merge remote-tracking branch 'origin/main'", '', 'Resolve conflicts.'];
  return {
    sha,
    parentCount: 2,
    cleanMerge: false,
    message: [...message, '', ...trailers].join('\n'),
  };
}

describe('resolveAuthorship', () => {
  it('selects Codex to review a claude/ branch whose commits are all Claude-authored', () => {
    expect(
      resolveAuthorship({
        branch: 'claude/myk9-1415-inflight-rest',
        commits: [commit('aaa1111', CLAUDE), commit('aaa2222', CLAUDE_OTHER_MODEL)],
      })
    ).toEqual({ implementer: 'claude', reviewer: 'codex' });
  });

  it('selects Claude to review a codex/ branch, whichever address Codex signed with', () => {
    expect(
      resolveAuthorship({
        branch: 'codex/linear-agent-labels',
        commits: [
          commit('bbb1111', CODEX),
          commit('bbb2222', CODEX_ALT),
          commit('bbb3333', CODEX_ODD),
        ],
      })
    ).toEqual({ implementer: 'codex', reviewer: 'claude' });
  });

  it('ignores a clean merge, which adds nothing beyond its parents', () => {
    expect(
      resolveAuthorship({
        branch: 'codex/linear-agent-labels',
        commits: [commit('ccc1111', CODEX), mergeFromMain('ccc2222'), commit('ccc3333', CODEX)],
      })
    ).toEqual({ implementer: 'codex', reviewer: 'claude' });
  });

  // Codex, #3284 round 3: a conflict resolution is code in neither parent.
  describe('treats a merge that is not provably clean as authored work', () => {
    it('accepts it when its trailer matches the prefix', () => {
      expect(
        resolveAuthorship({
          branch: 'codex/x',
          commits: [commit('mmm1111', CODEX), resolvedMerge('mmm2222', CODEX)],
        })
      ).toEqual({ implementer: 'codex', reviewer: 'claude' });
    });

    it('refuses it when the other harness resolved it', () => {
      expect(
        resolveAuthorship({
          branch: 'codex/x',
          commits: [commit('mmm3333', CODEX), resolvedMerge('mmm4444', CLAUDE)],
        })
      ).toEqual({ refused: expect.stringContaining('mmm4444') });
    });

    it('refuses it when nobody signed it', () => {
      expect(
        resolveAuthorship({
          branch: 'codex/x',
          commits: [commit('mmm5555', CODEX), resolvedMerge('mmm6666')],
        })
      ).toEqual({ refused: expect.stringContaining('mmm6666') });
    });

    it('treats a merge with no cleanliness verdict as not clean', () => {
      const unverified: AuthoredCommit = {
        sha: 'mmm7777',
        parentCount: 2,
        message: "Merge remote-tracking branch 'origin/main'",
      };
      expect(
        resolveAuthorship({ branch: 'codex/x', commits: [commit('mmm8888', CODEX), unverified] })
      ).toEqual({ refused: expect.stringContaining('mmm7777') });
    });
  });

  it('reads the trailer key case-insensitively and ignores a human co-author', () => {
    expect(
      resolveAuthorship({
        branch: 'claude/x',
        commits: [
          commit(
            'ddd1111',
            'Co-authored-by: Richard Beezley <richard@example.com>',
            'co-authored-by: Claude <noreply@anthropic.com>'
          ),
        ],
      })
    ).toEqual({ implementer: 'claude', reviewer: 'codex' });
  });

  it.each([
    ['an agent-neutral prefix', 'richardbeezley1/myk9-1398-stage-2'],
    ['no prefix at all', 'main'],
    ['a prefix in the wrong case', 'Claude/x'],
    ['a prefix without its slash', 'claude-x'],
  ])('refuses %s', (_label, branch) => {
    const result = resolveAuthorship({ branch, commits: [commit('eee1111', CLAUDE)] });
    expect(result).toEqual({ refused: expect.stringContaining(branch) });
  });

  it('refuses a claude/ branch whose commits Codex wrote, naming the commit', () => {
    const result = resolveAuthorship({
      branch: 'claude/x',
      commits: [commit('fff1111', CLAUDE), commit('fff2222', CODEX)],
    });
    expect(result).toEqual({ refused: expect.stringContaining('fff2222') });
  });

  it('refuses a codex/ branch that also carries a Claude commit', () => {
    const result = resolveAuthorship({
      branch: 'codex/x',
      commits: [commit('ggg1111', CODEX), commit('ggg2222', CLAUDE)],
    });
    expect(result).toEqual({ refused: expect.stringContaining('ggg2222') });
  });

  it('refuses a single commit that names both harnesses', () => {
    const result = resolveAuthorship({
      branch: 'claude/x',
      commits: [commit('hhh1111', CLAUDE, CODEX)],
    });
    expect(result).toEqual({ refused: expect.stringContaining('hhh1111') });
  });

  it('refuses a non-merge commit with no harness trailer, rather than guessing', () => {
    const result = resolveAuthorship({
      branch: 'codex/x',
      commits: [commit('iii1111', CODEX), commit('iii2222')],
    });
    expect(result).toEqual({ refused: expect.stringContaining('iii2222') });
  });

  // Codex, #3284: only the trailing trailer block is authorship. A commit body
  // that quotes a trailer, as docs about this very rule do, is prose.
  describe('reads only the trailing trailer block', () => {
    const quoting = (sha: string, quoted: string, ...trailers: string[]): AuthoredCommit => ({
      sha,
      parentCount: 1,
      message: [
        'docs: explain trailers',
        '',
        'An example:',
        '',
        quoted,
        '',
        'More prose.',
        '',
        ...trailers,
      ].join('\n'),
    });

    it('ignores a quoted trailer in the body when the real trailer agrees with the prefix', () => {
      expect(
        resolveAuthorship({ branch: 'claude/x', commits: [quoting('lll1111', CODEX, CLAUDE)] })
      ).toEqual({ implementer: 'claude', reviewer: 'codex' });
    });

    it('refuses a commit whose only harness trailer is quoted in the body', () => {
      expect(
        resolveAuthorship({ branch: 'claude/x', commits: [quoting('lll2222', CLAUDE)] })
      ).toEqual({ refused: expect.stringContaining('lll2222') });
    });

    it('refuses a final paragraph that is prose around a trailer-shaped line', () => {
      const commit: AuthoredCommit = {
        sha: 'lll3333',
        parentCount: 1,
        message: `fix: x\n\nBody.\n\nThanks to the reviewer.\n${CLAUDE}`,
      };
      expect(resolveAuthorship({ branch: 'claude/x', commits: [commit] })).toEqual({
        refused: expect.stringContaining('lll3333'),
      });
    });

    it('accepts a trailer block with other git trailers and trailing blank lines', () => {
      const commit: AuthoredCommit = {
        sha: 'lll4444',
        parentCount: 1,
        message: `fix: x\n\nBody.\n\nSigned-off-by: Richard Beezley <r@example.com>\n${CODEX}\n\n`,
      };
      expect(resolveAuthorship({ branch: 'codex/x', commits: [commit] })).toEqual({
        implementer: 'codex',
        reviewer: 'claude',
      });
    });

    it('does not read a one-line message as its own trailer block', () => {
      const commit: AuthoredCommit = { sha: 'lll5555', parentCount: 1, message: CLAUDE };
      expect(resolveAuthorship({ branch: 'claude/x', commits: [commit] })).toEqual({
        refused: expect.stringContaining('lll5555'),
      });
    });
  });

  it('does not take a lookalike name for a harness', () => {
    const result = resolveAuthorship({
      branch: 'claude/x',
      commits: [commit('jjj1111', 'Co-Authored-By: Claudette Bot <bot@example.com>')],
    });
    expect(result).toEqual({ refused: expect.stringContaining('jjj1111') });
  });

  it.each([
    ['an empty commit list', []],
    ['only merge commits', [mergeFromMain('kkk1111')]],
  ])('refuses %s: nothing to attribute', (_label, commits) => {
    expect(resolveAuthorship({ branch: 'claude/x', commits })).toEqual({
      refused: expect.stringMatching(/no commits/i),
    });
  });
});
