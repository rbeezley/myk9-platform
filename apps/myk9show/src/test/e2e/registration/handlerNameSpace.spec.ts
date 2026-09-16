import { test, expect, type Page } from '@playwright/test';
import { signInAsSecretary } from '../uat/shared/auth';
import { LIVE_REGISTRATION_SHOW_ID } from '../uat/shared/seededShows';

/**
 * MYK9-567: a human tester could not put a space in the handler name —
 * "Mariana Alexander" was entered as "MarianaAlexander". The field doubles as
 * the Base UI Popover trigger for the people typeahead, and Base UI's
 * non-native button emulation preventDefault()s the Space keydown.
 *
 * jsdom cannot be the only witness here: the component test reproduced the
 * symptom, but whether a REAL browser's key handling still lets the character
 * through is exactly the thing jsdom approximates. This spec types the name
 * into the real control with real key events and reads back the field and the
 * saved row.
 *
 * Read-only against shared staging: every cart/entry write is mocked, and the
 * walk stops at the handler step without submitting anything.
 */

test.describe.configure({ mode: 'serial', timeout: 90000 });

const SHOW_ID = LIVE_REGISTRATION_SHOW_ID;
const DOG_SEARCH = 'Ranger';
const CLASS_ELEMENT = 'Container';
const CLASS_LEVEL = 'Novice A';
const MOCK_CART_ID = 'e2e-handler-name-cart';
const HANDLER_NAME = "Mary-Jane O'Brien";

/** Nothing this spec does may reach the shared staging database. */
async function preventSharedWrites(page: Page) {
  await page.route('**/rest/v1/entry_carts**', async route => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
      return;
    }
    if (method === 'POST') {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: MOCK_CART_ID,
          show_id: SHOW_ID,
          exhibitor_id: 'e2e-handler-name-exhibitor',
          status: 'active',
          expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          subtotal_cents: 0,
          platform_fee_cents: 0,
          total_cents: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
      });
      return;
    }
    if (method === 'PATCH') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    await route.fallback();
  });

  await page.route('**/rest/v1/entry_cart_items**', async route => {
    const request = route.request();
    if (request.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      return;
    }
    if (request.method() === 'POST') {
      const body = request.postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'e2e-handler-name-cart-item',
          cart_id: MOCK_CART_ID,
          dog_id: body.dog_id,
          class_id: body.class_id,
          handler_id: null,
          entry_fee_cents: body.entry_fee_cents,
          created_at: new Date().toISOString(),
          dog: null,
          class: null,
          handler: null,
        }),
      });
      return;
    }
    await route.fallback();
  });

  // The walk never submits, but fail loud rather than silently writing if it ever does.
  await page.route('**/rest/v1/rpc/submit_show_entries', route =>
    route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"blocked"}' })
  );
}

async function waitForDogSearch(page: Page, query: string) {
  await page.waitForResponse(
    response =>
      response.url().includes('/rest/v1/dogs') &&
      response.request().method() === 'GET' &&
      response.url().toLowerCase().includes(query),
    { timeout: 10000 }
  );
}

test('the handler name field accepts spaces, hyphens and apostrophes', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-05-15T12:00:00.000Z'));
  await preventSharedWrites(page);
  await signInAsSecretary(page, `/secretary/register/${SHOW_ID}`);

  await expect(page.getByRole('heading', { name: 'Select Dogs to Register' })).toBeVisible({
    timeout: 15000,
  });

  const search = page.getByPlaceholder(/Search all dogs/i);
  await search.fill(DOG_SEARCH);
  await waitForDogSearch(page, DOG_SEARCH.toLowerCase());
  await page
    .getByRole('checkbox', { name: new RegExp(`Select ${DOG_SEARCH}`, 'i') })
    .click({ force: true });
  await expect(page.getByRole('button', { name: /^Next/ })).toBeEnabled({ timeout: 10000 });
  await page.getByRole('button', { name: /^Next/ }).click();

  await expect(page.getByRole('heading', { name: 'Select Classes', exact: true })).toBeVisible({
    timeout: 10000,
  });
  await page
    .locator('.myk9-element-card')
    .filter({ hasText: CLASS_ELEMENT })
    .first()
    .getByRole('checkbox', { name: `Select ${CLASS_LEVEL}` })
    .first()
    .click();
  await page.getByRole('button', { name: /^Next/ }).click();

  // Handler step: open "Change" on the single entry this walk created.
  const changeButton = page.getByRole('button', { name: /^Change$/ }).first();
  await expect(changeButton).toBeVisible({ timeout: 15000 });
  await changeButton.click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Change Handler' })).toBeVisible({
    timeout: 10000,
  });

  const field = dialog.getByLabel('Handler name');
  await expect(field).toBeVisible();
  await field.click();
  await field.press('ControlOrMeta+a');
  // pressSequentially, not fill(): fill() sets .value directly and would never
  // dispatch the Space keydown that was swallowing the character.
  await field.pressSequentially(HANDLER_NAME, { delay: 20 });

  await expect(field).toHaveValue(HANDLER_NAME);

  // The typeahead list is open on the last typed character and anchors directly
  // under the field, inside the dialog — it can sit over "Confirm Handler" and
  // swallow the click. Dismiss it and prove it is gone before confirming.
  const suggestions = dialog.getByRole('listbox');
  await field.press('Escape');
  await expect(suggestions).toBeHidden();

  await dialog.getByRole('button', { name: 'Confirm Handler' }).click();
  await expect(page.getByText(HANDLER_NAME, { exact: false }).first()).toBeVisible({
    timeout: 10000,
  });
});
