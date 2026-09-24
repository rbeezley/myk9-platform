import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * MYK9-720: `posttest:e2e` ran `auto-cleanup-after-test.js` and `test:cleanup`
 * ran `cleanup-processes.sh`; both did `pkill -f chrome|firefox|webkit`
 * (and `pkill -f git`) across the WHOLE machine. That kills the user's own
 * browser and every other agent's Playwright session, which CLAUDE.md's
 * browser-session rules forbid. Browser cleanup is per session
 * (`pnpm qa:browser-session`), never by process name.
 *
 * A package.json string check alone would not have caught either: the kill
 * lived in the file the script named. So this reads every workspace
 * package.json script AND every local file a script names.
 */
const REPO_ROOT = resolve(import.meta.dirname, '../../../../..');

/** Kill-by-name commands that reach processes this run does not own. */
const MACHINE_WIDE_KILL = /\bpkill\s+-f\b|\bkillall\b|\btaskkill\s+\/f\s+\/im\b|\bStop-Process\b/i;

/** Local script files a command names, e.g. `scripts/x.sh`, `./y.js`. */
const SCRIPT_PATH = /(?:\.{1,2}\/)?[\w.-]+(?:\/[\w.-]+)*\.(?:sh|js|cjs|mjs|ts|bat|ps1)\b/g;

function workspacePackageDirs(): string[] {
  const dirs = [REPO_ROOT];
  for (const group of ['apps', 'packages']) {
    const base = resolve(REPO_ROOT, group);
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (entry.isDirectory() && existsSync(resolve(base, entry.name, 'package.json'))) {
        dirs.push(resolve(base, entry.name));
      }
    }
  }
  return dirs;
}

/** `<package dir>:<script>` for every script that kills by name, directly or via a file. */
function killingScripts(): string[] {
  const hits: string[] = [];
  for (const dir of workspacePackageDirs()) {
    const pkgPath = resolve(dir, 'package.json');
    const scripts =
      (JSON.parse(readFileSync(pkgPath, 'utf8')) as { scripts?: Record<string, string> }).scripts ??
      {};
    for (const [name, command] of Object.entries(scripts)) {
      const bodies = [command];
      for (const match of command.match(SCRIPT_PATH) ?? []) {
        const file = resolve(dirname(pkgPath), match);
        if (existsSync(file)) bodies.push(readFileSync(file, 'utf8'));
      }
      if (bodies.some(body => MACHINE_WIDE_KILL.test(body))) {
        hits.push(`${dir.slice(REPO_ROOT.length + 1) || '.'}:${name}`);
      }
    }
  }
  return hits;
}

describe('no package script kills processes by name machine-wide (MYK9-720)', () => {
  it('known answers: the kill patterns this guard exists for', () => {
    expect(MACHINE_WIDE_KILL.test('pkill -f chrome || echo none')).toBe(true);
    expect(MACHINE_WIDE_KILL.test('killall Google\\ Chrome')).toBe(true);
    expect(MACHINE_WIDE_KILL.test('taskkill /f /im chrome.exe /t')).toBe(true);
    expect(MACHINE_WIDE_KILL.test('$p | Stop-Process -Force')).toBe(true);
    expect(MACHINE_WIDE_KILL.test('kill "$PID"')).toBe(false);
    expect('bash scripts/cleanup-processes.sh'.match(SCRIPT_PATH)).toEqual([
      'scripts/cleanup-processes.sh',
    ]);
  });

  it('reads every workspace package.json', () => {
    expect(workspacePackageDirs().length).toBeGreaterThan(3);
  });

  it('no script, or file a script runs, does pkill -f / killall / taskkill /im', () => {
    expect(killingScripts()).toEqual([]);
  });
});
