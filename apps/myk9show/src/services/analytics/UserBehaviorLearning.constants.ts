/** Maximum number of actions to retain in history */
export const MAX_HISTORY_SIZE = 1000;

/** Minimum frequency for a pattern to be considered significant */
export const MIN_PATTERN_FREQUENCY = 3;

/** Number of days before pattern data is considered stale */
export const PATTERN_DECAY_DAYS = 30;

/** Interval in ms for periodic pattern analysis (1 hour) */
export const ANALYSIS_INTERVAL_MS = 60 * 60 * 1000;

/** Interval in ms for persisting data to storage (5 minutes) */
export const STORAGE_SAVE_INTERVAL_MS = 5 * 60 * 1000;

/** LocalStorage keys for behavior data */
export const STORAGE_KEYS = {
  BEHAVIOR_HISTORY: 'myk9show-behavior-history',
  USER_PROFILES: 'myk9show-user-profiles',
  BEHAVIOR_PATTERNS: 'myk9show-behavior-patterns',
} as const;

/** Common words to filter out when normalizing search queries */
export const SEARCH_COMMON_WORDS = [
  'the',
  'a',
  'an',
  'and',
  'or',
  'but',
  'in',
  'on',
  'at',
  'to',
  'for',
  'of',
  'with',
  'by',
];
