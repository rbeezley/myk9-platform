import { expect, type Page } from '@playwright/test';

/**
 * The one definition of "this page scrolls sideways" for E2E geometry checks
 * (MYK9-1068). Seven specs used to carry their own copy, and three of them
 * compared against `window.innerWidth`, which includes a classic vertical
 * scrollbar and so could miss up to ~15px of real overflow.
 *
 * Overflow is `scrollWidth - clientWidth` on both `<html>` and `<body>`: either
 * one scrolling is a sideways pan. 1px of tolerance absorbs sub-pixel rounding.
 * `horizontalOverflow.selftest.spec.ts` holds the known-answer checks.
 */

const TOLERANCE_PX = 1;

export interface HorizontalOverflow {
  docOverflow: number;
  bodyOverflow: number;
  /** Up to three elements whose right edge passes the viewport, widest first. */
  offenders: string[];
}

export async function measureHorizontalOverflow(page: Page): Promise<HorizontalOverflow> {
  return page.evaluate(() => {
    const de = document.documentElement;
    const offenders = Array.from(document.querySelectorAll<HTMLElement>('body *'))
      .map(el => ({ el, right: el.getBoundingClientRect().right }))
      .filter(({ right }) => right > de.clientWidth + 1)
      .sort((a, b) => b.right - a.right)
      .slice(0, 3)
      .map(
        ({ el, right }) =>
          `${el.tagName.toLowerCase()}.${String(el.className || '').slice(0, 60)} (right ${Math.round(right)})`
      );
    return {
      docOverflow: de.scrollWidth - de.clientWidth,
      bodyOverflow: document.body.scrollWidth - document.body.clientWidth,
      offenders,
    };
  });
}

export async function expectNoHorizontalOverflow(page: Page, label = 'page'): Promise<void> {
  const { docOverflow, bodyOverflow, offenders } = await measureHorizontalOverflow(page);
  const widest = offenders.join(' | ') || 'none found';
  expect(
    docOverflow,
    `${label}: document scrolls horizontally by ${docOverflow}px (widest: ${widest})`
  ).toBeLessThanOrEqual(TOLERANCE_PX);
  expect(
    bodyOverflow,
    `${label}: body scrolls horizontally by ${bodyOverflow}px (widest: ${widest})`
  ).toBeLessThanOrEqual(TOLERANCE_PX);
}
