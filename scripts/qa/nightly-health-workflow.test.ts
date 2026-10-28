import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const workflow = readFileSync(
  resolve(process.cwd(), '.github/workflows/nightly-health.yml'),
  'utf8'
);

const BUILD_STEP = "run: pnpm -r --filter='./packages/*' build";
const HEALTH_STEP = 'run: pnpm qa:nightly:health';

/**
 * Slice the workflow into its top-level jobs.
 *
 * The original assertion used a whole-file `indexOf`, which only ever proved
 * that *some* build step preceded *some* health step. Once a second job was
 * added that also runs `pnpm qa:nightly:health`, that shape would pass even if
 * the new job never built the shared packages — and the failure mode there is
 * a stale `dist/` silently under-testing, not a crash. Slice per job so each
 * one is checked on its own.
 */
function extractJobs(source: string): Map<string, string> {
  const lines = source.split('\n');
  const jobs = new Map<string, string>();

  const jobsIndex = lines.findIndex(line => /^jobs:\s*$/.test(line));
  if (jobsIndex === -1) return jobs;

  let currentJob: string | null = null;
  let buffer: string[] = [];

  for (const line of lines.slice(jobsIndex + 1)) {
    // A non-indented, non-blank line ends the jobs block entirely.
    if (/^\S/.test(line)) break;

    // Read group 1 through the optional chain: it is mandatory on a match, so
    // `!== undefined` is the same condition as `if (jobHeader)` (MYK9-540).
    const jobHeader = line.match(/^ {2}([A-Za-z0-9_-]+):\s*$/)?.[1];
    if (jobHeader !== undefined) {
      if (currentJob) jobs.set(currentJob, buffer.join('\n'));
      currentJob = jobHeader;
      buffer = [];
      continue;
    }
    // Comments are dropped: a comment block sitting above a job header is
    // indented into the *previous* job's slice, and these assertions are about
    // steps, not prose. (Caught by this file's own run — the header comment on
    // cross-browser-health mentions `continue-on-error`, which made the
    // "chromium job stays blocking" assertion fail against a correct workflow.)
    if (/^\s*#/.test(line)) continue;
    if (currentJob) buffer.push(line);
  }
  if (currentJob) jobs.set(currentJob, buffer.join('\n'));

  return jobs;
}

const jobs = extractJobs(workflow);

const PREFLIGHT_STEP =
  'scripts/verify-e2e-auth-preflight.ts --check-roles secretary admin judge exhibitor';
const PREPARE_STEP = 'run: pnpm qa:isolated-e2e:prepare';
const PRODUCTION_PROJECT_REF = 'sojmvhhwsjxmfistvzbe';
const STOP_STEP = 'run: pnpm qa:isolated-e2e:stop';

/**
 * The jobs that actually sweep routes, and therefore carry the build-first and
 * preflight-first obligations below.
 */
const HEALTH_JOBS = ['nightly-health', 'cross-browser-health'] as const;

describe('nightly health workflow', () => {
  it('defines both the blocking chromium job and the advisory cross-browser job', () => {
    for (const name of HEALTH_JOBS) {
      expect([...jobs.keys()], `job ${name} is missing`).toContain(name);
    }
  });

  it('checks EVERY job that sweeps routes, not just the two named above', () => {
    // This replaces an exact `toEqual([...])` on the job list.
    //
    // That equality was the right guard for the wrong reason. Its purpose
    // (#1774) is that a job running route health without building the shared
    // packages first silently under-tests against a stale dist/ — so the
    // it.each list below must never fall behind reality. But exact equality
    // enforces that only by rejecting EVERY new job, including ones that sweep
    // nothing, which is how a notifier job with no route-health step broke it.
    //
    // Deriving the obligation from the workflow is strictly stronger: a new
    // job that DOES sweep routes now fails here even if someone remembers to
    // add it to the list, and a job that does not is simply out of scope.
    const sweeps = [...jobs.entries()]
      .filter(([, body]) => body.includes(HEALTH_STEP))
      .map(([name]) => name);

    expect(sweeps.sort()).toEqual([...HEALTH_JOBS].sort());
  });

  it.each(HEALTH_JOBS)('builds shared packages before running route health in %s', jobName => {
    const job = jobs.get(jobName);
    expect(job, `job ${jobName} not found`).toBeDefined();
    expect(job).toContain(BUILD_STEP);
    expect(job).toContain(HEALTH_STEP);
    expect(job!.indexOf(BUILD_STEP)).toBeLessThan(job!.indexOf(HEALTH_STEP));
  });

  it('keeps the chromium job blocking', () => {
    const job = jobs.get('nightly-health')!;
    expect(job).not.toContain('continue-on-error');
    // No explicit project override — run-nightly-health.sh defaults to chromium.
    expect(job).not.toContain('MYK9_NIGHTLY_HEALTH_PROJECTS');
  });

  it('runs the cross-browser job on WebKit projects, advisory and after the gate', () => {
    const job = jobs.get('cross-browser-health')!;
    expect(job).toContain('continue-on-error: true');
    expect(job).toContain('needs: nightly-health');
    expect(job).toContain("MYK9_NIGHTLY_HEALTH_PROJECTS: 'webkit,mobile-safari'");
    // Installing chromium here would silently produce a run with no browser
    // for either configured project.
    expect(job).toContain('playwright install --with-deps webkit');
  });

  it.each(HEALTH_JOBS)('runs the credential preflight before route health in %s', jobName => {
    const job = jobs.get(jobName)!;
    // Without this, a job whose E2E secrets are missing reports green having
    // exercised only public routes — the route spec test.skip()s each role
    // whose credentials are absent. `if: always()` means the cross-browser
    // job cannot inherit the chromium job's preflight.
    expect(job).toContain(PREFLIGHT_STEP);
    expect(job.indexOf(PREFLIGHT_STEP)).toBeLessThan(job.indexOf(HEALTH_STEP));
  });

  it('skips the browser-independent Vitest block in the cross-browser job only', () => {
    expect(jobs.get('cross-browser-health')!).toContain("MYK9_NIGHTLY_HEALTH_SKIP_VITEST: 'true'");
    expect(jobs.get('nightly-health')!).not.toContain('MYK9_NIGHTLY_HEALTH_SKIP_VITEST');
  });

  // MYK9-1467: signing the fixture accounts into production cost ~12k requests a
  // run and pushed live p95 to 543 ms, so the signed-in sweeps run on the runner's
  // own isolated stack, and only an anonymous probe touches production.
  describe('targets (MYK9-1467)', () => {
    it.each(HEALTH_JOBS)(
      'prepares an isolated stack before the preflight and stops it always in %s',
      jobName => {
        const job = jobs.get(jobName)!;
        expect(job).toContain(PREPARE_STEP);
        expect(job.indexOf(PREPARE_STEP)).toBeLessThan(job.indexOf(PREFLIGHT_STEP));
        expect(job.indexOf(PREPARE_STEP)).toBeLessThan(job.indexOf(HEALTH_STEP));
        const stop = job.indexOf(STOP_STEP);
        expect(stop, 'stop step present').toBeGreaterThan(job.indexOf(HEALTH_STEP));
        expect(job.slice(stop - 60, stop)).toContain('if: always()');
      }
    );

    it.each(HEALTH_JOBS)('passes no production URL or account override in %s', jobName => {
      const job = jobs.get(jobName)!;
      // GITHUB_ENV from the prepare step is the only Supabase target; an
      // explicit secret here would override it with the live project.
      expect(job).not.toMatch(/SUPABASE_[A-Z_]*: \$\{\{ secrets\./);
      expect(job).not.toMatch(/E2E_[A-Z_]+_EMAIL:/);
      expect(job).not.toContain(PRODUCTION_PROJECT_REF);
    });

    it.each(HEALTH_JOBS)('requires canary data on the seeded stack in %s', jobName => {
      const job = jobs.get(jobName)!;
      const run = job.slice(job.indexOf(HEALTH_STEP));
      expect(run.slice(0, run.indexOf('- name:'))).toContain(
        "MYK9_PLAYWRIGHT_REGRESSION_ENABLED: 'true'"
      );
    });

    it('never opts in to signing fixture accounts into production', () => {
      expect(workflow).not.toContain('MYK9_ALLOW_PROD_E2E');
    });

    it('probes production anonymously: public routes on the deployed site, no fixture password', () => {
      const probe = jobs.get('production-probe');
      expect(probe, 'production-probe job').toBeDefined();
      expect(probe).toContain('PLAYWRIGHT_BASE_URL: https://myk9show.com');
      expect(probe).toContain('--grep "Route health: public" --project=chromium');
      expect(probe).toContain('--retries=0');
      // No secret of any kind: with no fixture password the guard lets it run and
      // the signed-in groups skip, so nobody is signed in to production.
      expect(probe).not.toMatch(/\$\{\{\s*secrets\./);
      expect(probe).not.toMatch(/(MYK9_E2E_|VITE_)[A-Z_]+:/);
      expect(probe).not.toContain(HEALTH_STEP);
    });

    it('reports the probe in the tracking-issue verdict, beside the chromium gate', () => {
      const report = jobs.get('report-status')!;
      expect(report).toContain('needs: [nightly-health, cross-browser-health, production-probe]');
      expect(report).toContain(
        "outcome: ${{ (needs.nightly-health.result == 'success' && needs.production-probe.result == 'success') && 'success' || 'failure' }}"
      );
    });
  });
});
