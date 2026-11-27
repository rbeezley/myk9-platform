// @vitest-environment node
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildReport,
  classifyShots,
  findFileMismatches,
  gitHistory,
  parseShotList,
  type History,
  type ScreenMap,
} from '../../../../../scripts/qa/guide-screenshot-staleness';

/**
 * MYK9-2411: the report of guide screenshots older than the screen they show.
 * The known-answer fixture is a real git repository with dated commits: one screen changed after
 * its shot was captured (stale), one did not (fresh).
 */
const repoRoot = resolve(import.meta.dirname, '../../../../..');

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

  it('reports a mapped source that no longer exists instead of calling the shot fresh', () => {
    const moved: ScreenMap = { ...MAP, screens: { ...MAP.screens, reports: ['src/gone'] } };
    const verdict = classifyShots(parseShotList(SHOT_LIST), moved, gitHistory(dir))[1];

    expect(verdict?.kind === 'unknown' ? verdict.reason : '').toBe(
      'mapped source no longer exists: src/gone'
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

describe('guide screenshot staleness (this repository)', () => {
  const shots = parseShotList(
    readFileSync(join(repoRoot, 'docs/training/screenshot-shot-list.md'), 'utf8')
  );
  const map = JSON.parse(
    readFileSync(join(repoRoot, 'scripts/qa/guide-screenshot-screens.json'), 'utf8')
  ) as ScreenMap;

  it('reads the real shot list', () => {
    expect(shots.length).toBeGreaterThan(20);
    expect(shots.find(shot => shot.id === 'S-01')?.capturedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  // The map is hand-kept. A page that moves must fail here, in the same change that moved it.
  it('maps every shot to a screen whose source exists', () => {
    // No git here: only whether each mapped path is on disk.
    const history: History = {
      historyStart: null,
      exists: path => existsSync(join(repoRoot, path)),
      changesAfter: () => [],
    };
    const broken = classifyShots(shots, map, history)
      .filter(verdict => verdict.kind === 'unknown' && !verdict.reason.startsWith('no capture day'))
      .map(verdict => `${verdict.shot.id}: ${verdict.kind === 'unknown' ? verdict.reason : ''}`);

    expect(broken).toEqual([]);
  });

  it('finds the screenshot files and rows that do not match up', () => {
    const files = readdirSync(join(repoRoot, 'docs/screenshots')).filter(f => f.endsWith('.png'));

    // Every captured shot has its picture; extra pictures are reported, not failed.
    expect(findFileMismatches(shots, files).rowsWithoutFile).toEqual([]);
  });
});
