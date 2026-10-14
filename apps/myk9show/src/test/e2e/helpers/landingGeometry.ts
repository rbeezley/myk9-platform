import { expect, type Page } from '@playwright/test';

/**
 * Every in-flow element on the landing page fits inside its parent's content box and the
 * screen. Absolutely positioned decorations and the timeline rail are exempt; a parent that
 * clips (overflow other than visible) owns its own overflow. Shared by the guest and
 * signed-in landing specs.
 */
export async function expectNoLandingSpills(page: Page, context: string) {
  const spills = await page.evaluate(() => {
    const out: string[] = [];
    const vw = document.documentElement.clientWidth;
    let checked = 0;
    for (const el of document.querySelectorAll<HTMLElement>('.landing-v2 *')) {
      if (el.closest('svg, .lc-rail')) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.position === 'absolute' || cs.position === 'fixed') continue;
      const r = el.getBoundingClientRect();
      if (!r.width) continue;
      checked++;
      const parent = el.parentElement!;
      const pcs = getComputedStyle(parent);
      const pr = parent.getBoundingClientRect();
      const left = pr.left + parseFloat(pcs.paddingLeft) + parseFloat(pcs.borderLeftWidth);
      const right = pr.right - parseFloat(pcs.paddingRight) - parseFloat(pcs.borderRightWidth);
      const clips = pcs.overflowX !== 'visible';
      const label = `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}`;
      if (r.right > vw + 0.5 || r.left < -0.5) out.push(`${label} leaves the screen`);
      else if (!clips && (r.right - right > 1.5 || left - r.left > 1.5))
        out.push(`${label} is ${Math.round(r.width)}px in a ${Math.round(right - left)}px box`);
    }
    return { out: [...new Set(out)], checked };
  });
  expect(spills.checked, `${context}: measured nothing`).toBeGreaterThan(100);
  expect(spills.out, context).toEqual([]);
}

/**
 * The landing header's links each sit on one line, fit the screen and keep a 44x44px
 * target (the logo link included, even when the logo itself is cropped), and the page
 * never scrolls sideways.
 */
export async function expectHeaderFits(page: Page) {
  const targets = await page.locator('.landing-v2 .l-hdr a').evaluateAll(els =>
    els
      .filter(el => getComputedStyle(el).display !== 'none')
      .map(el => {
        const range = document.createRange();
        range.selectNodeContents(el);
        const tops = new Set(
          [...range.getClientRects()].filter(r => r.height).map(r => Math.round(r.top))
        );
        const box = el.getBoundingClientRect();
        return {
          text: (el as HTMLElement).innerText || el.getAttribute('aria-label') || 'logo',
          isButton: el.classList.contains('l-btn'),
          isPrimary: el.classList.contains('l-btn-primary'),
          lines: tops.size,
          right: box.right,
          // Rounded: the page's fade-in transform leaves sub-pixel sizes like 43.999996.
          width: Math.round(box.width),
          height: Math.round(box.height),
        };
      })
  );
  // How many buttons show depends on sign-in (no Sign in), header width (no Find a show
  // when narrow) and the story switch (Add your club or Create account); a primary action
  // is always there.
  expect(
    targets.some(t => t.isPrimary),
    'the header has no primary action'
  ).toBe(true);
  const width = page.viewportSize()!.width;
  for (const t of targets) {
    if (t.isButton) expect(t.lines, `"${t.text}" wraps`).toBe(1);
    expect(t.right, `"${t.text}" overflows`).toBeLessThanOrEqual(width);
    expect(t.height, `"${t.text}" is under 44px tall`).toBeGreaterThanOrEqual(44);
    expect(t.width, `"${t.text}" is under 44px wide`).toBeGreaterThanOrEqual(44);
  }
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth, 'page scrolls sideways').toBeLessThanOrEqual(width);
}
