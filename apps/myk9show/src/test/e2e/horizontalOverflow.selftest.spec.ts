import { expect, test } from '@playwright/test';
import {
  expectNoHorizontalOverflow,
  measureHorizontalOverflow,
} from './helpers/horizontalOverflow';

/**
 * Known-answer checks for the shared overflow helper (MYK9-1068). A geometry
 * harness that cannot fail reports its own bugs as a clean app, so it must go
 * red on a page built to overflow, stay green on one that fits, and name the
 * element responsible.
 */

const VIEWPORT = { width: 360, height: 640 } as const;

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
});

test('passes a page that fits, even with a vertical scrollbar', async ({ page }) => {
  await page.setContent(
    '<body style="margin:0"><div style="width:100%;height:3000px">tall, not wide</div></body>'
  );
  await expectNoHorizontalOverflow(page, 'fits');
});

test('fails a page whose content is wider than the viewport, naming the offender', async ({
  page,
}) => {
  await page.setContent(
    '<body style="margin:0"><div class="too-wide" style="width:456px">wide</div></body>'
  );
  const measured = await measureHorizontalOverflow(page);
  expect(measured.docOverflow).toBeGreaterThan(90);
  expect(measured.offenders[0]).toContain('div.too-wide');

  await expect(expectNoHorizontalOverflow(page, 'wide')).rejects.toThrow(
    /wide: document scrolls horizontally by \d+px \(widest: div\.too-wide/
  );
});

test('fails when only <body> scrolls sideways', async ({ page }) => {
  await page.setContent(
    '<html style="overflow:hidden"><body style="margin:0;overflow-x:auto;height:100vh">' +
      '<div class="body-wide" style="width:500px">wide</div></body></html>'
  );
  const measured = await measureHorizontalOverflow(page);
  expect(measured.bodyOverflow).toBeGreaterThan(100);

  await expect(expectNoHorizontalOverflow(page, 'body')).rejects.toThrow(
    /body: body scrolls horizontally by \d+px/
  );
});
