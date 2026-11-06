import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { registerDisposableProofHooks } from './disposableClass';
import { openActionsMenu } from '../helpers/actionsMenu';
import {
  evidence,
  fixture,
  isolatedClient,
  rolePage,
  screenshot,
  type Client,
} from './showDayProof.helpers';

/**
 * Road to Club Testing batch 1 follow-ups, walked in the disposable local stack:
 * MYK9-1618 (check-in chip names its destination), MYK9-1615 (dog-level Withdraw waits for a
 * refund-policy outcome) and MYK9-1622 (own premium list drops the myK9 premium line).
 * No Stripe call can leave the runner: guardedContext aborts every non-loopback request.
 */
registerDisposableProofHooks();

const WILLOW = 'dededede-0000-0000-0000-000000000041';
const CHICAGO = 'America/Chicago';

function chicagoDate(offsetDays: number): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: CHICAGO }).format(new Date());
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

test('Overview check-in chip names the Check-in desk and opens it filtered, search focused (MYK9-1618)', async ({
  browser,
}, info) => {
  const client = isolatedClient();
  const f = await fixture(client);
  // The seed leaves today's entries confirmed and not checked in; restate it so an earlier
  // proof in this run cannot have checked Willow in.
  const { error } = await client
    .from('entries')
    .update({ entry_status: 'confirmed', check_in_status: 'no-status' })
    .eq('id', f.willowId);
  if (error) throw error;

  const secretary = await rolePage(browser, 'SECRETARY', `/shows/${f.showId}`);
  const page = secretary.page;
  const chip = page.getByRole('link', {
    name: /^Check in \d+ entr(y|ies), opens Check-in desk$/,
  });
  await expect(async () => {
    const more = page.getByRole('button', { name: /^View \d+ more issues$/ });
    if ((await chip.count()) === 0 && (await more.count()) > 0) await more.click();
    await expect(chip).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 60_000 });
  const visibleText = (await chip.innerText()).trim();
  const accessibleName = await chip.getAttribute('aria-label');
  expect(accessibleName).toBe(`${visibleText}, opens Check-in desk`);
  expect(visibleText).toMatch(/^Check in \d+ entr(y|ies)$/);
  await screenshot(page, info, 'check-in-chip');

  await chip.click();
  await expect(page).toHaveURL(/\/entries\?/);
  const url = new URL(page.url());
  expect(url.pathname).toBe(`/shows/${f.showId}/entries`);
  expect(url.searchParams.get('tab')).toBe('exceptions');
  expect(url.searchParams.get('exception')).toBe('check-in');
  expect(url.searchParams.get('checkin')).toBe('pending');
  await expect(page.getByRole('textbox', { name: 'Search name, dog, armband' })).toBeFocused();
  expect(secretary.nonLocalSocketUrls).toEqual([]);
  await evidence(info, 'check-in-chip', {
    showId: f.showId,
    accessibleName,
    visibleText,
    landedOn: url.pathname + url.search,
  });
  await screenshot(page, info, 'check-in-desk-focused');
});

/** Two of Willow's not-yet-run fixture entries, joined into one paid-online form. */
async function paidWillowForm(client: Client, showId: string, dayOffsets: [number, number]) {
  const dates = dayOffsets.map(chicagoDate);
  const trials = await client
    .from('trials')
    .select('id,date')
    .eq('show_id', showId)
    .in('date', dates);
  if (trials.error) throw trials.error;
  expect(trials.data).toHaveLength(2);
  const classes = await client
    .from('classes')
    .select('id')
    .in(
      'trial_id',
      trials.data.map(t => t.id)
    )
    .is('deleted_at', null);
  if (classes.error) throw classes.error;
  const entries = await client
    .from('entries')
    .select('id')
    .eq('dog_id', WILLOW)
    .in(
      'class_id',
      classes.data.map(c => c.id)
    )
    .is('deleted_at', null);
  if (entries.error) throw entries.error;
  expect(entries.data).toHaveLength(2);
  const ids = entries.data.map(e => e.id);
  // Synthetic only: a fake intent id that no Stripe account knows, used here solely as the
  // grouping key that puts both entries on one form. Nothing below can reach Stripe.
  const intent = `pi_proof_${randomUUID().replace(/-/g, '')}`;
  const update = await client
    .from('entries')
    .update({
      entry_status: 'confirmed',
      check_in_status: 'no-status',
      is_scored: false,
      result_status: 'pending',
      payment_method: 'online',
      payment_status: 'paid',
      stripe_payment_intent_id: intent,
      refunded_at: null,
      entry_fee: 30,
      withdrawal_policy_snapshot: {
        cutoffDate: '2000-01-01',
        retentionType: 'flat',
        retentionValue: 500,
        retentionDeclared: true,
        notes: null,
      },
    })
    .in('id', ids);
  if (update.error) throw update.error;
  return { ids, intent, path: `/shows/${showId}/entries?registration=pi:${intent}` };
}

const isPolicyRead = (url: URL) =>
  url.pathname.endsWith('/rest/v1/entries') &&
  url.searchParams.get('select') === 'withdrawal_policy_snapshot,trials(timezone)';

async function openDogWithdraw(page: Page) {
  await page.getByRole('button', { name: 'Actions for Willow, all entries' }).click();
  await page.getByRole('menuitem', { name: /^Withdraw Willow/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Withdraw Willow' })).toBeVisible();
  await dialog.locator('#withdrawal-reason').click();
  await page.getByRole('option', { name: 'In-Season Dog' }).click();
  return dialog;
}

function watchRefundCalls(page: Page) {
  const calls: string[] = [];
  page.on('request', request => {
    // A refund can only start at a refund edge function or Stripe itself; local reads of the
    // club's Stripe settings (club_stripe_accounts, platform_settings) are not refunds.
    const url = new URL(request.url());
    const refundFunction = /\/functions\/v1\/[^/]*refund/i.test(url.pathname);
    if (refundFunction || /(^|\.)stripe\.com$/i.test(url.hostname)) calls.push(url.href);
  });
  return calls;
}

test('dog Withdraw: failed policy read blocks, retry recovers, then withdraws (MYK9-1615)', async ({
  browser,
}, info) => {
  const client = isolatedClient();
  const f = await fixture(client);
  const form = await paidWillowForm(client, f.showId, [1, 2]);
  const secretary = await rolePage(browser, 'SECRETARY', form.path);
  const page = secretary.page;
  const refundCalls = watchRefundCalls(page);
  let blocked = 0;
  await page.route(isPolicyRead, route => {
    blocked++;
    return route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'PROOF', message: 'policy read blocked by the proof' }),
    });
  });

  const dialog = await openDogWithdraw(page);
  const confirm = dialog.getByRole('button', { name: 'Withdraw Willow', exact: true });
  await expect(dialog.getByText("Couldn't check the refund policy")).toHaveCount(2, {
    timeout: 60_000,
  });
  await expect(dialog.getByText('Checking policy…')).toHaveCount(0);
  await expect(confirm).toBeDisabled();
  expect(blocked).toBeGreaterThanOrEqual(2);
  await screenshot(page, info, 'withdraw-policy-failed');

  await page.unroute(isPolicyRead);
  await dialog.getByRole('button', { name: 'Try again' }).click();
  await expect(dialog.getByText('Suggested refund $25.00')).toHaveCount(2, { timeout: 30_000 });
  await expect(dialog.getByText("Couldn't check the refund policy")).toHaveCount(0);
  await expect(confirm).toBeEnabled();
  await screenshot(page, info, 'withdraw-policy-recovered');

  await confirm.click();
  await expect
    .poll(
      async () => {
        const { data, error } = await client
          .from('entries')
          .select('entry_status,refunded_at,payment_status')
          .in('id', form.ids);
        if (error) throw error;
        return data;
      },
      { timeout: 60_000 }
    )
    .toEqual([
      { entry_status: 'withdrawn', refunded_at: null, payment_status: 'paid' },
      { entry_status: 'withdrawn', refunded_at: null, payment_status: 'paid' },
    ]);
  expect(refundCalls).toEqual([]);
  expect(secretary.nonLocalSocketUrls).toEqual([]);
  await evidence(info, 'withdraw-retry-recovery', { ...form, blockedReads: blocked, refundCalls });
});

test('dog Withdraw offline: refunds left to approval as an explicit choice (MYK9-1615)', async ({
  browser,
}, info) => {
  const client = isolatedClient();
  const f = await fixture(client);
  const form = await paidWillowForm(client, f.showId, [3, 4]);
  const secretary = await rolePage(browser, 'SECRETARY', form.path);
  const page = secretary.page;
  const refundCalls = watchRefundCalls(page);
  await expect(page.getByRole('button', { name: 'Actions for Willow, all entries' })).toBeVisible({
    timeout: 60_000,
  });

  await secretary.context.setOffline(true);
  const dialog = await openDogWithdraw(page);
  const confirm = dialog.getByRole('button', { name: 'Withdraw Willow', exact: true });
  await expect(dialog.getByText("Couldn't check the refund policy")).toHaveCount(2, {
    timeout: 30_000,
  });
  await expect(confirm).toBeDisabled();
  const fallback = dialog.getByRole('button', { name: 'Set refunds when approving' });
  expect((await fallback.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await fallback.click();
  await expect(dialog.getByText(/^Refund set when you approve it \(up to \$30\.00\)$/)).toHaveCount(
    2
  );
  await expect(confirm).toBeEnabled();
  await screenshot(page, info, 'withdraw-offline-refunds-at-approval');
  await secretary.context.setOffline(false);
  expect(refundCalls).toEqual([]);
  await evidence(info, 'withdraw-offline-fallback', { ...form, refundCalls });
});

async function showWithUses(
  client: Client,
  uses: {
    publishes_own_premium: boolean;
    uses_landing_page: boolean;
    uses_device_scoring?: boolean;
    uses_paper_packet?: boolean;
    uses_volunteers?: boolean;
  }
) {
  const id = randomUUID();
  // Three days out keeps it inside the 1..7 day Ready window in any US timezone.
  const start = `${chicagoDate(3)}T00:00:00+00:00`;
  const { error } = await client.from('shows').insert({
    id,
    club_id: 'dededede-0000-0000-0000-000000000001',
    name: `Proof premium ${id.slice(0, 8)}`,
    organization: 'AKC',
    status: 'published',
    start_date: start,
    end_date: start,
    experience_is_published: false,
    published_premium_url: null,
    published_premium_path: null,
    published_premium_at: null,
    ...uses,
  });
  if (error) throw error;
  return id;
}

for (const [label, uses, expected] of [
  [
    'own premium, landing page',
    { publishes_own_premium: true, uses_landing_page: true },
    { premium: false, landing: true },
  ],
  [
    'own premium, no landing page',
    { publishes_own_premium: true, uses_landing_page: false },
    { premium: false, landing: false },
  ],
  [
    'myK9 premium, landing page',
    { publishes_own_premium: false, uses_landing_page: true },
    { premium: true, landing: false },
  ],
] as const) {
  test(`Ready for show day lines: ${label} (MYK9-1622)`, async ({ browser }, info) => {
    const client = isolatedClient();
    const showId = await showWithUses(client, uses);
    const secretary = await rolePage(browser, 'SECRETARY', `/shows/${showId}`);
    const page = secretary.page;
    // A show with no trials yet always fails setup, so the full checklist is listed.
    const section = page.locator('section', {
      has: page.getByRole('heading', { name: 'Ready for show day' }),
    });
    await expect(section).toBeVisible({ timeout: 60_000 });
    await expect(section.getByText('Show details, trials and classes complete')).toBeVisible();
    await expect(section.getByText('Premium published and current')).toHaveCount(
      expected.premium ? 1 : 0
    );
    await expect(section.getByText('Landing page published')).toHaveCount(expected.landing ? 1 : 0);
    if (expected.landing) {
      await expect(section.getByRole('link', { name: /Landing page not published/ })).toBeVisible();
    }
    await evidence(info, `ready-lines-${label}`, {
      showId,
      uses,
      lines: await section.locator('li').allInnerTexts(),
    });
    await screenshot(page, info, `ready-${label}`);
  });
}

// ---- MYK9-1622: the "This show uses…" switches, end to end ----

/** Turn one Edit show switch to `on`; it saves on toggle, with no Save button. */
async function setSwitch(page: Page, name: string, on: boolean) {
  const control = page.getByRole('switch', { name, exact: true });
  await expect(control).toBeEnabled({ timeout: 30_000 });
  if ((await control.getAttribute('aria-checked')) !== String(on)) await control.click();
  await expect(control).toHaveAttribute('aria-checked', String(on), { timeout: 30_000 });
}

async function openUsesSwitches(page: Page, showId: string) {
  await page.goto(`/shows/${showId}?edit=true&editTab=venue`);
  await expect(page.getByRole('heading', { name: 'This show uses…' })).toBeVisible({
    timeout: 60_000,
  });
}

async function showUsesRow(client: Client, showId: string) {
  const show = await client
    .from('shows')
    .select(
      'uses_device_scoring,uses_paper_packet,uses_volunteers,uses_landing_page,publishes_own_premium'
    )
    .eq('id', showId)
    .single();
  if (show.error) throw show.error;
  const settings = await client
    .from('show_visibility_settings')
    .select('self_checkin_enabled')
    .eq('show_id', showId)
    .maybeSingle();
  if (settings.error) throw settings.error;
  return { ...show.data, self_checkin_enabled: settings.data?.self_checkin_enabled ?? null };
}

const GATED_ROWS = ['Self check-in', 'Access codes', 'Emergency trial packet', 'Volunteers'];
const TOOL_SWITCHES = [
  'Exhibitor self check-in',
  'Judges score on devices',
  'Paper fallback packet',
  'Volunteer tracking',
];

/**
 * Wait until the Show Desk Actions menu lists exactly the expected gated rows. The rows are
 * registered by the Show Desk page and re-registered when the replica seeds a switch or the
 * role scope resolves (Volunteers also greys on the scope), so the menu can change a frame
 * after the ungated Check-in desk row appears. Each poll reads every row in ONE snapshot (not
 * a count per row, which can straddle a re-registration), and the poll ends on the settled
 * set; a row that never reaches it still fails the test with the last set seen.
 */
async function expectGatedRows(page: Page, showId: string, expected: string[]) {
  await page.goto(`/shows/${showId}`);
  const menu = await openActionsMenu(page);
  await expect(menu.getByRole('menuitem', { name: /^Check-in desk/ })).toBeVisible({
    timeout: 30_000,
  });
  // The ungated Check-in desk row rides in the same snapshot as a positive control, so an empty
  // read (the menu closed or unmounted mid-poll) can never pass as "no gated rows".
  await expect
    .poll(
      async () => {
        const names = (await menu.getByRole('menuitem').allInnerTexts()).map(name => name.trim());
        return {
          control: names.some(name => name.startsWith('Check-in desk')),
          rows: GATED_ROWS.filter(row => names.some(name => name.startsWith(row))),
        };
      },
      { timeout: 15_000 }
    )
    .toEqual({ control: true, rows: expected });
  await page.keyboard.press('Escape');
}

test('tool switches save per show, hide and restore Actions rows, and lose no data (MYK9-1622)', async ({
  browser,
}, info) => {
  const client = isolatedClient();
  const showId = await showWithUses(client, {
    publishes_own_premium: false,
    uses_landing_page: false,
    uses_device_scoring: true,
    uses_paper_packet: true,
    uses_volunteers: true,
  });
  const volunteer = `Proof Volunteer ${showId.slice(0, 8)}`;
  const seeded = await client.from('volunteers').insert({ show_id: showId, name: volunteer });
  if (seeded.error) throw seeded.error;

  const secretary = await rolePage(browser, 'SECRETARY', `/shows/${showId}`);
  const page = secretary.page;
  await expectGatedRows(page, showId, GATED_ROWS);

  await openUsesSwitches(page, showId);
  for (const name of TOOL_SWITCHES) await setSwitch(page, name, false);
  await screenshot(page, info, 'switches-off');
  await expect
    .poll(() => showUsesRow(client, showId), { timeout: 60_000 })
    .toMatchObject({
      uses_device_scoring: false,
      uses_paper_packet: false,
      uses_volunteers: false,
      self_checkin_enabled: false,
    });
  await expectGatedRows(page, showId, []);
  const kept = await client.from('volunteers').select('name').eq('show_id', showId);
  if (kept.error) throw kept.error;
  expect(kept.data).toEqual([{ name: volunteer }]);

  await openUsesSwitches(page, showId);
  for (const name of TOOL_SWITCHES) await setSwitch(page, name, true);
  await expect
    .poll(() => showUsesRow(client, showId), { timeout: 60_000 })
    .toMatchObject({
      uses_device_scoring: true,
      uses_paper_packet: true,
      uses_volunteers: true,
      self_checkin_enabled: true,
    });

  // A fresh browser proves the server copy, not this tab's replica.
  const fresh = await rolePage(browser, 'SECRETARY', `/shows/${showId}`);
  await expectGatedRows(fresh.page, showId, GATED_ROWS);
  await fresh.page.goto(`/secretary/volunteers?showId=${showId}`);
  // The page shows a first name and last initial ("Proof Volunteer e."), not the stored name.
  await expect(fresh.page.getByText('1 volunteer', { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await expect(fresh.page.getByText(new RegExp(`^Proof Volunteer ${showId[0]}\\.`))).toBeVisible();
  expect(secretary.nonLocalSocketUrls).toEqual([]);
  await evidence(info, 'tool-switches', { showId, server: await showUsesRow(client, showId) });
  await screenshot(fresh.page, info, 'volunteer-kept');
});

test('own premium switch removes the publish nudge; Premium card stays (MYK9-1622)', async ({
  browser,
}, info) => {
  const client = isolatedClient();
  const showId = await showWithUses(client, {
    publishes_own_premium: false,
    uses_landing_page: true,
  });
  const secretary = await rolePage(browser, 'SECRETARY', `/shows/${showId}`);
  const page = secretary.page;
  const premiumNudge = page.getByRole('button', { name: 'premium list not yet published' });
  const landingNudge = page.getByRole('button', { name: 'landing page not yet published' });
  await expect(premiumNudge).toBeVisible({ timeout: 60_000 });

  await openUsesSwitches(page, showId);
  await setSwitch(page, 'We publish our own premium list', true);
  await expect
    .poll(() => showUsesRow(client, showId), { timeout: 60_000 })
    .toMatchObject({ publishes_own_premium: true });
  await page.goto(`/shows/${showId}`);
  // The landing nudge appearing proves the publish read settled before the absence check.
  await expect(landingNudge).toBeVisible({ timeout: 60_000 });
  await expect(premiumNudge).toHaveCount(0);
  await screenshot(page, info, 'own-premium-nudge');

  await openUsesSwitches(page, showId);
  await setSwitch(page, 'Public landing page', false);
  await expect
    .poll(() => showUsesRow(client, showId), { timeout: 60_000 })
    .toMatchObject({ uses_landing_page: false, publishes_own_premium: true });
  await page.goto(`/shows/${showId}/about`);
  await expect(page.getByRole('heading', { name: 'Premium List' })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByRole('heading', { name: 'Public Landing Page' })).toHaveCount(0);
  await page.goto(`/shows/${showId}`);
  await expect(page.getByRole('heading', { name: 'Ready for show day' })).toBeVisible({
    timeout: 60_000,
  });
  await expect(premiumNudge).toHaveCount(0);
  await expect(landingNudge).toHaveCount(0);
  await evidence(info, 'own-premium-switch', { showId, server: await showUsesRow(client, showId) });
  await screenshot(page, info, 'own-premium-no-landing');
});
