// Authoritative data access module for day-of-show operations.
// All callers import from here — never from supabaseClient directly.

export type {
  DayOfEntry,
  DayOfEntryDogResult,
  MoveUpRequest,
  ClassWithCapacity,
  CreateDayOfEntryDogInput,
} from './types';

export { getClassesWithCapacity, createDayOfEntry, searchDogs } from './entries';
export { createDayOfEntryDog } from './late-entry-dog';

export { getMoveUpEligibleEntries, getPendingMoveUpRequests, denyMoveUpRequest } from './move-up';

export { pullEntry, getPullableEntries, getPulledEntries, updateRefundStatus } from './scratch';
