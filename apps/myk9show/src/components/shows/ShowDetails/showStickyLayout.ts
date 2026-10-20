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

/** One viewport floor: below lg, the focused card never pins, regardless of its layout. */
export const FOCUSED_CLASS_PIN_QUERY = '(min-width: 1024px)';
export type FocusedClassPinMode = 'none' | 'page' | 'panel';

/** The custom property the focused-class header publishes (its height in px). */
export const FOCUSED_CLASS_HEADER_HEIGHT_VAR = '--focused-class-header-h';

/**
 * The focused class's header on the Overview tab: pinned from `lg` up, directly under the show
 * header (measured) and the 3rem tab strip, and one layer below them (`z-10` against their `z-20`)
 * so it never covers them. Below `lg` it scrolls away: a phone's height is scarce and the app and
 * show headers already take the top.
 */
export const FOCUSED_CLASS_HEADER_CLASS =
  'bg-card sticky top-[calc(var(--app-top-inset,3rem)+var(--show-header-h,4.25rem)+3rem)] z-10';

/**
 * A control inside the focused class that scrolls into view (focus, scrollIntoView) stops below
 * the pinned header instead of under it.
 */
export const FOCUSED_CLASS_SCROLL_MARGIN_CLASS =
  '[&_:is(a,button,input,select,textarea,summary,[tabindex])]:scroll-mt-[calc(var(--app-top-inset,3rem)+var(--show-header-h,4.25rem)+3rem+var(--focused-class-header-h,0px)+0.5rem)]';

/**
 * The split layout's focused column (schedule left, class right), from `lg` up: a sticky panel with
 * its OWN scroll, so a short class follows the long schedule beside it and a class taller than the
 * window scrolls inside the panel instead of leaving its lower half unreachable. It starts under
 * the show header and tab strip (+1rem gap) and ends 1rem above the window bottom (3rem tab strip + 1rem top gap + 1rem bottom gap = 5rem;
 * the subtraction needs spaces, written as underscores, which CSS calc requires).
 */
export const FOCUSED_CLASS_PANEL_CLASS =
  'sticky top-[calc(var(--app-top-inset,3rem)+var(--show-header-h,4.25rem)+3rem+1rem)] max-h-[calc(var(--pane-scroll-h,calc(100dvh_-_var(--app-top-inset,3rem)))_-_var(--show-header-h,4.25rem)_-_5rem)] overflow-y-auto';

/**
 * The height of the box the show page scrolls in, when that is not the window: the Shows list pane
 * (ShowsMasterDetailPage) declares it on its split wrapper, where `--app-top-inset` is still real
 * (inside the pane it is zeroed). The panel's max-height reads it; with none, the window is the box.
 */
export const PANE_SCROLL_HEIGHT_VAR = '--pane-scroll-h';

/** The header inside that panel pins to the top of the panel, not to the page offset. */
export const FOCUSED_CLASS_HEADER_CLASS_IN_PANEL = 'bg-card sticky top-0 z-10';

/** In the panel a focused control only has to clear the panel's own pinned header. */
export const FOCUSED_CLASS_SCROLL_MARGIN_CLASS_IN_PANEL =
  '[&_:is(a,button,input,select,textarea,summary,[tabindex])]:scroll-mt-[calc(var(--focused-class-header-h,0px)+0.5rem)]';
