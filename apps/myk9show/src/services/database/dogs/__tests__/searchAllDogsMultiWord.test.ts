/**
 * MYK9-2026: the system-wide dog search (`searchAllDogs`) matches a typed
 * search word by word, the same rule the picker applies to dogs already on the
 * device (`matchesDogSearch`). Before this, the server matched every column
 * against the whole query as one run, so "rex lab" found Rex the Labrador on
 * the device but not one that only the server had.
 *
 * The fake below answers each PostgREST request by evaluating its filter text
 * against a few rows, so these tests check which dogs come back, not how the
 * filter string happens to be spelled.
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

/** Splits a PostgREST logic list on its top-level commas, honoring `\` escapes. */
function splitTopLevel(list: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (let i = 0; i < list.length; i += 1) {
    const ch = list[i];
    if (ch === '\\') {
      current += ch + (list[i + 1] ?? '');
      i += 1;
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
function matches(row: Row, expr: string): boolean {
  const logic = /^(and|or)\((.*)\)$/s.exec(expr);
  if (logic) {
    const children = splitTopLevel(logic[2] ?? '');
    return logic[1] === 'and'
      ? children.every(c => matches(row, c))
      : children.some(c => matches(row, c));
  }
  const ilike = /^(\w+)\.ilike\.%(.*)%$/s.exec(expr);
  if (ilike) {
    const needle = (ilike[2] ?? '').replace(/\\(.)/g, '$1').toLowerCase();
    return (row[ilike[1] ?? ''] ?? '').toLowerCase().includes(needle);
  }
  const inList = /^(\w+)\.in\.\((.*)\)$/s.exec(expr);
  if (inList) return (inList[2] ?? '').split(',').includes(row[inList[1] ?? ''] ?? '');
  throw new Error(`fake PostgREST cannot evaluate: ${expr}`);
}

interface FakeOptions {
  failTable?: string;
}

/** A query builder that records `.or(...)` and `.limit(...)` and filters TABLES. */
function fakeQuery(table: string, options: FakeOptions) {
  let orFilter: string | null = null;
  let cap = Infinity;
  const builder: Record<string, unknown> = {
    select: () => builder,
    is: () => builder,
    order: () => builder,
    abortSignal: () => builder,
    or: (filter: string) => {
      orFilter = filter;
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
      const rows = (TABLES[table] ?? []).filter(
        row => orFilter === null || matches(row, `or(${orFilter})`)
      );
      resolve({ data: rows.slice(0, cap), error: null });
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

  it('sends the dogs table one filter, so the words are combined in the database', async () => {
    await searchAllDogs('rex lab');
    const dogCalls = mockSupabase.from.mock.calls.filter(([table]) => table === 'dogs');
    expect(dogCalls).toHaveLength(1);
  });

  it('reports the result as truncated when a word lookup fills its page', async () => {
    // Two registrations say "Labrador"; with a page of two, the per-word
    // lookup gets one row, so the "lab" word list may be missing a dog.
    const { hitLimit } = await foundIds('rex lab', 2);
    expect(hitLimit).toBe(true);
  });

  it('propagates a failed word lookup instead of returning an empty list', async () => {
    useFakeDatabase({ failTable: 'people' });
    const { data, error, hitLimit } = await foundIds('rex lab');
    expect(error).not.toBeNull();
    expect(data).toEqual([]);
    expect(hitLimit).toBe(false);
  });
});
