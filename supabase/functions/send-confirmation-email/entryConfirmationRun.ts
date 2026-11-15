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
  email_type: 'heritage_confirmation';
  related_id: string;
  show_id: string;
  resend_message_id: string | null;
  status: 'sent' | 'failed';
  error_message: string | null;
}

export type ConfirmationSendResult = { ok: true; messageId: string } | { ok: false; error: string };

export interface EntryConfirmationDeps {
  now(): Date;
  siteUrl: string | null | undefined;
  /** Published, not deleted shows whose last day is not long past, with their trials. */
  loadShows(): Promise<ConfirmationShow[]>;
  /**
   * Accepted ('confirmed'), not deleted entries with an armband and no confirmation yet, in
   * these shows, whose confirmation_email_status is one of `statuses` and that have not changed
   * since `quietSince`.
   */
  loadCandidates(args: {
    showIds: string[];
    statuses: Array<'pending' | 'failed'>;
    quietSince: string;
  }): Promise<ConfirmationEntry[]>;
  loadRecipients(args: { registrationIds: string[]; handlerIds: string[] }): Promise<{
    byRegistration: Map<string, ConfirmationRecipient>;
    byHandler: Map<string, ConfirmationRecipient>;
  }>;
  loadJudges(classIds: string[]): Promise<Map<string, string>>;
  loadConfirmationNumbers(registrationIds: string[]): Promise<Map<string, string>>;
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
  const shows = (await deps.loadShows()).filter(show => showTakesConfirmations(show, now));
  if (shows.length === 0) return { sent: 0, failed: 0, deferred: 0 };
  const showById = new Map(shows.map(show => [show.id, show]));
  const statuses: Array<'pending' | 'failed'> =
    scope === 'all' ? ['pending', 'failed'] : ['pending'];

  const candidates = await deps.loadCandidates({
    showIds: shows.map(show => show.id),
    statuses,
    quietSince: new Date(now.getTime() - CONFIRMATION_QUIET_MS).toISOString(),
  });
  const groups = groupConfirmationsByExhibitor(
    candidates.filter(entry => entry.armband && showById.has(entry.show_id))
  );
  const batch = groups.slice(0, CONFIRMATION_MAX_EMAILS_PER_RUN);
  if (batch.length === 0) return { sent: 0, failed: 0, deferred: 0 };

  const unique = (ids: Array<string | null>) => [
    ...new Set(ids.filter((id): id is string => !!id)),
  ];
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
  for (const group of batch) {
    const show = showById.get(group.showId);
    if (!show) continue;
    const anchor = group.entries[0]!;
    const recipient =
      (group.registrationId && recipients.byRegistration.get(group.registrationId)) ||
      (anchor.handler_id && recipients.byHandler.get(anchor.handler_id)) ||
      null;
    const entryIds = group.entries.map(entry => entry.id);

    if (!recipient?.email) {
      // Nothing to send to. Marked 'failed' (not claimed) so the daily run looks again, in case
      // an address is added, and logged so Delivery history says why she got nothing.
      await deps.markFailed(entryIds);
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
    try {
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
      result = await deps.send({
        to: recipient.email,
        subject: confirmationSubject(show.name, entries.length),
        html,
        idempotencyKey: await confirmationIdempotencyKey(group, claimed),
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
    });
  }

  return { sent, failed, deferred: groups.length - batch.length };
}
