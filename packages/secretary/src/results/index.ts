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
// `describeAKCClass`, `AKCUnmappableClassError` and `AKCClassCodes` are
// deliberately NOT re-exported: they are internal to the formatter, and the
// package root should carry only what a consumer actually calls.
export { mapAKCClassCodes, collectUnmappableAKCClasses } from './formatters/akcClassCodes';
export type { UnmappableAKCClass } from './formatters/akcClassCodes';

// Auto-register built-in formatters on import
import { registerFormatter } from './registry';
import { AKCScentWorkFormatter } from './formatters/AKCScentWorkFormatter';

registerFormatter(AKCScentWorkFormatter);
