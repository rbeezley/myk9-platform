// Authoritative data access module for the Entry entity.
// All callers import from here — never from supabaseClient or replication
// tables directly, and never from the sibling implementation files below.

export * from './reads';
export * from './publicReads';
// updateEntryStatus excluded — conflicts with the secretary-signature version in secretary.ts.
export {
  applyPromoCodeToEntry,
  compEntry,
  createEntry,
  createMultipleEntries,
  deleteEntry,
  submitShowEntries,
  uncompEntry,
  updateEntry,
  updateEntryDetails,
  updateEntryHandler,
  updateEntryStatus as updateEntryStatusWithAudit,
  withdrawEntry,
} from './writes';
export type {
  EntrySubmissionOutcome,
  EntrySubmissionOutcomeKind,
  EntrySubmissionSource,
  SubmitShowEntriesResult,
} from './writes';
export * from './lifecycle';
export * from './moveUpNote';
export * from './search';
export * from './secretary';
export * from './secretaryExport';
export { SECRETARY_ENTRIES_READ_ERROR } from './secretaryReadErrors';
export { hardDeleteEntry, restoreEntry, getDeletedEntries } from './admin';
export { entryInvalidationKeys } from './invalidation';
export type { EntryChange } from './invalidation';
export {
  executeStatusChange,
  executeBulkStatusChange,
  executeRemoveEntry,
} from './management-actions';
export type {
  StatusChangeAdapters,
  BulkStatusChangeAdapters,
  RemoveEntryAdapters,
  StatusChangeParams,
  BulkStatusChangeParams,
  RemoveEntryParams,
} from './management-actions';
