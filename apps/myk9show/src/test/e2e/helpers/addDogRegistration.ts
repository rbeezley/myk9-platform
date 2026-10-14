import type { Locator, Page } from '@playwright/test';

/**
 * A registration number no earlier run has used. Add Dog now asks the server
 * whether a number is already taken (MYK9-1162), so a fixed number would block
 * the second run with "already registered to another dog". Letters and digits
 * only, within the 64-character limit.
 */
export function uniqueRegistrationNumber(prefix = 'E2E'): string {
  return `${prefix}${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

/**
 * Add Dog opens on its Registration step (MYK9-1162): registry and number,
 * "Find dog", then the rest of the registration, "Save and continue". The panel
 * moves to the Essential step afterwards, so call this first.
 *
 * `scope` is the Add Dog dialog (or the page, for the standalone panel); the
 * registry and breed pickers render their options outside it, on `page`.
 */
export async function addFirstRegistration(
  page: Page,
  scope: Locator | Page,
  options: { number?: string; registeredName?: string } = {}
): Promise<string> {
  const number = options.number ?? uniqueRegistrationNumber();
  await scope.locator('#organization').click();
  await page.getByRole('option', { name: /AKC \(American Kennel Club\)/i }).click();
  await scope.getByLabel(/Registration Number/i).fill(number);
  await scope.getByRole('button', { name: 'Find dog' }).click();
  await scope.getByLabel(/Registered Name/i).fill(options.registeredName ?? 'E2E Registered Dog');
  await scope.getByLabel(/Registered Breed/i).click();
  await page.getByPlaceholder('Search breeds…').fill('Golden Retriever');
  await page
    .getByRole('listbox', { name: 'Breeds' })
    .getByRole('option', { name: 'Golden Retriever' })
    .click();
  await scope.getByRole('button', { name: 'Save and continue' }).click();
  return number;
}

/** What the browser's POST looks like once the dog carries a registration. */
export const isDogCreateResponse = (r: {
  url(): string;
  request(): { method(): string };
}): boolean =>
  r.request().method() === 'POST' &&
  (r.url().includes('/rest/v1/rpc/create_dog_with_registrations') ||
    r.url().includes('/rest/v1/dogs'));
