import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { assertTestsSawMutants, type MutationReport } from './assertTestsSawMutants';
import {
  MUTATION_TARGETS,
  exitCodeFor,
  formatSummaryTable,
  runAllTargets,
  scoreFromReport,
} from './mutation-runner';

const reportPath = (target: string) => `reports/mutation/${target}/mutation.json`;

const results = runAllTargets(MUTATION_TARGETS, {
  spawn: target => {
    // A stale report from an earlier run must not be mistaken for this run's score.
    rmSync(reportPath(target), { force: true });
    return spawnSync('pnpm', ['exec', 'stryker', 'run', 'stryker.config.mjs'], {
      env: { ...process.env, MYK9_MUTATION_TARGET: target },
      stdio: 'inherit',
    }).status;
  },
  readScore: target => {
    const path = reportPath(target);
    if (!existsSync(path)) return null;
    let report: unknown;
    try {
      report = JSON.parse(readFileSync(path, 'utf8'));
    } catch {
      return null;
    }
    // A target whose tests never saw the mutated file fails with its real cause,
    // not as a low score (MYK9-1657); the row then reads as unreadable.
    try {
      assertTestsSawMutants(target, report as MutationReport);
    } catch (error) {
      console.error(`\nSELF-CHECK FAILED: ${(error as Error).message}`);
      return null;
    }
    return scoreFromReport(report);
  },
});

const table = formatSummaryTable(results);
console.log(`\n## Mutation scores\n\n${table}\n`);
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Mutation scores\n\n${table}\n`);
}
process.exit(exitCodeFor(results));
