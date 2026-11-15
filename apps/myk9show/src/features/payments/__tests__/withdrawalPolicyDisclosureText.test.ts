import { describe, expect, it } from 'vitest';
import {
  PULL_REFUND_NOTE,
  WITHDRAW_REFUND_NOTE,
  getWithdrawalPolicy,
  listRegistries,
} from '@/features/registries';
import {
  PULL_REFUND_NOTE_TEXT,
  REGISTRY_WITHDRAWAL_REASON_LABELS,
  SERVICE_FEE_SENTENCE,
  WITHDRAWAL_DISCLOSURE_MAX_LENGTH,
  WITHDRAWAL_POLICY_TEXT_MAX_LENGTH,
  WITHDRAW_REFUND_NOTE_TEXT,
  buildWithdrawalDisclosure,
} from '../withdrawalPolicyDisclosureText';

describe('shared withdrawal policy text resolver (MYK9-1976)', () => {
  it("carries each registry's reasons and notes exactly as the registry config states them", () => {
    expect(Object.keys(REGISTRY_WITHDRAWAL_REASON_LABELS).sort()).toEqual(
      [...listRegistries()].sort()
    );
    for (const id of listRegistries()) {
      const rules = getWithdrawalPolicy(id);
      expect(REGISTRY_WITHDRAWAL_REASON_LABELS[id]).toEqual(rules.reasons.map(r => r.label));
      expect(rules.withdrawRefundNote).toBe(WITHDRAW_REFUND_NOTE_TEXT);
      expect(rules.pullRefundNote).toBe(PULL_REFUND_NOTE_TEXT);
    }
    expect(WITHDRAW_REFUND_NOTE).toBe(WITHDRAW_REFUND_NOTE_TEXT);
    expect(PULL_REFUND_NOTE).toBe(PULL_REFUND_NOTE_TEXT);
  });

  it('the disclosure always ends with the service-fee sentence and fits the Stripe cap', () => {
    expect(buildWithdrawalDisclosure('Our words.')).toBe(`Our words.\n\n${SERVICE_FEE_SENTENCE}`);
    const longest = buildWithdrawalDisclosure('a'.repeat(WITHDRAWAL_POLICY_TEXT_MAX_LENGTH));
    expect(longest).toHaveLength(WITHDRAWAL_DISCLOSURE_MAX_LENGTH);
    const tooLong = buildWithdrawalDisclosure('b'.repeat(5000));
    expect(tooLong.length).toBeLessThanOrEqual(WITHDRAWAL_DISCLOSURE_MAX_LENGTH);
    expect(tooLong.endsWith(SERVICE_FEE_SENTENCE)).toBe(true);
  });
});
