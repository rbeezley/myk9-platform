import { HttpError } from '../_shared/http/responses.ts';
import {
  ENTRY_PERSON_FIELDS,
  entrySource,
  scopeEntriesToPerson,
  type EntryPeopleRow,
  type EntryRecipientSource,
  type TargetType,
} from './targeting.ts';
import type { TargetedMessageSupabaseClient } from './targeted-message-handler.ts';

// Rows requested per page. PostgREST silently caps every response at max_rows
// (supabase/config.toml: 1000), so one unpaged read dropped every entry past it
// from the audience (MYK9-1692). Paging stops only on an EMPTY page, never a short
// one, so a server cap below this size still reads every row.
const ENTRY_PAGE_SIZE = 1000;

// Ids interpolated into a PostgREST filter string must be plain id characters.
const SAFE_ID = /^[A-Za-z0-9_-]+$/;

const ENTRY_AUDIENCE_SELECT = `id, armband, dog:dogs(owner:people!owner_id(${ENTRY_PERSON_FIELDS}), co_owner:people!co_owner_id(${ENTRY_PERSON_FIELDS})), handler:people!handler_id(${ENTRY_PERSON_FIELDS})`;

type EntryPageRow = EntryPeopleRow & { id?: unknown };

// A person is on an entry as the handler or as their dog's owner or co-owner.
async function personEntryFilter(
  supabase: TargetedMessageSupabaseClient,
  personId: string
): Promise<string> {
  const { data, error } = await supabase
    .from('dogs')
    .select('id')
    .or(`owner_id.eq.${personId},co_owner_id.eq.${personId}`);
  if (error) throw new HttpError(500, 'Failed to resolve message recipients');
  const dogIds = ((data ?? []) as Array<{ id: string }>)
    .map(dog => dog.id)
    .filter(id => SAFE_ID.test(id));
  return [
    `handler_id.eq.${personId}`,
    ...(dogIds.length ? [`dog_id.in.(${dogIds.join(',')})`] : []),
  ].join(',');
}

// Every live entry the target names, read in id order with a keyset cursor. A failed
// page throws, so the caller writes and sends nothing rather than a partial audience.
export async function fetchEntriesForTarget(
  supabase: TargetedMessageSupabaseClient,
  showId: string,
  targetType: TargetType,
  classId: string | undefined,
  personId: string | undefined
): Promise<EntryRecipientSource[]> {
  let personFilter: string | null = null;
  if (targetType === 'class') {
    if (!classId) throw new HttpError(400, 'Missing required field: class_id');
  } else if (targetType === 'person') {
    if (!personId || !SAFE_ID.test(personId)) {
      throw new HttpError(400, 'Missing or invalid field: person_id');
    }
    // Filtered in the database, not after the fetch, so the pages hold only this
    // person's entries.
    personFilter = await personEntryFilter(supabase, personId);
  }

  const rows: EntryPageRow[] = [];
  let cursor: string | null = null;
  for (;;) {
    let query = supabase
      .from('entries')
      .select(ENTRY_AUDIENCE_SELECT)
      .eq('show_id', showId)
      .is('deleted_at', null);
    if (targetType === 'class') query = query.eq('class_id', classId);
    else if (personFilter) query = query.or(personFilter);
    else if (targetType === 'checked_in') {
      query = query.in('check_in_status', ['checked-in', 'at-gate', 'come-to-gate', 'in-ring']);
    }
    if (cursor !== null) query = query.gt('id', cursor);

    const { data, error } = await query.order('id', { ascending: true }).limit(ENTRY_PAGE_SIZE);
    if (error || !Array.isArray(data)) {
      throw new HttpError(500, 'Failed to resolve message recipients');
    }
    if (data.length === 0) break;

    const page = data as EntryPageRow[];
    const lastId = page[page.length - 1].id;
    // A cursor that does not move would page forever; refuse rather than guess.
    if (typeof lastId !== 'string' || (cursor !== null && lastId <= cursor)) {
      throw new HttpError(500, 'Failed to resolve message recipients');
    }
    rows.push(...page);
    cursor = lastId;
  }

  return targetType === 'person' && personId
    ? scopeEntriesToPerson(rows, personId)
    : rows.map(entrySource);
}
