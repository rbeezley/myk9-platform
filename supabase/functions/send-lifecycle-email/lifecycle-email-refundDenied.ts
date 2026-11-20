/**
 * The "no refund" email (MYK9-2249, docs/plan-refund-outcome-email.md, option B-lite), built when
 * it is SENT. The secretary denied a refund and typed why; the dog's owner and the entry's handler
 * are told "No refund for <dog> in <class>." and her reason. It names no amount, no date and no
 * payout. Nothing here issues, approves or schedules a refund: it REPORTS a decision a person made.
 *
 * The job stores only ids: { kind: 'refund_denied', entry_id }. The reason is read from the entry
 * now: a denial that was reversed meanwhile (the entry reinstated, which clears the decision and
 * the reason) sends nothing, and so does one with no reason (a legacy denial).
 */
import {
  myShowsEntriesUrl,
  type LifecycleEmailSupabaseClient,
  type QueryResult,
} from './lifecycle-email-shared.ts';
import { clean, first, type ClassRow, type DogRow } from './lifecycle-email-entryChanged.ts';

export interface RenderedRefundDeniedEmail {
  subject: string;
  body: string;
}

export type RefundDeniedPlan =
  { kind: 'skip' } | { kind: 'send'; dogName: string; classLabel: string; reason: string };

interface EntryRow {
  id: string;
  class_id: string | null;
  refund_decision: string | null;
  refund_decision_reason: string | null;
  refund_decided_at: string | null;
  refund_amount: number | null;
  refunded_at: string | null;
  payment_status: string | null;
  handler_id: string | null;
  deleted_at: string | null;
  dogs: DogRow | DogRow[] | null;
}

/** A completed show still gets this email: refunds are decided after closeout. */
export function showHearsDenial(show: {
  status: string | null;
  deleted_at?: string | null;
}): boolean {
  if (show.deleted_at) return false;
  return ['published', 'upcoming', 'in_progress', 'completed'].includes(
    clean(show.status).toLowerCase()
  );
}

export async function planRefundDeniedEmail(args: {
  supabase: LifecycleEmailSupabaseClient;
  jobId: string;
  showId: string;
  personId: string;
}): Promise<RefundDeniedPlan> {
  const { supabase } = args;
  const jobRead = (await supabase
    .from('show_lifecycle_email_jobs')
    .select('entry_changes')
    .eq('id', args.jobId)
    .single()) as QueryResult<{ entry_changes: unknown }>;
  if (jobRead.error || !jobRead.data) throw new Error('Failed to load the entries');
  const events = Array.isArray(jobRead.data.entry_changes) ? jobRead.data.entry_changes : [];
  const recorded = events
    .map(event => event as { kind?: unknown; entry_id?: unknown; decided_at?: unknown })
    .find(event => event?.kind === 'refund_denied' && typeof event.entry_id === 'string');
  const entryId = recorded?.entry_id as string | undefined;
  if (!entryId) return { kind: 'skip' };

  const entryRead = (await supabase
    .from('entries')
    .select(
      'id, class_id, refund_decision, refund_decision_reason, refund_decided_at, refund_amount, refunded_at, payment_status, handler_id, deleted_at, dogs(name, call_name, owner_id, deleted_at)'
    )
    .eq('show_id', args.showId)
    .eq('id', entryId)) as QueryResult<EntryRow[]>;
  if (entryRead.error) throw new Error('Failed to load entries');
  const entry = (entryRead.data ?? [])[0];
  const dog = entry ? first(entry.dogs) : null;
  if (!entry || entry.deleted_at || !dog) return { kind: 'skip' };

  // Only the owner and the handler are told, never a co-owner.
  if (entry.handler_id !== args.personId && dog.owner_id !== args.personId) {
    return { kind: 'skip' };
  }
  const reason = clean(entry.refund_decision_reason);
  if (entry.refund_decision !== 'denied' || !reason) return { kind: 'skip' };
  // The job names the denial that queued it: a re-denial after a reinstatement is a different
  // one, and has its own job. A job with no recorded denial time is not one this code queued.
  const queuedFor = Date.parse(String(recorded?.decided_at ?? ''));
  if (!Number.isFinite(queuedFor) || queuedFor !== Date.parse(entry.refund_decided_at ?? '')) {
    return { kind: 'skip' };
  }
  // A refund issued after the denial (the secretary revisited it) makes "no refund" untrue.
  if (
    (entry.refund_amount ?? 0) > 0 ||
    entry.refunded_at ||
    clean(entry.payment_status).toLowerCase() === 'refunded'
  ) {
    return { kind: 'skip' };
  }

  let label = 'your class';
  if (entry.class_id) {
    const classRead = (await supabase
      .from('classes')
      .select(
        'id, name, element, level, section, status, deleted_at, trials(name, date, show_id, deleted_at)'
      )
      .eq('id', entry.class_id)) as QueryResult<ClassRow[]>;
    if (classRead.error) throw new Error('Failed to load classes');
    const row = (classRead.data ?? [])[0];
    if (row) label = classNameOnly(row);
  }
  return {
    kind: 'send',
    dogName: clean(dog.call_name) || clean(dog.name) || 'your dog',
    classLabel: label,
    reason,
  };
}

/** The class name alone: this email names no date (MYK9-2249), so not classLabel's trial date. */
function classNameOnly(row: ClassRow): string {
  return (
    clean(row.name) ||
    [clean(row.element), clean(row.level), clean(row.section)].filter(Boolean).join(' ') ||
    'your class'
  );
}

function firstName(recipientName: string | null): string {
  return clean(recipientName).split(/\s+/)[0] || 'there';
}

export function renderRefundDeniedEmail(args: {
  showId: string;
  showName: string | null;
  recipientName: string | null;
  dogName: string;
  classLabel: string;
  reason: string;
}): RenderedRefundDeniedEmail {
  const showName = clean(args.showName) || 'your show';
  return {
    subject: `Refund decision at ${showName}`,
    body: [
      `Hi ${firstName(args.recipientName)},`,
      `No refund for ${args.dogName} in ${args.classLabel}.`,
      `The trial secretary says: ${args.reason}`,
      `Your entries: ${myShowsEntriesUrl(args.showId)}`,
    ].join('\n\n'),
  };
}

/** The email for one job, or skip when the denial or its reason no longer stands. */
export async function buildRefundDeniedEmail(args: {
  supabase: LifecycleEmailSupabaseClient;
  jobId: string;
  showId: string;
  personId: string;
  showName: string | null;
  recipientName: string | null;
}): Promise<{ kind: 'skip' } | { kind: 'send'; text: RenderedRefundDeniedEmail }> {
  const plan = await planRefundDeniedEmail(args);
  if (plan.kind === 'skip') return plan;
  return {
    kind: 'send',
    text: renderRefundDeniedEmail({
      showId: args.showId,
      showName: args.showName,
      recipientName: args.recipientName,
      dogName: plan.dogName,
      classLabel: plan.classLabel,
      reason: plan.reason,
    }),
  };
}
