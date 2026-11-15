/**
 * MYK9-1989: how much of a laptop window the selected class's entries get on Show Desk.
 *
 * `scrollToEntries` does what a secretary does to reach the dogs: scroll the page until the
 * class's panel is pinned, then scroll the class until the "Entries in run order" heading sits
 * just under the pinned class name. `measureEntries` then reads the real geometry. Everything in
 * the page callbacks is inline (no named helpers), so the same code runs under Playwright's
 * transform and under tsx.
 */
import type { Page } from '@playwright/test';

export interface EntriesGeometry {
  viewportHeight: number;
  /** Bottom of the pinned class name line. */
  headerBottom: number;
  firstRowTop: number;
  /** Entry rows wholly inside the window and below the pinned header. */
  rowsVisible: number;
  rowCount: number;
  /** The class name is on screen and nothing covers it. */
  nameVisible: boolean;
}

export async function scrollToEntries(page: Page): Promise<void> {
  // Twice: the first page scroll pins the panel, the second pass settles the class's own scroll.
  for (let pass = 0; pass < 2; pass += 1) {
    await page.evaluate(() => {
      const heading = document.getElementById('focused-class-entries');
      const header = heading
        ?.closest('aside')
        ?.querySelector<HTMLElement>('[data-testid="focused-class-header"]');
      if (!heading || !header) throw new Error('no focused class with entries');
      const scrollers: HTMLElement[] = [];
      for (let el = heading.parentElement; el; el = el.parentElement) {
        if (
          ['auto', 'scroll'].includes(getComputedStyle(el).overflowY) &&
          el.scrollHeight > el.clientHeight
        )
          scrollers.push(el);
      }
      if (document.scrollingElement) scrollers.push(document.scrollingElement as HTMLElement);
      // Outermost first: the page brings the panel up, then the panel brings the entries up.
      for (const el of scrollers.reverse()) {
        const gap = heading.getBoundingClientRect().top - header.getBoundingClientRect().bottom;
        el.scrollBy({ top: gap - 4, behavior: 'instant' });
      }
    });
  }
}

export async function measureEntries(page: Page): Promise<EntriesGeometry> {
  return page.evaluate(() => {
    const aside = document.getElementById('focused-class-entries')?.closest('aside');
    const header = aside?.querySelector<HTMLElement>('[data-testid="focused-class-header"]');
    const name = header?.querySelector<HTMLElement>('h2');
    const rows = [...(aside?.querySelectorAll<HTMLElement>('tbody tr') ?? [])];
    if (!header || !name || rows.length === 0) throw new Error('no focused class with entries');
    const headerBottom = header.getBoundingClientRect().bottom;
    const box = name.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + 4, box.top + box.height / 2);
    return {
      viewportHeight: window.innerHeight,
      headerBottom,
      firstRowTop: rows[0]!.getBoundingClientRect().top,
      rowsVisible: rows.filter(
        row =>
          row.getBoundingClientRect().top >= headerBottom - 1 &&
          row.getBoundingClientRect().bottom <= window.innerHeight
      ).length,
      rowCount: rows.length,
      nameVisible: box.top >= 0 && !!hit && name.contains(hit),
    };
  });
}
