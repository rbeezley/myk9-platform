import { describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { escapeLikeTerm, ilikeContains } from '../sanitizePostgRESTFilter';
import {
  dogSearchFilter,
  ownerNameFilter,
  registrationFilter,
  searchEmbedSelect,
  searchTermEmbeds,
  searchWords,
} from '@/services/database/dogs/searchAllDogsFilter';

describe('ilikeContains (MYK9-2148)', () => {
  it.each([
    ['plain', '"%plain%"'],
    ['Smith, Mary', '"%Smith, Mary%"'],
    ['Rex (CH)', '"%Rex (CH)%"'],
    ['Rex, Jr (CH)', '"%Rex, Jr (CH)%"'],
    ['Rex Jr.', '"%Rex Jr.%"'],
    ['say "hi"', '"%say \\"hi\\"%"'],
    ['back\\slash', '"%back\\\\\\\\slash%"'],
    ['100%', '"%100\\\\%%"'],
    ['a*b', '"%a_b%"'],
    ['a_b', '"%a\\\\_b%"'],
    ['a\\"b', '"%a\\\\\\\\\\"b%"'],
  ])('wraps %j as %s', (input, expected) => {
    expect(ilikeContains(input)).toBe(expected);
  });

  it('never backslash-escapes a comma or parenthesis', () => {
    expect(ilikeContains('a,b(c)')).not.toContain('\\');
  });

  it('escapeLikeTerm leaves syntax characters alone and escapes LIKE wildcards', () => {
    expect(escapeLikeTerm('Smith, Mary (Jr).')).toBe('Smith, Mary (Jr).');
    expect(escapeLikeTerm('50%_*\\')).toBe('50\\%\\__\\\\');
    expect(escapeLikeTerm('')).toBe('');
  });
});

describe('searchAllDogs filter text (MYK9-2148)', () => {
  it('quotes a comma-and-parenthesis term in every clause', () => {
    const [whole] = searchTermEmbeds(['Smith, Jo (Jr)']);
    expect(whole).toBeDefined();
    if (!whole) return;
    expect(dogSearchFilter(whole, [])).toContain('name.ilike."%Smith, Jo (Jr)%"');
    expect(registrationFilter('Smith, Jo (Jr)')).toBe(
      'registration_number.ilike."%Smith, Jo (Jr)%",registered_name.ilike."%Smith, Jo (Jr)%",breed.ilike."%Smith, Jo (Jr)%"'
    );
    expect(ownerNameFilter('Smith, Jo')).toBe(
      'first_name.ilike."%Smith, Jo%",last_name.ilike."%Smith, Jo%",and(first_name.ilike."%Smith,%",last_name.ilike."%Jo%")'
    );
  });
});

// Runs only against a throwaway local stack:
//   MYK9_LOCAL_POSTGREST_URL=http://127.0.0.1:54321 MYK9_LOCAL_SERVICE_KEY=<local service role key>
// Never point this at the shared project; it inserts and deletes rows.
const localUrl = process.env.MYK9_LOCAL_POSTGREST_URL;
const localKey = process.env.MYK9_LOCAL_SERVICE_KEY;

describe.skipIf(!localUrl || !localKey)('real PostgREST accepts the filters (MYK9-2148)', () => {
  const client = createClient(localUrl ?? 'http://127.0.0.1:54321', localKey ?? 'unset');
  const tag = `q2148${Date.now()}`;
  const dogNames = [
    `${tag} Rex, Jr (CH)`,
    `${tag} Rex Jr.`,
    `${tag} 100% Lab`,
    `${tag} say "hi" there`,
    `${tag} back\\slash`,
    `${tag} star*name`,
    `${tag} both\\"q`,
    `${tag} plain`,
  ];
  let ownerId = '';

  async function searchAll(term: string): Promise<string[]> {
    const embeds = searchTermEmbeds([term, ...searchWords(term)]);
    const [whole, ...words] = embeds;
    if (!whole) return [];
    let q = client
      .from('dogs')
      .select(`name, ${searchEmbedSelect(embeds)}`)
      .or(dogSearchFilter(whole, words));
    for (const e of embeds) {
      q = q
        .or(registrationFilter(e.term), { referencedTable: e.registrations })
        .or(ownerNameFilter(e.term), { referencedTable: e.owner });
    }
    const { data, error } = await q;
    expect(error).toBeNull();
    return ((data ?? []) as unknown as { name: string }[]).map(r => r.name).sort();
  }

  it('seeds', async () => {
    const owner = await client
      .from('people')
      .insert({ first_name: `${tag}Mary`, last_name: `${tag}Smith` })
      .select('id')
      .single();
    expect(owner.error).toBeNull();
    ownerId = owner.data?.id ?? '';
    const dogs = await client
      .from('dogs')
      .insert(dogNames.map(name => ({ name, call_name: 'x', breed: 'Mixed', owner_id: ownerId })));
    expect(dogs.error).toBeNull();
  });

  it.each([
    ['Rex, Jr (CH)', 0],
    ['Rex Jr.', 1],
    ['100%', 2],
    ['say "hi"', 3],
    ['back\\slash', 4],
    ['star*name', 5],
    ['both\\"q', 6],
    ['Rex, Jr', 0],
  ])('finds dog for %j', async (suffixTerm, index) => {
    const found = await searchAll(suffixTerm);
    expect(found).toContain(dogNames[index]);
  });

  it('a typed % is not a wildcard', async () => {
    const found = await searchAll(`${tag} Rex%Jr`);
    expect(found).toEqual([]);
  });

  it('matches an owner typed as "Last, First"', async () => {
    const { error } = await client
      .from('dogs')
      .select('name, o:people!dogs_owner_id_fkey(id)')
      .or(`name.ilike.${ilikeContains(`${tag}Smith, ${tag}Mary`)}`);
    expect(error).toBeNull();
  });

  it('cleans up', async () => {
    await client.from('dogs').delete().eq('owner_id', ownerId);
    await client.from('people').delete().eq('id', ownerId);
  });
});
