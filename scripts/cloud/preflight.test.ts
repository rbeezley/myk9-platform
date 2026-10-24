import { describe, expect, it } from 'vitest';
import {
  isCloudEnvironment,
  parseVersion,
  runPreflight,
  type CommandResult,
  type PreflightDeps,
} from './preflight.ts';

const ROOT = '/workspace/myk9-platform';
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
      if (args[0] === '--version') return { status: 0, stdout: versions[cmd] ?? '' };
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
