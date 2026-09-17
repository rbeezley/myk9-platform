import { expect, test } from '@playwright/test';
import { signInAsExhibitor } from '../helpers/testUsers';
import { installSharedStagingWriteGuard } from '../helpers/sharedStagingWriteGuard';
import { applyRegistrationClock, SEEDED_EXHIBITOR_DOG_COUNT } from './seedRoster';
const REGISTRATION_SHOW_ID = 'a1090000-0000-0000-0010-100000000001';

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
]) {
  test(`dog search preserves selection and drafts at ${viewport.width}px`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(60_000);
    await page.setViewportSize(viewport);
    await installSharedStagingWriteGuard(page, { strictRpcWrites: true });
    await applyRegistrationClock(page);
    await signInAsExhibitor(page, `/shows/${REGISTRATION_SHOW_ID}/register`);
    const search = page.getByRole('textbox', { name: 'Search dogs by call name' });
    await expect(search).toBeVisible();
    const dogs = page.getByRole('checkbox', { name: /^Select / });
    // MYK9-545: this used to pin `toHaveCount(252)`. Staging is shared and the
    // demo exhibitor's roster only grows (the seed's dog delete is id-scoped),
    // so an absolute count expires on the first walk that creates a dog. Derive
    // the expectation from the picker's own status line instead, and hold only
    // the floor the seed actually guarantees.
    const rosterStatus = page.getByText(/^\d+ of \d+ dogs shown$/);
    await expect(rosterStatus).toBeVisible();
    const rosterTotal = Number(/of (\d+) dogs shown/.exec(await rosterStatus.innerText())?.[1]);
    expect(rosterTotal).toBeGreaterThanOrEqual(SEEDED_EXHIBITOR_DOG_COUNT);
    await expect(dogs).toHaveCount(rosterTotal);
    // The MYK9-109 load fixture repeats call names (three dogs answer to
    // "Birch"), so the aria-label of `.last()` can resolve to several
    // checkboxes and every later name-based locator would break strict mode.
    // Take the LAST label that is unique in the roster: still far down the
    // list, but addressable.
    const labels = await dogs.evaluateAll(nodes =>
      nodes.map(node => node.getAttribute('aria-label') ?? '')
    );
    const labelCounts = new Map<string, number>();
    for (const label of labels) labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
    const lastLabel = [...labels].reverse().find(label => label && labelCounts.get(label) === 1);
    expect(lastLabel).toBeTruthy();
    const callName = lastLabel!.replace(/^Select /, '');
    await search.fill(callName);
    const dog = page.getByRole('checkbox', { name: lastLabel!, exact: true });
    await expect(dog).toBeVisible();
    // MYK9-485 put the 44px touch floor on the WRAPPER around the checkbox, on
    // purpose: sizing the control itself painted a 44px square around a 16px
    // tick. Measure the hit area the exhibitor actually taps, not the tick
    // (MYK9-545 — this assertion had never run, the count above failed first).
    const dogHitArea = dog.locator('..');
    for (const control of [
      search,
      dogHitArea,
      page.getByRole('button', { name: 'Clear search' }),
    ]) {
      const box = await control.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);
    }
    await dog.focus();
    await page.keyboard.press('Space');
    await expect(dog).toBeChecked();
    await search.fill('no-matching-dog-myk9-369');
    await expect(page.getByText(/No dogs match your search/)).toBeVisible();
    await expect(page.getByText('1 dog selected')).toBeVisible();
    await page.getByRole('button', { name: 'Clear search' }).click();
    await search.fill(callName);
    await expect(dog).toBeChecked();
    await page.screenshot({ path: testInfo.outputPath('filtered-selection.png'), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false
    );
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await search.fill(callName);
    await expect(dog).toBeChecked();
    await page.getByRole('button', { name: 'Save Draft', exact: true }).click();
    await page.getByLabel('Draft Title').fill('MYK9-369 search selection');
    await page.getByRole('dialog').getByRole('button', { name: 'Save Draft', exact: true }).click();
    await dog.click();
    await expect(dog).not.toBeChecked();
    await page.getByRole('button', { name: /Load Draft \(/ }).click();
    await page.getByText('MYK9-369 search selection', { exact: true }).click();
    await page.getByRole('button', { name: 'Load Selected Draft' }).click();
    await search.fill(callName);
    await expect(dog).toBeChecked();
  });
}
