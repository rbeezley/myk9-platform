/**
 * MYK9-509 — a cancelled checkout leaves the entry recoverable and amendable.
 *
 * Replays the tester's path: wizard → the cancel landing Stripe redirects to →
 * back into the wizard, with the dog and class selections still there and
 * another class addable. It stops short of opening a Stripe session: the app
 * half of the flow is everything at and after `/checkout/cancel`, and that page
 * is reached here exactly as Stripe reaches it — a full document load of the
 * cancel_url, which is the case where the in-memory cart is gone and only the
 * persisted recovery ids remain. NOTHING here can produce a charge.
 */

import { expect, test } from '@playwright/test';
import { signInAsExhibitor } from '../helpers/testUsers';
import { LIVE_REGISTRATION_SHOW_ID } from '../uat/shared/seededShows';
import {
  aSelectedClass,
  releaseSelectedClass,
  selectedClassChips,
  selectFirstDogAndContinue,
} from './wizardChips';

test.describe.configure({ mode: 'serial', timeout: 120000 });

const SHOW_ID = LIVE_REGISTRATION_SHOW_ID;

test('a cancelled checkout returns to the wizard with the selections intact and amendable', async ({
  page,
}) => {
  await signInAsExhibitor(page, `/shows/${SHOW_ID}/register`);
  await selectFirstDogAndContinue(page);
  await expect(page.getByRole('heading', { name: 'Select Classes', exact: true })).toBeVisible({
    timeout: 20000,
  });

  const selection = await aSelectedClass(page);
  const selectedBefore = await selectedClassChips(page).count();
  expect(selectedBefore, 'the replay needs at least one selected class').toBeGreaterThan(0);
  await page.waitForTimeout(500);

  // The cancel landing, reached the way Stripe reaches it.
  await page.goto('/checkout/cancel');
  await expect(page.getByRole('heading', { name: 'Payment Cancelled' })).toBeVisible({
    timeout: 20000,
  });

  // The amend path is offered, not "Browse Shows".
  const amend = page.getByRole('button', { name: 'Add or change entries' });
  await expect(amend).toBeVisible({ timeout: 20000 });
  await amend.click();

  // Back in the wizard for THIS show with the selections restored.
  await expect(page).toHaveURL(new RegExp(`/shows/${SHOW_ID}/register`));
  await expect(page.getByRole('heading', { name: 'Select Classes', exact: true })).toBeVisible({
    timeout: 30000,
  });
  await expect
    .poll(async () => selectedClassChips(page).count(), { timeout: 30000, intervals: [500] })
    .toBeGreaterThanOrEqual(selectedBefore);

  // And the entry can still be acted on, without starting over.
  await expect(page.getByRole('button', { name: /^Next$/ })).toBeEnabled();

  await releaseSelectedClass(page, selection);
});
