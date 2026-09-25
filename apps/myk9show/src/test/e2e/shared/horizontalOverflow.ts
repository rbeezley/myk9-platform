import { expect, type Page } from '@playwright/test';

/**
 * 150% browser zoom on a 390px phone leaves 260 CSS pixels. Emulating the zoom
 * as a narrower viewport is what the MYK9-643 walk measured, and it is how the
 * zoom checks below reproduce it.
 */
export const PHONE_AT_150_PERCENT_ZOOM = { width: 260, height: 563 } as const;

/**
 * Asserts the document does not scroll sideways.
 *
 * Known answer first: a node 50px wider than the viewport must raise
 * `scrollWidth`, or the page is not scrolling on the document at all and the
 * real assertion would pass for the wrong reason.
 */
export async function expectNoHorizontalScroll(page: Page, context: string) {
  const measured = await page.evaluate(() => {
    const root = document.documentElement;
    const probe = document.createElement('div');
    probe.style.cssText = `position:absolute;left:0;top:0;height:1px;width:${root.clientWidth + 50}px`;
    document.body.appendChild(probe);
    const knownAnswer = root.scrollWidth >= root.clientWidth + 50;
    probe.remove();
    return { knownAnswer, scrollWidth: root.scrollWidth, clientWidth: root.clientWidth };
  });
  expect(measured.knownAnswer, `${context}: the overflow probe must be detectable`).toBe(true);
  expect(
    measured.scrollWidth,
    `${context}: scrollWidth ${measured.scrollWidth} vs viewport ${measured.clientWidth}`
  ).toBeLessThanOrEqual(measured.clientWidth);
}
