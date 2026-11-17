// One scheduled run of the full confirmation (MYK9-1999). Deno-free: index.ts injects the
// database and Resend; entryConfirmationRun.test.ts drives it against an in-memory store.
// The rules (what is confirmed, once per exhibitor per show, the claim) are in
// entryConfirmations.ts.

import {
  buildConfirmationEmailData,
  CONFIRMATION_MAX_EMAILS_PER_RUN,
  CONFIRMATION_QUIET_MS,
  confirmationIdempotencyKey,
  confirmationSubject,
  groupConfirmationsByExhibitor,
  showTakesConfirmations,
  type ConfirmationEntry,
  type ConfirmationRecipient,
  type ConfirmationScope,
  type ConfirmationShow,
} from './entryConfirmations.ts';
import {
  drainConfirmationJobs,
  emptyDrainTotals,
  type ConfirmationJobStore,
  type ConfirmationLogEntry,
  type ConfirmationSendOutcome,
} from './entryConfirmationJobs.ts';
import type { HeritageEmailData } from './heritage-email.ts';

/** One email_log row; related_id is the first entry the email covers. */
export interface ConfirmationLogRow extends Omit<ConfirmationLogEntry, 'email_type'> {
  /** 'show_reminder' is the reminder's (MYK9-2113), which shares this log writer. */
  email_type: 'heritage_confirmation' | 'show_reminder';
}

export type ConfirmationSendResult = ConfirmationSendOutcome;

export interface EntryConfirmationDeps {
  now(): Date;
  siteUrl: string | null | undefined;
  /** Published, not deleted shows whose last day is not long past, with their trials. */
  loadShows(): Promise<ConfirmationShow[]>;
  /**
   * The shows whose acceptance email the secretary switched off: show_lifecycle_email_steps,
   * step 'accepted', is_enabled false (the switch in Scheduled emails). No row means on, as the
   * app reads it. A failed read throws, so the run sends nothing rather than ignore the switch.
   */
  loadAcceptedEmailOff(showIds: string[]): Promise<Set<string>>;
  /**
   * Accepted ('confirmed'), not deleted entries with an armband and no confirmation yet, in
   * these shows, whose confirmation_email_status is one of `statuses` and that have not changed
   * since `quietSince`. Oldest updated_at first: a failed attempt bumps updated_at, so the
   * daily retry rotates through failures instead of taking the same ones every day.
   */
  loadCandidates(args: {
    showIds: string[];
    statuses: Array<'pending' | 'failed'>;
    quietSince: string;
  }): Promise<ConfirmationEntry[]>;
  /**
   * byRegistration: a registration that was read maps to its person, or to null when it has
   * none; a registration not found is absent. `registrationsRead` / `handlersRead` are false
   * when that read failed, which is never taken to mean "not found".
   */
  /**
   * Every eligible entry (same filters as loadCandidates, no row limit) of the chosen
   * exhibitors: by registration, and by handler for entries with no registration. The candidate
   * read is limited and ordered across exhibitors, so it can hold only part of one exhibitor's
   * entries; her email is built from this complete set instead.
   */
  loadExhibitorEntries(args: {
    showIds: string[];
    registrationIds: string[];
    handlerIds: string[];
    statuses: Array<'pending' | 'failed'>;
    quietSince: string;
  }): Promise<ConfirmationEntry[]>;
  loadRecipients(args: { registrationIds: string[]; handlerIds: string[] }): Promise<{
    byRegistration: Map<string, ConfirmationRecipient | null>;
    byHandler: Map<string, ConfirmationRecipient>;
    registrationsRead: boolean;
    handlersRead: boolean;
  }>;
  loadJudges(classIds: string[]): Promise<Map<string, string>>;
  loadConfirmationNumbers(registrationIds: string[]): Promise<Map<string, string>>;
  /**
   * Each entry's acceptance generation: the id of its latest entry_status_history row into
   * 'confirmed' (entries with none are absent). Throws when the read fails, so the group is not
   * sent under a key that could repeat an earlier acceptance's.
   */
  loadAcceptanceGenerations(entryIds: string[]): Promise<Map<string, string>>;
  /**
   * The durable job row each email travels on (MYK9-2088, entryConfirmationJobs.ts). The run
   * writes a job instead of stamping the entries before the send, so a run that stops between
   * the claim and the send leaves a leased job the next run recovers, not stamped entries nobody
   * will email.
   */
  jobs: ConfirmationJobStore;
  /** Of these entries, the ids still accepted, with an armband, not deleted and unmarked. */
  loadLiveEntryIds(entryIds: string[]): Promise<Set<string>>;
  /**
   * Writes the historical marker once the email is out: confirmation_email_sent_at, status
   * 'sent' and the message id, on entries still unmarked. Idempotent.
   */
  markSent(entryIds: string[], messageId: string | null, nowIso: string): Promise<void>;
  /** Unmarked and 'failed', so the daily run looks again (no address, or the job ended failed). */
  markFailed(entryIds: string[]): Promise<void>;
  /** The sent Delivery history row already written for a provider message id, if any. */
  findLogId(messageId: string): Promise<string | null>;
  render(data: HeritageEmailData, show: ConfirmationShow): string;
  send(email: {
    to: string;
    subject: string;
    html: string;
    idempotencyKey: string;
  }): Promise<ConfirmationSendResult>;
  /** Resolves to the row's id. */
  log(row: ConfirmationLogRow): Promise<string | null>;
}

export interface EntryConfirmationRunResult {
  sent: number;
  /** Finished from a provider acceptance an earlier run did not record, with no second send. */
  reconciled: number;
  /** Refused by the provider; the job waits out a delay and a later run tries again. */
  retrying: number;
  failed: number;
  /** Jobs a run stopped on (their lease runs out and the next run takes them again). */
  errors: number;
  /** Exhibitors left untouched this run because their recipient could not be read. */
  skipped: number;
  /** Exhibitors left for the next run because this one reached its cap. */
  deferred: number;
}

/**
 * 'new' (every few minutes): entries never tried. 'all' (the daily run): also the ones whose
 * send failed, so a failure is retried once a day rather than every few minutes.
 *
 * Every run first drains the jobs earlier runs left (recovering a stopped one), then writes a job
 * for each exhibitor still waiting, then drains again so a fresh job goes out in the same run.
 */
export async function runEntryConfirmations(
  deps: EntryConfirmationDeps,
  scope: ConfirmationScope
): Promise<EntryConfirmationRunResult> {
  const now = deps.now();
  const liveShows = (await deps.loadShows()).filter(show => showTakesConfirmations(show, now));
  // The secretary's switch for the acceptance email holds for this email too: it is that email.
  // A show switched off is not read at all, so its entries stay unmarked and pending (nothing
  // logged, nothing to retry); switching it back on sends them.
  const switchedOff =
    liveShows.length > 0
      ? await deps.loadAcceptedEmailOff(liveShows.map(show => show.id))
      : new Set<string>();
  const shows = liveShows.filter(show => !switchedOff.has(show.id));
  const showById = new Map(shows.map(show => [show.id, show]));
  const activeShowIds = new Set(showById.keys());

  const drained = emptyDrainTotals();
  await drainConfirmationJobs(deps, activeShowIds, drained);

  const written = await writeJobs(deps, scope, shows, showById);
  await drainConfirmationJobs(deps, activeShowIds, drained);

  if (drained.errors > 0) {
    console.warn('Confirmation jobs left for the next run', { errors: drained.errors });
  }
  return {
    sent: drained.sent,
    reconciled: drained.reconciled,
    retrying: drained.retrying,
    failed: drained.failed + written.failed,
    errors: drained.errors,
    skipped: drained.skipped + written.skipped,
    deferred: written.deferred,
  };
}

interface WriteResult {
  failed: number;
  skipped: number;
  deferred: number;
}

/** Gathers the exhibitors waiting for a confirmation and writes (or finds) each one's job. */
async function writeJobs(
  deps: EntryConfirmationDeps,
  scope: ConfirmationScope,
  shows: ConfirmationShow[],
  showById: ReadonlyMap<string, ConfirmationShow>
): Promise<WriteResult> {
  const none: WriteResult = { failed: 0, skipped: 0, deferred: 0 };
  if (shows.length === 0) return none;
  const now = deps.now();
  const statuses: Array<'pending' | 'failed'> =
    scope === 'all' ? ['pending', 'failed'] : ['pending'];

  const quietSince = new Date(now.getTime() - CONFIRMATION_QUIET_MS).toISOString();
  const eligible = (entry: ConfirmationEntry) => !!entry.armband && showById.has(entry.show_id);
  const candidates = await deps.loadCandidates({
    showIds: shows.map(show => show.id),
    statuses,
    quietSince,
  });
  // The candidates choose WHICH exhibitors go this run (oldest first); each chosen exhibitor's
  // email is then built from all of her eligible entries, never from the part the limit let in.
  const groups = groupConfirmationsByExhibitor(candidates.filter(eligible));
  const chosen = groups.slice(0, CONFIRMATION_MAX_EMAILS_PER_RUN);
  if (chosen.length === 0) return none;

  const unique = (ids: Array<string | null>) => [
    ...new Set(ids.filter((id): id is string => !!id)),
  ];
  const complete = new Map(
    groupConfirmationsByExhibitor(
      (
        await deps.loadExhibitorEntries({
          showIds: unique(chosen.map(group => group.showId)),
          registrationIds: unique(chosen.map(group => group.registrationId)),
          handlerIds: unique(chosen.map(group => group.handlerId)),
          statuses,
          quietSince,
        })
      ).filter(eligible)
    ).map(group => [group.key, group])
  );
  // A chosen exhibitor whose complete read no longer holds every entry the candidates showed
  // (her entries changed between the two reads) waits for the next run, whole.
  const batch = chosen.flatMap(group => {
    // No registration and no handler: one entry, nobody to read it for; it stands alone.
    if (!group.registrationId && !group.handlerId) return [group];
    const full = complete.get(group.key);
    const ids = new Set(full?.entries.map(entry => entry.id));
    return full && group.entries.every(entry => ids.has(entry.id)) ? [full] : [];
  });
  const batchEntries = batch.flatMap(group => group.entries);
  const recipients = await deps.loadRecipients({
    registrationIds: unique(batch.map(group => group.registrationId)),
    handlerIds: unique(batchEntries.map(entry => entry.handler_id)),
  });
  const judges = await deps.loadJudges(unique(batchEntries.map(entry => entry.class_id)));
  const numbers = await deps.loadConfirmationNumbers(
    unique(batch.map(group => group.registrationId))
  );

  let failed = 0;
  let skipped = chosen.length - batch.length;
  let deferred = groups.length - chosen.length;
  for (const group of batch) {
    const show = showById.get(group.showId);
    if (!show) continue;
    const anchor = group.entries[0]!;
    const resolved = resolveRecipient(group.registrationId, anchor.handler_id, recipients);
    if (resolved === 'unknown') {
      // A failed read is not "no registration": sending to the handler instead could give one
      // person's confirmation to another. Left unmarked and unsent for the next run.
      skipped++;
      continue;
    }
    const recipient = resolved;
    const entryIds = group.entries.map(entry => entry.id);

    if (!recipient?.email) {
      // Nothing to send to. Marked 'failed' so the daily run looks again, in case an address is
      // added; the update moves the group behind the others. Logged once, the first time, so
      // Delivery history says why she got nothing without a row every day.
      const firstTime = group.entries.some(entry => entry.confirmation_email_status === 'pending');
      await deps.markFailed(entryIds);
      if (!firstTime) {
        failed++;
        continue;
      }
      await deps.log({
        recipient_email: null,
        email_type: 'heritage_confirmation',
        related_id: anchor.id,
        show_id: show.id,
        resend_message_id: null,
        status: 'failed',
        error_message: 'missing_recipient',
      });
      failed++;
      continue;
    }

    let subject: string;
    let html: string;
    let idempotencyKey: string;
    try {
      const generations = await deps.loadAcceptanceGenerations(entryIds);
      html = deps.render(
        buildConfirmationEmailData({
          show,
          entries: group.entries,
          recipient,
          judgeByClass: judges,
          confirmationNumber: (group.registrationId && numbers.get(group.registrationId)) || null,
          siteUrl: deps.siteUrl,
        }),
        show
      );
      subject = confirmationSubject(show.name, group.entries.length);
      idempotencyKey = await confirmationIdempotencyKey(group, entryIds, generations);
    } catch {
      // The acceptance history (or the render) could not be read: nothing is written, and the
      // group is released for the daily run rather than sent under a key that could repeat.
      await deps.markFailed(entryIds);
      await deps.log({
        recipient_email: recipient.email,
        email_type: 'heritage_confirmation',
        related_id: anchor.id,
        show_id: show.id,
        resend_message_id: null,
        status: 'failed',
        error_message: 'email_delivery_error',
      });
      failed++;
      continue;
    }

    const enqueued = await deps.jobs.enqueue({
      showId: show.id,
      groupKey: group.key,
      registrationId: group.registrationId,
      entryIds,
      recipientEmail: recipient.email,
      recipientName: [recipient.firstName, recipient.lastName].filter(Boolean).join(' ') || null,
      subject,
      html,
      idempotencyKey,
      nowIso: now.toISOString(),
    });
    if (enqueued.outcome === 'sent') {
      // The email already went out; only the entries' marker lagged behind the job.
      await deps.markSent(entryIds, enqueued.messageId, now.toISOString());
    } else if (enqueued.outcome === 'open') {
      deferred++;
    }
  }

  return { failed, skipped, deferred };
}

/**
 * Who gets the group's email. Her registration's person when the registration was read; the
 * entry's handler only when the registration read succeeded and found no person (or the group
 * has no registration). 'unknown' when a read this depends on failed.
 */
function resolveRecipient(
  registrationId: string | null,
  handlerId: string | null,
  recipients: Awaited<ReturnType<EntryConfirmationDeps['loadRecipients']>>
): ConfirmationRecipient | null | 'unknown' {
  if (registrationId) {
    if (!recipients.registrationsRead) return 'unknown';
    const person = recipients.byRegistration.get(registrationId);
    if (person) return person;
  }
  if (!handlerId) return null;
  if (!recipients.handlersRead) return 'unknown';
  return recipients.byHandler.get(handlerId) ?? null;
}
