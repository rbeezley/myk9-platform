/**
 * MYK9-1931: the one pricing matrix. It lives in
 * supabase/tests/myk9_1931_class_fee_wins_test.sql between `-- BEGIN SHARED CASES` and
 * `-- END SHARED CASES`, where CI runs every row through `private.price_entry_fee`. The
 * client quote (`getShowEntryFee`) and checkout (`authoritativeEntryFeeCents`) read the same
 * rows through this parser, so the three cannot drift apart unnoticed.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SQL_TEST = resolve(
  __dirname,
  '../../../../../supabase/tests/myk9_1931_class_fee_wins_test.sql'
);

export interface ClassFeeCase {
  label: string;
  /** shows.pre_entry_fee; null is no pre-entry fee. */
  pre: number | null;
  /** shows.day_of_show_fee; null or 0 is no day-of tier. */
  dos: number | null;
  /** classes.entry_fee; null or 0 is no fee of its own. */
  classFee: number | null;
  /** shows.junior_handler_fee; null is no junior tier. */
  junior: number | null;
  dayOf: boolean;
  juniorOverride: boolean;
  /** The fee the server charges, in dollars. */
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

export function readClassFeeSharedCases(): ClassFeeCase[] {
  const sql = readFileSync(SQL_TEST, 'utf8');
  const block = sql.split('-- BEGIN SHARED CASES')[1]?.split('-- END SHARED CASES')[0];
  if (!block) throw new Error('shared cases block not found');
  const rows = block.split('\n').filter(line => line.trim().startsWith("('"));
  return rows.map(line => {
    const match = /^\s*\('((?:[^']|'')*)',\s*(.*)\)[,;]\s*$/.exec(line);
    if (!match) throw new Error(`unparsed case row: ${line}`);
    const fields = (match[2] ?? '').split(',').map(field => field.trim());
    if (fields.length !== 7) throw new Error(`expected 7 values: ${line}`);
    const [pre, dos, classFee, junior, dayOf, juniorOverride, expected] = fields as [
      string,
      string,
      string,
      string,
      string,
      string,
      string,
    ];
    const expectedFee = sqlNumber(expected);
    if (expectedFee === null) throw new Error(`expected fee missing: ${line}`);
    return {
      label: (match[1] ?? '').replace(/''/g, "'"),
      pre: sqlNumber(pre),
      dos: sqlNumber(dos),
      classFee: sqlNumber(classFee),
      junior: sqlNumber(junior),
      dayOf: sqlBoolean(dayOf),
      juniorOverride: sqlBoolean(juniorOverride),
      expected: expectedFee,
    };
  });
}
