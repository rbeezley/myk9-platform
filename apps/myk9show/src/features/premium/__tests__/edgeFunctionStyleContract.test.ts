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

  it('does not reference the legacy "classic" style anywhere', () => {
    expect(source).not.toMatch(/['"]classic['"]/);
  });

  it('does not reference the legacy "modern" style anywhere', () => {
    expect(source).not.toMatch(/['"]modern['"]/);
  });

  it('does not reference the legacy "minimal" style anywhere', () => {
    expect(source).not.toMatch(/['"]minimal['"]/);
  });
});
