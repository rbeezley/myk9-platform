/**
 * What the desk's offline late entry says when this device cannot read what it
 * needs. Each is thrown before anything is queued, so nothing was saved, and
 * each says what to do. `entrySubmitErrorMessage` shows them as they are
 * (MYK9-1823).
 */

/** Plain language for the desk: a raw storage error means nothing there. */
export const CAPACITY_UNREADABLE =
  "We couldn't check class capacity on this device. Reload the page and try again.";

/** Plain language for the desk when the show's classes or trials are not on this device. */
export const STRUCTURE_NOT_LOADED =
  "This show's classes haven't finished loading on this device. Connect to the internet and try again.";

/** The show's entries could not be read on this device before run order was assigned. */
export const SHOW_ENTRIES_UNREADABLE =
  "We couldn't read this show's entries on this device. Reload the page and try again.";
