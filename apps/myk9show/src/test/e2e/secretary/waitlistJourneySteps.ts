import { expect, type Browser, type Page } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { installSharedStagingWriteGuard } from '../helpers/sharedStagingWriteGuard';
import { signInAsSecretary } from '../helpers/testUsers';
import { chipById, clickClearOfStickyChrome } from '../registration/wizardChips';
import { DOGS, FULL_CLASS_ID, rowFor, SHOW_ID } from './waitlistJourneyFixture';

/**
 * Browser steps the wait-list journeys share (MYK9-971): the exhibitor's join through the wizard
 * and cart, the secretary's Offer Spot, and reading an offer card on My Shows.
 */

const CLASS_LABEL = /Handler Discrimination/;

export async function signedInPage(
  browser: Browser,
  signIn: (page: Page, returnTo: string) => Promise<unknown>,
  returnTo: string
): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await installSharedStagingWriteGuard(page, { strictRpcWrites: true });
  await signIn(page, returnTo);
  return page;
}

export function offerCard(page: Page, dogName: string) {
  return page.getByRole('region', { name: `Waitlist offer for ${dogName}` });
}

/**
 * My Shows reads the wait list on load; reload until the server's change shows. The list holds
 * only waiting and offered rows, so a closed offer is opened the way its notification links to it
 * (`?waitlistOffer=<id>`), which is the only place the app explains a terminal state.
 */
export async function expectOnMyShows(
  page: Page,
  dogName: string,
  text: RegExp | string,
  focusedOfferId?: string
) {
  const url = focusedOfferId
    ? `/exhibitor/entries?waitlistOffer=${focusedOfferId}`
    : '/exhibitor/entries';
  await expect(async () => {
    await page.goto(url);
    await expect(offerCard(page, dogName)).toContainText(text, { timeout: 10_000 });
  }).toPass({ timeout: 60_000 });
}

/** The exhibitor (already on the show's register page) puts Willow on the full class's wait list. */
export async function joinFullClassAsWillow(exhibitor: Page, admin: SupabaseClient) {
  await expect(exhibitor.getByRole('heading', { name: 'Select Dogs to Register' })).toBeVisible({
    timeout: 20_000,
  });
  await exhibitor.getByRole('checkbox', { name: /^Select Willow$/ }).click();
  await exhibitor.getByRole('button', { name: /^Next$/ }).click();

  await expect(exhibitor.getByRole('heading', { name: 'Select Classes', exact: true })).toBeVisible(
    { timeout: 15_000 }
  );
  const card = exhibitor.locator('.myk9-element-card').filter({ hasText: CLASS_LABEL });
  await expect(card.getByText('Full: join wait list')).toBeVisible({ timeout: 15_000 });
  const chip = chipById(exhibitor, `chip-${FULL_CLASS_ID}`);
  await expect(chip).toBeEnabled();
  await clickClearOfStickyChrome(exhibitor, chip);
  await expect(exhibitor.getByRole('button', { name: /^Next$/ })).toBeEnabled({
    timeout: 10_000,
  });
  await exhibitor.getByRole('button', { name: /^Next$/ }).click();

  await expect(exhibitor.getByRole('heading', { name: 'Payment Information' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(exhibitor.getByText(/joining a wait list is free/)).toBeVisible({
    timeout: 15_000,
  });
  const cardPayment = exhibitor.getByRole('button', {
    name: /Credit\/Debit Card \(Online Payment\)/i,
  });
  await cardPayment.evaluate((button: HTMLElement) => button.click());
  await exhibitor.getByText(/I have read and agree to the .* entry agreement/i).click();
  await exhibitor.getByRole('button', { name: /^Submit & pay$/ }).click();

  await expect(exhibitor).toHaveURL(/\/cart$/, { timeout: 15_000 });
  await exhibitor.getByRole('button', { name: /^Join the wait list \(1 request\)$/ }).click();
  await expect(exhibitor).toHaveURL(/\/checkout\/success\?waitlist=1/, { timeout: 20_000 });

  const willow = await rowFor(admin, DOGS.willow);
  expect(willow).toMatchObject({ status: 'waiting', joined_via: 'online', position: 1 });
}

/** The secretary offers the open spot to the dog at the head of the line, from the Waitlist tab. */
export async function offerSpotAsSecretary(browser: Browser, dogName: string) {
  const secretary = await signedInPage(
    browser,
    signInAsSecretary,
    `/shows/${SHOW_ID}/entries?tab=waitlist`
  );
  const row = secretary.getByRole('row').filter({ hasText: dogName });
  await expect(async () => {
    await secretary.reload();
    await expect(row.getByRole('button', { name: 'Offer Spot' })).toBeVisible({
      timeout: 10_000,
    });
  }).toPass({ timeout: 90_000 });
  await row.getByRole('button', { name: 'Offer Spot' }).click();
  // WaitlistActionDialog is an AlertDialog: role alertdialog, named by its title.
  const dialog = secretary.getByRole('alertdialog', { name: 'Offer Spot?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Offer Spot', exact: true }).click();
  await expect(secretary.getByTestId('waitlist-offered-group')).toContainText(dogName, {
    timeout: 20_000,
  });
  await secretary.context().close();
}
