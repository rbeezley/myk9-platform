export const MUTATION_TARGETS = [
  'cart',
  'score-validator',
  'placement',
  'replication-conflict',
] as const;

// Mirrors `thresholds.break` in stryker.config.mjs. Stryker itself exits
// non-zero below it; the table repeats the number so a reader sees both.
export const BREAK_THRESHOLD = 60;

export interface TargetResult {
  target: string;
  /** Percent, or null when the score could not be read (runner crashed). */
  score: number | null;
  threshold: number;
  exitCode: number;
  passed: boolean;
}

export interface RunDeps {
  /** Runs one Stryker target and returns its exit status (null = killed by signal). */
  spawn: (target: string) => number | null;
  /** Reads the target's score from its JSON report; null when unreadable. */
  readScore: (target: string) => number | null;
  log?: (line: string) => void;
}

/** Stryker's score: detected (killed + timeout) over detected + survived + no coverage. */
export function scoreFromReport(report: unknown): number | null {
  const files = (report as { files?: Record<string, { mutants?: { status?: string }[] }> })?.files;
  if (!files || typeof files !== 'object') return null;
  let detected = 0;
  let undetected = 0;
  for (const file of Object.values(files)) {
    for (const mutant of file.mutants ?? []) {
      if (mutant.status === 'Killed' || mutant.status === 'Timeout') detected += 1;
      else if (mutant.status === 'Survived' || mutant.status === 'NoCoverage') undetected += 1;
    }
  }
  const total = detected + undetected;
  return total === 0 ? null : (detected / total) * 100;
}

/** Runs every target regardless of earlier results. */
export function runAllTargets(
  targets: readonly string[],
  { spawn, readScore, log = console.log }: RunDeps
): TargetResult[] {
  const results: TargetResult[] = [];
  for (const target of targets) {
    log(`\n=== Mutation target: ${target} ===`);
    const status = spawn(target);
    const exitCode = status ?? 1;
    const score = readScore(target);
    results.push({
      target,
      score,
      threshold: BREAK_THRESHOLD,
      exitCode,
      passed: exitCode === 0 && score !== null && score >= BREAK_THRESHOLD,
    });
  }
  return results;
}

export function formatSummaryTable(results: TargetResult[]): string {
  const rows = results.map(r => {
    const score =
      r.score === null ? 'unreadable (runner crashed or no report)' : `${r.score.toFixed(2)}%`;
    return `| ${r.target} | ${score} | ${r.threshold}% | ${r.passed ? 'pass' : 'FAIL'} |`;
  });
  return ['| Target | Score | Threshold | Result |', '| --- | --- | --- | --- |', ...rows].join(
    '\n'
  );
}

export function exitCodeFor(results: TargetResult[]): number {
  return results.every(r => r.passed) ? 0 : 1;
}
