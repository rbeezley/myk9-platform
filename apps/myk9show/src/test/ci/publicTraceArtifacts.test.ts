/**
 * MYK9-1057. Playwright trace archives record network bodies and evaluate
 * arguments, so a trace from any run against the live project holds the test
 * accounts' access and refresh tokens. This repository is public and so are its
 * workflow artifacts: every upload of a Playwright report or test-results
 * directory must exclude `**\/*.zip` beneath it.
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

/**
 * Uploads that may keep their traces, each with its reason. A declared list
 * rather than a heuristic, so a new exemption is a visible edit.
 */
const EXEMPT_UPLOADS: Record<string, string> = {
  // Runs against an isolated Supabase stack started and stopped inside the
  // job, so its tokens die with it.
  'nightly-e2e.yml:myk9show-playwright-regression-report': 'isolated Supabase target',
};

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

/** Included directories that can hold trace archives but are not excluded. */
export function unguardedTraceDirs(step: UploadStep): string[] {
  const exclusions = new Set(step.paths.filter(p => p.startsWith('!')));
  return step.paths
    .filter(p => !p.startsWith('!') && /(playwright-report|test-results)/.test(p))
    .filter(p => p.endsWith('/'))
    .filter(p => !exclusions.has(`!${p}**/*.zip`));
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
    expect(unguardedTraceDirs(step)).toEqual(['apps/myk9show/playwright-report/']);
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
      ])
    );
  });

  it('excludes trace archives from every report or test-results upload', () => {
    const unguarded = uploads
      .filter(({ file, step }) => !(`${file}:${step.name}` in EXEMPT_UPLOADS))
      .flatMap(({ file, step }) =>
        unguardedTraceDirs(step).map(dir => `${file}:${step.name} uploads ${dir}`)
      );
    expect(unguarded).toEqual([]);
  });

  it('every exemption still names a real upload', () => {
    const present = new Set(uploads.map(({ file, step }) => `${file}:${step.name}`));
    expect(Object.keys(EXEMPT_UPLOADS).filter(key => !present.has(key))).toEqual([]);
  });
});
