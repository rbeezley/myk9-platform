/**
 * Playwright `globalTeardown` entry point for F10.
 *
 * Deliberately thin: everything testable lives in `@/utils/scrubArtifactSecrets`,
 * because vitest excludes `**\/e2e/**` and a test placed beside this file would
 * never run in CI while passing every local invocation that named it directly.
 */
import path from 'node:path';
import { scrubArtifactSecrets } from '../../../utils/scrubArtifactSecrets';

export default async function globalTeardown(): Promise<void> {
  await scrubArtifactSecrets(path.resolve(__dirname, '../../../../test-results'));
}
