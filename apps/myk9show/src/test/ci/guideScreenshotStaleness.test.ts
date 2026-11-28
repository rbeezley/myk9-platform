// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { screenSources } from '../../../../../scripts/qa/guide-screenshot-sources';
import {
  buildReport,
  classifyShots,
  gitHistory,
  parseShotList,
  type History,
  type ScreenMap,
} from '../../../../../scripts/qa/guide-screenshot-staleness';

/**
 * MYK9-2411: the report of guide screenshots older than the screen they show.
 * The known-answer fixture is a real git repository with dated commits: one screen changed after
 * its shot was captured (stale), one did not (fresh).
 *
 * Every test here runs on a fixture. None reads the live shot list, map or screenshots: the
 * report is report-only, so what it finds in this repository must never fail a build.
 */

const SHOT_LIST = [
  '| Shot ID | Description | Route | Account | Viewport | Expected state | Guide card | Status |',
  '| ------- | ----------- | ----- | ------- | -------- | -------------- | ---------- | ------ |',
  '| S-01 | Home | `/home` | `a@b.c` | Desktop | Shows listed | 1 | `captured 2026-03-10` |',
  '| S-02 | Reports | `/reports` | `a@b.c` | Desktop | Controls | 2 | `ready (captured 2026-03-10 — staging)` |',
  '| S-03 | Results | `/results` | `a@b.c` | Desktop | Table | 3 | `ready` |',
  '| S-04 | Wizard | `/wizard` | `a@b.c` | Desktop | Step 1 | 4 | `captured 2026-03-10` |',
  '',
  '| Diagram | Serves | Status |',
  '| `flow.drawio` | Guide | `qa-draft` |',
].join('\n');

const MAP: ScreenMap = {
  screens: { home: ['src/home'], reports: ['src/reports'], results: ['src/results'] },
  shots: { 'S-01': 'home', 'S-02': 'reports', 'S-03': 'results' },
};

describe('guide screenshot staleness (fixture repository)', () => {
  let dir: string;

  const git = (args: string[], date?: string): string =>
    execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=t@example.com', ...args], {
      cwd: dir,
      encoding: 'utf8',
      env: {
        ...process.env,
        ...(date ? { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : {}),
      },
    });

  const commit = (file: string, text: string, date: string, subject: string): void => {
    mkdirSync(join(dir, dirname(file)), { recursive: true });
    writeFileSync(join(dir, file), text);
    git(['add', '-A']);
    git(['commit', '-q', '-m', subject], date);
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'guide-shots-'));
    git(['init', '-q']);
    commit('README.md', 'fixture\n', '2026-03-01T12:00:00Z', 'start');
    commit('src/home/Home.tsx', 'v1\n', '2026-03-02T12:00:00Z', 'home v1');
    commit('src/reports/Reports.tsx', 'v1\n', '2026-03-02T13:00:00Z', 'reports v1');
    commit('src/results/Results.tsx', 'v1\n', '2026-03-02T14:00:00Z', 'results v1');
    // Both shots are captured on 2026-03-10. Only Home changes afterwards.
    commit('src/home/Home.tsx', 'v2\n', '2026-03-12T09:00:00Z', 'home gets a new button');
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const verdicts = () => classifyShots(parseShotList(SHOT_LIST), MAP, gitHistory(dir));

  it('calls a shot stale when its screen changed after the capture day, and fresh when it did not', () => {
    const [home, reports] = verdicts();

    expect(home).toMatchObject({ kind: 'stale', lowerBound: false });
    expect(home?.kind === 'stale' ? home.changes.map(change => change.subject) : []).toEqual([
      'home gets a new button',
    ]);
    expect(reports).toMatchObject({ kind: 'fresh', screen: 'reports' });
  });

  it('says why it cannot tell: no capture day, or no screen mapped', () => {
    const [, , results, wizard] = verdicts();

    expect(results).toMatchObject({ kind: 'unknown' });
    expect(results?.kind === 'unknown' ? results.reason : '').toContain('no capture day');
    expect(wizard?.kind === 'unknown' ? wizard.reason : '').toBe('no screen mapped for this shot');
  });

  it('does not count a change on the capture day itself, or a change to a test', () => {
    commit('src/reports/Reports.tsx', 'v2\n', '2026-03-10T18:00:00Z', 'same-day change');
    commit('src/reports/Reports.test.tsx', 'test\n', '2026-03-15T09:00:00Z', 'a test');
    commit('src/reports/__tests__/more.ts', 'test\n', '2026-03-15T10:00:00Z', 'another test');

    expect(verdicts()[1]).toMatchObject({ kind: 'fresh' });
  });

  it('reports a mapped entry that no longer exists instead of calling the shot fresh', () => {
    const moved: ScreenMap = { ...MAP, screens: { ...MAP.screens, reports: ['src/gone'] } };
    const verdict = classifyShots(parseShotList(SHOT_LIST), moved, gitHistory(dir))[1];

    expect(verdict?.kind === 'unknown' ? verdict.reason : '').toBe(
      'mapped entry no longer exists: src/gone'
    );
  });

  it('builds the whole report from a repository laid out like this one, and lists file mismatches', () => {
    mkdirSync(join(dir, 'docs/training'), { recursive: true });
    mkdirSync(join(dir, 'docs/screenshots'), { recursive: true });
    mkdirSync(join(dir, 'scripts/qa'), { recursive: true });
    writeFileSync(join(dir, 'docs/training/screenshot-shot-list.md'), SHOT_LIST);
    writeFileSync(join(dir, 'scripts/qa/guide-screenshot-screens.json'), JSON.stringify(MAP));
    for (const file of ['S-01.png', 'S-02.png', 'X-99.png']) {
      writeFileSync(join(dir, 'docs/screenshots', file), '');
    }

    const report = buildReport(dir);

    expect(report).toContain('1 stale, 1 fresh, 2 could not tell (of 4 shots)');
    expect(report).toContain(
      '| S-01 | Home | 2026-03-10 | 1 | 2026-03-12 home gets a new button |'
    );
    expect(report).toContain('### Screenshot files with no shot-list row\n\nX-99.png');
    expect(report).toContain('### Captured shots with no screenshot file\n\nS-04');
  });
});

describe('guide screenshot staleness (history that starts late)', () => {
  const shots = parseShotList(SHOT_LIST).slice(0, 2);
  const shallow = (changes: History['changesAfter']): History => ({
    historyStart: '2026-03-20T00:00:00.000Z',
    exists: () => true,
    changesAfter: changes,
  });

  it('cannot call a shot fresh when it was captured before the history starts', () => {
    const [home] = classifyShots(
      shots,
      MAP,
      shallow(() => [])
    );

    expect(home?.kind === 'unknown' ? home.reason : '').toBe(
      "captured before this clone's history starts (2026-03-20)"
    );
  });

  it('still calls it stale when a later change is found, as a lower bound', () => {
    const [home] = classifyShots(
      shots,
      MAP,
      shallow(() => [{ date: '2026-03-25T00:00:00Z', subject: 'later' }])
    );

    expect(home).toMatchObject({ kind: 'stale', lowerBound: true });
  });
});

describe('the files that draw a screen (import closure, fixture tree)', () => {
  let dir: string;
  const SRC = 'apps/myk9show/src';
  const write = (file: string, text: string): void => {
    mkdirSync(join(dir, dirname(file)), { recursive: true });
    writeFileSync(join(dir, file), text);
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'guide-sources-'));
    // A page that delegates to a panel, which delegates to a row: the case a hand-kept list
    // of components kept missing (Codex review of #4477).
    write(
      `${SRC}/pages/DogsPage.tsx`,
      [
        "import { AddDogPanel } from '@/components/panels/AddDogPanel';",
        "import { Button } from '@/components/ui/button';",
        "import { useDogs } from '@/hooks/useDogs';",
        "import { formatDog } from './dogsFormat';",
        "import { Something } from '@myk9/ui';",
        "import React from 'react';",
        "const Lazy = React.lazy(() => import('../features/dogs/DogHistory'));",
      ].join('\n')
    );
    write(`${SRC}/pages/dogsFormat.ts`, "import '../components/dogs/DogBadge';\n");
    write(`${SRC}/pages/DogsPage.test.tsx`, "import './DogsPage';\n");
    write(`${SRC}/components/panels/AddDogPanel.tsx`, "import { DogRow } from './DogRow';\n");
    write(`${SRC}/components/panels/DogRow.tsx`, "import './dogRow.css';\n");
    write(`${SRC}/components/panels/dogRow.css`, '.row {}\n');
    write(`${SRC}/components/panels/Unrelated.tsx`, 'export {};\n');
    write(`${SRC}/components/dogs/DogBadge.tsx`, 'export {};\n');
    write(`${SRC}/components/ui/button.tsx`, "import '../panels/Unrelated';\n");
    write(`${SRC}/hooks/useDogs.ts`, "import '@/components/panels/Unrelated';\n");
    write(`${SRC}/features/dogs/DogHistory/index.tsx`, 'export {};\n');
    write(
      'packages/ringside/src/pages/EntryList.tsx',
      "import './parts/Card';\nimport '@/pages/DogsPage';\n"
    );
    write('packages/ringside/src/pages/parts/Card.tsx', 'export {};\n');
    write('packages/ringside/src/pages/parts/Card.test.tsx', 'export {};\n');
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('follows a page to the panel and the row it renders, a lazy import included', () => {
    expect(screenSources(dir, [`${SRC}/pages/DogsPage.tsx`])).toEqual([
      `${SRC}/components/dogs/DogBadge.tsx`,
      `${SRC}/components/panels/AddDogPanel.tsx`,
      `${SRC}/components/panels/DogRow.tsx`,
      `${SRC}/components/panels/dogRow.css`,
      `${SRC}/features/dogs/DogHistory/index.tsx`,
      `${SRC}/pages/DogsPage.tsx`,
    ]);
  });

  it('leaves out shared building blocks, logic, tests and other packages, and does not look through them', () => {
    const files = screenSources(dir, [`${SRC}/pages/DogsPage.tsx`]);

    expect(files).not.toContain(`${SRC}/components/ui/button.tsx`);
    expect(files).not.toContain(`${SRC}/hooks/useDogs.ts`);
    // Reached only through the shared button and the hook, so it is not this screen's.
    expect(files).not.toContain(`${SRC}/components/panels/Unrelated.tsx`);
    expect(files).not.toContain(`${SRC}/pages/DogsPage.test.tsx`);
    // A helper is followed (it led to DogBadge) but, being logic, is not listed.
    expect(files).not.toContain(`${SRC}/pages/dogsFormat.ts`);
  });

  it('keeps an entry inside a package to that package', () => {
    expect(screenSources(dir, ['packages/ringside/src/pages/EntryList.tsx'])).toEqual([
      'packages/ringside/src/pages/EntryList.tsx',
      'packages/ringside/src/pages/parts/Card.tsx',
    ]);
  });

  it('takes a directory entry as every source file in it, and ignores an entry that is gone', () => {
    expect(screenSources(dir, ['packages/ringside/src/pages/parts', 'packages/gone'])).toEqual([
      'packages/ringside/src/pages/parts/Card.tsx',
    ]);
  });

  it('counts a change to a component the page renders, through the whole report', () => {
    const git = (args: string[], date?: string): string =>
      execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=t@example.com', ...args], {
        cwd: dir,
        encoding: 'utf8',
        env: {
          ...process.env,
          ...(date ? { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : {}),
        },
      });
    write(
      'docs/training/screenshot-shot-list.md',
      '| E-05 | Add dog | `/dogs` | `captured 2026-03-10` |\n'
    );
    write('docs/screenshots/E-05.png', '');
    write(
      'scripts/qa/guide-screenshot-screens.json',
      JSON.stringify({
        screens: { dogs: [`${SRC}/pages/DogsPage.tsx`] },
        shots: { 'E-05': 'dogs' },
      })
    );
    git(['init', '-q']);
    git(['add', '-A']);
    git(['commit', '-q', '-m', 'start'], '2026-03-01T12:00:00Z');
    // The page file itself never changes again; only the row it renders does.
    write(`${SRC}/components/panels/DogRow.tsx`, "import './dogRow.css';\nexport const v = 2;\n");
    git(['add', '-A']);
    git(['commit', '-q', '-m', 'the row gets a new column'], '2026-03-12T09:00:00Z');

    expect(buildReport(dir)).toContain(
      '| E-05 | Add dog | 2026-03-10 | 1 | 2026-03-12 the row gets a new column |'
    );
  });
});
