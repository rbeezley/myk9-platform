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

  it('section 0 retires a stale fixture show only when nothing of a person hangs off it', () => {
    const start = seed.indexOf("s.id >= 'dededede-0000-0000-0731-000000000000'::uuid");
    expect(start, 'fixture-show loop not found').toBeGreaterThan(-1);
    const doStart = seed.lastIndexOf('DO $$', start);
    const block = seed.slice(doStart, seed.indexOf('END $$;', start));
    expect(block).toContain("s.id <  'dededede-0000-0000-0732-000000000000'::uuid");

    // The skip condition is ONE OR-joined disjunction of EXISTS terms, one per
    // protected table, each correlated to the loop's show: no NOT, no literal TRUE.
    const cond = /LOOP\s+SELECT\s+([\s\S]*?)\s+INTO v_hangs;/.exec(block)?.[1];
    expect(cond, 'skip condition not found').toBeDefined();
    expect(cond).not.toMatch(/\bNOT\b/i);
    expect(cond).not.toMatch(/\b(TRUE|FALSE|AND)\b/i);
    expect(cond).not.toMatch(/\d\s*=\s*\d/);
    // The flag is set by that SELECT and nowhere else.
    expect(block.match(/v_hangs\s*:=|INTO\s+v_hangs/gi)).toHaveLength(1);
    const terms = cond!.split(/\n\s*OR\s+(?=EXISTS\b)/);
    const tables: string[] = [];
    for (const term of terms) {
      const m = /^EXISTS \(SELECT 1 FROM public\.(\w+) \w+\s+WHERE[\s\S]*\)$/.exec(term.trim());
      expect(m, `skip term is not a plain EXISTS(...): ${term}`).not.toBeNull();
      // The paren EXISTS opens closes at the term's last character: nothing rides after it.
      const body = term.trim();
      let depth = 0;
      let closedAt = -1;
      for (let i = body.indexOf('('); i < body.length; i++) {
        if (body[i] === '(') depth++;
        if (body[i] === ')' && --depth === 0) {
          closedAt = i;
          break;
        }
      }
      expect(closedAt, `trailing text after EXISTS(...): ${term}`).toBe(body.length - 1);
      expect(term, `${m![1]} term is not correlated to the loop show`).toContain('v_show.id');
      tables.push(m![1]);
    }
    expect([...tables].sort()).toEqual(
      [
        'entries',
        'enrollments',
        'waitlist_entries',
        'entry_cart_items',
        'stripe_orders',
        'show_payments',
        'show_payouts',
        'entry_payment_links',
        'show_money_locks',
        'refund_requests',
        'trial_packet_snapshots',
      ].sort()
    );
    // Entries and cart items are matched through the show's trials and classes too.
    expect(terms.find(t => t.includes('public.entries'))).toMatch(
      /e\.trial_id IN[\s\S]*e\.class_id IN/
    );
    expect(terms.find(t => t.includes('public.entry_cart_items'))).toMatch(/eci\.class_id IN/);

    // The one DELETE is keyed on the loop show alone, inside IF NOT v_hangs and
    // its own sub-block that keeps the show and warns on an unlisted FK.
    expect(block.match(/DELETE\s+FROM/gi)).toHaveLength(1);
    // And no other statement in the file deletes a fixture-range show.
    const fixtureShowDeletes = [...seed.matchAll(/DELETE\s+FROM\s+public\.shows\b[^;]*;/gi)].filter(
      m => m[0].includes('0731') || /v_show\.id/.test(m[0])
    );
    expect(fixtureShowDeletes).toHaveLength(1);
    expect(block).toMatch(/DELETE FROM public\.shows WHERE id = v_show\.id;/);
    const guard = block.indexOf('IF NOT v_hangs THEN');
    const sub = block.indexOf('BEGIN', guard);
    const del = block.indexOf('DELETE FROM public.shows', sub);
    const exc = block.indexOf('EXCEPTION WHEN foreign_key_violation OR restrict_violation', del);
    expect(guard).toBeGreaterThan(-1);
    expect(sub).toBeGreaterThan(guard);
    expect(del).toBeGreaterThan(sub);
    expect(exc).toBeGreaterThan(del);
    expect(block.slice(exc)).toMatch(/THEN\s+RAISE WARNING 'seed-demo: kept fixture show/);
    expect(block).not.toContain('000000000014');
    // Runs right after the paid-stray guard call, which still sees every fixture show.
    expect(doStart).toBeGreaterThan(
      seed.indexOf('SELECT public.seed_demo_assert_no_paid_strays();')
    );
  });

  it('ends with a postcondition that checks close/start, trial range and duplicate names', () => {
    const idx = seed.indexOf('closes entries after it starts');
    expect(idx, 'postcondition not found').toBeGreaterThan(-1);
    const block = seed.slice(seed.lastIndexOf('DO $$', idx), seed.indexOf('END $$;', idx));
    expect(block).toMatch(/entry_close_date[^>]*\)::date > \(s\.start_date/);
    expect(block).toContain('has a trial dated outside its start/end range');
    // The exact pair, with nothing between or after the two comparisons.
    expect(block).toMatch(
      /AND \(t\.date < \(s\.start_date AT TIME ZONE 'UTC'\)::date\s+OR t\.date > \(s\.end_date AT TIME ZONE 'UTC'\)::date\)\s+LIMIT 1;/
    );
    // Both per-show checks read only the seed-owned set.
    expect(block.match(/JOIN _seed_owned_shows o ON o\.id = s\.id/g)).toHaveLength(2);
    // The set is exactly the four fixed ids or today's fixture: no other boolean rides along.
    const setDef = /CREATE TEMP TABLE _seed_owned_shows[\s\S]*?;/.exec(block)?.[0] ?? '';
    expect(setDef).toMatch(/AND \(s\.id IN \([^)]*\)\s+OR s\.id = v_fixture\);$/);
    expect(setDef).not.toMatch(/\b(true|false)\b/i);
    expect(block).toContain('share the name');
    // Each check fails the reseed with RAISE EXCEPTION, guarded by its own finding.
    for (const msg of [
      'closes entries after it starts',
      'has a trial dated outside its start/end range',
    ]) {
      expect(block, msg).toMatch(
        new RegExp(`IF v_bad IS NOT NULL THEN\\s+RAISE EXCEPTION '[^']*${msg}`)
      );
    }
    expect(block).toMatch(/IF r\.both_owned THEN\s+RAISE EXCEPTION '[^']*share the name/);
    expect(block).toMatch(/ELSE\s+RAISE WARNING '[^']*share the name/);
    expect(block).toContain('seed_demo_show_day_fixture_today()');
    expect(block).toMatch(/b\.name = a\.name[\s\S]*b\.start_date = a\.start_date/);
    expect(block).not.toContain("LIKE 'dededede-0000-0000-0000-%'");
    for (const n of ['010', '011', '012', '013']) {
      expect(block).toContain(`'dededede-0000-0000-0000-000000000${n}'::uuid`);
    }
    expect(block).not.toContain('000000000014');
    expect(block).toContain("'dededede-0000-0000-0731-000000000000'::uuid");
  });
});
