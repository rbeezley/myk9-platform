import { expect, test } from '@playwright/test';

type Rgb = [number, number, number];

function luminance([r, g, b]: Rgb) {
  return [r, g, b]
    .map(channel => channel / 255)
    .map(channel => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
}

function contrast(first: Rgb, second: Rgb) {
  const lighter = Math.max(luminance(first), luminance(second));
  const darker = Math.min(luminance(first), luminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

function parseRgb(value: string): Rgb {
  const match = value.match(/rgba?\((\d+),?\s*(\d+),?\s*(\d+)/);
  if (!match) throw new Error(`Expected an RGB color, got ${value}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

test.describe('AppToaster rendered accessibility', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`rich-color variants meet AA and close controls have a 44px hit area in ${theme}`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.goto('/shows');
      await page.evaluate(async () => {
        const sonnerUrl = performance
          .getEntriesByType('resource')
          .map(entry => entry.name)
          .find(url => url.includes('/node_modules/.vite/deps/sonner.js'));
        if (!sonnerUrl) throw new Error('The app did not load Sonner');
        const { toast } = await import(sonnerUrl);
        toast.success('Measurement probe', { duration: Infinity });
      });
      const toaster = page.locator('[data-sonner-toaster].myk9-sonner-a11y');
      await expect(toaster).toBeAttached();

      const measurements = await toaster.evaluate(element => {
        const variants = ['success', 'info', 'warning', 'error'];
        return variants.map(variant => {
          const toast = document.createElement('div');
          toast.dataset.sonnerToast = '';
          toast.dataset.styled = 'true';
          toast.dataset.type = variant;
          const close = document.createElement('button');
          close.dataset.closeButton = '';
          close.type = 'button';
          toast.append(close);
          element.append(toast);
          const toastStyle = getComputedStyle(toast);
          const closeRect = close.getBoundingClientRect();
          return {
            variant,
            background: toastStyle.backgroundColor,
            color: toastStyle.color,
            closeWidth: closeRect.width,
            closeHeight: closeRect.height,
          };
        });
      });

      for (const measurement of measurements) {
        expect(
          contrast(parseRgb(measurement.color), parseRgb(measurement.background)),
          `${theme} ${measurement.variant} toast contrast`
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          measurement.closeWidth,
          `${theme} ${measurement.variant} close width`
        ).toBeGreaterThanOrEqual(44);
        expect(
          measurement.closeHeight,
          `${theme} ${measurement.variant} close height`
        ).toBeGreaterThanOrEqual(44);
      }
    });
  }

  test('the rendered Sonner close control mutates the toast state when activated', async ({
    page,
  }) => {
    await page.goto('/shows');
    await page.evaluate(async () => {
      const sonnerUrl = performance
        .getEntriesByType('resource')
        .map(entry => entry.name)
        .find(url => url.includes('/node_modules/.vite/deps/sonner.js'));
      if (!sonnerUrl) throw new Error('The app did not load Sonner');
      const { toast } = await import(sonnerUrl);
      toast.success('Close me', { duration: Infinity });
    });

    const toast = page.locator('[data-sonner-toast]').filter({ hasText: 'Close me' });
    await expect(toast).toBeVisible();
    await toast.getByRole('button', { name: /close toast/i }).click();
    await expect(toast).toHaveCount(0);
  });
});
