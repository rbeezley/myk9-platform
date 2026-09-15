import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MIN_PINNED_INVOCATIONS,
  PINNED_RAW_INVOCATIONS,
  PINNED_SCRIPTS,
  REQUIRED_JOB_NAMES,
  VITEST_CONFIG_PATH,
  VITEST_ROOT_INCLUDE,
  WORKFLOW_PATH,
  classify,
  gatingJobs,
  parseWorkflow,
  readScripts,
  workspaceDirs,
} from './required-job-launchers';
import { requiredTier } from './review-tier';

const ROOT = resolve(import.meta.dirname, '..', '..');
const workflow = readFileSync(join(ROOT, WORKFLOW_PATH), 'utf8');
const jobs = parseWorkflow(workflow);
const gating = gatingJobs(jobs);
const pkgDirs = workspaceDirs(ROOT);

const key = (pkgDir: string, script: string): string => `${pkgDir}::${script}`;

/** Every `pnpm …` line the required jobs (and their `needs:`) actually run. */
const extracted = gating.flatMap(job =>
  job.invocations.map(inv => ({
    job: job.id,
    ...inv,
    ...classify(inv.command, inv.workdir, pkgDirs),
  }))
);
const extractedScripts = new Map<string, { pkgDir: string; script: string }>();
const extractedRaw = new Set<string>();
for (const item of extracted) {
  if (item.kind === 'script') extractedScripts.set(key(item.pkgDir, item.script), item);
  else extractedRaw.add(item.command);
}

describe('required-job launcher extraction', () => {
  it('resolves every required check name to a real job', () => {
    const names = new Set(jobs.map(j => j.name));
    for (const required of REQUIRED_JOB_NAMES) expect(names, required).toContain(required);
  });

  it('walks the required jobs and everything they transitively need', () => {
    const ids = gating.map(j => j.id);
    // `Test` is an aggregator with no `run:` of its own; its `needs:` carry the
    // real work, so a walk that stopped at the required job would cover nothing.
    expect(ids).toContain('test');
    expect(ids).toContain('test-packages');
    expect(ids).toContain('smoke-build');
    expect(ids).toContain('build');
  });

  // The assertion that cannot pass on nothing. A regex parse that stops
  // matching yields an empty list, and an empty list satisfies every
  // "each extracted invocation is pinned" assertion below vacuously.
  it('extracts at least MIN_PINNED_INVOCATIONS distinct package scripts', () => {
    expect(extractedScripts.size).toBeGreaterThanOrEqual(MIN_PINNED_INVOCATIONS);
    expect(extractedRaw.size).toBeGreaterThan(0);
  });
});

describe('launcher pin', () => {
  it('covers every package script a required job invokes', () => {
    const pinned = new Set(PINNED_SCRIPTS.map(p => key(p.pkgDir, p.script)));
    const unpinned = [...extractedScripts.keys()].filter(k => !pinned.has(k));
    expect(unpinned, 'required CI jobs invoke scripts this pin does not cover').toEqual([]);
  });

  it('pins no script a required job has stopped invoking', () => {
    const stale = PINNED_SCRIPTS.map(p => key(p.pkgDir, p.script)).filter(
      k => !extractedScripts.has(k)
    );
    expect(stale, 'pinned scripts no longer invoked by any required job').toEqual([]);
  });

  it.each(PINNED_SCRIPTS.map(p => [key(p.pkgDir, p.script), p] as const))(
    '%s still resolves to its pinned command',
    (_label, pin) => {
      const scripts = readScripts(ROOT, pin.pkgDir);
      expect(
        scripts,
        `${pin.script} no longer exists in ${pin.pkgDir}/package.json`
      ).toHaveProperty(pin.script);
      expect(scripts[pin.script]).toBe(pin.command);
    }
  );

  it('covers every non-script pnpm invocation verbatim', () => {
    expect([...extractedRaw].sort()).toEqual([...PINNED_RAW_INVOCATIONS].sort());
  });

  it('pins the root vitest project include that runs the guard tests', () => {
    const config = readFileSync(join(ROOT, VITEST_CONFIG_PATH), 'utf8');
    expect(config, 'without this include NO scripts/** test runs in CI').toContain(
      VITEST_ROOT_INCLUDE
    );
  });
});

describe('the tiering this pin exists to preserve', () => {
  it('floors the pin itself at independent', () => {
    expect(requiredTier(['scripts/qa/required-job-launchers.ts']).tier).toBe('independent');
    expect(requiredTier(['scripts/qa/required-job-launchers.test.ts']).tier).toBe('independent');
  });

  it('leaves a pure dependency bump at adversarial', () => {
    expect(requiredTier(['package.json', 'pnpm-lock.yaml']).tier).toBe('adversarial');
  });

  it('raises a package.json change that also edits the pin to independent', () => {
    expect(requiredTier(['package.json', 'scripts/qa/required-job-launchers.ts']).tier).toBe(
      'independent'
    );
  });
});

describe('the parser fails loud rather than empty', () => {
  it('throws when the workflow has no jobs block', () => {
    expect(() => parseWorkflow('name: CI\non:\n  push:\n')).toThrow(/no top-level/);
  });

  it('throws when the jobs block parses to nothing', () => {
    expect(() => parseWorkflow('jobs:\n')).toThrow(/parsed 0 jobs/);
  });

  it('throws when a required check name matches no job', () => {
    const renamed = workflow.replace('name: Quality Checks', 'name: Quality Checks (renamed)');
    expect(() => gatingJobs(parseWorkflow(renamed))).toThrow(/matches no job/);
  });

  it('throws when a job has no name', () => {
    expect(() => parseWorkflow('jobs:\n  lonely:\n    runs-on: ubuntu-latest\n')).toThrow(
      /has no `name:`/
    );
  });
});
