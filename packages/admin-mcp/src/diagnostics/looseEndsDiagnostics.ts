/**
 * `diagnose_show_loose_ends` — what an operator left dangling at a show.
 *
 * Read-only. Reports, with named rows and links:
 *   (a) dogs and people created from this show's add-entry flow
 *       (`created_from_show_id = show`) that have no live entry in the show;
 *   (b) enrollments with no entries, and entries with no enrollment;
 *   (c) duplicate live entries for one dog and one class;
 *   (d) entries stuck in a detectable pending or failed state.
 *
 * Rows created before attribution existed have `created_from_show_id IS NULL`
 * and can only be matched by timing. They are reported in a SEPARATE section
 * whose every row, and whose summary, says GUESS. The window rule is documented
 * on {@link buildActivityWindows}.
 */
import type { AdminToolDefinition } from '../mcp/server';
import type { ToolContext } from '../tools/index';
import { diagnoseShowLooseEndsInput, type DiagnoseShowLooseEndsInput } from '../tools/schemas';
import { buildDogLink, buildEntryManagementLink, buildPersonLink, buildShowLink } from './links';
import {
  buildActivityWindows,
  chunk,
  describeWindows,
  findDuplicateEntryGroups,
  inAnyWindow,
  stuckReasons,
  type LooseEntry,
} from './looseEndsLogic';
import { redactEmail } from './redaction';
import type { DiagnosticEvidence, DiagnosticLink, DiagnosticResult } from './types';
import { createDiagnosticResult } from './types';

/** Most rows read per table; PostgREST pages are 1000, so this is five pages. */
const SCAN_CAP = 5000;
const PAGE = 1000;
const IN_CHUNK = 150;

const ENTRY_SELECT =
  'id, dog_id, class_id, registration_id, handler_id, entry_status, ' +
  'confirmation_email_status, created_at';
const GUESS = 'GUESS (time-window heuristic, NOT recorded attribution)';

interface EnrollmentRow {
  id: string;
  confirmation_number: string;
  handler_id: string;
  payment_status: string;
  created_at: string;
}
interface DogRow {
  id: string;
  call_name: string;
  owner_id: string | null;
  created_at: string | null;
  created_by: string | null;
}
interface PersonRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  created_at: string | null;
  created_by: string | null;
  auth_user_id: string | null;
}
interface ClassRow {
  id: string;
  name: string;
  class_number: string | null;
}

type Page<T> = PromiseLike<{ data: T[] | null; error: unknown }>;

class SourceError extends Error {}

async function fetchPaged<T>(
  what: string,
  build: (from: number, to: number) => Page<T>
): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = [];
  for (let from = 0; from < SCAN_CAP; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new SourceError(`Could not read ${what}.`);
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

/**
 * Like {@link fetchByIds}, for lookups whose matches can outnumber the ids
 * (e.g. every entry of 150 dogs): pages each chunk with `.range()` until a short
 * page, because PostgREST silently caps a response at max_rows (1000).
 */
async function fetchByIdsPaged<T>(
  what: string,
  ids: readonly string[],
  build: (ids: string[], from: number, to: number) => Page<T>
): Promise<T[]> {
  const rows: T[] = [];
  for (const part of chunk([...new Set(ids)], IN_CHUNK)) {
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await build(part, from, from + PAGE - 1);
      if (error) throw new SourceError(`Could not read ${what}.`);
      const batch = data ?? [];
      rows.push(...batch);
      if (batch.length < PAGE) break;
    }
  }
  return rows;
}

async function fetchByIds<T>(
  what: string,
  ids: readonly string[],
  build: (ids: string[]) => Page<T>
): Promise<T[]> {
  const rows: T[] = [];
  for (const part of chunk([...new Set(ids)], IN_CHUNK)) {
    const { data, error } = await build(part);
    if (error) throw new SourceError(`Could not read ${what}.`);
    rows.push(...(data ?? []));
  }
  return rows;
}

const personName = (p: Pick<PersonRow, 'first_name' | 'last_name'> | undefined) =>
  p ? `${p.first_name} ${p.last_name}`.trim() : 'unknown person';

function describePerson(p: PersonRow | undefined): string {
  if (!p) return 'owner unknown';
  const email = redactEmail(p.email);
  return email ? `${personName(p)} (${email})` : personName(p);
}

/** The columns every dog/person row shares in the output. */
const stamp = (r: { created_at: string | null; created_by: string | null }) =>
  `created ${r.created_at ?? 'unknown'}` + (r.created_by ? ` · createdBy=${r.created_by}` : '');

export async function diagnoseShowLooseEnds(
  input: DiagnoseShowLooseEndsInput,
  ctx: ToolContext
): Promise<DiagnosticResult> {
  const { config, supabase } = ctx;
  const { showId } = input;
  const cap = config.maxLimit;

  const show = await supabase.from('shows').select('id, name').eq('id', showId).maybeSingle();
  if (show.error) {
    return createDiagnosticResult(config.envLabel, 'source_unavailable', {
      limitations: ['Could not read the show record.'],
    });
  }
  if (!show.data) {
    return createDiagnosticResult(config.envLabel, 'not_found', {
      summary: { showId },
      limitations: [`No show found for id ${showId}.`],
    });
  }

  try {
    return await build(showId, show.data.name, ctx, cap);
  } catch (error) {
    if (error instanceof SourceError) {
      return createDiagnosticResult(config.envLabel, 'source_unavailable', {
        limitations: [error.message],
      });
    }
    throw error;
  }
}

async function build(
  showId: string,
  showName: string,
  ctx: ToolContext,
  cap: number
): Promise<DiagnosticResult> {
  const { config, supabase } = ctx;
  const limitations: string[] = [];
  const evidence: DiagnosticEvidence[] = [];
  const links: DiagnosticLink[] = [buildShowLink(config, showId)];
  const seenLinks = new Set<string>();
  const addLink = (link: DiagnosticLink) => {
    if (!seenLinks.has(link.url)) {
      seenLinks.add(link.url);
      links.push(link);
    }
  };
  /** Add up to `cap` rows for one category; note the overflow once. */
  const emit = <T>(rows: readonly T[], label: string, source: string, text: (row: T) => string) => {
    for (const row of rows.slice(0, cap)) evidence.push({ label, value: text(row), source });
    if (rows.length > cap) limitations.push(`${label}: showing ${cap} of ${rows.length} rows.`);
  };

  const entriesRead = await fetchPaged<LooseEntry>('entries', (from, to) =>
    supabase
      .from('entries')
      .select(ENTRY_SELECT)
      .eq('show_id', showId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to)
      .returns<LooseEntry[]>()
  );
  const entries = entriesRead.rows;
  const enrollmentsRead = await fetchPaged<EnrollmentRow>('enrollments', (from, to) =>
    supabase
      .from('enrollments')
      .select('id, confirmation_number, handler_id, payment_status, created_at')
      .eq('show_id', showId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to)
      .returns<EnrollmentRow[]>()
  );
  const dogsRead = await fetchPaged<DogRow>('dogs created from this show', (from, to) =>
    supabase
      .from('dogs')
      .select('id, call_name, owner_id, created_at, created_by')
      .eq('created_from_show_id', showId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to)
      .returns<DogRow[]>()
  );
  const peopleRead = await fetchPaged<PersonRow>('people created from this show', (from, to) =>
    supabase
      .from('people')
      .select('id, first_name, last_name, email, created_at, created_by, auth_user_id')
      .eq('created_from_show_id', showId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to)
      .returns<PersonRow[]>()
  );
  for (const [what, read] of [
    ['entries', entriesRead],
    ['enrollments', enrollmentsRead],
    ['attributed dogs', dogsRead],
    ['attributed people', peopleRead],
  ] as const) {
    if (read.truncated) limitations.push(`Only the first ${SCAN_CAP} ${what} were scanned.`);
  }

  // Who is "in" the show: dogs with a live entry, and the people tied to them.
  const entryDogIds = new Set(entries.flatMap(e => (e.dog_id ? [e.dog_id] : [])));
  const enteredDogs = await fetchByIds<{ id: string; owner_id: string | null }>(
    'owners of entered dogs',
    [...entryDogIds],
    ids =>
      supabase
        .from('dogs')
        .select('id, owner_id')
        .in('id', ids)
        .returns<{ id: string; owner_id: string | null }[]>()
  );
  const involvedPeople = new Set<string>();
  for (const e of entries) if (e.handler_id) involvedPeople.add(e.handler_id);
  for (const d of enteredDogs) if (d.owner_id) involvedPeople.add(d.owner_id);

  const enrollmentHandlers = new Set(enrollmentsRead.rows.map(e => e.handler_id));

  // (a) attributed. An enrollment handler with no entries is reported under (b), not here.
  const attributedDogs = dogsRead.rows.filter(d => !entryDogIds.has(d.id));
  const attributedPeople = peopleRead.rows.filter(p => !involvedPeople.has(p.id));

  // (b) enrollments <-> entries
  const enrollmentIdsWithEntries = new Set(
    entries.flatMap(e => (e.registration_id ? [e.registration_id] : []))
  );
  const emptyEnrollments = enrollmentsRead.rows.filter(e => !enrollmentIdsWithEntries.has(e.id));
  const orphanEntries = entries.filter(e => !e.registration_id);

  // (c) duplicates, (d) stuck
  const duplicateGroups = findDuplicateEntryGroups(entries);
  const stuck = entries.flatMap(e => {
    const reasons = stuckReasons(e);
    return reasons.length > 0 ? [{ entry: e, reasons }] : [];
  });

  // Heuristic (guess) section: only rows with NO recorded attribution at all.
  const windows = buildActivityWindows(entries.map(e => e.created_at));
  let guessDogs: DogRow[] = [];
  let guessPeople: PersonRow[] = [];
  if (windows.length > 0) {
    const lo = new Date(Math.min(...windows.map(w => w.startMs))).toISOString();
    const hi = new Date(Math.max(...windows.map(w => w.endMs))).toISOString();
    const candidateDogs = await fetchPaged<DogRow>('dogs in the activity window', (from, to) =>
      supabase
        .from('dogs')
        .select('id, call_name, owner_id, created_at, created_by')
        .is('created_from_show_id', null)
        .is('created_by', null)
        .is('deleted_at', null)
        .gte('created_at', lo)
        .lte('created_at', hi)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to)
        .returns<DogRow[]>()
    );
    const candidatePeople = await fetchPaged<PersonRow>(
      'people in the activity window',
      (from, to) =>
        supabase
          .from('people')
          .select('id, first_name, last_name, email, created_at, created_by, auth_user_id')
          .is('created_from_show_id', null)
          .is('created_by', null)
          .is('deleted_at', null)
          .gte('created_at', lo)
          .lte('created_at', hi)
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to)
          .returns<PersonRow[]>()
    );
    if (candidateDogs.truncated || candidatePeople.truncated) {
      limitations.push(`Heuristic scan stopped at ${SCAN_CAP} rows; the guess list is incomplete.`);
    }
    const windowDogs = candidateDogs.rows.filter(
      d => inAnyWindow(d.created_at, windows) && !entryDogIds.has(d.id)
    );
    // A dog entered in any other show is in use, not abandoned.
    const enteredElsewhere = new Set(
      (
        await fetchByIdsPaged<{ dog_id: string | null }>(
          'entries for heuristic dogs',
          windowDogs.map(d => d.id),
          (ids, from, to) =>
            supabase
              .from('entries')
              .select('dog_id')
              .in('dog_id', ids)
              .is('deleted_at', null)
              .order('id', { ascending: true })
              .range(from, to)
              .returns<{ dog_id: string | null }[]>()
        )
      ).flatMap(r => (r.dog_id ? [r.dog_id] : []))
    );
    guessDogs = windowDogs.filter(d => !enteredElsewhere.has(d.id));
    // A person with an account signed themselves up; the add-entry flow makes accountless rows.
    const windowPeople = candidatePeople.rows.filter(
      p =>
        inAnyWindow(p.created_at, windows) &&
        !involvedPeople.has(p.id) &&
        !enrollmentHandlers.has(p.id) &&
        !p.auth_user_id
    );
    // Someone who handles, or owns a dog entered, in ANY show is in use, not abandoned.
    const personIds = windowPeople.map(p => p.id);
    const handlers = await fetchByIdsPaged<{ handler_id: string | null }>(
      'entries for heuristic people',
      personIds,
      (ids, from, to) =>
        supabase
          .from('entries')
          .select('handler_id')
          .in('handler_id', ids)
          .is('deleted_at', null)
          .order('id', { ascending: true })
          .range(from, to)
          .returns<{ handler_id: string | null }[]>()
    );
    const ownedDogs = await fetchByIdsPaged<{ id: string; owner_id: string | null }>(
      'dogs of heuristic people',
      personIds,
      (ids, from, to) =>
        supabase
          .from('dogs')
          .select('id, owner_id')
          .in('owner_id', ids)
          .is('deleted_at', null)
          .order('id', { ascending: true })
          .range(from, to)
          .returns<{ id: string; owner_id: string | null }[]>()
    );
    const ownedDogEntries = await fetchByIdsPaged<{ dog_id: string | null }>(
      'entries for dogs of heuristic people',
      ownedDogs.map(d => d.id),
      (ids, from, to) =>
        supabase
          .from('entries')
          .select('dog_id')
          .in('dog_id', ids)
          .is('deleted_at', null)
          .order('id', { ascending: true })
          .range(from, to)
          .returns<{ dog_id: string | null }[]>()
    );
    const usedPeople = new Set(handlers.flatMap(r => (r.handler_id ? [r.handler_id] : [])));
    const ownerOfDog = new Map(ownedDogs.map(d => [d.id, d.owner_id]));
    for (const r of ownedDogEntries) {
      const owner = r.dog_id ? ownerOfDog.get(r.dog_id) : null;
      if (owner) usedPeople.add(owner);
    }
    guessPeople = windowPeople.filter(p => !usedPeople.has(p.id));
  }

  // Names for the rows that will be shown.
  const shownDogs = {
    entry: [
      ...orphanEntries.slice(0, cap),
      ...duplicateGroups.slice(0, cap).flat(),
      ...stuck.slice(0, cap).map(s => s.entry),
    ].flatMap(e => (e.dog_id ? [e.dog_id] : [])),
    owners: [...attributedDogs.slice(0, cap), ...guessDogs.slice(0, cap)].flatMap(d =>
      d.owner_id ? [d.owner_id] : []
    ),
  };
  const dogNames = new Map(
    (
      await fetchByIds<{ id: string; call_name: string }>('dog names', shownDogs.entry, ids =>
        supabase
          .from('dogs')
          .select('id, call_name')
          .in('id', ids)
          .returns<{ id: string; call_name: string }[]>()
      )
    ).map(d => [d.id, d.call_name])
  );
  const peopleById = new Map(
    (
      await fetchByIds<PersonRow>(
        'people names',
        [...shownDogs.owners, ...emptyEnrollments.slice(0, cap).map(e => e.handler_id)],
        ids =>
          supabase
            .from('people')
            .select('id, first_name, last_name, email, created_at, created_by, auth_user_id')
            .in('id', ids)
            .returns<PersonRow[]>()
      )
    ).map(p => [p.id, p])
  );
  const classIds = duplicateGroups
    .slice(0, cap)
    .flatMap(g => (g[0]?.class_id ? [g[0].class_id] : []));
  const classNames = new Map(
    (
      await fetchByIds<ClassRow>('class names', classIds, ids =>
        supabase
          .from('classes')
          .select('id, name, class_number')
          .in('id', ids)
          .returns<ClassRow[]>()
      )
    ).map(c => [c.id, `${c.class_number ? `${c.class_number} ` : ''}${c.name}`.trim()])
  );
  const dogLabel = (id: string | null) => (id ? (dogNames.get(id) ?? 'unnamed dog') : 'no dog');

  const dogText = (d: DogRow, note = '') => {
    addLink(buildDogLink(config, d.id, d.call_name));
    return `${d.call_name} · dogId=${d.id} · ${stamp(d)} · owner ${describePerson(
      d.owner_id ? peopleById.get(d.owner_id) : undefined
    )}${note}`;
  };
  const personText = (p: PersonRow, note = '') => {
    addLink(buildPersonLink(config, p.id, personName(p)));
    return `${personName(p)} · personId=${p.id} · ${stamp(p)} · ${redactEmail(p.email) ?? 'no email'}${note}`;
  };
  const GUESS_NOTE =
    ' · GUESS: no recorded creator or show; created inside an add-entry session and never entered';

  emit(
    attributedDogs,
    'Dog created from this show, no live entry in it',
    'dogs.created_from_show_id',
    d => dogText(d)
  );
  emit(
    attributedPeople,
    'Person created from this show, no live entry in it',
    'people.created_from_show_id',
    p => personText(p)
  );
  emit(emptyEnrollments, 'Enrollment with no entries', 'enrollments', e => {
    addLink(buildPersonLink(config, e.handler_id, personName(peopleById.get(e.handler_id))));
    return `confirmation ${e.confirmation_number} · enrollmentId=${e.id} · payment ${e.payment_status} · created ${e.created_at} · handler ${personName(peopleById.get(e.handler_id))} · handlerId=${e.handler_id}`;
  });
  emit(orphanEntries, 'Entry with no enrollment', 'entries.registration_id', e => {
    if (e.dog_id) addLink(buildDogLink(config, e.dog_id, dogLabel(e.dog_id)));
    return `${dogLabel(e.dog_id)} · entryId=${e.id} · status ${e.entry_status ?? 'none'} · created ${e.created_at ?? 'unknown'}`;
  });
  emit(duplicateGroups, 'Duplicate live entries (same dog and class)', 'entries', group => {
    const first = group[0]!;
    if (first.dog_id) addLink(buildDogLink(config, first.dog_id, dogLabel(first.dog_id)));
    return `${dogLabel(first.dog_id)} in ${first.class_id ? (classNames.get(first.class_id) ?? first.class_id) : 'no class'} · ${group
      .map(
        e => `entryId=${e.id} (${e.entry_status ?? 'none'}, created ${e.created_at ?? 'unknown'})`
      )
      .join(' · ')}`;
  });
  emit(stuck, 'Entry stuck or failed server-side', 'entries', ({ entry: e, reasons }) => {
    if (e.dog_id) addLink(buildDogLink(config, e.dog_id, dogLabel(e.dog_id)));
    return `${dogLabel(e.dog_id)} · entryId=${e.id} · ${reasons.join('; ')} · created ${e.created_at ?? 'unknown'}`;
  });
  emit(guessDogs, `${GUESS}: dog with no entry`, 'time-window heuristic', d =>
    dogText(d, GUESS_NOTE)
  );
  emit(guessPeople, `${GUESS}: person with no entry`, 'time-window heuristic', p =>
    personText(p, GUESS_NOTE)
  );

  addLink(buildEntryManagementLink(config, showId));
  limitations.push(
    `${GUESS}: rows with created_from_show_id and created_by both NULL (they predate attribution), created inside an add-entry session of this show (consecutive entries ≤ 2h apart, window padded 30 min), no live entry in this show or any other (for people: not a handler or dog owner on one), and for people no sign-in account. Window(s): ${describeWindows(windows)}. Treat every GUESS row as a lead to check, not a finding.`
  );
  if (!(attributedDogs.length + attributedPeople.length + guessDogs.length + guessPeople.length)) {
    limitations.push('No dogs or people were found added-and-never-entered for this show.');
  }

  return createDiagnosticResult(config.envLabel, 'found', {
    summary: {
      showId,
      showName,
      entriesScanned: entries.length,
      attributedDogsWithoutEntry: attributedDogs.length,
      attributedPeopleWithoutEntry: attributedPeople.length,
      enrollmentsWithoutEntries: emptyEnrollments.length,
      entriesWithoutEnrollment: orphanEntries.length,
      duplicateEntryGroups: duplicateGroups.length,
      stuckEntries: stuck.length,
      guessDogsWithoutEntry: guessDogs.length,
      guessPeopleWithoutEntry: guessPeople.length,
      guessSectionIsNotRecordedAttribution: true,
    },
    evidence,
    links,
    limitations,
  });
}

export function diagnoseShowLooseEndsTool(ctx: ToolContext): AdminToolDefinition {
  return {
    name: 'diagnose_show_loose_ends',
    description:
      'List a show’s operator loose ends: dogs and people added through its add-entry flow ' +
      'but never entered, enrollments without entries and entries without enrollments, ' +
      'duplicate entries, and stuck entries. Rows that predate attribution appear only in a ' +
      'separate section labeled GUESS. Read-only.',
    inputSchema: {
      type: 'object',
      properties: { showId: { type: 'string', description: 'Show UUID' } },
      required: ['showId'],
      additionalProperties: false,
    },
    parseInput: raw => diagnoseShowLooseEndsInput.parse(raw),
    handle: input => diagnoseShowLooseEnds(input as DiagnoseShowLooseEndsInput, ctx),
  };
}
