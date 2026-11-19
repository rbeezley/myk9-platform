import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { CLUB_PAYOUTS_OFF_SERVER_MESSAGE } from '@/features/payments/cardPausedCopy';
import { CLUB_PAYOUTS_OFF_ERROR } from '../../../supabase/functions/_shared/clubPayoutsGate';

const functionSource = (fn: string) =>
  readFileSync(resolve(__dirname, `../../../supabase/functions/${fn}/index.ts`), 'utf8');

/**
 * MYK9-2166: the cart and the wait-list offer recognise the payouts-off refusal by its exact 403
 * body, because neither function sends a code. If the server rewords it, the exhibitor would
 * quietly get the generic sentence again. Since MYK9-2193 the sentence lives in one shared helper
 * that both functions answer through, so the app's copy must equal that constant and both
 * functions must still use the helper.
 */
describe('the payouts-off 403 the app recognises', () => {
  it("is the server's sentence, character for character", () => {
    expect(CLUB_PAYOUTS_OFF_SERVER_MESSAGE).toBe(CLUB_PAYOUTS_OFF_ERROR);
  });

  it.each(['stripe-checkout', 'stripe-payment-link'])(
    '%s answers through the shared helper',
    fn => {
      const source = functionSource(fn);
      expect(source).toContain('clubPayoutsRefusal(clubAccountLookup)');
      expect(source).toContain('{ error: clubAccountRefusal.error }');
    }
  );
});
