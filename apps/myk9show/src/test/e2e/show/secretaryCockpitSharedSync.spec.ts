import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

import { signInAsSecretary } from '../helpers/testUsers';

/**
 * Opt-in shared-staging acceptance rehearsal for the secretary cockpit.
 *
 * This deliberately changes one known, idle demo Class and restores it in a
 * finally block. It must never run in ordinary CI or in parallel with another
 * shared-staging writer.
 */
const ENABLED = process.env.SECRETARY_COCKPIT_SHARED_VERIFY === '1';
const SHOW_ID = 'dededede-0000-0000-0000-000000000010';
const CLASS_ID = 'dec1a55e-0000-0000-0000-000000000033';
const CLASS_NAME = 'Exterior Excellent';
const SHOW_DESK_PATH = `/shows/${SHOW_ID}/show-desk?focus=${CLASS_ID}`;
const AT_SHOW_PATH = `/at-show/${SHOW_ID}`;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

function focusedPanel(page: Page) {
  return page.locator('[data-testid="cockpit-split-focus"]:visible');
}

function statusControl(page: Page, status: string) {
  return focusedPanel(page).getByRole('button', {
    name: `Change class status. Current status: ${status}`,
  });
}

async function setStatus(page: Page, current: string, next: string) {
  await statusControl(page, current).click();
  await page.getByRole('menuitem', { name: next, exact: true }).click();
  await expect(statusControl(page, next)).toBeVisible({ timeout: 15_000 });
}

async function setExpectedStart(page: Page, value: string) {
  const panel = focusedPanel(page);
  await panel.getByRole('button', { name: /Set expected start|\d{1,2}:\d{2}/ }).click();
  await panel.getByLabel('Revised expected start').fill(value);
  await panel.getByRole('button', { name: 'Save expected start' }).click();
  await expect(panel.getByText(value, { exact: true })).toBeVisible({ timeout: 15_000 });
}

test.describe('Secretary cockpit shared two-device sync', () => {
  test.skip(
    !ENABLED,
    'Shared staging mutation: set SECRETARY_COCKPIT_SHARED_VERIFY=1 and run alone.'
  );

  test('status and expected start converge online and after offline reconnect', async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    test.skip(!SUPABASE_URL || !SERVICE_KEY, 'Needs staging Supabase service credentials.');

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data: initialClass, error: initialClassError } = await admin
      .from('classes')
      .select('status,status_source,actual_start_time,actual_end_time,revised_expected_start')
      .eq('id', CLASS_ID)
      .single();
    expect(initialClassError).toBeNull();
    expect(initialClass).toMatchObject({
      status: 'upcoming',
      status_source: 'manual',
      actual_start_time: null,
      actual_end_time: null,
      revised_expected_start: null,
    });

    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const staffContext = await browser.newContext();
    const secretaryA = await contextA.newPage();
    const secretaryB = await contextB.newPage();
    const staffAtShow = await staffContext.newPage();
    let didMutate = false;

    try {
      await Promise.all([
        signInAsSecretary(secretaryA, SHOW_DESK_PATH),
        signInAsSecretary(secretaryB, SHOW_DESK_PATH),
        signInAsSecretary(staffAtShow, AT_SHOW_PATH),
      ]);

      await secretaryB.evaluate(() => {
        (window as unknown as { __cockpitNudges: number }).__cockpitNudges = 0;
        window.addEventListener('replication:sync-requested', () => {
          (window as unknown as { __cockpitNudges: number }).__cockpitNudges += 1;
        });
      });

      await expect(statusControl(secretaryA, 'Not started')).toBeVisible({ timeout: 30_000 });
      await expect(statusControl(secretaryB, 'Not started')).toBeVisible({ timeout: 30_000 });
      await expect(
        focusedPanel(secretaryA).getByRole('button', { name: 'Set expected start' })
      ).toBeVisible();

      await expect(staffAtShow.getByRole('button', { name: new RegExp(CLASS_NAME) })).toBeVisible({
        timeout: 30_000,
      });

      didMutate = true;
      await setStatus(secretaryA, 'Not started', 'In progress');
      await expect
        .poll(
          () =>
            secretaryB.evaluate(
              () => (window as unknown as { __cockpitNudges: number }).__cockpitNudges
            ),
          { timeout: 20_000, message: 'Device B never received the show-day sync nudge' }
        )
        .toBeGreaterThan(0);
      await expect(statusControl(secretaryB, 'In progress')).toBeVisible({ timeout: 20_000 });

      const staffCard = staffAtShow.getByRole('button', { name: new RegExp(CLASS_NAME) });
      await expect(staffCard).toContainText(/In Progress/i, { timeout: 20_000 });
      await expect(staffCard).toContainText(/Started/i, { timeout: 20_000 });

      await setExpectedStart(secretaryA, '16:44');
      await expect(focusedPanel(secretaryB).getByText('16:44', { exact: true })).toBeVisible({
        timeout: 20_000,
      });
      await expect(staffCard).toContainText(/Expected 4:44 PM/i, { timeout: 20_000 });

      await contextA.setOffline(true);
      await secretaryA.evaluate(() => window.dispatchEvent(new Event('offline')));
      await setExpectedStart(secretaryA, '16:47');
      await expect(focusedPanel(secretaryB).getByText('16:44', { exact: true })).toBeVisible();

      await contextA.setOffline(false);
      await secretaryA.evaluate(() => window.dispatchEvent(new Event('online')));
      await expect(focusedPanel(secretaryB).getByText('16:47', { exact: true })).toBeVisible({
        timeout: 30_000,
      });
      await expect(staffCard).toContainText(/Expected 4:47 PM/i, { timeout: 30_000 });
    } finally {
      if (didMutate) {
        await contextA.setOffline(false).catch(() => undefined);
        const { error: restoreError } = await admin
          .from('classes')
          .update({
            status: initialClass!.status,
            status_source: initialClass!.status_source,
            actual_start_time: initialClass!.actual_start_time,
            actual_end_time: initialClass!.actual_end_time,
            revised_expected_start: initialClass!.revised_expected_start,
          })
          .eq('id', CLASS_ID);
        expect(restoreError, 'shared demo Class cleanup must succeed').toBeNull();
      }
      await Promise.all([contextA.close(), contextB.close(), staffContext.close()]);
    }
  });
});
