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
 * The reasons and the cutoff are RULEBOOK facts, not app constants, so they live
 * here beside `getShowStyle` / `getTrialRegistry` rather than in a component.
 * Sources (verified against `docs/rulebooks/*.txt`, recorded on the issue):
 *
 *  - AKC Scent Work: glossary "Withdrawn Entry" (p.71) names exactly the two
 *    reasons. In season (Ch.3 §15) is fully refundable if withdrawn no later
 *    than half an hour before the first class of the day, club may retain a
 *    processing fee. Judge change (Ch.3 §24) is a full refund on a written
 *    request submitted at least 30 minutes before the start of the exhibitor's
 *    first entered day. So: BOTH reasons, cutoff 30 minutes.
 *  - UKC Nosework: in season needs a vet certificate and the club may refund in
 *    full or retain 50%. Judge change is refunded on written request. No stated
 *    clock cutoff.
 *  - ASCA Scent Detection: bitches in season MAY compete, so there is NO
 *    in-season withdrawal at all — judge change only, refund per the premium.
 *
 * Nothing here decides money. It decides which reasons the exhibitor may pick and
 * what the app tells them to expect; the secretary's refund surface carries the
 * actual decision.
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
  /** What this registry's rulebook says the refund is. Shown under the choice. */
  refundNote: string;
  /** Anything the exhibitor must supply for this registry (e.g. a vet certificate). */
  documentationNote?: string;
}

export interface RegistryWithdrawalPolicy {
  registryId: RegistryId;
  /** The reasons THIS registry recognises, in display order. Never empty. */
  reasons: readonly WithdrawalReasonSpec[];
  /**
   * Minutes before the exhibitor's first class of the day after which the
   * registry no longer guarantees a withdrawal refund, or `null` when the
   * rulebook states none.
   */
  cutoffMinutesBeforeFirstClass: number | null;
  /** Shown once the cutoff has passed, in place of the Withdraw action. */
  cutoffNote: string;
  /** Pull copy. Must never promise "no refund" (owner ruling 2026-09-17). */
  pullRefundNote: string;
}

const IN_SEASON_LABEL = 'Dog in season';
const JUDGE_CHANGE_LABEL = 'Judge change';
const PULL_REFUND_NOTE = "Refunds for a pull are at the club's discretion.";
const NO_CUTOFF_NOTE = 'This class has started, so it can no longer be withdrawn.';

const AKC_POLICY: RegistryWithdrawalPolicy = {
  registryId: 'AKC',
  reasons: [
    {
      code: 'in_season',
      label: IN_SEASON_LABEL,
      refundNote:
        'AKC: fully refunded when withdrawn at least 30 minutes before the first class of the day. The club may keep a processing fee.',
      documentationNote: 'The club may ask for documentation — check the premium.',
    },
    {
      code: 'judge_change',
      label: JUDGE_CHANGE_LABEL,
      refundNote:
        'AKC: full refund when the request reaches the trial secretary at least 30 minutes before the start of your first entered day.',
    },
  ],
  cutoffMinutesBeforeFirstClass: 30,
  cutoffNote:
    'AKC withdrawals close 30 minutes before the first class of the day. Pull this entry instead and ask the club about a refund.',
  pullRefundNote: PULL_REFUND_NOTE,
};

const UKC_POLICY: RegistryWithdrawalPolicy = {
  registryId: 'UKC',
  reasons: [
    {
      code: 'in_season',
      label: IN_SEASON_LABEL,
      refundNote:
        'UKC: the club refunds in full or keeps up to 50% as a processing fee, at its option.',
      documentationNote:
        'UKC requires a veterinary certificate showing the female came into season after the entry deadline.',
    },
    {
      code: 'judge_change',
      label: JUDGE_CHANGE_LABEL,
      refundNote: 'UKC: the club must offer a refund on a written request from a pre-entered dog.',
    },
  ],
  cutoffMinutesBeforeFirstClass: null,
  cutoffNote: NO_CUTOFF_NOTE,
  pullRefundNote: PULL_REFUND_NOTE,
};

/**
 * ASCA has no in-season withdrawal AT ALL — bitches in season may compete (they
 * run last, in pants and a red bandana). Offering the reason here would invent a
 * rule, so the list is judge change only.
 */
const ASCA_POLICY: RegistryWithdrawalPolicy = {
  registryId: 'ASCA',
  reasons: [
    {
      code: 'judge_change',
      label: JUDGE_CHANGE_LABEL,
      refundNote: "ASCA: refunds follow the club's published premium.",
    },
  ],
  cutoffMinutesBeforeFirstClass: null,
  cutoffNote: NO_CUTOFF_NOTE,
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

export interface WithdrawalCutoffInput {
  registryId: RegistryId;
  /** When the exhibitor's first class of the day starts. `null` = not known. */
  firstClassStartsAt: Date | string | null | undefined;
  now?: Date;
}

/**
 * Has this registry's withdrawal cutoff passed?
 *
 * Returns `false` — Withdraw stays offered — whenever the answer is not known:
 * the registry states no cutoff, or we do not hold the first class's start time.
 * Failing OPEN is deliberate, and is the opposite of the eligibility predicate's
 * fail-closed stance: the server decides whether the WRITE is allowed, while this
 * only decides whether to grey out a choice, and greying it out on a guess would
 * tell the exhibitor a rule that may not exist.
 */
export function isPastWithdrawalCutoff({
  registryId,
  firstClassStartsAt,
  now = new Date(),
}: WithdrawalCutoffInput): boolean {
  const minutes = getWithdrawalPolicy(registryId).cutoffMinutesBeforeFirstClass;
  if (minutes == null || firstClassStartsAt == null) return false;

  const start =
    firstClassStartsAt instanceof Date ? firstClassStartsAt : new Date(firstClassStartsAt);
  if (Number.isNaN(start.getTime())) return false;

  return now.getTime() > start.getTime() - minutes * 60_000;
}
