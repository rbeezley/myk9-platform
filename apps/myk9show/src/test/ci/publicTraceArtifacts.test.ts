/**
 * MYK9-1057. Playwright trace archives record network bodies, evaluate
 * arguments and typed form values, so a trace holds the test accounts' tokens
 * and passwords, which are the live project's (even a run against a disposable
 * database signs in with them). This repository is public and so are its
 * workflow artifacts: every upload of a Playwright report or test-results
 * directory must exclude `**\/*.zip` beneath it. There are no exemptions.
 *
 * The workflows are read line by line rather than through a YAML library (none
 * is a dependency); `uploadSteps` is checked against planted known answers
 * below, so a parser that stopped finding steps fails here instead of passing
 * every workflow vacuously.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const WORKFLOWS_DIR = resolve(import.meta.dirname, '../../../../../.github/workflows');

interface UploadStep {
  name: string;
  paths: string[];
}

/** Every `actions/upload-artifact` step's artifact name and path lines. */
export function uploadSteps(workflow: string): UploadStep[] {
  const lines = workflow.split('\n');
  const steps: UploadStep[] = [];
  lines.forEach((line, index) => {
    if (!/uses:\s*actions\/upload-artifact@/.test(line)) return;
    const step: UploadStep = { name: '', paths: [] };
    const stepIndent = line.search(/\S/);
    for (let i = index + 1; i < lines.length; i += 1) {
      const current = lines[i];
      if (current.trim() === '' || current.trim().startsWith('#')) continue;
      const indent = current.search(/\S/);
      if (indent <= stepIndent && !current.trim().startsWith('with:')) break;
      const name = current.match(/^\s*name:\s*(\S+)/);
      if (name) step.name = name[1];
      const path = current.match(/^(\s*)path:\s*(.*)$/);
      if (!path) continue;
      if (path[2].trim() !== '|') {
        step.paths.push(path[2].trim());
        continue;
      }
      const blockIndent = path[1].length;
      for (let j = i + 1; j < lines.length; j += 1) {
        const entry = lines[j];
        if (entry.trim() === '') continue;
        if (entry.search(/\S/) <= blockIndent) break;
        step.paths.push(entry.trim());
      }
    }
    steps.push(step);
  });
  return steps;
}

/** `dir`, `dir/` and `dir/**` all upload the same tree; reduce them to `dir`. */
function directoryOf(path: string): string {
  return path.replace(/\/\*\*$/, '').replace(/\/+$/, '');
}

/** A path naming one file of a type a trace is not, e.g. `shard-1.json`. */
function namesNonTraceFile(path: string): boolean {
  return /\.(json|md|txt|html|png|webm|xml)$/.test(path);
}

/** Included report or test-results trees whose trace archives are not excluded. */
export function unguardedTraceDirs(step: UploadStep): string[] {
  const excluded = new Set(
    step.paths
      .filter(p => p.startsWith('!') && p.endsWith('/**/*.zip'))
      .map(p => p.slice(1, -'/**/*.zip'.length))
  );
  return step.paths
    .filter(p => !p.startsWith('!') && /(playwright-report|test-results)/.test(p))
    .filter(p => !namesNonTraceFile(p))
    .map(directoryOf)
    .filter(dir => !excluded.has(dir));
}

const PLANTED_BAD = `
      - name: Upload report
        if: always()
        uses: actions/upload-artifact@v7
        with:
          name: planted
          path: apps/myk9show/playwright-report/
          retention-days: 7
`;

const PLANTED_GOOD = `
      - name: Upload report
        uses: actions/upload-artifact@v7
        with:
          name: planted
          # comment
          path: |
            apps/myk9show/playwright-report/
            !apps/myk9show/playwright-report/**/*.zip
          retention-days: 7
`;

describe('uploadSteps / unguardedTraceDirs (known answers)', () => {
  it('finds a single-line report upload and reports it unguarded', () => {
    const [step] = uploadSteps(PLANTED_BAD);
    expect(step).toEqual({ name: 'planted', paths: ['apps/myk9show/playwright-report/'] });
    expect(unguardedTraceDirs(step)).toEqual(['apps/myk9show/playwright-report']);
  });

  it.each([
    'apps/myk9show/playwright-report',
    'apps/myk9show/playwright-report/',
    'apps/myk9show/playwright-report/**',
  ])('treats %s as the whole tree, guarded only by its zip exclusion', path => {
    expect(unguardedTraceDirs({ name: 'planted', paths: [path] })).toEqual([
      'apps/myk9show/playwright-report',
    ]);
    expect(
      unguardedTraceDirs({
        name: 'planted',
        paths: [path, '!apps/myk9show/playwright-report/**/*.zip'],
      })
    ).toEqual([]);
  });

  it('leaves a named JSON result file alone', () => {
    const step = {
      name: 'planted',
      paths: ['apps/myk9show/test-results/load-shards/shard-1.json'],
    };
    expect(unguardedTraceDirs(step)).toEqual([]);
  });

  it('reads a block path list and accepts the zip exclusion', () => {
    const [step] = uploadSteps(PLANTED_GOOD);
    expect(step.paths).toEqual([
      'apps/myk9show/playwright-report/',
      '!apps/myk9show/playwright-report/**/*.zip',
    ]);
    expect(unguardedTraceDirs(step)).toEqual([]);
  });
});

describe('public workflow artifacts never carry Playwright traces (MYK9-1057)', () => {
  const files = readdirSync(WORKFLOWS_DIR).filter(f => /\.ya?ml$/.test(f));
  const uploads = files.flatMap(file =>
    uploadSteps(readFileSync(join(WORKFLOWS_DIR, file), 'utf8')).map(step => ({ file, step }))
  );

  it('finds the uploads it is meant to guard', () => {
    const names = uploads.map(({ step }) => step.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'myk9show-a11y-report',
        'myk9show-e2e-results',
        'myk9show-nightly-health-report',
        'myk9show-cross-browser-health-report',
        'page-readiness-traces',
        'myk9show-playwright-regression-report',
      ])
    );
  });

  it('excludes trace archives from every report or test-results upload', () => {
    const unguarded = uploads.flatMap(({ file, step }) =>
      unguardedTraceDirs(step).map(dir => `${file}:${step.name} uploads ${dir}`)
    );
    expect(unguarded).toEqual([]);
  });
});
