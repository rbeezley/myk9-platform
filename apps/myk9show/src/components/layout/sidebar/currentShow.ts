/**
 * The "current show" rail item: the one show a secretary or club admin is working inside for days
 * or weeks, one tap from anywhere. Automatic, never pinned by hand (MYK9-1269).
 *
 * The pick is the Shows list's own Managing section, so the rail and the list never disagree:
 * Managing already puts the shows happening today first and then the upcoming ones soonest first
 * (`groupShowsForPane`). This module only adds the two memories around it: a choice made with
 * Switch, and the last managed show opened (the fallback once nothing is current).
 */

import type { Show } from '@/types/show-types';

const LAST_OPENED_KEY = 'myk9:current-show-last-opened';
const CHOICE_KEY = 'myk9:current-show-choice';

/** Longest label the 88px rail holds on two short lines before it is shortened. */
const RAIL_LABEL_MAX = 18;

export interface CurrentShowInputs<T extends Show = Show> {
  /** Managed shows that are not over, in the Shows list's Managing order (today first, then soonest). */
  managingShows: readonly T[];
  /** Every show the viewer manages and can see, over or not (the last-opened fallback's pool). */
  managedShows: readonly T[];
  lastOpenedId: string | null;
  /** A show picked with Switch; honoured only while that show is still in Managing. */
  rememberedChoice: string | null;
}

/**
 * Rules, in order: (1) a remembered Switch choice that is still current; (2) Managing's first
 * show (today's, else the next upcoming); (3) the last managed show opened; else none. A choice
 * whose show has ended is simply not in `managingShows`, so it drops out ("until that show ends").
 */
export function pickCurrentShow<T extends Show>({
  managingShows,
  managedShows,
  lastOpenedId,
  rememberedChoice,
}: CurrentShowInputs<T>): T | null {
  const chosen = rememberedChoice
    ? managingShows.find(show => show.id === rememberedChoice)
    : undefined;
  if (chosen) return chosen;
  if (managingShows.length > 0) return managingShows[0];
  const lastOpened = lastOpenedId ? managedShows.find(show => show.id === lastOpenedId) : undefined;
  return lastOpened ?? null;
}

/**
 * The rail label for a show name: whole words up to about 18 characters, then an ellipsis. A single
 * word wider than that is cut. The full name stays in the tooltip and the accessible name.
 */
export function truncateRailTitle(name: string, max: number = RAIL_LABEL_MAX): string {
  const trimmed = name.trim();
  if (trimmed.length <= max) return trimmed;
  const head = trimmed.slice(0, max);
  const lastSpace = head.lastIndexOf(' ');
  const wholeWords = trimmed[max] === ' ' || lastSpace <= 0 ? head : head.slice(0, lastSpace);
  return `${wholeWords.trimEnd()}…`;
}

/** Per-device memories. Storage can throw (private window, blocked site data): the answer is "none". */
function readKey(key: string): string | null {
  try {
    return window.localStorage.getItem(key) || null;
  } catch {
    return null;
  }
}

function writeKey(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // A lost memory only means the rail falls back to the next rule.
  }
}

export const readLastOpenedShowId = (): string | null => readKey(LAST_OPENED_KEY);
export const writeLastOpenedShowId = (id: string): void => writeKey(LAST_OPENED_KEY, id);
export const readCurrentShowChoice = (): string | null => readKey(CHOICE_KEY);
export const writeCurrentShowChoice = (id: string): void => writeKey(CHOICE_KEY, id);
