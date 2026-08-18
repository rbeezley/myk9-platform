import { expect, test } from '@playwright/test';
import { signInAsSecretary } from '../shared/auth';
import { LIVE_SECRETARY_SHOW_ID } from '../shared/seededShows';

test('registration focus remains clear across desktop, history, and narrow layouts', async ({
  page,
}) => {
  await signInAsSecretary(page, `/shows/${LIVE_SECRETARY_SHOW_ID}/entry-management`);
  await expect(page.getByRole('searchbox', { name: 'Search all show registrations' })).toBeVisible({
    timeout: 30_000,
  });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.getByText('Focused registration', { exact: true })).toBeVisible();

  const queueRows = page
    .getByRole('list', { name: 'Registration work queue' })
    .getByRole('listitem');
  await expect(queueRows).not.toHaveCount(0);
  await expect(queueRows.first()).toHaveAttribute('aria-current', 'true');
  const offlineSearchTerm = (await queueRows.first().getAttribute('aria-label'))?.split(',')[0];
  const firstRegistrationSelection = queueRows.first().getByRole('checkbox');
  await firstRegistrationSelection.check();
  await expect(firstRegistrationSelection).toBeChecked();
  await queueRows.nth(1).click();
  await expect(queueRows.nth(1)).toHaveAttribute('aria-current', 'true');

  await page.goBack();
  await expect(queueRows.first()).toHaveAttribute('aria-current', 'true');
  await expect(firstRegistrationSelection).toBeChecked();
  await queueRows.nth(1).click();

  await page.setViewportSize({ width: 900, height: 1000 });
  await expect(page.getByRole('button', { name: 'Back to registrations' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to registrations' }).click();
  await expect(page.getByRole('list', { name: 'Registration work queue' })).toBeVisible();
  // Focus returns to the row's action — the row's only button — rather than to
  // the `listitem`, which carries no interactive role.
  await expect(queueRows.nth(1).getByRole('button')).toBeFocused();

  await page.context().setOffline(true);
  try {
    await page
      .getByRole('searchbox', { name: 'Search all show registrations' })
      .fill(offlineSearchTerm ?? 'registration');
    await expect(queueRows).not.toHaveCount(0);
    await expect(page.getByRole('button', { name: /Needs review/ })).toBeDisabled();
    await expect(page.getByRole('combobox', { name: 'Trial filter' })).toBeDisabled();
    await expect(page.getByText(/Search covers the whole show/i)).toBeVisible();
  } finally {
    await page.context().setOffline(false);
  }
});

test('the registration queue keeps every row inside a 768px tablet viewport (MYK9-57)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await signInAsSecretary(page, `/shows/${LIVE_SECRETARY_SHOW_ID}/entry-management`);
  await expect(page.getByRole('searchbox', { name: 'Search all show registrations' })).toBeVisible({
    timeout: 30_000,
  });

  const queue = page.getByRole('list', { name: 'Registration work queue' });
  const rows = queue.getByRole('listitem');
  await expect(rows).not.toHaveCount(0);
  await expect(rows.first().getByRole('button')).toBeVisible();

  // The queue card is `overflow-hidden` with no scrollable ancestor, so
  // anything past the right edge is unreachable rather than merely off-screen.
  const clipped = await queue.evaluate(node => {
    const viewportWidth = document.documentElement.clientWidth;
    return [...node.querySelectorAll('*')].filter(
      element => element.getBoundingClientRect().right > viewportWidth + 1
    ).length;
  });
  expect(clipped).toBe(0);

  const hiddenPerRow = await rows.evaluateAll(nodes =>
    nodes.map(node => node.scrollWidth - node.clientWidth)
  );
  expect(hiddenPerRow.every(hidden => hidden <= 1)).toBe(true);
});

test('Entry Management deep-links to the existing Check-in desk', async ({ page }) => {
  await signInAsSecretary(page, `/shows/${LIVE_SECRETARY_SHOW_ID}/entry-management`);
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('link', { name: 'Open Check-in desk' }).click();

  await expect(page).toHaveURL(
    new RegExp(`/shows/${LIVE_SECRETARY_SHOW_ID}/show-desk\\?tool=people-at-show`)
  );
  const toolsDialog = page.getByRole('dialog', { name: 'Show Desk tools' });
  await expect(toolsDialog).toBeVisible();
  const peopleAtShow = page.getByRole('button', { name: /People at show/i });
  await expect(peopleAtShow).toHaveAttribute('aria-expanded', 'true');
});
