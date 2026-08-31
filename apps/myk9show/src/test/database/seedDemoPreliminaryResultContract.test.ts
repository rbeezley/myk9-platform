import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../../../..');
const seed = readFileSync(join(repoRoot, 'supabase/seed-demo.sql'), 'utf8');

const fixtureStart = seed.indexOf('-- 8b. GAP FIXTURE #3 (preliminary result)');
const fixtureEnd = seed.indexOf('-- 9. GAP FIXTURE #4', fixtureStart);

describe('seed-demo preliminary result fixture', () => {
  it('uses a purpose-built small class instead of the load-tested class', () => {
    expect(fixtureStart).toBeGreaterThan(-1);
    expect(fixtureEnd).toBeGreaterThan(fixtureStart);

    const fixture = seed.slice(fixtureStart, fixtureEnd);
    expect(fixture).toContain('dec1a55e-0000-0000-0000-000000000040');
    expect(fixture).toContain('dededede-0000-0000-0000-000000000067');
    expect(fixture).toContain('dededede-0000-0000-0000-000000000068');
    expect(fixture).toContain('is_scoring_finalized = true');
    expect(fixture).toContain('results_released_at = NULL');
    expect(fixture).toContain('final_placement = 1');
    expect(fixture).toContain('final_placement = 2');
  });

  it('reads back both persisted placements and the unreleased class state', () => {
    const fixture = seed.slice(fixtureStart, fixtureEnd);
    expect(fixture).toMatch(/SELECT count\(\*\)[\s\S]*FROM public\.entries/);
    expect(fixture).toContain("RAISE EXCEPTION 'MYK9-263 preliminary fixture");
    expect(fixture).toContain('v_placed_count <> 2');
    expect(fixture).toContain('v_released_at IS NOT NULL');
  });
});
