// The Supabase side of the full confirmation sender (MYK9-1999): the reads, the claim and the
// marker writes behind FullConfirmationStore. Deno-free (the client is passed in).

import { loadJudgeNamesByClass, type ClassJudgeClient } from '../_shared/exhibitorEmailFacts.ts';
import { loadConfirmationNumbers } from './receiptNumbers.ts';
import { ACCEPTED_ENTRY_STATUSES, SENDABLE_SHOW_STATUSES } from './fullConfirmation.ts';
import type {
  ConfirmationShowFacts,
  EmailLogInput,
  FullConfirmationStore,
} from './fullConfirmationSender.ts';

const ENTRY_COLUMNS = `
  id, show_id, class_id, trial_id, registration_id, armband, entry_fee, entry_status,
  check_in_status, confirmation_email_sent_at, confirmation_email_status,
  dog:dogs(name, call_name, breed, sex, owner_id),
  class:classes(name, level, element),
  registration:enrollments(handler_id)`;

const SHOW_COLUMNS =
  'id, name, status, deleted_at, start_date, end_date, venue_name, address, city, state, zip_code, latitude, longitude, organization, style, brand_color, confirmation_message, experience_is_published, experience_published_style, experience_published_content';

// deno-lint-ignore no-explicit-any
type AnyClient = any;

export function createFullConfirmationStore(
  supabase: AnyClient,
  options: {
    today: string;
    onLogError: (error: unknown) => void;
    /** Run one show only (an operator's call with { show_id }). */
    showId?: string | null;
  }
): FullConfirmationStore {
  return {
    async listDueEntries(limit) {
      // Only published, not-yet-over shows: a draft's pending entries must not fill the read.
      let query = supabase
        .from('entries')
        .select(`${ENTRY_COLUMNS}, show:shows!inner(status, deleted_at, end_date)`)
        .is('confirmation_email_sent_at', null)
        .eq('confirmation_email_status', 'pending')
        .in('entry_status', [...ACCEPTED_ENTRY_STATUSES])
        .not('armband', 'is', null)
        .is('deleted_at', null)
        .in('show.status', [...SENDABLE_SHOW_STATUSES])
        .is('show.deleted_at', null)
        .gte('show.end_date', options.today)
        .order('updated_at', { ascending: true })
        .limit(limit);
      if (options.showId) query = query.eq('show_id', options.showId);
      const { data, error } = await query;
      if (error) {
        console.error('Could not read due full confirmations', { message: error.message });
        return [];
      }
      return data ?? [];
    },

    async loadShowFacts(showId): Promise<ConfirmationShowFacts | null> {
      const { data: show, error: showError } = await supabase
        .from('shows')
        .select(SHOW_COLUMNS)
        .eq('id', showId)
        .maybeSingle();
      if (showError || !show) return null;
      const { data: trials, error: trialError } = await supabase
        .from('trials')
        .select('id, name, trial_number, date, registry_id')
        .eq('show_id', showId)
        .is('deleted_at', null)
        .order('display_order', { ascending: true });
      if (trialError) return null;
      const { data: entries, error: entryError } = await supabase
        .from('entries')
        .select(ENTRY_COLUMNS)
        .eq('show_id', showId)
        .in('entry_status', [...ACCEPTED_ENTRY_STATUSES])
        .is('deleted_at', null);
      if (entryError) return null;
      const rows = entries ?? [];
      return {
        show,
        trials: trials ?? [],
        entries: rows,
        judgesByClass: await loadJudgeNamesByClass(
          supabase as ClassJudgeClient,
          rows.map((row: { class_id: string | null }) => row.class_id)
        ),
        confirmationNumbers: await loadConfirmationNumbers(
          supabase,
          rows.map((row: { registration_id: string | null }) => row.registration_id)
        ),
      };
    },

    async loadPerson(personId) {
      const { data, error } = await supabase
        .from('people')
        .select('first_name, last_name, email')
        .eq('id', personId)
        .maybeSingle();
      if (error) throw new Error(`Could not read person ${personId}`);
      return data ?? null;
    },

    async claim(entryIds, nowIso) {
      const { data, error } = await supabase
        .from('entries')
        .update({ confirmation_email_sent_at: nowIso })
        .in('id', entryIds)
        .is('confirmation_email_sent_at', null)
        .eq('confirmation_email_status', 'pending')
        .select('id');
      if (error) throw new Error('Could not claim full confirmation entries');
      return (data ?? []).map((row: { id: string }) => row.id);
    },

    async markSent(entryIds, messageId) {
      const { error } = await supabase
        .from('entries')
        .update({ confirmation_email_status: 'sent', confirmation_email_message_id: messageId })
        .in('id', entryIds);
      // The claim already stamped sent_at, so a failed write here cannot cause a second email.
      if (error) console.error('Could not mark full confirmation sent', { message: error.message });
    },

    async release(entryIds) {
      const { error } = await supabase
        .from('entries')
        .update({ confirmation_email_sent_at: null })
        .in('id', entryIds);
      if (error)
        console.error('Could not release a full confirmation claim', { message: error.message });
    },

    async markUndeliverable(entryIds) {
      const { error } = await supabase
        .from('entries')
        .update({ confirmation_email_status: 'failed' })
        .in('id', entryIds)
        .is('confirmation_email_sent_at', null);
      if (error)
        console.error('Could not mark a full confirmation undeliverable', {
          message: error.message,
        });
    },

    async logEmail(row: EmailLogInput) {
      const { error } = await supabase.from('email_log').insert({
        recipient_email: row.recipientEmail,
        email_type: 'heritage_confirmation',
        related_id: row.anchorEntryId,
        resend_message_id: row.resendMessageId ?? null,
        status: row.status,
        status_updated_at: new Date().toISOString(),
        error_message: row.errorMessage ?? null,
        show_id: row.showId,
        subject: row.subject,
        body_html: row.bodyHtml,
      });
      if (error) options.onLogError(error);
    },
  };
}
