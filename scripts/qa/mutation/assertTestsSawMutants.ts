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
  static?: boolean;
  location?: { start?: { line?: number } };
}

export interface MutationReport {
  files: Record<string, { mutants: MutationReportMutant[] }>;
}

// Mutants Stryker never runs a test against, by design.
const NOT_RUN = new Set(['NoCoverage', 'Ignored', 'CompileError', 'RuntimeError', 'Pending']);

const MIN_COVERED_MUTANTS = 5;

/**
 * Mutants whose fate is known, so a harness regression cannot hide inside a
 * plausible score (MYK9-1829). `const fail = ...` at parseDuration.ts L93 is a
 * module-level (static) mutant that parseDuration.test.ts depends on throughout.
 * While stryker.config.mjs passed `testFiles`, Stryker planned every static mutant
 * with a test filter, so the Vitest runner activated it in `beforeAll`, after the
 * module had been evaluated, and it "survived" with 78 tests green. It must be Killed.
 */
export const KNOWN_ANSWERS: ReadonlyArray<{ file: string; line: number; status: string }> = [
  { file: 'packages/core/src/utils/parseDuration.ts', line: 93, status: 'Killed' },
];

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

  // Partly blind: a name filter that misses only some tests leaves survivors
  // that ran nothing. A survivor always ran at least one test when the harness
  // works. Timeouts are exempt (Stryker omits testsCompleted on them). So are static
  // mutants (MYK9-1829): one that breaks a module while it loads (cartStore.helpers.ts
  // L83, called at module level) crashes the test file before any test starts, and the
  // Vitest runner reports that as Survived with zero tests although it is a kill.
  const blind = Object.entries(report.files).flatMap(([file, { mutants }]) =>
    mutants
      .filter(mutant => mutant.status === 'Survived' && !mutant.testsCompleted && !mutant.static)
      .map(mutant => `${file}:${mutant.location?.start?.line ?? '?'}`)
  );
  if (blind.length > 0) {
    throw new Error(
      `Mutation target "${target}": ${blind.length} survived mutants ran zero tests ` +
        `(e.g. ${blind[0]}). The harness is not feeding them to the tests ` +
        '(check vitest.mutation.config.ts root, include and test-name filter).'
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

  for (const known of KNOWN_ANSWERS) {
    const entry = Object.entries(report.files).find(([file]) => file.endsWith(known.file));
    if (!entry) continue;
    const found = entry[1].mutants.filter(m => m.location?.start?.line === known.line);
    // No mutant on that line means the file was edited and the line moved; that
    // is a stale pin, not a harness fault, and the message must not send the
    // reader to the Stryker config.
    if (found.length === 0) {
      throw new Error(
        `Mutation target "${target}": no mutant at ${known.file}:${known.line}. The file changed ` +
          'and the known-answer line moved: update KNOWN_ANSWERS in assertTestsSawMutants.ts to the ' +
          'new line of that declaration.'
      );
    }
    const wrong = found.filter(m => m.status !== known.status);
    if (wrong.length > 0) {
      throw new Error(
        `Mutation target "${target}": the known-answer mutant at ${known.file}:${known.line} ` +
          `should be ${known.status} but is ${wrong[0]?.status}. A module-level (static) ` +
          'mutant is not being activated before the module loads: check that stryker.config.mjs ' +
          'passes no `testFiles` (a test filter makes Stryker use runtime activation).'
      );
    }
  }
}
