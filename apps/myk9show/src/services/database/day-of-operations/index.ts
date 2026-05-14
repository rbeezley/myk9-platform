// Authoritative data access module for day-of-show operations.
// All callers import from here — never from supabaseClient directly.

export type {
  DayOfEntry,
  MoveUpRequest,
  ClassWithCapacity,
  ScratchRequest,
} from '../queries/dayOfOperationsTypes';

export {
  getClassesWithCapacity,
  createDayOfEntry,
  getShowDogs,
  searchDogs,
} from '../queries/dayOfEntryQueries';

export {
  processMoveUp,
  getMoveUpEligibleEntries,
  getPendingMoveUpRequests,
  approveMoveUpRequest,
  denyMoveUpRequest,
} from '../queries/moveUpQueries';

export {
  scratchEntry,
  getScratchableEntries,
  getScratchedEntries,
  requestScratch,
  getPendingScratchRequests,
  approveScratchRequest,
  denyScratchRequest,
  updateRefundStatus,
} from '../queries/scratchQueries';
