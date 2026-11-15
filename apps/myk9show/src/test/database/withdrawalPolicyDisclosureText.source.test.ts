import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * MYK9-1976 (Codex P1): the app and the stripe-payment-link edge function resolve the policy
 * text with ONE module, kept as two byte-identical copies because Deno cannot import app src.
 */
const appRoot = resolve(__dirname, '../../..');
const copies = [
  'supabase/functions/_shared/withdrawalPolicyDisclosureText.ts',
  'src/features/payments/withdrawalPolicyDisclosureText.ts',
] as const;

const source = (path: string) => readFileSync(resolve(appRoot, path), 'utf8');

describe('withdrawal policy text resolver copies', () => {
  it('keeps the edge and app copies byte-identical', () => {
    expect(source(copies[1])).toBe(source(copies[0]));
  });

  it('imports nothing, so each copy is the whole module', () => {
    expect(source(copies[0])).not.toMatch(/^\s*import\s/m);
  });
});
