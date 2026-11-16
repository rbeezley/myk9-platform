import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.1';

import type { SheetPrintRow } from '../_shared/paperwork/printState.ts';
import { classPrintsCoverDay } from '../_shared/trialPacket/printReminder.ts';
import {
  CLASS_FINGERPRINT_COLUMNS,
  ENTRY_FINGERPRINT_COLUMNS,
  toFingerprintClassRow,
  toFingerprintEntryRow,
} from './classPrintRows.ts';

/** PostgREST's default response cap is 1000 rows; a page is never larger. */
const PAGE_SIZE = 1000;

/**
 * Every row of a query, in an ordered `.range()` loop that stops at the first short page. A
 * failed page returns null, which the caller reads as "not covered".
 */
async function readAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>
): Promise<T[] | null> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) return null;
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return rows;
  }
}

/**
 * Whether the before-trial packet's per-class prints cover this day (MYK9-2086 part B).
 *
 * Reads the day's trials, their live classes and entries, and the show's check-in-sheet and
 * scoresheet prints. ANY read failure answers `false`: this is only ever a second way to be
 * printed, and a reminder silenced by a failed read is the one failure the feature exists to
 * prevent (see printReminder.ts). The cost of being wrong is one extra reminder.
 */
export async function loadClassPrintsCoverDay(
  supabase: SupabaseClient,
  showId: string,
  trialDate: string
): Promise<boolean> {
  try {
    const { data: trials, error: trialsError } = await supabase
      .from('trials')
      .select('id, status')
      .eq('show_id', showId)
      .eq('date', trialDate)
      .is('deleted_at', null);
    if (trialsError) return false;
    const trialIds = ((trials ?? []) as { id: string; status: string | null }[])
      .filter(trial => trial.status !== 'cancelled')
      .map(trial => trial.id);
    if (trialIds.length === 0) return false;

    const { data: classRows, error: classesError } = await supabase
      .from('classes')
      .select(CLASS_FINGERPRINT_COLUMNS)
      .in('trial_id', trialIds)
      .is('deleted_at', null);
    if (classesError) return false;
    const classes = ((classRows ?? []) as unknown as Record<string, unknown>[])
      .filter(classItem => classItem.status !== 'cancelled')
      .map(toFingerprintClassRow);
    if (classes.length === 0) return false;
    const classIds = classes.map(classItem => classItem.id);

    const entryRows = await readAllPages<Record<string, unknown>>((from, to) =>
      supabase
        .from('entries')
        .select(ENTRY_FINGERPRINT_COLUMNS)
        .in('class_id', classIds)
        .is('deleted_at', null)
        .order('id', { ascending: true })
        .range(from, to)
    );
    if (!entryRows) return false;

    const prints = await readAllPages<SheetPrintRow>((from, to) =>
      supabase
        .from('paperwork_prints')
        .select('id, report_id, coverage, printed_at, voided_at')
        .eq('show_id', showId)
        .in('report_id', ['check-in-sheet', 'scoresheet'])
        .is('voided_at', null)
        .order('id', { ascending: true })
        .range(from, to)
    );
    if (!prints) return false;

    return classPrintsCoverDay({
      showId,
      classes,
      entries: entryRows.map(toFingerprintEntryRow),
      prints,
    });
  } catch {
    return false;
  }
}
