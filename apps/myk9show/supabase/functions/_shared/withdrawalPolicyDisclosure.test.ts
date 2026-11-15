/**
 * MYK9-1976 (Codex P1): the Stripe payment page prints the same policy text the app prints:
 * the show's text, else the club's, else the same default, then the service-fee sentence.
 */
import { describe, expect, it } from 'vitest';
import {
  describeWithdrawalRefundParts,
  resolveWithdrawalPolicy,
  withdrawalDisclosureForShowRow,
} from './withdrawalPolicy.ts';
import { describeWithdrawalPolicy } from '../../../src/features/payments/formatWithdrawalPolicy';
import { resolveWithdrawalPolicyText } from '../../../src/features/payments/withdrawalPolicyText';
import { getEffectiveWithdrawalPolicy } from '../../../src/features/payments/withdrawalPolicy';
import { withdrawalPolicyTermFixtures } from '../../../src/features/payments/withdrawalPolicyTermFixtures';

const SERVICE = 'Service fees are non-refundable.';

function messageFor(r: Record<string, unknown>): string {
  const result = withdrawalDisclosureForShowRow(r);
  if (!result.ok) throw new Error(result.error);
  return result.message;
}

function row(show: Record<string, unknown> = {}, club: Record<string, unknown> = {}) {
  return {
    withdrawal_cutoff_date: '2026-06-01',
    withdrawal_retention_type: 'flat',
    withdrawal_retention_value: 1000,
    withdrawal_policy_notes: null,
    withdrawal_policy_text: null,
    trials: [{ registry_id: 'UKC' }],
    clubs: {
      default_withdrawal_retention_type: null,
      default_withdrawal_retention_value: null,
      default_withdrawal_policy_notes: null,
      default_withdrawal_policy_text: null,
      ...club,
    },
    ...show,
  };
}

describe('payment link disclosure', () => {
  it("prints the show's text, then the service-fee sentence", () => {
    expect(
      messageFor(
        row({ withdrawal_policy_text: 'Show words.' }, { default_withdrawal_policy_text: 'Club.' })
      )
    ).toBe(`Show words.\n\n${SERVICE}`);
  });

  it("falls back to the club's text", () => {
    expect(messageFor(row({}, { default_withdrawal_policy_text: 'Club words.' }))).toBe(
      `Club words.\n\n${SERVICE}`
    );
  });

  it.each(['AKC', 'UKC', 'ASCA', null])(
    'falls back to the same default the app prints (registry %s)',
    registry => {
      const r = row({ trials: registry ? [{ registry_id: registry }] : [] });
      const appText = resolveWithdrawalPolicyText({
        showText: null,
        clubText: null,
        policy: getEffectiveWithdrawalPolicy(r, r.clubs),
        registryId: registry as 'AKC' | 'UKC' | 'ASCA' | null,
      }).text;
      expect(messageFor(r)).toBe(`${appText}\n\n${SERVICE}`);
    }
  );

  it('refuses, never cuts, a default made too long by long policy notes', () => {
    expect(
      withdrawalDisclosureForShowRow(row({ withdrawal_policy_notes: 'x '.repeat(900) }))
    ).toEqual({
      ok: false,
      error:
        'The refund policy is too long for the payment page. Shorten the policy notes or the policy text on the Withdrawal policy card, then try again.',
    });
  });

  it('sends a long policy that fits whole, notes and Withdraw and Pull terms included', () => {
    const notes = 'n'.repeat(600);
    const message = messageFor(row({ withdrawal_policy_notes: notes }));
    expect(message.length).toBeLessThanOrEqual(1200);
    expect(message).toContain(notes);
    expect(message).toContain(
      "Pull: the dog does not run, for any other reason. Refunds for a pull are at the club's discretion."
    );
    expect(message.endsWith(SERVICE)).toBe(true);
  });
});

describe('describeWithdrawalRefundParts matches the app formatter', () => {
  const shows = [
    {},
    { withdrawal_retention_value: null, withdrawal_retention_type: null },
    { withdrawal_retention_value: 0 },
    { withdrawal_retention_type: 'percent', withdrawal_retention_value: 25 },
    { withdrawal_cutoff_date: null, withdrawal_policy_notes: 'Email us.' },
    ...withdrawalPolicyTermFixtures.map(([notes]) => ({ withdrawal_policy_notes: notes })),
  ];
  it.each(shows.map((overrides, i) => [i, overrides] as const))('case %i', (_i, overrides) => {
    const r = row(overrides);
    expect(describeWithdrawalRefundParts(resolveWithdrawalPolicy(r, r.clubs))).toEqual(
      describeWithdrawalPolicy(getEffectiveWithdrawalPolicy(r, r.clubs))
    );
  });

  it('matches for no policy at all', () => {
    expect(describeWithdrawalRefundParts(null)).toEqual(describeWithdrawalPolicy(null));
  });
});
