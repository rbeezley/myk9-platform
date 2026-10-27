// MYK9-1432: every scripts/**/*.test.ts file must be run by a CI-invoked `*:test`
// script in the root package.json, or be named (with a reason) in
// UNWIRED_ALLOWLIST. A test file nothing runs passes locally and keeps CI green
// while being dead; this guard turns that into a named failure.
//
// Deliberately a declared list, not a heuristic: a script command whose shape is
// not understood THROWS (naming the script) instead of being guessed at.
import { matchesGlob } from 'node:path';

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

/** Script names a workflow file invokes as `pnpm <name>` / `pnpm run <name>` and that end in `:test`. */
export function extractInvokedTestScripts(workflowText: string): string[] {
  const names = new Set<string>();
  for (const rawLine of workflowText.split('\n')) {
    const line = rawLine.trim();
    if (line.startsWith('#')) continue;
    for (const m of line.matchAll(/\bpnpm\s+(?:run\s+)?([A-Za-z0-9:_-]+)/g)) {
      const name = m[1];
      if (name?.endsWith(':test')) names.add(name);
    }
  }
  return [...names].sort();
}

function hasGlobChars(s: string): boolean {
  return /[*?[\]{}]/.test(s);
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
            `scripts-test-wiring: script "${scriptName}" uses unrecognised flag "${arg}".`
          );
        }
        continue;
      }
      const matched = hasGlobChars(arg)
        ? universe.filter(f => matchesGlob(f, arg))
        : universe.filter(f => f === arg || f.startsWith(`${arg.replace(/\/$/, '')}/`));
      // The universe is .test.ts only; a .js file (node --test) legitimately matches nothing.
      if (matched.length === 0 && !/\.(?:js|mjs|cjs)$/.test(arg)) {
        throw new Error(
          `scripts-test-wiring: script "${scriptName}" argument "${arg}" matches no scripts/**/*.test.ts file.`
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
  workflowTexts: string[];
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
  const invoked = [
    ...new Set(input.workflowTexts.flatMap(t => extractInvokedTestScripts(t))),
  ].sort();
  const coverage: Record<string, string[]> = {};
  for (const name of invoked) {
    const command = input.packageScripts[name];
    // A `pnpm foo:test` in a workflow that is not a root script (e.g. a filtered package) is not ours.
    if (command === undefined) continue;
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
