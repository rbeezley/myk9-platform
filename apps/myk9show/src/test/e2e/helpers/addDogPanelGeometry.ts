import type { Locator, Page } from '@playwright/test';

/**
 * Rendered geometry of the Add Dog panel (MYK9-1121). jsdom has no layout
 * engine, so field insets and tab-strip fit can only be measured in a browser.
 * Everything here is read-only: it opens nothing and writes nothing.
 */

export interface TabFit {
  label: string;
  tabWidth: number;
  /** `scrollWidth - clientWidth` of the tab trigger; > 0 means its content spills out. */
  scrollOverflow: number;
  /** Pixels the label text box pokes past the tab's left/right edge (<= 0 = inside). */
  labelPastLeft: number;
  labelPastRight: number;
}

export interface AddDogPanelGeometry {
  viewportWidth: number;
  panelWidth: number;
  callNameInsetLeft: number;
  callNameInsetRight: number;
  callNameWidth: number;
  /** Gap between the photo button's right edge and the Call Name input; null when no photo. */
  photoGap: number | null;
  tabs: TabFit[];
}

/** Measures the panel that contains `callName`. Pure DOM reads. */
export async function measureAddDogPanel(callName: Locator): Promise<AddDogPanelGeometry> {
  return callName.evaluate(input => {
    const panel = input.closest<HTMLElement>('.slide-over-panel');
    if (!panel) throw new Error('Call Name is not inside a .slide-over-panel');
    const p = panel.getBoundingClientRect();
    const i = input.getBoundingClientRect();
    const photo = panel.querySelector<HTMLElement>('#dog-photo-button');
    const tabs = Array.from(panel.querySelectorAll<HTMLElement>('[role="tab"]')).map(tab => {
      const t = tab.getBoundingClientRect();
      const label = tab.querySelector<HTMLElement>('span');
      // A Range gives the text's own box; the span itself could be wider than its glyphs.
      const range = document.createRange();
      range.selectNodeContents(label ?? tab);
      const l = Array.from(range.getClientRects()).reduce(
        (acc, r) => ({ left: Math.min(acc.left, r.left), right: Math.max(acc.right, r.right) }),
        { left: Infinity, right: -Infinity }
      );
      return {
        label: (tab.textContent ?? '').trim(),
        tabWidth: t.width,
        scrollOverflow: tab.scrollWidth - tab.clientWidth,
        labelPastLeft: t.left - l.left,
        labelPastRight: l.right - t.right,
      };
    });
    return {
      viewportWidth: window.innerWidth,
      panelWidth: p.width,
      callNameInsetLeft: i.left - p.left,
      callNameInsetRight: p.right - i.right,
      callNameWidth: i.width,
      photoGap: photo ? i.left - photo.getBoundingClientRect().right : null,
      tabs,
    };
  });
}

/**
 * Known-answer check for the harness (LESSONS measurement-harness): a 200x50 box
 * must measure 200x50, a label wider than its tab must read as overflowing and
 * one that fits must not. Returns the problems found; empty means the harness is
 * sound on this page.
 */
export async function harnessKnownAnswers(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const problems: string[] = [];
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:7px;top:7px;width:200px;height:50px;overflow:hidden';
    const wide = document.createElement('button');
    wide.style.cssText =
      'display:block;width:40px;white-space:nowrap;overflow:visible;font:14px sans-serif';
    wide.innerHTML = '<span>This label is far wider than forty pixels</span>';
    const narrow = document.createElement('button');
    narrow.style.cssText = 'display:block;width:200px;white-space:nowrap;font:14px sans-serif';
    narrow.innerHTML = '<span>ok</span>';
    host.append(wide, narrow);
    document.body.append(host);
    const box = host.getBoundingClientRect();
    if (Math.round(box.width) !== 200 || Math.round(box.height) !== 50)
      problems.push(`box measured ${box.width}x${box.height}, expected 200x50`);
    if (wide.scrollWidth - wide.clientWidth <= 0)
      problems.push('wide label not detected as overflowing');
    if (narrow.scrollWidth - narrow.clientWidth > 0)
      problems.push('narrow label flagged as overflowing');
    const range = document.createRange();
    const wideLabel = wide.querySelector('span');
    if (wideLabel) range.selectNodeContents(wideLabel);
    const right = Math.max(...Array.from(range.getClientRects()).map(r => r.right));
    if (right - wide.getBoundingClientRect().right <= 0)
      problems.push('wide label right edge not past tab edge');
    host.remove();
    return problems;
  });
}
