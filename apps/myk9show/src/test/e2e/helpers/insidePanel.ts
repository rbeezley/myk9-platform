import type { Locator, Page } from '@playwright/test';

/**
 * How far a control sits past its slide-out panel's edges (MYK9-1137). jsdom has no layout
 * engine, so "is the button on screen" can only be measured in a browser.
 *
 * Positive `pastRight` means the control's right edge is beyond the panel's right edge;
 * `pastLeft` likewise for the left. Read-only: it clicks and types nothing.
 */
export interface PanelFit {
  label: string;
  pastRight: number;
  pastLeft: number;
}

export async function measureInsidePanel(
  panel: Locator,
  controls: Record<string, Locator>
): Promise<PanelFit[]> {
  const panelBox = await panel.boundingBox();
  if (!panelBox) throw new Error('panel has no layout box');
  const fits: PanelFit[] = [];
  for (const [label, control] of Object.entries(controls)) {
    const box = await control.first().boundingBox();
    if (!box) throw new Error(`${label} has no layout box`);
    fits.push({
      label,
      pastRight: Math.round(box.x + box.width - (panelBox.x + panelBox.width)),
      pastLeft: Math.round(panelBox.x - box.x),
    });
  }
  return fits;
}

/**
 * Known-answer check for the harness (LESSONS measurement-harness): a 120px button whose
 * right edge sits 70px past a 200px panel must read as 70 past; one that fits must read <= 0.
 * Returns the problems found; empty means the harness is sound on this page.
 */
export async function insidePanelKnownAnswers(page: Page): Promise<string[]> {
  await page.evaluate(() => {
    const host = document.createElement('div');
    host.id = 'known-answer-host';
    host.setAttribute('role', 'region');
    host.style.cssText = 'position:fixed;left:10px;top:10px;width:200px;height:80px';
    host.innerHTML =
      '<button id="ka-out" style="position:absolute;left:150px;top:0;width:120px;height:30px">out</button>' +
      '<button id="ka-in" style="position:absolute;left:20px;top:40px;width:100px;height:30px">in</button>';
    document.body.append(host);
  });
  const fits = await measureInsidePanel(page.locator('#known-answer-host'), {
    out: page.locator('#ka-out'),
    inside: page.locator('#ka-in'),
  });
  await page.evaluate(() => document.getElementById('known-answer-host')?.remove());
  const problems: string[] = [];
  const out = fits.find(f => f.label === 'out');
  const inside = fits.find(f => f.label === 'inside');
  if (out?.pastRight !== 70) problems.push(`out pastRight ${out?.pastRight}, expected 70`);
  if ((inside?.pastRight ?? 1) > 0) problems.push(`inside pastRight ${inside?.pastRight}`);
  if ((inside?.pastLeft ?? 1) > 0) problems.push(`inside pastLeft ${inside?.pastLeft}`);
  return problems;
}
