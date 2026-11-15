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

const SHOW = '00000000-0000-0000-0000-00000000000a';
const OTHER = '00000000-0000-0000-0000-00000000000b';

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
      exportCreatedAt: '2026-11-15T00:00:00Z',
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
    expect(plan.warnings.join(' ')).toContain('public.show_payouts');
    expect(formatSummary(plan)).toContain('public.dogs.id');
  });

  it('drops excluded tables from the plan and the warnings', () => {
    const { keys, selection } = select();
    const plan = buildPlan(selection, keys, {
      showId: SHOW,
      sourceRef: 'src',
      exportCreatedAt: 'x',
      excludeTables: ['public.show_payouts'],
    });
    expect(plan.sql).not.toContain('show_payouts');
    expect(plan.warnings.join(' ')).not.toContain('money tables');
  });
});
