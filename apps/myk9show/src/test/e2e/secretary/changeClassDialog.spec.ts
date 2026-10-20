import { expect, test, type Locator } from '@playwright/test';
import { signInAsSecretary } from '../uat/shared/auth';
import { installSecretaryFixture, SECRETARY_FIXTURE_SHOW_ID } from '../helpers/secretaryFixture';
import { CHANGE_CLASS_IDS } from '../helpers/secretaryChangeClassRows';

/**
 * MYK9-1265: on the Overview, "Change class" opened a dialog whose "Select class"
 * dropdown showed no options. Hermetic show (see secretaryChangeClassRows.ts); the
 * options must be VISIBLE and reachable in the real browser, not just present in the DOM.
 *
 * A disabled item is pointer-events:none, which `elementFromPoint` skips, so it cannot pass
 * the uncovered check; it must still be visible and inside the viewport.
 */
async function expectReachable(option: Locator, { disabled = false } = {}) {
  await expect(option).toBeVisible();
  const reachable = await option.evaluate(el => {
    const box = el.getBoundingClientRect();
    const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return {
      inViewport:
        box.width > 0 &&
        box.height > 0 &&
        box.left >= 0 &&
        box.top >= 0 &&
        box.right <= window.innerWidth &&
        box.bottom <= window.innerHeight,
      uncovered: top !== null && (el === top || el.contains(top)),
    };
  });
  expect(reachable, await option.innerText()).toEqual({ inViewport: true, uncovered: !disabled });
}

test('Change class from the Overview lists every open class, a full one disabled', async ({
  page,
}) => {
  await installSecretaryFixture(page, { changeClass: true });
  await signInAsSecretary(
    page,
    `/shows/${SECRETARY_FIXTURE_SHOW_ID}?focus=${CHANGE_CLASS_IDS.noviceA}`
  );

  const changeClass = page.getByRole('button', { name: /^Change class/ }).first();
  await expect(changeClass).toBeVisible({ timeout: 30_000 });
  await changeClass.click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/^Current class: Buried Novice/)).toBeVisible();
  await dialog.getByRole('combobox').click();

  for (const name of [/^Buried Advanced/, /^Buried Excellent/, /^Interior Advanced/]) {
    await expectReachable(page.getByRole('option', { name }));
  }
  const master = page.getByRole('option', { name: /^Buried Master/ });
  await expectReachable(master, { disabled: true });
  await expect(master).toBeDisabled();
  await expect(master).toContainText('Full');
  // The other trial's classes are offered, labelled with their trial.
  await expect(page.getByRole('option', { name: /Saturday Trial 2/ })).toHaveCount(2);
});
