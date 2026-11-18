/**
 * The "entry changed" email (MYK9-2126): built when it is SENT, from the entries' current
 * state, so a job that waited out several edits says what is true now and drops whatever the
 * secretary undid or changed back.
 *
 * The job stores only ids and pre-edit values: entry_changes is a list of
 *   moved      { entry_id: the new entry, from_entry_id, from_class_id, to_class_id }
 *   withdrawn | pulled | removed   { entry_id }
 *   edited     { entry_id, field: 'handler' | 'jump_height', from }
 * An accepted class change request lands as a move, so it is told here and nowhere else.
 */
import type { LifecycleEmailSupabaseClient, QueryResult } from './lifecycle-email-shared.ts';
import { formatTrialDate } from './lifecycle-email-showChanged.ts';

export type EntryChangeLineKind = 'moved' | 'withdrawn' | 'pulled' | 'removed' | 'edited';

export interface EntryChangeLine {
  kind: EntryChangeLineKind;
  /** The dog's call name, or its name. */
  dogName: string;
  /** The class the line is about, with its trial and day. */
  classLabel: string;
  /** Plain words for the part after the dog: "moved from X to Y". */
  text: string;
}

export interface RenderedEntryChangedEmail {
  subject: string;
  body: string;
}

interface RecordedEvent {
  kind: string;
  entry_id: string;
  from_entry_id?: string;
  from_class_id?: string;
  to_class_id?: string;
  field?: string;
  from?: string | null;
}

interface EntryRow {
  id: string;
  class_id: string | null;
  entry_status: string | null;
  check_in_status: string | null;
  handler_id: string | null;
  jump_height: string | null;
  deleted_at: string | null;
  dogs: DogRow | DogRow[] | null;
}

interface DogRow {
  name: string | null;
  call_name: string | null;
  owner_id: string | null;
}

interface ClassRow {
  id: string;
  name: string | null;
  element: string | null;
  level: string | null;
  section: string | null;
  trials: TrialRow | TrialRow[] | null;
}

interface TrialRow {
  name: string | null;
  date: string | null;
}

interface PersonRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
}

const WITHDRAWN_STATUSES = ['withdrawn', 'scratched'];

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

function classLabel(row: ClassRow | undefined): string {
  if (!row) return 'your class';
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

function personName(person: PersonRow | undefined): string | null {
  if (!person) return null;
  return [clean(person.first_name), clean(person.last_name)].filter(Boolean).join(' ') || null;
}

export type EntryChangedPlan = { kind: 'skip' } | { kind: 'send'; lines: EntryChangeLine[] };

/**
 * Reads what the email needs and decides whether it still has anything to say: only entries
 * the person owns or handles now, only changes that still stand (a move back, a reinstated
 * entry, an edit changed back are not news).
 */
export async function planEntryChangedEmail(args: {
  supabase: LifecycleEmailSupabaseClient;
  jobId: string;
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
      'id, class_id, entry_status, check_in_status, handler_id, jump_height, deleted_at, dogs(name, call_name, owner_id)'
    )
    .in('id', entryIds)) as QueryResult<EntryRow[]>;
  if (entryRead.error) throw new Error('Failed to load entries');
  const entries = new Map((entryRead.data ?? []).map(row => [row.id, row]));

  const isMine = (entry: EntryRow) =>
    entry.handler_id === args.personId || first(entry.dogs)?.owner_id === args.personId;
  const isLive = (entry: EntryRow) =>
    !entry.deleted_at &&
    !WITHDRAWN_STATUSES.includes(clean(entry.entry_status)) &&
    clean(entry.entry_status) !== 'moved';

  // Moves chain (A to B to C is one move; a round trip is none). Each chain is told once,
  // against the entry it ended on, and only while that entry is live.
  const moves = events.filter(event => event.kind === 'moved' && event.from_entry_id);
  const movedTo = new Set(moves.map(event => event.entry_id));
  const chains: Array<{ start: RecordedEvent; end: RecordedEvent }> = [];
  for (const start of moves) {
    if (movedTo.has(start.from_entry_id as string)) continue;
    let end = start;
    for (let guard = 0; guard < moves.length; guard += 1) {
      const next = moves.find(event => event.from_entry_id === end.entry_id);
      if (!next) break;
      end = next;
    }
    chains.push({ start, end });
  }

  // Everything else, deduplicated: one line per entry for its worst outcome, one per edited field.
  const outcomes = new Map<string, 'withdrawn' | 'pulled' | 'removed'>();
  const rank = { withdrawn: 3, pulled: 2, removed: 1 } as const;
  const edits = new Map<string, RecordedEvent>();
  for (const event of events) {
    const entry = entries.get(event.entry_id);
    if (!entry || !isMine(entry)) continue;
    if (event.kind === 'withdrawn' && WITHDRAWN_STATUSES.includes(clean(entry.entry_status))) {
      outcomes.set(event.entry_id, 'withdrawn');
    } else if (event.kind === 'pulled' && entry.check_in_status === 'pulled') {
      if (rank.pulled > (rank[outcomes.get(event.entry_id) ?? 'removed'] ?? 0)) {
        outcomes.set(event.entry_id, 'pulled');
      }
    } else if (event.kind === 'removed' && entry.deleted_at && !outcomes.has(event.entry_id)) {
      outcomes.set(event.entry_id, 'removed');
    } else if (event.kind === 'edited' && event.field) {
      const key = `${event.entry_id}:${event.field}`;
      if (!edits.has(key)) edits.set(key, event);
    }
  }

  const classIds = new Set<string>();
  const personIds = new Set<string>();
  for (const { start, end } of chains) {
    if (start.from_class_id) classIds.add(start.from_class_id);
    if (end.to_class_id) classIds.add(end.to_class_id);
  }
  for (const id of outcomes.keys()) {
    const classId = entries.get(id)?.class_id;
    if (classId) classIds.add(classId);
  }
  for (const event of edits.values()) {
    const entry = entries.get(event.entry_id);
    if (entry?.class_id) classIds.add(entry.class_id);
    if (event.field === 'handler') {
      if (event.from) personIds.add(event.from);
      if (entry?.handler_id) personIds.add(entry.handler_id);
    }
  }

  const classes = new Map<string, ClassRow>();
  if (classIds.size > 0) {
    const classRead = (await supabase
      .from('classes')
      .select('id, name, element, level, section, trials(name, date)')
      .in('id', [...classIds])) as QueryResult<ClassRow[]>;
    if (classRead.error) throw new Error('Failed to load classes');
    for (const row of classRead.data ?? []) classes.set(row.id, row);
  }
  const people = new Map<string, PersonRow>();
  if (personIds.size > 0) {
    const peopleRead = (await supabase
      .from('people')
      .select('id, first_name, last_name')
      .in('id', [...personIds])) as QueryResult<PersonRow[]>;
    if (peopleRead.error) throw new Error('Failed to load people');
    for (const row of peopleRead.data ?? []) people.set(row.id, row);
  }

  const dogName = (entry: EntryRow | undefined) => {
    const dog = first(entry?.dogs);
    return clean(dog?.call_name) || clean(dog?.name) || 'Your dog';
  };
  const lines: EntryChangeLine[] = [];

  for (const { start, end } of chains) {
    const entry = entries.get(end.entry_id);
    if (!entry || !isMine(entry) || !isLive(entry)) continue;
    if (!start.from_class_id || !end.to_class_id || start.from_class_id === end.to_class_id) {
      continue;
    }
    const from = classLabel(classes.get(start.from_class_id));
    const to = classLabel(classes.get(end.to_class_id));
    lines.push({
      kind: 'moved',
      dogName: dogName(entry),
      classLabel: to,
      text: `moved from ${from} to ${to}`,
    });
  }

  for (const [entryId, outcome] of outcomes) {
    const entry = entries.get(entryId);
    const label = classLabel(entry?.class_id ? classes.get(entry.class_id) : undefined);
    const verb = { withdrawn: 'withdrawn from', pulled: 'pulled from', removed: 'removed from' }[
      outcome
    ];
    lines.push({
      kind: outcome,
      dogName: dogName(entry),
      classLabel: label,
      text: `${verb} ${label}`,
    });
  }

  for (const event of edits.values()) {
    const entry = entries.get(event.entry_id);
    // A withdrawn, pulled or removed entry is told as that, not as an edit as well.
    if (!entry || outcomes.has(event.entry_id)) continue;
    const label = classLabel(entry.class_id ? classes.get(entry.class_id) : undefined);
    if (event.field === 'handler') {
      const was = event.from ? personName(people.get(event.from)) : null;
      const now = entry.handler_id ? personName(people.get(entry.handler_id)) : null;
      if ((event.from ?? null) === (entry.handler_id ?? null)) continue;
      const text = now
        ? was
          ? `handler changed from ${was} to ${now} in ${label}`
          : `handler is now ${now} in ${label}`
        : `handler removed in ${label}`;
      lines.push({ kind: 'edited', dogName: dogName(entry), classLabel: label, text });
    } else if (event.field === 'jump_height') {
      const was = clean(event.from);
      const now = clean(entry.jump_height);
      if (was === now) continue;
      lines.push({
        kind: 'edited',
        dogName: dogName(entry),
        classLabel: label,
        text: `jump height changed from ${was || 'not set'} to ${now || 'not set'} in ${label}`,
      });
    }
  }

  if (lines.length === 0) return skip;
  lines.sort((a, b) => a.dogName.localeCompare(b.dogName) || a.text.localeCompare(b.text));
  return { kind: 'send', lines };
}

export function renderEntryChangedEmail(args: {
  showId: string;
  showName: string | null;
  recipientName: string | null;
  lines: readonly EntryChangeLine[];
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
      args.lines.map(line => `${line.dogName}: ${line.text}`).join('\n'),
      'If this is not what you expected, contact the trial secretary.',
      `Your entries: https://myk9show.com/exhibitor/entries?showId=${args.showId}`,
    ].join('\n\n'),
  };
}
