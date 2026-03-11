/**
 * @myk9/scoring-ui
 *
 * Shared UI hooks and utilities for dog show scoring.
 * Used by both myK9Q and myK9Show for consistent scoring experience.
 *
 * @example
 * ```typescript
 * import { useStopwatch, useEntryListFilters } from '@myk9/scoring-ui';
 *
 * // Timer with auto-stop and warnings
 * const stopwatch = useStopwatch({
 *   maxTime: "3:00",
 *   level: "Novice",
 *   onTimeExpired: (time) => console.log('Time up:', time),
 * });
 *
 * // Entry list filtering and sorting
 * const { filteredEntries, sortBy, setSortBy } = useEntryListFilters({
 *   entries,
 *   prioritizeInRing: true,
 * });
 * ```
 */

// Hooks
export { useStopwatch } from './hooks/useStopwatch';
export { useElementTimer } from './hooks/useElementTimer';
export { useEntryListFilters } from './hooks/useEntryListFilters';
export { useDragAndDropEntries } from './hooks/useDragAndDropEntries';
export { useScoresheetScoring } from './hooks/useScoresheetScoring';

// Phase 1: Quick Win Hooks (Sprint 25)
export {
  useHapticFeedback,
  haptic,
  type HapticPattern,
  type HapticFeedbackAPI,
} from './hooks/useHapticFeedback';
export { useDebounce } from './hooks/useDebounce';
export { useIsTouchDevice } from './hooks/useIsTouchDevice';
export {
  useLongPress,
  type UseLongPressOptions,
  type LongPressHandlers,
} from './hooks/useLongPress';
export {
  useSwipeGesture,
  useSwipeToAction,
  type SwipeDirection,
  type SwipeGestureOptions,
  type SwipeGestureHandlers,
  type SwipeToActionOptions,
  type SwipeToActionHandlers,
  type SwipeToActionReturn,
} from './hooks/useSwipeGesture';

// Phase 3: Extracted Hooks (Sprint 25)
export { useDialogState, type DialogState } from './hooks/useDialogState';
export {
  useNotificationPermissions,
  type NotificationPermissionStatus,
  type UseNotificationPermissionsOptions,
  type UseNotificationPermissionsReturn,
} from './hooks/useNotificationPermissions';
export {
  useAnimationSettings,
  useAnimationProps,
  useAnimationDuration,
  useCanAnimate,
  useSpringConfig,
  useThrottledRaf,
  usePrefersReducedMotion,
  useAnimationClasses,
  createAnimationSettingsProvider,
  type AnimationConfig,
  type AnimationSettingsInput,
  type AnimationSettingsProvider,
} from './hooks/useAnimationSettings';

// Utils
export {
  formatMilliseconds,
  formatSecondsToMMSS,
  formatSecondsToTime,
  convertTimeToSeconds,
  formatTimeForDisplay,
  formatTimeLimitSeconds,
  parseTimeToMs,
  formatTimeInputToMMSS,
} from './utils/timeUtils';
export { buildResolvedClassRules } from './utils/buildResolvedClassRules';
export { parseSmartTime } from './utils/parseSmartTime';
export { getScoresheetComponent, registerScoresheet } from './utils/getScoresheetComponent';

// Types
export type {
  BaseEntry,
  TimerFormatOptions,
  StopwatchOptions,
  StopwatchReturn,
  ElementTimerReturn,
  TabType,
  SortType,
  SectionFilter,
  EntryListFiltersOptions,
  EntryListFiltersReturn,
  DragAndDropOptions,
  DragAndDropReturn,
  ResolvedClassRules,
  ClassRuleFields,
} from './types';

export type {
  ScoresheetScoringConfig,
  ScoresheetScoringReturn,
  ValidationResult,
} from './hooks/useScoresheetScoring';

export type {
  QualifyingResult,
  NationalsResult,
  ExtendedResult,
  AreaScore,
  ScoreData,
  ScoresheetEntry,
  ScoresheetClassInfo,
  ScoresheetSportType,
  BaseScoresheetProps,
  LiveScoresheetProps,
  EntryScoresheetProps,
} from './types';

// Scoresheets - AKC
export { AKCScentWorkScoresheet } from './components/scoresheets/AKC/AKCScentWorkScoresheet';
export { AKCScentWorkLiveScoresheet } from './components/scoresheets/AKC/AKCScentWorkLiveScoresheet';
export { AKCScentWorkEntryScoresheet } from './components/scoresheets/AKC/AKCScentWorkEntryScoresheet';
export { AKCNationalsScoresheet } from './components/scoresheets/AKC/AKCNationalsScoresheet';
export { AKCFastCatScoresheet } from './components/scoresheets/AKC/AKCFastCatScoresheet';

// Scoresheets - UKC
export { UKCNoseworkScoresheet } from './components/scoresheets/UKC/UKCNoseworkScoresheet';
export { UKCRallyScoresheet } from './components/scoresheets/UKC/UKCRallyScoresheet';
export { UKCObedienceScoresheet } from './components/scoresheets/UKC/UKCObedienceScoresheet';

// Scoresheets - ASCA
export { ASCAScentDetectionScoresheet } from './components/scoresheets/ASCA/ASCAScentDetectionScoresheet';
