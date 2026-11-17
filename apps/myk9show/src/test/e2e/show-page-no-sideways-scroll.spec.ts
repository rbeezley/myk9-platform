import { expect, test } from '@playwright/test';
import { installSharedStagingWriteGuard } from './helpers/sharedStagingWriteGuard';
import { signInAsExhibitor, signInAsSecretary } from './helpers/testUsers';
import { expectNoHorizontalOverflow } from './helpers/horizontalOverflow';

/**
 * The exhibitor's show page must not pan sideways on a phone (MYK9-1192).
 * At 390x844 `/shows/<id>` measured scrollWidth 455. The tab strip scrolls
 * inside its own overflow-x-auto container; the real culprit was a schedule
 * row (WhereToBe) whose non-shrinking result chip pushed its chevron to x=455.
 * Only rendered geometry can see this.
 */

const SHOW_ID = 'dededede-0000-0000-0000-000000000010';
const PHONE = { width: 390, height: 844 } as const;
/** A seeded class of the Classic show; focusing it opens its class panel. */
const FOCUSED_CLASS_ID = 'dec1a55e-0000-0000-0000-000000000033';

test('exhibitor show page has no horizontal scroll at 390px (MYK9-1192)', async ({ page }) => {
  await installSharedStagingWriteGuard(page, { strictRpcWrites: true });
  await page.setViewportSize(PHONE);
  await signInAsExhibitor(page, `/shows/${SHOW_ID}`);
  await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(1500);
  // Positive control: without a rendered schedule row the width check proves nothing.
  await expect(page.getByRole('heading', { name: 'Where to be & when' })).toBeVisible();
  await expect(page.getByLabel(/^Armband /).first()).toBeVisible();

  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
    'document scrollWidth must fit the 390px viewport'
  ).toBeLessThanOrEqual(PHONE.width);
  await expectNoHorizontalOverflow(page, 'exhibitor show page');
});

/**
 * The secretary's Overview must not pan sideways on a phone either (MYK9-1322). At 375px with a
 * class focused it measured scrollWidth 423: the stacked cockpit grid had no explicit column, so
 * its one track took the min-content of the focused class's one-line "Class work" links (since replaced by the Actions menu, MYK9-1796).
 */
test('secretary Overview with a class focused has no horizontal scroll at 375px (MYK9-1322)', async ({
  page,
}) => {
  const SMALL_PHONE = { width: 375, height: 812 } as const;
  // Default guard: strict mode would also refuse the secretary page's read RPCs
  // (get_show_officials, get_secretary_live_entry_count) and render a partial page.
  await installSharedStagingWriteGuard(page);
  await page.setViewportSize(SMALL_PHONE);
  await signInAsSecretary(page, `/shows/${SHOW_ID}?focus=${FOCUSED_CLASS_ID}`);
  await page.goto(`/shows/${SHOW_ID}?focus=${FOCUSED_CLASS_ID}`);
  await page.waitForLoadState('networkidle').catch(() => undefined);
  // Positive control: the focused class panel (its Actions menu and inline settings fields) rendered.
  await expect(page.getByRole('button', { name: /^Actions for (?!#)/ })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId('focused-class-header')).toBeVisible();
  await page.waitForTimeout(1500);

  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
    'document scrollWidth must fit the 375px viewport'
  ).toBeLessThanOrEqual(SMALL_PHONE.width);
  await expectNoHorizontalOverflow(page, 'secretary Overview');

  // Inside the page, every inline settings field stays within the header card (the walk's second
  // finding: values ran past the card's right edge once the column narrowed).
  const settings = page.getByTestId('focused-class-header');
  const card = await settings.boundingBox();
  expect(card, 'class header card must render').not.toBeNull();
  const overruns = await settings.evaluate(el => {
    const edge = el.getBoundingClientRect().right;
    return [...el.querySelectorAll('dd *')]
      .filter(
        c => c.getBoundingClientRect().width > 0 && c.getBoundingClientRect().right > edge + 0.5
      )
      .map(c => `${c.tagName} "${(c.textContent ?? '').trim().slice(0, 30)}"`);
  });
  expect(overruns, 'no settings field may pass the card edge').toEqual([]);
});

/**
 * Lunch orders and Judge supplies open in a 448px side panel, even on a wide window (MYK9-2100).
 * At 1280x800 the Lunch orders "Add person" form took its three-column layout from the window's
 * `sm:` breakpoint, so its content measured 456px in a 437px panel and "Add to list" ended past
 * the panel's right edge. Opening a tool reads only; nothing here adds a person.
 */
const SIDE_PANEL_SIZES = [
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
] as const;
/** `ready` is text only the tool's loaded content shows, never the panel title. */
const SIDE_PANEL_TOOLS = [
  { id: 'lunch-orders', ready: /Add to list/ },
  { id: 'judge-supplies', ready: /Pat Donovan/ },
] as const;

for (const size of SIDE_PANEL_SIZES) {
  for (const tool of SIDE_PANEL_TOOLS) {
    test(`${tool.id} side panel has no horizontal scroll at ${size.width}px (MYK9-2100)`, async ({
      page,
    }) => {
      await installSharedStagingWriteGuard(page);
      await page.setViewportSize(size);
      const path = `/shows/${SHOW_ID}?tool=${tool.id}`;
      await signInAsSecretary(page, path);
      await page.goto(path);
      const panel = page.getByRole('dialog').last();
      // Positive control: the tool's own content rendered, so the width check measures it.
      await expect(panel.getByText(tool.ready).first()).toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(1000);

      const result = await panel.evaluate(el => {
        const edge = el.getBoundingClientRect().right;
        const sideways = [...el.querySelectorAll<HTMLElement>('*')]
          .filter(c => /(auto|scroll)/.test(getComputedStyle(c).overflowX))
          .filter(c => c.scrollWidth > c.clientWidth + 1)
          .map(c => `${c.tagName} ${c.scrollWidth}>${c.clientWidth}`);
        const pastEdge = [...el.querySelectorAll('button')]
          .filter(b => b.getBoundingClientRect().width > 0)
          .filter(b => b.getBoundingClientRect().right > edge + 0.5)
          .map(b => (b.textContent ?? '').trim().slice(0, 30));
        return { sideways, pastEdge };
      });
      expect(result.sideways, 'the panel must not scroll sideways').toEqual([]);
      expect(result.pastEdge, 'no button may pass the panel edge').toEqual([]);
    });
  }
}
