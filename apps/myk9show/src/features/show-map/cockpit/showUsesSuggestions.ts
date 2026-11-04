import { resolveShowUses, type ShowUses } from '@/features/show-workbench/showUses';

/**
 * Discoverability for the "This show uses..." switches (MYK9-1686): one quiet, dismissible
 * suggestion per switch that is off, shown once per show per device and never repeated. A
 * per-device localStorage flag is the existing pattern for dismissals; no column, no migration.
 */
export type SuggestionKey =
  'selfCheckin' | 'deviceScoring' | 'paperPacket' | 'volunteers' | 'landingPage';

export interface ShowUsesSuggestion {
  key: SuggestionKey;
  text: string;
}

/** Fixed order; the first off, undismissed switch wins. "Own premium" has nothing to suggest. */
const SUGGESTIONS: readonly {
  key: SuggestionKey;
  text: string;
  isOff: (state: UsesState) => boolean;
}[] = [
  {
    key: 'selfCheckin',
    text: 'Want exhibitors to check themselves in?',
    isOff: state => state.selfCheckinEnabled === false,
  },
  {
    key: 'deviceScoring',
    text: 'Want judges to score on their phones?',
    isOff: state => !state.uses.usesDeviceScoring,
  },
  {
    key: 'paperPacket',
    text: 'Want a printed backup packet for show day?',
    isOff: state => !state.uses.usesPaperPacket,
  },
  {
    key: 'volunteers',
    text: 'Want to track volunteer helpers?',
    isOff: state => !state.uses.usesVolunteers,
  },
  {
    key: 'landingPage',
    text: 'Want a public landing page for this show?',
    isOff: state => !state.uses.usesLandingPage,
  },
];

interface UsesState {
  uses: ShowUses;
  /** `show_visibility_settings.self_checkin_enabled`; undefined while unread (never suggested). */
  selfCheckinEnabled: boolean | undefined;
}

const KEY_PREFIX = 'myk9:show-uses-suggestion-dismissed';

function storageKey(showId: string, key: SuggestionKey): string {
  return `${KEY_PREFIX}:${showId}:${key}`;
}

/** Unreadable storage counts as dismissed: when in doubt, never nag. */
export function isSuggestionDismissed(showId: string, key: SuggestionKey): boolean {
  try {
    return window.localStorage.getItem(storageKey(showId, key)) !== null;
  } catch {
    return true;
  }
}

export function dismissSuggestion(showId: string, key: SuggestionKey): void {
  try {
    window.localStorage.setItem(storageKey(showId, key), '1');
  } catch {
    // Storage unavailable: the suggestion is already treated as dismissed on the next read.
  }
}

/** The one suggestion to show now, or null. */
export function pickSuggestion(
  showId: string,
  show: Parameters<typeof resolveShowUses>[0],
  selfCheckinEnabled: boolean | undefined
): ShowUsesSuggestion | null {
  const state: UsesState = { uses: resolveShowUses(show), selfCheckinEnabled };
  const hit = SUGGESTIONS.find(
    item => item.isOff(state) && !isSuggestionDismissed(showId, item.key)
  );
  return hit ? { key: hit.key, text: hit.text } : null;
}
