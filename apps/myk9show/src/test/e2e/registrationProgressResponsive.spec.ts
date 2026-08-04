import { expect, test } from '@playwright/test';
import { signInAsExhibitor } from './helpers/testUsers';
import { LIVE_REGISTRATION_SHOW_ID } from './uat/shared/seededShows';

const VIEWPORTS = [
  { id: 'phone', width: 390, height: 844 },
  { id: 'tablet', width: 768, height: 1024 },
  { id: 'desktop', width: 1440, height: 900 },
] as const;

const THEMES = ['light', 'dark'] as const;
const STEP_LABELS = ['Select Dogs', 'Classes', 'Payment', 'Receipt'];

test.describe('exhibitor registration progress remains legible', () => {
  test.setTimeout(90_000);

  for (const viewport of VIEWPORTS) {
    for (const theme of THEMES) {
      test(`${viewport.id} / ${theme}`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.emulateMedia({ colorScheme: theme });
        await page.addInitScript(colorScheme => {
          localStorage.setItem('myK9Q_settings', JSON.stringify({ theme: colorScheme }));
        }, theme);

        const registrationPath = `/shows/${LIVE_REGISTRATION_SHOW_ID}/register`;
        await signInAsExhibitor(page, registrationPath);
        await page.goto(registrationPath, { waitUntil: 'domcontentloaded' });

        await expect(page.getByTestId('registration-wizard-header')).toBeVisible();
        const stepList = page.getByTestId('wizard-step-list');
        await expect(stepList).toBeVisible();

        for (const label of STEP_LABELS) {
          await expect(page.getByRole('button', { name: new RegExp(`^${label}`) })).toBeVisible();
        }

        const horizontalOverflow = await page.evaluate(() =>
          Math.max(0, document.documentElement.scrollWidth - window.innerWidth)
        );
        const stepListOverflow = await stepList.evaluate(element =>
          Math.max(0, element.scrollWidth - element.clientWidth)
        );

        expect(horizontalOverflow, `${viewport.id}/${theme}: document overflow`).toBe(0);
        expect(stepListOverflow, `${viewport.id}/${theme}: stepper overflow`).toBe(0);

        await expect(page.getByRole('button', { name: /^Select Dogs \(current\)$/ })).toHaveAttribute(
          'aria-current',
          'step'
        );
        await page.screenshot({
          path: testInfo.outputPath(`registration-progress-${viewport.id}-${theme}.png`),
          fullPage: true,
        });
      });
    }
  }
});
