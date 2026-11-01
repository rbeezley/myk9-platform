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
  exitCode: number;
}

export type Verdict = 'caught' | 'missed';

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

/** A mutant is caught when any check exits non-zero. */
export function classify(results: CheckResult[]): Verdict {
  return results.some(r => r.exitCode !== 0) ? 'caught' : 'missed';
}

/** Checks already red on the clean tree would make every mutant look caught. */
export function baselineRed(results: CheckResult[]): CheckResult[] {
  return results.filter(r => r.exitCode !== 0);
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
