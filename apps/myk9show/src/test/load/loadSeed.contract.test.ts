import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(process.cwd(), '../..');
const seed = readFileSync(resolve(repoRoot, 'supabase/seed-demo.sql'), 'utf8');

describe('canonical MYK9-109 load fixture', () => {
  it('adds 63 deterministic dogs across the eight non-finalized canonical classes', () => {
    expect(seed).toContain('-- MYK9-109 LOAD FIXTURE START');
    expect(seed).toContain('generate_series(1, 63)');
    expect(seed).toContain('generate_series(1, 8)');
    expect(seed).toContain('63 dogs x 8 classes = 504');
    expect(seed).toContain('excludes finalized class dec1a55e-0000-0000-0000-000000000031');
  });

  it('cleans the deterministic range before recreating it', () => {
    expect(seed).toContain('-- MYK9-109 LOAD FIXTURE CLEANUP');
    expect(seed).toMatch(/DELETE FROM public\.entries[\s\S]+myk9_109/);
    expect(seed).toMatch(/DELETE FROM public\.dogs[\s\S]+myk9_109/);
  });

  it('asserts the declared 514-row show total', () => {
    expect(seed).toContain('MYK9-109 expected 514 demo-show entries');
  });
});
