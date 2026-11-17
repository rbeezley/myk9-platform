// The database side of the show reminder (MYK9-2113): the reads and marks only the reminder
// needs. Shows, recipients, judges, rendering, sending and the log are the full confirmation's own
// (confirmationDeps in index.ts), so the two emails cannot drift apart in who they reach or how
// they are sent.

import { readAllPages, type PageResult } from './pagedRead.ts';
import type { ConfirmationEntry } from './entryConfirmations.ts';
import type { EntryConfirmationDeps } from './entryConfirmationRun.ts';
import type { EntryReminderDeps } from './entryReminderRun.ts';

/** The slice of the Supabase client the reminder touches (the real client satisfies it). */
// deno-lint-ignore no-explicit-any
type Client = { from(table: string): any };

/** Claimable now: unstamped, or a 'pending' stamp older than `staleBeforeIso` (a crashed run). */
const claimable = (staleBeforeIso: string) =>
  `reminder_email_sent_at.is.null,and(reminder_email_status.eq.pending,reminder_email_sent_at.lt.${staleBeforeIso})`;

const REMINDER_ENTRY_SELECT =
  'id, show_id, trial_id, class_id, registration_id, handler_id, dog_id, armband, entry_fee, reminder_email_status, reminder_email_sent_at, updated_at, dog:dogs(name, call_name, breed, sex), class:classes(name, level, element)';

export function reminderDeps(
  supabase: Client,
  shared: Pick<
    EntryConfirmationDeps,
    'now' | 'siteUrl' | 'loadShows' | 'loadRecipients' | 'loadJudges' | 'render' | 'send' | 'log'
  >
): EntryReminderDeps {
  return {
    ...shared,
    // The shared writer reports the log row's id (the confirmation job links it); the reminder does not.
    log: async row => {
      await shared.log(row);
    },
    loadEntries: (showIds, staleBeforeIso) =>
      readAllPages<ConfirmationEntry>(
        (from, to) =>
          supabase
            .from('entries')
            .select(REMINDER_ENTRY_SELECT)
            .in('show_id', showIds)
            .eq('entry_status', 'confirmed')
            .is('deleted_at', null)
            .in('reminder_email_status', ['pending', 'failed'])
            .or(claimable(staleBeforeIso))
            .order('id', { ascending: true })
            .range(from, to) as PromiseLike<PageResult<ConfirmationEntry>>,
        'Could not read entries for the reminder'
      ),
    loadSentEntries: showIds =>
      readAllPages<ConfirmationEntry>(
        (from, to) =>
          supabase
            .from('entries')
            .select(REMINDER_ENTRY_SELECT)
            .in('show_id', showIds)
            .eq('entry_status', 'confirmed')
            .is('deleted_at', null)
            .eq('reminder_email_status', 'sent')
            .order('id', { ascending: true })
            .range(from, to) as PromiseLike<PageResult<ConfirmationEntry>>,
        'Could not read sent reminders'
      ),
    markCovered: async entryIds => {
      // Only entries still owed one: never overwrite 'sent'.
      const { error } = await supabase
        .from('entries')
        .update({ reminder_email_status: 'covered' })
        .in('id', entryIds)
        .in('reminder_email_status', ['pending', 'failed']);
      if (error) {
        console.error('Could not mark reminders covered', {
          message: error.message,
          entries: entryIds.length,
        });
      }
    },
    claim: async (entryIds, nowIso, staleBeforeIso) => {
      const { data, error } = await supabase
        .from('entries')
        .update({ reminder_email_sent_at: nowIso })
        .in('id', entryIds)
        .in('reminder_email_status', ['pending', 'failed'])
        .or(claimable(staleBeforeIso))
        .eq('entry_status', 'confirmed')
        .is('deleted_at', null)
        .select('id');
      if (error) throw new Error(`Could not claim reminders: ${error.message}`);
      return ((data ?? []) as Array<{ id: string }>).map(row => row.id);
    },
    markSent: async entryIds => {
      const { error } = await supabase
        .from('entries')
        .update({ reminder_email_status: 'sent' })
        .in('id', entryIds);
      // The claim already stands, so the entries are not sent again; only the status lags.
      if (error) {
        console.error('Could not mark reminders sent', {
          message: error.message,
          entries: entryIds.length,
        });
      }
    },
    markFailed: async entryIds => {
      const { error } = await supabase
        .from('entries')
        .update({ reminder_email_sent_at: null, reminder_email_status: 'failed' })
        .in('id', entryIds);
      if (error) {
        console.error('Could not release reminders', {
          message: error.message,
          entries: entryIds.length,
        });
      }
    },
  };
}
