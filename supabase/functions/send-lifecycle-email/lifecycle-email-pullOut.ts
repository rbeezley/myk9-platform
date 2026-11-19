/**
 * The "you're out" email (MYK9-2001, docs/plan-exhibitor-wait.md), built when it is SENT, from the
 * entries' current state: the dog and classes the exhibitor removed herself, and that her refund
 * is waiting for the secretary. It promises no amount and no date.
 *
 * Nothing here issues, approves or schedules a refund; a refund is never automatic. The email
 * only REPORTS what the exhibitor did. The job stores only ids: { kind: 'removed', entry_id }.
 *
 * What it says about money:
 *   paid online, club not yet paid   "The trial secretary will decide whether to issue a refund."
 *   paid online, club already paid   "The club will contact you about a refund." (MYK9-1953 is
 *                                     undecided: that sentence promises nothing else.)
 *   anything else (check, cash, unpaid, or a refund already recorded or decided)   nothing about money.
 */
import {
  myShowsEntriesUrl,
  type LifecycleEmailSupabaseClient,
  type QueryResult,
} from './lifecycle-email-shared.ts';
import {
  classIsLive,
  classLabel,
  clean,
  first,
  type ClassRow,
  type DogRow,
} from './lifecycle-email-entryChanged.ts';

/** Said once a club has been paid out; MYK9-1953 has not decided more than this. */
export const CLUB_CONTACTS_YOU = 'The club will contact you about a refund.';
export const SECRETARY_DECIDES = 'The trial secretary will decide whether to issue a refund.';

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
  handler_id: string | null;
  deleted_at: string | null;
  dogs:
    | (DogRow & { co_owner_id?: string | null })
    | Array<DogRow & { co_owner_id?: string | null }>
    | null;
}

export type PullOutPlan =
  { kind: 'skip' } | { kind: 'send'; lines: string[]; moneyNote: string | null };

function parseEvents(value: unknown): RecordedEvent[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (event): event is RecordedEvent =>
      !!event &&
      typeof event === 'object' &&
      (event as RecordedEvent).kind === 'removed' &&
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

interface LoadedEntries {
  entries: EntryRow[];
  labelFor: (entry: EntryRow) => string | null;
}

/**
 * The recorded entries, restricted to the person's own (owner, co-owner or handler) and to this show, with
 * the live classes' labels. A failed read throws: it must not read as "nothing to say".
 */
async function loadEntries(args: {
  supabase: LifecycleEmailSupabaseClient;
  jobId: string;
  showId: string;
  personId: string;
}): Promise<LoadedEntries | null> {
  const { supabase } = args;
  const jobRead = (await supabase
    .from('show_lifecycle_email_jobs')
    .select('entry_changes')
    .eq('id', args.jobId)
    .single()) as QueryResult<{ entry_changes: unknown }>;
  if (jobRead.error || !jobRead.data) throw new Error('Failed to load the entries');
  const events = parseEvents(jobRead.data.entry_changes);
  if (events.length === 0) return null;

  const entryRead = (await supabase
    .from('entries')
    .select(
      'id, class_id, entry_status, withdrawal_reason_code, payment_method, payment_status, refund_amount, refund_decision, handler_id, deleted_at, dogs(name, call_name, owner_id, co_owner_id, deleted_at)'
    )
    .eq('show_id', args.showId)
    .in('id', [...new Set(events.map(event => event.entry_id))])) as QueryResult<EntryRow[]>;
  if (entryRead.error) throw new Error('Failed to load entries');

  const entries = (entryRead.data ?? []).filter(
    entry =>
      !first(entry.dogs)?.deleted_at &&
      // The co-owner is here for the person who pulled: entry_change_actor treats a co-owner as the exhibitor.
      (entry.handler_id === args.personId ||
        first(entry.dogs)?.owner_id === args.personId ||
        first(entry.dogs)?.co_owner_id === args.personId)
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
  const loaded = await loadEntries(args);
  if (!loaded) return { kind: 'skip' };

  const lines: Array<{ dog: string; text: string }> = [];
  let paidOnline = false;
  for (const entry of loaded.entries) {
    if (!isRemoved(entry)) continue;
    const label = loaded.labelFor(entry);
    if (!label) continue;
    lines.push({ dog: dogName(entry), text: `${dogName(entry)} is out of ${label}.` });
    // A refund already recorded or decided is not "waiting": the entries page shows where it stands.
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
    subject: `Entries removed at ${showName}`,
    body: [
      `Hi ${firstName(args.recipientName)},`,
      `Here is what we recorded for you at ${showName}.`,
      args.lines.join('\n'),
      ...(args.moneyNote ? [args.moneyNote] : []),
      `Your entries: ${myShowsEntriesUrl(args.showId)}`,
    ].join('\n\n'),
  };
}
