import { expect, test } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DATA_REQUIRED } from '../helpers/liveCanary';
import { signInAsExhibitor, signInAsSecretary, TEST_USERS } from '../helpers/testUsers';
import {
  authUserId,
  backdateOffer,
  DOGS,
  entryPayment,
  entryStatus,
  exhibitorProfileId,
  mailInHeadNoticeCount,
  paymentLinkFor,
  prepareFullClass,
  queueBehind,
  restoreFullClass,
  rowFor,
  runWaitlistCron,
  setMaxEntries,
  SHOW_ID,
  waitlistAdmin,
} from './waitlistJourneyFixture';
import {
  expectOnMyShows,
  joinFullClassAsWillow,
  offerCard,
  offerSpotAsSecretary,
  signedInPage,
} from './waitlistJourneySteps';
import {
  assertSandboxHasNoSharedWebhookEndpoints,
  deliverCheckoutCompleted,
  payOnStripeCheckout,
  routeStripeReturnThroughAllowedOrigin,
  stripeTestKey,
} from './waitlistStripe';

/**
 * Suite category: nightly (stateful, seeded Playwright Regression only).
 *
 * MYK9-971: wait-list journeys on the seed's full-class fixture (Handler Discrimination Advanced,
 * `...045`, one spot, Cooper entered), across exhibitor, secretary and the real edge functions
 * served by the isolated target's edge runtime. The first runs `cron-waitlist-expiration`:
 *
 *   exhibitor joins the full class -> a spot opens -> secretary offers it -> exhibitor sees the
 *   offer and its deadline -> declines -> the cron offers the next online dog -> that offer
 *   expires -> the cron finds a mail-in dog at the head -> each secretary gets ONE notice (a second
 *   cron run sends none) and the online dog behind is NOT offered (MYK9-1021).
 *
 * The paid leg is its own journey below: join -> offer -> the exhibitor claims the spot by paying
 * on Stripe's test-mode Checkout -> the webhook settles it -> the entry is confirmed and paid. It
 * needs a Stripe sandbox key (STRIPE_TEST_SECRET_KEY) and skips, with that reason, without one;
 * waitlistStripe.ts says what is real and what the runner stands in for. In the first journey the
 * secretary's Offer creates the pending entry but its payment link is refused (the preview origin
 * is not an allowed return URL), which the page reports as a warning; it asserts the offer itself.
 *
 * Setup and teardown use the service role against the LOCAL database only (`waitlistAdmin`
 * refuses any other host); the class, Juniper's seeded row and the journey's rows are restored in
 * `afterAll` because later specs in the same serial pass read this show.
 */

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

    await test.step('exhibitor joins the full class wait list through the wizard and cart', () =>
      joinFullClassAsWillow(exhibitor, admin));

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
      await offerSpotAsSecretary(browser, 'Willow');

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
      await expectOnMyShows(exhibitor, 'Ranger', 'This offer has expired.', ranger.id);
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

test.describe('Wait list: join -> offer -> pay -> confirmed entry', () => {
  test.skip(
    !DATA_REQUIRED,
    'Stateful: joins a wait list, offers and pays. ' +
      'Runs only on the seeded isolated Playwright Regression target.'
  );
  test.skip(
    !stripeTestKey(),
    'Needs STRIPE_TEST_SECRET_KEY (a Stripe sandbox sk_test_ key) to pay on test-mode Checkout; ' +
      'the Nightly workflow supplies it from the repository secret.'
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

  test('the exhibitor claims an offered spot by paying, and the entry is confirmed (MYK9-971)', async ({
    browser,
  }) => {
    test.setTimeout(360_000);
    // First, before any Checkout Session exists: a sandbox that delivers to a shared project fails.
    await test.step('the Stripe sandbox delivers to no shared Supabase project', () =>
      assertSandboxHasNoSharedWebhookEndpoints());
    const exhibitor = await signedInPage(browser, signInAsExhibitor, `/shows/${SHOW_ID}/register`);
    await routeStripeReturnThroughAllowedOrigin(exhibitor);

    await test.step('exhibitor joins the full class wait list', () =>
      joinFullClassAsWillow(exhibitor, admin));
    // A spot opens: the club raises the cap from one to two. Nothing offers it automatically
    // here (the cron is never run in this journey), so only the secretary's Offer can.
    await setMaxEntries(admin, 2);

    // Without this step Willow stays `waiting`, My Shows never shows "Complete payment", and
    // stripe-payment-link refuses an exhibitor with no live offer (403): the leg cannot pass.
    await test.step('the secretary offers the open spot', async () => {
      await offerSpotAsSecretary(browser, 'Willow');
      const willow = await rowFor(admin, DOGS.willow);
      expect(willow.status).toBe('offered');
      expect(await entryPayment(admin, willow.promoted_entry_id!)).toMatchObject({
        entry_status: 'pending-payment',
        payment_status: 'pending',
      });
    });

    const willow = await rowFor(admin, DOGS.willow);
    const entryId = willow.promoted_entry_id!;

    await test.step('the exhibitor completes payment on Stripe test-mode Checkout', async () => {
      await expectOnMyShows(exhibitor, 'Willow', 'Spot offered');
      await offerCard(exhibitor, 'Willow')
        .getByRole('button', { name: 'Complete payment' })
        .click();
      const returnPath = await payOnStripeCheckout(exhibitor);
      expect(returnPath).toBe(`/exhibitor/entries?waitlistOffer=${willow.id}`);
      expect((await paymentLinkFor(admin, entryId)).status).toBe('open');
    });

    await test.step('the payment webhook settles it: the entry is confirmed and paid', async () => {
      const link = await paymentLinkFor(admin, entryId);
      await deliverCheckoutCompleted(link.stripe_checkout_session_id);

      expect(await entryPayment(admin, entryId)).toEqual({
        entry_status: 'confirmed',
        payment_status: 'paid',
        payment_method: 'online',
      });
      expect((await rowFor(admin, DOGS.willow)).status).toBe('accepted');
      expect((await paymentLinkFor(admin, entryId)).status).toBe('paid');
    });

    await test.step('My Shows shows the claimed spot, with nothing left to pay', async () => {
      await expectOnMyShows(exhibitor, 'Willow', 'Payment is being confirmed', willow.id);
      const card = offerCard(exhibitor, 'Willow');
      await expect(card.getByRole('button', { name: 'Complete payment' })).toHaveCount(0);
      await expect(card).not.toContainText('Spot offered');
    });

    await exhibitor.context().close();
  });
});
