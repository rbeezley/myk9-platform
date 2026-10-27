// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * MYK9-1449: on 2026-10-27 one E2E PR Smoke run signed the fixture accounts
 * into the live Supabase project and held real users' p95 API latency at 4-5 s
 * for eight minutes. Browser smoke now builds and tests against a disposable
 * local stack inside each job. This file pins that, in each browser job:
 *
 * - no step reads a live-project secret (VITE_SUPABASE_*, service role, or an
 *   E2E_*_EMAIL override that would point a sign-in at an unseeded account);
 * - the isolated target is prepared before the bundle is built, the bundle is
 *   checked before any browser runs, and the stack is stopped on every outcome;
 *
 * and runs the bundle check itself against known-answer bundles in both
 * directions, so a check that cannot fail fails here.
 */
const REPO_ROOT = resolve(import.meta.dirname, '../../../../..');
const workflow = readFileSync(join(REPO_ROOT, '.github/workflows/ci.yml'), 'utf8');
const ASSERT_SCRIPT = join(REPO_ROOT, 'scripts/ci/assert-local-smoke-bundle.sh');

const BROWSER_JOBS = ['a11y:', 'e2e-myk9show:'] as const;

function jobBlock(jobHeading: string): string[] {
  const lines = workflow.split('\n');
  const start = lines.findIndex(line => line === `  ${jobHeading}`);
  expect(start, `job "${jobHeading}" not found in workflow`).toBeGreaterThan(-1);
  const block: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^ {2}\S.*:$/.test(lines[i] ?? '')) break;
    block.push(lines[i] ?? '');
  }
  return block;
}

/** Index of the first step whose `- name:` or `run:` line contains `text`. */
function stepIndex(block: string[], text: string): number {
  const index = block.findIndex(line =>
    /^ {6}- /.test(line) || /^ {8}run:/.test(line) ? line.includes(text) : false
  );
  expect(index, `step containing "${text}" not found`).toBeGreaterThan(-1);
  return index;
}

describe('browser smoke never targets the live project (MYK9-1449)', () => {
  it('the shared Smoke build job, which built against the live project, is gone', () => {
    expect(workflow.split('\n')).not.toContain('  smoke-build:');
    expect(workflow).not.toContain('myk9show-preview-dist');
  });

  it.each(BROWSER_JOBS)('%s reads no live-project secret', jobHeading => {
    const block = jobBlock(jobHeading).join('\n');
    expect(block).not.toMatch(/secrets\.VITE_SUPABASE_/);
    expect(block).not.toMatch(/secrets\.SUPABASE_/);
    expect(block).not.toMatch(/secrets\.E2E_[A-Z_]*_EMAIL/);
  });

  it.each(BROWSER_JOBS)(
    '%s prepares the local target, builds, checks the bundle, tests, and always stops',
    jobHeading => {
      const block = jobBlock(jobHeading);
      const setupCli = stepIndex(block, 'supabase/setup-cli@');
      const prepare = stepIndex(block, 'run: pnpm qa:isolated-e2e:prepare');
      const build = stepIndex(block, 'run: pnpm build');
      const check = stepIndex(block, 'run: bash scripts/ci/assert-local-smoke-bundle.sh');
      const test = stepIndex(
        block,
        jobHeading === 'a11y:' ? 'run: pnpm test:a11y' : 'run: pnpm test:e2e:ci'
      );
      const stop = stepIndex(block, 'run: pnpm qa:isolated-e2e:stop');

      expect(setupCli).toBeLessThan(prepare);
      expect(prepare).toBeLessThan(build);
      expect(build).toBeLessThan(check);
      expect(check).toBeLessThan(test);
      expect(test).toBeLessThan(stop);
      expect(block[stop - 1]?.trim()).toBe('if: always()');

      const prepareStep = block.slice(prepare - 1, build).join('\n');
      expect(prepareStep).toContain('MYK9_PLAYWRIGHT_REGRESSION_TARGET: isolated');
      expect(prepareStep).toContain('MYK9_E2E_APPROVED_PROJECT_REFS: local');
      expect(prepareStep).toContain('MYK9_E2E_SUPABASE_PROJECT_REF: local');
    }
  );
});

describe('assert-local-smoke-bundle.sh known answers', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  function bundle(js: string | null): string {
    const dir = mkdtempSync(join(tmpdir(), 'smoke-bundle-'));
    dirs.push(dir);
    mkdirSync(join(dir, 'assets'));
    if (js !== null) writeFileSync(join(dir, 'assets', 'index-abc.js'), js);
    writeFileSync(join(dir, 'index.html'), '<!doctype html>');
    return dir;
  }

  function exitCode(dir: string): number {
    try {
      execFileSync('bash', [ASSERT_SCRIPT, dir], { stdio: 'pipe' });
      return 0;
    } catch (error) {
      return (error as { status?: number }).status ?? -1;
    }
  }

  it('passes a bundle built against the loopback stack', () => {
    expect(exitCode(bundle('const u="http://127.0.0.1:54321";'))).toBe(0);
  });

  it('fails a bundle that names the live project, even beside a loopback URL', () => {
    const js =
      'const u="https://sojmvhhwsjxmfistvzbe.supabase.co";const l="http://127.0.0.1:54321";';
    expect(exitCode(bundle(js))).toBe(1);
  });

  it('fails a bundle with no Supabase URL at all (built before the target was prepared)', () => {
    expect(exitCode(bundle('const u="";'))).toBe(1);
  });

  it('refuses a directory with no JavaScript rather than passing it', () => {
    expect(exitCode(bundle(null))).toBe(2);
  });
});
