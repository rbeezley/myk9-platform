import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Textual smoke check for the generate-premium edge function. Phase 1 changed
// the default-style fallback from 'classic' to 'monogram'. This test guards
// against a regression that re-introduces any legacy style identifier.

const EDGE_FN_PATH = resolve(
  __dirname,
  '../../../../../../supabase/functions/generate-premium/index.ts'
);

describe('generate-premium edge function style contract', () => {
  const source = readFileSync(EDGE_FN_PATH, 'utf-8');

  it('uses monogram as the default style fallback', () => {
    // The default is set when a club_premium_templates row has no style.
    expect(source).toMatch(/\?\?\s*'monogram'/);
  });

  it('remaps legacy style identifiers instead of returning them to clients', () => {
    expect(source).toMatch(/classic:\s*'monogram'/);
    expect(source).toMatch(/modern:\s*'banner'/);
    expect(source).toMatch(/minimal:\s*'headline'/);
    expect(source).toMatch(/const resolvedStyle = LEGACY_STYLE_REMAP\[rawStyle\] \?\? rawStyle/);
  });

  it('aborts slow narrative generation so premium generation can return fallback content', () => {
    expect(source).toMatch(/const NARRATIVE_TIMEOUT_MS = \d+;/);
    expect(source).toMatch(/new AbortController\(\)/);
    expect(source).toMatch(/signal: controller\.signal/);
    expect(source).toMatch(/clearTimeout\(timeoutId\)/);
  });
});
