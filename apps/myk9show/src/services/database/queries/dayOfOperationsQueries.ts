/**
 * Day-of Operations Queries - Barrel Export
 *
 * Re-exports all day-of-show operation modules for backward compatibility.
 * The actual implementations live in focused domain modules:
 * - dayOfOperationsTypes.ts - Shared interfaces
 * - dayOfEntryQueries.ts - Walk-in entries, class capacity, dog search
 * - moveUpQueries.ts - Move-up processing and request management
 * - scratchQueries.ts - Scratch handling, requests, and refunds
 */

// Types
export type { DayOfEntry, MoveUpRequest, ClassWithCapacity, ScratchRequest } from './dayOfOperationsTypes';

// Day-of entry operations
export { getClassesWithCapacity, createDayOfEntry, getShowDogs, searchDogs } from './dayOfEntryQueries';

// Move-up operations
export { processMoveUp, getMoveUpEligibleEntries, getPendingMoveUpRequests, approveMoveUpRequest, denyMoveUpRequest } from './moveUpQueries';

// Scratch and refund operations
export { scratchEntry, getScratchableEntries, getScratchedEntries, requestScratch, getPendingScratchRequests, approveScratchRequest, denyScratchRequest, updateRefundStatus } from './scratchQueries';
