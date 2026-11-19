import { describe, expect, it } from 'vitest';
import {
  PULL_REFUND_NOTE,
  WITHDRAW_REFUND_NOTE,
  getWithdrawalPolicy,
  listRegistries,
} from '@/features/registries';
import {
  PULL_REFUND_NOTE_TEXT,
  REGISTRY_WITHDRAWAL_DOCUMENTATION_NOTES,
  REGISTRY_WITHDRAWAL_REASON_LABELS,
  SERVICE_FEE_SENTENCE,
  WITHDRAWAL_DISCLOSURE_MAX_LENGTH,
  WITHDRAWAL_POLICY_TEXT_MAX_LENGTH,
  WITHDRAW_REFUND_NOTE_TEXT,
  buildWithdrawalDisclosure,
  withdrawalDisclosureFitsPaymentPage,
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
    for (const id of listRegistries()) {
      const notes = getWithdrawalPolicy(id)
        .reasons.map(r => r.documentationNote)
        .filter(Boolean);
      expect(REGISTRY_WITHDRAWAL_DOCUMENTATION_NOTES[id]).toBe(notes[0]);
    }
    expect(WITHDRAW_REFUND_NOTE).toBe(WITHDRAW_REFUND_NOTE_TEXT);
    expect(PULL_REFUND_NOTE).toBe(PULL_REFUND_NOTE_TEXT);
  });

  it('the disclosure is the whole text then the service-fee sentence, never cut', () => {
    expect(buildWithdrawalDisclosure('Our words.')).toBe(`Our words.\n\n${SERVICE_FEE_SENTENCE}`);
    const longest = 'a'.repeat(WITHDRAWAL_POLICY_TEXT_MAX_LENGTH);
    expect(buildWithdrawalDisclosure(longest)).toHaveLength(WITHDRAWAL_DISCLOSURE_MAX_LENGTH);
    expect(withdrawalDisclosureFitsPaymentPage(longest)).toBe(true);
    const tooLong = 'b'.repeat(5000);
    expect(buildWithdrawalDisclosure(tooLong)).toBe(`${tooLong}\n\n${SERVICE_FEE_SENTENCE}`);
    expect(withdrawalDisclosureFitsPaymentPage(tooLong)).toBe(false);
  });
});
