/**
 * The "entry changed" email (MYK9-2126): built when it is SENT, from the entries' current
 * state, so a job that waited out several edits says what is true now.
 *
 * Three things are told, each once, in plain words (owner decision 2026-11-18):
 *   moved    a class move, which is also how an accepted class change request lands
 *   pulled   a confirmed Pull (entry_status 'scratched'); a ringside check-in flag is not one
 *   edited   the handler name or the jump height
 * The job stores only ids and pre-edit values:
 *   moved    { entry_id: the new entry, from_entry_id, from_class_id, to_class_id }
 *   pulled   { entry_id }
 *   edited   { entry_id, field: 'handler' | 'jump_height', from }
 * There are no correction emails: a change that no longer stands on the entry (a move whose
 * entry was put back, an edit changed back) says nothing, and a later change emails its own
 * new state. Every read is scoped to the job's show.
 */
import type { LifecycleEmailSupabaseClient, QueryResult } from './lifecycle-email-shared.ts';
import { formatTrialDate } from './lifecycle-email-showChanged.ts';

export interface RenderedEntryChangedEmail {
  subject: string;
  body: string;
}

interface RecordedEvent {
  kind: string;
  entry_id: string;
  from_entry_id?: string;
  to_class_id?: string;
  field?: string;
  from?: string | null;
}

interface DogRow {
  name: string | null;
  call_name: string | null;
  owner_id: string | null;
  deleted_at?: string | null;
}

interface EntryRow {
  id: string;
  class_id: string | null;
  entry_status: string | null;
  check_in_status: string | null;
  handler_id: string | null;
  handler: string | null;
  jump_height: string | null;
  deleted_at: string | null;
  dogs: DogRow | DogRow[] | null;
}

interface TrialRow {
  name: string | null;
  date: string | null;
  show_id: string | null;
  deleted_at: string | null;
}

interface ClassRow {
  id: string;
  name: string | null;
  element: string | null;
  level: string | null;
  section: string | null;
  status?: string | null;
  deleted_at: string | null;
  trials: TrialRow | TrialRow[] | null;
}

/**
 * Entry statuses that still run: the same list as live_entry_person_class_pairs (the rule
 * the show and judge change emails use), so a dog marked absent or declined is not told it
 * is in a class it will not run.
 */
const LIVE_ENTRY_STATUSES = [
  'confirmed',
  'accepted',
  'scheduled',
  'checked-in',
  'at-gate',
  'in-ring',
  'competing',
  'completed',
  'move-up-requested',
  'move_up_requested',
  'submitted',
  'paid',
  'pending',
  'promotion-expired',
  'waitlisted',
  'pending-payment',
];

function clean(value: string | null | undefined): string {
  return (value ?? '').trim();
}

function first<T>(value: T | T[] | null | undefined): T | null {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

function parseEvents(value: unknown): RecordedEvent[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (event): event is RecordedEvent =>
      !!event &&
      typeof event === 'object' &&
      typeof (event as RecordedEvent).kind === 'string' &&
      typeof (event as RecordedEvent).entry_id === 'string'
  );
}

/**
 * The same related-row rules as live_entry_person_class_pairs: a class that is deleted or
 * cancelled, or whose trial is deleted or of another show, is not one to tell anyone about.
 */
function classIsLive(row: ClassRow, showId: string): boolean {
  const trial = first(row.trials);
  return (
    !!trial &&
    trial.show_id === showId &&
    !trial.deleted_at &&
    !row.deleted_at &&
    !['cancelled', 'canceled'].includes(clean(row.status).toLowerCase())
  );
}

function classLabel(row: ClassRow): string {
  const name =
    clean(row.name) ||
    [clean(row.element), clean(row.level), clean(row.section)].filter(Boolean).join(' ') ||
    'your class';
  const trial = first(row.trials);
  const where = trial
    ? [clean(trial.name), clean(trial.date) ? formatTrialDate(clean(trial.date)) : '']
        .filter(Boolean)
        .join(', ')
    : '';
  return where ? `${name} (${where})` : name;
}

/** Not deleted, not flagged pulled at check-in, and in a status that still runs. */
function entryRuns(entry: EntryRow): boolean {
  return (
    !entry.deleted_at &&
    !first(entry.dogs)?.deleted_at &&
    LIVE_ENTRY_STATUSES.includes(clean(entry.entry_status)) &&
    entry.check_in_status !== 'pulled'
  );
}

export type EntryChangedPlan = { kind: 'skip' } | { kind: 'send'; lines: string[] };

/**
 * Reads what the email needs and decides whether it still has anything to say: only entries
 * the person owns or handles now, only changes that still stand, and an edit as it stands on
 * the entry it ended on.
 */
export async function planEntryChangedEmail(args: {
  supabase: LifecycleEmailSupabaseClient;
  jobId: string;
  showId: string;
  personId: string;
}): Promise<EntryChangedPlan> {
  const { supabase } = args;
  const skip: EntryChangedPlan = { kind: 'skip' };

  const jobRead = (await supabase
    .from('show_lifecycle_email_jobs')
    .select('entry_changes')
    .eq('id', args.jobId)
    .single()) as QueryResult<{ entry_changes: unknown }>;
  // A failed read must not read as "nothing changed": leave the job for the next drain.
  if (jobRead.error || !jobRead.data) throw new Error('Failed to load the entry changes');
  const events = parseEvents(jobRead.data.entry_changes);
  if (events.length === 0) return skip;

  const entryIds = [...new Set(events.map(event => event.entry_id))];
  const entryRead = (await supabase
    .from('entries')
    .select(
      'id, class_id, entry_status, check_in_status, handler_id, handler, jump_height, deleted_at, dogs(name, call_name, owner_id, deleted_at)'
    )
    .eq('show_id', args.showId)
    .in('id', entryIds)) as QueryResult<EntryRow[]>;
  if (entryRead.error) throw new Error('Failed to load entries');
  const entries = new Map((entryRead.data ?? []).map(row => [row.id, row]));

  const isMine = (entry: EntryRow) =>
    entry.handler_id === args.personId || first(entry.dogs)?.owner_id === args.personId;

  // An edit made before a move belongs to the entry the move ended on (a move carries its
  // fields along), so it is read there.
  const successor = new Map(
    events
      .filter(event => event.kind === 'moved' && event.from_entry_id)
      .map(event => [event.from_entry_id as string, event.entry_id])
  );
  // ...unless that move was undone: the restored source entry is the one that survives, and
  // the successor is soft-deleted, so the edit is read on the last entry in the chain that
  // still stands (not deleted, not left behind by a move).
  const survives = (id: string) => {
    const entry = entries.get(id);
    return !!entry && !entry.deleted_at && clean(entry.entry_status) !== 'moved';
  };
  const finalEntryId = (entryId: string) => {
    let current = entryId;
    let surviving = survives(entryId) ? entryId : null;
    for (let guard = 0; guard < successor.size; guard += 1) {
      const next = successor.get(current);
      if (!next || next === entryId) break;
      current = next;
      if (survives(current)) surviving = current;
    }
    return surviving ?? current;
  };

  const moves = events.filter(event => event.kind === 'moved' && event.to_class_id);
  const pulledIds = new Set<string>();
  for (const event of events) {
    const entry = entries.get(event.entry_id);
    if (
      event.kind === 'pulled' &&
      entry &&
      isMine(entry) &&
      !entry.deleted_at &&
      clean(entry.entry_status) === 'scratched'
    ) {
      pulledIds.add(event.entry_id);
    }
  }
  // An edit keeps the value before the FIRST edit of the field.
  const edits = new Map<string, { entryId: string; event: RecordedEvent }>();
  for (const event of events) {
    if (event.kind !== 'edited' || !event.field) continue;
    const entryId = finalEntryId(event.entry_id);
    const key = `${entryId}:${event.field}`;
    if (!edits.has(key)) edits.set(key, { entryId, event });
  }

  const classIds = new Set<string>();
  for (const event of moves) if (event.to_class_id) classIds.add(event.to_class_id);
  for (const id of [...pulledIds, ...[...edits.values()].map(edit => edit.entryId)]) {
    const classId = entries.get(id)?.class_id;
    if (classId) classIds.add(classId);
  }
  const classes = new Map<string, ClassRow>();
  if (classIds.size > 0) {
    const classRead = (await supabase
      .from('classes')
      .select(
        'id, name, element, level, section, status, deleted_at, trials(name, date, show_id, deleted_at)'
      )
      .in('id', [...classIds])) as QueryResult<ClassRow[]>;
    if (classRead.error) throw new Error('Failed to load classes');
    for (const row of classRead.data ?? []) {
      // A class of another show is never named in this show's email.
      if (classIsLive(row, args.showId)) classes.set(row.id, row);
    }
  }
  // A line is told only with a class that is still live; there is no fallback wording.
  const labelFor = (entry: EntryRow) => {
    const row = entry.class_id ? classes.get(entry.class_id) : undefined;
    return row ? classLabel(row) : null;
  };
  const dogName = (entry: EntryRow) => {
    const dog = first(entry.dogs);
    return clean(dog?.call_name) || clean(dog?.name) || 'Your dog';
  };

  const lines: Array<{ dog: string; text: string }> = [];

  for (const event of moves) {
    const entry = entries.get(event.entry_id);
    // Told only while the entry the move produced still runs in the class it was moved to.
    if (!entry || !isMine(entry) || !entryRuns(entry)) continue;
    if (entry.class_id !== event.to_class_id) continue;
    const label = labelFor(entry);
    if (!label) continue;
    lines.push({
      dog: dogName(entry),
      text: `You are now entered in ${label} with ${dogName(entry)}.`,
    });
  }

  for (const entryId of pulledIds) {
    const entry = entries.get(entryId);
    if (!entry || first(entry.dogs)?.deleted_at) continue;
    const label = labelFor(entry);
    if (!label) continue;
    lines.push({
      dog: dogName(entry),
      text: `${dogName(entry)} has been pulled from ${label}.`,
    });
  }

  for (const { entryId, event } of edits.values()) {
    const entry = entries.get(entryId);
    // An edit is told only on an entry still running; a pulled entry is told as pulled.
    if (!entry || !isMine(entry) || !entryRuns(entry) || pulledIds.has(entryId)) continue;
    const label = labelFor(entry);
    if (!label) continue;
    const was = clean(event.from);
    if (event.field === 'handler') {
      const now = clean(entry.handler);
      if (was === now) continue;
      const text = now
        ? was
          ? `The handler for ${dogName(entry)} in ${label} changed from ${was} to ${now}.`
          : `The handler for ${dogName(entry)} in ${label} is now ${now}.`
        : `The handler for ${dogName(entry)} in ${label} was removed.`;
      lines.push({ dog: dogName(entry), text });
    } else if (event.field === 'jump_height') {
      const now = clean(entry.jump_height);
      if (was === now) continue;
      lines.push({
        dog: dogName(entry),
        text: `The jump height for ${dogName(entry)} in ${label} changed from ${was || 'not set'} to ${now || 'not set'}.`,
      });
    }
  }

  if (lines.length === 0) return skip;
  lines.sort((a, b) => a.dog.localeCompare(b.dog) || a.text.localeCompare(b.text));
  return { kind: 'send', lines: lines.map(line => line.text) };
}

export function renderEntryChangedEmail(args: {
  showId: string;
  showName: string | null;
  recipientName: string | null;
  lines: readonly string[];
}): RenderedEntryChangedEmail {
  const showName = clean(args.showName) || 'your show';
  const firstName = clean(args.recipientName).split(/\s+/)[0] || 'there';
  const intro =
    args.lines.length === 1
      ? `The trial secretary made a change to your entry at ${showName}.`
      : `The trial secretary made ${args.lines.length} changes to your entries at ${showName}.`;
  return {
    subject: `Change to your entry at ${showName}`,
    body: [
      `Hi ${firstName},`,
      intro,
      args.lines.join('\n'),
      'If this is not what you expected, contact the trial secretary.',
      `Your entries: https://myk9show.com/exhibitor/entries?showId=${args.showId}`,
    ].join('\n\n'),
  };
}
