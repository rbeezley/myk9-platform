/**
 * The desk's re-read of the page's entries, handed the ids whose writes were just stored. The
 * page that owns the entries reads those rows back from the replica and takes them before the
 * re-read runs, so a re-read that fails or pauses offline never leaves the old status on screen.
 * The desk never says what was written; the stored row does.
 */
export type EntriesRefresh = (storedIds?: readonly string[]) => void | Promise<void>;
