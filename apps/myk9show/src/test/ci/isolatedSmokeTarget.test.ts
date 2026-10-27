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

  it('no workflow-level env hands every job a Supabase value', () => {
    const lines = workflow.split('\n');
    const start = lines.indexOf('env:');
    const end = lines.indexOf('jobs:');
    const workflowEnv = start === -1 ? '' : lines.slice(start, end).join('\n');
    expect(workflowEnv).not.toMatch(/SUPABASE/);
  });

  it.each(BROWSER_JOBS)('%s reads no live-project secret', jobHeading => {
    const block = jobBlock(jobHeading).join('\n');
    expect(block).not.toMatch(/(secrets|vars)\.VITE_SUPABASE_/);
    expect(block).not.toMatch(/(secrets|vars)\.SUPABASE_/);
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

      // The seeded local target always has canary data, so absence must fail
      // rather than skip (helpers/liveCanary.ts DATA_REQUIRED).
      if (jobHeading === 'e2e-myk9show:') {
        const nextStep = block.findIndex((line, i) => i > test && /^ {6}- /.test(line));
        const testStep = block.slice(test, nextStep).join('\n');
        expect(testStep).toContain("MYK9_PLAYWRIGHT_REGRESSION_ENABLED: 'true'");
      }

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

  const LOCAL = 'http://127.0.0.1:54321';

  function exitCode(dir: string, target: string | null = LOCAL): number {
    const env = { ...process.env };
    delete env.VITE_SUPABASE_URL;
    if (target !== null) env.VITE_SUPABASE_URL = target;
    try {
      execFileSync('bash', [ASSERT_SCRIPT, dir], { stdio: 'pipe', env });
      return 0;
    } catch (error) {
      return (error as { status?: number }).status ?? -1;
    }
  }

  it('passes a bundle built against the prepared loopback stack', () => {
    expect(exitCode(bundle(`const u="${LOCAL}";`))).toBe(0);
    expect(exitCode(bundle(`const u="${LOCAL}";`), `${LOCAL}/`)).toBe(0);
  });

  it('fails a bundle that names the live project, even beside the loopback URL', () => {
    const js = `const u="https://sojmvhhwsjxmfistvzbe.supabase.co";const l="${LOCAL}";`;
    expect(exitCode(bundle(js))).toBe(1);
  });

  it('fails a bundle with no Supabase URL at all (built before the target was prepared)', () => {
    expect(exitCode(bundle('const u="";'))).toBe(1);
  });

  it('fails a bundle that names some other loopback URL, not the prepared one', () => {
    expect(exitCode(bundle('const u="http://localhost:3001";'))).toBe(1);
  });

  it('refuses to run without a loopback VITE_SUPABASE_URL', () => {
    const dir = bundle(`const u="${LOCAL}";`);
    expect(exitCode(dir, null)).toBe(2);
    expect(exitCode(dir, 'https://sojmvhhwsjxmfistvzbe.supabase.co')).toBe(2);
  });

  it('refuses a directory with no JavaScript rather than passing it', () => {
    expect(exitCode(bundle(null))).toBe(2);
  });
});
