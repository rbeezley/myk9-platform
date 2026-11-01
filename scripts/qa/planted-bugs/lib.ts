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
 * text are never consulted. A failed test is the only evidence of a catch, and a
 * run that did not produce a report with at least one test is an error.
 */
export function classifyCheck(r: CheckResult): CheckOutcome {
  if (r.timedOut || r.signal || r.report === null) return 'error';
  let parsed: unknown;
  try {
    parsed = JSON.parse(r.report);
  } catch {
    return 'error';
  }
  const { numFailedTests, numTotalTests } = (parsed ?? {}) as Record<string, unknown>;
  if (typeof numFailedTests !== 'number' || typeof numTotalTests !== 'number') return 'error';
  if (numFailedTests >= 1) return 'caught';
  return numTotalTests >= 1 ? 'pass' : 'error';
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
  const outcomes = results.map(classifyCheck);
  if (outcomes.includes('caught')) return 'caught';
  return outcomes.includes('error') ? 'error' : 'missed';
}

/** Checks that are not green on the clean tree (failed, or no usable report). */
export function baselineRed(results: CheckResult[]): CheckResult[] {
  return results.filter(r => classifyCheck(r) !== 'pass');
}

export function uniqueChecks(mutants: Mutant[]): string[] {
  return [...new Set(mutants.filter(m => m.kind === 'local').flatMap(m => m.checks))];
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
