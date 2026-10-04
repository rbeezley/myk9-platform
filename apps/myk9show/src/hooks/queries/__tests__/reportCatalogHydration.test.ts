/**
 * MYK9-1009. The AKC marked catalog prints each dog's date of birth and its
 * owner's mailing address inline. The replica carries neither (it maps the
 * owner as an id with null names), so this hop reads them from `dogs` / `people`.
 * It is ANCILLARY: a failed read must leave the entry untouched so the catalog
 * still prints, with those fields blank.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReportDbEntry } from '@/lib/reports/types';

const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { from: mocks.from } }));

import { hydrateCatalogDogProfiles } from '../reportCatalogHydration';

const DOG_ROW = {
  id: 'dog-1',
  date_of_birth: '2020-03-05',
  owner: {
    first_name: 'Jane',
    last_name: 'Mitchell',
    street_address: '12 Oak Lane',
    city: 'Austin',
    state: 'TX',
    zip_code: '78701',
  },
};

function dogsRead(rows: unknown[], error: unknown = null) {
  const select = vi.fn().mockReturnValue({
    in: vi.fn().mockResolvedValue({ data: error ? null : rows, error }),
  });
  mocks.from.mockReturnValue({ select });
  return select;
}

function dogsReadPerBatch(responses: Array<{ data: unknown[] | null; error: unknown }>) {
  let call = 0;
  const inFn = vi.fn().mockImplementation(() => {
    const response = responses[Math.min(call, responses.length - 1)]!;
    call += 1;
    return Promise.resolve(response);
  });
  mocks.from.mockReturnValue({ select: vi.fn().mockReturnValue({ in: inFn }) });
  return inFn;
}

function entry(overrides: Partial<Record<string, unknown>> = {}): ReportDbEntry {
  return {
    id: 'e1',
    dog_id: 'dog-1',
    class_id: 'c1',
    // What the replica produces: an owner id and null names, no birth date.
    dog: { id: 'dog-1', call_name: 'Buddy', owner: { id: 'person-1', first_name: null } },
    ...overrides,
  } as unknown as ReportDbEntry;
}

describe('hydrateCatalogDogProfiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads named dog and owner columns, never *', async () => {
    const select = dogsRead([DOG_ROW]);
    await hydrateCatalogDogProfiles([entry()]);

    expect(mocks.from).toHaveBeenCalledWith('dogs');
    const columns = select.mock.calls[0]![0] as string;
    expect(columns).not.toContain('*');
    for (const column of ['date_of_birth', 'street_address', 'city', 'state', 'zip_code']) {
      expect(columns).toContain(column);
    }
  });

  it('attaches the birth date and the owner name and address to the dog', async () => {
    dogsRead([DOG_ROW]);
    const [hydrated] = await hydrateCatalogDogProfiles([entry()]);

    expect(hydrated?.dog).toMatchObject({
      id: 'dog-1',
      call_name: 'Buddy',
      date_of_birth: '2020-03-05',
      owner: {
        id: 'person-1',
        first_name: 'Jane',
        last_name: 'Mitchell',
        street_address: '12 Oak Lane',
        city: 'Austin',
        state: 'TX',
        zip_code: '78701',
      },
    });
  });

  it('accepts the owner embed as a one-element array', async () => {
    dogsRead([{ ...DOG_ROW, owner: [DOG_ROW.owner] }]);
    const [hydrated] = await hydrateCatalogDogProfiles([entry()]);
    expect(hydrated?.dog?.owner?.street_address).toBe('12 Oak Lane');
  });

  it('returns the entries untouched when the read fails, so the catalog still prints', async () => {
    dogsRead([], { message: 'offline' });
    const input = [entry()];
    const hydrated = await hydrateCatalogDogProfiles(input);

    expect(hydrated).toEqual(input);
    expect(hydrated[0]?.dog?.date_of_birth).toBeUndefined();
    expect(hydrated[0]?.dog?.owner?.street_address).toBeUndefined();
  });

  it('returns the entries untouched when the request throws', async () => {
    mocks.from.mockImplementation(() => {
      throw new Error('network down');
    });
    const input = [entry()];
    await expect(hydrateCatalogDogProfiles(input)).resolves.toEqual(input);
  });

  it('hydrates the dogs of batches that answered and leaves the rest blank', async () => {
    const ids = Array.from({ length: 150 }, (_, index) => `dog-${index}`);
    const inFn = dogsReadPerBatch([
      {
        data: ids.slice(0, 100).map(id => ({ ...DOG_ROW, id })),
        error: null,
      },
      { data: null, error: { message: 'offline' } },
    ]);

    const hydrated = await hydrateCatalogDogProfiles(
      ids.map(id => entry({ id: `e-${id}`, dog_id: id, dog: { id } }))
    );

    expect(inFn, 'the fixture must really produce two batches').toHaveBeenCalledTimes(2);
    expect(hydrated[0]?.dog?.date_of_birth).toBe('2020-03-05');
    expect(hydrated[149]?.dog?.date_of_birth).toBeUndefined();
    expect(hydrated[149]?.dog?.owner).toBeUndefined();
  });

  it('does not query for entries without a dog', async () => {
    const select = dogsRead([DOG_ROW]);
    const hydrated = await hydrateCatalogDogProfiles([entry({ dog_id: null })]);
    expect(select).not.toHaveBeenCalled();
    expect(hydrated).toHaveLength(1);
  });
});
