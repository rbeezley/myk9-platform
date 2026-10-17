// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  STEP_UP_REQUIRED_CODE,
  STEP_UP_WINDOW_SECONDS,
  latestReauthAt,
  stepUpRefusal,
} from './stepUpReauth';

const NOW = 1_800_000_000;

function base64url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

/** An unsigned JWT-shaped token. The gate runs only after GoTrue verified the real one. */
function tokenWith(claims: Record<string, unknown>): string {
  return `${base64url('{"alg":"HS256","typ":"JWT"}')}.${base64url(JSON.stringify(claims))}.sig`;
}

const claims = (amr: unknown) => ({ sub: 'user-1', role: 'authenticated', amr });

describe('stepUpRefusal', () => {
  it('refuses a session whose password sign-in is older than the window', () => {
    const token = tokenWith(claims([{ method: 'password', timestamp: NOW - 14 * 86_400 }]));
    expect(stepUpRefusal(`Bearer ${token}`, NOW)).toEqual({
      status: 403,
      body: { error: STEP_UP_REQUIRED_CODE, message: 'Confirm your password to continue.' },
    });
  });

  it('refuses a token with no amr claim at all', () => {
    expect(stepUpRefusal(tokenWith({ sub: 'user-1', role: 'authenticated' }), NOW)).not.toBeNull();
  });

  it('refuses one second past the window and allows the last second inside it', () => {
    const at = (age: number) => tokenWith(claims([{ method: 'password', timestamp: NOW - age }]));
    expect(stepUpRefusal(at(STEP_UP_WINDOW_SECONDS + 1), NOW)).not.toBeNull();
    expect(stepUpRefusal(at(STEP_UP_WINDOW_SECONDS), NOW)).toBeNull();
  });

  it('allows a password confirmed a moment ago', () => {
    const token = tokenWith(claims([{ method: 'password', timestamp: NOW - 20 }]));
    expect(stepUpRefusal(`Bearer ${token}`, NOW)).toBeNull();
  });

  it('allows an emailed code (otp) for an account with no password', () => {
    const token = tokenWith(claims([{ method: 'otp', timestamp: NOW - 5 }]));
    expect(stepUpRefusal(token, NOW)).toBeNull();
  });

  it('reads the freshest accepted method when the session holds several', () => {
    const token = tokenWith(
      claims([
        { method: 'oauth', timestamp: NOW - 2 },
        { method: 'password', timestamp: NOW - 86_400 },
        { method: 'magiclink', timestamp: NOW - 30 },
      ])
    );
    expect(stepUpRefusal(token, NOW)).toBeNull();
  });

  it('does not count an OAuth or anonymous sign-in as a re-authentication', () => {
    expect(stepUpRefusal(tokenWith(claims([{ method: 'oauth', timestamp: NOW }])), NOW)).not.toBe(
      null
    );
    expect(
      stepUpRefusal(tokenWith(claims([{ method: 'anonymous', timestamp: NOW }])), NOW)
    ).not.toBeNull();
  });

  it('refuses a timestamp from the future and garbage timestamps', () => {
    for (const timestamp of [NOW + 3_600, '1800000000', null, Number.NaN, -1, undefined]) {
      const token = tokenWith(claims([{ method: 'password', timestamp }]));
      expect(stepUpRefusal(token, NOW), String(timestamp)).not.toBeNull();
    }
  });

  it('refuses the RFC 8176 string form, which carries no time', () => {
    expect(stepUpRefusal(tokenWith(claims(['password'])), NOW)).not.toBeNull();
  });

  it('refuses a token that is not a JWT', () => {
    for (const token of ['', 'Bearer ', 'not-a-jwt', 'a.%%%.c', `a.${base64url('[1]')}.c`]) {
      expect(stepUpRefusal(token, NOW), token).not.toBeNull();
    }
  });

  it('decodes a payload carrying non-ASCII user metadata', () => {
    const token = tokenWith({
      ...claims([{ method: 'password', timestamp: NOW }]),
      user_metadata: { first_name: 'Zoë' },
    });
    expect(stepUpRefusal(token, NOW)).toBeNull();
  });
});

describe('latestReauthAt', () => {
  it('is null for anything that is not an array of method entries', () => {
    expect(latestReauthAt(undefined)).toBeNull();
    expect(latestReauthAt({ method: 'password', timestamp: NOW })).toBeNull();
    expect(latestReauthAt([null, 7, 'otp'])).toBeNull();
  });
});

/**
 * The three refund functions are `Deno.serve` modules vitest cannot run, so the wiring is
 * pinned here: each one asks the gate AFTER it has authorized the caller (a stranger still
 * gets "not authorized", not a password prompt) and BEFORE anything that reads payout state
 * or talks to Stripe. The gate's behavior is the describe block above.
 */
describe('refund functions refuse before doing anything when the re-auth is stale', () => {
  const read = (fn: string) =>
    readFileSync(resolve(__dirname, `../${fn}/index.ts`), 'utf8').replace(/\s+/g, ' ');
  const GATE = 'const stepUp = stepUpRefusal(authHeader); if (stepUp) return '.replace(/\s+/g, ' ');

  const cases: Array<{ fn: string; after: string; before: string[] }> = [
    {
      fn: 'stripe-refund-entry',
      after: "{ error: 'Not authorized to refund entries for this show' }",
      before: [".from('show_payouts')", 'stripe.refunds', 'acquireShowMoneyLock('],
    },
    {
      fn: 'stripe-refund-show',
      after: "{ error: 'Not authorized to refund entries for this show' }",
      before: [
        "{ error: 'show_not_cancelled' }",
        'acquireShowMoneyLock(',
        'readPayoutBlock(show_id)',
      ],
    },
    {
      fn: 'stripe-approve-refund',
      after: "{ error: 'Only a site admin can approve refunds' }",
      before: ['resolveRefundRequestWithoutRefund(', 'approveRefundRequest(', 'req.json()'],
    },
  ];

  for (const { fn, after, before } of cases) {
    it(`${fn} gates after authorization and before its first money step`, () => {
      const source = read(fn);
      expect(source).toContain("import { stepUpRefusal } from '../_shared/stepUpReauth.ts';");
      const gateAt = source.indexOf(GATE);
      expect(gateAt, 'gate call').toBeGreaterThan(-1);
      expect(source.indexOf(GATE, gateAt + 1), 'exactly one gate').toBe(-1);
      expect(source.indexOf(after), after).toBeGreaterThan(-1);
      expect(source.indexOf(after)).toBeLessThan(gateAt);
      for (const step of before) {
        const stepAt = source.indexOf(step, source.indexOf('Deno.serve('));
        expect(stepAt, step).toBeGreaterThan(gateAt);
      }
    });
  }
});
