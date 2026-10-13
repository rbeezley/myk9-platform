import { test, expect, type Route } from '@playwright/test';
import { signInAsSecretary } from './uat/shared/auth';
import { LIVE_REGISTRATION_SHOW_ID } from './uat/shared/seededShows';
import { installSharedStagingWriteGuard } from './helpers/sharedStagingWriteGuard';
import { measureInsidePanel, insidePanelKnownAnswers } from './helpers/insidePanel';
import { applyRegistrationClock } from './registration/seedRoster';

/**
 * MYK9-1137: at 320 and 375px Quick Create's "Use This Person" (duplicate prompt), the Dogs Added
 * row's "Remove" and the step footer's "Review" sat past the slide-out's right edge (right edges
 * at 403 to 407px in a 320 or 375px viewport). Measured in a real browser, because jsdom has no
 * layout engine.
 *
 * Writes nothing: `installSharedStagingWriteGuard` blocks any write the mocks below do not answer,
 * and the person/dog writes are answered locally. The duplicate is the seeded exhibitor2 account.
 */

const WIDTHS = [320, 375, 768, 1280];
const DUPLICATE_EMAIL = 'exhibitor2@myk9t.com';
const NEW_DOG_ID = '22222222-2222-4222-8222-222222222222';

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

test('measurement harness known answers', async ({ page }) => {
  await page.goto('about:blank');
  expect(await insidePanelKnownAnswers(page)).toEqual([]);
});

for (const width of WIDTHS) {
  test(`Quick Create controls stay inside the panel @ ${width}px`, async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: 812 });
    await installSharedStagingWriteGuard(page, { strictRpcWrites: true });
    await applyRegistrationClock(page);
    await page.route('**/rest/v1/dogs**', async route => {
      const method = route.request().method();
      if (method === 'GET' || method === 'HEAD') return route.fallback();
      const body = route.request().postDataJSON();
      const row = Array.isArray(body) ? body[0] : body;
      return json(
        route,
        { ...row, id: row.id ?? NEW_DOG_ID, status: 'active', deleted_at: null, registrations: [] },
        method === 'POST' ? 201 : 200
      );
    });
    await page.route('**/rest/v1/rpc/create_dog_with_registrations', r => json(r, null));

    await signInAsSecretary(page, `/secretary/register/${LIVE_REGISTRATION_SHOW_ID}`);
    await page.goto(`/secretary/register/${LIVE_REGISTRATION_SHOW_ID}`, {
      waitUntil: 'domcontentloaded',
    });
    // At 768px the sticky wizard header and entries bar leave no clickable gap around this
    // button (MYK9-1138), so open the menu from the keyboard; this spec measures the panel.
    await page.getByRole('button', { name: /Create New/i }).focus();
    await page.keyboard.press('Enter');
    await page.getByRole('menuitem', { name: /Exhibitor & Dog/i }).click();

    // Duplicate prompt.
    const personDialog = page.getByRole('dialog', { name: 'Add Person' });
    await expect(personDialog).toBeVisible();
    await page.getByLabel(/First Name/i).fill('Riley');
    await page.getByLabel(/Last Name/i).fill('Parker');
    await page.getByLabel(/Email Address/i).fill(DUPLICATE_EMAIL);
    await page.getByRole('button', { name: /Next: Contact/ }).click();
    const useThis = page.getByRole('button', { name: /Use This Person/i });
    await expect(useThis).toBeVisible({ timeout: 15000 });
    const duplicateFit = await measureInsidePanel(personDialog, {
      'Use This Person': useThis,
      'Add Person Anyway': page.getByRole('button', { name: /Add Person Anyway/i }),
    });

    // Dogs Added row and step footer.
    await useThis.click();
    const steps = page.getByRole('dialog', { name: 'Quick Registration Setup' });
    await expect(steps.getByRole('heading', { name: 'Add Dog(s)' })).toBeVisible({
      timeout: 15000,
    });
    await steps.getByRole('button', { name: 'Add First Dog' }).click();
    const dogDialog = page.getByRole('dialog', { name: 'Add Dog' });
    await dogDialog.getByLabel(/Call Name/i).fill('Ziggy');
    await dogDialog.getByRole('combobox').first().click();
    await page.getByRole('option', { name: /Female/i }).click();
    await dogDialog.getByLabel(/Date of Birth/i).fill('2020-01-15');
    await dogDialog.getByRole('tab', { name: /Registration/i }).click();
    await dogDialog.getByRole('button', { name: 'Add New Registration' }).click();
    const reg = page.getByRole('dialog', { name: 'Add New Registration' });
    await reg.getByRole('combobox').nth(0).click();
    await page.getByRole('option', { name: /AKC \(American Kennel Club\)/i }).click();
    await reg.getByLabel(/Registered Name/i).fill('Ziggy Geometry Test');
    await reg.getByLabel(/Registered Breed/i).click();
    await page.getByPlaceholder('Search breeds…').fill('Golden Retriever');
    await page
      .getByRole('listbox', { name: 'Breeds' })
      .getByRole('option', { name: 'Golden Retriever' })
      .click();
    await reg.getByLabel(/Registration Number/i).fill('DN12345603');
    await reg.getByRole('button', { name: 'Save Registration' }).click();
    await dogDialog.getByRole('tab', { name: /Optional details/i }).click();
    await dogDialog.getByRole('button', { name: 'Add Dog', exact: true }).click();
    await expect(steps.getByRole('heading', { name: 'Dogs Added (1):' })).toBeVisible({
      timeout: 15000,
    });
    const dogsFit = await measureInsidePanel(steps, {
      Edit: steps.getByRole('button', { name: 'Edit', exact: true }),
      Remove: steps.getByRole('button', { name: 'Remove', exact: true }),
      Review: steps.getByRole('button', { name: 'Review', exact: true }),
    });

    const all = [...duplicateFit, ...dogsFit];
    const offenders = all.filter(f => f.pastRight > 0 || f.pastLeft > 0);
    expect(offenders, `controls outside the panel at ${width}px: ${JSON.stringify(all)}`).toEqual(
      []
    );
  });
}
