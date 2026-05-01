// Authoritative data access module for day-of-show operations.
// All callers import from here — never from supabaseClient directly.
//
// Implementations live in dayOfOperationsQueries.ts (a feature barrel over
// scratchQueries, moveUpQueries, dayOfEntryQueries) during migration.

export type { DayOfEntry, MoveUpRequest, ClassWithCapacity, ScratchRequest } from '../queries/dayOfOperationsQueries';
export {
  getClassesWithCapacity,
  createDayOfEntry,
  getShowDogs,
  processMoveUp,
  getMoveUpEligibleEntries,
  getPendingMoveUpRequests,
  approveMoveUpRequest,
  denyMoveUpRequest,
  scratchEntry,
  getScratchableEntries,
  getScratchedEntries,
  requestScratch,
  getPendingScratchRequests,
  approveScratchRequest,
  denyScratchRequest,
  updateRefundStatus,
} from '../queries/dayOfOperationsQueries';
