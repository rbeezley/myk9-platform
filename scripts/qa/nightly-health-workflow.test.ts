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

    const jobHeader = line.match(/^ {2}([A-Za-z0-9_-]+):\s*$/);
    if (jobHeader) {
      if (currentJob) jobs.set(currentJob, buffer.join('\n'));
      currentJob = jobHeader[1];
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

describe('nightly health workflow', () => {
  it('defines both the blocking chromium job and the advisory cross-browser job', () => {
    expect([...jobs.keys()]).toEqual(['nightly-health', 'cross-browser-health']);
  });

  it.each(['nightly-health', 'cross-browser-health'])(
    'builds shared packages before running route health in %s',
    jobName => {
      const job = jobs.get(jobName);
      expect(job, `job ${jobName} not found`).toBeDefined();
      expect(job).toContain(BUILD_STEP);
      expect(job).toContain(HEALTH_STEP);
      expect(job!.indexOf(BUILD_STEP)).toBeLessThan(job!.indexOf(HEALTH_STEP));
    }
  );

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

  it('skips the browser-independent Vitest block in the cross-browser job only', () => {
    expect(jobs.get('cross-browser-health')!).toContain("MYK9_NIGHTLY_HEALTH_SKIP_VITEST: 'true'");
    expect(jobs.get('nightly-health')!).not.toContain('MYK9_NIGHTLY_HEALTH_SKIP_VITEST');
  });
});
