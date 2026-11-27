/**
 * MYK9-2411: report guide screenshots older than the screen they show.
 *
 * Every guide screenshot has a row in docs/training/screenshot-shot-list.md with the day it was
 * captured (`captured 2026-11-04`). `guide-screenshot-screens.json` names the entry (the page or
 * panel) of the screen each shot shows; `guide-screenshot-sources.ts` follows that entry's imports
 * to the components it renders. A shot is STALE when a commit after its capture day changed any
 * of those files.
 *
 * This is a report, never a gate. It always exits 0, no CI job runs it, and no test reads the
 * live shot list or map: run it when planning a recapture batch (most-changed screens first).
 *
 * What it cannot know:
 *  - Whether a change is visible. A refactor counts the same as a new button.
 *  - Changes to shared building blocks and to logic (see `guide-screenshot-sources.ts`).
 *  - Anything on the capture day itself: only commits after that day count.
 *  - History it does not have. In a shallow clone a shot captured before the history starts is
 *    "could not tell" unless a later change is found (then it is stale, with a lower-bound count).
 *
 * Usage: tsx scripts/qa/guide-screenshot-staleness.ts   (pnpm qa:guide-shots)
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { screenSources } from './guide-screenshot-sources';

export interface Shot {
  id: string;
  description: string;
  /** The Status cell as written. */
  status: string;
  /** `YYYY-MM-DD` from "captured <date>", or null when the row names no capture day. */
  capturedOn: string | null;
}

/** Entries (a page, a panel) to every file that draws the screen. */
export type ExpandSources = (entries: string[]) => string[];

export interface ScreenMap {
  /** Screen name to its repo-relative entries: the page or panel, as a file or a directory. */
  screens: Record<string, string[]>;
  /** Shot id to a screen name. */
  shots: Record<string, string>;
}

export interface Change {
  /** Committer date, ISO 8601. */
  date: string;
  subject: string;
}

/** What the report needs from the repository; the tests hand in a real fixture repo. */
export interface History {
  /** Commits after `day` (a `YYYY-MM-DD`, UTC) that changed non-test files under `paths`, newest first. */
  changesAfter(paths: string[], day: string): Change[];
  /** When the available history starts (ISO), or null when the clone is complete. */
  historyStart: string | null;
  exists(path: string): boolean;
}

export type Verdict =
  | { kind: 'stale'; shot: Shot; screen: string; changes: Change[]; lowerBound: boolean }
  | { kind: 'fresh'; shot: Shot; screen: string }
  | { kind: 'unknown'; shot: Shot; reason: string };

const SHOT_ROW = /^\|\s*([A-Z]+-\d+)\s*\|/;
const CAPTURED = /captured\s+(\d{4}-\d{2}-\d{2})/;

/** Rows of the shot list's tables: the first cell is a shot id, the last cell is the status. */
export function parseShotList(markdown: string): Shot[] {
  const shots: Shot[] = [];
  for (const line of markdown.split('\n')) {
    if (!SHOT_ROW.test(line)) continue;
    const cells = line
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map(cell => cell.trim());
    const id = cells[0] ?? '';
    const status = (cells[cells.length - 1] ?? '').replace(/`/g, '');
    shots.push({
      id,
      description: cells[1] ?? '',
      status,
      capturedOn: CAPTURED.exec(status)?.[1] ?? null,
    });
  }
  return shots;
}

function classifyShot(
  shot: Shot,
  map: ScreenMap,
  history: History,
  expand: ExpandSources
): Verdict {
  if (!shot.capturedOn) {
    return { kind: 'unknown', shot, reason: `no capture day in its status ("${shot.status}")` };
  }
  const screen = map.shots[shot.id];
  if (!screen) return { kind: 'unknown', shot, reason: 'no screen mapped for this shot' };
  const paths = map.screens[screen];
  if (!paths || paths.length === 0) {
    return { kind: 'unknown', shot, reason: `screen "${screen}" has no source listed` };
  }
  const missing = paths.filter(path => !history.exists(path));
  if (missing.length > 0) {
    return {
      kind: 'unknown',
      shot,
      reason: `mapped entry no longer exists: ${missing.join(', ')}`,
    };
  }

  const changes = history.changesAfter(expand(paths), shot.capturedOn);
  // History that starts after the capture day cannot prove nothing changed in between.
  const beforeHistory =
    history.historyStart !== null && endOfDay(shot.capturedOn) < history.historyStart;
  if (changes.length > 0)
    return { kind: 'stale', shot, screen, changes, lowerBound: beforeHistory };
  if (beforeHistory) {
    return {
      kind: 'unknown',
      shot,
      reason: `captured before this clone's history starts (${history.historyStart?.slice(0, 10)})`,
    };
  }
  return { kind: 'fresh', shot, screen };
}

/**
 * `expand` turns a screen's entries into the files that draw it. It defaults to the entries
 * themselves; the real report follows imports (`screenSources`).
 */
export function classifyShots(
  shots: Shot[],
  map: ScreenMap,
  history: History,
  expand: ExpandSources = entries => entries
): Verdict[] {
  return shots.map(shot => classifyShot(shot, map, history, expand));
}

/** The last instant of a UTC day, as ISO. A commit counts only after this. */
function endOfDay(day: string): string {
  return `${day}T23:59:59.999Z`;
}

export interface FileMismatch {
  /** Screenshot files with no shot-list row. */
  filesWithoutRow: string[];
  /** Captured shots with no screenshot file. */
  rowsWithoutFile: string[];
}

export function findFileMismatches(shots: Shot[], screenshotFiles: string[]): FileMismatch {
  const rowIds = new Set(shots.map(shot => shot.id));
  const fileIds = new Set(screenshotFiles.map(file => file.replace(/\.[^.]+$/, '')));
  return {
    filesWithoutRow: screenshotFiles.filter(file => !rowIds.has(file.replace(/\.[^.]+$/, ''))),
    rowsWithoutFile: shots
      .filter(shot => shot.capturedOn !== null && !fileIds.has(shot.id))
      .map(shot => shot.id),
  };
}

const cell = (text: string): string => text.replace(/\|/g, '\\|');

export function renderReport(verdicts: Verdict[], mismatch: FileMismatch): string {
  const stale = verdicts
    .filter(v => v.kind === 'stale')
    .sort((a, b) => b.changes.length - a.changes.length || a.shot.id.localeCompare(b.shot.id));
  const fresh = verdicts.filter(v => v.kind === 'fresh');
  const unknown = verdicts.filter(v => v.kind === 'unknown');

  const lines: string[] = ['## Guide screenshots older than their screen', ''];
  lines.push(
    `${stale.length} stale, ${fresh.length} fresh, ${unknown.length} could not tell ` +
      `(of ${verdicts.length} shots). A report only: it never fails a build.`,
    ''
  );

  if (stale.length > 0) {
    lines.push('### Stale: recapture these, most-changed screen first', '');
    lines.push('| Shot | Shows | Captured | Changes since | Last change |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const v of stale) {
      const last = v.changes[0];
      const count = `${v.changes.length}${v.lowerBound ? '+' : ''}`;
      lines.push(
        `| ${v.shot.id} | ${cell(v.shot.description)} | ${v.shot.capturedOn} | ${count} | ` +
          `${last?.date.slice(0, 10)} ${cell(last?.subject ?? '')} |`
      );
    }
    lines.push('');
  }
  if (unknown.length > 0) {
    lines.push('### Could not tell', '');
    for (const v of unknown) lines.push(`- ${v.shot.id}: ${v.reason}`);
    lines.push('');
  }
  if (fresh.length > 0) {
    lines.push('### Fresh', '', fresh.map(v => v.shot.id).join(', '), '');
  }
  if (mismatch.filesWithoutRow.length > 0) {
    lines.push(
      '### Screenshot files with no shot-list row',
      '',
      mismatch.filesWithoutRow.join(', '),
      ''
    );
  }
  if (mismatch.rowsWithoutFile.length > 0) {
    lines.push(
      '### Captured shots with no screenshot file',
      '',
      mismatch.rowsWithoutFile.join(', '),
      ''
    );
  }
  return lines.join('\n');
}

/** Test files change without changing the screen. */
const NOT_TESTS = [
  ':(exclude,glob)**/*.test.*',
  ':(exclude,glob)**/*.spec.*',
  ':(exclude,glob)**/__tests__/**',
];

export function gitHistory(root: string): History {
  const git = (...args: string[]): string =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

  let historyStart: string | null = null;
  if (git('rev-parse', '--is-shallow-repository').trim() === 'true') {
    // In a shallow clone the cut-off commits look parentless. The newest of them is where every
    // line of history is certain to be complete from.
    const cutoffs = git('log', '--max-parents=0', '--format=%cI', 'HEAD')
      .split('\n')
      .filter(Boolean)
      .map(date => new Date(date).toISOString())
      .sort();
    historyStart = cutoffs[cutoffs.length - 1] ?? null;
  }

  return {
    historyStart,
    exists: path => existsSync(join(root, path)),
    changesAfter(paths, day) {
      // `--min-parents=1` leaves out a shallow clone's cut-off commits, which would otherwise
      // look as if they had added every file.
      const out = git(
        'log',
        `--since=${endOfDay(day)}`,
        '--min-parents=1',
        '--format=%cI%x09%s',
        'HEAD',
        '--',
        ...paths,
        ...NOT_TESTS
      );
      return out
        .split('\n')
        .filter(Boolean)
        .map(line => {
          const tab = line.indexOf('\t');
          return { date: line.slice(0, tab), subject: line.slice(tab + 1) };
        })
        .filter(change => new Date(change.date).toISOString() > endOfDay(day));
    },
  };
}

export function buildReport(root: string, history: History = gitHistory(root)): string {
  const shots = parseShotList(
    readFileSync(join(root, 'docs/training/screenshot-shot-list.md'), 'utf8')
  );
  const map = JSON.parse(
    readFileSync(join(root, 'scripts/qa/guide-screenshot-screens.json'), 'utf8')
  ) as ScreenMap;
  const files = readdirSync(join(root, 'docs/screenshots')).filter(file => /\.png$/i.test(file));
  // One screen can serve several shots; follow its imports once.
  const expanded = new Map<string, string[]>();
  const expand: ExpandSources = entries => {
    const key = entries.join('\n');
    const known = expanded.get(key) ?? screenSources(root, entries);
    expanded.set(key, known);
    return known;
  };
  return renderReport(classifyShots(shots, map, history, expand), findFileMismatches(shots, files));
}

function main(): void {
  // A report must not fail a build, so a failure to run is printed and still exits 0.
  try {
    const report = buildReport(resolve(import.meta.dirname, '../..'));
    console.log(report);
    const summary = process.env.GITHUB_STEP_SUMMARY;
    if (summary) appendFileSync(summary, `${report}\n`);
  } catch (error) {
    console.log(
      `guide-screenshot-staleness: could not build the report: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
