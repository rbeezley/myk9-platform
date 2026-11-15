/**
 * MYK9-1931: the client quote and the server price are one rule. The pricing matrix lives
 * once, in supabase/tests/myk9_1931_class_fee_wins_test.sql between `-- BEGIN SHARED CASES`
 * and `-- END SHARED CASES`, where CI runs every row through `private.price_entry_fee`.
 * This test runs the same rows through `getShowEntryFee`, so a change to either side that
 * the other does not make fails here or there.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getShowEntryFee, type ShowFeeInfo } from '../utils';

const SQL_TEST = resolve(
  __dirname,
  '../../../../../../../../supabase/tests/myk9_1931_class_fee_wins_test.sql'
);

interface FeeCase {
  label: string;
  pre: number | null;
  dos: number | null;
  classFee: number | null;
  junior: number | null;
  dayOf: boolean;
  juniorOverride: boolean;
  expected: number;
}

function sqlNumber(token: string): number | null {
  if (token === 'NULL') return null;
  const value = Number(token);
  if (!Number.isFinite(value)) throw new Error(`not a number: ${token}`);
  return value;
}

function sqlBoolean(token: string): boolean {
  if (token !== 'true' && token !== 'false') throw new Error(`not a boolean: ${token}`);
  return token === 'true';
}

function readSharedCases(): FeeCase[] {
  const sql = readFileSync(SQL_TEST, 'utf8');
  const block = sql.split('-- BEGIN SHARED CASES')[1]?.split('-- END SHARED CASES')[0];
  if (!block) throw new Error('shared cases block not found');
  const rows = block.split('\n').filter(line => line.trim().startsWith("('"));
  return rows.map(line => {
    const match = /^\s*\('((?:[^']|'')*)',\s*(.*)\)[,;]\s*$/.exec(line);
    if (!match) throw new Error(`unparsed case row: ${line}`);
    const fields = match[2].split(',').map(field => field.trim());
    if (fields.length !== 7) throw new Error(`expected 7 values: ${line}`);
    return {
      label: match[1].replace(/''/g, "'"),
      pre: sqlNumber(fields[0]),
      dos: sqlNumber(fields[1]),
      classFee: sqlNumber(fields[2]),
      junior: sqlNumber(fields[3]),
      dayOf: sqlBoolean(fields[4]),
      juniorOverride: sqlBoolean(fields[5]),
      expected: sqlNumber(fields[6]) ?? Number.NaN,
    };
  });
}

/** The show as the wizard reads it: fee columns as strings, a NULL as blank or absent. */
function showFor(row: FeeCase): ShowFeeInfo {
  return {
    preEntryFee: row.pre === null ? '' : String(row.pre),
    dayOfShowFee: row.dos === null ? undefined : String(row.dos),
    juniorHandlerFee: row.junior === null ? undefined : String(row.junior),
    startDate: '2026-12-01',
  };
}

const cases = readSharedCases();

describe('getShowEntryFee agrees with private.price_entry_fee (MYK9-1931 shared cases)', () => {
  it('reads the whole matrix', () => {
    expect(cases.length).toBeGreaterThanOrEqual(20);
  });

  it.each(cases.map(row => [row.label, row] as const))('%s', (_label, row) => {
    expect(
      getShowEntryFee(showFor(row), row.classFee ?? undefined, row.dayOf, row.juniorOverride)
    ).toBe(row.expected);
  });
});
