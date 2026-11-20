/**
 * MYK9-2026: the system-wide dog search (`searchAllDogs`) matches a typed
 * search word by word, the same rule the picker applies to dogs already on the
 * device (`matchesDogSearch`). Before this, the server matched every column
 * against the whole query as one run, so "rex lab" found Rex the Labrador on
 * the device but not one that only the server had.
 *
 * The fake below answers the one dogs request the way PostgREST does: each
 * aliased embed is filtered by its own `.or(...)`, and `alias.not.is.null` in
 * the dogs filter asks whether that embed kept a row. So these tests check
 * which dogs come back, not how the filter string happens to be spelled. The
 * same query shape was run against a real local PostgREST on 2026-11-17.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { searchAllDogs } from '../reads';
import { mockSupabase } from '@/test/mocks/supabase';

type Row = Record<string, string | null>;

const TABLES: Record<string, Row[]> = {
  dogs: [
    { id: 'd-rex-lab', name: 'Rex', call_name: 'Rex', owner_id: 'p-mary' },
    { id: 'd-rex-poodle', name: 'Rexford', call_name: 'Rexy', owner_id: 'p-john' },
    { id: 'd-bella-lab', name: 'Bella', call_name: 'Bella', owner_id: 'p-ann' },
  ],
  dog_registrations: [
    {
      dog_id: 'd-rex-lab',
      registration_number: 'SN123',
      registered_name: 'Hilltop Rex',
      breed: 'Labrador Retriever',
    },
    {
      dog_id: 'd-rex-poodle',
      registration_number: 'PR456',
      registered_name: 'Rexford Royale',
      breed: 'Poodle',
    },
    {
      dog_id: 'd-bella-lab',
      registration_number: 'SN789',
      registered_name: 'Bella Blue',
      breed: 'Labrador Retriever',
    },
  ],
  people: [
    { id: 'p-mary', first_name: 'Mary', last_name: 'Smith' },
    { id: 'p-john', first_name: 'John', last_name: 'Doe' },
    { id: 'p-ann', first_name: 'Ann', last_name: 'Lee' },
  ],
};

/** Splits a PostgREST logic list on its top-level commas, outside double-quoted values. */
function splitTopLevel(list: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quoted = false;
  let current = '';
  for (let i = 0; i < list.length; i += 1) {
    const ch = list[i];
    if (ch === '\\') {
      current += ch + (list[i + 1] ?? '');
      i += 1;
      continue;
    }
    if (ch === '"') quoted = !quoted;
    if (quoted) {
      current += ch;
      continue;
    }
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  if (current) parts.push(current);
  return parts;
}

/** Evaluates the subset of the PostgREST filter grammar `searchAllDogs` writes. */
function matches(row: Row, expr: string, embeds: Record<string, boolean> = {}): boolean {
  const logic = /^(and|or)\((.*)\)$/s.exec(expr);
  if (logic) {
    const children = splitTopLevel(logic[2] ?? '');
    return logic[1] === 'and'
      ? children.every(c => matches(row, c, embeds))
      : children.some(c => matches(row, c, embeds));
  }
  const ilike = /^(\w+)\.ilike\."%(.*)%"$/s.exec(expr);
  if (ilike) {
    // PostgREST unescapes `\"` and `\\` inside the quotes; LIKE then unescapes `\x`.
    const unquoted = (ilike[2] ?? '').replace(/\\(["\\])/g, '$1');
    const needle = unquoted.replace(/\\(.)/g, '$1').toLowerCase();
    return (row[ilike[1] ?? ''] ?? '').toLowerCase().includes(needle);
  }
  const embedKept = /^(\w+)\.not\.is\.null$/.exec(expr);
  if (embedKept) return embeds[embedKept[1] ?? ''] === true;
  throw new Error(`fake PostgREST cannot evaluate: ${expr}`);
}

interface FakeOptions {
  failTable?: string;
  dogs?: Row[];
  registrations?: Row[];
}

/** Which table each search embed alias reads, from the select text. */
function embedTables(select: string): Record<string, string> {
  const tables: Record<string, string> = {};
  for (const m of select.matchAll(/(search_\d+_\w+):(\w+)/g)) tables[m[1] ?? ''] = m[2] ?? '';
  return tables;
}

/** A dogs query builder: filters each aliased embed, then the dogs, then applies the limit. */
function fakeQuery(table: string, options: FakeOptions) {
  let select = '';
  let dogFilter: string | null = null;
  const embedFilters: Record<string, string> = {};
  let cap = Infinity;
  const builder: Record<string, unknown> = {
    select: (text: string) => {
      select = text;
      return builder;
    },
    is: () => builder,
    order: () => builder,
    abortSignal: () => builder,
    or: (filter: string, opts?: { referencedTable?: string }) => {
      if (opts?.referencedTable) embedFilters[opts.referencedTable] = filter;
      else dogFilter = filter;
      return builder;
    },
    limit: (n: number) => {
      cap = n;
      return builder;
    },
    then: (resolve: (value: unknown) => void) => {
      if (options.failTable === table) {
        resolve({ data: null, error: { message: 'PostgREST unavailable', code: '503' } });
        return;
      }
      const tables = embedTables(select);
      const registrations = options.registrations ?? TABLES.dog_registrations ?? [];
      const rows = (options.dogs ?? TABLES[table] ?? []).filter(dog => {
        const kept: Record<string, boolean> = {};
        for (const [alias, filter] of Object.entries(embedFilters)) {
          kept[alias] =
            tables[alias] === 'dog_registrations'
              ? registrations.some(r => r.dog_id === dog.id && matches(r, `or(${filter})`))
              : (TABLES.people ?? []).some(
                  p => p.id === dog.owner_id && matches(p, `or(${filter})`)
                );
        }
        return dogFilter === null || matches(dog, `or(${dogFilter})`, kept);
      });
      const withEmbeds = rows.map(dog => ({
        ...dog,
        ...Object.fromEntries(Object.keys(tables).map(alias => [alias, null])),
      }));
      resolve({ data: withEmbeds.slice(0, cap), error: null });
    },
  };
  return builder;
}

function useFakeDatabase(options: FakeOptions = {}) {
  mockSupabase.from.mockImplementation((table: string) => fakeQuery(table, options));
}

async function foundIds(query: string, limit?: number) {
  const result = await searchAllDogs(query, limit);
  return { ...result, ids: result.data.map(d => d.id).sort() };
}

describe('searchAllDogs: a multi-word search matches word by word (MYK9-2026)', () => {
  beforeEach(() => {
    useFakeDatabase();
  });

  it('finds a dog by its call name plus its breed ("rex lab")', async () => {
    const { ids, error } = await foundIds('rex lab');
    expect(error).toBeNull();
    expect(ids).toEqual(['d-rex-lab']);
  });

  it('finds a dog by its owner name typed last name first ("Smith Mary")', async () => {
    const { ids } = await foundIds('Smith Mary');
    expect(ids).toEqual(['d-rex-lab']);
  });

  it('finds a dog by its owner name plus its call name ("mary rex")', async () => {
    const { ids } = await foundIds('mary rex');
    expect(ids).toEqual(['d-rex-lab']);
  });

  it('finds a dog by a registered-name word plus a registration-number fragment', async () => {
    const { ids } = await foundIds('hilltop sn1');
    expect(ids).toEqual(['d-rex-lab']);
  });

  it('ignores letter case and repeated spaces', async () => {
    const { ids } = await foundIds('  REX   Labrador ');
    expect(ids).toEqual(['d-rex-lab']);
  });

  it('still finds every dog matching a single word', async () => {
    const { ids } = await foundIds('rex');
    expect(ids).toEqual(['d-rex-lab', 'd-rex-poodle']);
  });

  it('still finds an owner by full name typed first name first', async () => {
    const { ids } = await foundIds('Mary Smith');
    expect(ids).toEqual(['d-rex-lab']);
  });

  it('finds nothing when one word matches no field of the dog', async () => {
    const { ids, error } = await foundIds('rex beagle');
    expect(error).toBeNull();
    expect(ids).toEqual([]);
  });

  it('sends one request, so the words are combined in the database before the limit', async () => {
    await searchAllDogs('rex lab');
    expect(mockSupabase.from.mock.calls).toEqual([['dogs']]);
  });

  it('finds the one dog matching every word when a common word matches many more', async () => {
    // Codex review of #4099: sixty Labradors sort before Rex. Per-word id
    // lookups capped at a page missed him; the embeds match before the limit.
    const labs = Array.from({ length: 60 }, (_, i) => ({
      id: `d-lab-${i}`,
      name: `Alpha ${i}`,
      call_name: `Buddy${i}`,
      owner_id: 'p-ann',
    }));
    const rex = { id: 'd-rex', name: 'Zzz Thunder', call_name: 'Rex', owner_id: 'p-mary' };
    useFakeDatabase({
      dogs: [...labs, rex],
      registrations: [...labs, rex].map(dog => ({
        dog_id: dog.id,
        registration_number: `SN-${dog.id}`,
        registered_name: dog.name,
        breed: 'Labrador Retriever',
      })),
    });
    const { ids, hitLimit } = await foundIds('rex lab', 10);
    expect(ids).toEqual(['d-rex']);
    expect(hitLimit).toBe(false);
  });

  it('applies a fourth word and an initial before the limit ("german shepherd dog rex", "rex g")', async () => {
    // Codex review of #4099, round 2: only three words reached the server, so
    // sixty German Shepherds filled the page and Rex, named by the fourth word,
    // never came back.
    const shepherds = Array.from({ length: 60 }, (_, i) => ({
      id: `d-gsd-${i}`,
      name: `Alpha ${i}`,
      call_name: `Buddy${i}`,
      owner_id: 'p-ann',
    }));
    const rex = { id: 'd-rex', name: 'Zzz Thunder', call_name: 'Rex', owner_id: 'p-mary' };
    useFakeDatabase({
      dogs: [...shepherds, rex],
      registrations: [...shepherds, rex].map(dog => ({
        dog_id: dog.id,
        registration_number: `SN-${dog.id}`,
        registered_name: dog.name,
        breed: 'German Shepherd Dog',
      })),
    });
    expect((await foundIds('german shepherd dog rex', 10)).ids).toEqual(['d-rex']);
    expect((await foundIds('buddy7 g z', 10)).ids).toEqual([]);
    expect((await foundIds('rex g', 10)).ids).toEqual(['d-rex']);
  });

  it('reports the result as truncated only when the page of dogs is full', async () => {
    const { ids, hitLimit } = await foundIds('lab', 1);
    expect(ids).toHaveLength(1);
    expect(hitLimit).toBe(true);
  });

  it('returns the usual dog shape, without the search embeds', async () => {
    const { data } = await searchAllDogs('rex lab');
    expect(Object.keys(data[0] ?? {}).filter(key => key.startsWith('search_'))).toEqual([]);
  });

  it.each([
    ['Smith, Mary', 'Smith Mary'],
    ['Smith,Mary', 'Smith Mary'],
    ['Rex (Lab)', 'Rex Lab'],
    ['(Smith)', 'Smith'],
    ['Smith,', 'Smith'],
  ])(
    'finds the same dogs for "%s" as for "%s" (MYK9-2148: commas and parentheses separate words)',
    async (punctuated, bare) => {
      const { ids, error } = await foundIds(punctuated);
      expect(error).toBeNull();
      expect(ids).toEqual((await foundIds(bare)).ids);
      expect(ids).not.toEqual([]);
    }
  );

  it('propagates a failed search instead of returning an empty list', async () => {
    useFakeDatabase({ failTable: 'dogs' });
    const { data, error, hitLimit } = await foundIds('rex lab');
    expect(error).not.toBeNull();
    expect(data).toEqual([]);
    expect(hitLimit).toBe(false);
  });
});
