/**
 * How the show header and the tab strip pin under the app header (from `lg` up). The header's
 * height is MEASURED, not assumed: its controls wrap onto a second line on a narrow window, so the
 * header publishes its real height as `--show-header-h` and everything pinned below sits under it.
 * The tab strip is a fixed 3rem (its triggers are `min-h-[48px]`). They are literal class strings
 * because Tailwind only sees class names written out in source.
 */

/** The header: at least one line, pinned directly under the app header. */
export const SHOW_HEADER_CLASS =
  'min-h-[4.25rem] lg:sticky lg:top-[var(--app-top-inset,3rem)] lg:z-20';

/** The tab strip: pinned under the measured header. */
export const SHOW_TAB_STRIP_CLASS =
  'bg-background lg:sticky lg:top-[calc(var(--app-top-inset,3rem)+var(--show-header-h,4.25rem))] lg:z-20';

/** The custom property the header publishes (its height in px). */
export const SHOW_HEADER_HEIGHT_VAR = '--show-header-h';

// A page's own sticky pane (the Entry Management focus pane, EntryManagementCockpit) writes the same
// offset out as a literal class: `calc(var(--app-top-inset,3rem)+var(--show-header-h,0px)+3rem+...)`.
