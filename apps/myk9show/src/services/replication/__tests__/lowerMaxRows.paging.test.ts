/**
 * MYK9-2252: a pager stops on an EMPTY page, never a short one. The fake server
 * caps a response at 500 rows while the pagers ask for 1,000 (a hosted max_rows
 * below the page size), so every page comes back short and rows remain behind it.
 */
import { describe, it, expect, vi } from 'vitest';
import { createFakePostgrestTable } from '@/test/utils/fakePostgrestTable';

const server = vi.hoisted(() => ({
  table: null as unknown as { from: () => unknown; requests: string[] },
}));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { from: () => server.table.from() },
}));

import { fetchChangedDogs } from '../dogsServer';
import { fetchChangedRegistrations } from '../dogRegistrationsServer';
import { fetchVisibleRegistrationIds } from '../dogRegistrationsIdPass';

const T0 = Date.parse('2026-01-01T00:00:00.000Z');
const COUNT = 1300;

// Half share one timestamp, so a page boundary falls inside a run of equal updated_at.
const makeRows = () =>
  Array.from({ length: COUNT }, (_, i) => ({
    id: `row-${String(i).padStart(5, '0')}`,
    updated_at: i < 400 ? new Date(T0 + i * 1000).toISOString() : '2026-05-05T10:00:00.000Z',
  }));

describe('pagers stop on an empty page, not a short one (MYK9-2252)', () => {
  it('fetchChangedDogs reads every dog', async () => {
    server.table = createFakePostgrestTable(makeRows(), 500);

    const rows = await fetchChangedDogs(0);

    expect(new Set(rows.map(row => row.id)).size).toBe(COUNT);
    expect(server.table.requests.at(-1)).toMatch(/-> 0$/);
  });

  it('fetchChangedRegistrations reads every registration', async () => {
    server.table = createFakePostgrestTable(makeRows(), 500);

    const rows = await fetchChangedRegistrations(0);

    expect(new Set(rows.map(row => row.id)).size).toBe(COUNT);
    expect(server.table.requests.at(-1)).toMatch(/-> 0$/);
  });

  it('fetchVisibleRegistrationIds returns the whole id set', async () => {
    server.table = createFakePostgrestTable(makeRows(), 500);

    const ids = await fetchVisibleRegistrationIds();

    expect(ids?.size).toBe(COUNT);
    expect(server.table.requests.at(-1)).toMatch(/-> 0$/);
  });
});
