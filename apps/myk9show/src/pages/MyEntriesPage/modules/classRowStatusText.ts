/**
 * The words a My Shows class row says for each row state. One table, read by
 * the row and by the Home "Your entries today" card, so the card can never
 * disagree with the page it links to (MYK9-1524).
 *
 * @module MyEntriesPage/modules/classRowStatusText
 */

import { resultStatusLabel } from '@/components/common/resultStatusLabel';
import type { DayCheckInContext } from './dayCheckIn';
import type { MyShowClass } from './groupEntriesByShow';
import { deriveClassRowState, type ClassRowKind } from './myShowDogState';

/**
 * Copy and colour per state, chosen from the status vocabulary the rest of the
 * app already uses (`ENTRY_STATUS_DESCRIPTORS`) rather than a second palette.
 * `undefined` means the row renders something other than a plain word.
 */
export const STATE_WORDS: Partial<Record<ClassRowKind, { text: string; status: string }>> = {
  'in-ring': { text: 'in the ring', status: 'in-ring' },
  'at-gate': { text: 'at gate', status: 'at-gate' },
  'come-to-gate': { text: 'come to gate', status: 'come-to-gate' },
  conflict: { text: 'conflict', status: 'conflict' },
  // MYK9-632 resolves the MYK9-582 deviation recorded here. The owner's ruling
  // is that scratch and pull are the SAME act, so both rows say "pulled" — but
  // they are that act at different MOMENTS (day-of at the gate vs. before the
  // show), and the two descriptors are byte-identical (`complete` /
  // `text-muted-foreground`), so a bare capitalisation difference would leave
  // nothing for a screen reader to announce. The day-of row therefore says WHEN
  // rather than taking a second word for the same act.
  pulled: { text: 'pulled at the show', status: 'pulled' },
  withdrawn: { text: 'withdrawn', status: 'withdrawn' },
  scratched: { text: 'pulled', status: 'scratched' },
  // A move-up's source row went somewhere; it was not pulled.
  moved: { text: 'moved', status: 'moved' },
  'not-accepted': { text: 'not accepted', status: 'not_accepted' },
  'checked-in': { text: 'checked in', status: 'checked-in' },
};

/** Literal row copy for the kinds that are not a plain state word. */
export const CLASS_ROW_TEXT = {
  checkIn: 'Check in',
  opensLater: 'Check in on the day',
  closedToday: 'check in with the secretary',
  dayUnknown: 'trial date not loaded yet, check-in unavailable',
  notRun: 'not run',
  absent: 'absent',
} as const;

/**
 * The status or action text My Shows shows for a row kind, or `undefined` when
 * the row shows only a result badge or nothing at all.
 */
export function classRowStatusText(kind: ClassRowKind): string | undefined {
  const word = STATE_WORDS[kind];
  if (word) return word.text;
  switch (kind) {
    case 'check-in-available':
      return CLASS_ROW_TEXT.checkIn;
    case 'opens-later':
      return CLASS_ROW_TEXT.opensLater;
    case 'closed-today':
      return CLASS_ROW_TEXT.closedToday;
    case 'day-unknown':
      return CLASS_ROW_TEXT.dayUnknown;
    case 'not-run':
      return CLASS_ROW_TEXT.notRun;
    case 'absent':
      return CLASS_ROW_TEXT.absent;
    default:
      return undefined;
  }
}

/** The neutral line for a row that has no status word of its own. */
export const SEE_MY_SHOWS_TEXT = 'See My Shows';

export interface ClassRowDisplay {
  kind: ClassRowKind;
  /** The plain coloured word the row renders for this kind, if it has one. */
  word: { text: string; status: string } | undefined;
  /** Raw `result_status` the row names with a `ResultBadge`, if it does. */
  outcomeStatus: string | undefined;
  /** The one status text for this row; never empty. */
  text: string;
}

/**
 * Everything a class row's visible status is decided from, in one place. The
 * My Shows row renders from `kind`, `word` and `outcomeStatus`; the Home "Your
 * entries today" card renders `text`. Neither derives any of it again.
 */
export function classRowDisplay(cls: MyShowClass, ctx: DayCheckInContext): ClassRowDisplay {
  const { kind } = deriveClassRowState(cls, ctx);
  const word = STATE_WORDS[kind];
  const outcomeStatus =
    (kind === 'absent' || kind === 'result') && cls.resultStatus ? cls.resultStatus : undefined;
  const text =
    word?.text ??
    // A scored result is the exhibitor's reveal (My Shows holds it behind "New
    // result" until opened); the card has no seen-state, so it stays neutral.
    (kind === 'absent' && outcomeStatus ? resultStatusLabel(outcomeStatus) : undefined) ??
    classRowStatusText(kind) ??
    (kind === 'result' ? 'Result in' : SEE_MY_SHOWS_TEXT);
  return { kind, word, outcomeStatus, text };
}
