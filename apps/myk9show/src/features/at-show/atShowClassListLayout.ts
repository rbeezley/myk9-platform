/**
 * Shared layout constants for the at-show class picker.
 *
 * Lives in its own module because the page and its loading skeleton must use
 * the identical column, or the list visibly jumps sideways the moment the data
 * lands -- mid-show, in front of a judge.
 */

/**
 * The reading column.
 *
 * Ringside runs on a tablet in landscape (docs/INTENT.md s.6). A fixed
 * `max-w-2xl` (672px) left roughly half of a 1280px display empty and forced
 * avoidable scrolling through the class list, so the column widens with the
 * viewport instead of staying at phone width on every device.
 */
export const WIDE_COLUMN = 'mx-auto w-full max-w-2xl lg:max-w-3xl xl:max-w-4xl';
