import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  isCloudEnvironment,
  parseVersion,
  runPreflight,
  type CommandResult,
  type PreflightDeps,
} from './preflight.ts';

const ROOT = '/workspace/myk9-platform';
const WRAPPER = fileURLToPath(new URL('../qa/claude-review.sh', import.meta.url));
const MAC_ROOT = '/Users/me/AI Projects/myk9-platform';

const VERSION_OUTPUT: Record<string, string> = {
  node: 'v22.22.0',
  pnpm: '9.15.9',
  git: 'git version 2.43.0',
  gh: 'gh version 2.89.0 (2026-03-26)',
  deno: 'deno 2.1.4 (stable, release, x86_64-unknown-linux-gnu)',
  shellcheck: 'ShellCheck - shell script analysis tool\nversion: 0.10.0\nlicense: GPLv3',
  jq: 'jq-1.7',
  codex: 'codex-cli 0.50.0',
  claude: '2.1.310 (Claude Code)',
};

type Call = { cmd: string; args: string[] };

function fakeDeps(
  options: {
    missing?: string[];
    versions?: Record<string, string>;
    /** Tools whose `--version` exits nonzero while still printing a version. */
    failingProbe?: string[];
    githubRead?: boolean;
    network?: boolean;
    root?: string;
  } = {}
) {
  const calls: Call[] = [];
  const versions = { ...VERSION_OUTPUT, ...options.versions };
  const root = options.root ?? ROOT;
  const deps: PreflightDeps = {
    run(cmd, args): CommandResult {
      calls.push({ cmd, args });
      if (options.missing?.includes(cmd)) return { status: null, stdout: '' };
      if (args[0] === '--version') {
        return {
          status: options.failingProbe?.includes(cmd) ? 1 : 0,
          stdout: versions[cmd] ?? '',
        };
      }
      if (cmd === 'gh' && args[0] === 'api') {
        return { status: options.githubRead === false ? 1 : 0, stdout: '' };
      }
      if (cmd === 'curl') return { status: options.network === false ? 7 : 0, stdout: '200' };
      return { status: 1, stdout: '' };
    },
    exists: path => path === `${root}/pnpm-workspace.yaml`,
  };
  return { deps, calls };
}

const CLOUD_ENV = { CLAUDE_CODE_REMOTE: 'true' };

describe('parseVersion', () => {
  it.each([
    ['v22.22.0', '22.22.0'],
    ['gh version 2.89.0 (2026-03-26)', '2.89.0'],
    ['ShellCheck - shell script analysis tool\nversion: 0.10.0', '0.10.0'],
    ['jq-1.7', '1.7'],
    ['no digits here', null],
  ])('reads %j as %j', (output, expected) => {
    expect(parseVersion(output)).toBe(expected);
  });
});

describe('isCloudEnvironment', () => {
  it('recognizes Claude Code remote, GitHub Actions and the explicit marker', () => {
    expect(isCloudEnvironment({ CLAUDE_CODE_REMOTE: 'true' })).toBe(true);
    expect(isCloudEnvironment({ GITHUB_ACTIONS: 'true' })).toBe(true);
    expect(isCloudEnvironment({ MYK9_CLOUD: '1' })).toBe(true);
  });

  it('treats a plain Mac shell as local', () => {
    expect(isCloudEnvironment({ HOME: '/Users/me', TERM_PROGRAM: 'iTerm.app' })).toBe(false);
  });
});

describe('runPreflight', () => {
  it('passes an implementer with every tool, GitHub read access and network', () => {
    const { deps } = fakeDeps();
    const report = runPreflight({ root: ROOT, role: 'implementer', env: CLOUD_ENV, deps });
    expect(report.missing).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it.each(['gh', 'deno', 'shellcheck'])('fails an implementer missing %s and names it', tool => {
    const { deps } = fakeDeps({ missing: [tool] });
    const report = runPreflight({ root: ROOT, role: 'implementer', env: CLOUD_ENV, deps });
    expect(report.ok).toBe(false);
    expect(report.missing).toContain(tool);
  });

  it('fails a tool older than its pinned minimum', () => {
    const { deps } = fakeDeps({ versions: { deno: 'deno 1.46.3' } });
    const report = runPreflight({ root: ROOT, role: 'implementer', env: CLOUD_ENV, deps });
    expect(report.ok).toBe(false);
    expect(report.missing).toContain('deno');
    expect(report.checks.find(check => check.name === 'deno')?.detail).toMatch(
      /1\.46\.3 < 2\.1\.4/
    );
  });

  // The handoff CLI reads every page with `gh api --slurp`, first shipped in gh 2.48.0.
  it.each([
    ['gh version 2.47.0 (2024-04-03)', false],
    ['gh version 2.48.0 (2024-04-17)', true],
  ])('holds gh to the release that added --slurp: %s', (output, ok) => {
    const { deps } = fakeDeps({ versions: { gh: output } });
    const report = runPreflight({ root: ROOT, role: 'publisher', env: CLOUD_ENV, deps });
    expect(report.missing.includes('gh')).toBe(!ok);
  });

  it.each(['deno', 'jq'])(
    'fails %s when its version probe exits nonzero, even with a plausible version',
    tool => {
      const { deps } = fakeDeps({
        failingProbe: [tool],
        versions: { deno: 'deno 2.1.4 failed to initialize', jq: 'jq-1.7 error' },
      });
      const report = runPreflight({ root: ROOT, role: 'implementer', env: CLOUD_ENV, deps });
      expect(report.ok).toBe(false);
      expect(report.missing).toContain(tool);
      expect(report.checks.find(check => check.name === tool)?.detail).toMatch(/exited 1/);
    }
  );

  it('fails without GitHub read access', () => {
    const { deps } = fakeDeps({ githubRead: false });
    const report = runPreflight({ root: ROOT, role: 'publisher', env: CLOUD_ENV, deps });
    expect(report.ok).toBe(false);
    expect(report.missing).toContain('github-read');
  });

  it('fails when the network is unavailable', () => {
    const { deps } = fakeDeps({ network: false });
    const report = runPreflight({ root: ROOT, role: 'implementer', env: CLOUD_ENV, deps });
    expect(report.ok).toBe(false);
    expect(report.missing).toContain('network');
  });

  it('works from a non-Mac checkout root', () => {
    const root = '/home/user/checkout';
    const { deps } = fakeDeps({ root });
    expect(runPreflight({ root, role: 'implementer', env: CLOUD_ENV, deps }).ok).toBe(true);
  });

  it('fails when the root is not the repository', () => {
    const { deps } = fakeDeps();
    const report = runPreflight({ root: '/tmp/elsewhere', role: 'publisher', env: {}, deps });
    expect(report.missing).toContain('checkout');
  });

  it('requires the cloud reviewer model key without printing its value', () => {
    const { deps } = fakeDeps();
    const missingKey = runPreflight({
      root: ROOT,
      role: 'reviewer',
      reviewerHarness: 'codex',
      env: CLOUD_ENV,
      deps,
    });
    expect(missingKey.missing).toContain('OPENAI_API_KEY');

    const secret = 'sk-test-preflight-value-0001';
    const withKey = runPreflight({
      root: ROOT,
      role: 'reviewer',
      reviewerHarness: 'codex',
      env: { ...CLOUD_ENV, OPENAI_API_KEY: secret },
      deps,
    });
    expect(withKey.ok).toBe(true);
    expect(JSON.stringify(withKey)).not.toContain(secret);
  });

  it('checks the reviewer harness CLI it was asked about', () => {
    const { deps } = fakeDeps({ missing: ['claude'] });
    const report = runPreflight({
      root: ROOT,
      role: 'reviewer',
      reviewerHarness: 'claude',
      env: { ...CLOUD_ENV, ANTHROPIC_API_KEY: 'x'.repeat(12) },
      deps,
    });
    expect(report.missing).toEqual(['claude']);
  });

  // R2-05: claude-review.sh reads the PR through gh before it starts a review.
  describe('a Claude reviewer', () => {
    const claudeReviewer = (deps: PreflightDeps) =>
      runPreflight({
        root: ROOT,
        role: 'reviewer',
        reviewerHarness: 'claude',
        env: { ...CLOUD_ENV, ANTHROPIC_API_KEY: 'x'.repeat(12) },
        deps,
      });

    it('is ready with gh installed and a working GitHub read', () => {
      const { deps, calls } = fakeDeps();
      expect(claudeReviewer(deps)).toMatchObject({ ok: true, missing: [] });
      expect(calls.some(call => call.cmd === 'gh' && call.args[0] === 'api')).toBe(true);
    });

    it('fails without gh', () => {
      const { deps } = fakeDeps({ missing: ['gh'] });
      expect(claudeReviewer(deps).missing).toContain('gh');
    });

    it('fails when gh cannot read GitHub (auth)', () => {
      const { deps } = fakeDeps({ githubRead: false });
      expect(claudeReviewer(deps).missing).toEqual(['github-read']);
    });
  });

  it('does not demand gh from a Codex reviewer, whose wrapper only needs it to post', () => {
    const { deps } = fakeDeps({ missing: ['gh'] });
    const report = runPreflight({
      root: ROOT,
      role: 'reviewer',
      reviewerHarness: 'codex',
      env: { ...CLOUD_ENV, OPENAI_API_KEY: 'x'.repeat(12) },
      deps,
    });
    expect(report).toMatchObject({ ok: true, missing: [] });
  });

  describe('local (Mac) compatibility', () => {
    it('accepts the local login for a Mac reviewer instead of demanding a model key', () => {
      const { deps } = fakeDeps({ root: MAC_ROOT });
      const report = runPreflight({
        root: MAC_ROOT,
        role: 'reviewer',
        reviewerHarness: 'codex',
        env: { HOME: '/Users/me' },
        deps,
      });
      expect(report.ok).toBe(true);
      expect(report.cloud).toBe(false);
    });

    it('handles a root containing spaces', () => {
      const { deps } = fakeDeps({ root: MAC_ROOT });
      expect(runPreflight({ root: MAC_ROOT, role: 'implementer', env: {}, deps }).ok).toBe(true);
    });

    it('runs only read-only probes: version queries, a GitHub GET and a HEAD request', () => {
      const { deps, calls } = fakeDeps({ root: MAC_ROOT });
      for (const role of ['implementer', 'reviewer', 'publisher'] as const) {
        runPreflight({ root: MAC_ROOT, role, reviewerHarness: 'claude', env: {}, deps });
      }
      const nonVersion = calls.filter(call => call.args[0] !== '--version');
      expect(nonVersion.length).toBeGreaterThan(0);
      for (const call of nonVersion) {
        expect(
          (call.cmd === 'gh' && call.args.join(' ') === 'api rate_limit --silent') ||
            (call.cmd === 'curl' && call.args.includes('--head'))
        ).toBe(true);
      }
    });
  });
});

describe('preflight as a script', () => {
  it('loads under the repository module format and rejects an unknown role', () => {
    const cli = fileURLToPath(new URL('./preflight.ts', import.meta.url));
    const result = spawnSync(process.execPath, ['--import', 'tsx', cli, '--role=bogus'], {
      encoding: 'utf8',
    });
    expect(result.stderr).toContain('unknown --role=bogus');
    expect(result.status).toBe(2);
  });
});

/**
 * The other half of R2-05: preflight's reviewer requirements are only right
 * while they match the real wrapper. With a model key in the environment the
 * wrapper skips its own login and network probes, so the first thing it does
 * is read the PR through gh; without gh it must refuse before reviewing.
 */
describe('claude-review.sh agrees that a Claude reviewer needs gh', () => {
  it('refuses with exit 2, never starting a review, when gh cannot run', () => {
    const stub = mkdtempSync(join(tmpdir(), 'claude-review-gh-'));
    try {
      const claudeArgs = join(stub, 'claude-args');
      writeFileSync(join(stub, 'claude'), `#!/bin/sh\necho "$@" >> '${claudeArgs}'\n`);
      chmodSync(join(stub, 'claude'), 0o755);
      const result = spawnSync('bash', [WRAPPER, '7'], {
        encoding: 'utf8',
        env: {
          ...process.env,
          ANTHROPIC_API_KEY: 'x'.repeat(12),
          CLAUDE_BIN: join(stub, 'claude'),
          GH_BIN: join(stub, 'no-such-gh'),
          CLAUDE_REVIEW_STATE_DIR: stub,
        },
      });
      expect(result.status).toBe(2);
      expect(existsSync(claudeArgs)).toBe(false);
    } finally {
      rmSync(stub, { recursive: true, force: true });
    }
  });
});
