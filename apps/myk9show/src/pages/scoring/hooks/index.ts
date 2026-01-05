/**
 * Scoresheet Hooks
 *
 * Reusable hooks for AKC scoresheet components.
 * See docs/SCORESHEET_REFACTORING_PLAN.md for architecture details.
 */

export { useStopwatch } from './useStopwatch';
export type { UseStopwatchOptions, UseStopwatchReturn } from './useStopwatch';

export { useScoresheetCore } from './useScoresheetCore';
export type {
  ScoresheetCoreConfig,
  ScoresheetCoreReturn,
  ScoreSubmitData,
  ExtendedResult,
  NationalsResult
} from './useScoresheetCore';

export { useEntryNavigation } from './useEntryNavigation';
export type {
  EntryNavigationConfig,
  EntryNavigationReturn
} from './useEntryNavigation';

export { useElementTimer } from './useElementTimer';
export type { UseElementTimerReturn } from './useElementTimer';
