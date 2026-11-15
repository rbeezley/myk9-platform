/**
 * MYK9-1976: the club's own refund and withdrawal policy TEXT.
 *
 * Owner decision (2026-11-14): the club enters or edits the words exhibitors read; the app
 * supplies a default. The text is words only. It never moves money: the refund the app
 * SUGGESTS is still computed from the structured fields (cutoff, amount kept) by
 * `resolveWithdrawalRefundCents`, which does not read this text at all. Where the two could
 * disagree, the secretary sees a plain note on the policy card
 * ({@link describeWithdrawalPolicyTextConflict}).
 *
 * The service-fee sentence is never part of the text: every surface prints it after the text
 * (SERVICE_FEE_SENTENCE), so no edit can remove it.
 *
 * Precedence: the show's text, else the club's text, else the default. NULL in either column
 * means "use what comes next", so a club that never edits keeps a default that follows its
 * structured fields and each show's registry.
 *
 * The default keeps Withdraw and Pull as separate acts (never synonyms) and says a withdrawal
 * for a reason the registry covers follows that registry's rule. Pull carries no refund
 * promise: it is at the club's discretion.
 */
import type { RegistryId } from '@/features/registries';
import { describeWithdrawalPolicy, formatCutoff } from './formatWithdrawalPolicy';
import { isValidWithdrawalPolicy, type WithdrawalPolicy } from './withdrawalPolicy';
import { notesDescribeRefundTerms } from './withdrawalPolicyTerms';
import {
  buildDefaultWithdrawalPolicyTextFromParts,
  resolveWithdrawalPolicyTextFromParts,
  type ResolvedWithdrawalPolicyText,
} from './withdrawalPolicyDisclosureText';

// The resolver itself is shared, byte for byte, with the stripe-payment-link edge function
// (withdrawalPolicyDisclosureText.ts), so the Stripe page prints the same words.
export {
  SERVICE_FEE_SENTENCE,
  WITHDRAWAL_DISCLOSURE_MAX_LENGTH,
  WITHDRAWAL_POLICY_TEXT_MAX_LENGTH,
  buildWithdrawalDisclosure,
  normalizeWithdrawalPolicyText,
} from './withdrawalPolicyDisclosureText';
export type {
  ResolvedWithdrawalPolicyText,
  WithdrawalPolicyTextSource,
} from './withdrawalPolicyDisclosureText';

/**
 * The default text for a show (or, with `registryId` null, for a club's shows in general),
 * built from the same refund sentence exhibitors already see before they pay and the
 * registry's own Withdraw and Pull wording. It never carries the service-fee sentence: every
 * surface prints that after the text, outside what the club edits.
 */
export function buildDefaultWithdrawalPolicyText(
  policy: WithdrawalPolicy | null,
  registryId: RegistryId | null
): string {
  const { refundLine, notes } = describeWithdrawalPolicy(policy);
  return buildDefaultWithdrawalPolicyTextFromParts({ refundLine, notes, registryId });
}

/** The show's text, else the club's, else the default for this show's registry. */
export function resolveWithdrawalPolicyText(input: {
  showText: string | null | undefined;
  clubText: string | null | undefined;
  policy: WithdrawalPolicy | null;
  registryId: RegistryId | null;
}): ResolvedWithdrawalPolicyText {
  return resolveWithdrawalPolicyTextFromParts({
    showText: input.showText,
    clubText: input.clubText,
    defaultText: buildDefaultWithdrawalPolicyText(input.policy, input.registryId),
  });
}

// The one sentence the default itself carries about service fees, which is not a refund
// promise about the ENTRY fee and must not trip the "no refunds" check.
const SERVICE_FEE_CLAUSE =
  /\bservice fees?\s+(?:are|is)\s+(?:always\s+)?(?:non[- ]?refundable|not\s+refundable)\b/gi;
const SAYS_NO_REFUND =
  /\bno\s+refunds?\b|\bnon[- ]?refundable\b|\bnot\s+refundable\b|\bno\s+money\s+back\b|\b(?:will|are|is)\s+not\s+(?:be\s+)?refunded\b/i;

/**
 * A plain note for the secretary when the club's words say one thing and the fields the app
 * computes the suggested refund from say another; `null` when they cannot be told apart.
 *
 * Only a text the club WROTE can disagree: the default is built from the same fields. The
 * case checked is the one that misleads an exhibitor about money: the text says there are no
 * refunds, while the fields lead the app to suggest one (a full refund up to the cutoff, or
 * the entry fee less an amount kept that is smaller than the fee).
 *
 * `entryFeeCents` is the show's regular fee when known; with none (the club's card), a flat
 * amount kept above zero is taken to be less than the fee.
 */
export function describeWithdrawalPolicyTextConflict(
  text: string | null,
  policy: WithdrawalPolicy | null,
  entryFeeCents: number | null
): string | null {
  if (!text || !policy || !isValidWithdrawalPolicy(policy)) return null;
  if (!SAYS_NO_REFUND.test(text.replace(SERVICE_FEE_CLAUSE, ''))) return null;
  // Notes with their own refund terms send every withdrawal to manual review, so the app
  // suggests no amount the text could contradict.
  if (notesDescribeRefundTerms(policy.notes?.trim() ?? null)) return null;

  const suffix = 'The suggested refund follows the fields above, not the text.';
  if (policy.cutoffDate) {
    return `Your policy text says there are no refunds, but with the full-refund cutoff date above the app suggests a full refund for a withdrawal on or before ${formatCutoff(policy.cutoffDate)}. ${suffix}`;
  }
  const value = policy.retentionValue;
  if (value === null || (value === 0 && policy.retentionDeclared !== true)) return null;
  const keepsLessThanFee =
    policy.retentionType === 'percent'
      ? value < 100
      : entryFeeCents === null || value < entryFeeCents;
  if (!keepsLessThanFee) return null;
  return `Your policy text says there are no refunds, but the amount kept above is less than the entry fee, so after a show's cutoff the app suggests refunding the rest. ${suffix}`;
}
