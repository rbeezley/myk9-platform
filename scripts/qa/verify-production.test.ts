import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * MYK9-2240: the single "production serves this commit" check of Deploy
 * myK9Show. It runs after every publish and on every "nothing to deploy", so
 * these known-answer tests pin what it reads (canonical `/` for the bundle,
 * cache-busted build-sha.txt on both hosts) and when it fails.
 */
const SCRIPT = resolve(import.meta.dirname, 'verify-production.sh');
const DOMAIN = 'https://myk9show.com';
const ALIAS = 'https://myk9-platform-myk9show.vercel.app';
const SHA = 'a'.repeat(40);
const OTHER = 'b'.repeat(40);
const page = (chunk: string) =>
  `<!doctype html><html><head><script type="module" src="/assets/scripts/index-${chunk}.js"></script></head></html>`;
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** `served` maps an exact URL (query stripped) to its body; anything else 404s. */
function run(
  served: Record<string, string>,
  commitSha = SHA
): { status: number | null; stdout: string; stderr: string; summary: string; urls: string[] } {
  const bin = mkdtempSync(join(tmpdir(), 'verify-prod-'));
  dirs.push(bin);
  for (const [url, body] of Object.entries(served))
    writeFileSync(join(bin, encodeURIComponent(url)), body);
  const log = join(bin, 'requested.txt');
  writeFileSync(log, '');
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
  const summary = join(bin, 'summary.md');
  writeFileSync(summary, '');
  const r = spawnSync('bash', [SCRIPT], {
    encoding: 'utf8',
    env: {
      PATH: `${bin}:${process.env.PATH}`,
      HOME: process.env.HOME,
      GITHUB_STEP_SUMMARY: summary,
      COMMIT_SHA: commitSha,
      VERIFY_TRIES: '2',
      VERIFY_SLEEP: '0',
    },
  });
  return {
    status: r.status,
    stdout: r.stdout,
    stderr: r.stderr,
    summary: readFileSync(summary, 'utf8'),
    urls: readFileSync(log, 'utf8').trim().split('\n'),
  };
}

const healthy = (): Record<string, string> => ({
  [`${DOMAIN}/`]: page('ABC'),
  [`${ALIAS}/`]: page('ABC'),
  [`${DOMAIN}/build-sha.txt`]: `${SHA}\n`,
  [`${ALIAS}/build-sha.txt`]: `${SHA}\n`,
});

describe('verify-production.sh', { timeout: 30_000 }, () => {
  it('passes when both hosts serve one bundle built from the commit', () => {
    const r = run(healthy());
    expect(r.status).toBe(0);
    expect(r.summary).toContain(`built from \`${SHA}\``);
    expect(r.summary).toContain('index-ABC.js');
  });

  it('reads the homepages at their canonical URL and busts the build-sha cache', () => {
    const r = run(healthy());
    expect(r.urls).toContain(`${DOMAIN}/`);
    expect(r.urls).toContain(`${ALIAS}/`);
    const shaReads = r.urls.filter(u => u.includes('build-sha.txt'));
    expect(shaReads).toHaveLength(2);
    for (const u of shaReads) expect(u).toMatch(/build-sha\.txt\?v=a{40}-\d+-1$/);
  });

  it('bounds every request so a stalled host reaches the retry', () => {
    const src = readFileSync(SCRIPT, 'utf8');
    const curls = src.split('\n').filter(l => /\bcurl --/.test(l));
    expect(curls.length).toBeGreaterThanOrEqual(2);
    for (const l of curls) expect(l).toContain('--max-time');
  });

  it('fails when the hosts serve different bundles, even if both report the commit', () => {
    const r = run({ ...healthy(), [`${DOMAIN}/`]: page('OLD') });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('entry chunk mismatch');
    expect(r.stderr).toContain('rebuild_live=true');
  });

  it('fails when a homepage has no entry chunk', () => {
    const r = run({
      ...healthy(),
      [`${DOMAIN}/`]: '<html></html>',
      [`${ALIAS}/`]: '<html></html>',
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('entry chunk mismatch');
  });

  it('fails when either host reports another commit', () => {
    const domain = run({ ...healthy(), [`${DOMAIN}/build-sha.txt`]: OTHER });
    expect(domain.status).toBe(1);
    expect(domain.stderr).toContain(`${DOMAIN} serves commit '${OTHER}'`);
    const alias = run({ ...healthy(), [`${ALIAS}/build-sha.txt`]: OTHER });
    expect(alias.status).toBe(1);
    expect(alias.stderr).toContain(`${ALIAS} serves commit '${OTHER}'`);
  });

  it('fails when build-sha.txt is missing', () => {
    const served = healthy();
    delete served[`${ALIAS}/build-sha.txt`];
    const r = run(served);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(`${ALIAS} serves commit ''`);
  });

  it('rejects a malformed commit before reading anything', () => {
    const r = run(healthy(), 'abc123');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('40-character');
  });
});
