// MYK9-1432: every scripts/**/*.test.ts file must be run by a CI-invoked `*:test`
// script in the root package.json, or be named (with a reason) in
// UNWIRED_ALLOWLIST. A test file nothing runs passes locally and keeps CI green
// while being dead; this guard turns that into a named failure.
//
// Deliberately a declared list, not a heuristic: a script command whose shape is
// not understood THROWS (naming the script) instead of being guessed at.
import { matchesGlob } from 'node:path';
import { classify, gatingJobs, parseWorkflow, workspaceDirs } from './required-job-launchers';

export interface AllowlistEntry {
  file: string;
  reason: string;
}

/** Test files deliberately not run in CI. Each entry must exist and be uncovered. */
export const UNWIRED_ALLOWLIST: AllowlistEntry[] = [];

/** Flags the understood runners may carry. Anything else throws. */
const KNOWN_FLAGS = new Set(['--sequence.shuffle']);

type Runner = { prefix: string[] };
const RUNNERS: Runner[] = [
  { prefix: ['vitest', 'run'] },
  { prefix: ['tsx', '--test'] },
  { prefix: ['node', '--test'] },
];

/**
 * Root `*:test` scripts the REQUIRED CI jobs (and their `needs:`) run, parsed by the launcher
 * pin's workflow reader, so the two guards share one reading of ci.yml: a step's `run:` lines
 * only (never an `if:`, `name:` or echo), and never a job outside the required set.
 */
export function requiredJobTestScripts(workflowText: string, root: string): string[] {
  const pkgDirs = workspaceDirs(root);
  const names = new Set<string>();
  for (const job of gatingJobs(parseWorkflow(workflowText))) {
    for (const inv of job.invocations) {
      const c = classify(inv.command, inv.workdir, pkgDirs);
      if (c.kind === 'script' && c.pkgDir === '.' && c.script.endsWith(':test')) {
        names.add(c.script);
      }
    }
  }
  return [...names].sort();
}

function hasGlobChars(s: string): boolean {
  return /[*?[\]]/.test(s);
}

/**
 * pnpm runs scripts through `sh` (dash on the CI runner), which expands neither braces nor `**`
 * the way `path.matchesGlob` does, so the guard would report coverage vitest never gets.
 */
function hasUnportableGlob(s: string): boolean {
  return /[{}]|\*\*/.test(s);
}

function tokenize(command: string): string[] {
  return command.trim().split(/\s+/).filter(Boolean);
}

/**
 * Resolve the files one script command runs, against the known test-file universe.
 * Throws (naming the script) on an unknown runner, flag, or an argument matching nothing.
 */
export function resolveScriptFiles(
  scriptName: string,
  command: string,
  universe: string[]
): string[] {
  const covered = new Set<string>();
  for (const segment of command.split('&&')) {
    const tokens = tokenize(segment);
    const runner = RUNNERS.find(r => r.prefix.every((p, i) => tokens[i] === p));
    if (!runner) {
      throw new Error(
        `scripts-test-wiring: script "${scriptName}" has an unrecognised command "${segment.trim()}". ` +
          `Understood runners: ${RUNNERS.map(r => r.prefix.join(' ')).join(', ')}.`
      );
    }
    const args = tokens.slice(runner.prefix.length);
    if (args.length === 0) {
      throw new Error(`scripts-test-wiring: script "${scriptName}" names no files.`);
    }
    for (const arg of args) {
      if (arg.startsWith('-')) {
        if (!KNOWN_FLAGS.has(arg)) {
          throw new Error(
            `scripts-test-wiring: script "${scriptName}" uses unrecognised flag "${arg}". ` +
              'If it does not change which files run, add it to KNOWN_FLAGS.'
          );
        }
        continue;
      }
      if (hasUnportableGlob(arg)) {
        throw new Error(
          `scripts-test-wiring: script "${scriptName}" argument "${arg}" uses a brace or ** glob, ` +
            'which the CI shell does not expand the way vitest needs. List the files or a directory.'
        );
      }
      const matched = hasGlobChars(arg)
        ? universe.filter(f => matchesGlob(f, arg))
        : universe.filter(f => f === arg || f.startsWith(`${arg.replace(/\/$/, '')}/`));
      // The universe is TypeScript tests only; a .js file (node --test) legitimately matches nothing.
      if (matched.length === 0 && !/\.(?:js|mjs|cjs)$/.test(arg)) {
        throw new Error(
          `scripts-test-wiring: script "${scriptName}" argument "${arg}" matches no scripts/ test file. ` +
            'A root *:test script that runs tests outside scripts/ needs the guard extended.'
        );
      }
      for (const f of matched) covered.add(f);
    }
  }
  return [...covered].sort();
}

export interface WiringInput {
  testFiles: string[];
  packageScripts: Record<string, string>;
  /** Root `*:test` script names CI runs (see requiredJobTestScripts). */
  invokedScripts: string[];
  allowlist?: AllowlistEntry[];
}

export interface WiringResult {
  unwired: string[];
  staleAllowlist: string[];
  invokedScripts: string[];
  /** script name -> files it runs */
  coverage: Record<string, string[]>;
}

export function checkScriptsTestWiring(input: WiringInput): WiringResult {
  const allowlist = input.allowlist ?? UNWIRED_ALLOWLIST;
  const coverage: Record<string, string[]> = {};
  for (const name of [...new Set(input.invokedScripts)].sort()) {
    const command = input.packageScripts[name];
    if (command === undefined) {
      throw new Error(
        `scripts-test-wiring: CI runs "${name}", which is not a root package.json script.`
      );
    }
    coverage[name] = resolveScriptFiles(name, command, input.testFiles);
  }
  const covered = new Set(Object.values(coverage).flat());
  const allowed = new Set(allowlist.map(a => a.file));
  const unwired = input.testFiles.filter(f => !covered.has(f) && !allowed.has(f)).sort();
  const staleAllowlist = allowlist
    .filter(a => !input.testFiles.includes(a.file) || covered.has(a.file))
    .map(a => a.file)
    .sort();
  return { unwired, staleAllowlist, invokedScripts: Object.keys(coverage), coverage };
}
