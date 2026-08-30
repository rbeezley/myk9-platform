import { expect, test } from '@playwright/test';
import { signInAsExhibitor } from './helpers/testUsers';

/**
 * MYK9-124 / EUX-2026-07-30-04 — My Shows must reflow, not clip, under browser
 * zoom.
 *
 * WHAT THIS SPEC IS. A regression guard for the zoom reflow contract, not a
 * reproduction of the original report. Run against `main` at 4465fe1d5 BEFORE
 * any fix, all three zoom levels already passed: the seeded exhibitor renders a
 * single secondary action per card (~158px inside a 672px card), nothing on the
 * page was truncated, and the document never scrolled horizontally. Two of the
 * three reported symptoms — "entry action cut off at the right edge" and
 * "Current Fees clipped" — did not reproduce. See the MYK9-124 PR for the
 * measurements and for what remains open (the dog strip).
 *
 * It is kept because the contract it asserts was genuinely unguarded, and
 * because the CSS hazard behind the original report is real even though this
 * data does not trigger it: every Button carries `whitespace-nowrap`, an
 * expanded card can render up to five secondary actions, and
 * `.myk9-entries-card` is `overflow:hidden`. A row that outgrows its card is
 * therefore CLIPPED — no scrollbar, no ellipsis, no hint the action exists.
 *
 * HOW ZOOM IS EMULATED. By shrinking the CSS-pixel viewport, because that is
 * what a browser does: 125% zoom on a 1440px window leaves the page 1152 CSS px
 * wide at unchanged CSS lengths. Playwright cannot drive the real zoom control,
 * and `Emulation.setPageScaleFactor` is pinch-zoom — it rescales the rendered
 * surface without re-running layout, so it cannot observe a reflow bug at all.
 *
 * Why zoom is the interesting axis: the action rows wrapped only inside
 * `@media (max-width: 768px)`, so 200% zoom (720 CSS px) crossed back into the
 * mobile block and looked correct, while 125–150% sat in an unwrapped band.
 * A breakpoint can never cover zoom — zoom is continuous, breakpoints are not.
 */
const PHYSICAL = { width: 1440, height: 900 } as const;

const ZOOM_LEVELS = [1.25, 1.5, 2] as const;

const cssViewportFor = (zoom: number) => ({
  width: Math.round(PHYSICAL.width / zoom),
  height: Math.round(PHYSICAL.height / zoom),
});

test.describe('My Shows reflows under browser zoom', () => {
  test.setTimeout(120_000);

  for (const zoom of ZOOM_LEVELS) {
    const viewport = cssViewportFor(zoom);

    test(`${zoom * 100}% zoom (${viewport.width}x${viewport.height} CSS px)`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize(viewport);

      await signInAsExhibitor(page, '/exhibitor/entries');
      await page.goto('/exhibitor/entries', { waitUntil: 'networkidle' });
      await expect(page.getByRole('heading', { name: 'My Shows', level: 1 })).toBeVisible({
        timeout: 15_000,
      });

      // The secondary action row is the worst case for clipping and is
      // collapsed by default, so a spec that never expands a card would assert
      // nothing. A bounded prefix keeps the run fast — the seeded exhibitor has
      // dozens of entries.
      const CARDS_TO_EXPAND = 4;
      const detailToggles = page.getByRole('button', { name: /^Entered Classes \(\d+\)$/ });
      const toggleCount = Math.min(await detailToggles.count(), CARDS_TO_EXPAND);
      for (let i = 0; i < toggleCount; i += 1) {
        const toggle = detailToggles.nth(i);
        await toggle.scrollIntoViewIfNeeded();
        await toggle.click();
      }
      expect(
        toggleCount,
        'no expandable entry cards found — spec would be vacuous'
      ).toBeGreaterThan(0);

      await expect(page.locator('.myk9-entries-action-buttons').first()).toBeVisible();

      const cards = page.locator('.myk9-entries-card');
      expect(
        await cards.count(),
        'seeded exhibitor must have at least one entry card, or this spec proves nothing'
      ).toBeGreaterThan(0);

      // 1. No two-dimensional hunting: the document must not scroll sideways.
      //    The dog strip is deliberately an `overflow-x-auto` scroller, so it is
      //    excluded by construction — this asserts the PAGE stays one-
      //    dimensional, not that no element anywhere scrolls.
      const documentOverflow = await page.evaluate(() =>
        Math.max(0, document.documentElement.scrollWidth - window.innerWidth)
      );
      expect(documentOverflow, `${zoom * 100}%: document scrolls horizontally`).toBe(0);

      // 2. An action button whose box escapes the `overflow:hidden` card is
      //    invisible to the user but still laid out, so compare geometry rather
      //    than trusting visibility — `toBeVisible()` would not catch this.
      const clipped = await page.evaluate(() => {
        const escapes: string[] = [];
        for (const card of document.querySelectorAll('.myk9-entries-card')) {
          const cardBox = card.getBoundingClientRect();
          for (const row of card.querySelectorAll('.myk9-entries-action-buttons')) {
            for (const button of row.children) {
              const box = button.getBoundingClientRect();
              // 1px tolerance absorbs sub-pixel layout rounding.
              if (box.right > cardBox.right + 1 || box.left < cardBox.left - 1) {
                escapes.push(
                  `${(button.textContent || '').trim().slice(0, 40)} ` +
                    `(button ${Math.round(box.left)}–${Math.round(box.right)} vs ` +
                    `card ${Math.round(cardBox.left)}–${Math.round(cardBox.right)})`
                );
              }
            }
          }
        }
        return escapes;
      });
      expect(clipped, `${zoom * 100}%: action buttons clipped by their card`).toEqual([]);

      // 3. Action rows wrap rather than overflow their own box.
      const rowOverflow = await page.evaluate(() =>
        Array.from(document.querySelectorAll('.myk9-entries-action-buttons'))
          .map(row => Math.max(0, row.scrollWidth - row.clientWidth))
          .filter(overflow => overflow > 1)
      );
      expect(rowOverflow, `${zoom * 100}%: action row overflows its own box`).toEqual([]);

      // 4. The rows must actually be wrapping. This is the one assertion that
      //    fails on the unfixed tree regardless of how many buttons the seed
      //    data happens to render, so it is what makes this spec a real guard
      //    rather than a description of the current seed.
      const wrapModes = await page.evaluate(() => [
        ...new Set(
          Array.from(document.querySelectorAll('.myk9-entries-action-buttons')).map(
            row => getComputedStyle(row).flexWrap
          )
        ),
      ]);
      expect(wrapModes, `${zoom * 100}%: action rows are not set to wrap`).toEqual(['wrap']);

      // 5. Money stays readable — the report claimed "Current Fees clipped".
      //    Below 721px `CompactStatsRow` collapses the stat grid behind a
      //    summary toggle, and a `display:none` element reports zero width, so
      //    a truncation check alone would pass vacuously at 200%. Expand first,
      //    then require a real painted box before judging truncation.
      const statsToggle = page.locator('button[aria-controls="exhibitor-stat-cards"]');
      if ((await statsToggle.count()) > 0 && (await statsToggle.first().isVisible())) {
        if ((await statsToggle.first().getAttribute('aria-expanded')) !== 'true') {
          await statsToggle.first().click();
        }
      }
      // "Entry fees" since the four-card stat grid became a single fee strip
      // (#1862). This spec is not in the PR-gating set, so the rename broke it
      // silently — hence the assertion below reads the shipped label.
      await expect(page.getByText('Entry fees', { exact: true }).first()).toBeVisible();

      const fees = await page.evaluate(() => {
        const label = Array.from(document.querySelectorAll('*')).find(
          el => el.children.length === 0 && el.textContent?.trim() === 'Entry fees'
        );
        if (!label) return { found: false, painted: false, truncated: true };
        // Judge the whole stat card, not just the label: the amount lives in a
        // sibling node and is the part that actually matters.
        const card = label.closest('button') ?? label.parentElement!;
        const box = card.getBoundingClientRect();
        const truncated = Array.from(card.querySelectorAll('*')).some(
          el => el.children.length === 0 && el.scrollWidth > el.clientWidth + 1
        );
        return { found: true, painted: box.width > 0 && box.height > 0, truncated };
      });
      expect(fees.found, `${zoom * 100}%: "Entry fees" not rendered`).toBe(true);
      expect(fees.painted, `${zoom * 100}%: "Entry fees" has no painted box`).toBe(true);
      expect(fees.truncated, `${zoom * 100}%: "Entry fees" card truncates its text`).toBe(false);

      // 6. "Add Dog" must be on screen without scrolling the dog rail
      //    (MYK9-124). It used to be the rail's last child, so with 3+ dogs at
      //    this zoom it sat past the right edge behind a `hide-scrollbar`
      //    container — reachable only by a scroll gesture with no scrollbar to
      //    suggest it. `toBeVisible()` does NOT catch that: an element scrolled
      //    outside an overflow container is still "visible" to Playwright.
      //    Compare geometry against the viewport instead.
      const addDog = page.getByRole('button', { name: /add dog/i });
      if ((await addDog.count()) > 0) {
        const onScreen = await addDog.first().evaluate(element => {
          const box = element.getBoundingClientRect();
          return (
            box.width > 0 && box.height > 0 && box.left >= -1 && box.right <= window.innerWidth + 1
          );
        });
        expect(onScreen, `${zoom * 100}%: "Add Dog" is not on screen`).toBe(true);
      }

      // 7. Keyboard focus stays visible — a wrapped control that lands outside
      //    the viewport would still be reachable but not findable.
      const firstButton = page.locator('.myk9-entries-action-buttons > *').first();
      await firstButton.focus();
      await expect(firstButton).toBeFocused();
      const focusInView = await firstButton.evaluate(element => {
        const box = element.getBoundingClientRect();
        return box.right <= window.innerWidth + 1 && box.left >= -1;
      });
      expect(focusInView, `${zoom * 100}%: focused action sits outside the viewport`).toBe(true);

      await page.screenshot({
        path: testInfo.outputPath(`my-entries-zoom-${zoom * 100}.png`),
        fullPage: true,
      });
    });
  }
});
