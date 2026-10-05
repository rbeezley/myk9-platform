/**
 * How the compact show header and the tab strip pin under the app header (from `lg` up). The
 * heights are fixed so nothing has to measure: the header is 4.25rem, the tab strip is 3rem (its
 * triggers are `min-h-[48px]`), so a page's own pinned content sits at 7.25rem under the app header.
 * Change a height and its arithmetic here together. They are literal class strings because Tailwind
 * only sees class names written out in source.
 */

/** The one-line header: fixed height, pinned directly under the app header. */
export const SHOW_HEADER_CLASS = 'h-[4.25rem] lg:sticky lg:top-[var(--app-top-inset,3rem)] lg:z-20';

/** The tab strip: pinned under the header (4.25rem). */
export const SHOW_TAB_STRIP_CLASS =
  'bg-background lg:sticky lg:top-[calc(var(--app-top-inset,3rem)+4.25rem)] lg:z-20';

/**
 * Header plus tab strip, published to everything below as `--show-sticky-offset`, which a page's
 * own sticky pane reads (`var(--show-sticky-offset,0px)`, 0 where the header is not pinned).
 */
export const SHOW_STICKY_OFFSET_CLASS = 'lg:[--show-sticky-offset:7.25rem]';
