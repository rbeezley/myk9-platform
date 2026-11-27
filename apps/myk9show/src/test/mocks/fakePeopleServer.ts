import { vi } from 'vitest';

/**
 * A stand-in for the `people` table behind PostgREST (MYK9-2253): it answers the
 * head count, and serves rows in id order, never more than `maxRows` per request,
 * honouring `gt('id', cursor)`. Rows are plain objects, so a test can give one a
 * null `updated_at` or share a timestamp across many.
 */
export interface FakePeopleServerOptions {
  /** The most rows one response carries (the real server's `max_rows`). */
  maxRows?: number;
  /** What the count query reports; defaults to the number of rows held. */
  count?: number;
  /** Every row request fails with this message. */
  pageError?: string;
}

export function createFakePeopleServer(
  rows: Array<Record<string, unknown> & { id: string }>,
  { maxRows = 500, count, pageError }: FakePeopleServerOptions = {}
) {
  const ordered = [...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const selects: string[] = [];
  const rowRequests = { current: 0 };

  const from = vi.fn((_table: string) => {
    let head = false;
    let after: string | null = null;
    const builder = {
      select: (columns: string, options?: { head?: boolean }) => {
        selects.push(columns);
        head = options?.head === true;
        return builder;
      },
      is: () => builder,
      gt: (column: string, value: string) => {
        if (column === 'id') after = value;
        return builder;
      },
      order: () => builder,
      abortSignal: () => builder,
      range: (_from: number, to: number) => {
        rowRequests.current += 1;
        if (pageError) return Promise.resolve({ data: null, error: { message: pageError } });
        const eligible = after === null ? ordered : ordered.filter(row => row.id > after!);
        return Promise.resolve({
          data: eligible.slice(0, Math.min(to + 1, maxRows)),
          error: null,
        });
      },
      then: (resolve: (value: unknown) => unknown) =>
        resolve(
          head
            ? { data: null, error: null, count: count ?? ordered.length }
            : { data: ordered, error: null }
        ),
    };
    return builder;
  });

  return { from, selects, rowRequests };
}

/** `count` people with ids sortable as text and names spread across the alphabet. */
export function makePeopleRows(total: number) {
  return Array.from({ length: total }, (_, index) => ({
    id: `person-${String(index).padStart(5, '0')}`,
    first_name: `First${String(index).padStart(4, '0')}`,
    // Last names climb with the index, so the last person is the last in the alphabet.
    last_name: `Last${String(index).padStart(4, '0')}`,
    email: `p${index}@example.com`,
    updated_at: '2026-11-01T00:00:00.000Z',
  }));
}
