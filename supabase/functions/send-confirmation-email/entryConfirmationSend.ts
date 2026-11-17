// What one confirmation says and who it goes to, worked out when it is SENT (MYK9-2088), from the
// current entries, venue, judges and the recipient's current address. A job never carries a body
// written minutes or hours before: the only stored payload is the one a send began with, kept to
// reconcile an attempt whose provider outcome is unknown (entryConfirmationJobs.ts).

import {
  buildConfirmationEmailData,
  confirmationSubject,
  type ConfirmationEntry,
  type ConfirmationRecipient,
  type ConfirmationShow,
} from './entryConfirmations.ts';
import type { EntryConfirmationDeps } from './entryConfirmationRun.ts';

export interface PreparedSend {
  to: string;
  subject: string;
  html: string;
}

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
 * The email as it should go out right now. 'unknown': a read failed, try again later (never a
 * guess). 'no_address': the exhibitor has no usable address, so nothing is sent.
 */
export async function prepareSend(
  deps: EntryConfirmationDeps,
  args: {
    show: ConfirmationShow;
    entries: ConfirmationEntry[];
    registrationId: string | null;
    anchorEntryId: string;
  }
): Promise<PreparedSend | 'unknown' | 'no_address'> {
  const { show, entries, registrationId } = args;
  const anchor = entries.find(entry => entry.id === args.anchorEntryId) ?? entries[0]!;
  const recipients = await deps.loadRecipients({
    registrationIds: registrationId ? [registrationId] : [],
    handlerIds: anchor.handler_id ? [anchor.handler_id] : [],
  });
  const recipient = resolveRecipient(registrationId, anchor.handler_id, recipients);
  if (recipient === 'unknown') return 'unknown';
  const to = usableAddress(recipient?.email);
  if (!recipient || !to) return 'no_address';

  const classIds = [
    ...new Set(entries.map(entry => entry.class_id).filter((id): id is string => !!id)),
  ];
  const judges = await deps.loadJudges(classIds);
  const numbers = await deps.loadConfirmationNumbers(registrationId ? [registrationId] : []);
  const html = deps.render(
    buildConfirmationEmailData({
      show,
      entries,
      recipient,
      judgeByClass: judges,
      confirmationNumber: (registrationId && numbers.get(registrationId)) || null,
      siteUrl: deps.siteUrl,
    }),
    show
  );
  return { to, subject: confirmationSubject(show.name, entries.length), html };
}
