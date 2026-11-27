/**
 * MYK9-1945 / MYK9-2428: what the close step records in `show_close_notes`.
 *
 * The table holds `closed_open_lines` (jsonb array) and `reopen_reason` (text) only; there is no
 * person or time column (owner decision 2026-11-25: no migration). The time also lives on
 * `shows.reopened_at`; the reason, the person and the time are kept together in the one text
 * column so the note reads on its own.
 */
import type { WhatIsLeftLine } from '@/features/show-closeout/whatIsLeft';

// A type alias, not an interface: it is stored in a jsonb column, which needs an index signature.
export type ClosedOpenLine = { key: string; count: number | null };

/**
 * The unticked lines of the Finish list: open, or not readable and worded as a close concern.
 * A ticked line, and a line this screen cannot say anything about, are not recorded.
 */
export function closedOpenLinesFrom(lines: readonly WhatIsLeftLine[]): ClosedOpenLine[] {
  return lines
    .filter(line => line.open === true || (line.open === null && line.closeConcern !== undefined))
    .map(line => ({ key: line.key, count: line.count }));
}

/** The text stored in `show_close_notes.reopen_reason`. */
export function formatReopenNote(input: { reason: string; person: string; at: string }): string {
  return `${input.reason.trim()}\n\nReopened by ${input.person} at ${input.at}`;
}
