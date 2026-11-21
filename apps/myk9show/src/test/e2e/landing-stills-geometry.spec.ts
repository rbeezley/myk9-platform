import { expect, test, type Page } from '@playwright/test';
import { expectNoLandingSpills } from './helpers/landingGeometry';

/**
 * MYK9-2309: the steps that are not scenes keep one captured still each. Rendered geometry of those
 * stills and of the two-device scenes beside them, at a phone and at a laptop, for both stories:
 * the page never scrolls sideways, each still is drawn whole inside its column at its own shape and
 * at a size its words can be read, and the devices of a scene stack on the phone.
 * Hermetic: the anonymous landing page, no sign-in and no database.
 */

const STILLS = { club: 1, exhibitor: 3 } as const;

async function openLanding(page: Page) {
  await page.goto('/');
  await expect(page.locator('#top h1')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('#showday-dot')).toBeAttached({ timeout: 30000 });
}

async function loadEveryStill(page: Page) {
  const count = await page.locator('.lc-shot img').count();
  for (let i = 0; i < count; i += 1) {
    const img = page.locator('.lc-shot img').nth(i);
    await img.scrollIntoViewIfNeeded();
    await expect
      .poll(() => img.evaluate(el => (el as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
  }
}

for (const width of [390, 1280]) {
  test.describe(`stills and scenes @ ${width}`, () => {
    test.use({ viewport: { width, height: 900 } });

    for (const audience of ['club', 'exhibitor'] as const) {
      test(`${audience} story: no sideways scroll, each still whole and readable`, async ({
        page,
      }) => {
        await openLanding(page);
        if (audience === 'exhibitor') {
          await page.getByRole('button', { name: 'I’m entering a show' }).click();
          await expect(page.locator('#entries h3')).toHaveText('Enter in a few minutes');
        }
        await loadEveryStill(page);

        const report = await page.evaluate(() => {
          const stills = [...document.querySelectorAll<HTMLImageElement>('.lc-shot img')].map(
            img => {
              const box = img.getBoundingClientRect();
              const column = img.closest('.lc-main')!.getBoundingClientRect();
              return {
                shape: img.closest('.lc-shot')!.getAttribute('data-shape') as 'phone' | 'desktop',
                src: img.getAttribute('src'),
                left: box.left,
                right: box.right,
                width: box.width,
                height: box.height,
                columnLeft: column.left,
                columnRight: column.right,
                natural: img.naturalWidth / img.naturalHeight,
                // Every still is captured at twice its size, so this is the screen width it shows.
                shown: img.naturalWidth / 2,
              };
            }
          );
          return {
            stills,
            wide: document.documentElement.scrollWidth > document.documentElement.clientWidth,
            viewport: document.documentElement.clientWidth,
          };
        });

        expect(report.wide, 'the page scrolls sideways').toBe(false);
        expect(report.stills.length, 'stills on the page').toBe(STILLS[audience]);
        for (const still of report.stills) {
          const label = `${still.src}`;
          expect(still.left, label).toBeGreaterThanOrEqual(0);
          expect(still.right, label).toBeLessThanOrEqual(report.viewport);
          expect(still.left, `${label} leaves its column`).toBeGreaterThanOrEqual(
            still.columnLeft - 0.5
          );
          expect(still.right, `${label} leaves its column`).toBeLessThanOrEqual(
            still.columnRight + 0.5
          );
          // Drawn whole at its own shape, never stretched.
          // (Within 8%: the picture's 1px border is part of the box, which a wide, short one feels.)
          expect(Math.abs(still.width / still.height / still.natural - 1), label).toBeLessThan(
            0.08
          );
          // The words in a picture read at about two fifths of their size or more; a phone screen is drawn
          // at most 220px wide, a desktop window at most 440px.
          expect(still.width / still.shown, `${label} is drawn too small`).toBeGreaterThan(0.4);
          expect(still.width, label).toBeLessThanOrEqual(still.shape === 'phone' ? 221 : 441);
        }
        await expectNoLandingSpills(page, `${width}px ${audience} stills`);
      });
    }

    for (const audience of ['club', 'exhibitor'] as const) {
      test(`${audience} story: the devices of a scene stack on the phone, lead first, and sit inside the page`, async ({
        page,
      }) => {
        await openLanding(page);
        if (audience === 'exhibitor') {
          await page.getByRole('button', { name: 'I’m entering a show' }).click();
          await expect(page.locator('#entries h3')).toHaveText('Enter in a few minutes');
        }
        const scenes = await page.evaluate(() =>
          [...document.querySelectorAll('.tl-scene')].map(scene => {
            const devices = [...scene.querySelectorAll('.tl-scene-device')].map(device => {
              const box = device.getBoundingClientRect();
              return {
                kind: device.getAttribute('data-kind'),
                top: box.top,
                bottom: box.bottom,
                left: box.left,
                right: box.right,
              };
            });
            return {
              lead: scene.getAttribute('data-lead'),
              devices,
              viewport: document.documentElement.clientWidth,
            };
          })
        );
        expect(scenes.length, 'scenes on the page').toBeGreaterThan(0);
        const twoDevice = scenes.filter(scene => scene.devices.length === 2);
        expect(twoDevice.length, 'two-device scenes on the page').toBeGreaterThan(0);
        // The club leads with the desk and the exhibitor with the phone.
        const lead = audience === 'club' ? 'desk' : 'phone';
        for (const { devices, viewport, lead: sceneLead } of twoDevice) {
          expect(sceneLead).toBe(lead);
          // Found by what each device is, not by where it sits in the markup.
          const first = devices.find(device => device.kind === lead);
          const second = devices.find(device => device.kind !== lead);
          if (!first || !second) throw new Error(`a ${lead}-led scene has no ${lead} device`);
          if (width <= 480) {
            expect(second.top, 'the lead device is above the other').toBeGreaterThanOrEqual(
              first.bottom - 1
            );
          }
          for (const device of devices) {
            expect(device.left).toBeGreaterThanOrEqual(0);
            expect(device.right).toBeLessThanOrEqual(viewport);
          }
        }
      });
    }
  });
}
