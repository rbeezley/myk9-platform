import type { Locator, Page } from '@playwright/test';

/**
 * The wizard's trial card has a required "Start Time" box that is never
 * defaulted (MYK9-931): a trial added in the UI cannot pass the Trials step
 * until a time is typed. Every e2e path that adds a trial and then clicks Next
 * fills it through this one helper. `scope` is the page or one trial card; with
 * several trials on screen the last (newest) card's box is filled.
 */
export async function fillTrialStartTime(scope: Page | Locator, time = '09:00 AM'): Promise<void> {
  const box = scope.getByLabel(/^Start Time/).last();
  await box.waitFor({ state: 'visible', timeout: 10000 });
  await box.fill(time);
}
