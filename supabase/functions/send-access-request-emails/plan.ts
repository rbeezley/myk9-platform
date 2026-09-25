// Pure planning for one access-request email job: who gets which message,
// minus anyone a previous attempt already reached.

import type { AccessRequestEvent, AccessRequestRecord, Person } from './records.ts';
import {
  decisionEmail,
  requesterReceivedEmail,
  reviewerNoticeEmail,
  type EmailMessage,
} from './templates.ts';

export interface Delivery {
  /** Lower-cased address; also the key recorded in the job's delivered_to. */
  to: string;
  message: EmailMessage;
}

function address(person: Person): string | null {
  return person.email?.trim().toLowerCase() || null;
}

/**
 * Submitted: a confirmation to the requester, and a notice to each reviewer
 * while the request is still pending (a request reviewed before the job ran
 * has nothing waiting). Approved/denied: the decision, to the requester only.
 * An address appears at most once; people without one are dropped.
 */
export function planDeliveries(
  record: AccessRequestRecord,
  event: AccessRequestEvent,
  reviewers: readonly Person[],
  siteUrl: string
): Delivery[] {
  const planned: Array<{ person: Person; message: EmailMessage }> = [];
  if (event === 'submitted') {
    planned.push({ person: record.requester, message: requesterReceivedEmail(record, siteUrl) });
    if (record.status === 'pending') {
      const notice = reviewerNoticeEmail(record, siteUrl);
      for (const reviewer of reviewers) planned.push({ person: reviewer, message: notice });
    }
  } else {
    planned.push({ person: record.requester, message: decisionEmail(record, event, siteUrl) });
  }

  const seen = new Set<string>();
  const deliveries: Delivery[] = [];
  for (const { person, message } of planned) {
    const to = address(person);
    if (!to || seen.has(to)) continue;
    seen.add(to);
    deliveries.push({ to, message });
  }
  return deliveries;
}

/** The deliveries a previous attempt of this job has not reached yet. */
export function remainingDeliveries(
  deliveries: readonly Delivery[],
  deliveredTo: readonly string[]
): Delivery[] {
  const done = new Set(deliveredTo.map(value => value.trim().toLowerCase()));
  return deliveries.filter(delivery => !done.has(delivery.to));
}

/**
 * Resend de-duplicates a repeated key for 24 hours, which covers the one gap
 * the job cannot: a send that landed but whose result was never recorded.
 */
export function idempotencyKey(jobId: string, to: string): string {
  return `access-request-${jobId}-${to.trim().toLowerCase()}`;
}
