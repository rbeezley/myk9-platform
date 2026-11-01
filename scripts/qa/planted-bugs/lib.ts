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
  /** null when the process was killed by a signal or never started. */
  exitCode: number | null;
  signal?: string | null | undefined;
  timedOut?: boolean | undefined;
  /** Combined stdout+stderr, used to tell an assertion failure from a crash. */
  output?: string | undefined;
}

export type CheckOutcome = 'pass' | 'caught' | 'error';
export type Verdict = 'caught' | 'missed' | 'error';

/** Output that shows the runner never reached an assertion. */
const NEVER_ASSERTED = [
  /No test files found/i,
  /Transform failed/,
  /SyntaxError/,
  /Failed to load (?:url|config)/i,
  /Error loading config/i,
  /Startup Error/i,
  /Cannot find (?:module|package)/i,
];

/**
 * A non-zero exit is a catch only when a test assertion failed. A timeout, a
 * missing command (127/126), a signal kill, or a run that never got to its
 * assertions (collection/config/compile error) is an error, not a catch.
 */
export function classifyCheck(r: CheckResult): CheckOutcome {
  if (r.exitCode === 0) return 'pass';
  if (r.timedOut || r.signal || r.exitCode === null) return 'error';
  if (r.exitCode === 126 || r.exitCode === 127) return 'error';
  if (r.output && NEVER_ASSERTED.some(re => re.test(r.output!))) return 'error';
  return 'caught';
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

/** Caught if any check caught it; error if the only failures were errors; else missed. */
export function classify(results: CheckResult[]): Verdict {
  const outcomes = results.map(classifyCheck);
  if (outcomes.includes('caught')) return 'caught';
  return outcomes.includes('error') ? 'error' : 'missed';
}

/** Checks already red on the clean tree would make every mutant look caught. */
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
          ? 'caught'
          : 'MISSED';
    const by = verdict === 'ci-run' ? mutant.checks.join('; ') : caughtBy.join('; ') || 'none';
    lines.push(`| ${mutant.id}: ${mutant.rationale} | ${mutant.area} | ${result} | ${by} |`);
  }
  return lines.join('\n');
}
