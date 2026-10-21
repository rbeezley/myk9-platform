import { expect, test, type Page } from '@playwright/test';

// MYK9-1279: the app opens light until the person chooses. A dark-OS visitor with nothing saved
// sees the same palette on the homepage, Find Shows, sign-in and sign-up; a saved choice wins.
test.use({ colorScheme: 'dark' });

const SURFACES = ['/', '/shows', '/sign-in', '/sign-up'];

async function htmlState(page: Page) {
  // Settle past boot: ThemeProvider applies the same trio on mount.
  await page.waitForLoadState('load');
  await page.waitForTimeout(800);
  return page.evaluate(() => ({
    classes: document.documentElement.className,
    colorScheme: document.documentElement.style.colorScheme,
  }));
}

test('dark OS control: the browser reports dark', async ({ page }) => {
  await page.goto('/');
  expect(await page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches)).toBe(true);
});

for (const path of SURFACES) {
  test(`dark OS, nothing saved: ${path} renders light`, async ({ page }) => {
    await page.goto(path);
    const state = await htmlState(page);
    expect(state.classes).toContain('theme-light');
    expect(state.classes).not.toContain('theme-dark');
    expect(state.classes.split(/\s+/)).not.toContain('dark');
    expect(state.colorScheme).toBe('light');
  });
}

test('dark OS, System saved: /shows follows the OS', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'myK9Q_settings',
      JSON.stringify({ state: { settings: { theme: 'auto' } } })
    );
    localStorage.setItem('theme', 'system');
  });
  await page.goto('/shows');
  const state = await htmlState(page);
  expect(state.classes).toContain('theme-dark');
  expect(state.classes.split(/\s+/)).toContain('dark');
});

test('dark OS, Dark saved: /shows renders dark', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'myK9Q_settings',
      JSON.stringify({ state: { settings: { theme: 'dark' } } })
    );
    localStorage.setItem('theme', 'dark');
  });
  await page.goto('/shows');
  const state = await htmlState(page);
  expect(state.classes).toContain('theme-dark');
  expect(state.colorScheme).toBe('dark');
});
