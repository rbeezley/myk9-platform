import { expect, test, type Browser, type Page } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DATA_REQUIRED } from '../helpers/liveCanary';
import { installSharedStagingWriteGuard } from '../helpers/sharedStagingWriteGuard';
import { signInAsExhibitor, signInAsSecretary, TEST_USERS } from '../helpers/testUsers';
import { chipById, clickClearOfStickyChrome } from '../registration/wizardChips';
import {
  authUserId,
  backdateOffer,
  DOGS,
  entryStatus,
  exhibitorProfileId,
  FULL_CLASS_ID,
  mailInHeadNoticeCount,
  prepareFullClass,
  queueBehind,
  restoreFullClass,
  rowFor,
  runWaitlistCron,
  setMaxEntries,
  SHOW_ID,
  waitlistAdmin,
} from './waitlistJourneyFixture';

/**
 * Suite category: nightly (stateful, seeded Playwright Regression only).
 *
 * MYK9-971: ONE wait-list journey on the seed's full-class fixture (Handler Discrimination
 * Advanced, `...045`, one spot, Cooper entered), across exhibitor, secretary and the real
 * `cron-waitlist-expiration` edge function served by the isolated target's edge runtime:
 *
 *   exhibitor joins the full class -> a spot opens -> secretary offers it -> exhibitor sees the
 *   offer and its deadline -> declines -> the cron offers the next online dog -> that offer
 *   expires -> the cron finds a mail-in dog at the head -> each secretary gets ONE notice (a second
 *   cron run sends none) and the online dog behind is NOT offered (MYK9-1021).
 *
 * The paid leg (claim the offer through Stripe) is not here: the target has no Stripe test-mode
 * key, and the functions get a dummy one (scripts/qa/isolated-e2e-functions.ts). So the
 * secretary's Offer creates the pending entry but its payment link fails, which the page reports
 * as a warning; the journey asserts the offer itself.
 *
 * Setup and teardown use the service role against the LOCAL database only (`waitlistAdmin`
 * refuses any other host); the class, Juniper's seeded row and the journey's rows are restored in
 * `afterAll` because later specs in the same serial pass read this show.
 */

const CLASS_LABEL = /Handler Discrimination/;

async function signedInPage(
  browser: Browser,
  signIn: (page: Page, returnTo: string) => Promise<unknown>,
  returnTo: string
): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await installSharedStagingWriteGuard(page, { strictRpcWrites: true });
  await signIn(page, returnTo);
  return page;
}

function offerCard(page: Page, dogName: string) {
  return page.getByRole('region', { name: `Waitlist offer for ${dogName}` });
}

/** My Shows reads the wait list on load; reload until the server's change shows. */
async function expectOnMyShows(page: Page, dogName: string, text: RegExp | string) {
  await expect(async () => {
    await page.goto('/exhibitor/entries');
    await expect(offerCard(page, dogName)).toContainText(text, { timeout: 10_000 });
  }).toPass({ timeout: 60_000 });
}

test.describe('Wait list: join -> offer -> decline -> expire -> mail-in head', () => {
  test.skip(
    !DATA_REQUIRED,
    'Stateful: joins a wait list, offers, declines and runs the expiry cron. ' +
      'Runs only on the seeded isolated Playwright Regression target.'
  );
  test.describe.configure({ mode: 'serial' });

  let admin: SupabaseClient;
  let snapshot: Awaited<ReturnType<typeof prepareFullClass>> | null = null;
  const since = new Date().toISOString();

  test.beforeAll(async () => {
    admin = waitlistAdmin();
    snapshot = await prepareFullClass(admin);
  });

  test.afterAll(async () => {
    if (snapshot) await restoreFullClass(admin, snapshot, since);
  });

  test('an exhibitor, the secretary and the expiry cron move one wait list (MYK9-971)', async ({
    browser,
  }) => {
    test.setTimeout(420_000);
    const exhibitorAuthId = await authUserId(admin, TEST_USERS.DEMO_EXHIBITOR.email);
    const secretaryAuthId = await authUserId(admin, TEST_USERS.SECRETARY.email);

    const exhibitor = await signedInPage(browser, signInAsExhibitor, `/shows/${SHOW_ID}/register`);

    await test.step('exhibitor joins the full class wait list through the wizard and cart', async () => {
      await expect(exhibitor.getByRole('heading', { name: 'Select Dogs to Register' })).toBeVisible(
        { timeout: 20_000 }
      );
      await exhibitor.getByRole('checkbox', { name: /^Select Willow$/ }).click();
      await exhibitor.getByRole('button', { name: /^Next$/ }).click();

      await expect(
        exhibitor.getByRole('heading', { name: 'Select Classes', exact: true })
      ).toBeVisible({ timeout: 15_000 });
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
    });

    // Behind Willow: Ranger online, Scout by mail, Maple online. The secretary would key the
    // mail-in row from paper; the queue order is what the rest of the journey is about.
    await queueBehind(admin, await exhibitorProfileId(admin, exhibitorAuthId), [
      { dogId: DOGS.ranger, joinedVia: 'online' },
      { dogId: DOGS.scout, joinedVia: 'mail_in' },
      { dogId: DOGS.maple, joinedVia: 'online' },
    ]);
    // A spot opens: the club raises the cap from one to two.
    await setMaxEntries(admin, 2);

    await test.step('the secretary offers the open spot to the head of the line', async () => {
      const secretary = await signedInPage(
        browser,
        signInAsSecretary,
        `/shows/${SHOW_ID}/entries?tab=waitlist`
      );
      const willowRow = secretary.getByRole('row').filter({ hasText: 'Willow' });
      await expect(async () => {
        await secretary.reload();
        await expect(willowRow.getByRole('button', { name: 'Offer Spot' })).toBeVisible({
          timeout: 10_000,
        });
      }).toPass({ timeout: 90_000 });
      await willowRow.getByRole('button', { name: 'Offer Spot' }).click();
      const dialog = secretary.getByRole('dialog');
      await expect(dialog.getByRole('heading', { name: 'Offer Spot?' })).toBeVisible();
      await dialog.getByRole('button', { name: 'Offer Spot' }).click();
      await expect(secretary.getByTestId('waitlist-offered-group')).toContainText('Willow', {
        timeout: 20_000,
      });
      await secretary.context().close();

      const willow = await rowFor(admin, DOGS.willow);
      expect(willow.status).toBe('offered');
      expect(willow.promoted_entry_id).toBeTruthy();
      // The show's 48-hour window, give or take the seconds the step took.
      const hoursLeft = (Date.parse(willow.offer_expires_at!) - Date.now()) / 3_600_000;
      expect(hoursLeft).toBeGreaterThan(47);
      expect(hoursLeft).toBeLessThanOrEqual(48.05);
    });

    await test.step('the exhibitor sees the offer and its deadline, then declines', async () => {
      await expectOnMyShows(exhibitor, 'Willow', 'Spot offered');
      const card = offerCard(exhibitor, 'Willow');
      await expect(card).toContainText(/Claim by /);
      await expect(card.getByRole('button', { name: 'Complete payment' })).toBeVisible();
      await card.getByRole('button', { name: 'Decline' }).click();
      await expect(card).toContainText('You declined this spot.', { timeout: 20_000 });

      const willow = await rowFor(admin, DOGS.willow);
      expect(willow.status).toBe('declined');
      expect(await entryStatus(admin, willow.promoted_entry_id!)).toBe('promotion-expired');
    });

    await test.step('the cron offers the freed spot to the next online dog', async () => {
      await runWaitlistCron();
      const ranger = await rowFor(admin, DOGS.ranger);
      expect(ranger.status).toBe('offered');
      expect(ranger.promoted_entry_id).toBeTruthy();
      expect((await rowFor(admin, DOGS.scout)).status).toBe('waiting');
      await expectOnMyShows(exhibitor, 'Ranger', 'Spot offered');
    });

    await test.step('the offer expires; a mail-in dog at the head gets one secretary notice', async () => {
      const ranger = await rowFor(admin, DOGS.ranger);
      await backdateOffer(admin, ranger.id);
      await runWaitlistCron();

      expect((await rowFor(admin, DOGS.ranger)).status).toBe('expired');
      expect(await entryStatus(admin, ranger.promoted_entry_id!)).toBe('promotion-expired');
      // The mail-in head is never offered automatically, and nobody behind it jumps the line.
      expect((await rowFor(admin, DOGS.scout)).status).toBe('waiting');
      expect((await rowFor(admin, DOGS.maple)).status).toBe('waiting');
      expect(await mailInHeadNoticeCount(admin, secretaryAuthId, since)).toBe(1);
      await expectOnMyShows(exhibitor, 'Ranger', 'This offer has expired.');
    });

    await test.step('a second cron run sends no repeat notice and still offers no one', async () => {
      await runWaitlistCron();
      expect(await mailInHeadNoticeCount(admin, secretaryAuthId, since)).toBe(1);
      expect((await rowFor(admin, DOGS.scout)).status).toBe('waiting');
      expect((await rowFor(admin, DOGS.maple)).status).toBe('waiting');
    });

    await test.step('the secretary reads the notice in the Message Center', async () => {
      const secretary = await signedInPage(browser, signInAsSecretary, `/shows/${SHOW_ID}`);
      await secretary.getByRole('button', { name: /Message Center/ }).click();
      await secretary.getByRole('tab', { name: 'Notifications' }).click();
      await expect(secretary.getByText('Mail-in dog needs an offer')).toHaveCount(1, {
        timeout: 20_000,
      });
      await expect(secretary.getByText(/is next and joined by mail/)).toBeVisible();
      await secretary.context().close();
    });

    await exhibitor.context().close();
  });
});
