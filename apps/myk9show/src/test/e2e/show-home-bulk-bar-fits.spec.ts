import { expect, test, type Page } from '@playwright/test';
import { captureRestAuth, dataAbsent, requireRead } from './helpers/liveCanary';
import { installSharedStagingWriteGuard } from './helpers/sharedStagingWriteGuard';
import { signInAsSecretary } from './helpers/testUsers';

/**
 * Show home select mode (?select=classes): the bulk bar must show every action
 * on a phone, and the trial heading must not wrap word by word (MYK9-1444).
 * At 375px the bar was a 341px sideways scroller holding ~778px of buttons, so
 * only Assign judge was visible. Rendered geometry only: each action's box is
 * inside the viewport and the spacer reserves the wrapped bar's height.
 */

interface ClassRow {
  id: string;
  trial_id: string;
  trials: { show_id: string } | null;
}

const ACTIONS = ['Assign judge', 'Change status', 'Delete', 'Export'] as const;

async function expectBarFits(page: Page, width: number) {
  const bar = page.getByRole('toolbar', { name: 'Bulk actions' });
  await expect(bar).toBeVisible();
  for (const name of ACTIONS) {
    const box = await bar.getByRole('button', { name: new RegExp(name) }).boundingBox();
    expect(box, `${name} button exists`).not.toBeNull();
    expect(box!.x, `${name} left edge`).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width, `${name} right edge`).toBeLessThanOrEqual(width);
  }
  // However many rows the bar wraps to, the in-flow spacer must reserve at least its height,
  // or the bar covers the list's last rows.
  const barBox = await bar.boundingBox();
  const spacerBox = await page.getByTestId('bulk-bar-spacer').boundingBox();
  expect(spacerBox, 'spacer exists').not.toBeNull();
  expect(spacerBox!.height, 'spacer reserves the wrapped bar').toBeGreaterThanOrEqual(
    barBox!.height
  );
}

for (const viewport of [
  { width: 375, height: 812 },
  { width: 1440, height: 900 },
]) {
  test(`show home bulk bar shows all actions at ${viewport.width}px (MYK9-1444)`, async ({
    page,
  }) => {
    await installSharedStagingWriteGuard(page, { strictRpcWrites: true });
    const capture = captureRestAuth(page);
    await signInAsSecretary(page);
    const auth = await capture.get();
    const rows = await requireRead<ClassRow>(
      page,
      auth,
      'classes?select=id,trial_id,trials!inner(show_id)&limit=1'
    );
    const target = rows[0];
    if (!target?.trials) dataAbsent('no class with a trial');

    await page.setViewportSize(viewport);
    await page.goto(`/shows/${target.trials.show_id}?select=classes`, {
      waitUntil: 'domcontentloaded',
    });
    await page
      .getByRole('checkbox', { name: /^Select every class in / })
      .first()
      .check();

    await expectBarFits(page, viewport.width);

    const heading = page.getByRole('button', { name: /^(Collapse|Expand) / }).first();
    const label = heading.locator('div.font-semibold');
    const { height, lineHeight } = await label.evaluate(el => ({
      height: el.getBoundingClientRect().height,
      lineHeight: parseFloat(getComputedStyle(el).lineHeight),
    }));
    expect(height, 'trial heading lines').toBeLessThanOrEqual(lineHeight * 2 + 1);
  });
}
