import type { Page } from '@playwright/test';

/**
 * Rendered geometry of the Entry Forms list's "Review / payment" column (MYK9-1898).
 *
 * A clipped label is one whose content is wider or taller than the box it is drawn in
 * (`scrollWidth > clientWidth`), or a pill that runs past its cell's right edge. Class names cannot
 * see this; "Needs revi…" carried the same classes as "Needs review".
 */
export interface ReviewColumnGeometry {
  /** Rendered "Needs review" pills; zero means the probe had nothing to judge. */
  pills: number;
  /** Rows whose review cell rendered. */
  cells: number;
  /** Whether the "Review / payment" heading is on screen (it is absent in the stacked layout). */
  heading: boolean;
  /** One line per clipped label: `"<text>" <scrollWidth>x<scrollHeight> in <clientWidth>x<clientHeight>`. */
  clipped: string[];
}

export async function measureReviewColumn(page: Page): Promise<ReviewColumnGeometry> {
  return page.evaluate(() => {
    const clipped: string[] = [];
    const TOLERANCE = 1;
    const check = (el: Element | null) => {
      if (!(el instanceof HTMLElement) || el.getClientRects().length === 0) return;
      if (
        el.scrollWidth > el.clientWidth + TOLERANCE ||
        el.scrollHeight > el.clientHeight + TOLERANCE
      ) {
        clipped.push(
          `"${(el.textContent ?? '').trim()}" ${el.scrollWidth}x${el.scrollHeight} in ${el.clientWidth}x${el.clientHeight}`
        );
      }
    };

    const heading = document.querySelector('[data-testid="entry-review-heading"]');
    check(heading);

    const cells = [...document.querySelectorAll('[data-testid="entry-review-cell"]')];
    for (const cell of cells) {
      for (const el of cell.querySelectorAll('*')) check(el);
      const cellRight = cell.getBoundingClientRect().right;
      for (const pill of cell.querySelectorAll('[data-testid="needs-review-marker"]')) {
        const right = pill.getBoundingClientRect().right;
        if (right > cellRight + TOLERANCE) {
          clipped.push(
            `pill "${(pill.textContent ?? '').trim()}" right ${Math.round(right)} > cell ${Math.round(cellRight)}`
          );
        }
      }
    }

    return {
      pills: document.querySelectorAll('[data-testid="needs-review-marker"]').length,
      cells: cells.length,
      heading: heading instanceof HTMLElement && heading.getClientRects().length > 0,
      clipped,
    };
  });
}
