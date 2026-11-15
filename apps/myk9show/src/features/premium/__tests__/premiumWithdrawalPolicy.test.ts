/**
 * MYK9-1976 part 2: the premium prints the refund and withdrawal policy an exhibitor reads in
 * the app (show text, else club text, else the registry-correct default), then the
 * service-fee sentence, never cut.
 */
import { describe, expect, it } from 'vitest';
import { generatedPremium } from './fixtures/generatedPremium';
import { buildPremiumFacts, WITHDRAWAL_POLICY_ROW_LABEL } from '../premiumFacts';
import { parseGeneratedPremium } from '../premiumPublishSchema';
import {
  SERVICE_FEE_SENTENCE,
  WITHDRAWAL_POLICY_TEXT_MAX_LENGTH,
  buildDefaultWithdrawalPolicyText,
} from '@/features/payments/withdrawalPolicyText';
import type { PremiumWithdrawalRow } from '@/types/premium-types';

const CLUB_TEXT = 'Full refund until June 1.\nAfter that the club keeps $5.\n\nPulls: no refund.';
const SHOW_TEXT = 'This show refunds nothing after entries close.';

const CLUB_FIELDS = {
  default_withdrawal_retention_type: null,
  default_withdrawal_retention_value: null,
  default_withdrawal_policy_notes: null,
  default_withdrawal_policy_text: null,
};

function row(overrides: Partial<PremiumWithdrawalRow> = {}): PremiumWithdrawalRow {
  return {
    withdrawal_cutoff_date: '2026-06-01',
    withdrawal_retention_type: 'flat',
    withdrawal_retention_value: 1000,
    withdrawal_policy_notes: null,
    withdrawal_policy_text: null,
    trials: [{ registry_id: 'AKC' }],
    clubs: CLUB_FIELDS,
    ...overrides,
  };
}

function policyText(withdrawal: PremiumWithdrawalRow | null | undefined): string | undefined {
  const premium = generatedPremium();
  premium.show.withdrawal = withdrawal;
  return buildPremiumFacts(premium).withdrawalPolicy?.text;
}

const withServiceFee = (text: string) => `${text}\n\n${SERVICE_FEE_SENTENCE}`;
const FLAT_10 = {
  cutoffDate: '2026-06-01',
  retentionType: 'flat' as const,
  retentionValue: 1000,
  retentionDeclared: true,
  notes: null,
};

describe('premium withdrawal policy fact (MYK9-1976)', () => {
  it("prints the show's own text over the club's", () => {
    const premium = generatedPremium();
    premium.show.withdrawal = row({
      withdrawal_policy_text: SHOW_TEXT,
      clubs: { ...CLUB_FIELDS, default_withdrawal_policy_text: CLUB_TEXT },
    });
    expect(buildPremiumFacts(premium).withdrawalPolicy).toEqual({
      label: WITHDRAWAL_POLICY_ROW_LABEL,
      text: withServiceFee(SHOW_TEXT),
    });
  });

  it("prints the club's text, line breaks kept, when the show has none", () => {
    expect(
      policyText(row({ clubs: { ...CLUB_FIELDS, default_withdrawal_policy_text: CLUB_TEXT } }))
    ).toBe(withServiceFee(CLUB_TEXT));
  });

  it.each(['AKC', 'UKC', 'ASCA'] as const)(
    'prints the %s default, built from the policy fields, when neither level wrote text',
    registry => {
      expect(policyText(row({ trials: [{ registry_id: registry }] }))).toBe(
        withServiceFee(buildDefaultWithdrawalPolicyText(FLAT_10, registry))
      );
    }
  );

  it('prints the registry-neutral default when no trial names a configured registry', () => {
    expect(policyText(row({ trials: [{ registry_id: null }] }))).toBe(
      withServiceFee(buildDefaultWithdrawalPolicyText(FLAT_10, null))
    );
  });

  it("resolves the club's policy fields when the show declares none", () => {
    const text = policyText(
      row({
        withdrawal_cutoff_date: null,
        withdrawal_retention_type: null,
        withdrawal_retention_value: null,
        clubs: {
          default_withdrawal_retention_type: 'percent',
          default_withdrawal_retention_value: 50,
          default_withdrawal_policy_notes: 'Ask the secretary first.',
          default_withdrawal_policy_text: null,
        },
      })
    );
    expect(text).toContain('Ask the secretary first.');
    expect(text).toBe(
      withServiceFee(
        buildDefaultWithdrawalPolicyText(
          {
            cutoffDate: null,
            retentionType: 'percent',
            retentionValue: 50,
            retentionDeclared: true,
            notes: 'Ask the secretary first.',
          },
          'AKC'
        )
      )
    );
  });

  it('never cuts a text at the longest a club may save', () => {
    const longest = `${'x'.repeat(WITHDRAWAL_POLICY_TEXT_MAX_LENGTH - 4)} end`;
    expect(policyText(row({ withdrawal_policy_text: longest }))).toBe(withServiceFee(longest));
  });

  it('always ends with the service-fee sentence', () => {
    for (const withdrawal of [
      row(),
      row({ withdrawal_policy_text: SHOW_TEXT }),
      row({ clubs: null, withdrawal_cutoff_date: null, withdrawal_retention_value: null }),
    ]) {
      expect(policyText(withdrawal)?.endsWith(`\n\n${SERVICE_FEE_SENTENCE}`)).toBe(true);
    }
  });

  it('prints no policy row for a premium generated before the policy row existed', () => {
    expect(policyText(undefined)).toBeUndefined();
    expect(policyText(null)).toBeUndefined();
  });

  it('keeps the policy row through the publish schema, and parses a premium without one', () => {
    const premium = generatedPremium();
    premium.show.withdrawal = row({ withdrawal_policy_text: SHOW_TEXT });
    expect(parseGeneratedPremium(premium).show.withdrawal).toEqual(premium.show.withdrawal);
    expect(parseGeneratedPremium(generatedPremium()).show.withdrawal).toBeUndefined();
  });
});
