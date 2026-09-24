/**
 * Entry validation and limit checking.
 *
 * `OfflineEntryCreator` was deleted with MYK9-676: it had no production caller,
 * and it looked trials up on the show store's `trials`, which was always empty.
 */

export { EntryValidator } from './EntryValidator';
export type {
  EntryValidationContext,
  EntryValidationError,
  EntryValidationResult,
} from './EntryValidator';

export { EntryLimitChecker } from './EntryLimitChecker';
export type {
  EntryLimitError,
  EntryLimitCheckResult,
  LimitCheckContext,
} from './EntryLimitChecker';

/**
 * Quick Start Guide:
 *
 * 1. Validation Only:
 * ```typescript
 * import { EntryValidator } from '@/services/entries';
 *
 * const validationResult = await EntryValidator.validateEntry(entryData, context);
 * ```
 *
 * 2. Limit Checking:
 * ```typescript
 * import { EntryLimitChecker } from '@/services/entries';
 *
 * const limitResult = EntryLimitChecker.checkEntryLimits(entryData, context);
 * const classStats = EntryLimitChecker.getClassEntryStats(classId, entries, classData);
 * ```
 */

/**
 * System Features:
 *
 * ✅ Complete Offline Operation
 * - All validation and limit checking works without server connectivity
 * - Optimistic updates with local data
 * - Queue sync operations for when online
 *
 * ✅ Comprehensive Validation
 * - Required field validation
 * - Age and size restrictions
 * - Eligibility checking
 * - Deadline validation
 * - Handler restrictions
 * - Competition data validation
 *
 * ✅ Entry Limit Management
 * - Class capacity limits
 * - Duplicate entry prevention
 * - Per-dog entry limits
 * - Trial and show limits
 * - Handler limits
 * - Waitlist management
 *
 * ✅ Error Handling
 * - Detailed error messages with codes
 * - Warning vs error severity
 * - Graceful fallbacks
 * - Rollback on batch failures
 *
 * ✅ User Experience
 * - Real-time validation feedback
 * - Progress indicators
 * - Optimistic UI updates
 * - Toast notifications
 * - Detailed error explanations
 *
 * ✅ Performance
 * - Efficient batch operations
 * - Validation caching
 * - Minimal re-renders
 * - Background sync queuing
 *
 * ✅ Testing
 * - Comprehensive test suite
 * - Edge case coverage
 * - Performance testing
 * - Integration tests
 */
