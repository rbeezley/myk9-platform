export type MutantKind = 'local' | 'ci';

export interface Mutant {
  id: string;
  area: string;
  patch: string;
  rationale: string;
  checks: string[];
  kind: MutantKind;
  /** Why a `ci` mutant cannot run locally, and which check carries it. */
  note?: string;
  /**
   * `ci` SQL mutants only: the function the patched migration redefines, as a
   * regprocedure signature (`public.f(uuid[], boolean)`). The runner re-applies
   * that one definition to the live database; see run-sql.ts.
   */
  reapplyFunction?: string;
}

export interface CheckResult {
  command: string;
  signal?: string | null | undefined;
  timedOut?: boolean | undefined;
  /** Text of vitest's JSON report, or null when no file was written. */
  report: string | null;
}

export type CheckOutcome = 'pass' | 'caught' | 'error';
export type Verdict = 'caught' | 'missed' | 'error';

/**
 * Per-check verdict from vitest's JSON report ONLY; the exit code and the log
 * text are never consulted. The run-level fields decide, not derived counts:
 * - pass: `success: true` with at least one test;
 * - caught: at least one failed test while every suite collected;
 * - error: anything else (no report, a suite that failed to collect, zero
 *   tests, a timeout or a signal). A mutant that breaks collection is not a catch.
 */
export function classifyCheck(r: CheckResult): CheckOutcome {
  if (r.timedOut || r.signal || r.report === null) return 'error';
  let parsed: unknown;
  try {
    parsed = JSON.parse(r.report);
  } catch {
    return 'error';
  }
  const report = (parsed ?? {}) as Record<string, unknown>;
  const { success, numFailedTests, numTotalTests, testResults } = report;
  if (typeof numFailedTests !== 'number' || typeof numTotalTests !== 'number') return 'error';
  if (numTotalTests < 1) return 'error';
  if (success === true && numFailedTests === 0) return 'pass';
  // A suite that failed to collect has no failed assertion; its failure is not
  // evidence that a test saw the mutant.
  if (!Array.isArray(testResults)) return 'error';
  const collectFailed = (testResults as Record<string, unknown>[]).some(
    t =>
      t.status === 'failed' &&
      !(
        Array.isArray(t.assertionResults) &&
        (t.assertionResults as Record<string, unknown>[]).some(a => a.status === 'failed')
      )
  );
  if (collectFailed) return 'error';
  return numFailedTests >= 1 ? 'caught' : 'error';
}

/** A local check must be a vitest run, so the runner can read its JSON report. */
const VITEST_CHECK = /^(?:cd [\w./-]+ && )?pnpm vitest run(?: [^;&|<>$`]*)?$/;
export function isVitestCheck(command: string): boolean {
  return VITEST_CHECK.test(command);
}

export function validateManifest(
  value: unknown,
  patchExists: (patch: string) => boolean
): string[] {
  const errors: string[] = [];
  if (!Array.isArray(value)) return ['manifest must be an array'];
  const ids = new Set<string>();
  value.forEach((raw, i) => {
    const m = raw as Partial<Mutant>;
    const label = `mutant[${i}]${m?.id ? ` (${m.id})` : ''}`;
    for (const key of ['id', 'area', 'patch', 'rationale'] as const) {
      if (typeof m?.[key] !== 'string' || m[key] === '') errors.push(`${label}: missing ${key}`);
    }
    if (m?.kind !== 'local' && m?.kind !== 'ci') errors.push(`${label}: kind must be local or ci`);
    if (!Array.isArray(m?.checks) || m.checks.length === 0 || m.checks.some(c => !c)) {
      errors.push(`${label}: checks must be a non-empty list of commands`);
    }
    if (m?.kind === 'local' && Array.isArray(m.checks)) {
      for (const c of m.checks) {
        if (!isVitestCheck(c)) errors.push(`${label}: local check must be a vitest run: ${c}`);
      }
    }
    if (m?.kind === 'ci' && !m.note) errors.push(`${label}: a ci mutant needs a note`);
    if (m?.kind === 'ci' && !SQL_FUNCTION_SIGNATURE.test(m.reapplyFunction ?? '')) {
      errors.push(`${label}: a ci mutant needs reapplyFunction like schema.name(argtypes)`);
    }
    if (m?.id) {
      if (ids.has(m.id)) errors.push(`${label}: duplicate id`);
      ids.add(m.id);
    }
    if (typeof m?.patch === 'string' && m.patch && !patchExists(m.patch)) {
      errors.push(`${label}: patch file not found: ${m.patch}`);
    }
  });
  return errors;
}

/** Caught if any check caught; else error if any errored; else missed. */
export function classify(results: CheckResult[]): Verdict {
  return combineOutcomes(results.map(classifyCheck));
}

export function combineOutcomes(outcomes: CheckOutcome[]): Verdict {
  if (outcomes.includes('caught')) return 'caught';
  return outcomes.includes('error') ? 'error' : 'missed';
}

/** Checks that are not green on the clean tree (failed, or no usable report). */
export function baselineRed(results: CheckResult[]): CheckResult[] {
  return results.filter(r => classifyCheck(r) !== 'pass');
}

export function uniqueChecks(mutants: Mutant[], kind: MutantKind = 'local'): string[] {
  return [...new Set(mutants.filter(m => m.kind === kind).flatMap(m => m.checks))];
}

export interface Row {
  mutant: Mutant;
  verdict: Verdict | 'ci-run';
  caughtBy: string[];
}

export function renderTable(rows: Row[]): string {
  const lines = ['| Mutant | Area | Result | Caught by |', '| --- | --- | --- | --- |'];
  for (const { mutant, verdict, caughtBy } of rows) {
    const result =
      verdict === 'ci-run'
        ? 'CI-run (not run locally)'
        : verdict === 'caught'
          ? 'CAUGHT'
          : verdict === 'error'
            ? 'ERROR (no usable test report; not a catch)'
            : 'MISSED';
    const by = verdict === 'ci-run' ? mutant.checks.join('; ') : caughtBy.join('; ') || 'none';
    lines.push(`| ${mutant.id}: ${mutant.rationale} | ${mutant.area} | ${result} | ${by} |`);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// `ci` SQL mutants (MYK9-1659). Pure helpers; run-sql.ts does the I/O.
// ---------------------------------------------------------------------------

const SQL_FUNCTION_SIGNATURE = /^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*\([a-z0-9_\[\], ]*\)$/;

/** Same shape the behavioral runner enforces: a throwaway loopback stack, nothing shared. */
const LOOPBACK_URL =
  /^postgresql:\/\/postgres:postgres@(127\.0\.0\.1|localhost):(\d{1,5})\/postgres$/;
export function isLoopbackDatabaseUrl(url: string): boolean {
  const port = LOOPBACK_URL.exec(url)?.[2];
  return port !== undefined && Number(port) >= 1 && Number(port) <= 65535;
}

/** A `ci` mutant's check is a comma-separated list of supabase/tests files. */
export function splitSqlCheck(check: string): string[] {
  return check
    .split(',')
    .map(f => f.trim())
    .filter(Boolean);
}

/**
 * Pull one function's `CREATE OR REPLACE FUNCTION ... $$;` statement out of a
 * migration. Ends at the first line that is exactly `$$;` after the opening
 * `AS $$`. Throws rather than guessing when the function or its end is absent.
 */
export function extractFunctionDdl(sql: string, signature: string): string {
  const name = signature.slice(0, signature.indexOf('('));
  const start = sql.search(
    new RegExp(`^CREATE OR REPLACE FUNCTION ${name.replace('.', '\\.')}\\(`, 'mi')
  );
  if (start < 0) throw new Error(`CREATE OR REPLACE FUNCTION ${name} not found`);
  const rest = sql.slice(start);
  const open = rest.search(/^AS \$\$\s*$/m);
  if (open < 0) throw new Error(`${name}: no "AS $$" body opener`);
  const close = rest.slice(open).search(/^\$\$;\s*$/m);
  if (close < 0) throw new Error(`${name}: no closing "$$;" line`);
  return `${rest.slice(0, open + close)}$$;\n`;
}

/** `b/<path>` targets of a unified diff, in order. */
export function patchedFiles(patch: string): string[] {
  return [...patch.matchAll(/^\+\+\+ b\/(.+)$/gm)].map(m => m[1]!);
}

/**
 * psql exit codes: 0 ok, 2 connection failure, 3 a script error under
 * ON_ERROR_STOP (a RAISE EXCEPTION in a test). The behavioral runner exits 1 for
 * its own guards and propagates psql's status otherwise (set -e). Only a clean 3
 * is a catch; a 1, 2, timeout or signal is the harness failing, not a test seeing
 * the mutant.
 */
export function classifySqlCheck(r: {
  exitCode: number | null;
  signal?: string | null | undefined;
  timedOut?: boolean | undefined;
}): CheckOutcome {
  if (r.timedOut || r.signal || r.exitCode === null) return 'error';
  if (r.exitCode === 0) return 'pass';
  return r.exitCode === 3 ? 'caught' : 'error';
}
