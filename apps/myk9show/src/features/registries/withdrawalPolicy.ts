/**
 * MYK9-632: the per-registry rules for the two ways an exhibitor leaves a class.
 *
 * Two acts, two words (owner ruling 2026-09-17):
 *
 *  - **Withdraw** — a recognised reason. Exactly TWO codes exist platform-wide
 *    (`in_season`, `judge_change`); there is no "other" and no free text. Refund
 *    per the premium's rules, which differ by registry.
 *  - **Pull** — everything else. Refund at the CLUB's discretion; the copy must
 *    never promise "no refund". Available until the class runs.
 *
 * Which reasons exist is a RULEBOOK fact, not an app constant, so it lives here
 * beside `getShowStyle` / `getTrialRegistry` rather than in a component.
 * Sources (verified against `docs/rulebooks/*.txt`, recorded on the issue):
 *
 *  - AKC Scent Work: glossary "Withdrawn Entry" (p.71) names exactly the two
 *    reasons. In season (Ch.3 §15) is fully refundable if withdrawn no later
 *    than half an hour before the first class of the day, club may retain a
 *    processing fee. Judge change (Ch.3 §24) is a full refund on a written
 *    request submitted at least 30 minutes before the start of the exhibitor's
 *    first entered day. So: BOTH reasons, and a 30-minute cutoff recorded on
 *    `cutoffMinutesBeforeFirstClass` — recorded only; see that field and
 *    WITHDRAW_REFUND_NOTE for why nothing evaluates it.
 *  - UKC Nosework: in season needs a vet certificate and the club may refund in
 *    full or retain 50%. Judge change is refunded on written request. No stated
 *    clock cutoff.
 *  - ASCA Scent Detection: bitches in season MAY compete, so there is NO
 *    in-season withdrawal at all — judge change only, refund per the premium.
 *
 * Nothing here decides money, and nothing here states an AMOUNT. It decides which
 * reasons the exhibitor may pick and who confirms the refund; the secretary's
 * reconciliation surface carries the actual decision.
 */
import type { RegistryId } from './types';

/**
 * The complete platform-wide allow-list. Mirrors the CHECK on
 * `entries.withdrawal_reason_code` and the `p_reason` allow-list in
 * `withdraw_own_entry`; all three must be changed together.
 */
export const WITHDRAWAL_REASON_CODES = ['in_season', 'judge_change'] as const;

export type WithdrawalReasonCode = (typeof WITHDRAWAL_REASON_CODES)[number];

/** The two acts. `pull` writes `entry_status='scratched'`, `withdraw` writes `'withdrawn'`. */
export type RemoveFromClassKind = 'withdraw' | 'pull';

export interface WithdrawalReasonSpec {
  code: WithdrawalReasonCode;
  /** Exhibitor-facing label. Registry-independent on purpose — the words are the act. */
  label: string;
  /** Anything the exhibitor must supply for this registry (e.g. a vet certificate). */
  documentationNote?: string;
}

export interface RegistryWithdrawalPolicy {
  registryId: RegistryId;
  /** The reasons THIS registry recognises, in display order. Never empty. */
  reasons: readonly WithdrawalReasonSpec[];
  /**
   * Withdraw copy. It says who decides and never states an OUTCOME — the app
   * holds neither the premium nor the club's processing fee, so any sentence
   * naming an amount would be a promise nothing here can keep.
   */
  withdrawRefundNote: string;
  /**
   * Minutes before the exhibitor's first class of the day after which the
   * registry no longer guarantees a withdrawal refund, or `null` when the
   * rulebook states none.
   *
   * RECORDED, NOT ENFORCED — nothing reads this today, deliberately. The rule is
   * real (AKC Ch.3 §15 and §24) but the app cannot evaluate it: `classes
   * .start_time` is populated on 1 of 35 live classes and there is no class-date
   * column at all, so the instant to compare `now` against does not exist. It
   * lives here as DATA so that wiring it later is a call site, not a schema
   * change — and so the rulebook research is not lost to a `git log` search.
   * Open question for the owner, recorded in docs/INTENT.md.
   */
  cutoffMinutesBeforeFirstClass: number | null;
  /** Pull copy. Must never promise "no refund" (owner ruling 2026-09-17). */
  pullRefundNote: string;
}

const IN_SEASON_LABEL = 'Dog in season';
const JUDGE_CHANGE_LABEL = 'Judge change';
const PULL_REFUND_NOTE = "Refunds for a pull are at the club's discretion.";

/**
 * The ONE sentence the app is entitled to say about a withdrawal refund.
 *
 * The rulebooks do promise amounts — AKC is a full refund minus an optional
 * processing fee when the withdrawal reaches the secretary at least 30 minutes
 * before the first class of the day; UKC is full or 50% at the club's option.
 * The app states none of it, because it can enforce none of it: `classes.
 * start_time` is populated on 1 of 35 live classes and there is no class date
 * column at all, so the 30-minute clock cannot be evaluated, and the premium's
 * fee is not data this app holds. A sentence like "fully refunded" would be a
 * promise the exhibitor could hold us to and the secretary would have to break.
 * See docs/INTENT.md for the rule and the open question.
 */
const WITHDRAW_REFUND_NOTE = "Refund per the premium's rules; the show secretary confirms it.";

const AKC_POLICY: RegistryWithdrawalPolicy = {
  registryId: 'AKC',
  reasons: [
    {
      code: 'in_season',
      label: IN_SEASON_LABEL,
      documentationNote:
        'AKC clubs may ask for documentation, and withdrawals are expected at least 30 minutes before the first class of the day — check the premium.',
    },
    { code: 'judge_change', label: JUDGE_CHANGE_LABEL },
  ],
  withdrawRefundNote: WITHDRAW_REFUND_NOTE,
  cutoffMinutesBeforeFirstClass: 30,
  pullRefundNote: PULL_REFUND_NOTE,
};

const UKC_POLICY: RegistryWithdrawalPolicy = {
  registryId: 'UKC',
  reasons: [
    {
      code: 'in_season',
      label: IN_SEASON_LABEL,
      documentationNote:
        'UKC requires a veterinary certificate showing the female came into season after the entry deadline.',
    },
    { code: 'judge_change', label: JUDGE_CHANGE_LABEL },
  ],
  withdrawRefundNote: WITHDRAW_REFUND_NOTE,
  cutoffMinutesBeforeFirstClass: null,
  pullRefundNote: PULL_REFUND_NOTE,
};

/**
 * ASCA has no in-season withdrawal AT ALL — bitches in season may compete (they
 * run last, in pants and a red bandana). Offering the reason here would invent a
 * rule, so the list is judge change only.
 */
const ASCA_POLICY: RegistryWithdrawalPolicy = {
  registryId: 'ASCA',
  reasons: [{ code: 'judge_change', label: JUDGE_CHANGE_LABEL }],
  withdrawRefundNote: WITHDRAW_REFUND_NOTE,
  cutoffMinutesBeforeFirstClass: null,
  pullRefundNote: PULL_REFUND_NOTE,
};

const POLICIES: Readonly<Record<RegistryId, RegistryWithdrawalPolicy>> = {
  AKC: AKC_POLICY,
  UKC: UKC_POLICY,
  ASCA: ASCA_POLICY,
};

/** The withdrawal policy for a registry. Throws for an id with no config. */
export function getWithdrawalPolicy(registryId: RegistryId): RegistryWithdrawalPolicy {
  const policy = POLICIES[registryId];
  if (!policy) throw new Error(`Registry "${registryId}" has no withdrawal policy configured`);
  return policy;
}

/** The spec for one reason under one registry, or `undefined` if it does not offer it. */
export function getWithdrawalReason(
  registryId: RegistryId,
  code: WithdrawalReasonCode
): WithdrawalReasonSpec | undefined {
  return getWithdrawalPolicy(registryId).reasons.find(reason => reason.code === code);
}

/**
 * The display label for a stored reason code, for surfaces that read a row back
 * and have no registry in hand (the secretary's entry list). The labels are the
 * same everywhere; only which codes are OFFERED varies by registry.
 */
export function withdrawalReasonLabel(code: string | null | undefined): string | null {
  if (code === 'in_season') return IN_SEASON_LABEL;
  if (code === 'judge_change') return JUDGE_CHANGE_LABEL;
  return null;
}

/** Whether a raw string is one of the two stored reason codes. */
export function isWithdrawalReasonCode(value: unknown): value is WithdrawalReasonCode {
  return (WITHDRAWAL_REASON_CODES as readonly unknown[]).includes(value);
}
