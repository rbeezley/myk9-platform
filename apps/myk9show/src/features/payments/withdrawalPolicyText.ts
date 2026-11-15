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
 * Precedence: the show's text, else the club's text, else the default. NULL in either column
 * means "use what comes next", so a club that never edits keeps a default that follows its
 * structured fields and each show's registry.
 *
 * The default keeps Withdraw and Pull as separate acts (never synonyms) and says a withdrawal
 * for a reason the registry covers follows that registry's rule. Pull carries no refund
 * promise: it is at the club's discretion.
 */
import {
  PULL_REFUND_NOTE,
  WITHDRAW_REFUND_NOTE,
  getWithdrawalPolicy,
  listRegistries,
  type RegistryId,
} from '@/features/registries';
import { describeWithdrawalPolicy, formatCutoff } from './formatWithdrawalPolicy';
import { isValidWithdrawalPolicy, type WithdrawalPolicy } from './withdrawalPolicy';
import { notesDescribeRefundTerms } from './withdrawalPolicyTerms';

/**
 * Longest text a club may save. 1200 is Stripe's cap on a payment page's `custom_text`, the
 * one place outside the app this text can be shown, so a saved text is never cut there. It
 * also matches the database CHECK on both columns.
 */
export const WITHDRAWAL_POLICY_TEXT_MAX_LENGTH = 1200;

export type WithdrawalPolicyTextSource = 'show' | 'club' | 'default';

export interface ResolvedWithdrawalPolicyText {
  text: string;
  source: WithdrawalPolicyTextSource;
}

function joinWords(words: readonly string[], conjunction: 'or' | 'and'): string {
  if (words.length <= 1) return words.join('');
  return `${words.slice(0, -1).join(', ')} ${conjunction} ${words[words.length - 1]}`;
}

function withdrawParagraph(registryId: RegistryId | null): string {
  if (registryId) {
    const rules = getWithdrawalPolicy(registryId);
    const reasons = joinWords(
      rules.reasons.map(reason => reason.label.toLowerCase()),
      'or'
    );
    return `Withdraw: an entry may be withdrawn only for a reason the ${registryId} rules cover: ${reasons}. A withdrawal for that reason follows the ${registryId} rule. ${rules.withdrawRefundNote}`;
  }
  // No registry in hand (the club's own card, which serves every show it hosts): name what
  // each registry covers rather than offer one registry's list as everyone's.
  const inSeason = listRegistries().filter(id =>
    getWithdrawalPolicy(id).reasons.some(reason => reason.code === 'in_season')
  );
  return `Withdraw: an entry may be withdrawn only for a reason the show's registry covers: judge change, and dog in season at ${joinWords(inSeason, 'and')} shows. A withdrawal for that reason follows that registry's rule. ${WITHDRAW_REFUND_NOTE}`;
}

const PULL_PARAGRAPH = `Pull: the dog does not run, for any other reason. ${PULL_REFUND_NOTE}`;

/**
 * The default text for a show (or, with `registryId` null, for a club's shows in general),
 * built from the same refund sentence exhibitors already see before they pay and the
 * registry's own Withdraw and Pull wording.
 */
export function buildDefaultWithdrawalPolicyText(
  policy: WithdrawalPolicy | null,
  registryId: RegistryId | null
): string {
  const { refundLine, notes } = describeWithdrawalPolicy(policy);
  return [refundLine, notes, withdrawParagraph(registryId), PULL_PARAGRAPH]
    .filter((part): part is string => Boolean(part))
    .join('\n\n');
}

/**
 * Plain text as saved: no HTML tags, Windows line breaks unified, no more than one blank line
 * in a row, trimmed, capped at the limit. `null` when nothing is left, which means "use the
 * default".
 */
export function normalizeWithdrawalPolicyText(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const text = raw
    .replace(/\r\n?/g, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, WITHDRAWAL_POLICY_TEXT_MAX_LENGTH)
    .trim();
  return text === '' ? null : text;
}

/** The show's text, else the club's, else the default for this show's registry. */
export function resolveWithdrawalPolicyText(input: {
  showText: string | null | undefined;
  clubText: string | null | undefined;
  policy: WithdrawalPolicy | null;
  registryId: RegistryId | null;
}): ResolvedWithdrawalPolicyText {
  const showText = normalizeWithdrawalPolicyText(input.showText);
  if (showText) return { text: showText, source: 'show' };
  const clubText = normalizeWithdrawalPolicyText(input.clubText);
  if (clubText) return { text: clubText, source: 'club' };
  return {
    text: buildDefaultWithdrawalPolicyText(input.policy, input.registryId),
    source: 'default',
  };
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
