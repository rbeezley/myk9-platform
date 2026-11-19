import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * MYK9-2240: a pinned commit_sha could roll myk9show.com back when another
 * deploy had already shipped something newer. These known-answer tests run the
 * real guard against a throwaway repo and a stub `curl` that serves whatever
 * build-sha.txt body the test sets per host.
 */
const SCRIPT = resolve(import.meta.dirname, 'deploy-live-guard.sh');
const DOMAIN = 'https://myk9show.com/build-sha.txt';
const ALIAS = 'https://myk9-platform-myk9show.vercel.app/build-sha.txt';
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 't',
      GIT_AUTHOR_EMAIL: 't@example.com',
      GIT_COMMITTER_NAME: 't',
      GIT_COMMITTER_EMAIL: 't@example.com',
    },
  }).trim();
}

/** main: c0 <- c1 <- c2 <- c3, oldest first. */
function makeRepo(): { repo: string; shas: string[] } {
  const repo = mkdtempSync(join(tmpdir(), 'live-guard-'));
  dirs.push(repo);
  git(repo, 'init', '-q', '-b', 'main');
  const tree = git(repo, 'write-tree');
  const shas: string[] = [];
  for (let i = 0; i < 4; i += 1) {
    const parents = shas.length ? ['-p', shas.at(-1)!] : [];
    shas.push(git(repo, 'commit-tree', tree, '-m', `c${i}`, ...parents));
  }
  git(repo, 'update-ref', 'refs/heads/main', shas.at(-1)!);
  return { repo, shas };
}

/**
 * Runs the guard. `served` maps a host URL to the body its build-sha.txt
 * returns; a host mapped to `null` (or left out) fails like an HTTP error.
 */
function run(
  repo: string,
  commitSha: string,
  served: Record<string, string | null>,
  extraEnv: Record<string, string> = {}
): { status: number | null; stdout: string; stderr: string; output: string; urls: string } {
  const bin = mkdtempSync(join(tmpdir(), 'curl-stub-'));
  dirs.push(bin);
  for (const [url, body] of Object.entries(served)) {
    if (body !== null) writeFileSync(join(bin, encodeURIComponent(url)), body);
  }
  const log = join(bin, 'requested.txt');
  writeFileSync(log, '');
  // Stub for: curl --fail ... "<url>?v=<bust>" -> the body set for <url>, or
  // exit 22 (curl's --fail status) when the test gave that host none.
  writeFileSync(
    join(bin, 'curl'),
    [
      '#!/usr/bin/env bash',
      'url="${@: -1}"',
      `echo "$url" >>"${log}"`,
      'base="${url%%\\?*}"',
      `f="${bin}/$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$base")"`,
      '[ -f "$f" ] || { echo "curl: (22) The requested URL returned error: 404" >&2; exit 22; }',
      'cat "$f"',
      '',
    ].join('\n')
  );
  chmodSync(join(bin, 'curl'), 0o755);
  const out = join(bin, 'github-output');
  writeFileSync(out, '');
  const r = spawnSync('bash', [SCRIPT], {
    cwd: repo,
    encoding: 'utf8',
    env: {
      PATH: `${bin}:${process.env.PATH}`,
      HOME: process.env.HOME,
      GITHUB_OUTPUT: out,
      COMMIT_SHA: commitSha,
      LIVE_READ_TRIES: '2',
      LIVE_READ_SLEEP: '0',
      ...extraEnv,
    },
  });
  return {
    status: r.status,
    stdout: r.stdout,
    stderr: r.stderr,
    output: readFileSync(out, 'utf8'),
    urls: readFileSync(log, 'utf8'),
  };
}

describe('deploy-live-guard.sh', { timeout: 30_000 }, () => {
  it('refuses a pin behind what production serves, naming both commits', () => {
    const { repo, shas } = makeRepo();
    const r = run(repo, shas[1]!, { [DOMAIN]: `${shas[3]}\n`, [ALIAS]: `${shas[3]}\n` });
    expect(r.status).toBe(1);
    expect(r.output).toBe('');
    expect(r.stderr).toContain('Refusing to roll production back');
    expect(r.stderr).toContain(shas[3]);
    expect(r.stderr).toContain(shas[1]);
  });

  it('reports a pin production already serves as nothing to deploy, not a failure', () => {
    const { repo, shas } = makeRepo();
    const r = run(repo, shas[2]!, { [DOMAIN]: `${shas[2]}\n`, [ALIAS]: shas[2]! });
    expect(r.status).toBe(0);
    expect(r.output).toBe('action=skip\n');
    expect(r.stdout).toContain(`Nothing to deploy: production already serves ${shas[2]}`);
  });

  it('rebuilds the live commit only when rebuild_live asks for it', () => {
    const { repo, shas } = makeRepo();
    const r = run(
      repo,
      shas[2]!,
      { [DOMAIN]: shas[2]!, [ALIAS]: shas[2]! },
      { REBUILD_LIVE: 'true' }
    );
    expect(r.status).toBe(0);
    expect(r.output).toBe('action=deploy\n');
    expect(r.stdout).toContain('Rebuilding the live commit on request');
    const unset = run(
      repo,
      shas[2]!,
      { [DOMAIN]: shas[2]!, [ALIAS]: shas[2]! },
      { REBUILD_LIVE: 'false' }
    );
    expect(unset.output).toBe('action=skip\n');
  });

  it('still refuses a rollback when rebuild_live is set', () => {
    const { repo, shas } = makeRepo();
    const r = run(
      repo,
      shas[1]!,
      { [DOMAIN]: shas[3]!, [ALIAS]: shas[3]! },
      { REBUILD_LIVE: 'true' }
    );
    expect(r.status).toBe(1);
    expect(r.output).toBe('');
    expect(r.stderr).toContain('Refusing to roll production back');
  });

  it('deploys a pin ahead of what production serves', () => {
    const { repo, shas } = makeRepo();
    const r = run(repo, shas[3]!, { [DOMAIN]: `${shas[1]}\n`, [ALIAS]: `${shas[1]}\n` });
    expect(r.status).toBe(0);
    expect(r.output).toBe('action=deploy\n');
    expect(r.stdout).toContain(`Live: ${DOMAIN} serves ${shas[1]} (c1)`);
  });

  it('refuses when the live file cannot be read', () => {
    const { repo, shas } = makeRepo();
    const r = run(repo, shas[3]!, { [DOMAIN]: null, [ALIAS]: `${shas[1]}\n` });
    expect(r.status).toBe(1);
    expect(r.output).toBe('');
    expect(r.stderr).toContain(`Could not read the live commit from ${DOMAIN}`);
  });

  it('refuses when the live file is not a SHA (the SPA fallback page)', () => {
    const { repo, shas } = makeRepo();
    const r = run(repo, shas[3]!, {
      [DOMAIN]: '<!doctype html><html><body>myK9Show</body></html>',
      [ALIAS]: `${shas[1]}\n`,
    });
    expect(r.status).toBe(1);
    expect(r.output).toBe('');
    expect(r.stderr).toContain('Could not read the live commit');
  });

  it('refuses when production serves a commit this checkout does not have', () => {
    const { repo, shas } = makeRepo();
    const unknown = 'f'.repeat(40);
    const r = run(repo, shas[3]!, { [DOMAIN]: unknown, [ALIAS]: unknown });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('not in this checkout');
  });

  it('checks every host: a newer deploy on the default alias alone still refuses the pin', () => {
    const { repo, shas } = makeRepo();
    const r = run(repo, shas[2]!, { [DOMAIN]: shas[2]!, [ALIAS]: shas[3]! });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(`${ALIAS} serves ${shas[3]}`);
  });

  it('deploys when one host already serves the pin and the other lags behind it', () => {
    const { repo, shas } = makeRepo();
    const r = run(repo, shas[3]!, { [DOMAIN]: shas[1]!, [ALIAS]: shas[3]! });
    expect(r.status).toBe(0);
    expect(r.output).toBe('action=deploy\n');
  });

  it('cache-busts every read', () => {
    const { repo, shas } = makeRepo();
    const r = run(repo, shas[3]!, { [DOMAIN]: shas[1]!, [ALIAS]: shas[1]! });
    expect(r.status).toBe(0);
    for (const line of r.urls.trim().split('\n')) expect(line).toMatch(/\?v=[0-9a-f]{40}-\d+-1$/);
  });

  it('rejects a malformed deploy commit before reading anything', () => {
    const { repo, shas } = makeRepo();
    const r = run(repo, shas[3]!.slice(0, 12), { [DOMAIN]: shas[1]!, [ALIAS]: shas[1]! });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('40-character');
    expect(r.urls).toBe('');
  });
});
