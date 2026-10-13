import { test, expect, type Page } from '@playwright/test';
import { signInAsSecretary } from './uat/shared/auth';
import { LIVE_REGISTRATION_SHOW_ID } from './uat/shared/seededShows';
import { installSharedStagingWriteGuard } from './helpers/sharedStagingWriteGuard';
import { applyRegistrationClock } from './registration/seedRoster';

/**
 * MYK9-1138: at 768x800 the registration wizard's sticky header was 431px (54% of the viewport) and
 * a focused "Create New" sat under it, so a plain click was intercepted by the header. Below `sm`
 * the header already collapsed to its step list (MYK9-622); this pins the same on every width, and
 * that anything the browser scrolls to stays clear of the pinned chrome (MYK9-764).
 *
 * Measured in a real browser: jsdom has no layout engine. Writes nothing; the guard blocks writes.
 */

const SHELL = '[data-testid="registration-wizard-shell"]';
const HEADER = '[data-testid="registration-wizard-header"]';
/** "About a quarter" of the viewport (the acceptance bound), with a little rounding room. */
const MAX_PINNED_RATIO = 0.27;

const VIEWPORTS = [
  { width: 375, height: 812 },
  { width: 768, height: 800 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];

interface Probe {
  /** Visible height of the header once the step has scrolled (what stays pinned). */
  pinnedHeight: number;
  viewportHeight: number;
  /** Whether the element at the centre of the focused control is the control itself. */
  focusedHit: 'control' | 'covered' | 'offscreen';
}

/**
 * Scrolls the wizard's own scrollport to its end, back to the top, then focuses the control the way
 * Tab would, and reports what is pinned and whether the control can be hit.
 */
async function probe(page: Page, controlName: RegExp): Promise<Probe> {
  return page.evaluate(
    async ({ shell, header, source }) => {
      const root = document.querySelector<HTMLElement>(shell)!;
      const head = document.querySelector<HTMLElement>(header)!;
      const control = Array.from(document.querySelectorAll<HTMLElement>('button')).find(el =>
        new RegExp(source, 'i').test(el.textContent ?? '')
      )!;
      const settle = () => new Promise(resolve => setTimeout(resolve, 150));
      root.scrollTop = root.scrollHeight;
      await settle();
      const pinnedHeight = Math.round(head.getBoundingClientRect().bottom);
      root.scrollTop = 0;
      await settle();
      control.focus();
      await settle();
      const box = control.getBoundingClientRect();
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      const hit =
        y < 0 || y > window.innerHeight
          ? 'offscreen'
          : (() => {
              const top = document.elementFromPoint(x, y);
              return top && control.contains(top) ? 'control' : 'covered';
            })();
      return { pinnedHeight, viewportHeight: window.innerHeight, focusedHit: hit };
    },
    { shell: SHELL, header: HEADER, source: controlName.source }
  );
}

test('the probe tells a covered control from a free one (known answers)', async ({ page }) => {
  await page.goto('about:blank');
  const result = await page.evaluate(() => {
    document.body.innerHTML =
      '<div id="r" style="height:300px;overflow-y:auto">' +
      '<header style="position:sticky;top:0;z-index:10;height:100px;background:#ccc">h</header>' +
      '<div style="height:20px"></div>' +
      '<button id="under" style="position:absolute;top:30px;height:30px">under</button>' +
      '<button id="free" style="position:absolute;top:150px;height:30px">free</button></div>';
    const hit = (id: string) => {
      const b = document.getElementById(id)!;
      const r = b.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + 5, r.y + r.height / 2);
      return top && b.contains(top) ? 'control' : 'covered';
    };
    return { under: hit('under'), free: hit('free') };
  });
  expect(result).toEqual({ under: 'covered', free: 'control' });
});

for (const { width, height } of VIEWPORTS) {
  test(`wizard chrome stays small and clear of focus @ ${width}x${height}`, async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height });
    await installSharedStagingWriteGuard(page, { strictRpcWrites: true });
    await applyRegistrationClock(page);
    await signInAsSecretary(page, `/secretary/register/${LIVE_REGISTRATION_SHOW_ID}`);
    await page.goto(`/secretary/register/${LIVE_REGISTRATION_SHOW_ID}`, {
      waitUntil: 'domcontentloaded',
    });
    const createNew = page.getByRole('button', { name: /Create New/i });
    await expect(createNew).toBeVisible({ timeout: 20000 });

    const result = await probe(page, /Create New/);
    expect(
      result.pinnedHeight / result.viewportHeight,
      `pinned header ${result.pinnedHeight}px of ${result.viewportHeight}px`
    ).toBeLessThanOrEqual(MAX_PINNED_RATIO);
    expect(result.focusedHit, 'a focused control must not sit under the pinned chrome').not.toBe(
      'covered'
    );

    // A plain click, with no scroll workaround (acceptance).
    await createNew.click();
    await expect(page.getByRole('menuitem', { name: /Exhibitor & Dog/i })).toBeVisible();
    await page.keyboard.press('Escape');
  });
}
