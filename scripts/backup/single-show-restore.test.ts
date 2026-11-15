import { describe, expect, it } from 'vitest';
import {
  buildPlan,
  cascadeClosure,
  decodeCopyField,
  formatSummary,
  orderTables,
  parseCopyData,
  parseForeignKeys,
  selectShowRows,
} from './single-show-restore-model';
import { SHOW_DATA_TABLES, isMoneyTable } from './single-show-restore-tables';

const SHOW = '00000000-0000-0000-0000-00000000000a';
const OTHER = '00000000-0000-0000-0000-00000000000b';

const KNOWN = new Set([...SHOW_DATA_TABLES, 'public.entry_notes']); // the fixture's own table

const SCHEMA = `
ALTER TABLE ONLY public.trials
    ADD CONSTRAINT trials_show_id_fkey FOREIGN KEY (show_id) REFERENCES public.shows(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.classes
    ADD CONSTRAINT classes_trial_id_fkey FOREIGN KEY (trial_id) REFERENCES public.trials(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.entries
    ADD CONSTRAINT entries_show_id_fkey FOREIGN KEY (show_id) REFERENCES public.shows(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.entries
    ADD CONSTRAINT entries_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.entries
    ADD CONSTRAINT entries_trial_id_fkey FOREIGN KEY (trial_id) REFERENCES public.trials(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.entries
    ADD CONSTRAINT entries_dog_id_fkey FOREIGN KEY (dog_id) REFERENCES public.dogs(id);
ALTER TABLE ONLY public.entry_notes
    ADD CONSTRAINT entry_notes_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES public.entries(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.show_payouts
    ADD CONSTRAINT show_payouts_show_id_fkey FOREIGN KEY (show_id) REFERENCES public.shows(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.dog_photos
    ADD CONSTRAINT dog_photos_dog_id_fkey FOREIGN KEY (dog_id) REFERENCES public.dogs(id) ON DELETE CASCADE;
`;

const DATA = [
  'COPY public.shows (id, name) FROM stdin;',
  `${SHOW}\tHeartland's Classic`,
  `${OTHER}\tOther`,
  '\\.',
  'COPY public.trials (id, show_id) FROM stdin;',
  't1\t' + SHOW,
  't2\t' + OTHER,
  '\\.',
  'COPY public.classes (id, trial_id) FROM stdin;',
  'c1\tt1',
  'c2\tt2',
  '\\.',
  'COPY public.entries (id, show_id, class_id, trial_id, dog_id, note) FROM stdin;',
  `e1\t${SHOW}\tc1\tt1\td1\tline1\\nline2`,
  'e2\t\\N\tc1\t\\N\td2\t\\N', // reachable only through class_id
  'e3\t\\N\t\\N\tt1\td1\tx', // reachable only through trial_id
  `e4\t${OTHER}\tc2\tt2\td3\tother show`,
  '\\.',
  'COPY public.entry_notes (id, entry_id) FROM stdin;',
  'n1\te2',
  'n2\te4',
  '\\.',
  'COPY public.show_payouts (id, show_id) FROM stdin;',
  'p1\t' + SHOW,
  '\\.',
  '',
].join('\n');

function select() {
  const keys = parseForeignKeys(SCHEMA);
  const data = parseCopyData(DATA, cascadeClosure(keys));
  return { keys, selection: selectShowRows(SHOW, keys, data) };
}

describe('single-show restore model', () => {
  it('parses foreign keys and finds the cascade closure', () => {
    const keys = parseForeignKeys(SCHEMA);
    expect(keys).toHaveLength(9);
    expect([...cascadeClosure(keys)].sort()).toEqual([
      'public.classes',
      'public.entries',
      'public.entry_notes',
      'public.show_payouts',
      'public.shows',
      'public.trials',
    ]);
  });

  it('decodes COPY escapes and nulls', () => {
    expect(decodeCopyField('\\N')).toBeNull();
    expect(decodeCopyField('a\\tb\\\\c\\nd\\101')).toBe('a\tb\\c\nd' + 'A');
  });

  it('selects rows through every route and nothing from other shows', () => {
    const { selection } = select();
    const ids = (table: string, col = 0) =>
      [...(selection.included.get(table) ?? [])].map(i => selection.data.get(table)?.rows[i][col]);
    expect(ids('public.entries')).toEqual(['e1', 'e2', 'e3']);
    expect(ids('public.entry_notes')).toEqual(['n1']);
    expect(ids('public.trials')).toEqual(['t1']);
    expect(ids('public.show_payouts')).toEqual(['p1']);
  });

  it('fails clearly when the show is absent', () => {
    const keys = parseForeignKeys(SCHEMA);
    const data = parseCopyData(DATA, cascadeClosure(keys));
    expect(() => selectShowRows('00000000-0000-0000-0000-0000000000ff', keys, data)).toThrow(
      /was not found/
    );
  });

  it('orders parents before children', () => {
    const keys = parseForeignKeys(SCHEMA);
    const order = orderTables([...cascadeClosure(keys)], keys);
    expect(order.indexOf('public.shows')).toBeLessThan(order.indexOf('public.trials'));
    expect(order.indexOf('public.trials')).toBeLessThan(order.indexOf('public.classes'));
    expect(order.indexOf('public.classes')).toBeLessThan(order.indexOf('public.entries'));
  });

  it('builds a transactional plan with counts, quoting, preflight and money warning', () => {
    const { keys, selection } = select();
    const plan = buildPlan(selection, keys, {
      showId: SHOW,
      sourceRef: 'src',
      showDataTables: KNOWN,
      exportCreatedAt: '2026-11-15T00:00:00Z',
      includeMoney: true,
    });
    expect(plan.totalRows).toBe(1 + 1 + 1 + 3 + 1 + 1);
    expect(plan.tables.find(t => t.table === 'public.entries')?.rows).toBe(3);
    expect(plan.sql.startsWith('-- myK9 single-show restore plan')).toBe(true);
    expect(plan.sql).toContain('BEGIN;');
    expect(plan.sql.trimEnd().endsWith('COMMIT;')).toBe(true);
    expect(plan.sql).toContain("'Heartland''s Classic'");
    expect(plan.sql).toContain("'line1\nline2'");
    expect(plan.sql).toContain('ON CONFLICT DO NOTHING');
    expect(plan.sql).not.toContain('other show');
    expect(plan.externalRefs.map(r => [r.refTable, r.values])).toEqual([
      ['public.dogs', ['d1', 'd2']],
    ]);
    expect(plan.sql).toContain('RAISE EXCEPTION');
    expect(formatSummary(plan)).toContain('public.dogs.id');
  });

  it('drops excluded tables from the plan and the warnings', () => {
    const { keys, selection } = select();
    const plan = buildPlan(selection, keys, {
      showId: SHOW,
      sourceRef: 'src',
      showDataTables: KNOWN,
      exportCreatedAt: 'x',
      excludeTables: ['public.show_payouts'],
    });
    expect(plan.sql).not.toContain('show_payouts');
    expect(plan.warnings.join(' ')).not.toContain('money tables');
  });

  it('excludes money tables by default and says so', () => {
    const { keys, selection } = select();
    const plan = buildPlan(selection, keys, {
      showId: SHOW,
      sourceRef: 'src',
      showDataTables: KNOWN,
      exportCreatedAt: 'x',
    });
    expect(plan.sql).not.toContain('show_payouts');
    expect(plan.tables.map(t => t.table)).not.toContain('public.show_payouts');
    expect(plan.totalRows).toBe(1 + 1 + 1 + 3 + 1);
    expect(plan.warnings).toEqual([expect.stringContaining('excluded by default')]);
    expect(plan.warnings[0]).toContain('public.show_payouts');
    expect(formatSummary(plan)).toContain('WARNING: money tables excluded by default');
  });

  it('includes money tables only with includeMoney, and prints the warning', () => {
    const { keys, selection } = select();
    const plan = buildPlan(selection, keys, {
      showId: SHOW,
      sourceRef: 'src',
      showDataTables: KNOWN,
      exportCreatedAt: 'x',
      includeMoney: true,
    });
    expect(plan.sql).toContain('"public"."show_payouts"');
    expect(plan.tables.find(t => t.table === 'public.show_payouts')?.rows).toBe(1);
    expect(plan.warnings).toHaveLength(1);
    expect(plan.warnings[0]).toContain('--include-money');
    expect(plan.warnings[0]).toContain('double-count');
    expect(formatSummary(plan)).toContain('WARNING: --include-money');
  });

  it('does not warn about money when includeMoney is set and an exclusion covers it', () => {
    const { keys, selection } = select();
    const plan = buildPlan(selection, keys, {
      showId: SHOW,
      sourceRef: 'src',
      showDataTables: KNOWN,
      exportCreatedAt: 'x',
      includeMoney: true,
      excludeTables: ['public.show_payouts'],
    });
    expect(plan.sql).not.toContain('show_payouts');
    expect(plan.warnings).toEqual([]);
  });

  it('classifies the Stripe-ledger and checkout tables as money and show data as not', () => {
    for (const t of [
      'show_payments',
      'show_payouts',
      'show_money_locks',
      'refund_requests',
      'refund_request_attempts',
      'stripe_order_refunds',
      'stripe_orders',
      'entry_payment_links',
      'club_stripe_accounts',
      'entry_carts',
      'entry_cart_items',
      'cart_spot_holds',
      'cart_checkout_leases',
    ])
      expect(isMoneyTable(`public.${t}`), t).toBe(true);
    for (const t of ['entries', 'trial_lunch_orders', 'promo_codes', 'shows', 'enrollments'])
      expect(isMoneyTable(`public.${t}`), t).toBe(false);
    for (const t of SHOW_DATA_TABLES) expect(isMoneyTable(t), t).toBe(false);
  });

  it('refuses a closure table that is neither money nor show data, naming it and the remedy', () => {
    const { keys, selection } = select();
    const options = { showId: SHOW, sourceRef: 'src', exportCreatedAt: 'x' };
    expect(() => buildPlan(selection, keys, options)).toThrow(/public\.entry_notes is in/);
    expect(() => buildPlan(selection, keys, options)).toThrow(/--exclude-table.*SHOW_DATA_TABLES/);
    const plan = buildPlan(selection, keys, { ...options, excludeTables: ['public.entry_notes'] });
    expect(plan.sql).not.toContain('entry_notes');
  });

  it('excludes the cart and checkout tables by default', () => {
    const schema = `${SCHEMA}
ALTER TABLE ONLY public.entry_carts
    ADD CONSTRAINT entry_carts_show_id_fkey FOREIGN KEY (show_id) REFERENCES public.shows(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.cart_spot_holds
    ADD CONSTRAINT cart_spot_holds_cart_id_fkey FOREIGN KEY (cart_id) REFERENCES public.entry_carts(id) ON DELETE CASCADE;
`;
    const data = `${DATA}COPY public.entry_carts (id, show_id) FROM stdin;
k1\t${SHOW}
\\.
COPY public.cart_spot_holds (id, cart_id) FROM stdin;
h1\tk1
\\.
`;
    const keys = parseForeignKeys(schema);
    const selection = selectShowRows(SHOW, keys, parseCopyData(data, cascadeClosure(keys)));
    const options = { showId: SHOW, sourceRef: 'src', exportCreatedAt: 'x', showDataTables: KNOWN };
    const plan = buildPlan(selection, keys, options);
    expect(plan.sql).not.toContain('entry_carts');
    expect(plan.sql).not.toContain('cart_spot_holds');
    expect(plan.warnings.join(' ')).toContain('public.entry_carts');
    const withMoney = buildPlan(selection, keys, { ...options, includeMoney: true });
    expect(withMoney.sql).toContain('"public"."entry_carts"');
    expect(withMoney.sql).toContain('"public"."cart_spot_holds"');
  });
});
