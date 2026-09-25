/**
 * `scripts/qa/` (the review gate's own implementation among other tooling)
 * had no typecheck project until MYK9-531, so `pnpm typecheck` never saw it
 * — a deliberate type error in `review-gate.ts` compiled clean, and the
 * `satisfies Record<ReviewerToken, Tier>` exhaustiveness guarantee on
 * `TIER_BY_REVIEWER` held only by runtime test, not by type. Wiring
 * `scripts/qa/tsconfig.json` straight into `pnpm typecheck` surfaced ~160
 * pre-existing diagnostics across unrelated scripts (same class as
 * MYK9-273's 141 in `src/test/e2e`) — far more than the review-gate fix
 * alone justified fixing in one PR. This mirrors
 * `apps/myk9show/scripts/typecheck-e2e.ts`'s baseline-ratchet: diagnostics
 * already known are ratcheted (recorded, not blocking); the gate fails only
 * on a diagnostic NOT in the baseline, so a regression anywhere under
 * `scripts/qa/` — including a new `review-gate.ts` violation, which the
 * baseline holds zero entries for — still turns `pnpm typecheck` red.
 *
 * `typecheck:scripts` is deliberately a plain chain step in root
 * `package.json` (`pnpm run typecheck:scripts && turbo typecheck`), not a
 * turbo task: turbo's default input hashing would not pick up changes under
 * `scripts/**`, so a turbo-cached run could report green against a stale
 * compile. It runs FIRST so that arguments pnpm appends (`--filter=<pkg>`)
 * reach turbo, not this script (MYK9-720).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export type ScriptsDiagnostic = {
  file: string;
  code: string;
  message: string;
};

export type ScriptsDiagnosticComparison = {
  current: ScriptsDiagnostic[];
  newDiagnostics: ScriptsDiagnostic[];
  resolvedDiagnostics: ScriptsDiagnostic[];
};

export const DEFAULT_CONFIG_PATH = 'scripts/qa/tsconfig.json';
export const DEFAULT_BASELINE_PATH = 'scripts/qa/typecheck-scripts.baseline.json';

const DIAGNOSTIC_PATTERN = /^(.*)\(\d+,\d+\): error (TS\d+): (.*)$/;

export function parseDiagnostics(output: string): ScriptsDiagnostic[] {
  return output
    .split(/\r?\n/)
    .flatMap(line => {
      const match = DIAGNOSTIC_PATTERN.exec(line);
      if (!match) return [];
      // DIAGNOSTIC_PATTERN has no optional groups, so a successful match
      // always captures all three; narrow `noUncheckedIndexedAccess`'s
      // `string | undefined` element type back to `string` by construction,
      // never with `!` or `as` (MYK9-531).
      const [, file, code, message] = match;
      if (file === undefined || code === undefined || message === undefined) return [];
      return [{ file, code, message }];
    })
    .sort(compareDiagnosticKeys);
}

function diagnosticKey(diagnostic: ScriptsDiagnostic) {
  return `${diagnostic.file}|${diagnostic.code}|${diagnostic.message}`;
}

function compareDiagnosticKeys(a: ScriptsDiagnostic, b: ScriptsDiagnostic) {
  return diagnosticKey(a).localeCompare(diagnosticKey(b));
}

function countDiagnostics(diagnostics: ScriptsDiagnostic[]) {
  const counts = new Map<string, number>();
  for (const diagnostic of diagnostics) {
    const key = diagnosticKey(diagnostic);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function subtractDiagnostics(
  left: ScriptsDiagnostic[],
  right: ScriptsDiagnostic[]
): ScriptsDiagnostic[] {
  const remaining = countDiagnostics(right);
  return left.filter(diagnostic => {
    const key = diagnosticKey(diagnostic);
    const count = remaining.get(key) ?? 0;
    if (count === 0) return true;
    remaining.set(key, count - 1);
    return false;
  });
}

export function compareDiagnostics(
  current: ScriptsDiagnostic[],
  baseline: ScriptsDiagnostic[]
): ScriptsDiagnosticComparison {
  return {
    current,
    newDiagnostics: subtractDiagnostics(current, baseline),
    resolvedDiagnostics: subtractDiagnostics(baseline, current),
  };
}

/**
 * The failure mode MYK9-531 exists to close is a check that passes because it
 * compiled nothing. Weakening `scripts/qa/tsconfig.json` (dropping `strict` /
 * `noUncheckedIndexedAccess`) or narrowing its `include` makes `tsc` emit zero
 * diagnostics, which the new/resolved arithmetic alone reads as `0 new` —
 * exit 0, gate silently inert. A non-empty baseline that produces no current
 * diagnostics at all is therefore a gate failure, not a pass: a genuine full
 * burn-down must refresh the baseline (`typecheck:scripts:update-baseline`).
 */
export function isGateInert(current: ScriptsDiagnostic[], baseline: ScriptsDiagnostic[]) {
  return current.length === 0 && baseline.length > 0;
}

/**
 * MYK9-748: `isGateInert` infers coverage from the diagnostic COUNT, and with
 * the baseline burned down to empty a narrowed `include` that compiled only
 * clean files read as 0 new against 0 baselined: a pass that compiled nothing
 * that mattered (`review-gate.ts` included). Coverage is asserted directly
 * instead: every tracked `.ts` under the project's directory must be in the
 * program `tsc --listFilesOnly` reports.
 */
export function findUncompiledFiles(
  listedFiles: readonly string[],
  trackedFiles: readonly string[],
  rootDir: string
): string[] {
  const compiled = new Set(listedFiles.map(file => relative(rootDir, file)));
  return trackedFiles.filter(file => !compiled.has(file));
}

/** The strictness this project exists to enforce (MYK9-531); weakening either is a gate failure. */
const REQUIRED_TRUE_OPTIONS = ['strict', 'noUncheckedIndexedAccess'] as const;

export function findWeakenedOptions(compilerOptions: Record<string, unknown>): string[] {
  return REQUIRED_TRUE_OPTIONS.filter(option => compilerOptions[option] !== true);
}

function run(command: string, args: string[], rootDir: string): string {
  const result = spawnSync(command, args, { cwd: rootDir, encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed: ${result.stderr ?? ''}`);
  }
  return result.stdout ?? '';
}

/** Coverage and strictness problems with the project, or [] when it is whole. */
function coverageProblems(configPath: string, rootDir: string): string[] {
  const listed = run('tsc', ['--listFilesOnly', '--project', configPath], rootDir)
    .split(/\r?\n/)
    .filter(Boolean);
  const tracked = run('git', ['ls-files', '-z', '--', dirname(configPath)], rootDir)
    .split('\0')
    .filter(file => file.endsWith('.ts') && !file.endsWith('.d.ts'));
  const resolved = JSON.parse(run('tsc', ['--showConfig', '--project', configPath], rootDir)) as {
    compilerOptions?: Record<string, unknown>;
  };
  return [
    ...findUncompiledFiles(listed, tracked, rootDir).map(file => `not compiled: ${file}`),
    ...findWeakenedOptions(resolved.compilerOptions ?? {}).map(
      option => `compilerOptions.${option} is not true`
    ),
  ];
}

export function readBaseline(path: string): ScriptsDiagnostic[] {
  return JSON.parse(readFileSync(path, 'utf8')) as ScriptsDiagnostic[];
}

export function writeBaseline(path: string, diagnostics: ScriptsDiagnostic[]) {
  writeFileSync(path, `${JSON.stringify(diagnostics.sort(compareDiagnosticKeys), null, 2)}\n`);
}

function renderDiagnostics(title: string, diagnostics: ScriptsDiagnostic[]) {
  if (diagnostics.length === 0) return '';
  return `\n${title}:\n${diagnostics
    .map(diagnostic => `- ${diagnostic.file}: ${diagnostic.code} ${diagnostic.message}`)
    .join('\n')}`;
}

export function runCli(args: string[] = process.argv.slice(2), rootDir = process.cwd()) {
  const configPath =
    args.find(arg => arg.startsWith('--config='))?.split('=')[1] ?? DEFAULT_CONFIG_PATH;
  const baselinePath = join(
    rootDir,
    args.find(arg => arg.startsWith('--baseline='))?.split('=')[1] ?? DEFAULT_BASELINE_PATH
  );
  const result = spawnSync('tsc', ['--noEmit', '--project', configPath], {
    cwd: rootDir,
    encoding: 'utf8',
  });
  if (result.error) throw result.error;

  const current = parseDiagnostics(`${result.stdout ?? ''}\n${result.stderr ?? ''}`);
  if (result.status !== 0 && current.length === 0) {
    console.error(`${result.stdout ?? ''}${result.stderr ?? ''}`);
    return 1;
  }
  if (args.includes('--update-baseline')) {
    writeBaseline(baselinePath, current);
    console.log(`Updated ${baselinePath} with ${current.length} diagnostics.`);
    return 0;
  }

  const baseline = readBaseline(baselinePath);
  const comparison = compareDiagnostics(current, baseline);
  console.log(
    `scripts/qa typecheck ratchet: ${current.length} current, ${baseline.length} baselined, ` +
      `${comparison.newDiagnostics.length} new, ${comparison.resolvedDiagnostics.length} resolved.`
  );
  console.log(renderDiagnostics('New diagnostics (gate failure)', comparison.newDiagnostics));
  console.log(renderDiagnostics('Known diagnostics (ratcheted)', current));

  const problems = coverageProblems(configPath, rootDir);
  if (problems.length > 0) {
    console.error(
      `scripts/qa typecheck ratchet: the project no longer covers what it must:\n${problems
        .map(problem => `- ${problem}`)
        .join('\n')}`
    );
    return 1;
  }

  if (isGateInert(current, baseline)) {
    console.error(
      `scripts/qa typecheck ratchet: tsc produced 0 diagnostics against a baseline of ` +
        `${baseline.length}. The project compiled nothing (weakened compilerOptions or a ` +
        `narrowed "include"), or the baseline is fully burned down and needs refreshing via ` +
        `pnpm run typecheck:scripts:update-baseline.`
    );
    return 1;
  }

  return comparison.newDiagnostics.length > 0 ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = runCli();
}
