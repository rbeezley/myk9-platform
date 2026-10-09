import { expect, test, type Page } from '@playwright/test';
import { captureRestAuth, dataAbsent, requireRead } from './helpers/liveCanary';
import { installSharedStagingWriteGuard } from './helpers/sharedStagingWriteGuard';
import { signInAsSecretary } from './helpers/testUsers';

/**
 * The PageHeader breadcrumb must never push a detail page wider than a phone
 * (MYK9-1065). At 360px, Home › Shows › <show> › <trial> › <class> rendered
 * 440px wide inside a 328px column and the page panned 96px sideways.
 *
 * Class names cannot see this; only rendered geometry can. The target is found
 * live (no seed ids) as the trial whose show + trial names are longest, and a
 * known-answer control proves that trail cannot fit its column on one line, so
 * a pass is a verdict, not a trail too short to fail.
 */

const PHONE = { width: 360, height: 800 } as const;
const TRIALS_TO_SCAN = 200;

interface TrialRow {
  id: string;
  name: string | null;
  show_id: string;
  shows: { name: string | null } | null;
  classes: Array<{ id: string }>;
}

async function expectNoHorizontalOverflow(page: Page, label: string): Promise<void> {
  const metrics = await page.evaluate(() => ({
    viewport: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  expect(
    metrics.documentWidth,
    `${label}: horizontal overflow ${JSON.stringify(metrics)}`
  ).toBeLessThanOrEqual(metrics.viewport);
}

/**
 * The full, unfolded trail on one line versus the column it must fit. Measured
 * on a clone with the phone fold undone and truncation lifted, so the control
 * does not depend on the fix under test.
 */
async function unfoldedTrail(page: Page): Promise<{ needs: number; column: number }> {
  return page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Breadcrumb"]');
    if (!nav?.parentElement) throw new Error('breadcrumb nav not found — selector drifted');
    const clone = nav.cloneNode(true) as HTMLElement;
    clone.style.cssText = 'position:fixed;left:-9999px;top:0;width:max-content;max-width:none';
    clone.querySelector('[aria-hidden="true"]')?.remove(); // the phone-only "…"
    for (const el of Array.from(clone.querySelectorAll<HTMLElement>('*'))) {
      el.style.overflow = 'visible';
      el.style.maxWidth = 'none';
    }
    nav.parentElement.appendChild(clone);
    for (const el of Array.from(clone.querySelectorAll<HTMLElement>('*'))) {
      if (getComputedStyle(el).display === 'none') el.style.display = 'flex';
    }
    const needs = clone.getBoundingClientRect().width;
    clone.remove();
    return { needs, column: nav.parentElement.getBoundingClientRect().width };
  });
}

test('a deep class breadcrumb fits a 360px phone without horizontal scroll (MYK9-1065)', async ({
  page,
}) => {
  await installSharedStagingWriteGuard(page, { strictRpcWrites: true });
  const capture = captureRestAuth(page);
  await signInAsSecretary(page);
  const auth = await capture.get();

  const trials = await requireRead<TrialRow>(
    page,
    auth,
    `trials?select=id,name,show_id,shows(name),classes!inner(id)&classes.limit=1&limit=${TRIALS_TO_SCAN}`
  );
  const trailLength = (t: TrialRow) => (t.shows?.name ?? '').length + (t.name ?? '').length;
  const target = trials
    .filter(t => t.classes.length > 0 && t.shows?.name)
    .sort((a, b) => trailLength(b) - trailLength(a))[0];
  if (!target) dataAbsent('no trial with a named show and at least one class');
  const showName = target.shows?.name ?? '';

  await page.setViewportSize(PHONE);
  const classUrl = `/shows/${target.show_id}/trials/${target.id}/classes/${target.classes[0].id}`;
  await page.goto(classUrl, { waitUntil: 'domcontentloaded' });

  const nav = page.getByRole('navigation', { name: 'Breadcrumb' });
  const current = nav.locator('[aria-current="page"]');
  await expect(current).toBeVisible({ timeout: 30_000 });
  // The trail is complete once the show crumb has resolved from its id. It is
  // folded into "…" at this width, so match it by attribute, not by role.
  await expect(nav.locator(`a[title="${showName}"]`)).toHaveCount(1, {
    timeout: 30_000,
  });

  // Known-answer control: a trail that fits on one line cannot exercise the fix.
  const trail = await unfoldedTrail(page);
  if (trail.needs <= trail.column) {
    dataAbsent(`longest trail needs ${Math.round(trail.needs)}px of ${trail.column}px; too short`);
  }

  await expectNoHorizontalOverflow(page, 'class page');
  const navBox = await nav.boundingBox();
  if (!navBox) throw new Error('breadcrumb nav has no layout box');
  expect(navBox.x + navBox.width, 'breadcrumb runs past the viewport').toBeLessThanOrEqual(
    PHONE.width
  );
  // A truncated crumb still carries its full name.
  const label = (await current.textContent())?.trim() ?? '';
  expect(label.length).toBeGreaterThan(0);
  await expect(current).toHaveAttribute('title', label);
  test.info().annotations.push({
    type: 'checked',
    description: `${classUrl}: a ${Math.round(trail.needs)}px trail fits a ${trail.column}px column`,
  });
});
