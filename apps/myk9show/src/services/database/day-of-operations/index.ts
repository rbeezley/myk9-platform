// Authoritative data access module for day-of-show operations.
// All callers import from here — never from supabaseClient directly.

export type {
  DayOfEntry,
  DayOfEntryDogResult,
  MoveUpRequest,
  ClassWithCapacity,
  PullRecord,
  CreateDayOfEntryDogInput,
} from './types';

export { getClassesWithCapacity, createDayOfEntry, getShowDogs, searchDogs } from './entries';
export { createDayOfEntryDog } from './late-entry-dog';

export {
  getMoveUpEligibleEntries,
  getPendingMoveUpRequests,
  denyMoveUpRequest,
} from './move-up';

export {
  pullEntry,
  getPullableEntries,
  getPulledEntries,
  requestPull,
  getPendingPullRequests,
  approvePullRequest,
  denyPullRequest,
  updateRefundStatus,
} from './scratch';
