/**
 * The header Actions menu, as a user drives it (MYK9-928).
 *
 * Every page-level action (Edit show, Edit trial, Add classes, ...) lives in the one
 * Actions menu in the app header, not in a button on the page. The trigger is labelled
 * "Actions" from `sm` up and icon-only below it, so the stable handle is its test id.
 */

import { expect, type Locator, type Page } from '@playwright/test';

export function actionsTrigger(page: Page): Locator {
  return page.getByTestId('header-actions-trigger');
}

/** Open the header Actions menu and return it. */
export async function openActionsMenu(page: Page): Promise<Locator> {
  const trigger = actionsTrigger(page);
  await expect(trigger).toBeVisible({ timeout: 15000 });
  await trigger.click();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  return menu;
}

/** Open the header Actions menu and choose one item by its accessible name. */
export async function chooseAction(page: Page, name: string | RegExp): Promise<void> {
  const menu = await openActionsMenu(page);
  const item = menu.getByRole('menuitem', { name });
  await expect(item).toBeVisible();
  await item.click();
}
