import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { resolvePremiumStyle } from '../../../../../../supabase/functions/generate-premium/premiumStyle';

// Textual smoke check for the generate-premium edge function. Phase 1 changed
// the default-style fallback from 'classic' to 'monogram'. This test guards
// against a regression that re-introduces any legacy style identifier.

const EDGE_FN_PATH = resolve(
  __dirname,
  '../../../../../../supabase/functions/generate-premium/index.ts'
);

describe('generate-premium edge function style contract', () => {
  const source = readFileSync(EDGE_FN_PATH, 'utf-8');

  // MYK9-2056: style resolution moved to premiumStyle.ts, so it is tested by behavior, not text.
  it('resolves the style through premiumStyle.ts', () => {
    expect(source).toMatch(/const resolvedStyle = resolvePremiumStyle\(/);
  });

  it('uses monogram as the default style fallback', () => {
    // The default is set when neither the show nor its club_premium_templates row has a style.
    expect(resolvePremiumStyle(null, null)).toBe('monogram');
  });

  it('remaps legacy style identifiers instead of returning them to clients', () => {
    expect(resolvePremiumStyle('classic', null)).toBe('monogram');
    expect(resolvePremiumStyle(null, 'modern')).toBe('banner');
    expect(resolvePremiumStyle('minimal', null)).toBe('headline');
  });

  it('makes no model call and uses no generation allowance (MYK9-2055)', () => {
    expect(source).not.toMatch(/api\.anthropic\.com|ANTHROPIC_API_KEY|anthropic-version/i);
    expect(source).not.toMatch(/check_and_record_premium_generation_attempt|premiumRateLimit/);
    expect(source).toMatch(/buildPremiumNarratives\(show\)/);
  });
});
