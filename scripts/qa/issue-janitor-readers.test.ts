import { describe, expect, it } from 'vitest';
import { describeOwner, latestClaim, parseClaim } from './issue-janitor-claim';
import { readBranches } from './issue-janitor-github';

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

  it('keeps a branch outside the prefixes only when a claim names it', () => {
    const exec2 = (_cmd: string, args: string[]) =>
      args[0] === 'for-each-ref'
        ? 'feature/x localsha\n'
        : args[0] === 'log'
          ? `${OLDER}\n`
          : fake(args);
    expect(readBranches(exec2).map(b => b.name)).not.toContain('feature/x');
    expect(readBranches(exec2, ['feature/x']).map(b => b.name)).toContain('feature/x');
  });
});
