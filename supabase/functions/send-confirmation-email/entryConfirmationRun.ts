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
import type { HeritageEmailData } from './heritage-email.ts';

/** One email_log row; related_id is the first entry the email covers. */
export interface ConfirmationLogRow {
  recipient_email: string | null;
  /** 'show_reminder' is the reminder's (MYK9-2113), which shares this log writer. */
  email_type: 'heritage_confirmation' | 'show_reminder';
  related_id: string;
  show_id: string;
  resend_message_id: string | null;
  status: 'sent' | 'failed';
  error_message: string | null;
  /** What was sent (MYK9-2115): kept beside the log row so the secretary can read it. */
  content?: { subject: string; html: string };
}

export type ConfirmationSendResult = { ok: true; messageId: string } | { ok: false; error: string };

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
  /** Stamps the entries still unclaimed and still confirmed; returns the ids it stamped. */
  claim(
    entryIds: string[],
    statuses: Array<'pending' | 'failed'>,
    nowIso: string
  ): Promise<string[]>;
  markSent(entryIds: string[], messageId: string): Promise<void>;
  /** Releases a claim after a failed send: unstamped, 'failed', so the daily run retries it. */
  markFailed(entryIds: string[]): Promise<void>;
  render(data: HeritageEmailData, show: ConfirmationShow): string;
  send(email: {
    to: string;
    subject: string;
    html: string;
    idempotencyKey: string;
  }): Promise<ConfirmationSendResult>;
  log(row: ConfirmationLogRow): Promise<void>;
}

export interface EntryConfirmationRunResult {
  sent: number;
  failed: number;
  /** Exhibitors left untouched this run because their recipient could not be read. */
  skipped: number;
  /** Exhibitors left for the next run because this one reached its cap. */
  deferred: number;
}

/**
 * 'new' (every few minutes): entries never tried. 'all' (the daily run): also the ones whose
 * send failed, so a failure is retried once a day rather than every few minutes.
 */
export async function runEntryConfirmations(
  deps: EntryConfirmationDeps,
  scope: ConfirmationScope
): Promise<EntryConfirmationRunResult> {
  const now = deps.now();
  const liveShows = (await deps.loadShows()).filter(show => showTakesConfirmations(show, now));
  // The secretary's switch for the acceptance email holds for this email too: it is that email.
  // A show switched off is not read at all, so its entries stay unclaimed and pending (nothing
  // logged, nothing to retry); switching it back on sends them.
  const switchedOff =
    liveShows.length > 0
      ? await deps.loadAcceptedEmailOff(liveShows.map(show => show.id))
      : new Set<string>();
  const shows = liveShows.filter(show => !switchedOff.has(show.id));
  if (shows.length === 0) return { sent: 0, failed: 0, skipped: 0, deferred: 0 };
  const showById = new Map(shows.map(show => [show.id, show]));
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
  if (chosen.length === 0) return { sent: 0, failed: 0, skipped: 0, deferred: 0 };

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

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  for (const group of batch) {
    const show = showById.get(group.showId);
    if (!show) continue;
    const anchor = group.entries[0]!;
    const resolved = resolveRecipient(group.registrationId, anchor.handler_id, recipients);
    if (resolved === 'unknown') {
      // A failed read is not "no registration": sending to the handler instead could give one
      // person's confirmation to another. Left unclaimed and unsent for the next run.
      skipped++;
      continue;
    }
    const recipient = resolved;
    const entryIds = group.entries.map(entry => entry.id);

    if (!recipient?.email) {
      // Nothing to send to. Marked 'failed' (not claimed) so the daily run looks again, in case
      // an address is added; the update moves the group behind the others. Logged once, the
      // first time, so Delivery history says why she got nothing without a row every day.
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

    const claimed = await deps.claim(entryIds, statuses, now.toISOString());
    if (claimed.length === 0) continue;
    const entries = group.entries.filter(entry => claimed.includes(entry.id));
    const claimedAnchor = entries[0]!;

    let result: ConfirmationSendResult;
    let content: ConfirmationLogRow['content'];
    try {
      const generations = await deps.loadAcceptanceGenerations(claimed);
      const html = deps.render(
        buildConfirmationEmailData({
          show,
          entries,
          recipient,
          judgeByClass: judges,
          confirmationNumber: (group.registrationId && numbers.get(group.registrationId)) || null,
          siteUrl: deps.siteUrl,
        }),
        show
      );
      const subject = confirmationSubject(show.name, entries.length);
      content = { subject, html };
      result = await deps.send({
        to: recipient.email,
        subject,
        html,
        idempotencyKey: await confirmationIdempotencyKey(group, claimed, generations),
      });
    } catch {
      result = { ok: false, error: 'email_delivery_error' };
    }

    if (result.ok) {
      await deps.markSent(claimed, result.messageId);
      sent++;
    } else {
      await deps.markFailed(claimed);
      failed++;
    }
    await deps.log({
      recipient_email: recipient.email,
      email_type: 'heritage_confirmation',
      related_id: claimedAnchor.id,
      show_id: show.id,
      resend_message_id: result.ok ? result.messageId : null,
      status: result.ok ? 'sent' : 'failed',
      error_message: result.ok ? null : result.error,
      ...(content ? { content } : {}),
    });
  }

  return {
    sent,
    failed,
    skipped: skipped + chosen.length - batch.length,
    deferred: groups.length - chosen.length,
  };
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
