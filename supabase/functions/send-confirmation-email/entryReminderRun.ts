// One ten-minute run of the show reminder (MYK9-2113). Deno-free: index.ts injects the database and
// Resend; entryReminderRun.test.ts drives it against an in-memory store. The rules (which show is
// due, the subject, the key) are in entryReminders.ts; the reads that also serve the full
// confirmation (shows, recipients, judges, send, log) are shared with it through the same deps.

import {
  buildConfirmationEmailData,
  groupConfirmationsByExhibitor,
  type ConfirmationEntry,
  type ConfirmationGroup,
  type ConfirmationRecipient,
  type ConfirmationShow,
} from './entryConfirmations.ts';
import type { ConfirmationSendResult } from './entryConfirmationRun.ts';
import type { HeritageEmailData } from './heritage-email.ts';
import {
  REMINDER_CLAIM_STALE_MS,
  REMINDER_MAX_EMAILS_PER_RUN,
  orderReminderGroups,
  reminderIdempotencyKey,
  reminderSubject,
  showReminderIsDue,
  withReminderStrip,
} from './entryReminders.ts';

/** One email_log row; related_id is the first entry the email covers. */
export interface ReminderLogRow {
  recipient_email: string | null;
  email_type: 'show_reminder';
  related_id: string;
  show_id: string;
  resend_message_id: string | null;
  status: 'sent' | 'failed';
  error_message: string | null;
}

export interface EntryReminderDeps {
  now(): Date;
  /** Exhibitors emailed per run; REMINDER_MAX_EMAILS_PER_RUN when absent. */
  maxEmailsPerRun?: number;
  siteUrl: string | null | undefined;
  /** Published, not deleted shows whose last day is not long past, with their trials. */
  loadShows(): Promise<ConfirmationShow[]>;
  /**
   * Every live entry of these shows still owed a reminder: accepted ('confirmed'), not deleted
   * (a pulled or withdrawn entry has another status), reminder_email_status 'pending' or
   * 'failed', and either unstamped or stamped before `staleBeforeIso` while 'pending' (a crashed
   * run's claim). Paged past PostgREST's row cap; a failed read throws.
   */
  loadEntries(showIds: string[], staleBeforeIso: string): Promise<ConfirmationEntry[]>;
  /** The entries of these shows whose reminder went (reminder_email_status 'sent'). */
  loadSentEntries(showIds: string[]): Promise<ConfirmationEntry[]>;
  /** Marks entries 'covered': accepted after her reminder for the show went, so never sent one. */
  markCovered(entryIds: string[]): Promise<void>;
  loadRecipients(args: { registrationIds: string[]; handlerIds: string[] }): Promise<{
    byRegistration: Map<string, ConfirmationRecipient | null>;
    byHandler: Map<string, ConfirmationRecipient>;
    registrationsRead: boolean;
    handlersRead: boolean;
  }>;
  loadJudges(classIds: string[]): Promise<Map<string, string>>;
  /** Stamps the entries still claimable and still live; returns the ids it stamped. */
  claim(entryIds: string[], nowIso: string, staleBeforeIso: string): Promise<string[]>;
  markSent(entryIds: string[]): Promise<void>;
  /** Releases a claim after a failed send: unstamped, 'failed', so a later run retries. */
  markFailed(entryIds: string[]): Promise<void>;
  render(data: HeritageEmailData, show: ConfirmationShow): string;
  send(email: {
    to: string;
    subject: string;
    html: string;
    idempotencyKey: string;
  }): Promise<ConfirmationSendResult>;
  log(row: ReminderLogRow): Promise<void>;
}

export interface EntryReminderRunResult {
  sent: number;
  failed: number;
  /** Exhibitors left for the next run because their recipient could not be read. */
  skipped: number;
  /** Exhibitors left for the next run because this one reached its cap. */
  deferred: number;
}

const NOTHING: EntryReminderRunResult = { sent: 0, failed: 0, skipped: 0, deferred: 0 };

export async function runEntryReminders(deps: EntryReminderDeps): Promise<EntryReminderRunResult> {
  const now = deps.now();
  const shows = (await deps.loadShows()).filter(show => showReminderIsDue(show, now));
  if (shows.length === 0) return NOTHING;
  const showById = new Map(shows.map(show => [show.id, show]));

  const showIds = shows.map(show => show.id);
  const staleBeforeIso = new Date(now.getTime() - REMINDER_CLAIM_STALE_MS).toISOString();
  const entries = (await deps.loadEntries(showIds, staleBeforeIso)).filter(entry =>
    showById.has(entry.show_id)
  );
  // One reminder per exhibitor per show: an exhibitor whose reminder already went this morning
  // is not emailed again for an entry accepted after it. Those entries are marked 'covered' so
  // no later run looks at them.
  const reminded = new Set(
    groupConfirmationsByExhibitor(await deps.loadSentEntries(showIds)).map(group => group.key)
  );
  const owed = groupConfirmationsByExhibitor(entries);
  for (const group of owed.filter(group => reminded.has(group.key))) {
    await deps.markCovered(group.entries.map(entry => entry.id));
  }
  // Never-attempted groups first, then stale claims, then failed retries (entryReminders.ts).
  const groups = orderReminderGroups(owed.filter(group => !reminded.has(group.key)));
  const batch = groups.slice(0, deps.maxEmailsPerRun ?? REMINDER_MAX_EMAILS_PER_RUN);
  if (batch.length === 0) return NOTHING;

  const unique = (ids: Array<string | null>) => [
    ...new Set(ids.filter((id): id is string => !!id)),
  ];
  const batchEntries = batch.flatMap(group => group.entries);
  const recipients = await deps.loadRecipients({
    registrationIds: unique(batch.map(group => group.registrationId)),
    handlerIds: unique(batchEntries.map(entry => entry.handler_id)),
  });
  const judges = await deps.loadJudges(unique(batchEntries.map(entry => entry.class_id)));

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  for (const group of batch) {
    const show = showById.get(group.showId);
    if (!show) continue;
    const resolved = resolveRecipient(group, recipients);
    if (resolved === 'unknown') {
      // A failed read is not "no registration": never fall back to the handler. Next run.
      skipped++;
      continue;
    }
    const entryIds = group.entries.map(entry => entry.id);

    if (!resolved?.email) {
      // Nothing to send to. Logged once (the first time), then 'failed' so it is not logged
      // again every run; she still gets the reminder if an address appears that morning.
      const firstTime = group.entries.some(entry => entry.reminder_email_status !== 'failed');
      await deps.markFailed(entryIds);
      failed++;
      if (firstTime) {
        await deps.log({
          recipient_email: null,
          email_type: 'show_reminder',
          related_id: group.entries[0]!.id,
          show_id: show.id,
          resend_message_id: null,
          status: 'failed',
          error_message: 'missing_recipient',
        });
      }
      continue;
    }

    // Read before the claim and the marks change the entries' status.
    const alreadyFailed = group.entries.every(entry => entry.reminder_email_status === 'failed');
    const claimed = await deps.claim(entryIds, now.toISOString(), staleBeforeIso);
    if (claimed.length === 0) continue;
    const claimedEntries = group.entries.filter(entry => claimed.includes(entry.id));

    let result: ConfirmationSendResult;
    try {
      const data = buildConfirmationEmailData({
        show,
        entries: claimedEntries,
        recipient: resolved,
        judgeByClass: judges,
        confirmationNumber: null,
        siteUrl: deps.siteUrl,
        includeStartTimes: true,
      });
      result = await deps.send({
        to: resolved.email,
        subject: reminderSubject(show.name),
        html: withReminderStrip(deps.render(data, show), data.showTitle, data.dateRange),
        idempotencyKey: await reminderIdempotencyKey(group.key, claimed),
      });
    } catch {
      result = { ok: false, error: 'email_delivery_error' };
    }

    if (result.ok) {
      await deps.markSent(claimed);
      sent++;
    } else {
      await deps.markFailed(claimed);
      failed++;
    }
    // A send that keeps failing is logged on its first failure only, not on every run.
    if (!result.ok && alreadyFailed) {
      continue;
    }
    await deps.log({
      recipient_email: resolved.email,
      email_type: 'show_reminder',
      related_id: claimedEntries[0]!.id,
      show_id: show.id,
      resend_message_id: result.ok ? result.messageId : null,
      status: result.ok ? 'sent' : 'failed',
      error_message: result.ok ? null : result.error,
    });
  }

  return { sent, failed, skipped, deferred: groups.length - batch.length };
}

/** Her registration's person; the entry's handler only when that read succeeded and found none. */
function resolveRecipient(
  group: ConfirmationGroup,
  recipients: Awaited<ReturnType<EntryReminderDeps['loadRecipients']>>
): ConfirmationRecipient | null | 'unknown' {
  if (group.registrationId) {
    if (!recipients.registrationsRead) return 'unknown';
    const person = recipients.byRegistration.get(group.registrationId);
    if (person) return person;
  }
  const handlerId = group.registrationId ? group.entries[0]!.handler_id : group.handlerId;
  if (!handlerId) return null;
  if (!recipients.handlersRead) return 'unknown';
  return recipients.byHandler.get(handlerId) ?? null;
}
