/**
 * Scrubs e2e passwords out of Playwright artifacts, as a REPORTER rather than a
 * `globalTeardown` (F10, third pass).
 *
 * Why not globalTeardown, which is where this started. Playwright's `runTasks`
 * awaits every task — globalTeardown included — and only afterwards does
 * `finishTaskRun` call `reporter.onEnd` (playwright 1.62.1,
 * `lib/runner/index.js`: `const status = await taskRunner.run(...)` then
 * `await testRun.reporter.onEnd(...)`). The HTML reporter BUILDS its report inside
 * that `onEnd`. So a teardown ran strictly before the report directory existed, and
 * scrubbing it there could not touch the very artifact CI uploads.
 *
 * The reporter multiplexer awaits each reporter's `onEnd` in registration order, so
 * listing this one LAST means the HTML report is already on disk when it runs.
 * `onExit` repeats the pass because it is cheap and idempotent, and covers any
 * reporter that finalises later.
 */
import type { Reporter } from '@playwright/test/reporter';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARTIFACT_ROOTS, scrubArtifactSecrets } from '../../../utils/scrubArtifactSecrets';

// Playwright loads reporter modules as ESM, where `__dirname` does not exist --
// using it threw "ReferenceError: __dirname is not defined in ES module scope" and
// took the whole run down at createReporters(), before a single test ran.
// `src/test/load/loadDiscovery.contract.test.ts` catches this because it actually
// shells out to `playwright --list`.
const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

async function scrubAll(): Promise<void> {
  await scrubArtifactSecrets(...ARTIFACT_ROOTS.map(dir => path.join(APP_ROOT, dir)));
}

class ScrubSecretsReporter implements Reporter {
  async onEnd(): Promise<void> {
    await scrubAll();
  }

  async onExit(): Promise<void> {
    await scrubAll();
  }

  printsToStdio(): boolean {
    return false;
  }
}

export default ScrubSecretsReporter;
