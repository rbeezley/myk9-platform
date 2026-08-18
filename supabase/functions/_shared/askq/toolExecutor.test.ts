import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseAndResolveDate } from './ruleLookup.ts';
import { executeTool } from './toolExecutor.ts';

const repositoryRoot = resolve(import.meta.dirname, '../../../..');
const migrationsDir = resolve(repositoryRoot, 'supabase/migrations');

/**
 * Output columns of `view_entry_with_results`, read from the LATEST migration
 * that defines it.
 *
 * Deriving this instead of hard-coding it is the point of the test. These tools
 * were ported from myK9Q and kept querying `armband_number` and `handler_name`
 * -- names that belong to `view_stats_summary`, not this view -- so PostgREST
 * answered every call with an unknown-column error and both entry tools were
 * dead. A hard-coded list would have been copied from the same wrong source.
 */
function viewEntryWithResultsColumns(): Set<string> {
  const defining = readdirSync(migrationsDir)
    .filter(name => name.endsWith('.sql'))
    .sort()
    .filter(name =>
      /CREATE\s+(OR\s+REPLACE\s+)?VIEW\s+(public\.)?view_entry_with_results\b/i.test(
        readFileSync(resolve(migrationsDir, name), 'utf8')
      )
    );

  expect(defining.length).toBeGreaterThan(0);

  const latest = readFileSync(resolve(migrationsDir, defining[defining.length - 1]), 'utf8');
  const start = latest.search(
    /CREATE\s+(OR\s+REPLACE\s+)?VIEW\s+(public\.)?view_entry_with_results\b/i
  );
  const body = latest.slice(start);
  const selectList = body.slice(body.search(/\bSELECT\b/i), body.search(/\bFROM\s+entries\b/i));

  const columns = new Set<string>();
  for (const line of selectList.split('\n')) {
    const aliased = line.match(/\bas\s+([a-z_][a-z0-9_]*)\s*,?\s*$/i);
    if (aliased) {
      columns.add(aliased[1].toLowerCase());
      continue;
    }
    const qualified = line.match(/^\s*[a-z]+\.([a-z_][a-z0-9_]*)\s*,?\s*$/i);
    if (qualified) {
      columns.add(qualified[1].toLowerCase());
    }
  }
  return columns;
}

interface RecordedQuery {
  table: string;
  selected: string;
  /** Every column name the query filtered, ordered, or embedded on. */
  columns: string[];
}

/**
 * Minimal stand-in for the PostgREST query builder. It records which columns
 * each tool touches so the assertions can compare them against the real view,
 * and it resolves to whatever rows the test supplies for that table.
 */
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
      ilike(column: string) {
        record.columns.push(column);
        return builder;
      },
      in(column: string) {
        record.columns.push(column);
        return builder;
      },
      lte(column: string) {
        record.columns.push(column);
        return builder;
      },
      not(column: string) {
        record.columns.push(column);
        return builder;
      },
      is(column: string) {
        record.columns.push(column);
        return builder;
      },
      order(column: string) {
        record.columns.push(column);
        return builder;
      },
      limit() {
        return builder;
      },
      single() {
        return Promise.resolve({ data: rows[0] ?? null, error: null });
      },
      then(onFulfilled: (value: typeof result) => unknown) {
        return Promise.resolve(result).then(onFulfilled);
      },
    };
    return builder;
  };

  return { client: { from } as never, queries };
}

/** Column names in a select string, ignoring embedded-resource clauses. */
function selectedColumns(select: string): string[] {
  return select
    .replace(/[a-z_]+!?[a-z]*\([^)]*\)/gi, '')
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);
}

const SHOW_ID = '00000000-0000-0000-0000-0000000000a1';
const userContext = { showId: SHOW_ID } as never;

describe('AskQ entry tools query columns that view_entry_with_results actually has', () => {
  it.each(['get_entry_results', 'search_entries'])(
    '%s selects and filters only real view columns',
    async toolName => {
      const columns = viewEntryWithResultsColumns();
      // Sanity-check the parser before trusting it as an oracle.
      expect(columns.has('armband')).toBe(true);
      expect(columns.has('handler')).toBe(true);
      expect(columns.has('dog_call_name')).toBe(true);
      expect(columns.has('armband_number')).toBe(false);
      expect(columns.has('handler_name')).toBe(false);

      const { client, queries } = fakeSupabase({ view_entry_with_results: [] });

      await executeTool(
        toolName,
        { armband_number: '42', handler_name: 'Ann', dog_name: 'Rex', top_n: 3 },
        client,
        '',
        undefined,
        undefined,
        userContext
      );

      const entryQuery = queries.find(q => q.table === 'view_entry_with_results');
      expect(entryQuery).toBeDefined();

      const referenced = [...selectedColumns(entryQuery!.selected), ...entryQuery!.columns];
      expect(referenced.length).toBeGreaterThan(0);

      const missing = referenced.filter(column => !columns.has(column));
      expect(missing).toEqual([]);
    }
  );

  it.each(['get_entry_results', 'search_entries'])(
    '%s maps its output from the real column names',
    async toolName => {
      const { client } = fakeSupabase({
        view_entry_with_results: [
          {
            armband: '42',
            dog_call_name: 'Rex',
            handler: 'Ann Handler',
            entry_status: 'confirmed',
            result_status: 'qualified',
            search_time_seconds: '31.5',
            total_faults: 0,
            final_placement: 1,
            is_scored: true,
            class_id: 'class-1',
          },
        ],
        classes: [{ id: 'class-1', element: 'Container', level: 'Novice' }],
      });

      const { result } = await executeTool(
        toolName,
        { dog_name: 'Rex' },
        client,
        '',
        undefined,
        undefined,
        userContext
      );

      // The OUTPUT shape is the EntryResult contract and does not change; only
      // the view columns it reads from were wrong.
      expect(result).toEqual([
        {
          armband_number: '42',
          call_name: 'Rex',
          handler: 'Ann Handler',
          entry_status: 'confirmed',
          result_status: 'qualified',
          time: 31.5,
          faults: 0,
          placement: 1,
          is_scored: true,
          element: 'Container',
          level: 'Novice',
        },
      ]);
    }
  );

  it('resolves classes through trials.date, the column trials actually has', async () => {
    const { client, queries } = fakeSupabase({
      classes: [{ id: 'class-1', element: 'Container', level: 'Novice' }],
      view_entry_with_results: [],
    });

    await executeTool(
      'get_entry_results',
      { element: 'Container' },
      client,
      '',
      undefined,
      undefined,
      userContext
    );

    const classQuery = queries.find(q => q.table === 'classes');
    expect(classQuery).toBeDefined();
    // `trials` stores the date as `date`; `trial_date` is the alias exposed by
    // view_stats_summary and view_myk9q_entries, not a column on the table.
    expect(classQuery!.selected).toContain('trials!inner(show_id, date)');
    expect(classQuery!.selected).not.toContain('trial_date');
    expect(classQuery!.columns).not.toContain('trials.trial_date');
  });

  it('keeps the service-role tenant guard on the entry query', async () => {
    const { client, queries } = fakeSupabase({ view_entry_with_results: [] });

    await executeTool(
      'search_entries',
      { dog_name: 'Rex' },
      client,
      '',
      undefined,
      undefined,
      userContext
    );

    const entryQuery = queries.find(q => q.table === 'view_entry_with_results');
    expect(entryQuery!.columns).toContain('show_id');
  });
});

describe('AskQ class and trial tools query current base-table columns', () => {
  it('builds class summaries from trials, classes, and entries', async () => {
    const { client, queries } = fakeSupabase({
      trials: [
        {
          id: 'trial-1',
          date: '2026-08-01',
          name: 'Saturday Trial',
          trial_number: '1',
          show_id: SHOW_ID,
          shows: { name: 'Summer Show' },
        },
      ],
      classes: [
        {
          id: 'class-1',
          trial_id: 'trial-1',
          element: 'Container',
          level: 'Novice',
          section: 'A',
          judge_name: 'Ann Judge',
          status: 'upcoming',
          start_time: '09:30:00',
        },
      ],
      entries: [
        {
          class_id: 'class-1',
          entry_status: 'confirmed',
          is_scored: true,
          check_in_status: 'completed',
          result_status: 'qualified',
        },
        {
          class_id: 'class-1',
          entry_status: 'confirmed',
          is_scored: true,
          check_in_status: 'checked-in',
          result_status: 'nq',
        },
        {
          class_id: 'class-1',
          entry_status: 'withdrawn',
          is_scored: false,
          check_in_status: 'no-status',
          result_status: 'withdrawn',
        },
      ],
    });

    const { result, error } = await executeTool(
      'get_class_summary',
      { trial_date: '2026-08-01', element: 'Container' },
      client,
      '',
      undefined,
      undefined,
      userContext
    );

    expect(error).toBeUndefined();
    expect(result).toEqual([
      {
        class_id: 'class-1',
        element: 'Container',
        level: 'Novice',
        section: 'A',
        judge_name: 'Ann Judge',
        class_status: 'upcoming',
        total_entries: 2,
        scored_entries: 2,
        checked_in_count: 2,
        qualified_count: 1,
        nq_count: 1,
        trial_date: '2026-08-01',
        trial_name: 'Saturday Trial',
        start_time: '09:30:00',
      },
    ]);

    expect(queries.map(query => query.table)).toEqual(['trials', 'classes', 'entries']);
    expect(queries.find(query => query.table === 'trials')!.columns).toContain('show_id');
    expect(queries.find(query => query.table === 'classes')!.columns).toEqual([
      'trial_id',
      'element',
      'start_time',
    ]);
    expect(queries.find(query => query.table === 'entries')!.columns).toContain('deleted_at');
    expect(queries.map(query => query.table)).not.toContain('view_class_summary');
  });

  it('builds trial overviews from trials and shows', async () => {
    const { client, queries } = fakeSupabase({
      trials: [
        {
          id: 'trial-1',
          date: '2026-08-01',
          name: 'Saturday Trial',
          trial_number: '1',
          show_id: SHOW_ID,
          shows: { name: 'Summer Show' },
        },
      ],
    });

    const { result, error } = await executeTool(
      'get_trial_overview',
      {},
      client,
      '',
      undefined,
      undefined,
      userContext
    );

    expect(error).toBeUndefined();
    expect(result).toEqual([
      {
        trial_id: 'trial-1',
        trial_number: '1',
        trial_date: '2026-08-01',
        trial_name: 'Saturday Trial',
        show_name: 'Summer Show',
      },
    ]);

    const trialQuery = queries.find(query => query.table === 'trials');
    expect(trialQuery).toBeDefined();
    expect(selectedColumns(trialQuery!.selected)).toContain('date');
    expect(selectedColumns(trialQuery!.selected)).toContain('trial_number');
    expect(selectedColumns(trialQuery!.selected)).not.toContain('trial_date');
    expect(selectedColumns(trialQuery!.selected)).not.toContain('competition_type');
    expect(queries.map(query => query.table)).not.toContain('view_trial_summary_normalized');
  });
});

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
    // `trial_date` is a view alias; the trials TABLE stores it as `date`.
    // Selecting the alias made PostgREST reject the request, so every
    // day-of-week question silently resolved to null.
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
