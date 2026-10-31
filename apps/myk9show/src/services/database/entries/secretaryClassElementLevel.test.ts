import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabaseError } from '@/services/database/databaseError';

const mocks = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock('../supabaseClient', () => ({
  createDatabaseError,
  logQuery: vi.fn(),
  supabase: { from: mocks.from },
}));

import { toSecretaryEntry } from './secretaryReadReplication';
import { postgrestGetSecretaryEntriesForShow } from './secretaryPostgrest';
import { mapSecretaryEntryToEntryManagementEntry } from '@/hooks/useEntryManagementData';

const entryRow = {
  id: 'e1',
  dog_id: 'dog-1',
  class_id: 'class-1',
  show_id: 'show-1',
  entry_status: 'confirmed',
  entry_fee: 0,
  payment_status: 'pending',
};

describe('class element and level reach the entry class (MYK9-1592)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('offline replica: element and level come from the replicated class', () => {
    const relations = {
      dogsMap: new Map(),
      classesMap: new Map([
        [
          'class-1',
          { id: 'class-1', name: 'Interior Advanced', element: 'Interior', level: 'Advanced' },
        ],
      ]),
      armbandsByEntryId: new Map(),
      armbandsByDogId: new Map(),
      peopleMap: new Map(),
      enrollmentsMap: new Map(),
      trialsMap: new Map(),
      pullMetadataMap: new Map(),
    } as unknown as Parameters<typeof toSecretaryEntry>[1];

    const row = toSecretaryEntry(
      { id: 'e1', dogId: 'dog-1', classId: 'class-1', entryStatus: 'confirmed' } as never,
      relations
    );
    const [cls] = mapSecretaryEntryToEntryManagementEntry(row, null).classes;
    expect(cls).toMatchObject({ element: 'Interior', level: 'Advanced' });
  });

  it('online read: the class embed names element and level and the mapper keeps them', async () => {
    const selects: string[] = [];
    mocks.from.mockImplementation(() => {
      const query = {
        select: vi.fn((columns: string) => {
          selects.push(columns);
          return query;
        }),
        eq: vi.fn(() => query),
        in: vi.fn(() => query),
        is: vi.fn(() => query),
        not: vi.fn(() => query),
        or: vi.fn(() => query),
        order: vi.fn(() => query),
        limit: vi.fn(() => query),
        then: (resolve: (value: { data: unknown[] | null; error: unknown }) => unknown) =>
          Promise.resolve(
            resolve({
              data: [
                {
                  ...entryRow,
                  class: {
                    id: 'class-1',
                    name: 'Buried Master',
                    class_number: '9',
                    element: 'Buried',
                    level: 'Master',
                    max_entries: null,
                  },
                },
              ],
              error: null,
            })
          ),
      };
      return query;
    });

    const { data: rows } = await postgrestGetSecretaryEntriesForShow(
      'show-1',
      Date.now(),
      'select_secretary_entries'
    );
    const embed = selects.find(columns => columns.includes('class:class_id'));
    expect(embed).toMatch(/class:class_id \([^)]*\belement,/);
    expect(embed).toMatch(/class:class_id \([^)]*\blevel,/);
    const [cls] = mapSecretaryEntryToEntryManagementEntry(rows[0]!, null).classes;
    expect(cls).toMatchObject({ element: 'Buried', level: 'Master' });
  });
});
