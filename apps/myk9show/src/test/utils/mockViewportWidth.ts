import { vi } from 'vitest';

/**
 * Stubs `window.matchMedia` to answer each query by evaluating its
 * `min-width` / `max-width` px terms against a fixed viewport width,
 * rather than forcing every query to one boolean (MYK9-633 round 2).
 *
 * A single forced boolean can't tell an inverted breakpoint from a correct
 * one — `mockViewport(true)` passes identically whether the component under
 * test reads `(max-width: 639px)` or the (wrong) inverse. Evaluating the
 * query string means a component whose media query is backwards gets a
 * `matches` answer that's backwards at both widths, which a
 * "mounts only below 640px" assertion actually catches.
 *
 * Only `min-width`/`max-width` terms are understood; anything else
 * evaluates to `false` (safer than a wrong match on features not yet used
 * by any landing style).
 */
export function mockViewportWidth(width: number): void {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: evaluateMediaQuery(query, width),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

function evaluateMediaQuery(query: string, width: number): boolean {
  const maxWidth = query.match(/max-width:\s*(\d+(?:\.\d+)?)px/);
  const minWidth = query.match(/min-width:\s*(\d+(?:\.\d+)?)px/);
  if (!maxWidth && !minWidth) return false;
  if (maxWidth && width > Number(maxWidth[1])) return false;
  if (minWidth && width < Number(minWidth[1])) return false;
  return true;
}
