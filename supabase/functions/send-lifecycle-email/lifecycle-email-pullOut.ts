/**
 * The two "pulling out" emails (MYK9-2001, docs/plan-exhibitor-wait.md), built when they are
 * SENT, from the entries' current state:
 *
 *   pulled_out      "You're out": the dog and classes the exhibitor removed herself, and where the
 *                   refund stands. It promises no amount and no date.
 *   refund_outcome  "The outcome": what was refunded, or that nothing was and the secretary's reason.
 *
 * Nothing here issues, approves or schedules a refund; a refund is never automatic. These emails
 * only REPORT what a person already did. The amount is the entry's own recorded refund_amount,
 * never a figure computed from the show's current fees.
 *
 * The job stores only ids: { kind: 'removed' | 'refunded' | 'denied', entry_id }.
 *
 * What the "removed" email says about money:
 *   paid online, club not yet paid   "The trial secretary decides on a refund. We will email you
 *                                     when it is decided."
 *   paid online, club already paid   "The club will contact you about a refund." (MYK9-1953 is
 *                                     undecided: that sentence promises nothing else.)
 *   anything else (check, cash, unpaid)   nothing about money.
 */
import type { LifecycleEmailSupabaseClient, QueryResult } from './lifecycle-email-shared.ts';
import {
  classIsLive,
  classLabel,
  clean,
  first,
  type ClassRow,
  type DogRow,
} from './lifecycle-email-entryChanged.ts';

export const PULL_OUT_STEP_TYPES = ['pulled_out', 'refund_outcome'] as const;

/** Said once a club has been paid out; MYK9-1953 has not decided more than this. */
export const CLUB_CONTACTS_YOU = 'The club will contact you about a refund.';
export const SECRETARY_DECIDES =
  'The trial secretary decides on a refund. We will email you when it is decided.';

export interface RenderedPullOutEmail {
  subject: string;
  body: string;
}

interface RecordedEvent {
  kind: string;
  entry_id: string;
}

interface EntryRow {
  id: string;
  class_id: string | null;
  entry_status: string | null;
  withdrawal_reason_code: string | null;
  payment_method: string | null;
  payment_status: string | null;
  refund_amount: number | null;
  refund_decision: string | null;
  refund_decision_reason: string | null;
  handler_id: string | null;
  deleted_at: string | null;
  dogs: DogRow | DogRow[] | null;
}

export type PullOutPlan =
  { kind: 'skip' } | { kind: 'send'; lines: string[]; moneyNote: string | null };

function parseEvents(value: unknown, kinds: readonly string[]): RecordedEvent[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (event): event is RecordedEvent =>
      !!event &&
      typeof event === 'object' &&
      kinds.includes((event as RecordedEvent).kind) &&
      typeof (event as RecordedEvent).entry_id === 'string'
  );
}

/** A Pull is 'scratched'; a Withdraw is 'withdrawn' WITH a reason code. A codeless one is no act of hers. */
function isRemoved(entry: EntryRow): boolean {
  if (entry.deleted_at) return false;
  const status = clean(entry.entry_status);
  return (
    status === 'scratched' || (status === 'withdrawn' && !!clean(entry.withdrawal_reason_code))
  );
}

function dogName(entry: EntryRow): string {
  const dog = first(entry.dogs);
  return clean(dog?.call_name) || clean(dog?.name) || 'Your dog';
}

function formatDollars(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

interface LoadedEntries {
  entries: EntryRow[];
  labelFor: (entry: EntryRow) => string | null;
}

/**
 * The recorded entries, restricted to the person's own (owner or handler) and to this show, with
 * the live classes' labels. A failed read throws: it must not read as "nothing to say".
 */
async function loadEntries(args: {
  supabase: LifecycleEmailSupabaseClient;
  jobId: string;
  showId: string;
  personId: string;
  kinds: readonly string[];
}): Promise<LoadedEntries | null> {
  const { supabase } = args;
  const jobRead = (await supabase
    .from('show_lifecycle_email_jobs')
    .select('entry_changes')
    .eq('id', args.jobId)
    .single()) as QueryResult<{ entry_changes: unknown }>;
  if (jobRead.error || !jobRead.data) throw new Error('Failed to load the entries');
  const events = parseEvents(jobRead.data.entry_changes, args.kinds);
  if (events.length === 0) return null;

  const entryRead = (await supabase
    .from('entries')
    .select(
      'id, class_id, entry_status, withdrawal_reason_code, payment_method, payment_status, refund_amount, refund_decision, refund_decision_reason, handler_id, deleted_at, dogs(name, call_name, owner_id, deleted_at)'
    )
    .eq('show_id', args.showId)
    .in('id', [...new Set(events.map(event => event.entry_id))])) as QueryResult<EntryRow[]>;
  if (entryRead.error) throw new Error('Failed to load entries');

  const entries = (entryRead.data ?? []).filter(
    entry =>
      !first(entry.dogs)?.deleted_at &&
      (entry.handler_id === args.personId || first(entry.dogs)?.owner_id === args.personId)
  );
  const classIds = [...new Set(entries.map(entry => entry.class_id).filter(Boolean))] as string[];
  const classes = new Map<string, ClassRow>();
  if (classIds.length > 0) {
    const classRead = (await supabase
      .from('classes')
      .select(
        'id, name, element, level, section, status, deleted_at, trials(name, date, show_id, deleted_at)'
      )
      .in('id', classIds)) as QueryResult<ClassRow[]>;
    if (classRead.error) throw new Error('Failed to load classes');
    for (const row of classRead.data ?? []) {
      if (classIsLive(row, args.showId)) classes.set(row.id, row);
    }
  }
  return {
    entries,
    labelFor: entry => {
      const row = entry.class_id ? classes.get(entry.class_id) : undefined;
      return row ? classLabel(row) : null;
    },
  };
}

async function clubHasBeenPaid(
  supabase: LifecycleEmailSupabaseClient,
  showId: string
): Promise<boolean> {
  const { data, error } = (await supabase
    .from('show_payouts')
    .select('id')
    .eq('show_id', showId)
    .eq('status', 'completed')) as QueryResult<Array<{ id: string }>>;
  // A failed read must not read as "the club has not been paid": leave the job for the next drain.
  if (error) throw new Error('Failed to load the payout');
  return (data ?? []).length > 0;
}

/** "You're out": only entries still removed by her own act, told with a live class. */
export async function planPulledOutEmail(args: {
  supabase: LifecycleEmailSupabaseClient;
  jobId: string;
  showId: string;
  personId: string;
}): Promise<PullOutPlan> {
  const loaded = await loadEntries({ ...args, kinds: ['removed'] });
  if (!loaded) return { kind: 'skip' };

  const lines: Array<{ dog: string; text: string }> = [];
  let paidOnline = false;
  for (const entry of loaded.entries) {
    if (!isRemoved(entry)) continue;
    const label = loaded.labelFor(entry);
    if (!label) continue;
    lines.push({ dog: dogName(entry), text: `${dogName(entry)} is out of ${label}.` });
    // A refund already recorded is the outcome email's to tell.
    if (
      clean(entry.payment_method) === 'online' &&
      clean(entry.payment_status) === 'paid' &&
      !((entry.refund_amount ?? 0) > 0) &&
      !entry.refund_decision
    ) {
      paidOnline = true;
    }
  }
  if (lines.length === 0) return { kind: 'skip' };
  lines.sort((a, b) => a.dog.localeCompare(b.dog) || a.text.localeCompare(b.text));

  let moneyNote: string | null = null;
  if (paidOnline) {
    moneyNote = (await clubHasBeenPaid(args.supabase, args.showId))
      ? CLUB_CONTACTS_YOU
      : SECRETARY_DECIDES;
  }
  return { kind: 'send', lines: lines.map(line => line.text), moneyNote };
}

/** "The outcome": a refund still recorded, or a denial still standing, on an entry still removed. */
export async function planRefundOutcomeEmail(args: {
  supabase: LifecycleEmailSupabaseClient;
  jobId: string;
  showId: string;
  personId: string;
}): Promise<PullOutPlan> {
  const loaded = await loadEntries({ ...args, kinds: ['refunded', 'denied'] });
  if (!loaded) return { kind: 'skip' };

  const lines: Array<{ dog: string; text: string }> = [];
  for (const entry of loaded.entries) {
    if (!isRemoved(entry)) continue;
    // Only an online payment has a card to refund or a denial to explain; cash and check carry no money text.
    if (clean(entry.payment_method) !== 'online') continue;
    const label = loaded.labelFor(entry);
    if (!label) continue;
    const dog = dogName(entry);
    if ((entry.refund_amount ?? 0) > 0) {
      lines.push({
        dog,
        text: `Refunded ${formatDollars(Number(entry.refund_amount))} to your card for ${dog} in ${label}.`,
      });
    } else if (entry.refund_decision === 'denied') {
      const reason = clean(entry.refund_decision_reason);
      lines.push({
        dog,
        text: reason
          ? `No refund for ${dog} in ${label}. The trial secretary's reason: ${reason}`
          : `No refund for ${dog} in ${label}.`,
      });
    }
  }
  if (lines.length === 0) return { kind: 'skip' };
  lines.sort((a, b) => a.dog.localeCompare(b.dog) || a.text.localeCompare(b.text));
  return { kind: 'send', lines: lines.map(line => line.text), moneyNote: null };
}

function firstName(recipientName: string | null): string {
  return clean(recipientName).split(/\s+/)[0] || 'there';
}

export function renderPulledOutEmail(args: {
  showId: string;
  showName: string | null;
  recipientName: string | null;
  lines: readonly string[];
  moneyNote: string | null;
}): RenderedPullOutEmail {
  const showName = clean(args.showName) || 'your show';
  return {
    subject: `You are out of ${showName}`,
    body: [
      `Hi ${firstName(args.recipientName)},`,
      `Here is what we recorded for you at ${showName}.`,
      args.lines.join('\n'),
      ...(args.moneyNote ? [args.moneyNote] : []),
      `Your entries: https://myk9show.com/exhibitor/entries?showId=${args.showId}`,
    ].join('\n\n'),
  };
}

export function renderRefundOutcomeEmail(args: {
  showId: string;
  showName: string | null;
  recipientName: string | null;
  lines: readonly string[];
}): RenderedPullOutEmail {
  const showName = clean(args.showName) || 'your show';
  return {
    subject: `Your refund for ${showName}`,
    body: [
      `Hi ${firstName(args.recipientName)},`,
      `The trial secretary has decided on your refund for ${showName}.`,
      args.lines.join('\n'),
      `Your entries: https://myk9show.com/exhibitor/entries?showId=${args.showId}`,
    ].join('\n\n'),
  };
}
