import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { CLUB_PAYOUTS_OFF_SERVER_MESSAGE } from '@/features/payments/cardPausedCopy';

/**
 * MYK9-2166: the cart and the wait-list offer recognise the payouts-off refusal by its exact 403
 * body, because neither function sends a code. If either function rewords it, the exhibitor would
 * quietly get the generic sentence again, so the constant must still appear in both sources.
 */
describe('the payouts-off 403 the app recognises', () => {
  it.each(['stripe-checkout', 'stripe-payment-link'])('%s still sends it verbatim', fn => {
    const source = readFileSync(
      resolve(__dirname, `../../../supabase/functions/${fn}/index.ts`),
      'utf8'
    );
    expect(source).toContain(`{ error: "${CLUB_PAYOUTS_OFF_SERVER_MESSAGE}" }`);
  });
});
