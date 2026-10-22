import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Date-coherence contract for supabase/seed-demo.sql (MYK9-1281). Every seeded
 * show must close entries before it starts and hold its trials inside its own
 * date range; the seed re-checks that at the end of a reseed, and section 0
 * retires stale show-day fixture shows so a name + date is never duplicated.
 *
 * The date arithmetic is computed from the `CURRENT_DATE +/- N` offsets in the
 * file, not grepped for. What the retire and assert functions do on a database
 * is checked by a behavioural SQL test (MYK9-1309), not here.
 */

const repoRoot = resolve(__dirname, '../../../../..');
const stripSqlComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
const seed = stripSqlComments(readFileSync(join(repoRoot, 'supabase/seed-demo.sql'), 'utf8'));

const OFFSET = String.raw`\(CURRENT_DATE(?:\s*([+-])\s*(\d+))?\)`;
const offsetOf = (sign: string | undefined, n: string | undefined): number =>
  n === undefined ? 0 : (sign === '-' ? -1 : 1) * Number(n);

interface ShowDates {
  id: string;
  start: number;
  end: number;
  open: number;
  close: number;
}

/** Statement bodies for `INSERT INTO public.<table>`, each ending at a `;` that closes a line. */
const statements = (table: string): string[] =>
  [...seed.matchAll(new RegExp(`INSERT INTO public\\.${table} \\(([\\s\\S]*?);\\n`, 'g'))].map(
    m => m[0]
  );

const showRows = (): ShowDates[] =>
  statements('shows').flatMap(stmt => {
    const rows: ShowDates[] = [];
    const rowRe = new RegExp(
      String.raw`'(dededede-[0-9a-f-]+)',\s*'[^']*',\s*'[A-Z]+',\s*'(?:[^']|'')*',\s*` +
        `\\(${OFFSET}::timestamp AT TIME ZONE 'UTC'\\),\\s*\\(${OFFSET}::timestamp AT TIME ZONE 'UTC'\\),\\s*` +
        `\\(${OFFSET}::timestamp AT TIME ZONE 'UTC'\\),\\s*\\(${OFFSET}::timestamp AT TIME ZONE 'UTC'\\)`,
      'g'
    );
    for (const m of stmt.matchAll(rowRe)) {
      rows.push({
        id: m[1],
        start: offsetOf(m[2], m[3]),
        end: offsetOf(m[4], m[5]),
        open: offsetOf(m[6], m[7]),
        close: offsetOf(m[8], m[9]),
      });
    }
    return rows;
  });

const trialRows = (): { id: string; showId: string; date: number }[] =>
  statements('trials').flatMap(stmt =>
    [
      ...stmt.matchAll(
        new RegExp(
          String.raw`\('(dededede-[0-9a-f-]+)',\s*'(dededede-[0-9a-f-]+)',\s*'[^']*',\s*${OFFSET}`,
          'g'
        )
      ),
    ].map(m => ({ id: m[1], showId: m[2], date: offsetOf(m[3], m[4]) }))
  );

describe('seed-demo date coherence (MYK9-1281)', () => {
  const shows = showRows();
  const trials = trialRows();

  it('parses every seeded demo show and trial (guards the parser itself)', () => {
    const showIds = shows.map(s => s.id);
    for (const n of ['010', '011', '012', '013']) {
      expect(showIds, `show ...${n} not parsed`).toContain(`dededede-0000-0000-0000-000000000${n}`);
    }
    const trialIds = trials.map(t => t.id);
    for (let n = 21; n <= 27; n++) {
      expect(trialIds, `trial ...0${n} not parsed`).toContain(
        `dededede-0000-0000-0000-0000000000${n}`
      );
    }
    expect(trials.length).toBeGreaterThanOrEqual(7);
    expect(trials.every(t => shows.some(s => s.id === t.showId))).toBe(true);
  });

  it.each(shows)('show $id closes entries before it starts, after they open', s => {
    expect(s.open).toBeLessThan(s.close);
    expect(s.close).toBeLessThan(s.start);
    expect(s.start).toBeLessThanOrEqual(s.end);
  });

  it('keeps today inside the entry window of the published demo shows', () => {
    for (const s of shows.filter(x => x.start > 0)) {
      expect(s.open).toBeLessThan(0);
      expect(s.close).toBeGreaterThan(0);
    }
  });

  it.each(trials)('trial $id is dated inside its show', t => {
    const show = shows.find(s => s.id === t.showId);
    expect(show, `show ${t.showId} not parsed`).toBeDefined();
    expect(t.date).toBeGreaterThanOrEqual(show!.start);
    expect(t.date).toBeLessThanOrEqual(show!.end);
  });

  // What the two MYK9-1281 behaviours DO is proven on a database by
  // supabase/tests/myk9_1309_seed_fixture_functions_test.sql (MYK9-1309). The
  // source text can only pin WHERE the seed calls them.
  const call = (fn: string): number => {
    const matches = [...seed.matchAll(new RegExp(`SELECT public\\.${fn}\\(\\);`, 'g'))];
    expect(matches, `${fn}() must be called exactly once`).toHaveLength(1);
    return matches[0].index!;
  };

  it('section 0 calls the retire function after the paid-stray guard', () => {
    const guard = call('seed_demo_assert_no_paid_strays');
    const retire = call('seed_demo_retire_stale_fixture_shows');
    expect(retire).toBeGreaterThan(guard);
    // And before section 19 mints today's fixture.
    expect(retire).toBeLessThan(
      seed.indexOf('SELECT public.seed_demo_restore_show_day_fixture();')
    );
  });

  it('ends by calling the date-coherence assert function', () => {
    const tail = seed.slice(call('seed_demo_assert_date_coherence'));
    expect(tail.replace(/\s+/g, ' ').trim()).toBe(
      'SELECT public.seed_demo_assert_date_coherence(); COMMIT;'
    );
  });
});
