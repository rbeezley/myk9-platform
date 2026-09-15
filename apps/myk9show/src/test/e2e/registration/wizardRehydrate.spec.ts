/**
 * MYK9-514 / MYK9-509 — the wizard rehydrates from its own saved draft.
 *
 * The wizard's `selectedDogs` / `classSelections` are React state. Before this
 * spec's fix a reload rebuilt them from nothing and dropped the exhibitor back
 * on Select dogs while the cart still held the fees — and the return from a
 * cancelled checkout landed on that same empty wizard. One persisted draft,
 * rehydrated on mount, covers both triggers, so one reload assertion pins both.
 *
 * Nothing here opens a Stripe session or submits an entry.
 */

import { expect, test } from '@playwright/test';
import { signInAsExhibitor } from '../helpers/testUsers';
import { LIVE_REGISTRATION_SHOW_ID } from '../uat/shared/seededShows';
import {
  aSelectedClass,
  chipById,
  releaseSelectedClass,
  selectFirstDogAndContinue,
} from './wizardChips';

test.describe.configure({ mode: 'serial', timeout: 120000 });

const SHOW_ID = LIVE_REGISTRATION_SHOW_ID;

test('a reload on Select classes restores the step, the dog and the selected class', async ({
  page,
}) => {
  await signInAsExhibitor(page, `/shows/${SHOW_ID}/register`);
  await selectFirstDogAndContinue(page);
  await expect(page.getByRole('heading', { name: 'Select Classes', exact: true })).toBeVisible({
    timeout: 20000,
  });

  const selection = await aSelectedClass(page);
  // The draft is written on `pagehide`, which a reload fires. Give the write a
  // beat so the assertion is about rehydration, not a race with the save.
  await page.waitForTimeout(500);

  await page.reload();

  // The step heading — not the cart — is the claim. Before the fix this read
  // "Select Dogs to Register".
  await expect(page.getByRole('heading', { name: 'Select Classes', exact: true })).toBeVisible({
    timeout: 30000,
  });
  await expect(chipById(page, selection.id).and(page.locator('[data-checked]'))).toHaveCount(1, {
    timeout: 30000,
  });

  // Amendable, not just visible: MYK9-509 asks that the exhibitor can act on
  // the restored selection without starting over.
  await expect(page.getByRole('button', { name: /^Next$/ })).toBeEnabled();

  await releaseSelectedClass(page, selection);
});
