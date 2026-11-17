// Which entries one confirmation covers, what it says and who it goes to, all worked out when it
// is SENT (MYK9-2088), by the run's own functions: the same gather (loadExhibitorEntries, the
// grouping, the quiet period) and the same renderer. A ticket carries none of it
// (entryConfirmationJobs.ts); the only stored copy is the attempt record of what a send began with.

import {
  buildConfirmationEmailData,
  CONFIRMATION_QUIET_MS,
  confirmationSubject,
  groupConfirmationsByExhibitor,
  sameText,
  type ConfirmationEntry,
  type ConfirmationRecipient,
  type ConfirmationShow,
} from './entryConfirmations.ts';
import type { ConfirmationJob } from './entryConfirmationJobs.ts';
import type { EntryConfirmationDeps } from './entryConfirmationRun.ts';

export interface PreparedSend {
  to: string;
  subject: string;
  html: string;
}

/** A timestamp later than any updated_at: reads "every unmarked entry, quiet or not". */
const ANY_TIME = '9999-12-31T00:00:00.000Z';

/**
 * Who gets the group's email. Her registration's person when the registration was read; the
 * entry's handler only when the registration read succeeded and found no person (or the group
 * has no registration). 'unknown' when a read this depends on failed.
 */
export function resolveRecipient(
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

/** A usable address: something@something, no spaces. Anything else is "no address". */
export function usableAddress(email: string | null | undefined): string | null {
  const trimmed = email?.trim() ?? '';
  return /^[^\s@]+@[^\s@]+$/.test(trimmed) ? trimmed : null;
}

/**
 * The entries of one ticket's group that qualify RIGHT NOW: confirmed, unmarked, with an armband,
 * outside the quiet period and still grouped under the ticket's key (by registration, or by the
 * handler of a handler-only group), read through the same loader and grouping the run uses. None
 * qualifying only because of the quiet period is not "gone": `dueAt` says when the last of them
 * has been quiet long enough.
 */
export async function gatherGroup(
  deps: EntryConfirmationDeps,
  job: ConfirmationJob,
  show: ConfirmationShow
): Promise<{ entries: ConfirmationEntry[]; dueAt: string | null }> {
  const read = async (quietSince: string) => {
    if (!job.registrationId && !job.handlerId) return [];
    const rows = await deps.loadExhibitorEntries({
      showIds: [show.id],
      registrationIds: job.registrationId ? [job.registrationId] : [],
      handlerIds: job.registrationId || !job.handlerId ? [] : [job.handlerId],
      statuses: ['pending', 'failed'],
      quietSince,
    });
    const groups = groupConfirmationsByExhibitor(rows.filter(entry => !!entry.armband));
    return groups.find(group => sameText(group.key, job.groupKey))?.entries ?? [];
  };
  const quiet = await read(new Date(deps.now().getTime() - CONFIRMATION_QUIET_MS).toISOString());
  if (quiet.length > 0) return { entries: quiet, dueAt: null };
  const waiting = await read(ANY_TIME);
  const latest = Math.max(0, ...waiting.map(entry => Date.parse(entry.updated_at ?? '') || 0));
  return {
    entries: [],
    dueAt:
      waiting.length > 0 && latest > 0
        ? new Date(latest + CONFIRMATION_QUIET_MS).toISOString()
        : null,
  };
}

/**
 * The email as it should go out right now. 'unknown': a read failed, try again later (never a
 * guess). 'no_address': the exhibitor has no usable address, so nothing is sent.
 */
export async function prepareSend(
  deps: EntryConfirmationDeps,
  args: { show: ConfirmationShow; job: ConfirmationJob; entries: ConfirmationEntry[] }
): Promise<PreparedSend | 'unknown' | 'no_address'> {
  const { show, job, entries } = args;
  // A handler-only group's recipient is the handler it is grouped by (the ticket's input), never
  // whoever happens to head the entry list now; a registration's fallback is her first entry's.
  const handlerId = job.registrationId ? (entries[0]!.handler_id ?? null) : job.handlerId;
  const recipients = await deps.loadRecipients({
    registrationIds: job.registrationId ? [job.registrationId] : [],
    handlerIds: handlerId ? [handlerId] : [],
  });
  const recipient = resolveRecipient(job.registrationId, handlerId, recipients);
  if (recipient === 'unknown') return 'unknown';
  const to = usableAddress(recipient?.email);
  if (!recipient || !to) return 'no_address';

  const classIds = [
    ...new Set(entries.map(entry => entry.class_id).filter((id): id is string => !!id)),
  ];
  const judges = await deps.loadJudges(classIds);
  const numbers = await deps.loadConfirmationNumbers(
    job.registrationId ? [job.registrationId] : []
  );
  const html = deps.render(
    buildConfirmationEmailData({
      show,
      entries,
      recipient,
      judgeByClass: judges,
      confirmationNumber: (job.registrationId && numbers.get(job.registrationId)) || null,
      siteUrl: deps.siteUrl,
    }),
    show
  );
  return { to, subject: confirmationSubject(show.name, entries.length), html };
}
