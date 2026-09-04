/**
 * AKC Scent Work title data contract.
 *
 * The engine test for the prerequisite chain runs against a hand-written fixture,
 * which by construction cannot notice if the shipped SQL says something else.
 * This test closes that gap from both ends: it parses the seed migration to prove
 * the fixture IS the seeded catalogue, and parses the prerequisite migration to
 * prove the chain the engine test relies on is the chain that ships.
 *
 * Comments are stripped before any pattern runs — a `-- ('SCA', 'SCN')` line in
 * prose would otherwise satisfy the scan without any statement existing.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AKC_TITLE_PREREQUISITES,
  AKC_TITLE_ROOTS,
  buildAkcScentWorkTitles,
} from '@/services/__tests__/fixtures/akcScentWorkTitles';

const migrationsDir = resolve(__dirname, '../../../../../supabase/migrations');

function readMigration(file: string): string {
  return readFileSync(resolve(migrationsDir, file), 'utf8').replace(/--[^\n]*/g, '');
}

const seedSql = readMigration('031_seed_sport_titles.sql');
const chainSql = readMigration('20260904214500_seed_akc_scent_work_title_prerequisites.sql');

interface SeededTitle {
  abbreviation: string;
  fullName: string;
  titleType: string;
  requiredLegs: number;
  requiredElements: string[];
  sortOrder: number;
}

/** The AKC INSERT is the first `INSERT INTO sport_titles` block in the seed. */
function parseSeededAkcTitles(): SeededTitle[] {
  const start = seedSql.indexOf("sport_code = 'akc-scent-work'");
  expect(start).toBeGreaterThan(-1);
  const block = seedSql.slice(start, seedSql.indexOf('END;', start));

  const rows = [
    ...block.matchAll(
      /\(v_id,\s*'([^']+)',\s*'([^']+)',\s*'([^']+)',\s*(\d+),\s*ARRAY\[([^\]]*)\],\s*(\d+)\)/g
    ),
  ];

  return rows.map(([, abbreviation, fullName, titleType, requiredLegs, elements, sortOrder]) => ({
    abbreviation,
    fullName,
    titleType,
    requiredLegs: Number(requiredLegs),
    requiredElements: [...elements.matchAll(/'([^']+)'/g)].map(m => m[1]),
    sortOrder: Number(sortOrder),
  }));
}

/** child abbreviation → parent abbreviation, from the prerequisite migration's VALUES list. */
function parseChain(): Record<string, string> {
  const pairs = [...chainSql.matchAll(/\('([A-Z]+)',\s*'([A-Z]+)'\)/g)];
  const chain: Record<string, string> = {};
  for (const [, child, parent] of pairs) {
    expect(chain[child], `${child} is given two prerequisites`).toBeUndefined();
    chain[child] = parent;
  }
  return chain;
}

describe('AKC Scent Work title data', () => {
  const seeded = parseSeededAkcTitles();

  it('parses the full seeded catalogue', () => {
    expect(seeded).toHaveLength(49);
  });

  it('matches the fixture the engine tests run against', () => {
    const shape = (t: SeededTitle) =>
      [t.abbreviation, t.fullName, t.titleType, t.requiredLegs, t.sortOrder].join('|');

    expect(seeded.map(shape).sort()).toEqual(
      buildAkcScentWorkTitles()
        .map(t =>
          [t.abbreviation, t.full_name, t.title_type, t.required_legs, t.sort_order].join('|')
        )
        .sort()
    );
  });

  it('ships the prerequisite chain the engine tests assume', () => {
    expect(parseChain()).toEqual(AKC_TITLE_PREREQUISITES);
  });

  it('names only real titles on both ends of every edge', () => {
    const known = new Set(seeded.map(t => t.abbreviation));
    for (const [child, parent] of Object.entries(parseChain())) {
      expect(known.has(child), `unknown child ${child}`).toBe(true);
      expect(known.has(parent), `unknown parent ${parent}`).toBe(true);
      expect(child).not.toBe(parent);
    }
  });

  it('leaves exactly the seven entry-point titles unchained', () => {
    const chain = parseChain();
    const roots = seeded.map(t => t.abbreviation).filter(abbr => !chain[abbr]);
    expect(roots.sort()).toEqual([...AKC_TITLE_ROOTS].sort());
  });

  it('walks every title back to a root without cycling', () => {
    const chain = parseChain();
    for (const { abbreviation } of seeded) {
      const seen = new Set<string>([abbreviation]);
      let current = abbreviation;
      while (chain[current]) {
        current = chain[current];
        expect(seen.has(current), `cycle reached at ${current}`).toBe(false);
        seen.add(current);
      }
      expect([...AKC_TITLE_ROOTS] as string[]).toContain(current);
    }
  });

  it('guards its own write with the edge count it actually seeds', () => {
    // The migration asserts the number of edges it wrote and raises rather than
    // committing a partial write, so an abbreviation typo cannot pass as a no-op.
    // Derived from the chain rather than hard-coded, so the two cannot drift.
    const expected = Object.keys(AKC_TITLE_PREREQUISITES).length;
    expect(chainSql).toMatch(new RegExp(`v_expected\\s+CONSTANT\\s+INTEGER\\s*:=\\s*${expected};`));
    expect(chainSql).toMatch(/RAISE EXCEPTION/);
  });
});
