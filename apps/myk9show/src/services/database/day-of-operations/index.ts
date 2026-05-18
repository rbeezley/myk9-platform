// Authoritative data access module for day-of-show operations.
// All callers import from here — never from supabaseClient directly.

export type {
  DayOfEntry,
  DayOfEntryDogResult,
  MoveUpRequest,
  ClassWithCapacity,
  ScratchRequest,
  CreateDayOfEntryDogInput,
} from './types';

export { getClassesWithCapacity, createDayOfEntry, getShowDogs, searchDogs } from './entries';
export { createDayOfEntryDog } from './late-entry-dog';

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
