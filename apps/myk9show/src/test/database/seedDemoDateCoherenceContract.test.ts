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
 * file, not grepped for. What the SQL does on a database is checked by the
 * seed's own postcondition at reseed time.
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

  it('section 0 deletes a stale fixture show only when nothing non-seed hangs off it', () => {
    const del = seed.match(
      /DELETE FROM public\.shows s\s+WHERE s\.id >= 'dededede-0000-0000-0731-000000000000'::uuid[\s\S]*?;/
    );
    expect(del, 'conditional fixture-show delete not found').not.toBeNull();
    const text = del![0];
    expect(text).toContain("s.id <  'dededede-0000-0000-0732-000000000000'::uuid");
    for (const table of [
      'entries',
      'enrollments',
      'stripe_orders',
      'show_payments',
      'refund_requests',
      'trial_packet_snapshots',
    ]) {
      expect(text, table).toMatch(
        new RegExp(
          `NOT EXISTS \\(SELECT 1 FROM public\\.${table} \\w+ WHERE \\w+\\.show_id = s\\.id\\)`
        )
      );
    }
    expect(text).not.toContain('000000000014');
    // Runs right after the paid-stray guard call, which still sees every fixture show.
    const guard = seed.indexOf('SELECT public.seed_demo_assert_no_paid_strays();');
    expect(seed.indexOf(text)).toBeGreaterThan(guard);
    expect(seed.indexOf(text)).toBeGreaterThan(-1);
  });

  it('ends with a postcondition that checks close/start, trial range and duplicate names', () => {
    const idx = seed.indexOf('closes entries after it starts');
    expect(idx, 'postcondition not found').toBeGreaterThan(-1);
    const block = seed.slice(seed.lastIndexOf('DO $$', idx), seed.indexOf('END $$;', idx));
    expect(block).toMatch(/entry_close_date[^>]*\)::date > \(s\.start_date/);
    expect(block).toContain('has a trial dated outside its start/end range');
    expect(block).toMatch(/t\.date < .*start_date[\s\S]*t\.date > .*end_date/);
    expect(block).toContain('share the name');
    expect(block).toContain('RAISE WARNING');
    expect(block).toContain('seed_demo_show_day_fixture_today()');
    expect(block).toMatch(/b\.name = a\.name[\s\S]*b\.start_date = a\.start_date/);
    expect(block).toContain("LIKE 'dededede-0000-0000-0000-%'");
    expect(block).toContain("'dededede-0000-0000-0731-000000000000'::uuid");
  });
});
