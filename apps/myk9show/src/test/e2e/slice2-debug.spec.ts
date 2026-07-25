/** TEMPORARY debug spec — delete with the evidence spec. */
import { test } from '@playwright/test';
import { signInAsTestUser } from './helpers/testUsers';

test('debug career switch', async ({ page }) => {
  await signInAsTestUser(page, 'DEMO_EXHIBITOR');
  await page.goto('/dogs');
  const dogLink = page
    .getByRole('link')
    .filter({ has: page.getByRole('heading', { level: 3 }) })
    .first();
  await dogLink.waitFor({ state: 'visible', timeout: 20000 });
  await dogLink.click();
  await page.getByRole('heading', { level: 1 }).waitFor();

  const tablists = await page.getByRole('tablist').count();
  console.log('TABLIST COUNT:', tablists);

  await page
    .getByRole('tablist', { name: 'Dog details section' })
    .getByRole('tab', { name: 'Career' })
    .click();
  await page.waitForTimeout(2500);

  const info = await page.evaluate(() => {
    const nav = document.querySelector('[aria-label="Dog details section"]');
    const tabs = nav
      ? Array.from(nav.querySelectorAll('[role="tab"]')).map(t => ({
          text: t.textContent,
          ariaSelected: t.getAttribute('aria-selected'),
          dataState: t.getAttribute('data-state'),
        }))
      : null;
    const navs = document.querySelectorAll('[aria-label="Dog details section"]');
    const styleOf = (el: Element | null) =>
      el
        ? {
            color: getComputedStyle(el).color,
            borderBottomColor: getComputedStyle(el).borderBottomColor,
            classes: (el.getAttribute('class') ?? '').slice(0, 120),
          }
        : null;
    const firstNavTabs = navs[0]
      ? Array.from(navs[0].querySelectorAll('[role="tab"]')).map(t => ({
          text: t.textContent,
          ariaSelected: t.getAttribute('aria-selected'),
          ...styleOf(t),
        }))
      : null;
    return {
      url: window.location.search,
      navCount: navs.length,
      tabs,
      firstNavTabs,
      hasCareerContent: !!document.querySelector('[aria-label="Career view"]'),
      hasAddRegistration: !!Array.from(document.querySelectorAll('button')).find(b =>
        b.textContent?.includes('Add New Registration')
      ),
    };
  });
  console.log('DEBUG:', JSON.stringify(info, null, 2));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.evaluate(() => localStorage.setItem('theme', 'dark'));
  await page.reload();
  await page
    .getByRole('tablist', { name: 'Dog details section' })
    .getByRole('tab', { name: 'Career' })
    .click();
  await page.getByRole('tab', { name: 'Competitions' }).waitFor({ timeout: 15000 });
  await page.waitForTimeout(1500);
  await page.screenshot({
    path: `${process.env.EVIDENCE_DIR ?? 'evidence-slice2'}/debug-dark-career-settled.png`,
  });
});
