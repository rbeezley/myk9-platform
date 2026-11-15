// MYK9-1976: the ONE resolver for the refund and withdrawal policy text, shared by the app and
// the stripe-payment-link edge function so the payer on the Stripe page reads exactly what
// the secretary and the exhibitor read in the app.
//
// TWO BYTE-IDENTICAL COPIES, because Deno cannot import app `src`:
//   apps/myk9show/supabase/functions/_shared/withdrawalPolicyDisclosureText.ts
//   apps/myk9show/src/features/payments/withdrawalPolicyDisclosureText.ts
// src/test/database/withdrawalPolicyDisclosureText.source.test.ts fails if they differ. Edit
// one, copy it over the other. No imports, so the copy is the whole module.
//
// The registry wording below mirrors src/features/registries/withdrawalPolicy.ts (the
// rulebook's reasons, WITHDRAW_REFUND_NOTE, PULL_REFUND_NOTE); the app test
// withdrawalPolicyDisclosureText.test.ts fails if they drift.

/** Always printed after the policy text, outside what the club edits, so it cannot be removed. */
export const SERVICE_FEE_SENTENCE = 'Service fees are non-refundable.';

/** Stripe's cap on a payment page's custom_text: the whole disclosure must fit. */
export const WITHDRAWAL_DISCLOSURE_MAX_LENGTH = 1200;

/**
 * Longest text a club may save: the disclosure cap less the service-fee sentence and the blank
 * line before it, so a saved text is never cut on the Stripe page. Matches the database CHECK.
 */
export const WITHDRAWAL_POLICY_TEXT_MAX_LENGTH =
  WITHDRAWAL_DISCLOSURE_MAX_LENGTH - SERVICE_FEE_SENTENCE.length - 2;

export type WithdrawalPolicyTextSource = 'show' | 'club' | 'default';

export interface ResolvedWithdrawalPolicyText {
  text: string;
  source: WithdrawalPolicyTextSource;
}

export const WITHDRAW_REFUND_NOTE_TEXT =
  "Refund per the premium's rules; the show secretary confirms it.";
export const PULL_REFUND_NOTE_TEXT = "Refunds for a pull are at the club's discretion.";

/** The withdrawal reasons each registry's rulebook recognises, in display order. */
export const REGISTRY_WITHDRAWAL_REASON_LABELS: Readonly<Record<string, readonly string[]>> = {
  AKC: ['Dog in season', 'Judge change'],
  UKC: ['Dog in season', 'Judge change'],
  ASCA: ['Judge change'],
};

/** A configured registry id from a raw `trials.registry_id`, or null. */
export function configuredWithdrawalRegistry(raw: string | null | undefined): string | null {
  const id = raw?.trim();
  return id && Object.prototype.hasOwnProperty.call(REGISTRY_WITHDRAWAL_REASON_LABELS, id)
    ? id
    : null;
}

/** A show never mixes registries: the first trial naming a configured one answers. */
export function withdrawalRegistryFromTrials(raw: unknown): string | null {
  const trials = Array.isArray(raw) ? raw : raw ? [raw] : [];
  for (const trial of trials as Array<{ registry_id?: string | null } | null>) {
    const id = configuredWithdrawalRegistry(trial?.registry_id);
    if (id) return id;
  }
  return null;
}

function joinWords(words: readonly string[], conjunction: 'or' | 'and'): string {
  if (words.length <= 1) return words.join('');
  return `${words.slice(0, -1).join(', ')} ${conjunction} ${words[words.length - 1]}`;
}

function withdrawParagraph(registryId: string | null): string {
  const labels = registryId ? REGISTRY_WITHDRAWAL_REASON_LABELS[registryId] : undefined;
  if (registryId && labels) {
    const reasons = joinWords(
      labels.map(label => label.toLowerCase()),
      'or'
    );
    return `Withdraw: an entry may be withdrawn only for a reason the ${registryId} rules cover: ${reasons}. A withdrawal for that reason follows the ${registryId} rule. ${WITHDRAW_REFUND_NOTE_TEXT}`;
  }
  // No registry in hand (the club's own card, which serves every show it hosts): name what
  // each registry covers rather than offer one registry's list as everyone's.
  const inSeason = Object.keys(REGISTRY_WITHDRAWAL_REASON_LABELS).filter(id =>
    REGISTRY_WITHDRAWAL_REASON_LABELS[id].includes('Dog in season')
  );
  return `Withdraw: an entry may be withdrawn only for a reason the show's registry covers: judge change, and dog in season at ${joinWords(inSeason, 'and')} shows. A withdrawal for that reason follows that registry's rule. ${WITHDRAW_REFUND_NOTE_TEXT}`;
}

const PULL_PARAGRAPH = `Pull: the dog does not run, for any other reason. ${PULL_REFUND_NOTE_TEXT}`;

/** The refund sentence without the service-fee sentence, which the disclosure adds itself. */
function withoutServiceFeeSentence(line: string): string {
  return line.split(SERVICE_FEE_SENTENCE).join('').replace(/\s+/g, ' ').trim();
}

/**
 * The default text: the refund sentence the fields produce, the club's policy notes, the
 * registry's Withdraw paragraph and the Pull paragraph. Never the service-fee sentence: that
 * is added by {@link buildWithdrawalDisclosure} wherever the policy is shown.
 */
export function buildDefaultWithdrawalPolicyTextFromParts(parts: {
  refundLine: string;
  notes: string | null;
  registryId: string | null;
}): string {
  return [
    withoutServiceFeeSentence(parts.refundLine),
    parts.notes?.trim() || null,
    withdrawParagraph(parts.registryId),
    PULL_PARAGRAPH,
  ]
    .filter((part): part is string => Boolean(part))
    .join('\n\n');
}

/**
 * Plain text as saved: no HTML tags, Windows line breaks unified, no more than one blank line
 * in a row, trimmed, capped at the limit. `null` when nothing is left, which means "use the
 * next level".
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

/** The show's text, else the club's, else the default. */
export function resolveWithdrawalPolicyTextFromParts(input: {
  showText: string | null | undefined;
  clubText: string | null | undefined;
  defaultText: string;
}): ResolvedWithdrawalPolicyText {
  const showText = normalizeWithdrawalPolicyText(input.showText);
  if (showText) return { text: showText, source: 'show' };
  const clubText = normalizeWithdrawalPolicyText(input.clubText);
  if (clubText) return { text: clubText, source: 'club' };
  return { text: input.defaultText, source: 'default' };
}

/**
 * The whole disclosure as one string (the Stripe page): the policy text, then the service-fee
 * sentence, within the Stripe cap. A long default is cut before the sentence, never the
 * sentence itself.
 */
export function buildWithdrawalDisclosure(text: string): string {
  const room = WITHDRAWAL_DISCLOSURE_MAX_LENGTH - SERVICE_FEE_SENTENCE.length - 2;
  const body = text.trim().slice(0, room).trim();
  return body ? `${body}\n\n${SERVICE_FEE_SENTENCE}` : SERVICE_FEE_SENTENCE;
}
