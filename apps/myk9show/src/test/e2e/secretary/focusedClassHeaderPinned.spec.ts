import { expect, test, type Page } from '@playwright/test';
import { signInAsSecretary } from '../uat/shared/auth';
import { installSecretaryCockpitFixture } from '../helpers/secretaryCockpitFixture';
import {
  SECRETARY_FIXTURE_CLASS_IDS,
  SECRETARY_FIXTURE_SHOW_ID,
} from '../helpers/secretaryFixture';

/**
 * MYK9-1266: the focused class's header stays visible, directly under the pinned show header and
 * tab strip, while the secretary works down the class. Hermetic: the fixture show serves reads and
 * aborts writes, and carries extra classes so the schedule is taller than the window.
 *
 * Split (schedule left, class right): the class column is a sticky panel with its own scroll, so a
 * short class follows the schedule and a tall one scrolls inside the panel, header pinned to the
 * panel's top. Stacked (class inline under its row): the header pins to the page under the show
 * header and tabs. The app folds the Shows list away before the cockpit would stack, so no real
 * window reaches the stacked layout at lg+; the cockpit follows its own width (cockpitSplit.ts),
 * so a narrow column gives the real stacked layout.
 */
const HEADING = 'Container Novice A';

// A cold dev server compiles the show page on first load.
test.setTimeout(90000);

async function open(
  page: Page,
  cockpitMaxWidth: number | null,
  layout: 'split' | 'stacked',
  width = 1440
) {
  await page.setViewportSize({ width, height: 700 });
  await installSecretaryCockpitFixture(page, { extraClasses: 14 });
  await signInAsSecretary(page, '/');
  await page.goto(`/shows/${SECRETARY_FIXTURE_SHOW_ID}?focus=${SECRETARY_FIXTURE_CLASS_IDS[0]}`);
  if (cockpitMaxWidth !== null) {
    await page.addStyleTag({
      content: `[data-testid="secretary-cockpit"] { max-width: ${cockpitMaxWidth}px; }`,
    });
  }
  const heading = page.getByRole('heading', { level: 2, name: HEADING });
  await expect(heading).toBeVisible({ timeout: 60000 });
  await expect(page.locator('[data-cockpit-layout]')).toHaveAttribute(
    'data-cockpit-layout',
    layout
  );
  return heading;
}

/** Everything measured in the page; the h2's parent is the header block, found by structure. */
async function probe(page: Page) {
  return page.evaluate(
    ({ title }) => {
      const h2 = [...document.querySelectorAll<HTMLElement>('aside h2')].find(
        el => el.textContent === title
      );
      const block = h2?.parentElement;
      const card = block?.parentElement;
      const grid = document.querySelector<HTMLElement>('[data-cockpit-layout]');
      if (!h2 || !block || !card || !grid) return null;
      const scrolls = (el: HTMLElement) =>
        ['auto', 'scroll'].includes(getComputedStyle(el).overflowY) &&
        el.scrollHeight > el.clientHeight;
      // The page's scroller: the nearest scrolling ancestor of the cockpit grid.
      let page: HTMLElement = document.documentElement;
      for (let el = grid.parentElement; el; el = el.parentElement) {
        if (scrolls(el)) {
          page = el;
          break;
        }
      }
      // The class's own scroll panel (split only): a scrolling ancestor between card and grid.
      let panel: HTMLElement | null = null;
      for (let el = card.parentElement; el && el !== grid.parentElement; el = el.parentElement) {
        if (getComputedStyle(el).overflowY !== 'visible' && el !== page) {
          panel = el;
          break;
        }
      }
      const stuck = [...document.querySelectorAll<HTMLElement>('*')].filter(
        el =>
          getComputedStyle(el).position === 'sticky' &&
          getComputedStyle(el).top !== 'auto' &&
          !block.contains(el) &&
          !el.contains(block) &&
          el.getBoundingClientRect().height > 0
      );
      // Show header and tab strip: the lowest bottom among the sticky elements above the class.
      const stripBottom = Math.max(...stuck.map(el => el.getBoundingClientRect().bottom));
      const rect = h2.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      const view = page.getBoundingClientRect();
      return {
        h2Top: rect.top,
        stripBottom,
        hitInsideBlock: !!hit && block.contains(hit),
        blockPosition: getComputedStyle(block).position,
        cardTop: card.getBoundingClientRect().top,
        pageScrollable: page.scrollHeight - page.clientHeight,
        pageScrollTop: page.scrollTop,
        viewBottom: Math.min(view.bottom, window.innerHeight),
        panel: panel && {
          top: panel.getBoundingClientRect().top,
          bottom: panel.getBoundingClientRect().bottom,
          scrollable: panel.scrollHeight - panel.clientHeight,
          scrollTop: panel.scrollTop,
        },
        headerTop: block.getBoundingClientRect().top,
      };
    },
    { title: HEADING }
  );
}

/**
 * Scroll the page to a fraction of its length, instantly (the document has smooth scrolling). Not
 * the very end: a sticky panel rides up with the end of its grid.
 */
async function scrollPageTo(page: Page, fraction: number) {
  await page.evaluate(f => {
    const grid = document.querySelector('[data-cockpit-layout]');
    for (let el = grid?.parentElement ?? null; el; el = el.parentElement) {
      if (el.scrollHeight > el.clientHeight)
        el.scrollTo({ top: (el.scrollHeight - el.clientHeight) * f, behavior: 'instant' });
    }
  }, fraction);
}

test('split: a short class follows the schedule, and its own scroll keeps the header on top', async ({
  page,
}) => {
  const heading = await open(page, null, 'split');
  const before = await probe(page);
  // Positive controls: the schedule is taller than the window, and the class panel scrolls itself.
  expect(before?.pageScrollable ?? 0).toBeGreaterThan(300);
  expect(before?.panel?.scrollable ?? 0).toBeGreaterThan(40);

  // (a) Scroll the long schedule halfway: the class column has not scrolled away with its natural
  // position (well above the view by now), it rides just under the show header and tabs.
  await scrollPageTo(page, 0.5);
  await expect(heading).toBeInViewport();
  const followed = await probe(page);
  expect(followed?.panel).not.toBeNull();
  expect(followed?.pageScrollTop ?? 0).toBeGreaterThan(before?.pageScrollTop ?? 0);
  expect(followed?.panel?.top ?? -1).toBeGreaterThanOrEqual((followed?.stripBottom ?? 9999) - 1);
  expect(followed?.panel?.top ?? 9999).toBeLessThanOrEqual((followed?.stripBottom ?? 0) + 40);
  expect(followed?.panel?.bottom ?? 9999).toBeLessThanOrEqual((followed?.viewBottom ?? 0) + 1);

  // (b) Scroll the class panel itself to its bottom: the h2 is still at the panel's top, uncovered.
  await page.evaluate(() => {
    const h2 = [...document.querySelectorAll('aside h2')].find(
      el => el.textContent === 'Container Novice A'
    );
    for (let el = h2?.parentElement?.parentElement?.parentElement ?? null; el;) {
      if (el.scrollHeight > el.clientHeight && getComputedStyle(el).overflowY === 'auto') {
        el.scrollTop = el.scrollHeight;
        break;
      }
      el = el.parentElement;
    }
  });
  const inner = await probe(page);
  expect(inner?.panel?.scrollTop ?? 0).toBeGreaterThan(40);
  await expect(heading).toBeInViewport();
  expect(inner?.headerTop ?? -1).toBeGreaterThanOrEqual((inner?.panel?.top ?? 9999) - 1);
  expect(inner?.headerTop ?? 9999).toBeLessThanOrEqual((inner?.panel?.top ?? 0) + 2);
  expect(inner?.h2Top ?? -1).toBeGreaterThanOrEqual((inner?.stripBottom ?? 9999) - 1);
  expect(inner?.hitInsideBlock).toBe(true);
  expect(inner?.blockPosition).toBe('sticky');
});

test('stacked: the header pins to the page under the show header and tabs', async ({ page }) => {
  const heading = await open(page, 700, 'stacked');
  const before = await probe(page);
  expect(before?.pageScrollable ?? 0).toBeGreaterThan(40);

  // Scroll until the class card's last row is at the bottom of the view: the deepest the
  // secretary can be inside this class. The card's own top is then well above the view.
  await page.evaluate(() => {
    const h2 = [...document.querySelectorAll('aside h2')].find(
      el => el.textContent === 'Container Novice A'
    );
    const card = h2?.parentElement?.parentElement;
    for (let el = card?.parentElement ?? null; el; el = el.parentElement) {
      if (el.scrollHeight > el.clientHeight) {
        el.scrollTop +=
          (card?.getBoundingClientRect().bottom ?? 0) - el.getBoundingClientRect().bottom;
      }
    }
  });
  await expect(heading).toBeInViewport();
  const after = await probe(page);
  expect(after).not.toBeNull();
  // Positive control: the card's own top really did scroll away, so only the pin keeps the h2 up.
  expect(after?.cardTop ?? 0).toBeLessThan((after?.stripBottom ?? 0) - 40);
  expect(after?.h2Top ?? -1).toBeGreaterThanOrEqual((after?.stripBottom ?? 9999) - 1);
  expect(after?.hitInsideBlock).toBe(true);
  expect(after?.blockPosition).toBe('sticky');
  expect(Math.abs((after?.headerTop ?? -1) - (after?.stripBottom ?? 9999))).toBeLessThanOrEqual(2);
});

test('at 375px nothing pins and the page still scrolls', async ({ page }) => {
  await open(page, null, 'stacked', 375);
  const header = page.getByTestId('focused-class-header');
  await expect(header).toHaveCSS('position', 'static');
  const before = await probe(page);
  expect(before?.pageScrollable ?? 0).toBeGreaterThan(300);
  await scrollPageTo(page, 0.5);
  const after = await probe(page);
  expect(after?.pageScrollTop ?? 0).toBeGreaterThan((before?.pageScrollTop ?? 0) + 100);
  await expect(header).toHaveCSS('position', 'static');
});

test('at 980px (stacked, below the floor) nothing pins', async ({ page }) => {
  await open(page, null, 'stacked', 980);
  const header = page.getByTestId('focused-class-header');
  await expect(header).toHaveCSS('position', 'static');
  await scrollPageTo(page, 0.5);
  await expect(header).toHaveCSS('position', 'static');
});

test('at 1020px the cockpit splits below the 1024px floor: no sticky anywhere, nothing covered', async ({
  page,
}) => {
  await open(page, null, 'split', 1020);
  const wrapper = page.getByTestId('cockpit-split-focus');
  const header = page.getByTestId('focused-class-header');
  await expect(header).toHaveCSS('position', 'static');
  await expect(wrapper).toHaveCSS('position', 'static');
  await expect(wrapper).toHaveCSS('overflow-y', 'visible');
  const before = await probe(page);
  // The header sits in normal flow under the show header and tabs, uncovered.
  expect(before?.h2Top ?? -1).toBeGreaterThanOrEqual((before?.stripBottom ?? 9999) - 1);
  expect(before?.hitInsideBlock).toBe(true);
  expect(before?.pageScrollable ?? 0).toBeGreaterThan(300);
  await scrollPageTo(page, 0.5);
  const after = await probe(page);
  expect(after?.pageScrollTop ?? 0).toBeGreaterThan((before?.pageScrollTop ?? 0) + 100);
  // It scrolled away with the page, rather than riding under the tabs.
  expect(after?.headerTop ?? 9999).toBeLessThan((before?.headerTop ?? 0) - 100);
});

for (const layout of ['split', 'stacked'] as const) {
  test(`${layout}: a low focused control scrolls below the pinned header`, async ({ page }) => {
    await open(page, layout === 'stacked' ? 700 : null, layout);
    const header = page.getByTestId('focused-class-header');
    await expect(header).toHaveCSS('position', 'sticky');
    const control = page.getByRole('complementary').locator('button, input, a, select').last();
    await control.evaluate(el => {
      (el as HTMLElement).focus();
      el.scrollIntoView({ block: 'start' });
    });
    await expect(control).toBeInViewport();
    const controlBox = await control.boundingBox();
    const headerBox = await header.boundingBox();
    expect(controlBox?.y ?? -1).toBeGreaterThanOrEqual(
      (headerBox?.y ?? 9999) + (headerBox?.height ?? 0) - 1
    );
    // The control, not the header, is what is at its own centre.
    const covered = await control.evaluate(el => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !hit || !(el === hit || el.contains(hit) || hit.contains(el));
    });
    expect(covered).toBe(false);
  });
}

test('the fixture aborts a write to a table route even with no query string', async ({ page }) => {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  test.skip(!supabaseUrl, 'no Supabase URL in the environment');
  await open(page, null, 'split');
  const outcome = await page.evaluate(async url => {
    try {
      await fetch(`${url}/rest/v1/entries`, { method: 'POST', body: '{}' });
      return 'sent';
    } catch {
      return 'aborted';
    }
  }, supabaseUrl);
  expect(outcome).toBe('aborted');
});
