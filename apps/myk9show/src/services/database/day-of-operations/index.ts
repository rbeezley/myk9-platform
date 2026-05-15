// Authoritative data access module for day-of-show operations.
// All callers import from here — never from supabaseClient directly.

export type { DayOfEntry, MoveUpRequest, ClassWithCapacity, ScratchRequest } from './types';

export { getClassesWithCapacity, createDayOfEntry, getShowDogs, searchDogs } from './entries';

export {
  processMoveUp,
  getMoveUpEligibleEntries,
  getPendingMoveUpRequests,
  approveMoveUpRequest,
  denyMoveUpRequest,
} from './move-up';

export {
  scratchEntry,
  getScratchableEntries,
  getScratchedEntries,
  requestScratch,
  getPendingScratchRequests,
  approveScratchRequest,
  denyScratchRequest,
  updateRefundStatus,
} from './scratch';
