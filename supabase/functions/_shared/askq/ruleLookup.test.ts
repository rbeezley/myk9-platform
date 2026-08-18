import { describe, expect, it } from 'vitest';

import { parseAndResolveDate } from './ruleLookup.ts';

interface RecordedQuery {
  table: string;
  selected: string;
  columns: string[];
}

function fakeSupabase(rowsByTable: Record<string, unknown[]>) {
  const queries: RecordedQuery[] = [];

  const from = (table: string) => {
    const record: RecordedQuery = { table, selected: '', columns: [] };
    queries.push(record);

    const rows = rowsByTable[table] ?? [];
    const result = { data: rows, error: null };
    const builder: Record<string, unknown> = {
      select(columns: string) {
        record.selected = columns;
        return builder;
      },
      eq(column: string) {
        record.columns.push(column);
        return builder;
      },
      then(onFulfilled: (value: typeof result) => unknown) {
        return Promise.resolve(result).then(onFulfilled);
      },
    };
    return builder;
  };

  return { client: { from } as never, queries };
}

function selectedColumns(select: string): string[] {
  return select
    .replace(/[a-z_]+!?[a-z]*\([^)]*\)/gi, '')
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);
}

const SHOW_ID = '00000000-0000-0000-0000-0000000000a1';

describe('AskQ day-of-week resolution reads trials.date', () => {
  it('selects `date`, not the `trial_date` alias, and resolves the matching day', async () => {
    // 2026-08-01 is a Saturday; 2026-08-02 a Sunday.
    const { client, queries } = fakeSupabase({
      trials: [
        { date: '2026-08-01', show_id: SHOW_ID },
        { date: '2026-08-02', show_id: SHOW_ID },
      ],
    });

    const resolved = await parseAndResolveDate('Sunday', client, '', SHOW_ID);

    const trialsQuery = queries.find(q => q.table === 'trials');
    expect(trialsQuery).toBeDefined();
    expect(selectedColumns(trialsQuery!.selected)).toContain('date');
    expect(trialsQuery!.selected).not.toContain('trial_date');
    expect(resolved).toBe('2026-08-02');
  });

  it('still short-circuits on an explicit ISO date without querying trials', async () => {
    const { client, queries } = fakeSupabase({ trials: [] });

    const resolved = await parseAndResolveDate('2026-08-01', client, '', SHOW_ID);

    expect(resolved).toBe('2026-08-01');
    expect(queries).toEqual([]);
  });
});
