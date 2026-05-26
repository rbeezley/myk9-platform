/**
 * Domain stores for the ringside experience.
 *
 * Each store is a Zustand-backed singleton scoped to the running ringside
 * surface (apps/myk9q today, /at-show route in apps/myk9show from Phase 1).
 * Consumers import the hooks from the package root — see ../index.ts.
 */

export { useEntryStore, createEntryStore } from './entryStore';
export type { Entry, EntryStatus } from './entryStore';
