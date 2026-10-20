import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * MYK9-126: supabase/seed-demo.sql resets the six hand-authored demo dogs in
 * place instead of deleting them. Deleting them cascaded away every entry a
 * club took for one on its own show, and the paid-stray guard refused the
 * 2026-10-19 G9 rehearsal on seven real paper entries.
 *
 * Source text only, like its sibling contracts: it pins that the delete is
 * gone, that each part of the old cascade is replicated explicitly, and that
 * the insert resets the row. The behavioural half is
 * supabase/tests/seed_demo_paid_stray_guard_test.sql (F538.6 / F538.6b) and a
 * reseed run.
 */

const repoRoot = resolve(__dirname, '../../../../..');
const seed = readFileSync(resolve(repoRoot, 'supabase/seed-demo.sql'), 'utf8')
  // Drop line comments so a commented-out statement cannot satisfy a match.
  .replace(/--[^\n]*/g, '');

const DEMO_DOG_IDS = ['41', '42', '43', '44', '45', '46'].map(
  n => `dededede-0000-0000-0000-0000000000${n}`
);

// Every child of public.dogs whose FK is ON DELETE CASCADE, read from the live
// catalog (pg_constraint confrelid = 'public.dogs', confdeltype = 'c') on
// 2026-10-19. entries is handled separately: only its show-day fixture rows go.
const PROFILE_CASCADE_CHILDREN = [
  'dog_registrations',
  'health_records',
  'vaccinations',
  'medications',
  'allergies',
  'vet_visits',
  'achievements',
  'training_journal_entries',
  'training_milestones',
  'manual_results',
  'pedigree_ancestors',
  'ofa_screenings',
  'genetic_screenings',
  'training_goals',
];

function statements(re: RegExp): string[] {
  return seed.match(re) ?? [];
}

const namesEveryDemoDog = (sql: string) => DEMO_DOG_IDS.every(id => sql.includes(`'${id}'`));

describe('seed-demo resets the demo dogs in place (MYK9-126)', () => {
  it('never deletes a hand-authored demo dog', () => {
    for (const del of statements(/DELETE FROM public\.dogs\b[^;]*;/g)) {
      for (const id of DEMO_DOG_IDS) expect(del).not.toContain(`'${id}'`);
    }
  });

  it('clears each profile cascade child for every demo dog', () => {
    for (const child of PROFILE_CASCADE_CHILDREN) {
      const deletes = statements(new RegExp(`DELETE FROM public\\.${child}\\b[^;]*;`, 'g'));
      expect(deletes.some(namesEveryDemoDog), `${child} is not cleared for the demo dogs`).toBe(
        true
      );
    }
  });

  it("deletes demo-dog entries on the show-day fixture shows only, never on a club's show", () => {
    const demoDogEntryDeletes = statements(/DELETE FROM public\.entries\b[^;]*;/g).filter(
      namesEveryDemoDog
    );
    expect(demoDogEntryDeletes).toHaveLength(1);
    const [del] = demoDogEntryDeletes;
    expect(del).toContain("show_id = 'dededede-0000-0000-0000-000000000014'");
    expect(del).toContain("show_id >= 'dededede-0000-0000-0731-000000000000'::uuid");
  });

  it("scopes the demo-dog waitlist and cart clears to the seed's own classes", () => {
    for (const table of ['waitlist_entries', 'entry_cart_items']) {
      const deletes = statements(new RegExp(`DELETE FROM public\\.${table}\\b[^;]*;`, 'g')).filter(
        namesEveryDemoDog
      );
      expect(deletes.length, `${table} has no demo-dog clear`).toBeGreaterThan(0);
      for (const del of deletes) {
        expect(del, `${table} demo-dog clear is not scoped to seed classes`).toMatch(
          /AND class_id IN \(SELECT c\.id FROM public\.classes c/
        );
      }
    }
  });

  it('upserts the demo dogs, clearing soft-delete and moving version forward', () => {
    const insert = statements(/INSERT INTO public\.dogs \(id, name, call_name[^;]*;/g).find(
      namesEveryDemoDog
    );
    expect(insert, 'demo dogs insert not found').toBeDefined();
    expect(insert).toContain('ON CONFLICT (id) DO UPDATE SET');
    expect(insert).toMatch(/deleted_at\s+= NULL/);
    expect(insert).toMatch(/owner_id\s+= EXCLUDED\.owner_id/);
    expect(insert).toMatch(/version\s+= public\.dogs\.version \+ 1/);
  });
});
