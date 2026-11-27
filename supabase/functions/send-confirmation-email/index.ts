// supabase/functions/send-confirmation-email/index.ts
//
// The full confirmation (MYK9-1999): armband, judge, classes, street address with directions and
// the secretary's note, once per exhibitor per show, as soon as her entry is accepted. The rules
// are in entryConfirmations.ts and entryConfirmationRun.ts; this file wires them to the database
// and Resend. The secretary sets no date: trials.confirmation_date no longer decides anything.
//
// Callers (pg_cron, with the HERITAGE_CONFIRMATION_SECRET header):
//   heritage-confirmation-emails  daily 09:00 UTC, body {}: retries failed receipts
//                                 (receiptSweep.ts), then sends new and retries failed
//                                 confirmations.
//   entry-confirmation-emails     every 15 minutes, body {"scope":"new"}: sends confirmations
//                                 never tried (migration 20261115065613).
//   exhibitor-reminder-emails     every 10 minutes, body {"scope":"reminder"}: the reminder two days before
//                                 a show's first day (MYK9-2113, entryReminderRun.ts); sends
//                                 nothing else and runs no receipt retry.
//
// Deploy: supabase functions deploy send-confirmation-email --project-ref sojmvhhwsjxmfistvzbe --no-verify-jwt

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { sendResendEmailWithRetry } from '../_shared/resendEmail.ts';
import { requireEmailLogWrite } from '../_shared/emailLog.ts';
import { storeEmailContent } from '../_shared/emailLogContent.ts';
import {
  JUDGE_ASSIGNMENT_NAME_SELECT,
  judgeNamesByClass,
  type JudgeAssignmentNameRow,
} from '../_shared/exhibitorEmailDetails.ts';

import { handle, type HandlerCtx } from '../_shared/http/handler.ts';
import { MYK9SHOW_ORIGINS } from '../_shared/http/cors.ts';
import { HttpError } from '../_shared/http/responses.ts';

import { requireConfirmationEmailSecret } from './auth.ts';
import { loadConfirmationNumbers } from './receiptNumbers.ts';
import {
  sweepFailedReceipts,
  type ReceiptResendOutcome,
  type ReceiptSweepClient,
} from './receiptSweep.ts';
import {
  CONFIRMATION_LIVE_SHOW_STATUSES,
  CONFIRMATION_ROW_LIMIT,
  latestAcceptanceGenerations,
  type AcceptanceHistoryRow,
  showRegistry,
  type ConfirmationEntry,
  type ConfirmationRecipient,
  type ConfirmationShow,
} from './entryConfirmations.ts';
import { runEntryConfirmations, type EntryConfirmationDeps } from './entryConfirmationRun.ts';
import { runEntryReminders } from './entryReminderRun.ts';
import { reminderDeps } from './entryReminderDeps.ts';
import { renderConfirmationEmail } from './renderConfirmationEmail.ts';
import { claimableFilter } from './confirmationFilter.ts';
import { insertEmailLogOnce } from './emailLogOnce.ts';
import { readAllPages, type PageResult } from './pagedRead.ts';

const FROM_EMAIL = 'myK9Show <notifications@myk9show.com>';

const SHOW_SELECT =
  'id, name, status, start_date, end_date, location, venue_name, address, city, state, zip_code, latitude, longitude, organization, confirmation_message, style, brand_color, experience_is_published, experience_published_style, experience_published_content, trials(id, name, trial_number, display_order, date, timezone, registry_id, planned_start_time, deleted_at)';
const ENTRY_SELECT =
  'id, show_id, trial_id, class_id, registration_id, handler_id, dog_id, armband, entry_fee, confirmation_email_status, dog:dogs(name, call_name, breed, sex), class:classes(name, level, element)';

/** Asks send-registration-email to re-send a failed receipt, as the sweep caller (same secret). */
async function resendReceipt(
  req: Request,
  registrationId: string,
  entryIds: string[]
): Promise<ReceiptResendOutcome> {
  const baseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const secret = req.headers.get('x-function-secret');
  if (!baseUrl || !serviceKey || !secret) return 'retry';
  const res = await fetch(`${baseUrl}/functions/v1/send-registration-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serviceKey}`,
      'x-function-secret': secret,
    },
    body: JSON.stringify({ registrationId, entryIds }),
    // A hung call is that registration's failure (the sweep catches the throw), not the run's.
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    await res.text();
    return res.status >= 400 && res.status < 500 ? 'rejected' : 'retry';
  }
  const result = (await res.json()) as { success?: boolean };
  return result.success === true ? 'sent' : 'retry';
}

interface ConfirmationEmailPayload {
  /** "new" sends only confirmations never tried; "reminder" the show reminders; else the daily run. */
  scope?: string;
}

type PersonRow = { first_name: string | null; last_name: string | null; email: string | null };

function toRecipient(person: PersonRow | null | undefined): ConfirmationRecipient | null {
  if (!person) return null;
  return { email: person.email, firstName: person.first_name, lastName: person.last_name };
}

type ServiceClient = HandlerCtx<unknown>['supabase'];

function confirmationDeps(supabase: ServiceClient, resendApiKey: string): EntryConfirmationDeps {
  return {
    now: () => new Date(),
    siteUrl: Deno.env.get('SITE_URL'),
    loadShows: async () => {
      // A day of slack: the run decides "not over" in each show's own time zone.
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from('shows')
        .select(SHOW_SELECT)
        .in('status', [...CONFIRMATION_LIVE_SHOW_STATUSES])
        .is('deleted_at', null)
        .gte('end_date', yesterday);
      if (error) throw new Error(`Could not read shows: ${error.message}`);
      return (data ?? []).map((show: ConfirmationShow) => ({
        ...show,
        trials: (show.trials ?? []).filter(
          trial => trial && !(trial as { deleted_at?: string | null }).deleted_at
        ),
      }));
    },
    loadAcceptedEmailOff: async showIds => {
      // The same row the Scheduled emails switch writes (updateLifecycleEmailStepEnabled).
      const { data, error } = await supabase
        .from('show_lifecycle_email_steps')
        .select('show_id')
        .in('show_id', showIds)
        .eq('step_type', 'accepted')
        .eq('is_enabled', false);
      if (error) throw new Error(`Could not read the acceptance email switch: ${error.message}`);
      return new Set(((data ?? []) as Array<{ show_id: string }>).map(row => row.show_id));
    },
    loadCandidates: async ({ showIds, statuses, quietSince, nowIso }) => {
      const { data, error } = await supabase
        .from('entries')
        .select(ENTRY_SELECT)
        .in('show_id', showIds)
        .eq('entry_status', 'confirmed')
        .not('armband', 'is', null)
        .is('deleted_at', null)
        .is('confirmation_email_sent_at', null)
        .or(claimableFilter(statuses, nowIso))
        .lt('updated_at', quietSince)
        // Oldest change first: a failed attempt bumps updated_at, so retries rotate.
        .order('updated_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(CONFIRMATION_ROW_LIMIT);
      if (error) throw new Error(`Could not read accepted entries: ${error.message}`);
      return (data ?? []) as unknown as ConfirmationEntry[];
    },
    loadExhibitorEntries: async ({
      showIds,
      registrationIds,
      handlerIds,
      statuses,
      quietSince,
      nowIso,
    }) => {
      // Same filters as loadCandidates and no row limit, paged past PostgREST's max_rows.
      const eligible = () =>
        supabase
          .from('entries')
          .select(ENTRY_SELECT)
          .in('show_id', showIds)
          .eq('entry_status', 'confirmed')
          .not('armband', 'is', null)
          .is('deleted_at', null)
          .is('confirmation_email_sent_at', null)
          .or(claimableFilter(statuses, nowIso))
          .lt('updated_at', quietSince);
      const readAll = (
        narrow: (query: ReturnType<typeof eligible>) => ReturnType<typeof eligible>
      ) =>
        readAllPages<ConfirmationEntry>(
          (from, to) =>
            narrow(eligible()).order('id', { ascending: true }).range(from, to) as PromiseLike<
              PageResult<ConfirmationEntry>
            >,
          'Could not read exhibitor entries'
        );
      const rows: ConfirmationEntry[] = [];
      if (registrationIds.length > 0) {
        rows.push(...(await readAll(q => q.in('registration_id', registrationIds))));
      }
      if (handlerIds.length > 0) {
        rows.push(
          ...(await readAll(q => q.is('registration_id', null).in('handler_id', handlerIds)))
        );
      }
      return rows;
    },
    loadRecipients: async ({ registrationIds, handlerIds }) => {
      const byRegistration = new Map<string, ConfirmationRecipient | null>();
      const byHandler = new Map<string, ConfirmationRecipient>();
      let registrationsRead = true;
      let handlersRead = true;
      if (registrationIds.length > 0) {
        const { data, error } = await supabase
          .from('enrollments')
          .select('id, person:people(first_name, last_name, email)')
          .in('id', registrationIds);
        if (error) {
          // Never "no registration": the run leaves these groups unsent for the next run.
          console.error('Could not read registration recipients', { message: error.message });
          registrationsRead = false;
        }
        for (const row of (data ?? []) as unknown as Array<{
          id: string;
          person: PersonRow | null;
        }>) {
          byRegistration.set(row.id, toRecipient(row.person));
        }
      }
      if (handlerIds.length > 0) {
        const { data, error } = await supabase
          .from('people')
          .select('id, first_name, last_name, email')
          .in('id', handlerIds);
        if (error) {
          console.error('Could not read handler recipients', { message: error.message });
          handlersRead = false;
        }
        for (const row of (data ?? []) as Array<PersonRow & { id: string }>) {
          const recipient = toRecipient(row);
          if (recipient) byHandler.set(row.id, recipient);
        }
      }
      return { byRegistration, byHandler, registrationsRead, handlersRead };
    },
    loadJudges: async classIds => {
      if (classIds.length === 0) return new Map();
      const { data, error } = await supabase
        .from('judge_assignments')
        .select(JUDGE_ASSIGNMENT_NAME_SELECT)
        .in('class_id', classIds)
        .eq('status', 'confirmed');
      // A failed read names no judge ("To be announced"); the email still goes.
      if (error) console.error('Could not read class judges', { message: error.message });
      return judgeNamesByClass((data ?? []) as unknown as JudgeAssignmentNameRow[]);
    },
    loadConfirmationNumbers: registrationIds =>
      loadConfirmationNumbers(
        supabase as unknown as Parameters<typeof loadConfirmationNumbers>[0],
        registrationIds
      ),
    loadAcceptanceGenerations: async entryIds => {
      if (entryIds.length === 0) return new Map();
      const { data, error } = await supabase
        .from('entry_status_history')
        .select('id, entry_id, changed_at')
        .in('entry_id', entryIds)
        .eq('new_status', 'confirmed')
        .order('changed_at', { ascending: false })
        .order('id', { ascending: false });
      if (error) throw new Error(`Could not read acceptance history: ${error.message}`);
      return latestAcceptanceGenerations((data ?? []) as AcceptanceHistoryRow[]);
    },
    claim: async (entryIds, statuses, nowIso, leaseUntilIso) => {
      // One atomic update: of two overlapping runs only one matches the unleased predicate.
      const { data, error } = await supabase
        .from('entries')
        .update({ confirmation_claimed_until: leaseUntilIso })
        .in('id', entryIds)
        .is('confirmation_email_sent_at', null)
        .or(claimableFilter(statuses, nowIso))
        .eq('entry_status', 'confirmed')
        .not('armband', 'is', null)
        .is('deleted_at', null)
        .select('id');
      if (error) throw new Error(`Could not claim confirmations: ${error.message}`);
      return ((data ?? []) as Array<{ id: string }>).map(row => row.id);
    },
    markSent: async (entryIds, messageId, leaseUntilIso) => {
      // Fenced on the lease this run wrote: a re-acceptance voids it (any entry_status change
      // clears confirmation_claimed_until), so that entry is not marked and is sent its own email.
      const { data, error } = await supabase
        .from('entries')
        .update({
          confirmation_email_sent_at: new Date().toISOString(),
          confirmation_email_status: 'sent',
          confirmation_email_message_id: messageId,
          confirmation_claimed_until: null,
        })
        .in('id', entryIds)
        .eq('confirmation_claimed_until', leaseUntilIso)
        .eq('entry_status', 'confirmed')
        .select('id');
      // The provider has the email: the run retries this write, and if it still fails the lease
      // stands and a later run sends under the same idempotency key (deduplicated) and stamps.
      if (error) throw new Error(`Could not mark confirmations sent: ${error.message}`);
      return ((data ?? []) as Array<{ id: string }>).map(row => row.id);
    },
    markFailed: async (entryIds, leaseUntilIso) => {
      const query = supabase
        .from('entries')
        .update({ confirmation_claimed_until: null, confirmation_email_status: 'failed' })
        .in('id', entryIds);
      const { error } = await (leaseUntilIso
        ? query.eq('confirmation_claimed_until', leaseUntilIso)
        : query);
      if (error) {
        console.error('Could not release confirmations', {
          message: error.message,
          entries: entryIds.length,
        });
      }
    },
    render: (data, show) => renderConfirmationEmail(data, show, showRegistry(show)),
    send: async ({ to, subject, html, idempotencyKey }) => {
      const res = await sendResendEmailWithRetry({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${resendApiKey}`,
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
      });
      if (!res.ok) {
        await res.text();
        console.error('Failed to send the full confirmation', { status: res.status });
        return { ok: false, error: `provider_http_${res.status}` };
      }
      const result = (await res.json()) as { id: string };
      return { ok: true, messageId: result.id };
    },
    log: async ({ content, ...row }) => {
      const { id, existing, error } = await insertEmailLogOnce(
        supabase,
        row,
        new Date().toISOString()
      );
      requireEmailLogWrite(error, 'send-confirmation-email');
      // A recovered send finds its first attempt's row, which already holds the content.
      if (content && !existing)
        await storeEmailContent(supabase, id, content.subject, content.html);
    },
  };
}

// auth: 'none' because the caller is pg_cron / pg_net, which passes the service-role key in
// `Authorization: Bearer <key>`; that is not a user JWT, so the envelope's JWT check would fail.
// Caller validation is the required HERITAGE_CONFIRMATION_SECRET header below.
handle<ConfirmationEmailPayload>(
  { auth: 'none', origins: MYK9SHOW_ORIGINS },
  async ({ req, body, supabase }) => {
    requireConfirmationEmailSecret(req);

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) {
      throw new HttpError(503, 'Email service not configured');
    }

    // MYK9-2113: the reminder is its own run. It is never part of the daily or frequent run, so
    // those cannot send it twice and a reminder failure cannot hold up a confirmation.
    if (body?.scope === 'reminder') {
      const deps = confirmationDeps(supabase, RESEND_API_KEY);
      const result = await runEntryReminders(reminderDeps(supabase, deps));
      // A cap-deferred or failed reminder is otherwise invisible: say so in the function logs.
      console.log('Exhibitor reminder run', result);
      if (result.deferred > 0) {
        console.warn('Exhibitor reminders deferred to the next run', { deferred: result.deferred });
      }
      return result;
    }

    const scope = body?.scope === 'new' ? 'new' : 'all';

    // MYK9-1963: the daily run first retries failed submit receipts. The frequent run does not,
    // so a receipt that cannot be sent is retried once a day, not every few minutes.
    const receiptRetry =
      scope === 'all'
        ? await sweepFailedReceipts(
            supabase as unknown as ReceiptSweepClient,
            (registrationId, entryIds) => resendReceipt(req, registrationId, entryIds),
            Date.now()
          )
        : undefined;

    const confirmations = await runEntryConfirmations(
      confirmationDeps(supabase, RESEND_API_KEY),
      scope
    );
    return { ...confirmations, receiptRetry };
  }
);
