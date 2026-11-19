import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Source-text contract for MYK9-2190: every seeded entry that is not a card entry has an
 * entry form made by the seed itself (MYK9-1930's trigger skips the seed's session), so the
 * demo does not show "Payment due" entries with no Cash / Check control.
 */

const repoRoot = resolve(__dirname, '../../../../..');
const seed = readFileSync(join(repoRoot, 'supabase/seed-demo.sql'), 'utf8');

const EXHIBITOR_FORM = 'dededede-0000-0000-0000-000000000070';
const SECRETARY_FORM = 'dededede-0000-0000-0000-000000000071';

const block = seed.slice(
  seed.indexOf('-- 9b. ENTRY FORMS FOR EVERY OTHER SEEDED ENTRY'),
  seed.indexOf('RESET ROLE;', seed.indexOf('-- 9b. ENTRY FORMS'))
);

const idsLinkedTo = (form: string): string[] => {
  const at = block.indexOf(`SET registration_id = '${form}'`);
  const list = block.slice(at, block.indexOf(');', at));
  return [...list.matchAll(/'(dededede-[0-9a-f-]{27})'/g)].map(m => m[1] as string).slice(1);
};

describe('seed-demo entry forms (MYK9-2190)', () => {
  it('inserts the secretary form pending, with no money', () => {
    const insert = block.slice(
      block.indexOf('INSERT INTO public.enrollments'),
      block.indexOf('UPDATE')
    );
    expect(insert).toContain(SECRETARY_FORM);
    expect(insert).toContain("'pending'");
    expect(insert).not.toMatch(/paid_amount|total_amount|payment_method/);
  });

  it("links each seeded desk entry to its owner's form, per form", () => {
    const last = (ids: string[]) => ids.map(id => id.slice(-2)).sort();
    // Ranger, Juniper and Maple are the exhibitor's dogs; 059/060 are their refunded pair.
    expect(last(idsLinkedTo(EXHIBITOR_FORM))).toEqual(['53', '54', '57', '59', '60']);
    // Cooper is the secretary's dog, including 069, which the exhibitor handles.
    expect(last(idsLinkedTo(SECRETARY_FORM))).toEqual(['58', '69']);
  });

  it('records the paid entries money on the exhibitor form so it owes only the pending ones', () => {
    expect(block).toMatch(
      new RegExp(
        `UPDATE public\\.enrollments\\s+SET paid_amount = 180\\s+WHERE id = '${EXHIBITOR_FORM}'`
      )
    );
  });

  it('seeds the secretary form entries as owing, never as paid money that is not recorded', () => {
    for (const id of ['058', '069']) {
      const at = seed.indexOf(`('dededede-0000-0000-0000-000000000${id}'`);
      const tuple = seed.slice(at, seed.indexOf(';', at));
      expect(tuple, id).toContain("'pending'");
      expect(tuple, id).not.toContain("'paid'");
    }
  });

  it('clears the secretary form by id and by its (show, handler) pair, entries first', () => {
    const entriesDelete = seed.indexOf(`registration_id = '${SECRETARY_FORM}'`);
    const formsDelete = seed.indexOf(`DELETE FROM public.enrollments\nWHERE id IN (`);
    expect(entriesDelete).toBeGreaterThan(-1);
    expect(formsDelete).toBeGreaterThan(entriesDelete);
    const statement = seed.slice(formsDelete, seed.indexOf(';', formsDelete));
    expect(statement).toContain(SECRETARY_FORM);
    expect(statement).toContain('secretary@myk9t.com');
  });
});
