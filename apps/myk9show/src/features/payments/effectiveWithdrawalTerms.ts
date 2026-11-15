/**
 * MYK9-1976: a show's effective withdrawal terms from ONE row shape, the one
 * `useEffectiveWithdrawalPolicy` selects (the show's policy columns, its trials' registry and
 * its club's defaults). The app's read and the premium (whose generate-premium edge function
 * sends that same row shape) both resolve through here, so the premium prints exactly the
 * text an exhibitor reads in the app.
 *
 * Pure: no client, no React, so the premium facts (imported by the public landing pages) can
 * use it without pulling a data layer in.
 */
import { resolveConfiguredRegistryId, type RegistryId } from '@/features/registries';
import {
  getEffectiveWithdrawalPolicy,
  type ClubWithdrawalFields,
  type ShowWithdrawalFields,
  type WithdrawalPolicy,
} from './withdrawalPolicy';
import {
  resolveWithdrawalPolicyText,
  type WithdrawalPolicyTextSource,
} from './withdrawalPolicyText';

export interface EffectiveWithdrawalTerms {
  policy: WithdrawalPolicy | null;
  text: string;
  textSource: WithdrawalPolicyTextSource;
  registryId: RegistryId | null;
}

export type ClubWithdrawalTextFields = ClubWithdrawalFields & {
  default_withdrawal_policy_text?: string | null;
};

/** The row `useEffectiveWithdrawalPolicy` reads and generate-premium sends. */
export type EffectiveWithdrawalRow = ShowWithdrawalFields & {
  withdrawal_policy_text?: string | null;
  trials?: Array<{ registry_id?: string | null }> | { registry_id?: string | null } | null;
  clubs?: ClubWithdrawalTextFields | ClubWithdrawalTextFields[] | null;
};

/** Embedded to-one can come back as an object or a single-element array; normalize both. */
function toOne<T>(raw: unknown): T | null {
  return ((Array.isArray(raw) ? raw[0] : raw) as T | undefined) ?? null;
}

/** A show never mixes registries (MYK9-490): the first trial naming a configured one answers. */
export function registryFromTrials(raw: unknown): RegistryId | null {
  const trials = Array.isArray(raw) ? raw : raw ? [raw] : [];
  for (const trial of trials as Array<{ registry_id?: string | null }>) {
    const id = resolveConfiguredRegistryId(trial?.registry_id);
    if (id) return id;
  }
  return null;
}

/** The structured policy and the text exhibitors read: the show's, else the club's, else the default. */
export function resolveEffectiveWithdrawalTerms(
  row: EffectiveWithdrawalRow
): EffectiveWithdrawalTerms {
  const club = toOne<ClubWithdrawalTextFields>(row.clubs);
  const policy = getEffectiveWithdrawalPolicy(row, club);
  const registryId = registryFromTrials(row.trials);
  const { text, source } = resolveWithdrawalPolicyText({
    showText: row.withdrawal_policy_text,
    clubText: club?.default_withdrawal_policy_text,
    policy,
    registryId,
  });
  return { policy, text, textSource: source, registryId };
}
