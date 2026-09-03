/**
 * Results submission module — barrel export.
 *
 * Importing this module auto-registers all built-in formatters so callers
 * can immediately use listFormatters() without manual setup.
 */

export type {
  SubmissionEntry,
  SubmissionShow,
  SubmissionTrial,
  SubmissionData,
  ResultFormatter,
  AKCOwnerAddress,
  AKCSubmissionEntry,
  AKCSubmissionData,
  AKCResultStatus,
} from './types';
export { registerFormatter, listFormatters } from './registry';
export { AKCScentWorkFormatter } from './formatters/AKCScentWorkFormatter';
export {
  classifyAKCEntryOutcome,
  akcResultCodesForOutcome,
  tallyAKCClass,
  countUnscoredAKCEntries,
  selectSubmittableAKCEntries,
  parseAKCResultStatus,
} from './formatters/akcEntryOutcome';
export type { AKCEntryOutcome, AKCClassTallies } from './formatters/akcEntryOutcome';

// Auto-register built-in formatters on import
import { registerFormatter } from './registry';
import { AKCScentWorkFormatter } from './formatters/AKCScentWorkFormatter';

registerFormatter(AKCScentWorkFormatter);
