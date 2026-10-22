import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Date-coherence contract for supabase/seed-load-fixture.sql (MYK9-1309), the
 * load-fixture twin of seedDemoDateCoherenceContract.test.ts. The three load
 * shows must close entries before they start, keep today inside their entry
 * window, and hold every generated trial inside their own dates.
 *
 * The arithmetic is computed from the `CURRENT_DATE +/- N` offsets and the
 * generate_series bounds in the file, not grepped for.
 */

const repoRoot = resolve(__dirname, '../../../../..');
const stripSqlComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
const fixture = stripSqlComments(
  readFileSync(join(repoRoot, 'supabase/seed-load-fixture.sql'), 'utf8')
);

const OFFSET = String.raw`\(CURRENT_DATE(?:\s*([+-])\s*(\d+))?\)`;
const offsetOf = (sign: string | undefined, n: string | undefined): number =>
  n === undefined ? 0 : (sign === '-' ? -1 : 1) * Number(n);

/** Statement bodies for `INSERT INTO public.<table>`, each ending at a `;` that closes a line. */
const statements = (table: string): string[] =>
  [...fixture.matchAll(new RegExp(`INSERT INTO public\\.${table} \\(([\\s\\S]*?);\\n`, 'g'))].map(
    m => m[0]
  );

const showStatements = statements('shows');
const trialStatements = statements('trials');

const showDates = (() => {
  const m = new RegExp(
    `\\(${OFFSET}::timestamp AT TIME ZONE 'UTC'\\),\\s*\\(${OFFSET}::timestamp AT TIME ZONE 'UTC'\\),\\s*` +
      `\\(${OFFSET}::timestamp AT TIME ZONE 'UTC'\\),\\s*\\(${OFFSET}::timestamp AT TIME ZONE 'UTC'\\)`
  ).exec(showStatements[0] ?? '');
  return m
    ? {
        start: offsetOf(m[1], m[2]),
        end: offsetOf(m[3], m[4]),
        open: offsetOf(m[5], m[6]),
        close: offsetOf(m[7], m[8]),
      }
    : undefined;
})();

/** Every trial date the trials INSERT generates, as day offsets from today. */
const trialDates = (() => {
  const stmt = trialStatements[0] ?? '';
  const date = new RegExp(`\\(${OFFSET}\\s*\\+\\s*\\(t\\s*-\\s*1\\)\\),`).exec(stmt);
  const series = /generate_series\((\d+),\s*(\d+)\) AS load_trials\(t\)/.exec(stmt);
  if (!date || !series) return undefined;
  const base = offsetOf(date[1], date[2]);
  const dates: number[] = [];
  for (let t = Number(series[1]); t <= Number(series[2]); t++) dates.push(base + (t - 1));
  return dates;
})();

describe('seed-load-fixture date coherence (MYK9-1309)', () => {
  it('parses the one load-show INSERT and the one trial INSERT (guards the parser itself)', () => {
    expect(showStatements).toHaveLength(1);
    expect(trialStatements).toHaveLength(1);
    expect(showDates, 'load-show dates not parsed').toBeDefined();
    expect(trialDates, 'load-trial dates not parsed').toBeDefined();
    expect(trialDates!.length).toBeGreaterThan(0);
  });

  it('closes entries before the load shows start, after they open', () => {
    const s = showDates!;
    expect(s.open).toBeLessThan(s.close);
    expect(s.close).toBeLessThan(s.start);
    expect(s.start).toBeLessThanOrEqual(s.end);
  });

  it('keeps today inside the load shows entry window', () => {
    expect(showDates!.open).toBeLessThan(0);
    expect(showDates!.close).toBeGreaterThan(0);
  });

  it('dates every generated trial inside its show', () => {
    for (const d of trialDates!) {
      expect(d).toBeGreaterThanOrEqual(showDates!.start);
      expect(d).toBeLessThanOrEqual(showDates!.end);
    }
  });
});
