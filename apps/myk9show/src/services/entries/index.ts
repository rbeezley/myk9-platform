
/**
 * Offline Entry Creation System
 * 
 * A comprehensive system for creating dog show entries completely offline
 * with full validation, limit checking, and optimistic updates.
 */

export { EntryValidator } from './EntryValidator';
export type { 
  EntryValidationContext,
  EntryValidationError,
  EntryValidationResult 
} from './EntryValidator';

export { EntryLimitChecker } from './EntryLimitChecker';
export type { 
  EntryLimitError,
  EntryLimitCheckResult,
  LimitCheckContext 
} from './EntryLimitChecker';

export { OfflineEntryCreator } from './OfflineEntryCreator';
export type { 
  EntryCreationOptions,
  EntryCreationResult,
  BatchEntryCreationResult 
} from './OfflineEntryCreator';

// Re-export hook for easy access
export { useOfflineEntryCreation } from '@/hooks/useOfflineEntryCreation';
export type { 
  OfflineEntryCreationState,
  OfflineEntryCreationActions,
  UseOfflineEntryCreationResult 
} from '@/hooks/useOfflineEntryCreation';

// Re-export enhanced component
export { OfflineClassSelectionStep } from '@/components/shows/RegistrationWorkflow/OfflineClassSelectionStep';

/**
 * Quick Start Guide:
 * 
 * 1. Basic Entry Creation:
 * ```typescript
 * import { OfflineEntryCreator } from '@/services/entries';
 * 
 * const result = await OfflineEntryCreator.createEntry(entryData, {
 *   userId: 'current-user',
 *   allowWaitlist: true
 * });
 * 
 * if (result.success) {
 *   logger.debug('Entry created:', 'entries', { data: result.entry });
 * } else {
 *   logger.debug('Errors:', 'entries', { data: result.errors });
 * }
 * ```
 * 
 * 2. Using the React Hook:
 * ```typescript
 * import { useOfflineEntryCreation } from '@/services/entries';
 * 
 * function MyComponent() {
 *   const { createEntry, isCreating, lastValidation } = useOfflineEntryCreation();
 *   
 *   const handleSubmit = async () => {
 *     const result = await createEntry(entryData);
 *     // Handle result...
 *   };
 * }
 * ```
 * 
 * 3. Batch Entry Creation:
 * ```typescript
 * const batchResult = await OfflineEntryCreator.createBatchEntries(entriesArray, {
 *   ignoreWarnings: false,
 *   allowWaitlist: true
 * });
 * ```
 * 
 * 4. Validation Only:
 * ```typescript
 * import { EntryValidator } from '@/services/entries';
 * 
 * const validationResult = await EntryValidator.validateEntry(entryData, context);
 * ```
 * 
 * 5. Limit Checking:
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