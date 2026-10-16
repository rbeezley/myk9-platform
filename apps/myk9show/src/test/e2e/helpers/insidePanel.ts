import type { Locator, Page } from '@playwright/test';

/**
 * How far a control sits past its slide-out panel's content area (MYK9-1137). jsdom has no
 * layout engine, so "is the button on screen" can only be measured in a browser.
 *
 * The content area is the panel's box minus `gutter` on each side (SlideOverPanel's `p-6`), so
 * a control that fits the panel but sits in its gutter still counts. Pass the `.slide-over-panel`
 * element itself, not the `role="dialog"` wrapper: that is the full-screen backdrop. Positive
 * `pastRight` / `pastLeft` means the control crosses that edge of the content area. Read-only:
 * it clicks and types nothing.
 */
export interface PanelFit {
  label: string;
  pastRight: number;
  pastLeft: number;
}

/** SlideOverPanel's `p-6` content gutter. */
export const PANEL_GUTTER = 24;

export async function measureInsidePanel(
  panel: Locator,
  controls: Record<string, Locator>,
  gutter = PANEL_GUTTER
): Promise<PanelFit[]> {
  const panelBox = await panel.boundingBox();
  if (!panelBox) throw new Error('panel has no layout box');
  const fits: PanelFit[] = [];
  for (const [label, control] of Object.entries(controls)) {
    const box = await control.first().boundingBox();
    if (!box) throw new Error(`${label} has no layout box`);
    fits.push({
      label,
      pastRight: Math.round(box.x + box.width - (panelBox.x + panelBox.width - gutter)),
      pastLeft: Math.round(panelBox.x + gutter - box.x),
    });
  }
  return fits;
}

/**
 * Known-answer check for the harness (LESSONS measurement-harness), on a 200px panel at x=10
 * (content area x=34..186): a button 94px past the content edge must read 94; one inside the
 * panel but in its right gutter must read 24 (the negative control for measuring the panel
 * instead of the content area); one that fits must read <= 0 on both sides. Returns the problems
 * found; empty means the harness is sound on this page.
 */
export async function insidePanelKnownAnswers(page: Page): Promise<string[]> {
  await page.evaluate(() => {
    const host = document.createElement('div');
    host.id = 'known-answer-host';
    host.setAttribute('role', 'region');
    host.style.cssText = 'position:fixed;left:10px;top:10px;width:200px;height:110px';
    host.innerHTML =
      '<button id="ka-out" style="position:absolute;left:150px;top:0;width:120px;height:30px">out</button>' +
      '<button id="ka-gutter" style="position:absolute;left:100px;top:35px;width:100px;height:30px">g</button>' +
      '<button id="ka-in" style="position:absolute;left:30px;top:70px;width:100px;height:30px">in</button>';
    document.body.append(host);
  });
  const fits = await measureInsidePanel(page.locator('#known-answer-host'), {
    out: page.locator('#ka-out'),
    gutter: page.locator('#ka-gutter'),
    inside: page.locator('#ka-in'),
  });
  await page.evaluate(() => document.getElementById('known-answer-host')?.remove());
  const problems: string[] = [];
  const out = fits.find(f => f.label === 'out');
  const inGutter = fits.find(f => f.label === 'gutter');
  const inside = fits.find(f => f.label === 'inside');
  if (out?.pastRight !== 94) problems.push(`out pastRight ${out?.pastRight}, expected 94`);
  if (inGutter?.pastRight !== 24)
    problems.push(`gutter pastRight ${inGutter?.pastRight}, expected 24`);
  if ((inside?.pastRight ?? 1) > 0) problems.push(`inside pastRight ${inside?.pastRight}`);
  if ((inside?.pastLeft ?? 1) > 0) problems.push(`inside pastLeft ${inside?.pastLeft}`);
  return problems;
}
