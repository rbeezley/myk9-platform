/**
 * Pure 2D box-geometry helpers shared between a real-browser Playwright spec
 * and this file's own vitest unit test. Kept outside `src/test/e2e/` (which
 * vitest's config excludes wholesale) specifically so the geometry logic a
 * spec depends on gets a real, credential-free red/green proof instead of
 * living only inside a `page.evaluate` callback nobody can unit test.
 */

export interface Box {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/**
 * True when two axis-aligned boxes overlap in 2D screen space. Boxes that
 * only touch at an edge (e.g. `a.right === b.left`) do not count as
 * overlapping — a control flush against another element's edge is a layout
 * choice, not the "half covered" failure this exists to catch.
 */
export function boxesIntersect(a: Box, b: Box): boolean {
  return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
}

/**
 * True when `box` sits entirely within a `0,0`-origin viewport of the given
 * size, within `tolerancePx` of sub-pixel layout rounding.
 */
export function isInsideViewport(
  box: Box,
  viewport: { width: number; height: number },
  tolerancePx = 1
): boolean {
  return (
    box.left >= -tolerancePx &&
    box.right <= viewport.width + tolerancePx &&
    box.top >= -tolerancePx &&
    box.bottom <= viewport.height + tolerancePx
  );
}
