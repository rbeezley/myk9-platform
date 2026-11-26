import type { BrowserContext, TestInfo } from '@playwright/test';

/**
 * `signedInPage` opens contexts with `browser.newContext()`, which the config's `trace` option
 * does not reach, so a failure in the paid leg left no trace (MYK9-2336). Start one by hand on
 * the context that pays, and keep it only when the test failed.
 */
export async function startJourneyTrace(context: BrowserContext): Promise<void> {
  await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
}

/** Saves `<name>.zip` to the test's output (the report attaches it) when the test failed. */
export async function keepTraceOnFailure(
  context: BrowserContext | null,
  testInfo: TestInfo,
  name: string
): Promise<void> {
  if (!context || testInfo.status === testInfo.expectedStatus) return;
  const path = testInfo.outputPath(`${name}.zip`);
  try {
    await context.tracing.stop({ path });
    await testInfo.attach(name, { path, contentType: 'application/zip' });
  } catch {
    // the context was already closed; there is nothing left to save
  }
}
