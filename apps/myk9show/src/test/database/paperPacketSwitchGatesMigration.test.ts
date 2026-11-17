/**
 * MYK9-2112 (decision B of MYK9-2079): the "Paper fallback packet" switch starts on and gates the
 * nightly packet and its print reminder. Each dispatcher must be its earlier definition plus the
 * one predicate, so nothing else in the cron's behavior changes by accident.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = (name: string) =>
  readFileSync(resolve(__dirname, '../../../../../supabase/migrations', name), 'utf8');

const sql = migration('20261117012900_myk9_2112_paper_packet_switch_gates.sql');
const flat = sql.replace(/--.*$/gm, '').replace(/\s+/g, ' ');

const GATE = /\n {6}-- MYK9-2112[^\n]*\n {6}-- [^\n]*\n {6}and s\.uses_paper_packet\n/;

/** The `create or replace function public.<name>(` statement, through its closing `$$;`. */
function functionBody(text: string, name: string): string {
  const start = text.indexOf(`create or replace function public.${name}(`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = text.indexOf('\n$$;', start);
  expect(end).toBeGreaterThan(start);
  return text.slice(start, end + 4);
}

describe('20261117012900_myk9_2112_paper_packet_switch_gates.sql', () => {
  it('makes the switch start on and turns it on for every existing show', () => {
    expect(flat).toContain(
      'ALTER TABLE public.shows ALTER COLUMN uses_paper_packet SET DEFAULT true;'
    );
    expect(flat).toContain(
      'UPDATE public.shows SET uses_paper_packet = true WHERE uses_paper_packet = false;'
    );
  });

  it.each([
    ['request_trial_packet_generation', '20260822190000_trial_packet_cron.sql'],
    ['request_trial_packet_print_reminders', '20260822192000_trial_packet_print_reminder.sql'],
  ])('%s is its earlier definition plus the switch, inside the show query', (name, earlier) => {
    const next = functionBody(sql, name);
    expect(next).toMatch(GATE);
    expect(next.match(/uses_paper_packet/g)).toHaveLength(1);
    expect(next.indexOf('and s.uses_paper_packet')).toBeGreaterThan(
      next.indexOf("and coalesce(s.status, '') not in ('draft', 'cancelled')")
    );
    expect(next.indexOf('and s.uses_paper_packet')).toBeLessThan(next.indexOf('  loop\n'));
    expect(next.replace(GATE, '\n')).toBe(functionBody(migration(earlier), name));
  });

  it('keeps both dispatchers closed to client roles', () => {
    expect(flat).toContain(
      'revoke all on function public.request_trial_packet_generation(text, text) from public, anon, authenticated;'
    );
    expect(flat).toContain(
      'revoke all on function public.request_trial_packet_print_reminders(text, text, text) from public, anon, authenticated;'
    );
  });
});
