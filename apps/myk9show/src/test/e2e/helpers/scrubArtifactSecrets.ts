/**
 * Playwright `globalTeardown` entry point for F10.
 *
 * Registered by EVERY config in this repo, not just the default one: CI runs
 * `test:e2e:ci` and `test:a11y` through `playwright.ci.config.ts` and uploads
 * `playwright-report-ci/` from both jobs (ci.yml), so registering it only on the
 * config a developer happens to run locally scrubs nothing that CI publishes.
 *
 * Deliberately thin: everything testable lives in `@/utils/scrubArtifactSecrets`,
 * because vitest excludes `**\/e2e/**` and a test placed beside this file would
 * never run in CI while passing every local invocation that named it directly.
 */
import path from 'node:path';
import { ARTIFACT_ROOTS, scrubArtifactSecrets } from '../../../utils/scrubArtifactSecrets';

const APP_ROOT = path.resolve(__dirname, '../../../..');

export default async function globalTeardown(): Promise<void> {
  await scrubArtifactSecrets(...ARTIFACT_ROOTS.map(dir => path.join(APP_ROOT, dir)));
}
