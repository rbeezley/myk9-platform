import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../../../..');
const source = readFileSync(
  resolve(repoRoot, 'supabase/functions/generate-premium/index.ts'),
  'utf8'
);

describe('generate-premium throttle integration', () => {
  it('runs the paid-generation seam after show authorization and before Claude', () => {
    expect(source).toContain("from './premiumRateLimit.ts'");
    expect(source).toContain('async ({ req, body, user, supabase }) =>');

    const authorization = source.indexOf("throw new HttpError(404, 'Show not found')");
    const gate = source.indexOf('runPremiumGenerationAttempt({');
    const claude = source.indexOf('generateNarratives(showSummary, anthropicKey)');

    expect(authorization).toBeGreaterThan(-1);
    expect(gate).toBeGreaterThan(authorization);
    expect(claude).toBeGreaterThan(gate);
    expect(source).toContain("supabase.rpc('check_and_record_premium_generation_attempt'");
  });

  it('rethrows limiter HttpErrors instead of converting them into Claude fallback copy', () => {
    const gate = source.indexOf('runPremiumGenerationAttempt({');
    const rethrow = source.indexOf('if (err instanceof HttpError)');
    const fallback = source.indexOf("showHours: 'Show hours to be announced.'");

    expect(gate).toBeGreaterThan(-1);
    expect(rethrow).toBeGreaterThan(gate);
    expect(fallback).toBeGreaterThan(rethrow);
  });
});
