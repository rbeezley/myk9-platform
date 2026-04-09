/**
 * Results submission module — barrel export.
 *
 * Importing this module auto-registers all built-in formatters so callers
 * can immediately use getFormatter() / listFormatters() without manual setup.
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
} from './types';
export { registerFormatter, getFormatter, listFormatters, clearFormatters } from './registry';
export { AKCScentWorkFormatter } from './formatters/AKCScentWorkFormatter';

// Auto-register built-in formatters on import
import { registerFormatter } from './registry';
import { AKCScentWorkFormatter } from './formatters/AKCScentWorkFormatter';

registerFormatter(AKCScentWorkFormatter);
