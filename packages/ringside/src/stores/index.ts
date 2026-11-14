/**
 * Domain types for the ringside experience. The `Entry` row shape is the one
 * contract every EntryList module shares; consumers import it from the
 * package root (see ../index.ts).
 */

export type { Entry, EntryStatus } from './entryStore';
