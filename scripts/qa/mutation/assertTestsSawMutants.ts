import { readFileSync } from 'node:fs';

/**
 * Known-answer self-check for the mutation harness (MYK9-1657).
 *
 * A covered mutant that "survived" with zero tests run means the tests never saw
 * the mutated file, so the score says nothing about the tests. Stryker still
 * prints a score and, below the break threshold, exits 1, but the failure reads
 * as weak tests. This names the real cause. It inspects the JSON report, so it
 * cannot be satisfied by a comment or a config line.
 */
export interface MutationReportMutant {
  status: string;
  testsCompleted?: number;
}

export interface MutationReport {
  files: Record<string, { mutants: MutationReportMutant[] }>;
}

// Mutants Stryker never runs a test against, by design.
const NOT_RUN = new Set(['NoCoverage', 'Ignored', 'CompileError', 'RuntimeError', 'Pending']);

const MIN_COVERED_MUTANTS = 5;

export function assertTestsSawMutants(target: string, report: MutationReport): void {
  const covered = Object.values(report.files)
    .flatMap(file => file.mutants)
    .filter(mutant => !NOT_RUN.has(mutant.status));

  if (covered.length < MIN_COVERED_MUTANTS) {
    throw new Error(
      `Mutation target "${target}" produced only ${covered.length} covered mutants ` +
        `(need ${MIN_COVERED_MUTANTS}); its mutate globs or tests are not wired to each other.`
    );
  }

  const testsRun = covered.reduce((sum, mutant) => sum + (mutant.testsCompleted ?? 0), 0);
  if (testsRun === 0) {
    throw new Error(
      `Mutation target "${target}": ${covered.length} covered mutants ran zero tests. ` +
        'The score is meaningless; the harness is not feeding the mutated file to the tests ' +
        '(check vitest.mutation.config.ts root, include and test-name filter).'
    );
  }
}

export function assertReportFileSawMutants(target: string, reportPath: string): void {
  assertTestsSawMutants(target, JSON.parse(readFileSync(reportPath, 'utf8')) as MutationReport);
}
